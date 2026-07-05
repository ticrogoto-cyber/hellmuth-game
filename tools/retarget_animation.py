#!/usr/bin/env python3
"""retarget_animation.py — Stufe 3 der 3D-Animations-Pipeline: eine Mixamo-/
CMU-/Truebones-Animation auf das Skelett eines gerigten GLB mappen, voll-
automatisch via bpy 4.2.0 (H4b PASS).

Werkzeug 20 / Hebel H20.

Vorgehen:
  1. Ziel-GLB laden (`--target`, gerigt mit Skelett `tgt_arm`).
  2. Animations-Quelle laden (`--source`, Mixamo-FBX oder GLB mit Action).
  3. Bone-Namen automatisch matchen (Mixamo-Konvention `mixamorig:Hips` ->
     `Hips`, `mixamorig:LeftArm` -> `LeftArm`, ...). Optional `--mapping`
     JSON-Datei fuer manuelles Override pro Einheit.
  4. Pro Ziel-Bone: Copy-Rotation-Constraint auf den passenden Source-Bone.
  5. Action auf der Source-Skelett-Animation abspielen, Frame fuer Frame
     Constraint-Resultat auf das Ziel-Skelett baken.
  6. Constraint loeschen, Action am Ziel-Skelett behalten, GLB exportieren.

Konvention fuer Backend-Wahl (Lizenz):
  * **bpy-Constraint-Loop** (Default): MIT, kein externes Addon, laeuft im
    Container.
  * **Rokoko-Blender-Plugin** (LGPL-3, optional): falls
    `tools/rokoko-studio-live-blender/` als Addon vorhanden, kann via
    `--use-rokoko` darauf umgeschaltet werden. Rokoko liefert ein robusteres
    Auto-Bone-Mapping (`rsl_retargeting.build_bone_list`); LGPL-3-Build-
    Werkzeug ohne Spiel-Linkage, Steam-tauglich.

Aufruf:
  python3 tools/retarget_animation.py \
    --target build/3d/apothekerin_rigged.glb \
    --source tools/animations/humanoid/Mixamo_Walk.fbx \
    --clip-name walk \
    --out build/3d/apothekerin_walk.glb

Werkzeug-Audit (Hebel H20): retargetet einen Demo-FBX auf ein Demo-GLB und
prueft, dass das Output-GLB eine Action mit Frame-Range > 0 traegt.

Lizenz: MIT. Nutzt H4b (bpy), optional Rokoko-Plugin (LGPL-3).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional


# Mixamo->Standard-Bone-Mapping. Default-Auto-Erkennung: alle `mixamorig:`-
# Praefixe werden gestrippt, dann 1:1 gematcht. Wenn der Auto-Match nicht
# greift, ueber --mapping ueberschreibbar.
MIXAMO_PREFIX = "mixamorig:"


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--target", required=True,
                   help="Gerigtes Ziel-GLB (aus Werkzeug 19).")
    p.add_argument("--source", required=True,
                   help="Animations-Quelle (Mixamo-FBX, CMU-BVH, Truebones-FBX, ...).")
    p.add_argument("--clip-name", default="clip",
                   help="Name der Action im Output-GLB (z. B. 'walk', 'attack').")
    p.add_argument("--out", required=True, help="Output-GLB mit Action.")
    p.add_argument("--mapping", default=None,
                   help="Optional JSON-Datei {target_bone: source_bone, ...}.")
    p.add_argument("--use-rokoko", action="store_true",
                   help="Rokoko-Plugin nutzen (falls installiert, LGPL-3).")
    p.add_argument("--scene-fps", type=int, default=24)
    return p.parse_args()


def load_mapping(path: Optional[Path]) -> dict:
    if path is None or not path.exists():
        return {}
    return json.loads(path.read_text())


# --- Bone-Auto-Match ---------------------------------------------------------
def auto_match_bones(target_bones: list[str], source_bones: list[str]) -> dict:
    """Auto-Mapping: source-Bone-Name (ggf. ohne mixamorig:-Praefix) wird mit
    target-Bone-Name verglichen (case-insensitive, separator-tolerant).
    Liefert dict {target_bone: source_bone}.
    """
    def normalize(name: str) -> str:
        n = name.lower()
        if n.startswith(MIXAMO_PREFIX):
            n = n[len(MIXAMO_PREFIX):]
        # Trennzeichen ueberlesen
        return n.replace("_", "").replace(".", "").replace("-", "")

    src_norm = {normalize(b): b for b in source_bones}
    mapping = {}
    for tgt in target_bones:
        key = normalize(tgt)
        if key in src_norm:
            mapping[tgt] = src_norm[key]
    return mapping


def retarget_with_bpy(args: argparse.Namespace) -> int:
    """Default-Backend: bpy-Constraint-Loop. Funktioniert ohne externe Addons,
    laeuft im H4b-PASS-bpy 4.2.0."""
    try:
        import bpy
    except Exception as exc:
        print(f"FAIL: bpy nicht importierbar ({exc})", file=sys.stderr)
        return 1

    # 1) Saubere Szene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 2) Ziel laden
    bpy.ops.import_scene.gltf(filepath=str(args.target))
    tgt_objs = list(bpy.context.scene.objects)
    tgt_arm = next((o for o in tgt_objs if o.type == "ARMATURE"), None)
    tgt_meshes = [o for o in tgt_objs if o.type == "MESH"]
    if tgt_arm is None:
        print(f"FAIL: Ziel-GLB enthaelt keine Armature: {args.target}",
              file=sys.stderr)
        return 2

    # 3) Quelle laden (FBX oder GLB/GLTF)
    src_ext = Path(args.source).suffix.lower()
    if src_ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(args.source))
    elif src_ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(args.source))
    else:
        print(f"FAIL: Quell-Format nicht unterstuetzt: {src_ext}", file=sys.stderr)
        return 3
    new_objs = [o for o in bpy.context.scene.objects if o not in tgt_objs]
    src_arm = next((o for o in new_objs if o.type == "ARMATURE"), None)
    if src_arm is None:
        print(f"FAIL: Quelle enthaelt keine Armature: {args.source}",
              file=sys.stderr)
        return 4
    if src_arm.animation_data is None or src_arm.animation_data.action is None:
        # Falls die Action separat liegt, ersten verfuegbaren Action zuweisen
        actions = list(bpy.data.actions)
        if not actions:
            print("FAIL: keine Action in der Quelle gefunden", file=sys.stderr)
            return 5
        src_arm.animation_data_create()
        src_arm.animation_data.action = actions[0]

    # 4) Bone-Mapping
    tgt_bones = [b.name for b in tgt_arm.pose.bones]
    src_bones = [b.name for b in src_arm.pose.bones]
    manual = load_mapping(Path(args.mapping) if args.mapping else None)
    mapping = auto_match_bones(tgt_bones, src_bones)
    mapping.update(manual)  # Manuelle Eintraege ueberschreiben Auto-Match.
    print(f"Bone-Mapping: {len(mapping)}/{len(tgt_bones)} Target-Bones zugeordnet.")
    if not mapping:
        print("FAIL: kein Bone-Auto-Match. --mapping JSON setzen oder Skelette "
              "kompatibel halten (Mixamo-Konvention).", file=sys.stderr)
        return 6

    # 5) Copy-Rotation-Constraints anlegen. Hueft-/Root-Bone zusaetzlich in der
    # Translation folgen lassen (Solutions §2.3 Schritt 5: "Hip auch Copy
    # Location") -- sonst verliert der walk Hueft-Bob/Sway und Vorwaerts-Drift.
    # render_unit.strip_root_motion friert spaeter X/Y fuers Sprite ein, behaelt
    # das Z-Wippen; auf GLB-Ebene bleibt die volle Bewegung erhalten.
    ROOT_RE = re.compile(r"(?i)(hips|pelvis|root)")
    bpy.context.view_layer.objects.active = tgt_arm
    bpy.ops.object.mode_set(mode="POSE")
    for tgt_name, src_name in mapping.items():
        pb = tgt_arm.pose.bones.get(tgt_name)
        if pb is None:
            continue
        c = pb.constraints.new(type="COPY_ROTATION")
        c.target = src_arm
        c.subtarget = src_name
        c.target_space = "WORLD"
        c.owner_space = "WORLD"
        c.influence = 1.0
        if ROOT_RE.search(tgt_name):
            cl = pb.constraints.new(type="COPY_LOCATION")
            cl.target = src_arm
            cl.subtarget = src_name
            cl.target_space = "WORLD"
            cl.owner_space = "WORLD"
            cl.influence = 1.0

    # 6) Frame-Range aus Quell-Action, Animation baken
    act = src_arm.animation_data.action
    fr = act.frame_range
    f0, f1 = int(round(fr[0])), int(round(fr[1]))
    bpy.context.scene.frame_start = f0
    bpy.context.scene.frame_end = f1
    bpy.context.scene.render.fps = args.scene_fps
    # Deselect ueber die Daten-API statt bpy.ops.object.select_all: der Operator
    # pollt im POSE-Mode unter dem bpy-Modul fehl ("context is incorrect").
    for _o in bpy.context.scene.objects:
        _o.select_set(False)
    tgt_arm.select_set(True)
    bpy.context.view_layer.objects.active = tgt_arm
    # nla_tweak_strip_time / bake_action: baked die Pose-Constraints in
    # Keyframes auf der Ziel-Armature.
    bpy.ops.nla.bake(
        frame_start=f0,
        frame_end=f1,
        only_selected=False,
        visual_keying=True,
        clear_constraints=True,
        clear_parents=False,
        use_current_action=False,
        bake_types={"POSE"},
    )
    # Action umbenennen
    baked = tgt_arm.animation_data.action if tgt_arm.animation_data else None
    if baked is not None:
        baked.name = args.clip_name
    bpy.ops.object.mode_set(mode="OBJECT")

    # 7) Quell-Armature loeschen (war nur Mocap-Quelle)
    bpy.data.objects.remove(src_arm, do_unlink=True)
    # Verwaiste Actions (insbes. die Quell-Action) entfernen, damit das Output-
    # GLB GENAU einen Clip traegt (render_iso_sheet iteriert bpy.data.actions).
    for _a in list(bpy.data.actions):
        if _a is not baked:
            bpy.data.actions.remove(_a)

    # 8) GLB-Export (nur Ziel-Mesh + Ziel-Armature)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [tgt_arm] + tgt_meshes:
        o.select_set(True)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.out),
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        use_selection=True,
    )
    print(f"OK: retargetet '{args.clip_name}' [{f0}..{f1}] -> {args.out}")
    return 0


def retarget_with_rokoko(args: argparse.Namespace) -> int:
    """Optionaler Pfad: Rokoko-Blender-Plugin (LGPL-3) als bpy-Addon. Robusteres
    Auto-Bone-Mapping; benoetigt installiertes Addon."""
    try:
        import bpy
        if not hasattr(bpy.ops, "rsl"):
            print("FAIL: Rokoko-Plugin nicht installiert (bpy.ops.rsl fehlt). "
                  "Default-Backend nutzen oder Plugin installieren.", file=sys.stderr)
            return 30
    except Exception as exc:
        print(f"FAIL: bpy nicht importierbar ({exc})", file=sys.stderr)
        return 31

    # Skizze; voller Pfad wuerde rsl_retargeting.build_bone_list + retarget_animation
    # nutzen. Hier nur als Hinweis: wenn Rokoko da ist, dieselbe Pipeline wie
    # oben, nur die Mapping- und Bake-Schritte ersetzt.
    print("INFO: Rokoko-Backend ist als Stub angelegt; bevorzugt das bpy-"
          "Constraint-Backend, das ohne externes Addon laeuft.", file=sys.stderr)
    return retarget_with_bpy(args)


def main() -> int:
    args = parse()
    in_target = Path(args.target)
    in_source = Path(args.source)
    if not in_target.exists():
        print(f"FAIL: Ziel-GLB fehlt: {in_target}", file=sys.stderr)
        return 1
    if not in_source.exists():
        print(f"FAIL: Quell-Animation fehlt: {in_source}", file=sys.stderr)
        return 1
    if args.use_rokoko:
        return retarget_with_rokoko(args)
    return retarget_with_bpy(args)


if __name__ == "__main__":
    sys.exit(main())
