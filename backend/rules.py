"""Deterministic logic: data masking, document retrieval, SRS validation, SDLC scoring. No LLM here."""
import os
import re
from collections import Counter
from pathlib import Path

import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from rank_bm25 import BM25Okapi

# ---------- 1. Mask sensitive data before it reaches the model ----------

MASKS = [
    ("EMAIL", r"[\w.+-]+@[\w-]+\.[\w.]+"),
    ("PAN", r"\b[A-Z]{5}\d{4}[A-Z]\b"),
    ("CARD", r"\b(?:\d[ -]?){13,19}\b"),
    ("AADHAAR", r"\b\d{4}\s?\d{4}\s?\d{4}\b"),
    ("PHONE", r"(?:\+91[ -]?)?\b[6-9]\d{9}\b"),
]


def mask(text: str) -> str:
    for name, pattern in MASKS:
        text = re.sub(pattern, f"[{name}]", text)
    return text


# ---------- 2. Retrieval over backend/corpus: keyword (BM25) + meaning (Chroma vector DB), merged ----------

CORPUS = Path(__file__).parent / "corpus"
LM_STUDIO = os.getenv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1")
# Words in nearly every regulator document; matching on them pulls in front matter instead of the topic.
COMMON = set("rbi reserve bank banks india indian circular circulars directions direction compliant compliance regulated entity entities shall act".split())
words = lambda t: [w for w in re.findall(r"[a-z0-9]{3,}", t.lower()) if w not in COMMON]

# One chunk = ~1200 characters of a document, id "finance/rbi-....txt#chunk-4". Website menus are skipped.
CHUNKS: dict[str, str] = {}
for f in sorted(CORPUS.rglob("*.txt")):
    text = f.read_text(errors="ignore")
    for i in range(0, len(text), 1200):
        if not re.search(r"Skip to main content|Not Pressed|▼", text[i : i + 1200]):
            CHUNKS[f"{f.relative_to(CORPUS).as_posix()}#chunk-{i // 1200 + 1}"] = text[i : i + 1200]
IDS = list(CHUNKS)
BM25 = BM25Okapi([words(t) for t in CHUNKS.values()])

# Chroma stores the vectors on disk (backend/chroma/); LM Studio's nomic model makes them.
VECTORS = chromadb.PersistentClient(path=str(Path(__file__).parent / "chroma")).get_or_create_collection(
    "corpus", metadata={"hnsw:space": "cosine"}, embedding_function=OpenAIEmbeddingFunction(
        api_key="lm-studio", api_base=LM_STUDIO, model_name=os.getenv("EMBED_MODEL", "text-embedding-nomic-embed-text-v1.5")))


def search(query: str, k: int = 4) -> dict[str, str]:
    """Top-k chunks {id: text}. BM25 and Chroma rankings are merged by reciprocal rank fusion."""
    scores = BM25.get_scores(words(query))
    ranked = [[IDS[i] for i in scores.argsort()[::-1][:50]]]
    try:
        if VECTORS.count() != len(IDS):  # first run: embed the corpus once (~40 s)
            for i in range(0, len(IDS), 64):
                VECTORS.upsert(ids=IDS[i : i + 64], documents=[f"search_document: {CHUNKS[c]}" for c in IDS[i : i + 64]])
        ranked.append(VECTORS.query(query_texts=[f"search_query: {query}"], n_results=50)["ids"][0])
    except Exception:  # embedding model not loaded → keyword search alone still works
        pass
    fused = Counter()
    for ranking in ranked:
        for rank, cid in enumerate(ranking):
            fused[cid] += 1 / (60 + rank)
    return {cid: CHUNKS[cid] for cid, _ in fused.most_common(k)}


# ---------- 3. Validate the SRS the model wrote ----------

def plain(text: str) -> str:
    """Remove evidence labels (E1…E5) from text people read; the source field keeps the real citation."""
    labels = r"E\d(?:\s*[,;]\s*E\d)*(?:\s*,?\s*and\s+E\d)?"
    text = re.sub(rf"\s*\(\s*citing\s+{labels}\s*\)", "", text, flags=re.I)
    text = re.sub(rf"\s*\(\s*{labels}\s*\)", "", text, flags=re.I)
    text = re.sub(r"\bE\d(?:\s*,\s*E\d)*(?:\s*,?\s*and\s*E\d)?\b", "the regulation", text)
    return text[:1].upper() + text[1:]


def clip(text: str, limit: int = 80) -> str:
    """Keep complete clauses within a display limit, otherwise finish at a word boundary."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    prefix = text[: limit + 1]
    ends = [m.end() for m in re.finditer(r"[.;:](?=\s|$)", prefix)]
    if ends:
        return text[:ends[-1]].rstrip()
    word = text[:limit].rsplit(" ", 1)[0].rstrip()
    return (word or text[:limit].rstrip()) + "…"


VAGUE = re.compile(r"\b(fast|quick|easy|user[- ]friendly|real[- ]time|secure|robust|efficient|appropriate|as needed|etc)\b", re.I)


def validate(srs: dict, evidence_ids: set[str]) -> dict:
    """Renumber IDs, check sources and wording, and build a full traceability matrix."""
    findings, seen = list(srs.get("findings", [])), set()
    for i, r in enumerate(srs["requirements"], 1):
        r["id"] = f"R{i}"
        r["acceptance"] = plain(r.get("acceptance", ""))
        r["statement"] = plain(re.sub(r"^\s*(REQ|FR|NFR|R)[-_ ]?\d+\s*[:.)-]\s*", "", r["statement"]))  # models like to number them
        key = r["statement"].lower().strip(" .")
        if key in seen:
            findings.append({"type": "Conflict", "text": f"{r['id']} duplicates an earlier requirement."})
        seen.add(key)
        if not r.get("acceptance", "").strip():
            r["acceptance"] = "NEEDS-VALIDATION: no acceptance criterion given."
            findings.append({"type": "Incompleteness", "text": f"{r['id']} has no acceptance criterion."})
        elif VAGUE.search(r["acceptance"]) and not re.search(r"\d", r["acceptance"]):
            findings.append({"type": "Ambiguity", "text": f"{r['id']}: “{VAGUE.search(r['acceptance']).group()}” is not measurable."})
        # A citation must be a chunk we actually retrieved, otherwise it may be invented.
        if r.get("source") not in evidence_ids and r.get("source", "").lower() not in ("brief", "answer"):
            r["source"] = "NEEDS-VALIDATION"
    srs["findings"] = findings
    # The card already says "SRS", so drop it from either end of the title.
    srs["title"] = re.sub(r"^(SRS\s*(Overview)?\s*[:·-]\s*)+|\s*[:·–-]\s*SRS(\s*Overview)?$", "", srs.get("title", ""), flags=re.I)
    srs["traceability"] = [
        {"req": r["id"], "test": f"TC{i:03}", "check": r["acceptance"].split(";")[0].rstrip(".")}
        for i, r in enumerate(srs["requirements"], 1)
    ]
    return srs


# ---------- 4. Score SDLC models from the factor ratings ----------

FACTORS = [
    "Requirement stability", "Regulatory criticality", "Security risk", "Project complexity", "System size",
    "Legacy-system dependence", "Expected change frequency", "Need for continuous delivery", "Stakeholder availability",
    "Testing and documentation formality", "Budget and schedule pressure", "Need for formal verification", "Failure consequence",
]
LEVEL = {"Low": 0, "Medium": 1, "High": 2}

# Base score + weight per factor (applied to Low=0 / Medium=1 / High=2).
MODELS = {
    "Waterfall": (50, {"Requirement stability": 10, "Testing and documentation formality": 5, "Regulatory criticality": 3,
                       "Expected change frequency": -10, "Need for continuous delivery": -6, "Project complexity": -3, "System size": -2}),
    "V-Model": (50, {"Need for formal verification": 8, "Testing and documentation formality": 6, "Regulatory criticality": 6,
                     "Failure consequence": 5, "Requirement stability": 5, "Expected change frequency": -8, "Need for continuous delivery": -5}),
    "Spiral": (57, {"Failure consequence": 6, "Project complexity": 7, "System size": 3, "Requirement stability": -6}),
    "Prototyping": (55, {"Expected change frequency": 8, "Stakeholder availability": 10, "Requirement stability": -6,
                          "Project complexity": 3, "Failure consequence": -5, "Regulatory criticality": -4}),
    "Iterative": (52, {"Project complexity": 6, "System size": 5, "Expected change frequency": 5,
                         "Legacy-system dependence": 4, "Requirement stability": -3, "Stakeholder availability": 3}),
    "Agile": (50, {"Expected change frequency": 10, "Need for continuous delivery": 6, "Stakeholder availability": 5,
                   "Testing and documentation formality": -6, "Regulatory criticality": -5, "Requirement stability": -3}),
    "RAD": (52, {"Expected change frequency": 5, "Budget and schedule pressure": 4, "Project complexity": -6,
                 "Failure consequence": -6, "Regulatory criticality": -6}),
}


# Why each model fits, and why it is passed over (shown in the ranking and the "Rejected" tab).
WHY = {
    "Waterfall": ("stable requirements and extensive approvals", "testing comes late, so verification evidence arrives after design is locked"),
    "V-Model": ("strict verification and validation: every build phase has a matching test phase", "rigid once a phase closes; late changes are expensive"),
    "Spiral": ("risk-driven loops for high uncertainty or technical risk", "heavy risk analysis each loop is costly when requirements are clear"),
    "Prototyping": ("early models help clarify uncertain user needs", "a prototype alone is not enough for high-assurance delivery"),
    "Iterative": ("incremental releases manage complex systems and learning", "needs disciplined planning across repeated cycles"),
    "Agile": ("short iterations absorb frequently changing requirements", "light documentation clashes with formal audit and sign-off"),
    "RAD": ("rapid prototyping for small, low-risk systems", "too little rigour for high-risk or regulated systems"),
}


def explain(levels: dict[str, str]) -> list[dict]:
    """Every model, best first, with its transparent score calculation."""
    rows = []
    for model, (base, weights) in MODELS.items():
        drivers = [{"factor": factor, "level": levels.get(factor, "Medium"), "points": weight * LEVEL.get(levels.get(factor, "Medium"), 1)}
                   for factor, weight in weights.items()]
        score = max(5, min(97, base + sum(driver["points"] for driver in drivers)))
        rows.append({"model": model, "score": score, "base": base, "drivers": drivers, "fit": WHY[model][0], "miss": WHY[model][1]})
    return sorted(rows, key=lambda row: -row["score"])


def rank(levels: dict[str, str]) -> list[tuple[str, int]]:
    return [(row["model"], row["score"]) for row in explain(levels)]


if __name__ == "__main__":  # self-check: python rules.py
    assert mask("mail a@b.co, PAN ABCDE1234F, card 4111 1111 1111 1111") == "mail [EMAIL], PAN [PAN], card [CARD]"
    assert any(cid.startswith("finance/rbi-kyc") for cid in search("customer due diligence KYC verification"))
    srs = validate({"requirements": [{"statement": "REQ-01: Log in.", "acceptance": "Fast login", "source": "made/up#1"},
                                     {"statement": "log in", "acceptance": ""}]}, set())
    assert [t["test"] for t in srs["traceability"]] == ["TC001", "TC002"] and srs["requirements"][0]["source"] == "NEEDS-VALIDATION"
    assert srs["requirements"][0]["statement"] == "Log in."
    assert validate({"requirements": [], "title": "UPI App - SRS Overview"}, set())["title"] == "UPI App"
    assert plain("High risk (citing E1, E2) as required by E3.") == "High risk as required by the regulation."
    assert plain("E1, E2 and E3 require review.") == "The regulation require review."
    assert clip("One short sentence. A much longer second sentence that does not fit.", 25) == "One short sentence."
    assert clip("Words without a full stop must stop at a whole word", 22) == "Words without a full…"
    assert set(MODELS) == {"Waterfall", "V-Model", "Spiral", "Prototyping", "Iterative", "Agile", "RAD"} == set(WHY)
    assert {f["type"] for f in srs["findings"]} == {"Ambiguity", "Conflict", "Incompleteness"}
    bank = dict.fromkeys(FACTORS, "Medium") | {f: "High" for f in ["Requirement stability", "Regulatory criticality",
            "Need for formal verification", "Testing and documentation formality", "Failure consequence"]} | {"Expected change frequency": "Low"}
    assert rank(bank)[0][0] == "V-Model"
    shop = dict.fromkeys(FACTORS, "Low") | {"Expected change frequency": "High", "Need for continuous delivery": "High", "Security risk": "High"}
    assert rank(shop)[0][0] in ("Agile", "Iterative")
    unclear = dict.fromkeys(FACTORS, "Low") | {"Expected change frequency": "High", "Stakeholder availability": "High", "Requirement stability": "Low"}
    assert rank(unclear)[0][0] == "Prototyping"
    big = dict.fromkeys(FACTORS, "Medium") | {"Project complexity": "High", "System size": "High", "Failure consequence": "High"}
    assert rank(big)[0][0] in ("Iterative", "Spiral")
    proof = explain(bank)[0]
    assert proof["score"] == max(5, min(97, proof["base"] + sum(d["points"] for d in proof["drivers"])))
    print(f"ok — {len(CHUNKS)} chunks indexed")
