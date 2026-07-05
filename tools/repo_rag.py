#!/usr/bin/env python3
"""repo_rag.py — Retrieval Augmented Generation über `hellmuth/docs/*.md`.

Welle-3-Hebel aus docs/CONTAINER-WERKZEUGE-2.md Teil 3 (G: RAG fuer das Repo).
Zwei Backends in einem Skript, per Flag waehlbar; beide deterministisch in
dem Sinne, dass dieselbe Query auf demselben Index dasselbe Ranking liefert.

- `--bm25`        : `txtai` BM25-Index, kein Modell, instant. Baseline.
- `--neural`      : `fastembed` mit `BAAI/bge-base-en-v1.5`. Modell-Download
                    laeuft ueber `storage.googleapis.com/qdrant-fastembed/`
                    (NICHT HF). 252 MB ONNX, dim 768.

Index liegt in `tools/repo_rag.index/` (gitignored, siehe `.gitignore`).

Aufruf:
  python3 tools/repo_rag.py --bm25 --build
  python3 tools/repo_rag.py --bm25 "wie gross ist die offene Oberkante"
  python3 tools/repo_rag.py --neural --build
  python3 tools/repo_rag.py --neural "wie gross ist die offene Oberkante"
  python3 tools/repo_rag.py --bm25 --self-test    # Solutions-Mess-Replay

Chunking: pro `.md` werden Absaetze (durch Leerzeile getrennt) als Chunks
indiziert; ein Chunk traegt seine Quelldatei + Zeilennummer-Spanne mit, damit
die Antwort zur Quelle zurueckverlinkt.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # hellmuth/
DOCS = ROOT / "docs"
INDEX_DIR = ROOT / "tools" / "repo_rag.index"

NEURAL_MODEL = "BAAI/bge-base-en-v1.5"
NEURAL_CACHE = ROOT / "tools" / "models" / "fastembed"


def _chunks_from_md(path: Path) -> list[dict]:
    """Absaetze als Chunks. Eintrag: {text, source, line_start, line_end}."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    out: list[dict] = []
    buf: list[str] = []
    start = 0
    for i, ln in enumerate(lines):
        if ln.strip():
            if not buf:
                start = i + 1
            buf.append(ln)
        else:
            if buf:
                out.append({
                    "text": "\n".join(buf),
                    "source": str(path.relative_to(ROOT)),
                    "line_start": start,
                    "line_end": i,
                })
                buf = []
    if buf:
        out.append({
            "text": "\n".join(buf),
            "source": str(path.relative_to(ROOT)),
            "line_start": start,
            "line_end": len(lines),
        })
    return out


def _all_chunks() -> list[dict]:
    chunks: list[dict] = []
    for p in sorted(DOCS.glob("*.md")):
        chunks.extend(_chunks_from_md(p))
    return chunks


# --- BM25-Backend (txtai) -------------------------------------------------------

def _bm25_build() -> None:
    try:
        from txtai.scoring import ScoringFactory
    except ImportError as exc:
        raise SystemExit(
            "txtai fehlt. Installation:  pip install txtai\n"
            f"(Original-Fehler: {exc})"
        ) from exc
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    chunks = _all_chunks()
    scoring = ScoringFactory.create({"method": "bm25", "terms": True})
    # txtai erwartet List[(id, text, tags)]
    rows = [(i, c["text"], None) for i, c in enumerate(chunks)]
    scoring.index(rows)
    scoring.save(str(INDEX_DIR / "bm25"))
    (INDEX_DIR / "bm25_chunks.json").write_text(json.dumps(chunks, indent=2), encoding="utf-8")
    print(f"BM25-Index gebaut: {len(chunks)} Chunks aus {len(set(c['source'] for c in chunks))} Dateien.")


def _bm25_query(q: str, k: int = 5) -> list[dict]:
    from txtai.scoring import ScoringFactory
    scoring = ScoringFactory.create({"method": "bm25", "terms": True})
    scoring.load(str(INDEX_DIR / "bm25"))
    chunks = json.loads((INDEX_DIR / "bm25_chunks.json").read_text(encoding="utf-8"))
    hits = scoring.search(q, k)
    out = []
    for hit in hits:
        # txtai liefert (id, score) Tupel oder dict je nach Version
        if isinstance(hit, tuple):
            idx, score = hit
        elif isinstance(hit, dict):
            idx, score = hit.get("id"), hit.get("score")
        else:
            continue
        c = chunks[int(idx)]
        out.append({**c, "score": float(score)})
    return out


# --- Neural-Backend (fastembed BGE) --------------------------------------------

def _neural_build() -> None:
    try:
        from fastembed import TextEmbedding  # noqa: WPS433
    except ImportError as exc:
        raise SystemExit(
            "fastembed fehlt. Installation:  pip install fastembed\n"
            f"(Original-Fehler: {exc})"
        ) from exc
    import numpy as np  # noqa: WPS433
    NEURAL_CACHE.mkdir(parents=True, exist_ok=True)
    chunks = _all_chunks()
    embedder = TextEmbedding(model_name=NEURAL_MODEL, cache_dir=str(NEURAL_CACHE))
    texts = [c["text"] for c in chunks]
    embs = np.array(list(embedder.embed(texts)), dtype=np.float32)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    np.save(INDEX_DIR / "neural.npy", embs)
    (INDEX_DIR / "neural_chunks.json").write_text(json.dumps(chunks, indent=2), encoding="utf-8")
    print(f"Neural-Index gebaut: {embs.shape[0]} Chunks dim={embs.shape[1]} "
          f"({NEURAL_MODEL}).")


def _neural_query(q: str, k: int = 5) -> list[dict]:
    from fastembed import TextEmbedding  # noqa: WPS433
    import numpy as np  # noqa: WPS433
    embedder = TextEmbedding(model_name=NEURAL_MODEL, cache_dir=str(NEURAL_CACHE))
    chunks = json.loads((INDEX_DIR / "neural_chunks.json").read_text(encoding="utf-8"))
    embs = np.load(INDEX_DIR / "neural.npy")
    q_emb = np.array(list(embedder.query_embed([q])), dtype=np.float32)[0]
    # Kosinus-Ähnlichkeit (Vektoren sind L2-normalisiert)
    scores = embs @ q_emb
    top = scores.argsort()[::-1][:k]
    return [{**chunks[int(i)], "score": float(scores[i])} for i in top]


# --- Spiegel-Verifikation -------------------------------------------------------

def _verify_neural_mirror() -> str:
    """Importiert fastembed und liest die internen Download-URLs. Liefert die
    erste URL, die `storage.googleapis.com` enthaelt. Sonst Hinweis."""
    try:
        import fastembed.common.model_management as mm  # noqa: WPS433
        urls = []
        for name in dir(mm):
            v = getattr(mm, name, None)
            if isinstance(v, dict):
                for vv in v.values():
                    if isinstance(vv, str) and "storage.googleapis.com" in vv:
                        urls.append(vv)
        if urls:
            return urls[0]
    except Exception:
        pass
    return ("Hinweis: fastembed-Modell-CDN wird dynamisch resolviert; "
            "Welle-2-Mess-Beleg: storage.googleapis.com/qdrant-fastembed/")


# --- CLI ------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--bm25", action="store_true")
    grp.add_argument("--neural", action="store_true")
    ap.add_argument("--build", action="store_true", help="Index (neu) bauen.")
    ap.add_argument("--self-test", action="store_true",
                    help="Solutions-Welle-3-Replay: zwei Queries gegen erwartete Top-1.")
    ap.add_argument("-k", "--top-k", type=int, default=3)
    ap.add_argument("--verify-mirror", action="store_true",
                    help="Druck der Modell-CDN-URL (Spiegel-Pflicht aus Brief).")
    ap.add_argument("query", nargs="?", default=None)
    args = ap.parse_args()

    backend = "bm25" if args.bm25 else "neural"

    if args.verify_mirror and backend == "neural":
        print(f"fastembed-Modell-Quelle: {_verify_neural_mirror()}")
        return 0

    if args.build:
        if backend == "bm25":
            _bm25_build()
        else:
            _neural_build()
        return 0

    if args.self_test:
        q1 = "wie gross ist die offene Oberkante"
        q1_expected = "HUD-SOLL-SPEC.md"
        q2 = "balance sweep Determinismus"
        q2_expected = "CONTAINER-WERKZEUGE.md"
        passed = 0
        for q, exp in ((q1, q1_expected), (q2, q2_expected)):
            hits = (_bm25_query(q, k=3) if backend == "bm25" else _neural_query(q, k=3))
            top = hits[0] if hits else {}
            top_source = (top.get("source") or "").split("/")[-1]
            ok = exp in top_source
            print(f"{'PASS' if ok else 'FAIL'}  q={q!r}  expected~={exp!r}  "
                  f"top1={top_source} (score={top.get('score', 0):.4f})")
            passed += int(ok)
        print(f"Self-Test: {passed}/2 Queries grün.")
        return 0 if passed == 2 else 1

    if not args.query:
        ap.error("Query fehlt (oder --build / --self-test angeben).")

    hits = (_bm25_query(args.query, k=args.top_k) if backend == "bm25"
            else _neural_query(args.query, k=args.top_k))
    for i, h in enumerate(hits, 1):
        text = h["text"][:200] + ("…" if len(h["text"]) > 200 else "")
        print(f"\n[{i}] {h['source']}:{h['line_start']}-{h['line_end']}  "
              f"score={h['score']:.4f}")
        print(f"    {text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
