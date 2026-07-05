#!/usr/bin/env python3
"""lint_auftragsbrief.py — warnt, wenn ein Auftragsbrief externe Bezahl-Tools
oder Hugging-Face-Quellen nennt, obwohl ein im Container gemessener interner
Hebel (Welle 1) existiert.

Heuristik:
- Scan-Ziele: `.md` unter `hellmuth/docs/` und `/mnt/user-data/outputs/`.
- Auftragsbrief = Datei enthaelt mindestens einen der Marker
  `SCHRITT 0`, `Werkstück`, `WERKSTÜCK`, `Loop-Blaupause`.
- Forbidden-Begriffe: Mixamo, ElevenLabs, Adobe, Photoshop, Hugging Face,
  huggingface.co.
- Verworfen-Kontext erkannt: enthaelt der ABSATZ Worte wie `verworfen`,
  `VERWORFEN`, `tot`, `Tot`, `403`, `DNS tot`, `Hugging-Face-Wand`, `Bezahl`,
  `gesperrt`, `nicht im Container`, oder steht der Treffer in einer
  Markdown-Tabellenzeile mit `VERWORFEN` → die Erwaehnung ist legitim
  (Doku der toten Spuren), keine Warnung.
- Allowlist: `CONTAINER-WERKZEUGE.md`, `CONTAINER-WERKZEUGE-*.md`,
  `AUFTRAG-VORLAGE.md`, `KONVENTIONEN.md` — die diskutieren die Begriffe
  per Definition und tragen den Verworfen-Kontext eingebaut.

Aufruf:
  python3 tools/lint_auftragsbrief.py             # Warnung -> stdout, exit 0
  python3 tools/lint_auftragsbrief.py --strict    # Warnung -> Fehler, exit 1

Welle-1-Doktrin: `docs/CONTAINER-WERKZEUGE.md` (Commit 69d93a2).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # hellmuth/
REPO = ROOT.parent                                     # repo root
DOCS = ROOT / "docs"
OUTPUTS = Path("/mnt/user-data/outputs")

AUFTRAG_MARKERS = ("SCHRITT 0", "Werkstück", "WERKSTÜCK", "Loop-Blaupause")
FORBIDDEN = {
    "Mixamo":         "FBX2glTF + bpy (Mixamo-Auto-DL ist 403/DNS-tot; FBX-Clips bleiben manuelle Eingabe)",
    "ElevenLabs":     "piper-tts (GitHub-Release-Stimme) fuer Platzhalter-VO; ElevenLabs nur fuer finale Charakterstimmen",
    "Adobe":          "cv2 / rembg / Real-ESRGAN / PIL Lanczos — gemessen, was Adobe ersetzt",
    "Photoshop":      "cv2 (Auto-Trim/Halo) + rembg (Freistellen) + PIL Lanczos (Skalierung)",
    "Hugging Face":   "Werkzeug ist tot im Container (huggingface.co 403, cdn-lfs DNS-tot). GitHub-Release-Gewichte pruefen.",
    "huggingface.co": "Werkzeug ist tot im Container (huggingface.co 403, cdn-lfs DNS-tot). GitHub-Release-Gewichte pruefen.",
}

VERWORFEN_HINTS = re.compile(
    r"\b(verworfen|VERWORFEN|tot|Tot|tot\.|Tot\.|403|DNS\s+tot|Hugging-Face-Wand|"
    r"Bezahl|gesperrt|nicht im Container|nicht\s+laufen|gesperrt|host_not_allowed|"
    r"Falle|verbrennt)\b",
    re.UNICODE,
)
ALLOWLIST_NAMES = {
    "CONTAINER-WERKZEUGE.md",
    "AUFTRAG-VORLAGE.md",
    "KONVENTIONEN.md",
}
ALLOWLIST_PREFIX = ("CONTAINER-WERKZEUGE-",)   # CONTAINER-WERKZEUGE-WELLE2-*.md, -2.md, …


def is_allowlisted(path: Path) -> bool:
    n = path.name
    if n in ALLOWLIST_NAMES:
        return True
    if any(n.startswith(p) for p in ALLOWLIST_PREFIX):
        return True
    return False


def looks_like_auftrag(text: str) -> bool:
    return any(m in text for m in AUFTRAG_MARKERS)


def paragraph_around(lines: list[str], idx: int) -> str:
    """Sucht den Absatz (durch Leerzeile/Heading abgegrenzt), der `idx` enthaelt."""
    top = idx
    while top > 0 and lines[top - 1].strip() and not lines[top - 1].startswith("#"):
        top -= 1
    bot = idx
    while bot + 1 < len(lines) and lines[bot + 1].strip() and not lines[bot + 1].startswith("#"):
        bot += 1
    return "\n".join(lines[top:bot + 1])


def is_table_verworfen_row(line: str) -> bool:
    # Markdown-Tabellenzeile, die irgendwo "VERWORFEN" enthaelt
    return line.lstrip().startswith("|") and "VERWORFEN" in line


def scan_file(path: Path) -> list[tuple[Path, int, str, str, str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if not looks_like_auftrag(text):
        return []
    lines = text.splitlines()
    findings: list[tuple[Path, int, str, str, str]] = []
    for i, line in enumerate(lines):
        for term, ersatz in FORBIDDEN.items():
            if term in line:
                if is_table_verworfen_row(line):
                    continue
                ctx = paragraph_around(lines, i)
                if VERWORFEN_HINTS.search(ctx):
                    continue
                findings.append((path, i + 1, line.strip(), term, ersatz))
    return findings


def check_werkzeuge_reference(brief_text: str) -> tuple[bool, str]:
    """Regel-ID WZ-REF-01: jeder Auftragsbrief muss textuell mindestens einmal
    `WERKZEUGE.md` oder `werkzeuge_check.py` enthalten. Sonst FAIL.

    Liefert (ok, diagnose). ok=True wenn Referenz gefunden; sonst False mit
    Klartext-Diagnose."""
    has_md = "WERKZEUGE.md" in brief_text
    has_check = "werkzeuge_check.py" in brief_text
    if has_md or has_check:
        hit = "WERKZEUGE.md" if has_md else "werkzeuge_check.py"
        return True, f"WZ-REF-01 PASS: Referenz auf {hit} gefunden."
    return False, (
        "WZ-REF-01 FAIL: Brief enthaelt weder 'WERKZEUGE.md' noch "
        "'werkzeuge_check.py'. Jeder Auftrag muss die Werkzeug-Pflicht "
        "explizit aufgreifen (siehe `hellmuth/docs/WERKZEUGE.md`)."
    )


def collect_targets(extra_paths: list[Path]) -> list[Path]:
    targets: list[Path] = []
    if DOCS.is_dir():
        targets.extend(sorted(DOCS.glob("*.md")))
    if OUTPUTS.is_dir():
        targets.extend(sorted(OUTPUTS.glob("**/*.md")))
    for p in extra_paths:
        if p.is_file() and p.suffix == ".md":
            targets.append(p)
        elif p.is_dir():
            targets.extend(sorted(p.glob("**/*.md")))
    seen: set[Path] = set()
    uniq: list[Path] = []
    for t in targets:
        rp = t.resolve()
        if rp not in seen:
            seen.add(rp)
            uniq.append(t)
    return uniq


def _self_test() -> int:
    """Selbsttest fuer WZ-REF-01: Positiv- und Negativ-Brief, Ausgaben gezeigt."""
    pos = (
        "# Test-Auftragsbrief (Positiv)\n\n"
        "## SCHRITT 0\nWerkstück 1.\n"
        "Vorab `tools/werkzeuge_check.py` laufen lassen, dann `docs/WERKZEUGE.md` lesen."
    )
    neg = (
        "# Test-Auftragsbrief (Negativ)\n\n"
        "## SCHRITT 0\nWerkstück 1.\n"
        "Fang an, bau was, fertig — kein Verweis auf das Manifest."
    )
    ok1, msg1 = check_werkzeuge_reference(pos)
    ok2, msg2 = check_werkzeuge_reference(neg)
    print(f"POSITIV-Brief: {msg1}")
    print(f"NEGATIV-Brief: {msg2}")
    return 0 if (ok1 and not ok2) else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--strict", action="store_true", help="Warnung -> Fehler (exit 1)")
    ap.add_argument("--check-ref", type=Path, default=None,
                    help="Nur WZ-REF-01 (Werkzeug-Referenz-Check) auf eine Datei "
                         "anwenden. Exit 1 bei Verstoss.")
    ap.add_argument("--self-test", action="store_true",
                    help="WZ-REF-01-Selbsttest (Positiv- + Negativ-Brief).")
    ap.add_argument("paths", nargs="*", type=Path, help="zusaetzliche Dateien/Ordner")
    args = ap.parse_args()

    if args.self_test:
        return _self_test()

    if args.check_ref is not None:
        text = args.check_ref.read_text(encoding="utf-8", errors="replace")
        ok, msg = check_werkzeuge_reference(text)
        print(f"{args.check_ref}: {msg}")
        return 0 if ok else 1

    targets = collect_targets(args.paths)
    if not targets:
        print("Auftragsbrief-Lint: keine Scan-Ziele gefunden.")
        return 0

    total = 0
    skipped = 0
    flagged: list[tuple[Path, int, str, str, str]] = []
    wz_ref_fails: list[tuple[Path, str]] = []
    for t in targets:
        if is_allowlisted(t):
            skipped += 1
            continue
        # Bestehende Regel: Bezahl-Tool-Empfehlung ohne Verworfen-Kontext.
        for f in scan_file(t):
            total += 1
            flagged.append(f)
        # Neue Regel WZ-REF-01: Werkzeug-Referenz vorhanden?
        text = t.read_text(encoding="utf-8", errors="replace")
        if looks_like_auftrag(text):
            ok, msg = check_werkzeuge_reference(text)
            if not ok:
                wz_ref_fails.append((t, msg))

    print(f"Auftragsbrief-Lint: {len(targets)} Datei(en) gescannt, {skipped} Allowlist-uebersprungen.")

    if wz_ref_fails:
        print(f"\nWZ-REF-01 (Werkzeug-Referenz-Pflicht) FAIL in {len(wz_ref_fails)} Brief(en):")
        for path, msg in wz_ref_fails:
            try:
                rel = path.relative_to(REPO)
            except ValueError:
                rel = path
            print(f"  FAIL  {rel}  {msg}")

    if not flagged and not wz_ref_fails:
        print("Keine ungerechtfertigten Bezahl-Tool-Empfehlungen, alle Briefe tragen Werkzeug-Referenz.")
        return 0
    if not flagged:
        # Nur WZ-REF-01-Verstoesse — strict bricht; sonst Warnung.
        return 1 if args.strict else 0

    print(f"\n{len(flagged)} Treffer:")
    for path, lineno, line, term, ersatz in flagged:
        try:
            rel = path.relative_to(REPO)
        except ValueError:
            rel = path
        print(f"WARN  {rel}:{lineno}  '{term}'")
        print(f"      Zeile:    {line[:140]}")
        print(f"      Ersatz:   {ersatz}")
        print()

    # WZ-REF-01-Verstoesse sind im strict-Modus immer ein Fehler; Bezahl-Tool-
    # Treffer nur im strict-Modus.
    if wz_ref_fails:
        return 1 if args.strict else 0
    if args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
