# Skelett-Templates (Stufe 2 / Werkzeug 19)

Skelett-Templates für `auto_rig_3d.py --backend local-bpy-template`. Dieser
Backend-Pfad nutzt Blender `bpy.ops.object.parent_set(type='ARMATURE_AUTO')`
(Bone-Heat-Auto-Skinning) gegen ein vorgefertigtes Skelett.

## `humanoid_template.glb` — EIGENWERK, MIT

**Ticro-Entscheidung 2026-06-17:** Mixamo wird nicht mehr verwendet (Account +
Resale-Negativklausel unnötig). Das Skelett-Template wird vom **eigenen**
prozeduralen Generator erzeugt — kein Drittquellen-Mocap, keine Fremd-Klausel,
Steam-juristisch unproblematisch.

**Erzeugen (deterministisch, jederzeit reproduzierbar):**

```bash
python3 tools/animations/procedural/procedural_anim.py -- \
    --out tools/animations/procedural
```

Der Generator schreibt `humanoid_template.glb` (blankes Skelett + Platzhalter-
Mesh, **keine** Action) automatisch als Geschwister von `--out`. Bone-Layout
folgt der Mixamo-Konvention (Hips → Spine/Spine1 → Neck/Head, plus
[Left|Right]{Shoulder,Arm,ForeArm,Hand,UpLeg,Leg,Foot}), damit spätere
Retargets auf Mixamo-Quellen über Auto-Bone-Match laufen würden — aber kein
Mixamo-Asset selbst ist hier.

## Optional: Quadruped/Drohnen-Templates

Für non-humanoide Archetypen ist UniRig (Cloud-Backend in `auto_rig_3d.py`) der
empfohlene Weg — es generiert das Skelett aus dem Mesh selbst. Hand-gefertigte
Templates für Quadruped/Drohne können hier abgelegt und über
`--template <pfad>` adressiert werden.

## Lizenz

`humanoid_template.glb` ist Eigenwerk Ticro/HELLMUTH unter MIT (siehe
`../procedural/LICENSE.md`). Reproduzierbar aus dem Generator, keine externen
Datenquellen.
