#!/usr/bin/env python3
"""anim_library.py — Index der Animations-Bibliothek. Scannt tools/animations/
nach verwendbaren Clips (.glb/.fbx/.bvh) je Quelle und emittiert ein JSON-
Manifest, das tools/retarget_animation.py + die Batch-Pipeline lesen.

  python3 tools/animations/anim_library.py            # Tabelle nach stdout
  python3 tools/animations/anim_library.py --json      # MANIFEST.json schreiben

Lizenz pro Datei wird aus dem Sidecar <datei>.license.json gelesen (von
fetch_animations.py erzeugt) bzw. aus der Ordner-LICENSE.md abgeleitet.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# HELLMUTH-Linie 2026-06-17: Mixamo + Truebones gestrichen. Primaer prozedural,
# CMU optional als Public-Domain-Backfill (kein Lizenz-Risiko).
SOURCES = {
    "procedural": "MIT (Eigenwerk)",
    "cmu":        "Public Domain / permissive (CMU Mocap, NSF EIA-0196217)",
    "templates":  "Skelett-Templates (Auto-Rig H19, kein Clip)",
}
CLIP_EXT = (".glb", ".fbx", ".bvh")


def scan() -> dict:
    manifest = {"sources": {}}
    for src, lic in SOURCES.items():
        d = ROOT / src
        clips = []
        if d.exists():
            for p in sorted(d.rglob("*")):
                if p.suffix.lower() in CLIP_EXT:
                    side = p.with_suffix(p.suffix + ".license.json")
                    clips.append({
                        "name": p.stem,
                        "file": str(p.relative_to(ROOT)),
                        "format": p.suffix.lower().lstrip("."),
                        "bytes": p.stat().st_size,
                        "license_sidecar": side.exists(),
                    })
        manifest["sources"][src] = {"license": lic, "clip_count": len(clips), "clips": clips}
    return manifest


# --- Resolve / Search (H26): Quell-Clip fuer animate_glb.py finden -----------
# Praeferenz: prozedurale Eigenwerk-Clips zuerst (MIT, deterministisch, immer
# da), dann CMU (Public Domain, optionaler Backfill). Mixamo/Truebones sind per
# Ticro-Strike raus, tauchen also gar nicht erst in SOURCES auf.
RESOLVE_PREFERENCE = ("procedural", "cmu")


def _archetype_matches(stem: str, archetype: str, family: str | None) -> bool:
    s, a = stem.lower(), archetype.lower()
    if family:
        # Familien-Hinweis (z. B. "humanoid"): nur Clips dieser Familie.
        return s == f"{family.lower()}_{a}" or (s.startswith(family.lower()) and s.endswith(a))
    return s == a or s == f"humanoid_{a}" or s.endswith(f"_{a}") or a in s.split("_")


def resolve(archetype: str, prefer: tuple = RESOLVE_PREFERENCE,
            family: str | None = None) -> Path | None:
    """Bester Quell-Clip fuer einen Archetyp (idle/walk/attack/death/...).
    `family` (z. B. "humanoid") schraenkt auf eine Skelett-Familie ein -- noetig,
    weil "idle" sonst sowohl hover_idle als auch humanoid_idle trifft.
    Liefert absoluten Pfad oder None. Praeferenz: prefer-Reihenfolge, dann
    kuerzeste Datei (kleinster, also simpelster Clip)."""
    order = list(prefer) + [s for s in SOURCES if s not in prefer]
    for src in order:
        d = ROOT / src
        if not d.exists():
            continue
        cands = [p for p in sorted(d.rglob("*"))
                 if p.suffix.lower() in CLIP_EXT
                 and _archetype_matches(p.stem, archetype, family)]
        if cands:
            cands.sort(key=lambda p: p.stat().st_size)
            return cands[0].resolve()
    return None


def search(query: str) -> list[Path]:
    """Alle Clips, deren Stem die Query (case-insensitive Substring) enthaelt."""
    q = query.lower()
    hits = []
    for src in SOURCES:
        d = ROOT / src
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if p.suffix.lower() in CLIP_EXT and q in p.stem.lower():
                hits.append(p.resolve())
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", nargs="?", choices=["status", "resolve", "search"],
                    default="status",
                    help="status (Default, Tabelle) | resolve <archetype> | search <query>")
    ap.add_argument("arg", nargs="?", default=None, help="Archetyp bzw. Suchbegriff")
    ap.add_argument("--json", action="store_true", help="MANIFEST.json schreiben")
    args = ap.parse_args()

    if args.cmd == "resolve":
        if not args.arg:
            print("resolve braucht <archetype>", file=sys.stderr)
            return 2
        p = resolve(args.arg)
        if p is None:
            print(f"(kein Clip fuer '{args.arg}')", file=sys.stderr)
            return 1
        print(p)
        return 0
    if args.cmd == "search":
        if not args.arg:
            print("search braucht <query>", file=sys.stderr)
            return 2
        hits = search(args.arg)
        for h in hits:
            print(h)
        return 0 if hits else 1

    m = scan()
    if args.json:
        out = ROOT / "MANIFEST.json"
        out.write_text(json.dumps(m, indent=2))
        print(f"-> {out}")
    print(f"{'QUELLE':12}  {'CLIPS':>5}  LIZENZ")
    print("-" * 60)
    total = 0
    for src, info in m["sources"].items():
        total += info["clip_count"]
        print(f"{src:12}  {info['clip_count']:>5}  {info['license']}")
        for c in info["clips"]:
            sc = "lic" if c["license_sidecar"] else "—"
            print(f"             - {c['name']:20} {c['format']:4} {c['bytes']:>8}B  [{sc}]")
    print("-" * 60)
    print(f"Gesamt: {total} Clips")
    return 0


if __name__ == "__main__":
    sys.exit(main())
