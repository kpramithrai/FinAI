"""FinAI: the API the chat UI talks to, and the fixed pipeline that runs the two agents.

Run:  uvicorn server:app --port 8000
"""
import asyncio
import json
import re
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import rules
from agents import IEEE_INTRO, IEEE_SPECIFIC, OVERVIEW, PLAN, RATE, REQUIREMENTS, analyst, ask, planner, writer

app = FastAPI(title="FinAI")
LOGS = Path(__file__).parent / "runs"
LOGS.mkdir(exist_ok=True)


class Session:
    def __init__(self, sid: str):
        self.id, self.events, self.changed = sid, [], asyncio.Condition()
        self.trace, self.shown = [], 0  # spans (agent calls, retrievals); how many are already attached to a delegation row

    async def emit(self, type: str, **data):
        """Send one event to the UI and append it to runs/<id>.jsonl (the audit trail)."""
        event = {"type": type, **data}
        with open(LOGS / f"{self.id}.jsonl", "a") as log:
            log.write(json.dumps({"t": time.time(), **event}) + "\n")
        async with self.changed:
            self.events.append(event)
            self.changed.notify_all()

    async def push(self, kind: str, **item) -> str:
        item_id = f"{kind}-{uuid.uuid4().hex[:8]}"
        await self.emit("push", item={"kind": kind, "id": item_id, "at": int(time.time() * 1000), **item})
        return item_id

    async def delegate(self, *messages: tuple[str, str, str]):
        """A collapsed "messages with agents" row, carrying the trace steps since the previous one."""
        steps, self.shown = self.trace[self.shown :], len(self.trace)
        await self.push("delegation", messages=[{"from": f, "to": t, "text": x} for f, t, x in messages], steps=steps)
        await self.emit("working", agents=[])  # the agents reported back, so nobody is busy

    def search(self, query: str, k: int) -> dict[str, str]:
        start = time.time()
        hits = rules.search(query, k)
        self.trace.append({"name": "retrieve · BM25 + Chroma", "kind": "tool", "start": start, "end": time.time(), "tokens": 0,
                           "input": query[:500], "output": "\n".join(hits)})
        return hits

    async def say(self, text: str):
        await self.push("bot", **{"from": "FinAI", "text": text})

SESSIONS: dict[str, Session] = {}


def evidence_block(hits: dict[str, str]) -> str:
    """Passages labelled E1, E2, …; the model cites labels (it can't copy long ids reliably), code maps them back."""
    return "\n".join(f'<evidence id="E{i}">{text}</evidence>' for i, text in enumerate(hits.values(), 1))


async def plan_sdlc(brief: str, srs: dict, trace: list) -> dict:
    """Agent (ii): rate the decision factors; rules.rank scores the models; the planner explains and plans."""
    compact = json.dumps([{k: r[k] for k in ("id", "statement", "category", "priority")} for r in srs["requirements"]])
    criteria = f'<evidence id="criteria">{rules.CHUNKS["product/sdlc-selection-criteria.txt#chunk-1"]}</evidence>'
    rated = await ask(planner, RATE, trace=trace, context=f"Brief:\n{brief}\n\nDecision factors: {rules.FACTORS}\n\nSRS requirements: {compact}\n\n{criteria}")
    requirement_ids = {requirement["id"] for requirement in srs["requirements"]}
    for f in rated["factors"]:
        cites = [cite for cite in re.findall(r"\bR\d+\b", f["cites"], flags=re.I) if cite.upper() in requirement_ids]
        f["cites"] = ", ".join(dict.fromkeys(cite.upper() for cite in cites)) or "—"
        f["implication"] = rules.clip(rules.plain(f["implication"]))
        f["confidence"] = "High" if f["cites"] != "—" else "Low"
    ranking = rules.explain({f["name"]: f["value"] for f in rated["factors"]})
    chosen, score = ranking[0]["model"], ranking[0]["score"]
    plan = await ask(planner, PLAN, trace=trace, context=(
        f"Chosen SDLC: {chosen} ({score}/100). Score drivers: {json.dumps(ranking[0]['drivers'])}. "
        f"Other scores: {json.dumps([{row['model']: row['score']} for row in ranking[1:]])}. "
        f"Factors: {json.dumps(rated['factors'])}\nSRS requirements: {compact}\n\n{criteria}"))
    plan["justification"] = rules.clip(rules.plain(plan["justification"]), 600)
    return {
        "factors": rated["factors"], "chosen": chosen, "justification": plan["justification"], "ranking": ranking,
    }


async def write_ieee(brief: str, srs: dict, trace: list) -> dict:
    """Agent (iii): render the validated SRS into the bounded IEEE 830-1998 structure."""
    source_requirements = [{key: requirement[key] for key in ("id", "statement", "category", "priority", "acceptance", "source")}
                           for requirement in srs["requirements"]]
    context = f"Brief:\n{brief}\n\nValidated SRS:\n{json.dumps({**srs, 'requirements': source_requirements})}"
    intro, specific = await asyncio.gather(
        ask(writer, IEEE_INTRO, context, trace),
        ask(writer, IEEE_SPECIFIC, context, trace),
    )
    sources = sorted({requirement["source"] for requirement in srs["requirements"]
                      if requirement["source"] not in {"brief", "answer", "NEEDS-VALIDATION"}})
    return intro | specific | {"references": ["IEEE Std 830-1998", *sources]}


async def run(s: Session, brief: str):
    """Intake → SRS → SDLC → human review."""
    brief = rules.mask(brief)
    await s.emit("stage", stage="intake")
    await s.push("event", icon="wake", text="FinAI is waking up")
    await s.say("On it. I'll have the **Analyst** read your brief against the regulations library first.")

    await s.emit("working", agents=["analyst"])
    hits = s.search(brief, k=5)
    context = f"Brief:\n{brief}\n\n{evidence_block(hits)}"
    reqs, overview = await asyncio.gather(ask(analyst, REQUIREMENTS, context, s.trace), ask(analyst, OVERVIEW, context, s.trace))
    labels = dict(zip((f"E{i}" for i in range(1, len(hits) + 1)), hits))
    for r in reqs["requirements"]:
        r["source"] = labels.get(r["source"], r["source"])
    srs = rules.validate(overview | reqs, set(hits))
    await s.delegate(("FinAI", "analyst", "Brief attached. Write the SRS."),
                     ("analyst", "FinAI", f"{len(srs['requirements'])} requirements from {len(hits)} passages; {len(srs['findings'])} quality findings."))
    await s.emit("stage", stage="srs")
    await s.push("event", icon="doc", text="Created document", strong=f"SRS · {srs['title']}")
    await s.push("srs", srs=srs)
    await s.say("Sending it to the **SDLC Planner** now.")

    await s.emit("stage", stage="sdlc")
    await s.push("event", icon="handoff", text="Handed off to", strong="SDLC Planner")
    await s.emit("working", agents=["planner", "writer"])
    sdlc, ieee = await asyncio.gather(plan_sdlc(brief, srs, s.trace), write_ieee(brief, srs, s.trace))
    chosen, ranking = sdlc["chosen"], sdlc["ranking"]
    await s.delegate(("FinAI", "planner", f"SRS attached ({len(srs['requirements'])} requirements). Recommend a lifecycle."),
                     ("planner", "FinAI", f"Rated {len(sdlc['factors'])} decision factors; scored {len(ranking)} models."),
                     ("planner", "FinAI", f"{chosen} leads at {ranking[0]['score']}/100; {ranking[1]['model']} next at {ranking[1]['score']}."),
                     ("writer", "FinAI", "Formatted the validated baseline as an IEEE 830-1998 SRS."))
    await s.push("event", icon="doc", text="Created document", strong="SDLC recommendation")
    await s.push("sdlc", sdlc=sdlc)
    await s.push("event", icon="doc", text="Created document", strong="IEEE 830 SRS")
    await s.push("ieee", ieee=ieee, title=f"{srs['title']} — IEEE 830-1998 SRS")

    await s.emit("stage", stage="review")
    await s.say(f"Done. **{chosen}** fits best. Open a model in the ranking to see why it was or wasn't chosen.")
    await s.push("notice", title="Needs human review", text="Regulatory interpretation, the requirements baseline and the SDLC choice must be approved by a qualified person. Treat this as a draft.")
    await s.emit("stage", stage="done")


async def guarded(s: Session, brief: str):
    try:
        await run(s, brief)
    except Exception as e:  # model offline, bad JSON, … — tell the user instead of hanging
        await s.emit("working", agents=[])
        if len(s.trace) > s.shown:
            await s.delegate(("FinAI", "FinAI", "This step failed; open the trace for details."))
        await s.push("bot", **{"from": "FinAI"}, text=f"Something went wrong: `{type(e).__name__}: {str(e)[:200]}`. Is LM Studio running with the model loaded?")
        await s.emit("stage", stage="done")


# ---------- HTTP API ----------

class Brief(BaseModel):
    brief: str = Field(min_length=10, max_length=8000)


class Reply(BaseModel):
    text: str = Field(max_length=2000)


def session(sid: str) -> Session:
    if sid not in SESSIONS:
        raise HTTPException(404, "No such session")
    return SESSIONS[sid]


@app.post("/api/sessions")
async def start(body: Brief):
    s = Session(uuid.uuid4().hex)
    SESSIONS[s.id] = s
    s.task = asyncio.create_task(guarded(s, body.brief))  # keep a reference so the task isn't garbage-collected
    return {"id": s.id}


@app.get("/api/sessions/{sid}/events")
async def events(sid: str, request: Request):
    """Server-sent events. On reconnect the browser sends Last-Event-ID, so nothing is replayed twice."""
    s = session(sid)

    async def stream():
        i = int(request.headers.get("last-event-id", -1)) + 1
        while True:
            async with s.changed:
                await s.changed.wait_for(lambda: len(s.events) > i)
            for event in s.events[i:]:
                yield f"id: {i}\ndata: {json.dumps(event)}\n\n"
                i += 1

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/sessions/{sid}")
async def session_status(sid: str):
    """Let the frontend check whether a live session survived a server restart."""
    s = session(sid)
    return {"id": s.id, "events": len(s.events)}


@app.post("/api/sessions/{sid}/reply")
async def reply(sid: str, body: Reply):
    """Accept a chat message while the automatic pipeline is running."""
    s = session(sid)
    await s.say("This run is finished. Start a new chat for another brief." if s.task.done() else "Got it. I'm still working on this brief.")
    return {"ok": True}


@app.get("/api/health")
async def health():
    return {"chunks": len(rules.CHUNKS), "model": analyst.model.model}
