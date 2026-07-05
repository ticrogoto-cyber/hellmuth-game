#!/usr/bin/env python3
"""fetch_animations.py — Optionaler CMU-Public-Domain-Backfill fuer die
HELLMUTH-Animations-Bibliothek.

Stand 2026-06-17: HELLMUTH-Linie streicht Mixamo + Truebones. Die primaere
Quelle ist `procedural/procedural_anim.py` (Eigenwerk MIT). CMU ist OPTIONAL,
wenn ein Public-Domain-Mocap-Set fuer humanoide Varianten gewuenscht wird.

  python3 tools/animations/fetch_animations.py cmu

In dieser Code-Session ist CMU (mocap.cs.cmu.edu) per Netz-Policy nicht
erreichbar (HTTP 403). Der Helper meldet das ehrlich und gibt den manuellen
Pfad aus. Wer CMU ueberspringt, hat trotzdem eine vollstaendige Bibliothek
(prozedural).
"""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CMU_DIR = ROOT / "cmu"

# Kuratiertes CMU-MVP-Set (Trial-Nummern; CMU Graphics Lab Mocap DB).
CMU_CURATED = {
    "02_01": "walk",
    "09_01": "run",
    "13_29": "idle_look",
    "143_01": "attack_swing",
}
CMU_MIRRORS = [
    "https://raw.githubusercontent.com/un-pany/cmu-mocap-bvh/master/{trial}.bvh",
]
CMU_CLAUSE = ("The motion capture data may be copied, modified, or redistributed "
              "without permission. You may include this data in commercially-sold "
              "products, but you may not resell this data directly.")


def write_sidecar(path: Path) -> None:
    side = path.with_suffix(path.suffix + ".license.json")
    side.write_text(json.dumps({
        "source": "CMU Mocap Database",
        "url": "http://mocap.cs.cmu.edu/",
        "clause": CMU_CLAUSE,
        "acknowledgement": "The data used in this project was obtained from "
                            "mocap.cs.cmu.edu. The database was created with "
                            "funding from NSF EIA-0196217.",
        "verified_on": str(date.today()),
    }, indent=2))


def _try(url: str, dst: Path, timeout: int = 15) -> bool:
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "hellmuth-fetch"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if r.status != 200:
                return False
            data = r.read()
        if len(data) < 64:
            return False
        dst.write_bytes(data)
        return True
    except Exception as exc:
        print(f"  miss {url}: {exc.__class__.__name__}", file=sys.stderr)
        return False


def fetch_cmu() -> int:
    print("CMU Mocap (Public Domain / permissive). Lizenz:")
    print(f'  "{CMU_CLAUSE}"')
    print("  Acknowledgement-Pflicht in den Credits (NSF EIA-0196217).\n")
    got = 0
    for trial, label in CMU_CURATED.items():
        out = CMU_DIR / f"cmu_{trial}_{label}.bvh"
        if out.exists():
            print(f"  vorhanden: {out.name}")
            got += 1
            continue
        ok = any(_try(m.format(trial=trial), out) for m in CMU_MIRRORS)
        if ok:
            write_sidecar(out)
            print(f"  geladen: {out.name}")
            got += 1
        else:
            print(f"  FEHLT (kein Mirror erreichbar): {out.name}")
    if got == 0:
        print(f"\nKein CMU-Mirror erreichbar (Netz-Policy). Optional:")
        print("  1) BVH-Release lokal laden (z. B. cgspeed Daz-friendly)")
        print(f"  2) curated Trials {list(CMU_CURATED)} nach {CMU_DIR}/ legen")
        print("  3) Helper erneut laufen -> Sidecars werden erzeugt")
        print("\nOhne CMU: Bibliothek ist trotzdem komplett (procedural).")
        return 1
    print(f"\nOK: {got}/{len(CMU_CURATED)} CMU-Clips in {CMU_DIR}")
    return 0


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] != "cmu":
        print("Aufruf: fetch_animations.py cmu", file=sys.stderr)
        print("(Mixamo + Truebones sind in der HELLMUTH-Linie gestrichen.)",
              file=sys.stderr)
        return 2
    return fetch_cmu()


if __name__ == "__main__":
    sys.exit(main())
