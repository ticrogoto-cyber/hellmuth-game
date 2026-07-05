#!/usr/bin/env python3
"""check_manifest_coverage.py — jedes Python-Skript in `tools/` muss in
`docs/WERKZEUGE.md` erwaehnt sein. Ausnahmen: `__init__.py`, `conftest.py`,
alles unter `tools/_internal/`.

Aufruf:
  python3 tools/check_manifest_coverage.py
Exit 0 wenn alle Tools erwaehnt; Exit 1 mit Liste fehlender Eintraege.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
MANIFEST = ROOT / "docs" / "WERKZEUGE.md"

SKIP_NAMES = {"__init__.py", "conftest.py", "check_manifest_coverage.py"}
SKIP_DIR_NAMES = ("_internal",)


def candidate_scripts() -> list[Path]:
    out: list[Path] = []
    for p in sorted(TOOLS.rglob("*.py")):
        if p.name in SKIP_NAMES:
            continue
        # Ueberspringe tools/_internal/-Unterbaum
        rel = p.relative_to(TOOLS)
        if any(part in SKIP_DIR_NAMES for part in rel.parts[:-1]):
            continue
        out.append(p)
    return out


def main() -> int:
    if not MANIFEST.is_file():
        print(f"FAIL Manifest fehlt: {MANIFEST}")
        return 1
    manifest_text = MANIFEST.read_text(encoding="utf-8")
    scripts = candidate_scripts()
    missing: list[str] = []
    for p in scripts:
        # Vorhanden = Skript-Name (mit oder ohne tools/-Praefix) taucht im
        # Manifest auf, ODER die Werkzeug-Bibliothek dahinter (z. B.
        # `rembg` fuer `freistellen_all.py`).
        name = p.name
        stem = p.stem
        if name in manifest_text or stem in manifest_text:
            continue
        missing.append(name)

    if not missing:
        print(f"OK Manifest-Coverage: {len(scripts)} Skripte, alle in docs/WERKZEUGE.md erwaehnt.")
        return 0

    print(f"FAIL Manifest-Coverage: {len(missing)} Skript(e) fehlen in docs/WERKZEUGE.md:")
    for m in missing:
        print(f"  - tools/{m}")
    print("\nReparatur: docs/WERKZEUGE.md ergaenzen oder Skript loeschen.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
