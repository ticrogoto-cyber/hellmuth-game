#!/usr/bin/env python3
"""
render_unit.py — HELLMUTH Einheiten-Render-Pipeline (Blender headless).

Vollautomatisch, KEIN manueller Blender-Klick. Aufruf:

  blender -b -P tools/render_unit.py -- \
      --fbx assets/source/Walk.fbx --unit helmut --clip walk \
      --directions 8 --frames 10 --res 256 --out build/sprites/helmut

Verbindliches Template (asset-spec.md §1/§2):
  - Orthographische Kamera, Look-at Pivot, 45° Yaw, 36,87° Elevation (sin θ = 0,6)
    -> Tile-Raster 5:3 (160x96), steiler als klassisches 2:1 (They Are Billions)
  - World-Licht 5.0, KEIN Sun-Licht
  - Film transparent (PNG mit Alpha)
  - Modell rotiert in (360/directions)-Schritten, Kamera bleibt fix
  - Clip wird auf das Frame-Budget heruntergerechnet (gleichmaessig gesampelt)

Output: PNG-Sequenz  <out>/<unit>_<clip>_<dir>_<frame>.png  (dir in Grad, 3-stellig)
Danach: tools/pack_atlas.py packt sie zu Spritesheet + Phaser-JSON.
"""

import bpy, sys, os, math, mathutils


def argv():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


# Fixe ortho_scale pro Einheitenklasse (asset-spec §1: Skala wird erzwungen,
# nicht vom Generator gewuerfelt). Rahmt die jeweilige Ziel-Modellhoehe mit Rand.
UNIT_CLASS_ORTHO = {
    "hero":     2.7,   # Hellmuth: Figur fuellt den Frame (~74%), Held prominent
    "infantry": 3.6,   # Standard-Fusssoldaten
    "caster":   3.8,
    "siege":    5.5,   # Rohrkanone u.ae. grossvolumig
}
DEFAULT_ORTHO = 4.0


def parse():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--fbx", required=True,
                   help="Quellmodell: .fbx (Mixamo-Clip) ODER .glb/.gltf (texturiert).")
    p.add_argument("--unit", required=True)
    p.add_argument("--clip", default="clip")
    p.add_argument("--directions", type=int, default=8)
    p.add_argument("--frames", type=int, default=10)
    p.add_argument("--res", type=int, default=256)      # Canvas px (quadratisch)
    p.add_argument("--height", type=float, default=2.0)  # Ziel-Modellhoehe (Weltunits)
    p.add_argument("--unit-class", default="hero",
                   choices=sorted(UNIT_CLASS_ORTHO.keys()))
    p.add_argument("--ortho-scale", type=float, default=None,
                   help="Override; sonst fix pro --unit-class (asset-spec §1).")
    p.add_argument("--out", default="build/sprites/unit")
    return p.parse_args(argv())


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for c in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
        for b in list(c):
            c.remove(b)


def setup_world(strength=5.0):
    # World-Licht statt Sun: flache, richtungsfreie Ausleuchtung.
    scene = bpy.context.scene
    scene.world = scene.world or bpy.data.worlds.new("W")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (1, 1, 1, 1)
        bg.inputs[1].default_value = strength


def setup_camera(res, ortho_scale=DEFAULT_ORTHO):
    cam_data = bpy.data.cameras.new("IsoCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = ortho_scale  # fix pro Einheitenklasse, asset-spec §1
    cam = bpy.data.objects.new("IsoCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    # Elevation aus sin θ = 0,6 -> 36,87°, Raster 5:3 (asset-spec §1). NICHT 30°.
    yaw, elev, dist = math.radians(45), math.asin(0.6), 50.0
    pivot = mathutils.Vector((0, 0, 1.0))  # etwa Koerpermitte
    cam.location = pivot + mathutils.Vector((
        dist * math.cos(elev) * math.cos(yaw),
        dist * math.cos(elev) * math.sin(yaw),
        dist * math.sin(elev),
    ))
    cam.rotation_euler = (pivot - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    sc = bpy.context.scene
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = True
    # Headless-tauglich: CYCLES auf CPU (EEVEE-Next braucht GPU-Kontext).
    sc.render.engine = "CYCLES"
    try:
        sc.cycles.device = "CPU"
        sc.cycles.samples = 24
    except Exception:
        pass
    return cam_data


def ensure_fbx_importer():
    if not hasattr(bpy.ops.import_scene, "fbx"):
        for mod in ("io_scene_fbx", "bl_ext.blender_org.io_scene_fbx"):
            try:
                bpy.ops.preferences.addon_enable(module=mod)
                break
            except Exception:
                continue


def import_model_normalized(path, target_h):
    """Importiert FBX **oder** GLB/GLTF, raeumt Fremd-Meshes weg (GLB-Artefakte
    wie eine Icosphere), aktiviert die Action + setzt die Szenen-Framerange auf
    den Clip und normalisiert die Modellhoehe."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        ensure_fbx_importer()
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    objs = list(bpy.context.selected_objects) or list(bpy.context.scene.objects)
    arm = next((o for o in objs if o.type == "ARMATURE"), None)
    meshes = [o for o in objs if o.type == "MESH"]
    # GLB bringt teils Fremd-Meshes mit (z. B. Icosphere). Nur das
    # vertex-reichste Haupt-Mesh behalten, der Rest fliegt raus.
    if len(meshes) > 1:
        main = max(meshes, key=lambda m: len(m.data.vertices))
        for m in list(meshes):
            if m is not main:
                bpy.data.objects.remove(m, do_unlink=True)
        meshes = [main]
    # Aktive Action sicherstellen und Szenen-Framerange auf den Clip setzen,
    # damit frame_indices() den ganzen Clip gleichmaessig sampelt.
    if arm and arm.animation_data:
        if not arm.animation_data.action and bpy.data.actions:
            arm.animation_data.action = bpy.data.actions[0]
        act = arm.animation_data.action
        if act:
            fr = act.frame_range
            bpy.context.scene.frame_start = int(round(fr[0]))
            bpy.context.scene.frame_end = int(round(fr[1]))
    # Hoehe normalisieren ueber kombinierte Bounding-Box der Meshes
    zs = []
    for m in meshes:
        for v in m.bound_box:
            zs.append((m.matrix_world @ mathutils.Vector(v)).z)
    h = (max(zs) - min(zs)) if zs else 1.0
    s = target_h / max(h, 1e-4)
    root = arm if arm else (meshes[0] if meshes else None)
    if root:
        # WICHTIG: der FBX-Importer setzt Armature-Scale 0,01 und Mesh-Scale 100
        # (Netto-Welt 1,0). Die vorhandene Skala MULTIPLIZIEREN, nicht
        # ueberschreiben, sonst explodiert das Modell (0,01 -> s ~ 176x zu gross,
        # Figur fuellt das Bild als Fragment). h wurde bereits in Weltkoordinaten
        # gemessen, s ist also der korrekte Zusatzfaktor.
        root.scale = tuple(c * s for c in root.scale)
        bpy.context.view_layer.update()
    return root, arm


def _fcurves(action):
    """F-Curves holen, robust ueber alte (.fcurves) und neue (Layers/Strips/
    Channelbags, Blender 4.4+/5.0) Animations-API."""
    try:
        return list(action.fcurves)
    except Exception:
        pass
    fcs = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            cbs = getattr(strip, "channelbags", None)
            if cbs is not None:
                for cb in cbs:
                    fcs.extend(list(cb.fcurves))
            else:
                for slot in getattr(action, "slots", []):
                    try:
                        cb = strip.channelbag(slot)
                        if cb:
                            fcs.extend(list(cb.fcurves))
                    except Exception:
                        pass
    return fcs


def strip_root_motion(arm):
    """Root-Motion (Hips X/Y in Blender Z-up) einfrieren -> Walk laeuft auf der
    Stelle, die Engine bewegt die Einheit. Vertikales Wippen (Z) bleibt."""
    if not arm or not arm.animation_data or not arm.animation_data.action:
        return
    try:
        for fc in _fcurves(arm.animation_data.action):
            if fc.data_path.lower().endswith("location") and "hips" in fc.data_path.lower():
                if fc.array_index in (0, 1) and len(fc.keyframe_points):
                    v0 = fc.keyframe_points[0].co[1]
                    for kp in fc.keyframe_points:
                        kp.co[1] = v0
                        kp.handle_left[1] = v0
                        kp.handle_right[1] = v0
                    fc.update()
    except Exception as e:
        print("WARN strip_root_motion:", e)


def frame_indices(n_out):
    sc = bpy.context.scene
    a, b = sc.frame_start, sc.frame_end
    if n_out <= 1:
        return [a]
    return [round(a + (b - a) * i / (n_out - 1)) for i in range(n_out)]


def main():
    args = parse()
    os.makedirs(args.out, exist_ok=True)
    clear_scene()
    setup_world(5.0)
    ortho = args.ortho_scale if args.ortho_scale is not None \
        else UNIT_CLASS_ORTHO.get(args.unit_class, DEFAULT_ORTHO)
    setup_camera(args.res, ortho)
    root, arm = import_model_normalized(args.fbx, args.height)
    if root is None:
        raise SystemExit("Kein Mesh/Armature im FBX gefunden")
    strip_root_motion(arm)

    sc = bpy.context.scene
    base_rot_z = root.rotation_euler.z
    frames = frame_indices(args.frames)
    step = 360.0 / args.directions

    for d in range(args.directions):
        deg = int(round(d * step))
        root.rotation_euler.z = base_rot_z + math.radians(deg)
        for fi, fr in enumerate(frames):
            sc.frame_set(fr)
            sc.render.filepath = os.path.join(
                args.out, f"{args.unit}_{args.clip}_{deg:03d}_{fi:02d}.png")
            bpy.ops.render.render(write_still=True)
    print(f"OK: {args.directions} Richtungen x {len(frames)} Frames -> {args.out}")


if __name__ == "__main__":
    main()
