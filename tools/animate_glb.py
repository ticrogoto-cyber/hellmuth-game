#!/usr/bin/env python3
"""animate_glb.py — vereinheitlichter Einstiegspunkt der Animations-Pipeline
(Werkzeug 26 / Hebel H26). Erfuellt den Erfolgsmassstab aus
CODE3ANIMATIONSDETAIL.md:

  python3 tools/animate_glb.py --rig <name>.glb --anim-type walk --out walk.glb

Ticro laedt ein gerigtes GLB hoch, ruft EINEN Befehl, bekommt das animierte GLB.
Der Phaser-Atlas folgt mit `tools/render_iso_sheet.py` (H21).

DISPATCH (Brief §2.2, an die HELLMUTH-Realitaet angepasst):

  idle | walk | attack | death     -> Retarget-Pfad
      Eine humanoide Quell-Action (prozedural, Mixamo-Bone-Layout; optional CMU)
      wird per `tools/retarget_animation.py` (H20, bpy-Constraint-Loop) auf das
      Skelett des hochgeladenen Rigs gebacken. Quelle kommt aus
      `tools/animations/anim_library.py` (H27, resolve()).

  hover | breath | skitter | sway   -> Prozedural-Direkt-Pfad
      Sinus-Keyframes werden DIREKT auf die Bones des hochgeladenen Rigs
      geschrieben (Bone-Rollen per Regex gematcht). Das ist bewusst etwas
      anderes als `tools/animations/procedural/procedural_anim.py`: dort wird ein
      Skelett VON GRUND AUF erzeugt; hier wird ein FREMDES Rig animiert. Die
      Pattern-Mathematik bleibt mit dem Generator konsistent (gleiche
      Frequenzen/Amplituden), aber auf beliebige Bone-Namen anwendbar.

NICHT abgedeckt (KANON-LUECKE, dokumentiert statt erfunden):
  quad_walk  -> braucht eine Quadruped-Quelle. Truebones-ZOO ist per Ticro-
                Strike (2026-06-17) und per 403-Netzschranke raus; eine
                prozedurale Vierbeiner-Gangart ist noch nicht spezifiziert.

AUDIT nach Generierung (Brief §2.5): Output-GLB muss mindestens eine Animation
tragen, deren Laenge > 0.5 s ist, mit mindestens einem Keyframe-Kanal. Sonst
Exit-Code 6 (EXIT_AUDIT_FAIL). Geprueft ohne erneuten bpy-Start via pygltflib.

Aufruf (bpy-Modul ODER blender-Binary):
  python3 tools/animate_glb.py -- --rig X.glb --anim-type walk --out walk.glb
  blender -b -P tools/animate_glb.py -- --rig X.glb --anim-type walk --out walk.glb

Lizenz: MIT (Eigenwerk). Nutzt H20 (Retarget), H27 (anim_library), bpy (H4b).
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
ANIM_DIR = TOOLS_DIR / "animations"          # anim_library.py liegt hier
for _p in (str(TOOLS_DIR), str(ANIM_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

EXIT_OK = 0
EXIT_GENERIC = 1
EXIT_NO_ARMATURE = 2
EXIT_NO_SOURCE = 5
EXIT_AUDIT_FAIL = 6
EXIT_UNSUPPORTED = 7

# Frequenz/Amplitude konsistent mit procedural_anim.py (Generator-of-record).
FPS = 24
PERIOD = 24  # 1-s-Loop bei 24 fps; f=0 und f=PERIOD identisch -> nahtloser Loop
MIN_CLIP_SECONDS = 0.5

RETARGET_TYPES = ("idle", "walk", "attack", "death")
PROCEDURAL_TYPES = ("hover", "breath", "skitter", "sway")
UNSUPPORTED_TYPES = {
    "quad_walk": "Quadruped-Quelle fehlt (Truebones-Strike + 403). KANON-LUECKE.",
}


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]


# --- Audit (ohne erneuten bpy-Start) -----------------------------------------
def audit_glb(path: Path) -> tuple[bool, str]:
    """True/Begruendung. Liest das GLB mit pygltflib: >=1 Animation, Laenge
    > MIN_CLIP_SECONDS (aus Sampler-Input-Accessor .max), >=1 Kanal."""
    try:
        from pygltflib import GLTF2
    except Exception as exc:  # pragma: no cover
        return False, f"pygltflib nicht importierbar ({exc})"
    if not path.exists():
        return False, f"Output-GLB fehlt: {path}"
    g = GLTF2().load(str(path))
    anims = g.animations or []
    if not anims:
        return False, "keine Animation im Output-GLB"
    best = 0.0
    channels = 0
    for a in anims:
        channels += len(a.channels or [])
        for s in (a.samplers or []):
            acc = g.accessors[s.input]
            if acc.max:
                best = max(best, float(acc.max[0]))
    if channels == 0:
        return False, "Animation ohne Keyframe-Kanal"
    if best <= MIN_CLIP_SECONDS:
        return False, f"Clip-Laenge {best:.2f}s <= {MIN_CLIP_SECONDS}s"
    return True, f"{len(anims)} Animation(en), {channels} Kanaele, {best:.2f}s"


# --- Retarget-Pfad (humanoid) ------------------------------------------------
def run_retarget(rig: Path, anim_type: str, out: Path, mapping: Path | None,
                 source_override: Path | None, scene_fps: int) -> int:
    import anim_library
    import retarget_animation

    src = source_override or anim_library.resolve(anim_type, family="humanoid")
    if src is None:
        print(f"FAIL: keine Quell-Action fuer '{anim_type}' in der Bibliothek. "
              f"Erwartet z. B. tools/animations/procedural/humanoid_{anim_type}.glb "
              f"(via tools/animations/procedural/procedural_anim.py erzeugen).",
              file=sys.stderr)
        return EXIT_NO_SOURCE
    print(f"[retarget] Quelle: {src}")
    ns = argparse.Namespace(
        target=str(rig), source=str(src), clip_name=anim_type, out=str(out),
        mapping=str(mapping) if mapping else None, use_rokoko=False,
        scene_fps=scene_fps,
    )
    rc = retarget_animation.retarget_with_bpy(ns)
    if rc != 0:
        print(f"FAIL: Retarget-Backend Exit {rc}", file=sys.stderr)
        return rc
    return EXIT_OK


# --- Prozedural-Direkt-Pfad (non-humanoid) -----------------------------------
import re  # noqa: E402

_ROLE_PATTERNS = {
    "root":  re.compile(r"(?i)(hips?|root|body|torso|pelvis|base)"),
    "leg":   re.compile(r"(?i)(leg|prop|rotor|limb|antenna)"),
    "stem":  re.compile(r"(?i)(stem|spine|trunk|branch|leaf|tail)"),
}


def _match_role(pose_bones, role: str) -> list:
    pat = _ROLE_PATTERNS[role]
    return [pb for pb in pose_bones if pat.search(pb.name)]


def run_procedural(rig: Path, anim_type: str, out: Path, scene_fps: int) -> int:
    """Schreibt Sinus-Keyframes direkt auf die Bones des Ziel-Rigs."""
    try:
        import bpy
        import mathutils
    except Exception as exc:
        print(f"FAIL: bpy nicht importierbar ({exc})", file=sys.stderr)
        return EXIT_GENERIC

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = scene_fps
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(rig))
    objs = [o for o in bpy.context.scene.objects if o not in before] or \
        list(bpy.context.scene.objects)
    arm = next((o for o in objs if o.type == "ARMATURE"), None)
    meshes = [o for o in objs if o.type == "MESH"]
    if arm is None:
        print(f"FAIL: Ziel-GLB enthaelt keine Armature: {rig}", file=sys.stderr)
        return EXIT_NO_ARMATURE

    bpy.context.view_layer.objects.active = arm
    # Output traegt GENAU den angeforderten Clip: vorhandene Actions (z. B. ein
    # bereits eingebackenes hover) vorher entfernen.
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(anim_type)
    arm.animation_data.action = act

    def key_rot(pb, f, xyz):
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = mathutils.Euler(xyz, "XYZ")
        pb.keyframe_insert("rotation_euler", frame=f)

    def key_loc(pb, f, xyz):
        pb.location = mathutils.Vector(xyz)
        pb.keyframe_insert("location", frame=f)

    def key_scale(pb, f, s):
        pb.scale = (s, s, s)
        pb.keyframe_insert("scale", frame=f)

    roots = _match_role(arm.pose.bones, "root") or list(arm.pose.bones)[:1]
    legs = _match_role(arm.pose.bones, "leg")
    stems = _match_role(arm.pose.bones, "stem")
    n_written = 0

    for f in range(PERIOD + 1):
        t = f / PERIOD
        s = math.sin(2 * math.pi * t)
        if anim_type == "hover":
            for pb in roots:
                key_loc(pb, f, (0, 0, 0.06 * s)); n_written += 1
            for i, pb in enumerate(legs):  # Rotor-Spin (zwei Umdrehungen/Loop)
                sign = 1 if i % 2 == 0 else -1
                key_rot(pb, f, (0, 0, sign * 4 * math.pi * t)); n_written += 1
        elif anim_type == "breath":
            for pb in roots:
                key_scale(pb, f, 1.0 + 0.03 * s); n_written += 1
        elif anim_type == "skitter":
            for i, pb in enumerate(legs):
                ph = 0.0 if i % 2 == 0 else 0.5  # Tripod-Phasenversatz
                key_rot(pb, f, (math.radians(22) * math.sin(2 * math.pi * (t + ph)),
                                0, 0)); n_written += 1
        elif anim_type == "sway":
            for i, pb in enumerate(stems):
                amp = math.radians(3 + 3 * i)  # oben staerker
                ph = i * 0.12
                key_rot(pb, f, (amp * math.sin(2 * math.pi * (t + ph)), 0, 0))
                n_written += 1

    if n_written == 0:
        print(f"FAIL: keine passenden Bones fuer '{anim_type}' im Rig gefunden. "
              f"Erwartete Rollen-Regex: root={_ROLE_PATTERNS['root'].pattern} "
              f"leg={_ROLE_PATTERNS['leg'].pattern} "
              f"stem={_ROLE_PATTERNS['stem'].pattern}", file=sys.stderr)
        return EXIT_AUDIT_FAIL

    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB",
        export_animations=True, export_skins=True, use_selection=True,
    )
    print(f"[procedural] '{anim_type}' {n_written} Keyframes -> {out}")
    return EXIT_OK


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rig", required=True, help="Gerigtes Eingabe-GLB (Ziel).")
    ap.add_argument("--anim-type", required=True,
                    help="idle|walk|attack|death (retarget) oder "
                         "hover|breath|skitter|sway (prozedural).")
    ap.add_argument("--out", required=True, help="Output-GLB mit Animation.")
    ap.add_argument("--source", default=None,
                    help="Optional: Quell-Action ueberschreiben (sonst "
                         "anim_library.resolve).")
    ap.add_argument("--mapping", default=None,
                    help="Optional: Bone-Mapping-JSON fuer den Retarget-Pfad.")
    ap.add_argument("--scene-fps", type=int, default=FPS)
    args = ap.parse_args(_argv())

    rig = Path(args.rig)
    out = Path(args.out)
    at = args.anim_type
    if not rig.exists():
        print(f"FAIL: Eingabe-GLB fehlt: {rig}", file=sys.stderr)
        return EXIT_GENERIC
    if at in UNSUPPORTED_TYPES:
        print(f"FAIL: anim-type '{at}' nicht unterstuetzt: {UNSUPPORTED_TYPES[at]}",
              file=sys.stderr)
        return EXIT_UNSUPPORTED

    if at in RETARGET_TYPES:
        rc = run_retarget(rig, at, out,
                          Path(args.mapping) if args.mapping else None,
                          Path(args.source) if args.source else None,
                          args.scene_fps)
    elif at in PROCEDURAL_TYPES:
        rc = run_procedural(rig, at, out, args.scene_fps)
    else:
        print(f"FAIL: unbekannter anim-type '{at}'. Bekannt: "
              f"{', '.join(RETARGET_TYPES + PROCEDURAL_TYPES)}.", file=sys.stderr)
        return EXIT_UNSUPPORTED

    if rc != EXIT_OK:
        return rc

    ok, why = audit_glb(out)
    status = "PASS" if ok else "FAIL"
    print(f"[audit] {status}: {why}")
    if not ok:
        return EXIT_AUDIT_FAIL
    print(f"OK: {at} -> {out}")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
