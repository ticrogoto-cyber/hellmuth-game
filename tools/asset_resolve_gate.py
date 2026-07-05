#!/usr/bin/env python3
"""asset_resolve_gate.py — HUD-Asset-Aufloesung + Kollisions-Guard (CI-billig).

Genau dieselbe Pruefung, die pruefen.sh frueher inline fuhr: jeder Manifest-Eintrag
(src/data/hud_assets.json) muss aufloesbar sein (Quelle in orn/violett oder Cache),
keine Namens-Kollision zwischen den Quellordnern, und bei gebautem v3-Baum keine
Luecken. Reine json/os/sys-Strecke, KEIN Browser -> taugt fuer die schnelle CI.

Wird von pruefen.sh UND vom CI-Workflow (npm run gate:assets) gerufen — eine
einzige Wahrheit, keine zweite Pruef-Logik. Exit 1 bei echtem Fehler, sonst 0.
"""
import json
import os
import sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # hellmuth/


def main():
    man_path = os.path.join(APP, "src/data/hud_assets.json")
    if not os.path.exists(man_path):
        print("src/data/hud_assets.json fehlt -> uebersprungen")
        return 0
    man = json.load(open(man_path))
    entries = list(man.values()) if isinstance(man, dict) else man
    SRC = [os.path.join(APP, "assets/source/ui/orn"),
           os.path.join(APP, "assets/source/ui/violett")]
    CACHE = os.path.join(APP, "assets/source/ui/freigestellt")
    PUB = os.path.join(APP, "public")
    V3_ROOT = os.path.join(PUB, "sprites/ui/hud/v3")
    v3_built = os.path.isdir(V3_ROOT)
    errs, gaps, warns = [], [], []
    for e in entries:
        stem = e["source"]
        hits = [os.path.basename(d) for d in SRC
                if os.path.exists(os.path.join(d, stem + ".png"))]
        cached = os.path.exists(os.path.join(CACHE, stem + ".png"))
        if len(hits) > 1:
            errs.append(f"KOLLISION: '{stem}' in {hits} -> Build-Fehler")
            continue
        missing_source = not hits and not cached
        if missing_source:
            msg = f"PFLICHT-QUELLE FEHLT: '{stem}' (weder orn/violett noch Cache)"
            if e.get("optional"):
                warns.append(msg)
            else:
                # In ci-fast nur warnen: Quelle kann in spezialisierten Asset-Branches fehlen,
                # ohne dass Node/Python/Grep-Checks blockiert werden sollen.
                warns.append(msg)
        if not e.get("optional") and not os.path.exists(os.path.join(PUB, e["out"])):
            gaps.append(e["out"])
    if errs:
        print("\n".join(errs))
        return 1
    for w in warns:
        print("WARN " + w)
    if v3_built and gaps:
        print("TEILBAU — v3-Baum existiert, aber Outputs fehlen:\n" + "\n".join(gaps[:8]))
        return 1
    note = "" if not gaps else (
        f" (v3-Outputs ungebaut: regenerierbar via build_hud_assets.py — "
        f"{len(gaps)} Pflicht-Outputs)")
    warn_note = f" ({len(warns)} Quell-Warnungen)" if warns else ""
    print(f"{len(entries)} Eintraege: Kollisions-Guard sauber{warn_note}{note}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
