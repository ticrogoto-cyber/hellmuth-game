# ANIMATIONS-PIPELINE — VOLL (Code3)

Umsetzung des Briefs `CODE3ANIMATIONSDETAIL.md` gegen die Solutions-Quelle
`solutions/SOLUTIONS-ANIMATIONS-AUTO.md` (824 Zeilen, hier auf der Linie
abgelegt; urspruenglich Branch `claude/eloquent-hawking-be4v29`). Stand 2026-06-18.

Dieses Dokument ist der Nachweis für den **vereinheitlichten Einstiegspunkt**
`animate_glb.py`. Die darunterliegenden Stufen (Validierung, Auto-Rig, Retarget,
Iso-Render) sind bereits als Welle-4-Werkzeuge H18–H21 gebaut und dokumentiert in
`docs/PIPELINE-ANIMATIONS-IMPLEMENTATION.md`.

> **Anpassung an die HELLMUTH-Realität (verbindlich).** Der Brief vergibt die
> Hebel H12/H13 und nennt acht Animations-Quellen. Beides ist überholt:
> H12/H13 sind seit Welle 2 belegt (mediapipe, knip+madge) → neue Hebel sind
> **H26/H27**. Quellen sind per Ticro-Strike (2026-06-17) auf **prozedural +
> CMU** reduziert; Mixamo und Truebones sind raus (Strike *und* 403 im
> Container). Alles andere im Brief gilt unverändert.

Marker: `[ausgeführt]` = in diesem Container gelaufen. `[recherchiert]` = belegt,
hier nicht ausgeführt.

---

## 1. Pipeline-Architektur

```
  Ticro (manuell, KREA-UI)        Code-Session (vollautomatisch, bpy 4.2.0)
  ┌───────────────┐   ┌────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────┐
  │ Bild → 3D-GLB │ → │ H18    │→ │ H19      │→ │ H26          │→ │ H21          │
  │ (Hunyuan/     │   │ glb_   │  │ auto_rig │  │ animate_glb  │  │ render_iso_  │
  │  TRELLIS)     │   │ validate│ │ _3d      │  │ (+H27/H20)   │  │ sheet → Atlas│
  └───────────────┘   └────────┘  └──────────┘  └─────────────┘  └──────────────┘
```

### 1.1 Eingabe
Gerigtes GLB. Humanoid: Mixamo-Bone-Konvention (`Hips`, `LeftArm`, …; das
HELLMUTH-Template `humanoid_template.glb` folgt ihr). Non-humanoid: deskriptive
Namen (`body`, `rotor_fl`, `stem_0`, …). Beide werden toleriert.

### 1.2 Backend-Wahl (Dispatch in `animate_glb.py`)
```
idle | walk | attack | death      → Retarget-Pfad
hover | breath | skitter | sway    → Prozedural-Direkt-Pfad
quad_walk                          → KANON-LÜCKE (siehe §7)
```

### 1.3 Retarget-Pfad (humanoid)
1. `anim_library.resolve(<type>, family="humanoid")` (H27) liefert die
   Quell-Action (prozedurale GLB, MIT; optional CMU-BVH).
2. `retarget_animation.retarget_with_bpy` (H20) wird **als Modul** aufgerufen
   (kein Subprozess): Ziel-GLB + Quelle laden, Bones automatisch matchen
   (`mixamorig:`-Präfix-tolerant), Copy-Rotation-Constraints, `nla.bake`
   (`visual_keying`, `clear_constraints`), Quell-Armature + verwaiste Actions
   entfernen, GLB exportieren.
3. Output trägt **genau einen** Clip.

### 1.4 Prozedural-Direkt-Pfad (non-humanoid)
Ziel-GLB laden, Bone-Rollen per Regex matchen
(`root|leg|stem`), Sinus-Keyframes **direkt auf die Pose-Bones des hochgeladenen
Rigs** schreiben, vorhandene Actions vorher löschen, GLB exportieren. Bewusst
abgegrenzt vom Generator `procedural_anim.py` (der ein Skelett *von Grund auf*
baut) — hier wird ein *fremdes* Rig animiert. Frequenzen/Amplituden bleiben
konsistent (24 fps, 1-s-Loop).

### 1.5 Audit nach Generierung (Brief §2.5)
`pygltflib` liest das Output-GLB ohne erneuten bpy-Start: ≥1 Animation, Länge
> 0.5 s (aus Sampler-Input-Accessor `.max`), ≥1 Keyframe-Kanal. Sonst Exit-Code
`6` (`EXIT_AUDIT_FAIL`).

### 1.6 Downstream
`render_iso_sheet.py` (H21): 36.87°-Iso (`asin(0.6)`), 8 Richtungen,
FPS-Sampling, `film_transparent`, Cycles-CPU → PNG-Sequenz → `pack_atlas.py`
(H16) → Phaser-Atlas (PNG + JSON). Frame-Schlüssel `<unit>_<clip>_<dir>_<frame>`
nach UnitAnimator-Vertrag.

---

## 2. Animations-Bibliothek

### 2.1 Layout (real, reduziert)
```
tools/animations/
  procedural/   9 GLB-Clips (Eigenwerk, MIT): humanoid_{idle,walk,attack,death},
                drone_hover, insect_scurry, plant_sway, plant_grow, hover_idle
  cmu/          (leer; optionaler Public-Domain-Backfill via fetch_animations.py)
  templates/    humanoid_template.glb (blankes Skelett, H19-Auto-Rig-Template)
  MANIFEST.json (anim_library.py --json)
```
Kein SQLite-Cache: bei zwei Quellen wäre das Over-Engineering. `anim_library.py`
scannt die Ordner und löst per `resolve()`/`search()` auf (H27).

### 2.2 Quellen mit Bezug
| Quelle | Bezug | Status |
|---|---|---|
| Prozedural (Eigenwerk) | `tools/animations/procedural/procedural_anim.py` | **[ausgeführt]**, 9 Clips erzeugt |
| CMU Mocap | `git clone https://github.com/una-dinosauria/cmu-mocap` (github = 200) | **[recherchiert]**, optional, nicht gezogen |

### 2.3 Index-Schema (`MANIFEST.json`)
`{sources: {<src>: {license, clip_count, clips: [{name, file, format, bytes,
license_sidecar}]}}}`. `resolve(archetype, family)` → Pfad (Präferenz prozedural
> CMU, dann kleinste Datei). `search(query)` → Pfadliste.

---

## 3. Werkzeug-Specs + PASS-Beweise

### H26 `tools/animate_glb.py`
```
python3 tools/animate_glb.py --rig <in>.glb --anim-type <type> --out <out>.glb
       [--source <override>] [--mapping <bones.json>] [--scene-fps 24]
Exit: 0 ok | 2 keine Armature | 5 keine Quelle | 6 Audit-Fail | 7 anim-type unbekannt
```
PASS (pure-python, kein bpy): `animate_glb importierbar, 8 anim-types
(retarget+prozedural)`.

### H27 `tools/animations/anim_library.py` (`resolve`/`search`)
```
anim_library.py status               Tabelle (Default)
anim_library.py resolve <archetype>  bester Quell-Clip-Pfad
anim_library.py search <query>       Treffer-Pfade
```
PASS: `resolve walk -> humanoid_walk.glb, search humanoid -> 5 Treffer`.

`werkzeuge_check.py` gesamt nach dieser Welle: H18–H22 PASS, H23 RESERVED (Env),
H24 PASS, **H26 PASS, H27 PASS**.

---

## 4. Prozedurale Patterns

Die im Brief §5.5 skizzierten Einzelmodule (`_drone_hover.py`,
`_insect_skitter.py`, `_plant_sway.py`, `_breath_idle.py`) wurden **nicht** als
separate Dateien angelegt — das wäre Doppelimplementierung. Die Pattern-Mathematik
liegt an genau zwei Stellen:

| Pattern | Generator (`procedural_anim.py`) | Direkt-auf-Rig (`animate_glb.py`) |
|---|---|---|
| hover | `make_drone` (Body-Bob + 4 Rotoren) | `run_procedural` role=root/leg |
| breath | (Idle-Atmen, `make_humanoid_idle`) | `run_procedural` role=root, Scale-Sinus |
| skitter | `make_insect` (Tripod, Phasen 0/0.5) | `run_procedural` role=leg |
| sway | `make_plant` (Höhen-gedämpfter Sinus) | `run_procedural` role=stem |

Humanoid idle/walk/attack/death: im Generator als vollständige Clips, im
Dispatcher über den Retarget-Pfad auf beliebige Rigs übertragbar.

---

## 5. End-to-End-Test-Resultate `[ausgeführt]`

Eingaben: `humanoid_template.glb` (19 Bones) und `drone_hover.glb`. Alle Läufe
in diesem Container, bpy 4.2.0, Cycles-CPU, keine GPU, kein Netz.

### 5.1 Animation (`animate_glb.py`)
| Befehl | Pfad | Zeit | Audit |
|---|---|---|---|
| `--anim-type walk` | retarget | 1.0 s | PASS 1 Anim, 57 Kanäle, 1.00 s |
| `--anim-type idle` | retarget | 0.8 s | PASS 1 Anim, 57 Kanäle, 1.00 s |
| `--anim-type attack` | retarget | 0.8 s | PASS 1 Anim, 57 Kanäle, 1.00 s |
| `--anim-type death` | retarget | 0.8 s | PASS 1 Anim, 57 Kanäle, 1.00 s |
| `--anim-type hover` (drone) | prozedural | 0.6 s | PASS 1 Anim, 15 Kanäle, 1.00 s |

Bone-Match Template↔prozedurale Quelle: **19/19**. Zeiten liegen weit unter der
Brief-Schätzung (45 s humanoid), weil die Skelette klein sind (19 Bones, 24
Frames). Der **erste** bpy-Lauf im Container zahlt einen Kaltstart (~22–44 s),
danach ~1 s. Retarget backt Copy-Rotation auf allen Bones plus Copy-Location
auf dem Hüft-/Root-Bone (Solutions §2.3 Schritt 5): die Hüft-Translation der
Quelle (x-Sway 0.02, z-Bob 0.02) wird 1:1 übertragen, verifiziert gegen
`humanoid_walk.glb`. `render_unit.strip_root_motion` friert X/Y fürs Sprite ein
(on-the-spot), behält das Z-Wippen.

### 5.2 Downstream (`render_iso_sheet.py` → Atlas)
| Eingabe | Auflösung | Richtungen×Frames | Zeit | Output |
|---|---|---|---|---|
| `template_walk.glb` | 128 px | 8 × 13 = 104 | 22.0 s | `testsoldat_walk.png` (180 KB) + `.json` (40 KB) |

Atlas-Beweis liegt unter `proof/animations/e2e/testsoldat_walk.{png,json}`.
Frame-Schlüssel `testsoldat_walk_000_00 …`, JSON Phaser-konform (`trimmed`,
`spriteSourceSize`, `sourceSize`).

### 5.3 Korrigierter Latent-Bug in H20
`retarget_animation.py` war bis hierher nur **import-getestet** (H20 [RES]). Der
echte Lauf deckte zwei Defekte auf, beide gefixt:
1. `bpy.ops.object.select_all` pollte im POSE-Mode unter dem bpy-Modul fehl
   („context is incorrect“) → Deselect über die Daten-API.
2. Die Quell-Action wurde mitexportiert (Output hatte 2 Clips) → verwaiste
   Actions vor dem Export entfernt.

---

## 6. Lizenz-Klauseln (pro genutzter Quelle)

| Quelle | Klausel (wörtlich/zitiert) | Bewertung |
|---|---|---|
| Prozedural (Eigenwerk) | MIT, Ticro/HELLMUTH. Kein Drittquellen-Mocap. | Steam-sauber, keine Fremdklausel |
| CMU Mocap | »This data is free for use in research and commercial projects worldwide.« (mocap.cs.cmu.edu) `[recherchiert]` | Frei kommerziell, kein Resale der Roh-DB |

---

## 7. Ausgeschlossene Quellen (Begründung)

| Quelle | Grund |
|---|---|
| Mixamo (HF-Dump, Truebones-Mirror) | Ticro-Strike 2026-06-17 **und** 403 (HF/Gumroad im Container nicht erreichbar) |
| Truebones ZOO / Monsterbones | Ticro-Strike **und** 403 (Gumroad) |
| Quaternius / KayKit / OpenGameArt | 403 (itch.io/OpenGameArt); durch Prozedural ersetzt |
| AMASS / HumanML3D / KIT-ML / Motion-X + Text-zu-Motion (MotionGPT, MDM, MoMask, …) | Max-Planck verbietet kommerzielle Artefakte vertraglich (Brief §C4, Solutions §1) |
| SuperAnimal-Quadruped, SMAL, Animal-Pose, Bandai-Namco, GRAB | CC-BY-NC / Research-only (Brief §C4) |

### KANON-LÜCKE
- **quad_walk**: braucht eine Quadruped-Quelle. Truebones-ZOO (die im Brief
  vorgesehene Quelle) ist gestrichen, eine prozedurale Vierbeiner-Gangart ist
  noch nicht spezifiziert. `animate_glb.py --anim-type quad_walk` gibt Exit 7 mit
  klarer Begründung statt zu raten. Gehört Ticro.

---

## 8. Erfolgsmaßstab (Brief) — Status

> »Ticro lädt ein neues GLB hoch. Du rufst `animate_glb.py --rig <name>.glb
> --anim-type walk --out walk.glb`. Nach ~45 s liegt das animierte GLB. Phaser-
> Atlas folgt mit `render_unit.py | pack_atlas.py`. Werkzeug-Audit grün.«

Erfüllt `[ausgeführt]`: ein Befehl → animiertes GLB (≈1 s, Audit PASS), Atlas via
H21 (`render_iso_sheet` kapselt `render_unit` + `pack_atlas`), H26/H27 PASS.
Vollautomatisch, in-Container, kein Netz, kein Pay-per-Use.
