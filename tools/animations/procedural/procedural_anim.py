#!/usr/bin/env python3
"""procedural_anim.py — prozedurale Animations-Clips fuer HELLMUTH-Einheiten
(Quelle 4 der Animations-Bibliothek; nach Ticro-Entscheidung 2026-06-17 ist
das die EINZIGE primaere Quelle). Werkzeug-Anhang H20.

Erzeugt vollstaendig in-Container (bpy 4.2.0, keine GPU, kein Download) GLB-
Clips: ein einfaches Archetyp-Skelett + gebundenes Platzhalter-Mesh + eine per
Sinus/Phasenversatz berechnete Action (KEINE Keyframe-Datensaetze von Dritten).

Patterns (MVP):
  HUMANOID (Mixamo-Layout, vier RTS-Standard-Anims; Skelett zugleich als
  Auto-Rig-Template fuer H19 nach tools/animations/templates/humanoid_template.glb
  exportiert):
    humanoid_idle    — Atem-Sinus (Spine + Head), 1 s Loop
    humanoid_walk    — Bein-/Arm-Counter-Swing, 1 s Loop
    humanoid_attack  — Wind-up + Schwung, 1 s single-shot
    humanoid_death   — Knie geben nach + Fall, 1 s single-shot

  NON-HUMANOID:
    drone_hover   — Koerper-Bob (sin z) + 4 Rotoren Dauerrotation
    insect_scurry — 6 Beine, Tripod-Gangart (Phasenversatz 0/0.5)
    plant_sway    — 4-Segment-Stamm, Schaukel-Sinus mit Hoehen-Daempfung
    plant_grow    — Stamm waechst (scale-in), einmaliger Clip
    hover_idle    — minimaler Schwebe-Idle (geringe Amplitude)

Lizenz: MIT (Eigenwerk Ticro/HELLMUTH). Kein Drittquellen-Mocap. Damit
Steam-sauber ohne jede Fremd-Klausel.

Aufruf (bpy-Modul ODER blender-Binary):
  python3 tools/animations/procedural/procedural_anim.py -- --out tools/animations/procedural
  blender -b -P tools/animations/procedural/procedural_anim.py -- --out <dir>

Output: <out>/<pattern>.glb  (Armature + Mesh + Action), 24 fps, 1 s Loop.
Zusaetzlich beim humanoid_idle: <repo>/tools/animations/templates/humanoid_template.glb
(blankes Skelett ohne Action, freischaltet H19 local-bpy-template-Backend).
"""
from __future__ import annotations

import math
import os
import sys


def _argv():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]


import bpy  # noqa: E402
import mathutils  # noqa: E402

FPS = 24
PERIOD = 24  # 1-s-Loop bei 24 fps; f=0 und f=PERIOD identisch -> nahtloser Loop


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def new_armature(name: str, bones: list[tuple[str, tuple, tuple, str | None]]):
    """bones: Liste (bone_name, head_xyz, tail_xyz, parent_name|None)."""
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for bn, head, tail, parent in bones:
        eb = arm_data.edit_bones.new(bn)
        eb.head = mathutils.Vector(head)
        eb.tail = mathutils.Vector(tail)
        if parent and parent in created:
            eb.parent = created[parent]
            eb.use_connect = False
        created[bn] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


def bind_mesh(mesh_obj, arm_obj):
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    # ARMATURE_AUTO (Bone-Heat) ist auf Primitiven robust; faellt es aus,
    # nutzt Blender Envelope.
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    except RuntimeError:
        bpy.ops.object.select_all(action="DESELECT")
        mesh_obj.select_set(True)
        arm_obj.select_set(True)
        bpy.context.view_layer.objects.active = arm_obj
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")


def start_action(arm_obj, clip_name: str):
    if arm_obj.animation_data is None:
        arm_obj.animation_data_create()
    act = bpy.data.actions.new(clip_name)
    arm_obj.animation_data.action = act
    return act


def key_rot(pb, frame: int, euler_xyz: tuple):
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = mathutils.Euler(euler_xyz, "XYZ")
    pb.keyframe_insert("rotation_euler", frame=frame)


def key_loc(pb, frame: int, loc_xyz: tuple):
    pb.location = mathutils.Vector(loc_xyz)
    pb.keyframe_insert("location", frame=frame)


def key_scale(obj, frame: int, s: float):
    obj.scale = (s, s, s)
    obj.keyframe_insert("scale", frame=frame)


def export_glb(out_dir: str, name: str, *objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    path = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB",
        export_animations=True, export_skins=True, use_selection=True,
    )
    print(f"  -> {path}")
    return path


# --- Patterns ----------------------------------------------------------------
def make_drone(out_dir: str):
    reset_scene()
    arm = new_armature("DroneRig", [
        ("body", (0, 0, 0.5), (0, 0, 0.8), None),
        ("rotor_fl", (0.4, 0.4, 0.8), (0.4, 0.4, 0.9), "body"),
        ("rotor_fr", (-0.4, 0.4, 0.8), (-0.4, 0.4, 0.9), "body"),
        ("rotor_bl", (0.4, -0.4, 0.8), (0.4, -0.4, 0.9), "body"),
        ("rotor_br", (-0.4, -0.4, 0.8), (-0.4, -0.4, 0.9), "body"),
    ])
    # Platzhalter-Mesh: Koerper-Box + 4 Rotor-Scheiben.
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0, 0, 0.65))
    body = bpy.context.active_object
    rotors = []
    for (x, y) in [(0.4, 0.4), (-0.4, 0.4), (0.4, -0.4), (-0.4, -0.4)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=0.05, location=(x, y, 0.85))
        rotors.append(bpy.context.active_object)
    # Zu einem Mesh joinen.
    bpy.ops.object.select_all(action="DESELECT")
    for o in [body] + rotors:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    mesh = body
    bind_mesh(mesh, arm)

    act = start_action(arm, "hover")
    pb_body = arm.pose.bones["body"]
    rotor_names = ["rotor_fl", "rotor_fr", "rotor_bl", "rotor_br"]
    for f in range(PERIOD + 1):
        t = f / PERIOD
        # Koerper-Bob: sanftes Auf/Ab
        key_loc(pb_body, f, (0, 0, 0.06 * math.sin(2 * math.pi * t)))
        # Rotoren: Dauerrotation (zwei Umdrehungen je Loop), abwechselnd CW/CCW
        for i, rn in enumerate(rotor_names):
            sign = 1 if i % 2 == 0 else -1
            key_rot(arm.pose.bones[rn], f, (0, 0, sign * 4 * math.pi * t))
    print("drone_hover:")
    export_glb(out_dir, "drone_hover", arm, mesh)


def make_insect(out_dir: str):
    reset_scene()
    legs = []
    bones = [("body", (0, 0, 0.2), (0, 0, 0.3), None)]
    # 6 Beine: 3 links, 3 rechts.
    for side, sx in (("L", 0.25), ("R", -0.25)):
        for i, fy in enumerate((0.2, 0.0, -0.2)):
            bn = f"leg_{side}{i}"
            bones.append((bn, (sx, fy, 0.2), (sx * 2.2, fy, 0.0), "body"))
            legs.append(bn)
    arm = new_armature("InsectRig", bones)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, 0, 0.22))
    body = bpy.context.active_object
    body.scale = (1.3, 1.0, 0.7)
    bind_mesh(body, arm)

    act = start_action(arm, "scurry")
    # Tripod-Gangart: LegL0,LegR1,LegL2 in Phase; LegR0,LegL1,LegR2 +0.5.
    phase = {"leg_L0": 0.0, "leg_R1": 0.0, "leg_L2": 0.0,
             "leg_R0": 0.5, "leg_L1": 0.5, "leg_R2": 0.5}
    for f in range(PERIOD + 1):
        t = f / PERIOD
        for bn in legs:
            ph = phase.get(bn, 0.0)
            swing = math.radians(22) * math.sin(2 * math.pi * (t + ph))
            key_rot(arm.pose.bones[bn], f, (swing, 0, 0))
    print("insect_scurry:")
    export_glb(out_dir, "insect_scurry", arm, body)


def make_plant(out_dir: str, grow: bool):
    reset_scene()
    seg = 4
    bones = []
    prev = None
    for i in range(seg):
        z0 = i * 0.3
        bn = f"stem_{i}"
        bones.append((bn, (0, 0, z0), (0, 0, z0 + 0.3), prev))
        prev = bn
    arm = new_armature("PlantRig", bones)
    # Mesh: getaperter Stapel (Kegelstumpf-Approx via skalierte Zylinder, gejoint)
    parts = []
    for i in range(seg):
        r = 0.16 * (1 - i / (seg + 1))
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=0.3, location=(0, 0, i * 0.3 + 0.15))
        parts.append(bpy.context.active_object)
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = parts[0]
    bind_mesh(mesh, arm)

    if grow:
        act = start_action(arm, "grow")
        # Wachstum: gesamte Armature scale-in 0.1 -> 1.0 ueber 1 s (kein Loop).
        for f in range(PERIOD + 1):
            t = f / PERIOD
            key_scale(arm, f, 0.1 + 0.9 * t)
        print("plant_grow:")
        export_glb(out_dir, "plant_grow", arm, mesh)
    else:
        act = start_action(arm, "sway")
        # Schaukeln: jedes Segment Sinus, Amplitude waechst nach oben.
        for f in range(PERIOD + 1):
            t = f / PERIOD
            for i in range(seg):
                amp = math.radians(3 + 3 * i)  # oben staerker
                ph = i * 0.12
                key_rot(arm.pose.bones[f"stem_{i}"], f,
                        (amp * math.sin(2 * math.pi * (t + ph)), 0, 0))
        print("plant_sway:")
        export_glb(out_dir, "plant_sway", arm, mesh)


def make_hover_idle(out_dir: str):
    reset_scene()
    arm = new_armature("HoverRig", [("body", (0, 0, 0.5), (0, 0, 0.8), None)])
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.3, location=(0, 0, 0.65))
    mesh = bpy.context.active_object
    bind_mesh(mesh, arm)
    act = start_action(arm, "idle")
    pb = arm.pose.bones["body"]
    for f in range(PERIOD + 1):
        t = f / PERIOD
        key_loc(pb, f, (0, 0, 0.03 * math.sin(2 * math.pi * t)))
    print("hover_idle:")
    export_glb(out_dir, "hover_idle", arm, mesh)


# --- Humanoid (Mixamo-Layout, vereinfacht) ----------------------------------
# Diese Bone-Liste ist gleichzeitig das Auto-Rig-Template (H19): die Namen
# folgen der Mixamo-Konvention, sodass spaetere Retargets (mediapipe-Pose-
# Extraction, eigene Videos) ueber Auto-Bone-Match laufen.

HUMANOID_BONES = [
    ("Hips",          (0, 0, 1.00), (0, 0, 1.10), None),
    ("Spine",         (0, 0, 1.10), (0, 0, 1.30), "Hips"),
    ("Spine1",        (0, 0, 1.30), (0, 0, 1.50), "Spine"),
    ("Neck",          (0, 0, 1.50), (0, 0, 1.60), "Spine1"),
    ("Head",          (0, 0, 1.60), (0, 0, 1.75), "Neck"),
    ("LeftShoulder",  ( 0.04, 0, 1.50), ( 0.15, 0, 1.50), "Spine1"),
    ("LeftArm",       ( 0.15, 0, 1.50), ( 0.40, 0, 1.50), "LeftShoulder"),
    ("LeftForeArm",   ( 0.40, 0, 1.50), ( 0.60, 0, 1.50), "LeftArm"),
    ("LeftHand",      ( 0.60, 0, 1.50), ( 0.70, 0, 1.50), "LeftForeArm"),
    ("RightShoulder", (-0.04, 0, 1.50), (-0.15, 0, 1.50), "Spine1"),
    ("RightArm",      (-0.15, 0, 1.50), (-0.40, 0, 1.50), "RightShoulder"),
    ("RightForeArm",  (-0.40, 0, 1.50), (-0.60, 0, 1.50), "RightArm"),
    ("RightHand",     (-0.60, 0, 1.50), (-0.70, 0, 1.50), "RightForeArm"),
    ("LeftUpLeg",     ( 0.10, 0, 1.00), ( 0.10, 0, 0.55), "Hips"),
    ("LeftLeg",       ( 0.10, 0, 0.55), ( 0.10, 0, 0.10), "LeftUpLeg"),
    ("LeftFoot",      ( 0.10, 0, 0.10), ( 0.10, 0.15, 0.05), "LeftLeg"),
    ("RightUpLeg",    (-0.10, 0, 1.00), (-0.10, 0, 0.55), "Hips"),
    ("RightLeg",      (-0.10, 0, 0.55), (-0.10, 0, 0.10), "RightUpLeg"),
    ("RightFoot",     (-0.10, 0, 0.10), (-0.10, 0.15, 0.05), "RightLeg"),
]


def _humanoid_placeholder_mesh():
    """Platzhalter-Geometrie als EIN Mesh: Rumpf-Zylinder, Hals, Kopf, Arm-/
    Bein-Boxen, Fuesse. Die Echt-Sprites kommen spaeter aus KREA/TRELLIS und
    werden ueber H19 auf dasselbe Skelett gerigt.

    Zwei Eigenschaften, die das frueher zerfallende Modell heilen:
      1. Segmente UEBERLAPPEN (kein Loch zwischen Rumpf, Oberschenkel, Schienbein
         -- die Beine reichen jetzt von Huefte 1.05 bis Knoechel 0.10 und greifen
         am Knie ineinander).
      2. Jedes Segment bekommt eine eigene Vertex-Gruppe (Bone-Name, Gewicht 1.0)
         -- starres Binding pro Bone. Bone-Heat (ARMATURE_AUTO) scheitert auf
         getrennten Primitiv-Inseln und liefert die zerfallende Figur; das
         vermeiden wir hier vollstaendig."""
    specs = []  # (obj, bone_name)

    def cube(size, loc, scale, bone):
        bpy.ops.mesh.primitive_cube_add(size=size, location=loc)
        o = bpy.context.active_object; o.scale = scale
        specs.append((o, bone)); return o

    def cyl(r, d, loc, bone):
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc)
        o = bpy.context.active_object
        specs.append((o, bone)); return o

    def sph(r, loc, bone):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc)
        o = bpy.context.active_object
        specs.append((o, bone)); return o

    # Rumpf (Hueftansatz 1.00 -> Schulter 1.52), Hals, Kopf.
    cyl(0.13, 0.52, (0, 0, 1.26), "Spine")
    cyl(0.05, 0.12, (0, 0, 1.55), "Neck")
    sph(0.11, (0, 0, 1.67), "Head")
    # Arme + Beine je Seite. Boxen ueberlappen Nachbarsegment + Rumpf.
    for sign, side in ((1, "Left"), (-1, "Right")):
        cube(0.08, (sign * 0.26, 0, 1.50), (3.3, 1, 1), f"{side}Arm")
        cube(0.07, (sign * 0.50, 0, 1.50), (3.0, 1, 1), f"{side}ForeArm")
        cube(0.10, (sign * 0.10, 0, 0.80), (1, 1, 5.0), f"{side}UpLeg")
        cube(0.09, (sign * 0.10, 0, 0.34), (1, 1, 5.33), f"{side}Leg")
        cube(0.08, (sign * 0.10, 0.05, 0.07), (1, 2.0, 0.7), f"{side}Foot")

    # Pro Teil eine Vertex-Gruppe (Bone-Name, Gewicht 1.0). join() merged die
    # Gruppen namensgleich und behaelt die Gewichte.
    for o, bone in specs:
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")

    objs = [o for o, _ in specs]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    return objs[0]


def _bind_humanoid(mesh_obj, arm_obj):
    """Starres Binding ueber die vorab gesetzten Vertex-Gruppen. parent_set
    (type=ARMATURE) nutzt vorhandene Gruppen statt Bone-Heat. Armature-Modifier
    wird defensiv sichergestellt (sonst bliebe das Mesh statisch)."""
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE")
    mod = mesh_obj.modifiers.get("Armature") or mesh_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    mod.use_vertex_groups = True


def _build_humanoid():
    arm = new_armature("HumanoidRig", HUMANOID_BONES)
    mesh = _humanoid_placeholder_mesh()
    _bind_humanoid(mesh, arm)
    return arm, mesh


def _export_humanoid_template(templates_dir: str):
    """Schreibt das BLANKE Skelett (ohne Action) als H19-Template (Geschwister
    von --out). Wird beim ersten Humanoid-Pattern erzeugt; ueberschreibt
    bestehende Templates."""
    reset_scene()
    arm, mesh = _build_humanoid()
    os.makedirs(templates_dir, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); mesh.select_set(True)
    path = os.path.join(templates_dir, "humanoid_template.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB",
        export_animations=False, export_skins=True, use_selection=True,
    )
    print(f"  template -> {path}")


def make_humanoid_idle(out_dir: str):
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "idle")
    # Atem: Spine/Spine1 leichtes Schwellen, Head minimales Wiegen.
    for f in range(PERIOD + 1):
        t = f / PERIOD
        breath = math.radians(2.5) * math.sin(2 * math.pi * t)
        key_rot(arm.pose.bones["Spine"], f, (breath, 0, 0))
        key_rot(arm.pose.bones["Spine1"], f, (breath * 0.6, 0, 0))
        key_rot(arm.pose.bones["Head"], f,
                (0, 0, math.radians(2) * math.sin(2 * math.pi * (t + 0.15))))
        # Mini-Hueft-Bob
        key_loc(arm.pose.bones["Hips"], f,
                (0, 0, 0.005 * math.sin(2 * math.pi * t)))
    print("humanoid_idle:")
    export_glb(out_dir, "humanoid_idle", arm, mesh)


def make_humanoid_walk(out_dir: str):
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "walk")
    # Bein-Pendel: links/rechts gegenphasig in x-Rotation (Pitch um Huefte).
    # Knie beugen waehrend Schwingphase. Arme im Counter-Swing zur Schulter.
    amp_leg = math.radians(28)
    amp_knee = math.radians(35)
    amp_arm = math.radians(32)
    for f in range(PERIOD + 1):
        t = f / PERIOD
        s = math.sin(2 * math.pi * t)
        s_arm = math.sin(2 * math.pi * (t + 0.5))     # Counter-Swing
        # Beine
        key_rot(arm.pose.bones["LeftUpLeg"], f, (-amp_leg * s, 0, 0))
        key_rot(arm.pose.bones["RightUpLeg"], f, ( amp_leg * s, 0, 0))
        # Knie beugen NUR waehrend der Schwingphase (negative Halbwelle)
        key_rot(arm.pose.bones["LeftLeg"], f, (max(0.0, amp_knee * s), 0, 0))
        key_rot(arm.pose.bones["RightLeg"], f, (max(0.0, -amp_knee * s), 0, 0))
        # Arme counter-swingen den Beinen
        key_rot(arm.pose.bones["LeftArm"], f, ( amp_arm * s, 0, 0))
        key_rot(arm.pose.bones["RightArm"], f, (-amp_arm * s, 0, 0))
        # Hueft-Bob + Hueft-Sway
        key_loc(arm.pose.bones["Hips"], f,
                (0.01 * s_arm, 0,
                 0.02 * abs(math.sin(2 * math.pi * 2 * t))))  # 2× Bob pro Schritt
        # Spine leicht counter-twist
        key_rot(arm.pose.bones["Spine"], f, (0, 0, math.radians(4) * s_arm))
    print("humanoid_walk:")
    export_glb(out_dir, "humanoid_walk", arm, mesh)


def make_humanoid_attack(out_dir: str):
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "attack")
    # Single-shot 1 s. Phasen:
    #   t in [0.00, 0.30]: Wind-up (rechter Arm hebt zurueck, Spine twist L)
    #   t in [0.30, 0.50]: Schlag (rechter Arm schnell vor, Spine twist R)
    #   t in [0.50, 1.00]: Recovery zurueck zu Idle
    # Animator-Hit-Frame (hitFrameIdx ~ Mitte) sitzt im Schlag-Peak.
    for f in range(PERIOD + 1):
        t = f / PERIOD
        if t <= 0.30:
            u = t / 0.30
            r_arm = math.radians(-100) * u           # zurueck/hoch
            r_fore = math.radians(70) * u            # Unterarm beugt
            spine_z = math.radians(-12) * u
        elif t <= 0.50:
            u = (t - 0.30) / 0.20
            r_arm = math.radians(-100) * (1 - u) + math.radians(70) * u
            r_fore = math.radians(70) * (1 - u) + math.radians(10) * u
            spine_z = math.radians(-12) * (1 - u) + math.radians(18) * u
        else:
            u = (t - 0.50) / 0.50
            r_arm = math.radians(70) * (1 - u)
            r_fore = math.radians(10) * (1 - u)
            spine_z = math.radians(18) * (1 - u)
        key_rot(arm.pose.bones["RightArm"], f, (r_arm, 0, 0))
        key_rot(arm.pose.bones["RightForeArm"], f, (r_fore, 0, 0))
        key_rot(arm.pose.bones["Spine"], f, (0, 0, spine_z))
        key_rot(arm.pose.bones["Spine1"], f, (0, 0, spine_z * 0.6))
        # Linker Arm bleibt leicht angewinkelt (Balance).
        key_rot(arm.pose.bones["LeftArm"], f, (math.radians(-8), 0, 0))
        key_rot(arm.pose.bones["LeftForeArm"], f, (math.radians(20), 0, 0))
    print("humanoid_attack:")
    export_glb(out_dir, "humanoid_attack", arm, mesh)


def make_humanoid_death(out_dir: str):
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "death")
    # Single-shot 1 s, kein Loop. Phasen:
    #   t in [0.00, 0.25]: Treffer-Reaktion (Spine leichte Vorbeuge)
    #   t in [0.25, 0.65]: Knie geben nach, Hueftfall nach unten
    #   t in [0.65, 1.00]: Endpose -- Skelett liegt
    for f in range(PERIOD + 1):
        t = f / PERIOD
        if t <= 0.25:
            u = t / 0.25
            spine_x = math.radians(15) * u
            knee = math.radians(0)
            hips_z = 0.0
            hips_x_rot = 0.0
        elif t <= 0.65:
            u = (t - 0.25) / 0.40
            spine_x = math.radians(15) + math.radians(30) * u
            knee = math.radians(70) * u
            hips_z = -0.35 * u
            hips_x_rot = math.radians(20) * u
        else:
            u = (t - 0.65) / 0.35
            spine_x = math.radians(45) + math.radians(20) * u
            knee = math.radians(70)
            hips_z = -0.35
            hips_x_rot = math.radians(20) + math.radians(15) * u
        key_rot(arm.pose.bones["Spine"], f, (spine_x * 0.5, 0, 0))
        key_rot(arm.pose.bones["Spine1"], f, (spine_x * 0.5, 0, 0))
        key_rot(arm.pose.bones["LeftLeg"], f, (knee, 0, 0))
        key_rot(arm.pose.bones["RightLeg"], f, (knee, 0, 0))
        key_loc(arm.pose.bones["Hips"], f, (0, 0, hips_z))
        key_rot(arm.pose.bones["Hips"], f, (hips_x_rot, 0, 0))
        # Arme schlaff nach unten/aussen
        key_rot(arm.pose.bones["LeftArm"], f, (math.radians(-30) * (t), 0, 0))
        key_rot(arm.pose.bones["RightArm"], f, (math.radians(-30) * (t), 0, 0))
    print("humanoid_death:")
    export_glb(out_dir, "humanoid_death", arm, mesh)


def make_humanoid_knockback_light(out_dir: str):
    # Leichte Einheit: Flug-Bogen mit Tumble-Spin (SOLUTIONS-KNOCKBACK §7.3
    # knockback_light, auf das Humanoid-Rig gehoben statt Single-Obj). Single-shot,
    # 12 Frames. Hips traegt Wurf-Parabel + Drift + Spin, Glieder schlackern passiv.
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "knockback_light")
    frames, peak, spin_turns = 12, 1.6, 1.5
    for f in range(frames + 1):
        t = f / frames
        arc = 4 * peak * t * (1 - t)          # Wurf-Parabel (hoch, dann runter)
        drift = -2.4 * t                      # weg vom Epizentrum (lokale x)
        key_loc(arm.pose.bones["Hips"], f, (drift, 0, arc))
        key_rot(arm.pose.bones["Hips"], f, (0.4 * math.sin(t * math.pi * 3), spin_turns * 2 * math.pi * t, 0))
        flail = math.radians(40) * math.sin(t * math.pi * 2)
        key_rot(arm.pose.bones["LeftArm"], f, (flail, 0, 0))
        key_rot(arm.pose.bones["RightArm"], f, (-flail, 0, 0))
        key_rot(arm.pose.bones["LeftLeg"], f, (flail * 0.5, 0, 0))
        key_rot(arm.pose.bones["RightLeg"], f, (-flail * 0.5, 0, 0))
    print("humanoid_knockback_light:")
    export_glb(out_dir, "humanoid_knockback_light", arm, mesh)


def make_humanoid_knockback_heavy(out_dir: str):
    # Schwere Einheit: staggert zurueck, kein Flip (SOLUTIONS-KNOCKBACK §7.3
    # knockback_heavy). Single-shot, 10 Frames. Lean-back + Arme fangen den Stoss.
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "knockback_heavy")
    frames, back, lean = 10, 1.6, 0.35
    for f in range(frames + 1):
        t = f / frames
        key_loc(arm.pose.bones["Hips"], f, (-back * t, 0, 0.25 * math.sin(t * math.pi)))
        key_rot(arm.pose.bones["Spine"], f, (-lean * math.sin(t * math.pi), 0, 0))
        key_rot(arm.pose.bones["Spine1"], f, (-lean * 0.6 * math.sin(t * math.pi), 0, 0))
        catch = math.radians(-25) * math.sin(t * math.pi)
        key_rot(arm.pose.bones["LeftArm"], f, (catch, 0, 0))
        key_rot(arm.pose.bones["RightArm"], f, (catch, 0, 0))
    print("humanoid_knockback_heavy:")
    export_glb(out_dir, "humanoid_knockback_heavy", arm, mesh)


def make_humanoid_knockback_landing(out_dir: str):
    # Bodenaufschlag: Squash + kurzer deterministischer Shake (SOLUTIONS-KNOCKBACK
    # §7.3 knockback_landing). Single-shot, 8 Frames. Non-uniformer Squash auf das
    # Armature-Objekt (breiter/flacher -> erholt sich), Knie federn, fixer RNG-Seed.
    import random
    reset_scene()
    arm, mesh = _build_humanoid()
    start_action(arm, "knockback_landing")
    frames, squash, shake = 8, 0.7, 0.08
    rng = random.Random(7)
    for f in range(frames + 1):
        t = f / frames
        s = 1 - (1 - squash) * (1 - t) ** 2   # squash erholt sich zu 1
        arm.scale = (1 / s, 1 / s, s)
        arm.keyframe_insert("scale", frame=f)
        if f < frames - 1:
            jx = rng.uniform(-shake, shake) * (1 - t)
            jy = rng.uniform(-shake, shake) * (1 - t)
        else:
            jx = jy = 0.0
        key_loc(arm.pose.bones["Hips"], f, (jx, jy, 0))
        spring = math.radians(50) * (1 - t)
        key_rot(arm.pose.bones["LeftLeg"], f, (spring, 0, 0))
        key_rot(arm.pose.bones["RightLeg"], f, (spring, 0, 0))
    print("humanoid_knockback_landing:")
    export_glb(out_dir, "humanoid_knockback_landing", arm, mesh)


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="tools/animations/procedural")
    ap.add_argument("--templates-dir", default=None,
                    help="Ziel fuer humanoid_template.glb (Default: Geschwister "
                         "von --out, z. B. tools/animations/templates).")
    args = ap.parse_args(_argv())
    os.makedirs(args.out, exist_ok=True)
    out_abs = os.path.abspath(args.out)
    templates_dir = args.templates_dir or os.path.join(os.path.dirname(out_abs), "templates")

    # Humanoid zuerst: das blanke Skelett laeuft als H19-Auto-Rig-Template raus.
    _export_humanoid_template(templates_dir)
    make_humanoid_idle(args.out)
    make_humanoid_walk(args.out)
    make_humanoid_attack(args.out)
    make_humanoid_death(args.out)
    # Knockback-Reaktionen (SOLUTIONS-KNOCKBACK §7.3): light/heavy/landing.
    make_humanoid_knockback_light(args.out)
    make_humanoid_knockback_heavy(args.out)
    make_humanoid_knockback_landing(args.out)

    # Non-humanoid (bestehende Patterns).
    make_drone(args.out)
    make_insect(args.out)
    make_plant(args.out, grow=False)
    make_plant(args.out, grow=True)
    make_hover_idle(args.out)
    print(f"OK: 7 humanoid + 5 non-humanoid Clips -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
