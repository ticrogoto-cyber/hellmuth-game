#!/usr/bin/env python3
"""H25 -- menu_ui_check.py

Python-Hebel um den Headless-Chromium-Validator `tools/menu_ui_browser.mjs`.
Gleiches Muster wie H24 (florilegium_ui_check.py): Python ist Ein-/Ausstieg
fuer den werkzeuge_check, die Browser-Logik lebt im JS (Playwright + Vite).

Prueft die Menue-Familie gegen den dist/-Build:
  - Hauptmenue rendert, fuenf Menuepunkte (Kampagne disabled)
  - Design-Tokens: Hintergrund rgb(26,26,26), Printvetica im Title,
    font-feature-settings liga 0, >=2 @font-face
  - Footer-Links == Konstanten (src/menu/menu_links.ts)
  - AudioBus global mit effectiveMusic/Sfx/Voice
  - Skirmish rendert gegen data/maps/index.json
  - Optionen schreibt Lautstaerke in localStorage (hellmuth_options_v1)

Aufruf:
  python3 tools/menu_ui_check.py                 # Strukturpruefung (Default)
  python3 tools/menu_ui_check.py --shoot          # Screenshot Hauptmenue
  python3 tools/menu_ui_check.py --shoot --view skirmish|options|main

Exit 0 = PASS, 1 = FAIL.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # hellmuth/
JS_SCRIPT = ROOT / "tools" / "menu_ui_browser.mjs"
DEFAULT_PROOF = ROOT / "proof" / "menu"


def _run_js(args: list[str], shot_dir: Path | None = None) -> int:
    if not JS_SCRIPT.is_file():
        print(f"FAIL: {JS_SCRIPT.relative_to(ROOT)} fehlt", file=sys.stderr)
        return 1
    env = os.environ.copy()
    if shot_dir is not None:
        shot_dir.mkdir(parents=True, exist_ok=True)
        env["SHOT_DIR"] = str(shot_dir)
    proc = subprocess.run(["node", str(JS_SCRIPT), *args], cwd=str(ROOT), env=env)
    return int(proc.returncode)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Menue-Familie Headless-Validator (H25)")
    ap.add_argument("--shoot", action="store_true", help="Screenshot statt Strukturpruefung")
    ap.add_argument("--view", default="main", choices=["main", "skirmish", "options"],
                    help="View fuer --shoot")
    ap.add_argument("--shot-dir", default=str(DEFAULT_PROOF), help="Zielverzeichnis fuer --shoot")
    args = ap.parse_args(argv)

    if not shutil.which("npx"):
        print("FAIL: 'npx' nicht im PATH (benoetigt fuer 'npx vite preview')")
        return 1

    if args.shoot:
        rc = _run_js(["shoot", args.view], shot_dir=Path(args.shot_dir))
        if rc != 0:
            return rc
        png = Path(args.shot_dir) / f"menu_{args.view}.png"
        if not png.is_file():
            print(f"FAIL: erwartete Datei nicht erzeugt: {png}")
            return 1
        print(f"PASS: {png}")
        return 0

    return _run_js(["check"])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
