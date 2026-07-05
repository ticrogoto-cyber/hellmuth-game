# tools/animations — Animations-Bibliothek (Stufe 3 der 3D-Pipeline)

**Ticro-Entscheidung 2026-06-17: Mixamo und Truebones sind gestrichen.** Was
Mixamo abdeckt (Idle, Walk, Attack, Death) erzeugen wir prozedural; non-humanoid
sowieso. CMU bleibt als optionaler Public-Domain-Backfill, ist aber für den MVP
nicht nötig. AMASS/HumanML3D/Bandai Namco/MotionGPT-Outputs werden gar nicht
erst angefasst (research-only/NC, würde Steam-Release vergiften).

Damit hat HELLMUTH **eine** primäre Quelle: das eigene `procedural_anim.py`
(MIT, Eigenwerk, keine Fremd-Klausel). Das ist Steam-juristisch unproblematisch
und sofort reproduzierbar.

```
tools/animations/
├── README.md
├── anim_library.py           Bibliotheks-Index -> MANIFEST.json
├── fetch_animations.py       Optionaler CMU-Backfill (kein Account, nur Mirror)
├── templates/
│   ├── README.md
│   └── humanoid_template.glb  (von procedural_anim.py erzeugt; H19-Auto-Rig)
├── procedural/               Primaere Quelle, MIT, 4 humanoid + 5 non-humanoid
└── cmu/                      (optional, leer wenn nicht gezogen)
```

## Inhalt (Stand: in dieser Session generiert)

| Pattern | Archetyp | Loop | Sekunden | Quelle |
|---|---|---|---|---|
| `humanoid_idle` | bipede | ja | 1 | procedural |
| `humanoid_walk` | bipede | ja | 1 | procedural |
| `humanoid_attack` | bipede | nein (single-shot) | 1 | procedural |
| `humanoid_death` | bipede | nein (single-shot) | 1 | procedural |
| `drone_hover` | Drohne (4 Rotoren) | ja | 1 | procedural |
| `insect_scurry` | 6-Bein-Insekt (Tripod-Gang) | ja | 1 | procedural |
| `plant_sway` | 4-Segment-Pflanze | ja | 1 | procedural |
| `plant_grow` | 4-Segment-Pflanze | nein | 1 | procedural |
| `hover_idle` | generisch | ja | 1 | procedural |

**Skelett-Template** für `tools/auto_rig_3d.py --backend local-bpy-template`:
`templates/humanoid_template.glb` — wird vom selben Generator als blankes
Skelett mit Platzhalter-Mesh exportiert (Mixamo-kompatibles Bone-Layout: Hips,
Spine[1], Neck, Head, [Left|Right]{Shoulder,Arm,ForeArm,Hand,UpLeg,Leg,Foot}).

## Bedienung

```bash
# Vollständige Bibliothek aus einem Befehl (deterministisch reproduzierbar):
python3 tools/animations/procedural/procedural_anim.py -- \
    --out tools/animations/procedural

# Optional: CMU-Backfill (Mirror-Download, kein Account)
python3 tools/animations/fetch_animations.py cmu

# Index der vorhandenen Clips
python3 tools/animations/anim_library.py
```

## Lizenz-Lage

| Quelle | Lizenz | Steam | Bemerkung |
|---|---|---|---|
| **procedural** (alle 9 Clips + Template) | MIT (Eigenwerk Ticro Goto) | **JA**, keine Attribution | Pflicht- + sichere Quelle |
| **cmu** (optional) | Public Domain / permissive | JA | Acknowledgement NSF EIA-0196217 in den Spiel-Credits |
| ~~Mixamo~~ | gestrichen | — | Adobe-Account + Resale-Negativklausel; Ticro will den Account-Pfad nicht |
| ~~Truebones~~ | gestrichen | — | Gumroad-Login; non-humanoid erzeugen wir prozedural |
| **NICHT** AMASS/HumanML3D/Bandai Namco/MotionGPT | research-only / NC | NEIN | Würde Steam-Release vergiften |
