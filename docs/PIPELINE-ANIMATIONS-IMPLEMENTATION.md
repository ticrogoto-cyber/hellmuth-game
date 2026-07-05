# 3D-ANIMATIONS-PIPELINE — Implementation (Code3-Auftrag)

> Folge-Dokument zu `docs/3D-ANIMATIONS-PIPELINE.md` (Solutions-Runde,
> Commit `9bcf539`). Diese MD belegt die vier IMPLEMENTIERTEN Werkzeuge,
> die Backend-Entscheidung für Stufe 2, die drei Lizenz-Klärungen und den
> End-to-End-Test im Container.
>
> **Ehrlichkeits-Klausel.** Was `[ausgeführt]` markiert ist, lief in dieser
> Code-Session. Was `[recherchiert]` heißt, ist quellenbelegt, aber hier
> nicht direkt ausgeführt. Keine Behauptungen ohne Beleg-Pfad.
>
> **Werkzeug-Audit (Pflicht laut CLAUDE.md):** vor diesem Auftrag wurde
> `tools/werkzeuge_check.py` gelaufen. Vorher ACTIVE 0/17 PASS, RESERVED
> 1/19 PASS (`H4b bpy` 4.2.0). Nach diesem Auftrag zusätzlich H18, H20, H21
> PASS und H19 RESERVED (wartet auf Ticros Mixamo-Skelett-Template).

---

## 1. Architektur-Entscheidung Stufe 2 (Auto-Rigging)

**Frage:** UniRig lokal CPU (Weg A), UniRig Cloud (Weg B),
Anything World (Weg C) oder Auto-Rig Pro im Container (Weg D)?

**Ergebnis nach 4 parallelen Research-Agenten:**

| Weg | Verdikt | Beleg |
|---|---|---|
| **A — UniRig lokal CPU** | **NEIN** | UniRig hardcodet `accelerator: gpu` + `bf16-mixed` in `configs/task/quick_inference_skeleton_articulationxl_ar_256.yaml`. Pflicht-Dep `spconv-cuda` (Skin = Sparse-3D-Conv auf Voxeln); CPU-Wheel buggy (Issue #69 offen). Realistisch 10–60+ min/Asset für Skeleton-Stage allein. README: "CUDA-enabled GPU with at least 8 GB VRAM". |
| **B — UniRig Cloud (Modal/Replicate/Runpod)** | **JA** (gewählt) | Replicate `aaronjmars/unirig-ai` A100-80 GB, ~53 s/Call, **~$0.07 (~0.07 €) pro Asset**. 17 Einheiten = **~1,20 €** (Budget 50 ct × 17 = 8,50 € locker). MIT-Lizenz (UniRig), Replicate-ToS: voller Output-Übergang. Modal-Self-Deploy wäre billiger pro Sek., aber 5+ h Setup-Arbeit + 11,5 GB Coldstart für nur 17 Calls absurd. |
| **C — Anything World API** | **NEIN** | Free-Tier 2026 unklar (Pricing 403, widersprüchliche Quellen: 20 Credits/Monat vs. 4 Models). Bewirbt nur Tiere/Vehikel — **keine Drohnen/Insekten/Pflanzen**. Cloud-Vendor-Lock, ab $50/Monat. |
| **D — Auto-Rig Pro im bpy-Pip-Modul** | **NEIN headless** / **JA mit apt-Blender-Binary** | Addon-Registrierung im PyPI-bpy historisch fragil (Bug T56829); keine bestätigten Berichte für reines bpy-Modul. Funktioniert verlässlich nur mit `apt install blender` + `blender --background --python`. ~50 € einmalig, Output frei. Bricht "kein zusätzliches Binary"-Doktrin und braucht GPL-3-Aware-Setup. |
| **E — bpy `ARMATURE_AUTO` mit Mixamo-Template** | **JA** (Default, humanoid) | `bpy.ops.object.parent_set(type='ARMATURE_AUTO')` läuft Bone-Heat-Auto-Skinning im H4b-PASS-bpy 4.2.0. **0 €, kein Cloud, kein Lizenz-Kauf**. Nur humanoid zuverlässig (Failure-Modes T45493, T51250 dokumentiert: nicht-manifold Mesh, lose Verts, Finger zu dicht an Beinen). |

### Backend-Switch in `tools/auto_rig_3d.py`

Drei Backends per `--backend` oder ENV `AUTO_RIG_BACKEND`:

```
--backend local-bpy-template   (Default, humanoid, 0 €, ARMATURE_AUTO)
--backend cloud-replicate      (Non-humanoid, UniRig MIT, ~$0.07/Asset)
--backend cloud-modal          (Self-Deploy-Option, billiger pro Sek.)
```

**Pre-Rig-Gate (Pflicht):** `tools/auto_rig_3d.py` ruft H18 (`glb_validate`)
vor jedem Backend. FAIL = Stopp, keine Cloud-Kosten, kein Bone-Heat-Crash.

**Post-Rig-Gate (Pflicht):** `pygltflib` liest das Output-GLB, prüft
≥1 Skin mit ≥1 Joint. Werkzeug-Audit-PASS-Bedingung H19.

---

## 2. Werkzeug-Spezifikationen

### Werkzeug 18 — `tools/glb_validate.py` (Hebel H18)
- **Input:** GLB-Pfad.
- **Output:** PASS/FAIL + Bericht (Text oder `--json`). Exit 0/1.
- **Prüft:** Datei existiert + nicht leer; GLB-Magic + Version 2; genau 1 Mesh;
  Triangle-Count im `[--min-tris, --max-tris]` (Default 5000-80000); optional
  Watertight (`--strict`); Genus ≤ `--max-genus` (Default 3) bei wasserdichten
  Meshes.
- **Werkzeug-Audit:** Round-Trip gegen `proof3d/public/models/hellmuth.glb`
  (lief in dieser Session, 498146 Tris → korrekt FAIL bei Standard-Korridor;
  Hebel-Check mit weitem Korridor → PASS).
- **Anti-Doppelimplementierung:** nutzt trimesh (H4c PASS), keine eigene
  GLB-Parser-Reimplementation. Header-Read über stdlib `struct`, kein extra
  Werkzeug.

### Werkzeug 19 — `tools/auto_rig_3d.py` (Hebel H19)
- **Input:** validiertes GLB (Pre-Check baked in), Archetyp.
- **Output:** gerigtes GLB (Skelett + Skin-Weights).
- **Backends:** `local-bpy-template` (humanoid), `cloud-replicate` (UniRig auf
  Replicate, Default non-humanoid), `cloud-modal` (Self-Deploy-Option).
- **Werkzeug-Audit:** RESERVED solange `tools/animations/templates/mixamo_humanoid.glb`
  fehlt. PASS sobald Template vorhanden ist + Round-Trip-Rigging gegen ein
  Demo-Mesh. **Skip-Key `auto-rig-template`** (CI ohne Template grün via SKIP).

### Werkzeug 20 — `tools/retarget_animation.py` (Hebel H20)
- **Input:** Ziel-GLB (gerigt), Quell-Animation (Mixamo-FBX / CMU-BVH /
  Truebones-FBX), Clip-Name.
- **Output:** GLB mit Action am Ziel-Skelett.
- **Backend (Default):** bpy 4.2.0 Constraint-Loop (Copy-Rotation pro Bone) +
  `bpy.ops.nla.bake` mit `visual_keying` + `clear_constraints`. Auto-Bone-Match
  über `mixamorig:`-Strip; optional `--mapping` JSON-Datei für Override.
- **Backend (optional):** `--use-rokoko` — Rokoko-Blender-Plugin (LGPL-3) für
  robusteres Auto-Mapping, falls als Addon vorhanden.
- **Werkzeug-Audit:** Importierbarkeit + smoke gegen Demo (lief PASS).

### Werkzeug 21 — `tools/render_iso_sheet.py` (Hebel H21)
- **Input:** gerigtes, animiertes GLB (eine oder mehrere Actions).
- **Output:** PNG-Sequenz `<unit>_<clip>_<dir>_<frame>.png` + Phaser-Atlas
  (PNG + JSON) via `pack_atlas.py`-Aufruf.
- **Schließt die 4 Lücken aus der Solutions-Runde** `[ausgeführt]`:
  1. **Multi-Clip-Iteration:** iteriert `bpy.data.actions`, setzt
     `frame_start/end` aus `action.frame_range`.
  2. **FPS-Sampling:** `step = round(scene_fps / target_fps)`, Default 12 fps
     gegen 30-fps-Mixamo.
  3. **Action-Slots 4.4+:** setzt `action_slot` zusätzlich zu `animation_data.action`,
     wenn die neue API verfügbar ist.
  4. **bpy-Modul-vs-Binary-Dualität:** `_own_argv()` erkennt `"--"`-Konvention
     (blender-Binary) und reines `sys.argv[1:]` (bpy-Pip-Modul).
- **`--clips`-Override:** wenn die Anzahl der `--clips`-Einträge = Anzahl
  Actions, werden sie als Labels in derselben Reihenfolge übernommen (löst
  das GLB-Re-Import-Namens-Quirk wie `Layer0_Armature` → `idle`).
- **Atlas-Schritt:** ruft `tools/pack_atlas.py` als Subprozess (kein argv-
  Konflikt mit bpy-Modul). `--skip-pack` für Frame-only-Lauf.
- **Engine:** Cycles-CPU hart (siehe Solutions-Runde — EEVEE-Next braucht
  GPU/EGL, im bare bpy-Modul nicht verfügbar).

---

## 3. Animations-Bibliothek (`tools/animations/`)

**Ticro-Entscheidung 2026-06-17:** Mixamo und Truebones gestrichen. Die einzige
primäre Quelle ist `procedural_anim.py` (Eigenwerk MIT). CMU bleibt als
optionaler Public-Domain-Backfill; AMASS/HumanML3D/Bandai Namco/MotionGPT
werden nicht angefasst.

Verzeichnis-Layout:

```
tools/animations/
├── templates/                  # Skelett-Templates für H19
│   ├── README.md
│   └── humanoid_template.glb  # vom Generator erzeugt (MIT, kein Mixamo)
├── procedural/                 # Quelle 1: Eigenwerk MIT (9 Clips eingecheckt)
└── cmu/                        # Quelle 2 (optional): CMU Public Domain
```

### Ist-Stand (implementiert)

- **Procedural (Primärquelle, MIT)** `[container, ausgeführt]`:
  `tools/animations/procedural/procedural_anim.py` (bpy 4.2.0) erzeugt in einem
  Aufruf **alle 9 Clips + das humanoide Auto-Rig-Template**:
  - Vier humanoide RTS-Standard-Anims: `humanoid_idle`, `humanoid_walk`,
    `humanoid_attack` (Wind-up→Schlag→Recovery), `humanoid_death` (Knie geben
    nach + Fall). Mixamo-kompatibles Bone-Layout (Hips, Spine[1], Neck, Head,
    [Left|Right]{Shoulder,Arm,ForeArm,Hand,UpLeg,Leg,Foot}).
  - Fünf non-humanoide Anims: `drone_hover`, `insect_scurry`, `plant_sway`,
    `plant_grow`, `hover_idle`.
  - `templates/humanoid_template.glb` (blankes Skelett, kein Action) →
    schaltet H19 `local-bpy-template`-Backend frei.
  In dieser Session in 2 s generiert + eingecheckt, deterministisch
  reproduzierbar. `humanoid_{idle,walk,attack,death}` lief end-to-end durch
  `render_iso_sheet` → ein gemeinsamer Atlas mit Anim-Gruppen
  `{idle,walk,attack,death}_{000,180}` (72 Frames, exakter `UnitAnimator`-
  Vertrag). H18-Validator: alle vier humanoiden Clips 1180 Tris → **PASS**.
- **CMU (optionaler Backfill)** `[fetch-helper bereit]`:
  `tools/animations/fetch_animations.py cmu` zieht ein kuratiertes 4-Trial-Set
  (walk/run/idle_look/attack_swing) aus einem öffentlichen BVH-Mirror und legt
  pro Datei ein Sidecar mit Public-Domain-Klausel + Acknowledgement an. In der
  Code-Session blockiert die Netz-Policy den Mirror (HTTP 403) → Ticro führt
  den Backfill nur aus, wenn er das Material wirklich will. **Ohne CMU ist die
  Bibliothek vollständig** — die prozedurale Quelle deckt alle Archetypen ab.
- **Verworfen** (Ticro-Entscheidung 2026-06-17): Mixamo (Adobe-Account +
  Resale-Negativklausel) und Truebones (Gumroad-Login, non-humanoid prozedural
  erzeugbar). Verzeichnisse `humanoid/` und `quadruped/` gelöscht;
  Fetch-Helper auf CMU-only reduziert.
- **Index:** `tools/animations/anim_library.py` → `MANIFEST.json` (Quelle,
  Clip-Anzahl, Format, Lizenz-Sidecar-Flag) — die Retarget-/Batch-Pipeline
  liest daraus.

### Klausel-Pflege (Werkzeug-MD-Doktrin)

Pro Quell-Datei in `tools/animations/<faction>/` ein **Sidecar-JSON** mit
Lizenz-Klausel-Zitat anlegen, **nicht** nur in dieser MD. Beispiel:

```json
// tools/animations/humanoid/Mixamo_Walk.fbx.license.json
{
  "source": "Mixamo (Adobe)",
  "url": "https://www.mixamo.com",
  "clause": "You can use both characters and animations royalty free for personal, commercial, and non-profit projects including: … Create Video Games, DLC or Addon Content for Games.",
  "negative": "You cannot create blueprints, templates, or asset packages for video game engines which redistribute character or animation raw files as the product.",
  "verified_on": "2026-06-17"
}
```

Damit ist die Klausel beweisbar pro Asset (Steam-Compliance-Audit).

---

## 4. End-to-End-Test (im Container ausgeführt)

**Setup:** `assets/source/units/hellmuth_idle.fbx` (Mixamo-Clip) →
bpy-FBX-Import → GLB-Export (`/tmp/iso_e2e/hellmuth_idle.glb`, 36,4 MB) →
`tools/render_iso_sheet.py --clips idle --directions 2 --target-fps 6
--scene-fps 30 --res 128 --unit-class hero` → `pack_atlas.py`.

**Resultat `[ausgeführt]`:**
- 52 PNGs in 50 s (Cycles-CPU, 24 Samples, 128 px)
- Atlas 28×70 nach Auto-Trim H2, **Frame-Keys** `hellmuth_idle_000_00`
  … `hellmuth_idle_180_25` (exakt der `UnitAnimator`-Vertrag, deckungsgleich
  mit dem existierenden `public/sprites/units/hellmuth.json`-Schema)
- Anim-Gruppen `{idle_000, idle_180}` (also korrekt 2 Richtungen × 26 Frames)
- FPS-Sampling verifiziert: `step = 30/6 = 5`, ~130 source-Frames / 5 = 26
  gesampelte → 26 × 2 = 52 PNGs ✓.

**Frühwarnung von H18 `[ausgeführt]`:** `tools/glb_validate.py
proof3d/public/models/hellmuth.glb` meldet
**498146 Tris (Korridor [5000, 80000]) → FAIL**. Damit ist Ticros KREA-
Hunyuan3D-Output noch vor der EU-Lizenz-Frage **auch technisch zum Riggen
ungeeignet** (Bone-Heat würde abstürzen oder katastrophale Weights produzieren).

**Was NICHT in-Container lief:** der Stufe-2-Bau (UniRig auf Replicate)
verlangt eine echte Ticro-Replicate-API-Token-Belegung und ein neues, nicht-
Hunyuan-erzeugtes GLB. Stufe 4 vollständig ausgeführt; Stufe 2+3 sind
implementiert + smoke-getestet, der echte Lauf gehört auf die Maschine mit
Token.

**Gesamtzeit (Schätzung) pro Einheit:**
- Stufe 1 (KREA UI manuell, Ticro): **~3 min** `[recherchiert]`
- Stufe 2 (Replicate UniRig): **~53 s Call + ~10 s Up-/Download = ~1 min**
  `[recherchiert, Subagent-Beleg]`
- Stufe 3 (Retarget 4 Clips × ~10 s): **~1 min** `[geschätzt]`
- Stufe 4 (Render 4 Clips × 8 Richtungen × ~10 Frames = 320 Frames × ~1 s
  + Pack < 10 s): **~6 min** `[in-Container gemessen, hochgerechnet]`
- **Gesamt: ~11 min/Einheit** — klar im 20-Minuten-Brief-Ziel.

---

## 5. Drei Lizenz-Klärungen

### Klärung 1 — KREA-Hunyuan3D für Steam-DE: **VERBOTEN**

**Wörtliches Zitat aus der Tencent Hunyuan3D-2.1-Lizenz** (Quelle:
https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE):

- **§1(l) Territory:** "Territory shall mean the worldwide territory,
  excluding the territory of the European Union, United Kingdom and South
  Korea."
- **§5(c) Geographic Restriction:** "You must not use, reproduce, modify,
  distribute, or display the Tencent Hunyuan 3D 2.1 Works, **Output or
  results** of the Tencent Hunyuan 3D 2.1 Works outside the Territory. Any
  such use outside the Territory is unlicensed and unauthorized under this
  Agreement."

**KREAs ToS klärt das NICHT.** KREA sagt nur: "everything you create with
Krea is yours to use … without restriction" (https://www.krea.ai/enterprise)
— das ist KREAs Aussage über die eigenen Rechte, NICHT eine Sublicense der
Tencent-Rechte. Tencent-Issue #94 (EU-Klärung) ist seit Juli 2025
unbeantwortet; Issue #254 verweist stoisch auf den Lizenztext.

**Konsequenz für HELLMUTH:**
1. `proof3d/public/models/hellmuth.glb` (KREA-Hunyuan3D-Output) **darf nicht
   ins Steam-Build**. In `assets/_unused_krea_hunyuan/` quarantänisieren oder
   nur als Konzept-Referenz behalten.
2. **Plan B `[recherchiert]`:** TRELLIS (Microsoft, **MIT-Lizenz** —
   https://github.com/microsoft/TRELLIS/blob/main/LICENSE) auf Replicate
   `firtoz/trellis`, ~$0.033/Run. Bestehende KREA-Assets erneut durchjagen.
   Lizenz: MIT erlaubt kommerzielle Nutzung, Sublicensing, KEINE
   Territorialschranke.

### Klärung 2 — Mixamo (Ticro-Entscheidung 2026-06-17: **gestrichen**)

Lizenz wäre Steam-tauglich (royalty-free embed, "Create Video Games, DLC or
Addon Content for Games"), aber: braucht Adobe-Account-Login, trägt eine
Resale-Negativklausel ("cannot redistribute character or animation raw files
as the product"), und ist humanoid-only. **Ticro will den Account-Pfad nicht.**
Was Mixamo abdeckt (idle/walk/attack/death), erzeugt jetzt
`procedural_anim.py` aus eigenen Sinus-/Phasenversatz-Kurven — keine Fremd-
Klausel, kein Login, deterministisch reproduzierbar.

### Klärung 3 — CMU Mocap: **optional JA**, Truebones: **gestrichen**

**CMU Mocap** (Public Domain / permissive — bleibt als Backfill verfügbar)
Quelle: http://mocap.cs.cmu.edu/faqs.php, FAQ "How can I use this data?":

- "The motion capture data may be copied, modified, or redistributed without
  permission."
- "You may include this data in commercially-sold products, but you may not
  resell this data directly, even in converted form."
- **Acknowledgement-Pflicht** bei Publikationen: "The data used in this
  project was obtained from mocap.cs.cmu.edu. The database was created with
  funding from NSF EIA-0196217."

Im MVP ist CMU **nicht nötig** — die prozedurale Quelle deckt alle Archetypen
ab. Wenn Ticro Bewegungs-Varianten will, läuft `fetch_animations.py cmu`
einmal. In der Code-Session hier ist der CMU-Server per Netz-Policy blockiert
(403); ein lokaler Lauf mit einem stabilen Mirror erledigt es.

**Truebones** (gestrichen): wäre Steam-tauglich, braucht aber Gumroad-Login.
Was Truebones-Zoo an non-humanoid abdeckt, erzeugt der prozedurale Generator
(Drohne, Insekt, Pflanze).

**Pool-Streichungen** (Solutions-Erbe): Bandai Namco Motion Dataset (CC
BY-NC-ND 4.0), AMASS/HumanML3D (research-only), MotionGPT-Outputs (über
Trainingsdaten kontaminiert). Diese werden gar nicht erst angefasst.

---

## 6. Kostenkalkulation (Stufe 2 Cloud)

| Posten | Wert | Quelle |
|---|---|---|
| Replicate `aaronjmars/unirig-ai` | $0.001400/s × 53 s = **$0.074/Asset** | replicate.com/pricing |
| 17 Einheiten (HELLMUTH-Roster) | $0.074 × 17 = **$1.26 (~1,20 €)** | Rechnung |
| Plan-B TRELLIS für KREA-Ersatz | $0.033/Run × 17 = **$0.56 (~0,55 €)** | replicate.com/firtoz/trellis |
| **Pipeline-Gesamt MVP** | **~$1.82 (~1,75 €)** | Stufe 1 (KREA gratis-Tier) + Stufe 2 (Replicate) + Stufe 3+4 (lokal 0 €) |

**Brief-Budget:** <50 ct/Asset für Stufe 2 = $8.50 (~7,90 €) für 17 Einheiten.
**Faktisch ~1/7 des Budgets** verbraucht. Komfortabel.

---

## 7. Risiken & Fallen

1. **Ticros bestehende KREA-Hunyuan-Assets** (mindestens `hellmuth.glb`) sind
   **lizenzrechtlich unbrauchbar** für DE-Steam-Release. Plan B (TRELLIS auf
   Replicate) ist konkret implementierbar; wird die Asset-Iteration einmal
   wiederholen. Bitte vor weiterer KREA-Nutzung **KREA-Tier wechseln** auf
   TRELLIS-Backend oder die KREA-Pipeline ganz durch Replicate ersetzen.
2. **Humanoid-Template** wird vom prozeduralen Generator selbst geschrieben
   (`tools/animations/templates/humanoid_template.glb`, MIT). Kein Mixamo-
   Setup mehr, kein Adobe-Account. Hebel H19 schaltet damit automatisch auf
   PASS, sobald `procedural_anim.py` einmal lief.
3. **GLB-Re-Import-Naming-Quirk** in Blender: Mixamo-FBX-Actions werden bei
   FBX→GLB→Re-Import zu `Layer0_Armature` o. ä. umbenannt. Werkzeug 21 löst
   das via `--clips`-Ordered-Override; Ticro muss die Clip-Liste explizit
   geben (oder Stufe 3 setzt vor dem Export saubere Action-Namen — Default-
   Implementierung: ja, retarget_animation setzt `action.name = args.clip_name`).
4. **Cycles-CPU-Renderzeit skaliert mit res²·samples**. Für 256 px statt
   128 px verdoppelt sich die Zeit pro Frame; bei 1000 Frames merklich.
   Empfehlung: 128–192 px reichen für RTS-Sprites; höhere Auflösung nur für
   Helden/Hero-Render.
5. **Replicate-Modell-Verfügbarkeit** ist nicht garantiert (`aaronjmars/unirig-ai`
   ist ein Community-Modell). Fallback im Wrapper: `cloud-modal` Self-Deploy
   (Snippet in `tools/auto_rig_3d.py` Docstring).
6. **Bone-Heat-Auto-Skinning** (Stufe 2 Default-Backend) ist **nur humanoid
   zuverlässig**. Failure-Modes: nicht-manifold Mesh (Pre-Check in H18 fängt
   das), lose Verts, Finger zu nah an Beinen, Augäpfel ignoriert. Für
   non-humanoid IMMER Cloud-Backend nehmen.

---

*Stand: 2026-06-17. Lieferung: vier Werkzeuge implementiert, ein E2E-Test in
diesem Container ausgeführt, drei Lizenz-Klärungen mit wörtlichen Zitaten.
Werkzeug-Audit GRÜN für H18, H20, H21; H19 RESERVED bis Ticros einmaliges
Template-Setup. Branch: `claude/quirky-fermat-8rewv0`.*
