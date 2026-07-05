#!/usr/bin/env python3
"""H24 -- florilegium_ui_check.py

Python-Hebel um den Headless-Chromium-Validator
`tools/florilegium_ui_browser.mjs`. Spiegelt das Muster H3
(`tools/hud_browser.mjs`): Python ist der Ein-/Ausstiegspunkt fuer den
Werkzeuge-Check (`werkzeuge_check.py`), die echte Browser-Logik lebt im JS,
weil Playwright dort schon installiert ist und das Spiel-Bundle (Vite) im JS
gewartet wird.

Aufruf:
  python3 tools/florilegium_ui_check.py            # Strukturpruefung (Default)
  python3 tools/florilegium_ui_check.py --shoot    # Apothekerin-Screenshot
                                                   # nach proof/florilegium/
  python3 tools/florilegium_ui_check.py --shoot --id <slug> [--mode overlay]

Exit 0 = PASS, 1 = FAIL. Bei `--shoot` ist PASS, wenn die PNG erzeugt wurde.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # hellmuth/
JS_SCRIPT = ROOT / "tools" / "florilegium_ui_browser.mjs"
DEFAULT_PROOF = ROOT / "proof" / "florilegium"


def _need_npx() -> str | None:
    """Pfad zu npx, sonst FAIL-Grund. Wir starten 'npx vite preview' im JS."""
    import shutil
    npx = shutil.which("npx")
    return npx


def _run_js(args: list[str], shot_dir: Path | None = None) -> int:
    if not JS_SCRIPT.is_file():
        print(f"FAIL: {JS_SCRIPT.relative_to(ROOT)} fehlt", file=sys.stderr)
        return 1
    env = os.environ.copy()
    if shot_dir is not None:
        shot_dir.mkdir(parents=True, exist_ok=True)
        env["SHOT_DIR"] = str(shot_dir)
    cmd = ["node", str(JS_SCRIPT), *args]
    proc = subprocess.run(cmd, cwd=str(ROOT), env=env)
    return int(proc.returncode)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Florilegium-UI Headless-Validator (H24)")
    ap.add_argument("--shoot", action="store_true", help="Screenshot statt Strukturpruefung")
    ap.add_argument("--id", default="apothekerin", help="Eintrag-ID fuer --shoot")
    ap.add_argument("--mode", default="fullview", choices=["fullview", "overlay"],
                    help="Modus fuer --shoot")
    ap.add_argument("--shot-dir", default=str(DEFAULT_PROOF),
                    help="Zielverzeichnis fuer --shoot")
    args = ap.parse_args(argv)

    if not _need_npx():
        print("FAIL: 'npx' nicht im PATH (benoetigt fuer 'npx vite preview')")
        return 1

    if args.shoot:
        rc = _run_js(["shoot", args.id, args.mode], shot_dir=Path(args.shot_dir))
        if rc != 0:
            return rc
        png = Path(args.shot_dir) / f"{args.id}_{args.mode}.png"
        if not png.is_file():
            print(f"FAIL: erwartete Datei nicht erzeugt: {png}")
            return 1
        print(f"PASS: {png.relative_to(ROOT) if png.is_absolute() and ROOT in png.parents else png}")
        return 0

    return _run_js(["check"])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
