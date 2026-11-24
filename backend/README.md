# FinAI backend

Python, Google ADK 2.x, LM Studio (`qwen/qwen3-1.7b`). Three files, ~580 lines.

| File | What it holds |
|---|---|
| `agents.py` | The **two ADK agents**: Analyst (lists requirements) and Planner (picks the SDLC). Each is called in steps, and every step must answer in a fixed JSON shape (Pydantic). |
| `rules.py` | Plain Python, no LLM: masking of PAN/Aadhaar/card/email/phone, hybrid search over `corpus/`, SRS checks, SDLC scoring. Run `python rules.py` for its self-check. |
| `server.py` | FastAPI: the FinAI pipeline and the API the chat UI calls. |

## Flow

```
brief ─ mask ─▶ Analyst: questions ─▶ (you answer) ─▶ Analyst: requirements ║ overview  (2 calls in parallel)
      ─▶ rules.validate ─▶ SRS ─▶ (you Allow / Revise) ─▶ Planner: rate 13 factors ─▶ rules.rank ─▶ Planner: workflow
```

- **RAG**: each step gets the top passages from `corpus/` (RBI, SEBI, NIST, OWASP, ISO 20022, NASA SRS). Search = BM25 keywords (`rank_bm25`) + a **ChromaDB** vector store (`chroma/`, vectors from LM Studio's `nomic-embed-text`), merged by reciprocal rank fusion. Passages are labelled E1…E5; the schema only lets the model cite those labels, and code maps them back to real ids (`finance/rbi-kyc-master-direction-2024.txt#chunk-73`).
- **SRS checks** (`rules.validate`): renumbers IDs, flags duplicates, missing or unmeasurable acceptance criteria, marks uncited claims `NEEDS-VALIDATION`, builds a full traceability matrix.
- **SDLC choice** (`rules.rank`): the Planner only *rates* the factors; scores come from fixed weights based on `corpus/product/sdlc-selection-criteria.txt`, so the ranking can't contradict the choice.
- **Scheduling**: FinAI requests responses without a separate reasoning trace. It drafts requirements and the overview in parallel. The planner starts while you review the requirements.
- **Audit trail**: every event is appended to `runs/<session>.jsonl`.
- **Agent trace**: every model call and retrieval is recorded as a step (time, tokens, input, output, error) by `agents.ask` / `Session.search`. Each "messages with agents" row in the chat carries its steps; click "N steps ›" (or the pulse icon in the header for the whole run) to open the timeline.

## Run

```bash
lms get qwen/qwen3-1.7b
lms get text-embedding-nomic-embed-text-v1.5
lms server start --bind 127.0.0.1 --port 1234
lms load qwen/qwen3-1.7b
lms load text-embedding-nomic-embed-text-v1.5

python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn server:app --port 8001
```

First search embeds the corpus once (~30 s) into Chroma at `backend/chroma/`; delete that folder to rebuild.
Settings (env): `LM_STUDIO_MODEL`, `LM_STUDIO_BASE_URL`, `EMBED_MODEL`. Copy `.env.example` to `.env` and run uvicorn with `--env-file .env`.

## API

| Call | Purpose |
|---|---|
| `POST /api/sessions {brief}` | start a run → `{id}` |
| `GET /api/sessions/{id}/events` | server-sent events (same shapes as `frontend/src/lib/types.ts`) |
| `POST /api/sessions/{id}/reply` | `{itemId, answers}` · `{itemId, decision}` · `{text}` |
| `GET /api/health` | corpus size and model |
