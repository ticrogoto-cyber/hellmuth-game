#!/usr/bin/env python3
"""render_iso_sheet.py — Wrapper um render_unit.py + pack_atlas.py, schliesst
die VIER Luecken zur geschlossenen Pipeline (Stufe 4 / Werkzeug 21 / Hebel H21).

Loest aus EINEM gerigten, animierten GLB (mit eingebetteten Animations-Clips
als bpy.data.actions oder NLA-Tracks) einen Phaser-fertigen Sprite-Atlas in
36.87°-Iso, 8 Richtungen, mit FPS-Sampling.

Schliesst die 4 Luecken aus docs/3D-ANIMATIONS-PIPELINE.md:
  1) Multi-Clip-Iteration: render_unit.py rendert nur eine Action; dieser Wrapper
     iteriert ueber bpy.data.actions (idle/walk/attack/death) und ruft je Action
     den Render-Kern.
  2) FPS-Sampling: konfigurierbares Ziel-FPS (Default 12 fps RTS-Look) statt der
     fixen --frames N; step = round(scene_fps / ziel_fps).
  3) Action-Slots (Blender 4.4+/5.0): falls action.slots existiert, action_slot
     setzen statt nur animation_data.action.
  4) Aufruf-Dualitaet: laeuft als `python3 tools/render_iso_sheet.py ...` mit
     dem bpy-pip-Modul (Code-Session-Container, verifiziert in der letzten
     Runde) ODER als `blender -b -P tools/render_iso_sheet.py -- ...`. Die
     "--"-Konvention wird in beiden Modi gleich behandelt.

Output je gerendertem Frame:
  <out>/<unit>_<clip>_<dir>_<frame>.png  (dir in Grad, 3-stellig)

Danach automatisch (oder per --skip-pack abschaltbar): pack_atlas.py packt zum
Phaser-Atlas <atlas-img> + <atlas-json> (Schema deckungsgleich mit Engine-
UnitAnimator <stem>_<clip>_<deg>_<frame>).

Aufruf:
  python3 tools/render_iso_sheet.py --glb build/3d/stahlbrute_anim.glb \
    --unit stahlbrute --directions 8 --target-fps 12 --res 256 \
    --unit-class infantry --out build/sprites/stahlbrute \
    --atlas-img public/sprites/units/stahlbrute.png \
    --atlas-json public/sprites/units/stahlbrute.json

Werkzeug-Audit (Hebel H21): rendert ein Standard-Modell und vergleicht
Frame-Anzahl gegen Erwartung (dirs * clips * frames). FAIL = harter Stopp.

Lizenz: MIT. Beruht auf Werkzeug "render_unit.py" + "pack_atlas.py".
"""
from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

# --- Aufruf-Dualitaet (Luecke 4) ---------------------------------------------
# Sowohl `blender -b -P ...` als auch `python3 ...` reichen via sys.argv das
# alles nach "--" durch. In bpy-Modul-Mode gibt es kein "--" -> wir nehmen
# einfach alle Argumente nach dem Skript-Namen. In blender-Binary-Mode trennt
# "--" Blender-Eigene Flags von unseren.
def _own_argv() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1:]
    # bpy-Modul-Aufruf: argv ist [skript, ...]
    return sys.argv[1:]


# render_unit.py ist import-safe (parse() lebt hinter `if __name__ == "__main__"`),
# also spiegeln wir NICHT mehr die Funktionen -- wir importieren die kritischen
# (strip_root_motion, weiter unten) und halten den Rest lokal (Kamera-Setup +
# Modell-Import) nur solange, wie die 4-Luecken-Wrapper-Signatur das erfordert.
# Historie: die frueher lokal duplizierte strip_root_motion iterierte
# act.fcurves direkt und war unter Blender 4.4+-Slot-API ein stiller No-Op --
# genau darum trug der Live-Hellmuth-Atlas volle Root-Motion (span 112 px).
# pack_atlas.py bleibt Subprozess (kein API-Konflikt).

# --- Iso-Konstanten (asset-spec §1) ------------------------------------------
ELEVATION_RAD = math.asin(0.6)   # 36.87 Grad, nicht das klassische 30 Grad
YAW_RAD = math.radians(45)
UNIT_CLASS_ORTHO = {
    "hero":     2.7,
    "infantry": 3.6,
    "caster":   3.8,
    "siege":    5.5,
}
DEFAULT_ORTHO = 4.0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--glb", required=True,
                   help="Gerigtes, animiertes GLB (Multi-Clip per bpy.data.actions).")
    p.add_argument("--unit", required=True,
                   help="Einheit-Id (Atlas-Stamm im Frame-Schluessel).")
    p.add_argument("--clips", default="",
                   help="Komma-Liste der zu rendernden Clip-Namen. Leer = alle "
                        "Actions im GLB (Multi-Clip-Iteration, Luecke 1).")
    p.add_argument("--directions", type=int, default=8,
                   help="Anzahl Iso-Richtungen (8 = klassisch RTS).")
    p.add_argument("--target-fps", type=int, default=12,
                   help="Sampling-FPS pro Clip (Luecke 2). step = scene_fps / target_fps.")
    p.add_argument("--res", type=int, default=256, help="Canvas-Aufloesung quadratisch.")
    p.add_argument("--height", type=float, default=2.0,
                   help="Modell-Zielhoehe in Weltunits (Hoehen-Normalisierung).")
    p.add_argument("--unit-class", default="infantry",
                   choices=sorted(UNIT_CLASS_ORTHO.keys()))
    p.add_argument("--ortho-scale", type=float, default=None)
    p.add_argument("--scene-fps", type=int, default=24,
                   help="Source-FPS des GLB; Default 24 (Mixamo-Standard).")
    p.add_argument("--cycles-samples", type=int, default=24)
    p.add_argument("--out", required=True, help="Output-Ordner fuer die PNG-Sequenz.")
    p.add_argument("--atlas-img", default="",
                   help="Phaser-Atlas-PNG. Leer = pack_atlas-Schritt ueberspringen.")
    p.add_argument("--atlas-json", default="",
                   help="Phaser-Atlas-JSON. Leer = pack_atlas-Schritt ueberspringen.")
    p.add_argument("--skip-pack", action="store_true",
                   help="Nur rendern, kein pack_atlas-Aufruf.")
    p.add_argument("--pivot", type=float, nargs=2, default=[0.5, 0.92])
    return p.parse_args(_own_argv())


# --- bpy-Setup ---------------------------------------------------------------
def setup_scene(args: argparse.Namespace) -> None:
    import bpy
    # Cycles-CPU als harte Entscheidung (siehe docs/3D-ANIMATIONS-PIPELINE.md):
    # EEVEE-Next braucht GPU/EGL, im bpy-Modul ohne Display unzuverlaessig.
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = args.cycles_samples
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.film_transparent = True
    sc.render.resolution_x = args.res
    sc.render.resolution_y = args.res
    sc.render.fps = args.scene_fps
    # Weiches Welt-Licht statt Sun -> richtungsfrei, 2D-Sprite-tauglich.
    world = sc.world
    if world is None:
        world = bpy.data.worlds.new("World")
        sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[1].default_value = 5.0


def clear_scene() -> None:
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions,
                 bpy.data.objects, bpy.data.materials):
        for obj in list(coll):
            try:
                coll.remove(obj)
            except RuntimeError:
                pass


def setup_camera(ortho_scale: float) -> "bpy.types.Object":
    import bpy
    cam_data = bpy.data.cameras.new("IsoCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale
    cam_obj = bpy.data.objects.new("IsoCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    # Pivot in der Mitte. Kameraposition aus Kugel-Koordinaten.
    # x = r*cos(elev)*cos(yaw), y = r*cos(elev)*sin(yaw), z = r*sin(elev)
    r = 10.0
    cam_obj.location = (
        r * math.cos(ELEVATION_RAD) * math.cos(YAW_RAD),
        r * math.cos(ELEVATION_RAD) * math.sin(YAW_RAD),
        r * math.sin(ELEVATION_RAD),
    )
    # Look-at Origin
    direction = -cam_obj.location.normalized()
    rot_quat = direction.to_track_quat("-Z", "Y")
    cam_obj.rotation_euler = rot_quat.to_euler()
    return cam_obj


def import_glb(path: str, target_h: float) -> tuple["bpy.types.Object", Optional["bpy.types.Object"]]:
    import bpy
    bpy.ops.import_scene.gltf(filepath=path)
    objs = list(bpy.context.selected_objects) or list(bpy.context.scene.objects)
    arm = next((o for o in objs if o.type == "ARMATURE"), None)
    meshes = [o for o in objs if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"GLB enthaelt kein Mesh: {path}")
    # Root: bevorzugt die Armature (deren Drehung das ganze Rig dreht).
    root = arm if arm else meshes[0]

    # Hoehen-Normalisierung: bounding box ueber alle Meshes (Welt-Koordinaten).
    bpy.context.view_layer.update()
    zmin, zmax = float("inf"), float("-inf")
    for m in meshes:
        for v in m.bound_box:
            world = m.matrix_world @ __vec(v)
            zmin = min(zmin, world.z)
            zmax = max(zmax, world.z)
    h = zmax - zmin
    if h > 0:
        s = target_h / h
        root.scale = (root.scale.x * s, root.scale.y * s, root.scale.z * s)
        bpy.context.view_layer.update()
    # An den Boden setzen.
    root.location.z -= zmin * (root.scale.z / max(1e-9, root.scale.z))
    return root, arm


def __vec(t):
    # bound_box-Punkte sind 3er-Tuples; in mathutils.Vector konvertieren.
    import mathutils
    return mathutils.Vector(t)


# render_unit.strip_root_motion ist die EINE Wahrheit (Hips X/Y einfrieren,
# Z-Bob behalten, mit _fcurves-Helper fuer Blender 4.4+-Slots). Wir importieren
# sie direkt statt sie hier zu duplizieren -- die frueher hier stehende lokale
# Variante iterierte act.fcurves direkt und war unter der 4.4+-Slot-API ein
# stiller No-Op, was den Live-Atlas mit voller Root-Motion befuellte
# (gemessen 2026-07-03: span_x 112 px, span_y 69 px in einer Richtung).
_TOOLS = str(Path(__file__).resolve().parent)
if _TOOLS not in sys.path:
    sys.path.insert(0, _TOOLS)
from render_unit import strip_root_motion  # noqa: E402


# --- Multi-Clip-Iteration (Luecke 1) -----------------------------------------
def list_actions(filter_names: list[str]) -> list["bpy.types.Action"]:
    import bpy
    all_actions = list(bpy.data.actions)
    if not filter_names:
        return all_actions
    wanted = {n.lower().strip() for n in filter_names if n.strip()}
    return [a for a in all_actions if a.name.lower() in wanted
            or any(w in a.name.lower() for w in wanted)]


def assign_action(arm: "bpy.types.Object", action: "bpy.types.Action") -> None:
    """Setzt die Action auf die Armature. Behandelt Action-Slots (Luecke 3)."""
    import bpy
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    ad.action = action
    # Blender 4.4+: action.slots ist die neue API. Ein Slot pro logischer
    # Animation. Wir setzen den ersten kompatiblen Slot.
    if hasattr(action, "slots") and len(action.slots) > 0:
        try:
            ad.action_slot = action.slots[0]
        except (AttributeError, TypeError):
            pass  # 4.2-API kennt action_slot noch nicht


# --- FPS-Sampling (Luecke 2) -------------------------------------------------
def fps_frame_indices(action: "bpy.types.Action", scene_fps: int, target_fps: int) -> list[int]:
    """Liefert die zu rendernden Frame-Nummern fuer einen Clip, gesampelt mit
    target_fps (Default 12) gegen die Action-Quell-FPS (Default 24)."""
    start, end = (int(round(x)) for x in action.frame_range)
    step = max(1, round(scene_fps / max(1, target_fps)))
    return list(range(start, end + 1, step))


def render_clip(arm: Optional["bpy.types.Object"],
                root: "bpy.types.Object",
                action: "bpy.types.Action",
                clip_label: str,
                args: argparse.Namespace) -> int:
    """Rendert eine Action in args.directions Richtungen, gesampelt mit
    args.target_fps. Gibt die Anzahl geschriebener PNGs zurueck."""
    import bpy
    if arm is not None:
        assign_action(arm, action)
        strip_root_motion(arm)
    sc = bpy.context.scene
    frames = fps_frame_indices(action, args.scene_fps, args.target_fps)
    base_rot = float(root.rotation_euler.z)
    written = 0
    for d in range(args.directions):
        deg = int(round(d * 360.0 / args.directions))
        root.rotation_euler.z = base_rot + math.radians(deg)
        for fi, fr in enumerate(frames):
            sc.frame_set(fr)
            out_path = os.path.join(
                args.out,
                f"{args.unit}_{clip_label}_{deg:03d}_{fi:02d}.png",
            )
            sc.render.filepath = out_path
            bpy.ops.render.render(write_still=True)
            written += 1
    return written


def clip_label(action_name: str) -> str:
    """Mixamo/Blender-Action-Name -> sauberer Clip-Label fuer den Frame-Key.

    Mixamo-FBX-Konvention: `Armature|mixamo.com|Layer0` -> letzter Teil.
    Re-importiertes GLB benennt oft um zu `Armature|Action.001` o. ae.
    Wir nehmen den letzten |-Teil, strippen bekannte Praefixe (mixamo.com,
    Armature, rig, Layer), entfernen ALLE Unterstriche/Punkte (das
    pack_atlas-Regex greedy-matcht sonst falsch) und lowercased.
    """
    name = action_name.split("|")[-1].strip().lower()
    for prefix in ("mixamo.com", "armature", "rig", "layer"):
        if name.startswith(prefix):
            rest = name[len(prefix):].lstrip("_-.")
            if rest:
                name = rest
    name = name.replace("_", "").replace(".", "").replace("-", "")
    return name or "clip"


def main() -> int:
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    ortho = args.ortho_scale if args.ortho_scale is not None \
        else UNIT_CLASS_ORTHO.get(args.unit_class, DEFAULT_ORTHO)

    clear_scene()
    setup_scene(args)
    setup_camera(ortho)
    root, arm = import_glb(args.glb, args.height)

    if arm is None:
        print("WARN: GLB enthaelt keine Armature -> Multi-Clip-Iteration faellt aus, "
              "rendere nur die statische Pose.", file=sys.stderr)

    requested = [c.strip() for c in args.clips.split(",") if c.strip()] if args.clips else []
    if arm is None:
        actions = [None]
        labels = ["static"]
    else:
        # --clips kann zwei Bedeutungen haben:
        #   a) Filter: Action-Name muss eines der requested-Substrings enthalten.
        #   b) Override-Labels: bei genau einer Action in der Quelle wird der
        #      erste --clips-Eintrag als logischer Name uebernommen
        #      (Mixamo-Single-Clip-Konvention).
        actions = list_actions(requested) or list_actions([])
        if requested and len(requested) == len(actions):
            # Match 1:1 -- ordered override.
            labels = [c.lower() for c in requested]
        else:
            labels = [clip_label(a.name) for a in actions]

    if not actions:
        print(f"FAIL: keine Actions im GLB gefunden (requested={requested})",
              file=sys.stderr)
        return 1

    print(f"Render: unit={args.unit} "
          f"actions={[a.name if a else 'static' for a in actions]} "
          f"labels={labels} dirs={args.directions} fps={args.target_fps}/{args.scene_fps}")

    total = 0
    for action, label in zip(actions, labels):
        n = render_clip(arm, root, action, label, args) if action is not None \
            else render_static_only(root, args)
        print(f"  clip={label}  frames_written={n}")
        total += n

    print(f"OK: {len(actions)} clip(s), insgesamt {total} PNGs -> {args.out}")

    # --- Atlas-Pack (Luecke 5: geschlossene Kette) --------------------------
    if args.skip_pack or not args.atlas_img or not args.atlas_json:
        return 0

    # pack_atlas.py als Subprozess (kein argv-Konflikt mit bpy-Modul).
    repo_root = Path(__file__).resolve().parent.parent
    pack = repo_root / "tools" / "pack_atlas.py"
    cmd = [
        sys.executable, str(pack),
        "--in", args.out,
        "--out-img", args.atlas_img,
        "--out-json", args.atlas_json,
        "--pivot", str(args.pivot[0]), str(args.pivot[1]),
    ]
    print("pack_atlas:", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print("pack_atlas STDERR:", res.stderr, file=sys.stderr)
        return res.returncode
    return 0


def render_static_only(root, args: argparse.Namespace) -> int:
    """Fallback wenn kein Skelett: nur Stand-Pose in N Richtungen."""
    import bpy
    base_rot = float(root.rotation_euler.z)
    written = 0
    for d in range(args.directions):
        deg = int(round(d * 360.0 / args.directions))
        root.rotation_euler.z = base_rot + math.radians(deg)
        out_path = os.path.join(args.out, f"{args.unit}_static_{deg:03d}_00.png")
        bpy.context.scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)
        written += 1
    return written


if __name__ == "__main__":
    sys.exit(main())
