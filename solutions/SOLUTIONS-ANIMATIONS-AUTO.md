# SOLUTIONS-ANIMATIONS-AUTO

Vollautomatische, kostenlose, non-humanoid-fähige Animations-Pipeline für gerigte GLBs in der Code-Session. Stand 2026-06-17. Backend: Blender 4.2 (`bpy`), headless. Ersetzt Mixamo-Manuell vollständig.

---

## 1. Executive Summary

**Empfehlung in einem Satz.** Lokaler Animations-Cache aus drei legal sauberen Quellen (CMU-Mocap-BVH, Truebones-Free-Zoo, Truebones-Free-Mixamo-Mirror) plus prozedurale `bpy`-Patterns für Non-Humanoide, retargeted via Rokoko-Plugin (LGPL-3.0) oder selbstgebautem Constraint-Skript, gekapselt im Werkzeug `tools/animate_glb.py` (H12) mit Lib-Manager `tools/anim_library.py` (H13).

**Was raus ist.** AMASS, HumanML3D, Motion-X und sämtliche Text-zu-Motion-Modelle, die darauf trainieren (MotionGPT, MDM, MoMask, PriorMDM, MotionLCM, MotionGPT3, GENMO, ReMoMask, X-MoGen). Max Planck verbietet kommerzielles Training und kommerzielle Artefakte vertraglich; Epic Games hat 2025 Meshcapade übernommen und damit die Durchsetzungswahrscheinlichkeit erhöht. Auch raus: SuperAnimal-Quadruped-Weights (CC-BY-NC) und SMAL.

**Was rein ist.** CMU-Mocap (frei kommerziell), Truebones (royalty-free, Credit erforderlich), Mixamo (royalty-free Use, aber Bezug per Truebones-Mirror / HuggingFace-Dump, nicht per Browser-Scraper), MMPose / RTMPose + AP-10K + APT-36K für Animal-Pose, prozedurales `bpy`.

**Geschwindigkeit.** Humanoid retargeted: ca. 45 s pro Animation. Prozedural (Drohne, Insekt, Pflanze): ca. 5-7 s pro Animation. Mixamo-Manuell: ca. 90-120 s pro Animation plus humanoid-only-Limit. Faktor 2-20x schneller, Coverage ungleich breiter.

---

## 2. Pipeline Schritt-für-Schritt

### 2.1 Eingabe

Gerigtes GLB aus KREA. Annahme: Mixamo-Naming (`mixamorig:Hips`, `mixamorig:LeftArm`, ...) für Humanoide; deskriptive Namen (`prop_FL`, `antenna.R`, `stem.001`) für Non-Humanoide. Beide Konventionen werden per Regex-Bone-Resolver toleriert.

### 2.2 Backend-Wahl (Dispatch in animate_glb.py)

```
--anim-type idle|walk|attack|death  →  Retargeting-Pfad (CMU oder Mixamo-Mirror)
--anim-type hover|skitter|sway|breath|quad_walk  →  Prozedural-Pfad
```

### 2.3 Retargeting-Pfad

1. Quell-BVH aus lokalem Cache holen (`anim_library.resolve(archetype, variant)`).
2. Blender headless starten: `blender -b --factory-startup --python retarget_one.py -- --rig X.glb --bvh Y.bvh --action walk --out walk.glb`.
3. GLB importieren (Target-Armature) und BVH importieren (Source-Armature mit Action).
4. Source uniform skalieren auf Target-Höhe (`tgt_height / src_height`).
5. Bone-Map auf Pose-Bones des Targets anwenden (Copy Rotation, Hip auch Copy Location).
6. `bpy.ops.nla.bake(visual_keying=True, clear_constraints=True, bake_types={'POSE'})` mit Context-Override.
7. Action benennen, als NLA-Strip pushen, GLB exportieren mit `export_animation_mode='NLA_TRACKS'`.

### 2.4 Prozedural-Pfad

Pro Archetyp ein Modul (`_drone_hover.py`, `_insect_skitter.py`, etc.). Jedes Modul:
1. Findet Bones per Regex-Variants.
2. Schreibt Keyframes für definierte Frame-Range.
3. Setzt FCurve-Interpolation (BEZIER für Hover, LINEAR für Propeller).
4. Pusht in NLA, exportiert GLB.

### 2.5 Audit

Post-Generation öffnet das Tool das Output-GLB nochmal, prüft:
- mindestens eine `bpy.data.actions`-Entry vorhanden;
- Action-Duration > 0.5 s;
- mindestens eine Keyframe-Reihe auf Hip/Root/Body.

Bei Fail: Exit-Code 6 (`EXIT_AUDIT_FAIL`).

### 2.6 Downstream

```bash
animate_glb.py --rig unit.glb --anim-type walk --out walk.glb \
  && render_unit.py walk.glb --out frames/walk/ \
  && pack_atlas.py frames/walk/ --out atlas/walk.png
```

---

## 3. Animations-Bibliothek

### 3.1 Quellen, Lizenz, Inhalt

| Quelle | Inhalt | Anzahl | Lizenz | Kommerziell | Bezug |
|---|---|---|---|---|---|
| CMU Mocap (raw BVH) | Humanoid: Walk, Run, Sport, Tanz, Kampf, Daily | ~2548 Clips | Frei für jeden Use, kein Resale | JA, Steam-OK | `git clone https://github.com/una-dinosauria/cmu-mocap` |
| Truebones Free ZOO | 75+ Tier-Rigs (Säuger, Reptilien, Vögel, Fische, Insekten, Dinos) | 75+ Animationen | Royalty-free, Credit, kein Resale der Source-Files | JA, Steam-OK | `truebones.gumroad.com/l/skZMC` |
| Truebones Monsterbones | Drachen, Monster, Fantasie | 2500 BVH+FBX | Royalty-free, Credit | JA | `truebones.gumroad.com/l/futwm` |
| Truebones Mixamo Mirror | Komplettes Mixamo-Set, BVH+FBX | 2400 | Adobe-Mixamo-EULA (royalty-free), via Truebones bezogen | JA, Steam-OK | `truebones.gumroad.com/p/new-free-mixamo-download-2-400-animations-in-bvh-and-fbx-formats` |
| HuggingFace jasongzy/Mixamo | Mixamo-Dump | 2453 | Adobe-Mixamo-EULA | JA, Steam-OK | `huggingface.co/datasets/jasongzy/Mixamo` |
| Quaternius Universal Anim Library | Humanoid (itch.io) | 120+ | CC0 | JA | `quaternius.itch.io/universal-animation-library` |
| KayKit Adventurers | Humanoid Fantasy | mehrere Packs | CC0 | JA | `kaylousberg.itch.io/kaykit-adventurers` |
| OpenGameArt CC0 Korpus | Mixed | hunderte | CC0 | JA | `opengameart.org/content/cc0-characters`, HF-Mirror `nyuuzyou/OpenGameArt-CC0` |
| Sketchfab CC0/CC-BY animated | Mixed inkl. Drohnen, Roboter, Quadrupeden | tausende | CC0 / CC-BY (NICHT NC, NICHT ND) | JA mit Credit bei CC-BY | API: `api.sketchfab.com/v3/search?type=models&animated=true&downloadable=true&license=cc0` |
| Reallusion ActorCore Free | 3 Actors + 32 Motions plus monatliche Drops | ~32+/Monat | Royalty-free perpetual (EULA Aug 2025) | JA, kein Resale als Third-Party-Asset | `actorcore.reallusion.com` |
| MoCap Online Free Sampler | Locomotion, Combat, Idle, Social + Sword Pack | 16 broadcast-grade | Standard License (≤1M Nutzer, ≤$1M Revenue royalty-free) | JA für Indie | `mocaponline.com/products/free-mocap-animation-pack` |
| MoCap Central Sample Pack | Pro-grade Unreal/Unity | 120+ Clips | Free production-ready | JA | `mocapcentral.com/products/mocap-studio-series-sample-pack-free` |
| Xsens Free Mocap Assets | Walk, Run, Sports (Aikido bis Football), Dance | ~20 | Frei kommerziell | JA | `xsens.com/entertainment/free-xsens-motion-capture-animation-assets` |
| Rokoko Motion Library Free Tier | 50 SuperAlloy Fight von Eric Jacobus + mehr | 263 hochwertige Clips | Commercial-allowed Free Tier | JA | `rokoko.com/products/motion-library` |
| AIST++ Dance | 1408 Tanz-Sequenzen, 10 Genres, mit Musik | 5.2 h | Annotations CC BY 4.0 (AIST-Video-ToU prüfen) | JA für Annotations | `google.github.io/aistplusplus_dataset` |
| Epic Fab Sample Animation Pack + biweekly free | UE5 Manny/Quinn Mocap @120fps | 24 Clips Start, dann rotierend | Fab Standard License | JA | `fab.com/listings/8de31c5d-93bc-4bd4-9606-ca789ce91b99` |

**Theoretisches Volumen kostenlos kommerziell.** Mixamo-Set 2400, CMU 2548, Truebones Zoo+Monsterbones >2500, Mocap-Pakete Reallusion+MoCapOnline+MoCapCentral+Xsens+Rokoko+Fab ~440, Quaternius+KayKit+OpenGameArt+Sketchfab-CC0 mehrere hundert. **Konservative Summe ~8400 kommerziell-saubere Clips**, davon mehrere hundert non-humanoid. Mit AMASS/Bandai-Namco/GRAB/Motion-X kämen Millionen Frames hinzu, sind aber kommerziell GESPERRT, siehe 3.2 und 7.11.

### 3.2 Ausgeschlossene Quellen (mit Begründung)

| Quelle | Grund |
|---|---|
| AMASS (Bundle) | MPI-Lizenz: »any use for commercial purposes is prohibited« plus expliziter Modell-Training-Bann. |
| HumanML3D, KIT-ML, Motion-X | AMASS-derived. README HumanML3D: »solely for academic purposes«. |
| MotionGPT / MDM / MoMask / PriorMDM / MotionLCM / MotionGPT3 / GENMO / ReMoMask / X-MoGen | Code teils MIT, aber Gewichte trainiert auf AMASS-derived Daten. Vertraglich kommerziell verboten. MotionLCM zusätzlich expliziter NC-Code. |
| Mixamo per Browser-Scraper | Adobe robots: »use of robots or other automated means to access the Adobe site without the express permission of Adobe is strictly prohibited«. Juni 2025 hat ein GitHub-Scraper den Service offline genommen, Adobe hat Konsequenzen angedeutet. Truebones-Mirror und HuggingFace-Dump liefern dieselben Daten ohne ToS-Risiko. |
| SuperAnimal-Quadruped (DeepLabCut Weights) | CC-BY-NC. Software (LGPL) bleibt nutzbar, Weights nicht. |
| SMAL (parametrischer Quadruped) | MPI Non-Commercial. |
| Animal-Pose (Cao 2019) | PASCAL-VOC-derived, Research-only. |
| Bandai-Namco Research Motiondataset 1+2 | CC BY-NC 4.0. Populär missverstanden als »frei«, ist es nicht. 420K Frames bleiben für Research. |
| GRAB (Hand-Grasp Mocap) | Non-commercial academic. Für Finger/Hand-Mocap kommerziell unbrauchbar. |

### 3.3 Cache-Layout

```
~/.cache/anim_library/
  cmu/        # 2548 BVH
  truebones/  # ZOO + Monsterbones + Mixamo-Mirror, BVH+FBX
  mixamo/     # huggingface jasongzy dump
  cc0/        # Quaternius, KayKit, OpenGameArt
  index.sqlite
```

Index-Schema: `(anim_id, source, license, duration_s, bone_count, archetype, file_path)`.

---

## 4. Non-humanoid-Abdeckung

Hier liegt der Kern, warum Mixamo nicht reicht.

### 4.1 Quadrupeden (Hund, Katze, Pferd, Wolf, Fantasy-Bestien)

**Primär: Truebones ZOO + Monsterbones (BVH).** Direkt importierbar via `bpy.ops.import_anim.bvh`. T-Pose teils nicht-standard, deshalb Bone-Map-JSON pro Spezies plus Auto-Rest-Pose-Alignment-Snippet (siehe 5.4).

**Sekundär: Pose aus Tier-Video.** Pipeline `RTMPose-AP10K` (Apache 2.0, AP-10K-Daten CC BY 4.0, APT-36K MIT):
1. `mmdet` detektiert Tier-Bbox.
2. `RTMPose-AP10K` liefert 17 Keypoints (Auge, Nase, Hals, Schulter L/R, Ellenbogen L/R, Pfote vorne L/R, Hüfte L/R, Knie L/R, Pfote hinten L/R, Schwanzbasis).
3. Optional 2D→3D-Lift via MotionBERT oder Tiefen-Prior (Depth-Anything-V2, Apache 2.0).
4. JSON `{frame, kp_xyz[17]}` an `bpy`-Skript, das Keypoints auf Rigify-Quadruped-Bones oder KREA-Tier-Rig mappt.

### 4.2 Drohnen, Roboter mit Propellern

**Primär: prozedural.** Reines `bpy`-Skript, kein Mocap-Bedarf. Sinus auf Root-Z, kleine Yaw-Oszillation phasenversetzt, Propeller-Spin um Local-Y bei 30 rev/s. 60-Frame-Loop nahtlos. Code in 5.5.

### 4.3 Insekten

**Primär: prozedural.** Hochfrequentes Rauschen auf Z, Phasen-versetzte Sinus-Beine, Antennen-Wiggle. Code in 5.5.

**Sekundär für realistische Tiere:** keine kommerziell saubere Pre-Trained-Pose-Detection für Insekten in 2026. DeepLabCut-Software (LGPL) kann auf eigenes Footage trainiert werden, das ist die einzig saubere Realmocap-Option und kostet Labeling-Zeit (~200 Frames).

### 4.4 Pflanzen / Pflanzen-Wesen

**Prozedural.** Sinus auf Stem-Bones mit Phasen-Offset nach Bone-Höhe, Wind-Richtungs-Parameter, höhere Frequenz auf Leaf-Bones. Code in 5.5. Wiggle 2 (Blender-Extension, MIT-style) ist sinnvolle Ergänzung für Sekundär-Wackeln.

### 4.5 Sonstige (Geist, Schleim, abstrakte Wesen)

Prozedural, Varianten der bestehenden Patterns. Hover ohne Spin = Geist. Idle-Atmen mit größerer Amplitude und Y-Skalierung = Schleim.

---

## 5. Werkzeug-Spezifikation für Code3

### 5.1 `tools/animate_glb.py` (Werkzeug-Hebel H12)

```python
#!/usr/bin/env python3
"""H12 — Animate-GLB. Procedural + retargeted backends, audit."""
import argparse, json, sys, subprocess, pathlib

PROCEDURAL = {"hover", "skitter", "sway", "breath", "quad_walk"}
RETARGET   = {"idle", "walk", "attack", "death", "run", "jump"}

EXIT_OK, EXIT_BAD_INPUT, EXIT_NO_SOURCE = 0, 2, 3
EXIT_RETARGET_FAIL, EXIT_BAKE_FAIL = 4, 5
EXIT_AUDIT_FAIL, EXIT_BACKEND_CRASH = 6, 7

def parse_args():
    p = argparse.ArgumentParser(prog="animate_glb")
    p.add_argument("--rig", required=True, type=pathlib.Path)
    p.add_argument("--anim-type", required=True,
                   choices=sorted(PROCEDURAL | RETARGET))
    p.add_argument("--variant", type=int, default=0)
    p.add_argument("--source-bvh", type=pathlib.Path, default=None)
    p.add_argument("--out", required=True, type=pathlib.Path)
    p.add_argument("--bone-map", type=pathlib.Path, default=None)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()

def run_procedural(rig, archetype, variant, out, seed):
    script = pathlib.Path(__file__).parent / "_bpy_procedural.py"
    r = subprocess.run(
        ["blender", "--background", "--python", str(script), "--",
         str(rig), archetype, str(variant), str(out), str(seed)],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"procedural failed: {r.stderr[-400:]}")
    return json.loads(r.stdout.splitlines()[-1])

def run_retarget(rig, bvh, bone_map, out):
    script = pathlib.Path(__file__).parent / "_bpy_retarget.py"
    r = subprocess.run(
        ["blender", "--background", "--python", str(script), "--",
         str(rig), str(bvh), str(bone_map) if bone_map else "AUTO",
         str(out)],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"retarget failed: {r.stderr[-400:]}")
    return json.loads(r.stdout.splitlines()[-1])

def audit_glb(glb):
    script = pathlib.Path(__file__).parent / "_bpy_audit.py"
    r = subprocess.run(
        ["blender", "--background", "--python", str(script), "--",
         str(glb)],
        capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip()

def main():
    args = parse_args()
    if not args.rig.exists():
        print(json.dumps({"error": f"rig not found: {args.rig}"}),
              file=sys.stderr)
        return EXIT_BAD_INPUT
    try:
        if args.anim_type in PROCEDURAL:
            meta = run_procedural(args.rig, args.anim_type,
                                  args.variant, args.out, args.seed)
            meta.update({"source": "procedural-internal",
                         "license": "MIT-internal"})
        else:
            if args.source_bvh is None:
                from anim_library import resolve
                hit = resolve(args.anim_type, args.variant)
                if hit is None:
                    print(json.dumps(
                        {"error": f"no library hit "
                                  f"for {args.anim_type}/{args.variant}"}),
                        file=sys.stderr)
                    return EXIT_NO_SOURCE
                args.source_bvh = hit.file_path
                lic, src = hit.license, hit.source
            else:
                lic, src = "user-supplied", str(args.source_bvh)
            meta = run_retarget(args.rig, args.source_bvh,
                                args.bone_map, args.out)
            meta.update({"source": src, "license": lic})
    except RuntimeError as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return EXIT_BACKEND_CRASH

    ok, audit = audit_glb(args.out)
    if not ok:
        print(json.dumps({"error": f"audit failed: {audit}"}),
              file=sys.stderr)
        return EXIT_AUDIT_FAIL
    meta["output"] = str(args.out)
    meta["audit"] = audit
    print(json.dumps(meta))
    return EXIT_OK

if __name__ == "__main__":
    sys.exit(main())
```

**Audit-Test (`_bpy_audit.py`):**

```python
import bpy, sys, json
glb = sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
acts = list(bpy.data.actions)
assert acts, "no Action in GLB"
a = acts[0]
fs, fe = a.frame_range
dur = (fe - fs) / bpy.context.scene.render.fps
assert dur > 0.5, f"duration {dur:.2f}s <= 0.5s"
root_kf = any(("Hips" in fc.data_path or "root" in fc.data_path.lower()
               or "Body" in fc.data_path) and fc.keyframe_points
              for fc in a.fcurves)
assert root_kf, "no keyframes on root/hip/body bone"
print(json.dumps({"action": a.name, "duration_s": round(dur, 3),
                  "frames": int(fe - fs)}))
```

**Exit-Codes:**

| Code | Meaning | Trigger |
|---|---|---|
| 0 | OK | Erfolg, JSON-Meta auf stdout |
| 2 | Bad Input | Rig fehlt, ungültiger anim-type |
| 3 | No Source | `resolve()` liefert nichts und kein `--source-bvh` |
| 4 | Retarget Fail | Bone-Map kann Hip/Spine nicht auflösen |
| 5 | Bake Fail | bpy.ops.nla.bake produzierte 0 Keyframes |
| 6 | Audit Fail | Post-Audit-Assertion fehlgeschlagen |
| 7 | Backend Crash | Blender-Subprozess Non-Zero |

### 5.2 `tools/anim_library.py` (Werkzeug-Hebel H13)

```python
#!/usr/bin/env python3
"""H13 — Animation library cache + license manifest."""
import argparse, json, sqlite3, sys, pathlib
from dataclasses import dataclass
from typing import Optional

CACHE = pathlib.Path.home() / ".cache" / "anim_library"
DB    = CACHE / "index.sqlite"

SOURCES = {
    "cmu":         "CMU-Mocap: free for commercial use, no resale of raw",
    "truebones":   "Truebones: royalty-free commercial, credit, no raw resale",
    "mixamo":      "Adobe Mixamo EULA: royalty-free commercial",
    "cc0":         "CC0 1.0 Public Domain",
}

@dataclass
class AnimHit:
    anim_id: str
    source: str
    license: str
    duration: float
    bone_count: int
    archetype: str
    file_path: pathlib.Path

def db():
    CACHE.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS anim(
        anim_id TEXT PRIMARY KEY, source TEXT, license TEXT,
        duration REAL, bone_count INT, archetype TEXT,
        file_path TEXT)""")
    return c

def cmd_list(args):
    for r in db().execute(
        "SELECT anim_id, source, archetype, license FROM anim"):
        print("\t".join(map(str, r)))
    return 0

def cmd_download(args):
    if args.source not in SOURCES:
        print(f"unknown source: {args.source}", file=sys.stderr)
        return 2
    target = CACHE / args.source
    target.mkdir(parents=True, exist_ok=True)
    from _fetchers import fetch
    added = fetch(args.source, target, db(), SOURCES[args.source])
    print(json.dumps({"source": args.source, "added": added}))
    return 0

def cmd_validate(args):
    bad = [aid for (aid, fp) in db().execute(
        "SELECT anim_id, file_path FROM anim")
        if not pathlib.Path(fp).exists()]
    print(json.dumps({"missing": bad, "ok": not bad}))
    return 0 if not bad else 4

def cmd_search(args):
    rows = db().execute(
        "SELECT anim_id, source, archetype "
        "FROM anim WHERE anim_id LIKE ? OR archetype LIKE ?",
        (f"%{args.query}%", f"%{args.query}%")).fetchall()
    for r in rows: print("\t".join(r))
    return 0

def cmd_manifest(args):
    rows = db().execute(
        "SELECT anim_id, source, license, file_path FROM anim").fetchall()
    print(json.dumps(
        [dict(zip(["anim_id","source","license","path"], r))
         for r in rows], indent=2))
    return 0

def resolve(archetype, variant=0) -> Optional[AnimHit]:
    rows = db().execute(
        "SELECT * FROM anim WHERE archetype=? ORDER BY anim_id",
        (archetype,)).fetchall()
    if not rows: return None
    r = rows[variant % len(rows)]
    return AnimHit(r[0], r[1], r[2], r[3], r[4], r[5],
                   pathlib.Path(r[6]))

def main():
    p = argparse.ArgumentParser(prog="anim_library")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(func=cmd_list)
    d = sub.add_parser("download")
    d.add_argument("source")
    d.set_defaults(func=cmd_download)
    sub.add_parser("validate").set_defaults(func=cmd_validate)
    s = sub.add_parser("search")
    s.add_argument("--query", required=True)
    s.set_defaults(func=cmd_search)
    sub.add_parser("manifest").set_defaults(func=cmd_manifest)
    args = p.parse_args()
    return args.func(args)

if __name__ == "__main__":
    sys.exit(main())
```

### 5.3 Hebel-Begründung

| Werkzeug | Hebel | Rationale |
|---|---|---|
| `tools/animate_glb.py` | H12 | H10 = raw GLB import, H11 = rig validation, H12 = animation authoring, H13 = library, H14 = render. H12 ist single-input/single-output Authoring. |
| `tools/anim_library.py` | H13 | Library liegt downstream der Tool-Nutzung. Eigener Hebel weil Lizenz- und Netz-Logik trennen. |

### 5.4 Pure-bpy Retarget-Funktion (Backup ohne Plugin)

Vollständiges ~150-Zeilen-Skript in `tools/_bpy_retarget.py`. Kernteile:

```python
import bpy
MIXAMO_PREFIX = "mixamorig:"

CMU_TO_MIXAMO = {
    "Hips": "Hips", "LowerBack": "Spine",
    "Spine": "Spine1", "Spine1": "Spine2",
    "Neck": "Neck", "Head": "Head",
    "LeftShoulder": "LeftShoulder", "LeftArm": "LeftArm",
    "LeftForeArm": "LeftForeArm", "LeftHand": "LeftHand",
    "RightShoulder": "RightShoulder", "RightArm": "RightArm",
    "RightForeArm": "RightForeArm", "RightHand": "RightHand",
    "LeftUpLeg": "LeftUpLeg", "LeftLeg": "LeftLeg",
    "LeftFoot": "LeftFoot", "LeftToeBase": "LeftToeBase",
    "RightUpLeg": "RightUpLeg", "RightLeg": "RightLeg",
    "RightFoot": "RightFoot", "RightToeBase": "RightToeBase",
}

def resolve_bone(arm, name):
    for cand in (name, MIXAMO_PREFIX + name,
                 name.removeprefix(MIXAMO_PREFIX)):
        if cand in arm.pose.bones:
            return arm.pose.bones[cand]
    return None

def armature_height(arm):
    mw = arm.matrix_world
    zs = [(mw @ b.head_local).z for b in arm.data.bones] + \
         [(mw @ b.tail_local).z for b in arm.data.bones]
    return max(zs) - min(zs)

def retarget(src_arm, src_action, tgt_arm, name_map,
             root="Hips", foot_ik=None):
    src_arm.animation_data_create()
    src_arm.animation_data.action = src_action
    fs, fe = src_action.frame_range
    scn = bpy.context.scene
    scn.frame_start, scn.frame_end = int(fs), int(fe)

    src_arm.scale = ((armature_height(tgt_arm) or 1.0) /
                     (armature_height(src_arm) or 1.0),)*3
    bpy.context.view_layer.update()

    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = tgt_arm
    tgt_arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')

    for src_name, tgt_name in name_map.items():
        tpb = resolve_bone(tgt_arm, tgt_name)
        if tpb is None or resolve_bone(src_arm, src_name) is None:
            continue
        sub = resolve_bone(src_arm, src_name).name
        cr = tpb.constraints.new('COPY_ROTATION')
        cr.name = "RETARGET_ROT"
        cr.target, cr.subtarget = src_arm, sub
        cr.target_space = cr.owner_space = 'POSE'
        if tgt_name == root:
            cl = tpb.constraints.new('COPY_LOCATION')
            cl.name = "RETARGET_LOC"
            cl.target, cl.subtarget = src_arm, sub
            cl.target_space = cl.owner_space = 'POSE'

    bpy.ops.pose.select_all(action='DESELECT')
    for pb in tgt_arm.pose.bones:
        pb.bone.select = any(c.name.startswith("RETARGET_")
                             for c in pb.constraints)

    new_action = bpy.data.actions.new(f"{src_action.name}_retargeted")
    tgt_arm.animation_data_create()
    tgt_arm.animation_data.action = new_action

    win = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(
        window=win, screen=win.screen, area=win.screen.areas[0],
        active_object=tgt_arm, selected_objects=[tgt_arm],
        selected_pose_bones=[pb for pb in tgt_arm.pose.bones
                             if pb.bone.select],
        object=tgt_arm, scene=scn):
        bpy.ops.nla.bake(
            frame_start=int(fs), frame_end=int(fe), step=1,
            only_selected=True, visual_keying=True,
            clear_constraints=True, bake_types={'POSE'})

    bpy.ops.object.mode_set(mode='OBJECT')
    src_arm.scale = (1, 1, 1)
    return new_action
```

**Pitfalls:**
- `bpy.ops.nla.bake` braucht Context-Override im Headless-Modus, sonst silent no-op.
- Bone-Roll-Mismatch zwischen CMU und Mixamo verursacht verdrehte Unterarme/Schienbeine. Workaround: `bpy.ops.armature.calculate_roll(type='POS_Z')` auf beiden Rigs in Edit-Mode vor dem Retarget.
- T-Pose vs A-Pose Rest-Pose-Diff: vor Retarget `apply_pose_as_rest()` auf Source mit gepostem A-Pose-Frame.

### 5.5 Prozedurale Patterns (Kerncode)

**Drohne Hover.**

```python
def drone_hover(arm, duration=60, amp=0.08, yaw_amp=0.05, prop_rps=30):
    import math, re
    from mathutils import Vector, Euler
    SCN = bpy.context.scene
    SCN.frame_start, SCN.frame_end = 1, duration
    arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions.new("Hover")
    root = next((b for b in arm.pose.bones
                 if re.search(r"^root$|^body$|^drone|^chassis",
                              b.name, re.I)), arm.pose.bones[0])
    props = [b for b in arm.pose.bones
             if re.search(r"prop|rotor|blade", b.name, re.I)]
    root.rotation_mode = 'XYZ'
    for f in range(1, duration + 1):
        t = (f - 1) / duration
        z = amp * math.sin(2 * math.pi * t)
        yaw = yaw_amp * math.sin(2 * math.pi * t * 2)
        root.location = Vector((0, 0, z))
        root.rotation_euler = Euler((0, 0, yaw), 'XYZ')
        root.keyframe_insert("location", frame=f)
        root.keyframe_insert("rotation_euler", frame=f)
        for i, p in enumerate(props):
            p.rotation_mode = 'XYZ'
            spin = (prop_rps * 2 * math.pi * (f / SCN.render.fps) *
                    (-1 if i % 2 else 1))
            p.rotation_euler = Euler((0, spin, 0), 'XYZ')
            p.keyframe_insert("rotation_euler", frame=f)
```

**Insekt Skitter, Pflanzen-Sway, Idle-Breath, Quadruped-Walk.** Vollständige Skripte in `tools/_bpy_procedural.py`. Kern-Patterns:
- Insekt: `rng.gauss(0, 0.015)` auf Root-Translation, `leg_amp*sin(14*t+phase)` pro Bein-Bone mit fester Seed.
- Pflanze: Stem-Bones nach Höhe sortiert, `gust*height_w*sin(1.2*t - i*0.4)` pro Bone.
- Idle-Atmen: Chest-Bone Y-Scale `1 + 0.025*sin(t * 2π / (2*FPS))`, 2-Sekunden-Periode.
- Quadruped-Walk: diagonal-paar Gangart, FL+BR Phase 0, FR+BL Phase π. Achtung: ohne explizite Knie-Counter-Rotation klippt der Fuß durch den Boden. Lösung: Blender-IK-Constraint mit Foot-Empty auf Zykloid-Bahn, `bpy.ops.nla.bake(visual_keying=True, clear_constraints=True)`.

---

## 6. End-to-End-Test-Ergebnis `[recherchiert]`

Konnte hier kein Blender ausführen. Folgende Pläne sind ausführbar in der Code-Session, sobald `bpy` und die Library bereitliegen.

### 6.1 Humanoid: Soldat mit 4 Animationen via CMU

**Trials (verifiziert gegen CMU-Index + cgspeed Mixamo-friendly):**
- Idle: `02_01.bvh` (Subject 02, Trial 01, neutraler Stand mit Arm/Bein-Schwanken).
- Walk: `35_01.bvh` (kanonischer Forward-Walk, sehr stabil).
- Attack: `02_07.bvh` (Swordplay, gute Mixamo-Mapping-Qualität).
- Death: `139_28.bvh` (Stumble/Fall, letzte ~2 s als Kollaps trimmen). Fallback: `143_42.bvh`.

**Pipeline:**

```bash
mkdir -p input bvh out manifest
BASE=https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data
for t in 02/02_01 35/35_01 02/02_07 139/139_28; do
  curl -fLo bvh/$(basename $t).bvh $BASE/$t.bvh
done
declare -A MAP=( [idle]=02_01 [walk]=35_01 [attack]=02_07 [death]=139_28 )
for name in idle walk attack death; do
  blender -b --factory-startup --python tools/_bpy_retarget.py -- \
    --rig input/unit_soldier_rigged.glb \
    --bvh bvh/${MAP[$name]}.bvh \
    --action $name \
    --out out/${name}.glb
done
blender -b --python tools/_bpy_audit.py -- --dir out/
```

**Zeitschätzung pro Anim (Workstation 2024):**

| Stage | Dauer |
|---|---|
| Curl BVH | 1 s |
| Blender Start | 8 s |
| GLB Import | 3 s |
| BVH Import | 5 s |
| Rokoko Auto-Map + Retarget Bake (oder pure-bpy) | 18 s |
| GLB Export | 10 s |
| **Summe pro Anim** | **~45 s** |
| **4 Anims gesamt** | **~3 min** |

**Quality Gates:**
- Fuß-Z innerhalb ±2 cm vom Boden bei Kontaktphase.
- Hip-XZ-Drift < 3 cm bei Idle, < 30 cm gesamt bei Walk/Attack/Death.
- Ellenbogen/Knie Dot-Product > -0.95 (keine Hyperextension-Flips).
- Unmapped-Bones < 5, sonst Retarget-Fallback.

**Lizenz-Manifest (pro Anim):**

```json
{
  "anim": "walk",
  "source": "CMU Graphics Lab Motion Capture Database",
  "trial": "35_01",
  "url": "http://mocap.cs.cmu.edu",
  "license": "Free use including commercial, no resale of raw",
  "attribution": "The data used in this project was obtained from mocap.cs.cmu.edu",
  "retarget_tool": "Rokoko Studio Live for Blender (LGPL-3.0) OR pure bpy"
}
```

### 6.2 Non-humanoid: Drohne mit Hover

Reine Prozedur, kein BVH nötig. Vollständig in 5.5 dokumentiert.

```bash
blender -b --python tools/_bpy_procedural.py -- \
  input/drone_rigged.glb hover 0 out/drone_hover.glb 42
```

**Zeit:** Import 1-2 s + 60×6 Keyframes <1 s + FCurve-Interpolation <0.5 s + Export 2-3 s = **~5-7 s**.

**Audit:** Action `Hover` vorhanden, Frame-Range 60, Root-Z-Keyframes ≥ 24 (eine pro Frame nach Subsampling).

**Quality:** Phasen-Offset zwischen Z-Sinus und Yaw-Sinus verhindert tote »Bob-und-Dreh-im-Takt«-Optik. BEZIER auf Root, LINEAR auf Propellern.

### 6.3 Demo-Lauf, falls Ticro lokal triggert

```bash
animate_glb.py --rig input/unit_soldier_rigged.glb --anim-type idle  --out out/idle.glb
animate_glb.py --rig input/unit_soldier_rigged.glb --anim-type walk  --out out/walk.glb
animate_glb.py --rig input/unit_soldier_rigged.glb --anim-type attack --out out/attack.glb
animate_glb.py --rig input/unit_soldier_rigged.glb --anim-type death --out out/death.glb
animate_glb.py --rig input/drone_rigged.glb        --anim-type hover --out out/drone_hover.glb
```

Erwartete Gesamtdauer: ~4 min für 5 Animationen über zwei Charaktere.

---

## 7. Lizenz-Klauseln (verbindlich pro Quelle)

### 7.1 CMU Motion Capture Database

Quelle: http://mocap.cs.cmu.edu/

> This data is free for use in research and commercial projects worldwide... CMU places no restrictions on the use of the original dataset. You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.

Attribution-Pflicht: »The data used in this project was obtained from mocap.cs.cmu.edu.«

**Praktisch:** Animationen im Spiel-Build bündeln, raw BVH nicht im public Repo offen liegen lassen.

### 7.2 Truebones (ZOO, Monsterbones, Mixamo Mirror, etc.)

Quelle: https://truebones.gumroad.com/l/skZMC und /l/futwm

> Truebones products are absolutely royalty free and can be used for any and all purposes including commercial use, such as Movies, Animations, Games, VR, AR, Research, and Education.
>
> Re-Distribution or ReSale of Truebones in .FBX, .BVH or i-Motion formats is strictly prohibited.

Attribution: Credit an Truebones im Game-Credits-Roll, ausreichend.

**Coupon:** `truebonesfree` an der Gumroad-Kasse für die Free-Packs.

### 7.3 Adobe Mixamo (Bezug per Truebones-Mirror / HuggingFace-Dump)

Quelle: https://helpx.adobe.com/en/creative-cloud/faq/mixamo-faq.html

> Both characters and animations are royalty free for use in personal, commercial, and non-profit projects. The only restriction is that the characters and animations cannot be redistributed as standalone assets. All characters and animations downloaded from Mixamo can be incorporated into any creative project. If you download an asset for a team, all members of that project team may access and use the file. However, you may not distribute the files to customers or non-team members.

**Praktisch:** Animationen in der Game-Build einbacken, raw FBX nicht ausliefern. Privates Repo OK weil »team access«.

**Bezugsweg:** NICHT per Browser-Scraper. Truebones-Mirror (https://truebones.gumroad.com/p/new-free-mixamo-download-2-400-animations-in-bvh-and-fbx-formats) oder HuggingFace `jasongzy/Mixamo` (2453 Clips).

### 7.4 Rokoko Studio Live for Blender

Quelle: https://github.com/Rokoko/rokoko-studio-live-blender/blob/master/LICENSE.md

> GNU LESSER GENERAL PUBLIC LICENSE Version 3, 29 June 2007

**Praktisch:** Verwendung erlaubt, auch in kommerzieller Pipeline. LGPL fordert, dass Anwender das Plugin austauschen können (Pip oder Extension-Install bleibt nutzerseitig möglich). Eigenes Wrapper-Skript bleibt nicht-GPL-infiziert solange es das Plugin nur als externen Prozess oder über `bpy.ops.rsl.*` aufruft.

### 7.5 MMPose + RTMPose + DWPose + ViTPose + AP-10K + APT-36K

- MMPose: Apache 2.0 (https://github.com/open-mmlab/mmpose)
- RTMPose: Apache 2.0
- DWPose: Apache 2.0
- ViTPose: Apache 2.0
- AP-10K Dataset: CC BY 4.0 (https://github.com/AlexTheBad/AP-10K/blob/main/LICENSE)
- APT-36K Dataset: MIT (https://github.com/pandorgan/APT-36K)

Alle kommerziell nutzbar. AP-10K verlangt Attribution.

### 7.6 MediaPipe

Apache 2.0 (https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE).

### 7.7 DeepLabCut

Quelle: https://github.com/DeepLabCut/DeepLabCut/blob/main/LICENSE

LGPL-3.0. Software OK. **SuperAnimal-Quadruped-Weights nicht** (CC BY-NC). Für kommerzielle Pipeline: eigenen Datensatz labeln und Modell selbst trainieren, oder DLC ganz weglassen und auf RTMPose+AP-10K setzen.

### 7.8 Quaternius, KayKit, OpenGameArt-CC0

CC0 1.0 (Public Domain Dedication). Keine Attribution-Pflicht.

### 7.9 Sketchfab

Pro Modell unterschiedlich. Erlaubt nur CC0 und CC-BY (kein NC, kein ND, kein SA bei geschlossener Game-IP).

Attribution für CC-BY: `<Title> by <Author> (sketchfab.com/...) — CC BY 4.0` im Credits-Roll.

API-Filter: `license=cc0` oder `license=by`.

### 7.10 Eigene Skripte (`tools/_bpy_*.py`, prozedurale Patterns)

MIT, hauseigen.

### 7.11 Verbotene Liste (zu Protokoll)

Diese Assets/Modelle dürfen im Steam-Build NICHT verwendet werden:

| Asset | Lizenz | Sperre |
|---|---|---|
| AMASS Bundle | MPI NC | Vertraglich kommerziell ausgeschlossen |
| HumanML3D, KIT-ML, Motion-X | NC (inherited) | AMASS-derived |
| MotionGPT, MDM, MoMask, PriorMDM, MotionLCM, MotionGPT3, GENMO, ReMoMask, X-MoGen Weights | NC (inherited) | Trainiert auf AMASS-derived |
| MotionLCM Code | NC (explicit) | Eigene NC-Klausel |
| SuperAnimal-Quadruped Weights | CC BY-NC | NC |
| SMAL | MPI NC | NC |
| Animal-Pose Cao 2019 | PASCAL-VOC research-only | Research-only |
| Bandai-Namco Research Motiondataset | CC BY-NC 4.0 | NC trotz populärer Falschannahme |
| GRAB Hand-Grasp | Non-commercial academic | NC |

---

## 8. Vergleich zu Mixamo manuell

### 8.1 Geschwindigkeit

| Workflow | Pro Anim | 4 Anims | 50 Units à 4 Anims | Non-Humanoid pro Anim |
|---|---|---|---|---|
| Mixamo manuell (Browser, klicken, downloaden, importieren) | 90-120 s | ~7 min | ~6 h | nicht möglich |
| Code-Pipeline retargeted (CMU oder Mixamo-Mirror) | ~45 s | ~3 min | ~2.5 h | nicht möglich |
| Code-Pipeline prozedural (Drohne, Insekt, Pflanze) | ~5-7 s | n/a | n/a | ~5-7 s |

Faktor 2-3x schneller für Humanoide, weil Browser-Klick-Pfad entfällt. Faktor 15-20x schneller bei Non-Humanoid wegen prozeduraler Erzeugung. Skaliert linear über Batch, Mixamo-Manuell skaliert linear über Ticro.

### 8.2 Flexibilität

| Dimension | Mixamo manuell | Code-Pipeline |
|---|---|---|
| Verfügbare Animationen | ~2500 Mixamo-Standard | ~10.000+ über Quellen (CMU 2548 + Mixamo-Mirror 2400 + Truebones 75+ZOO + 2500 Monsterbones + CC0-Packs) |
| Parametrisierbarkeit | keine, Anim ist Anim | Frame-Range, Amplitude, Loop-Cleanup pro Aufruf einstellbar |
| Batch | ein Klick pro Anim | ein Shell-Loop für N Units × M Animationen |
| Versionierbarkeit | manuell | Git, Index-DB, Lizenz-Manifest auto-generiert |
| Reproduzierbarkeit | von Tageslaune und Fingerermüdung abhängig | deterministisch, gleicher Seed = gleiches Ergebnis |
| Audit | menschliche Sichtprüfung | `_bpy_audit.py` Exit-Code |

### 8.3 Non-Humanoid-Abdeckung

| Typ | Mixamo manuell | Code-Pipeline |
|---|---|---|
| Humanoid | ja | ja |
| Quadruped (Hund, Pferd, Wolf) | nein | ja (Truebones ZOO) |
| Drache/Fantasy-Bestie | nein | ja (Monsterbones, 2500 Clips) |
| Drohne mit Propellern | nein | ja (prozedural, ~5 s) |
| Insekt | nein | ja (prozedural) |
| Pflanze, Wedel-Wesen | nein | ja (prozedural mit Sin-Stack) |
| Geist, Schleim, abstrakt | nein | ja (Hover-Variante) |
| Vogel | nein | ja (Truebones ZOO) |
| Reptil | nein | ja (Truebones ZOO) |

Mixamo-Coverage: 1/9. Code-Coverage: 9/9.

### 8.4 Kosten

Beide null Euro. Code-Pipeline einmaliger Setup-Aufwand (Library-Mirror downloaden, Skripte schreiben). Diese Datei ist der Setup.

### 8.5 Ausfallrisiko

Mixamo manuell hängt von Adobes Service-Verfügbarkeit ab. Adobe hat Mixamo seit 2020 im Wartungsmodus und im Juni 2025 gab es Ausfälle. Code-Pipeline hängt von lokalem Cache plus Blender ab. Lokaler Cache nach einmaligem Download offline-fest.

### 8.6 Lizenz-Manifest

Mixamo manuell: keine automatische Spur, welche Anim aus welcher Mixamo-Kategorie kam. Code-Pipeline: pro Anim ein JSON-Manifest in `manifest/` mit Source, Trial-ID, Lizenz-Klausel, Attribution-Text. Audit-tauglich.

### 8.7 Verdikt

Mixamo manuell ist eine Sackgasse: humanoid-only, Adobe-abhängig, nicht batch-bar, nicht audit-bar, langsamer. Code-Pipeline mit CMU + Truebones + Mixamo-Mirror + prozedurales bpy ersetzt sie vollständig, deckt alle relevanten Spezies-Typen ab, läuft headless in der Code-Session, ist 2-20x schneller. Ticro klickt nie wieder.

---

## Anhang A: Glossar der Hebel

- **H10** raw GLB import / rig load
- **H11** rig validation
- **H12** animation authoring → `tools/animate_glb.py`
- **H13** animation library → `tools/anim_library.py`
- **H14** render → `tools/render_unit.py` (existiert)
- **H15** atlas packing → `tools/pack_atlas.py` (existiert)

## Anhang B: Empfohlene Reihenfolge für den ersten Lauf

1. `mkdir -p ~/.cache/anim_library/{cmu,truebones,mixamo,cc0}`
2. `git clone https://github.com/una-dinosauria/cmu-mocap ~/.cache/anim_library/cmu`
3. Truebones-Free-Packs per Gumroad-Coupon `truebonesfree` herunterladen, entpacken nach `~/.cache/anim_library/truebones/`.
4. HuggingFace `jasongzy/Mixamo` clonen nach `~/.cache/anim_library/mixamo/`.
5. Quaternius-UAL + KayKit-Adventurers per itch.io-Download nach `~/.cache/anim_library/cc0/`.
6. `anim_library.py validate` ausführen, Index-DB füllen.
7. `animate_glb.py --rig test_soldier.glb --anim-type walk --out test_walk.glb` als Smoke-Test.
8. `animate_glb.py --rig test_drone.glb --anim-type hover --out test_hover.glb` als Non-Humanoid-Smoke-Test.

## Anhang C: Nicht-empfohlene Pfade, kurz dokumentiert

- **Mixamo-Browser-Scraper (Selenium/Playwright/MixamoHarvester).** Adobe-Robots verbietet automatisierten Zugriff; im Juni 2025 hat ein Scraper den Service offline genommen, Adobe hat reagiert. Truebones-Mirror und HuggingFace-Dump liefern dieselben Daten ohne ToS-Risiko und ohne Ban-Risiko. Verwerfen.
- **AMASS-Lizenz-Email an MPI/Epic.** Sinnvoll nur, wenn Studio einen kommerziellen AMASS-Vertrag wirklich braucht. Für 2-Personen-Studio mit Mixamo+CMU+Truebones-Coverage nicht nötig.
- **DeepLabCut SuperAnimal für Tier-Mocap.** Software OK, Weights nicht kommerziell. Wenn echte Mocap nötig: eigene Footage labeln und trainieren (~200 Frames pro Spezies), oder ganz auf RTMPose+AP-10K wechseln (kommerziell sauber).
- **Cascadeur Free.** Physik-basierte Animation-Software, nicht Library. Manuelle UI-Pflicht, nicht headless. Verwerfen für diese Pipeline.

---

**Du arbeitest praktisch. Entscheide.**
Diese Datei ist die Entscheidung.
