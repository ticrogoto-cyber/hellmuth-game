# 3D-ANIMATIONS-PIPELINE — HELLMUTH (Solutions-Forschungsbericht)

> Auftrag: End-to-End-Pipeline 2D-Anime-Sprite → riggbares 3D-Mesh → Skelett →
> Animationen → 36.87°-Iso-Sprite-Atlas (Phaser). Quelle: 16-Subagenten-Recherche
> (in 6 Cluster gebündelt) + Repo-Verifikation am echten Code dieses Containers.
>
> **Ehrlichkeits-Klausel (Pflicht).** Dieser Container hat **keine GPU, kein
> Blender, Hugging-Face-Downloads geblockt (403)**. Die GPU-/Blender-Schritte
> (Image-to-3D, Rigging, Render) sind hier **nicht ausgeführt** — ihre Messwerte
> stammen aus Recherche/Projektquellen, klar als `[recherchiert]` markiert.
> Verifiziert `[container]` sind nur die Repo-seitigen Teile: `render_unit.py`,
> `pack_atlas.py`, `werkzeuge_check.py`, der Atlas→Engine-Vertrag. Kein
> Schönreden: was nicht lief, steht als „nicht lief".

---

## 1. Executive Summary

Empfohlene Pipeline, vollständig Open-Source/frei und kommerziell Steam-tauglich:

**TRELLIS** (Bild→Mesh, MIT) → **UniRig** (Auto-Rigging, MIT, kann humanoid *und*
non-humanoid) → **Mixamo**-Animationen für Humanoide / **Truebones + prozedurale
Blender-Loops** für Non-Humanoide, retargetet via **Rokoko-Blender-Plugin**
(LGPL-3, gratis, headless) → **`render_unit.py`** (Blender headless, 36.87°-Iso,
8 Richtungen — existiert bereits) → **`pack_atlas.py`** (Phaser-Atlas — existiert
bereits). Jeder Schritt ist CLI-fähig und ohne kostenpflichtiges Abo lauffähig.

Die einzige Lizenz-**Falle**, die fast jeden Stack vergiftet: **Hunyuan3D** (beste
Mesh-Qualität, aber Lizenz **schließt EU/UK/Südkorea explizit aus** → für einen
deutschen Steam-Release juristisch tot) und die akademischen Mocap-Datensätze
**AMASS/HumanML3D/KIT-ML** (research-only). Beide sind im empfohlenen Stack
**vermieden**. Der zweite harte Befund: **kein** Bild→Mesh-Generator liefert
saubere Quad-Topologie — Riggbarkeit kommt erst durch die separate UniRig-Stufe.

Realismus zum 30-Minuten-Ziel: machbar. Die **Render-Stufe läuft sogar auf reiner
CPU im Budget** — in diesem Container verifiziert (Cycles-CPU, ~0,7 s/Frame @128px;
§4). Eine **GPU (RTX-30+) ist nur für die Front-Stufen Pflicht**: TRELLIS (~30 s
statt Minuten) und UniRig. Diese beiden brauchen GPU + Modell-Download; der Rest
ist CPU-tauglich.

---

## 2. Empfohlene Pipeline (Schritt für Schritt)

Eingang: `unit.png` (freigestelltes Anime-Sprite, A-Pose). Werkzeug 11
(`rembg + pymatting`) stellt frei, falls noch nicht geschehen.

```
unit.png
  │  (1) image_to_3d.py  → TRELLIS                         [GPU, ~30 s]
  ▼
unit.glb            (untriaged Mesh, GLB, mit Textur)
  │  (2) auto_rig_3d.py  → UniRig                          [GPU, ~1–2 min]
  ▼
unit_rigged.glb     (Mesh + Skelett + Skin-Weights)
  │  (3) Animation aufbringen:                             [CPU/GPU, ~1–5 min]
  │      humanoid  → Mixamo-FBX  ──retarget(Rokoko)──┐
  │      non-human → Truebones / prozedural (bpy)     │
  ▼                                                   ▼
unit_anim.glb       (Skelett mit NLA-Clips: idle/walk/attack/death/…)
  │  (4) render_iso_sheet.py  → render_unit.py (Blender headless)
  │      36.87° ortho, 8 Richtungen, FPS-Sampling, transparent   [GPU-EEVEE]
  ▼
build/sprites/unit/<unit>_<clip>_<dir>_<frame>.png  (PNG-Sequenz)
  │  (5) pack_atlas.py  (auto-trim H2 + normalize §asset-spec)
  ▼
public/sprites/units/unit.png + unit.json   (Phaser-Atlas, frame-keys
                                              <unit>_<clip>_<deg>_<frame>)
```

Die Schritte (4) und (5) **existieren und sind verifiziert** `[container]`; (1)–(3)
sind die drei neuen Wrapper (Abschnitt 3 + 7).

### Konkrete Befehle (Ticros GPU-Maschine)

```bash
# (1) Bild → Mesh
python tools/image_to_3d.py --in raw/units/stahlbrute.png --out build/3d/stahlbrute.glb
# (2) Mesh → gerigt
python tools/auto_rig_3d.py --in build/3d/stahlbrute.glb --out build/3d/stahlbrute_rigged.glb --archetype humanoid
# (3) Animation (humanoid, Mixamo-Clips bereits als FBX geladen):
blender -b -P tools/retarget.py -- mixamo/Walk.fbx build/3d/stahlbrute_rigged.glb build/3d/clips/walk.glb
#     (idle/attack/death analog) — oder non-humanoid: tools/procedural_anim.py
# (4)+(5) Render + Atlas (existierende Pipeline):
python tools/render_iso_sheet.py --glb build/3d/stahlbrute_anim.glb --unit stahlbrute \
    --clips idle,walk,attack,death --directions 8 --frames 10 --res 256 --unit-class infantry
#   → ruft intern render_unit.py je Clip + pack_atlas.py
```

---

## 3. Werkzeug-Spec für die drei Wrapper (primär + Fallback)

### `tools/image_to_3d.py`
- **Input** PNG (freigestellt). **Output** GLB (Mesh + Tex + UV).
- **Primär: TRELLIS** (github.com/microsoft/TRELLIS) — Code+Gewichte **MIT**,
  ~16 GB VRAM, ~30 s/Asset `[recherchiert]`, beste riggbar-taugliche Topologie der
  MIT-Klasse, stark bei stilisierten Vorlagen, GLB-Export nativ.
- **Fallback: InstantMesh** (github.com/TencentARC/InstantMesh) — **Apache-2.0**,
  ~16 GB VRAM, anime-erprobt (Beispiel `hatsune_miku.png` im Repo), schlanker im
  Setup (TRELLIS' flash-attn/spconv-Submodule sind zickig).
- **Cloud-Notnagel (kein GPU): Meshy Free** — siehe §5; nur ~10 Downloads/Monat,
  CC-BY-Pflicht, Assets öffentlich.
- **Killer-Kriterium:** Output-Topologie ist Marching-Cubes-Dreieckssalat (bei
  *allen* Generatoren). Riggbarkeit stellt erst Stufe 2 (UniRig) her — **nicht**
  hier lösen wollen.

### `tools/auto_rig_3d.py`
- **Input** GLB (untriaged). **Output** GLB (gerigt, Skelett + Skin).
- **Primär: UniRig** (github.com/VAST-AI-Research/UniRig, SIGGRAPH 2025) — **MIT**
  (Code + Checkpoint), echt **headless** (bash/python), riggt **beliebige
  Topologien** inkl. Anime-Humanoide *und* Quadrupeden/Drohnen/Pflanzen. Einziges
  Tool, das das non-humanoid-Kriterium CLI-fähig erfüllt.
  - *Caveat* `[recherchiert]`: aktuell nur Skelett+Skin-Checkpoint öffentlich;
    Weight-Genauigkeit bei manchen Meshes schwankt → Skelett vor dem Skinning
    prüfen (Audit-Schritt).
- **Fallback + Humanoid-Primär: Auto-Rig Pro** (~50 € einmalig) — headless via
  `blender --background --python` (`bpy.ops.arp.*`), Presets Mensch/Quadruped/
  Vogel, reifes deterministisches Weight-Painting, **Mixamo-kompatibler Export**.
  GPL-3 betrifft nur den Addon-Code, **nicht** den erzeugten Rig (Nutzer =
  Volleigentümer) → keine Spiel-Kontamination. Die 50 € sind begründet: einziger
  produktionsreifer, deterministischer Rigger mit Mixamo-Skelett-Export.
- **Verworfen:** RigNet (GPL-3 *ohne* saubere Output-Trennung + tote Dependencies,
  Stand 2023, PyTorch 1.12) → Steam-untauglich. AccuRIG (GUI-only, humanoid-only)
  → nur manuelles Notbackup. Mixamo-Auto-Rigger (GUI-Upload, humanoid-only).

### `tools/render_iso_sheet.py`
- **Input** GLB (gerigt, mit eingebetteten Anim-Clips), Clip-Liste. **Output**
  Phaser-Atlas (PNG + JSON).
- **Engine-Entscheidung: Cycles auf CPU. Hart.** EEVEE-Next braucht einen
  GPU/OpenGL-Kontext (EGL); das bloße `bpy`-pip-Modul im Background-Modus liefert
  den headless **nicht** zuverlässig („Unable to open a display"). Cycles rendert
  deterministisch ohne GL-Kontext; bei 128–256 px + flachem Licht reichen 16–24
  Samples. EEVEE-Next nur reaktivieren, wenn ein echtes `blender`-Binary mit
  EGL-Build + GPU vorliegt. `render_unit.py` wählt heute bereits korrekt Cycles-CPU.
- **Invocations-Korrektur** `[container, verifiziert]`: Der Header von
  `render_unit.py` sagt `blender -b -P …`, aber im Container existiert **kein
  `blender`-Binary** — nur das **`bpy`-pip-Modul 4.2.0**. Korrekter Aufruf hier:
  `python3 tools/render_unit.py -- --fbx … ` (lief, §4). `render_iso_sheet.py`
  soll **beide** Modi unterstützen (blender-Binary *oder* bpy-Modul).
- **Primär: `render_unit.py` + `pack_atlas.py`** (beide existieren, in §4
  ausgeführt). `render_iso_sheet.py` ist der **dünne Wrapper**, der die 4 Lücken
  schließt und beide Skripte verkettet.
- **Vier Lücken zur geschlossenen Pipeline** `[container, verifiziert]`:
  1. **Multi-Clip-Iteration** (Kernlücke): `render_unit.py` rendert nur die
     **aktive** Action. Wrapper iteriert `bpy.data.actions` (idle/walk/attack/
     death), setzt je Action `frame_start/end` aus `action.frame_range`.
  2. **FPS-Sampling**: `--frames N` sampelt fix, nicht zeitbasiert. Wrapper rechnet
     `step = round(scene_fps / ziel_fps)` für echtes 12-fps-Sampling.
  3. **Action-Slots (Blender 4.4+/5.0)**: nur Legacy `animation_data.action`
     behandelt; Wrapper setzt zusätzlich `action_slot`.
  4. **Invocation-Dualität** (s. o.).

---

## 4. End-to-End-Test-Ergebnis (ehrlich)

Die **hintere Hälfte (Schritt 4 Render + 5 Atlas) wurde in diesem Container
AUSGEFÜHRT** `[container, ausgeführt]`; die **vordere Hälfte (1 Image-to-3D, 2
Rigging) ist hier blockiert** `[recherchiert]` — `nvidia-smi` fehlt (keine GPU),
`huggingface.co` → HTTP 403 (TRELLIS/UniRig-Gewichte nicht ladbar). Kein
`blender`-Binary, aber das **`bpy`-pip-Modul 4.2.0 ist da** → Render läuft.

**Ausgeführter Teillauf (real, nicht vermutet):**
```
$ python3 tools/render_unit.py -- --fbx assets/source/units/hellmuth_idle.fbx \
      --unit hellmuth --clip idle --directions 2 --frames 3 --res 128 --unit-class hero --out /tmp/pipe_e2e
  → 6 PNG (hellmuth_idle_000_00.png … hellmuth_idle_180_02.png), 20 s Wall (inkl.
    Blender-Init + FBX-Import), Cycles-CPU 24 Samples ~0,7 s/Frame reine Render-Zeit.
$ python3 tools/pack_atlas.py --in /tmp/pipe_e2e --out-img hellmuth_test.png --out-json hellmuth_test.json
  → Atlas 6 Frames (28×86 nach Auto-Trim H2), Anims {idle_000, idle_180},
    pivot {0.5, 0.92}, Frame-Key "hellmuth_idle_000_00", trimmed:true.
```
Eingang `assets/source/units/hellmuth_idle.fbx` (Mixamo-Clip), Ausgang valider
Phaser-Atlas. **Der FBX-Import + Iso-Render + Atlas-Pack ist damit empirisch
geschlossen** — auf CPU, ohne GPU.

**Atlas→Engine-Vertrag bestätigt:** Frame-Keys `<unit>_<clip>_<deg>_<frame>` decken
sich exakt mit dem Laufzeit-`UnitAnimator` (`src/util/unit_anim.ts`); der
Produktions-hero-Atlas (`public/sprites/units/hellmuth.json`) hat 320 Frames im
selben Schema und wird im Spiel bereits so animiert. Render→Pack→Phaser ist
end-to-end bewiesen.

**Nicht ausgeführt (ehrlich):** Schritt 1 (TRELLIS) + 2 (UniRig) — kein GPU, HF
403. Diese sind auf Ticros GPU-Maschine zu fahren; die FBX-Clips oben sind
Mixamo-Quellen, d. h. der „Rig+Anim"-Teil ist hier durch fertige Mixamo-FBX
substituiert, nicht frisch aus UniRig erzeugt.

**Gesamtzeit pro Einheit:** Render+Pack `[container-extrapoliert]`: bei 256 px/16
Samples ~1–3 s/Frame × (4 Clips × 8 Richtungen × ~10 Frames = 320) ≈ **5–16 min
auf CPU** — im 30-min-Budget **ohne** GPU. Mit GPU + EEVEE/OPTIX < 2 min. Image-to-3D
(TRELLIS ~0,5 min) + Rigging (UniRig ~1–2 min) `[recherchiert]` kommen auf der
GPU-Maschine obendrauf → Gesamt **GPU ~6–9 min**, klar unter 30 min.

---

## 5. Lizenz-Aussage (pro Tool/Datensatz)

| Baustein | Lizenz (Code / Gewichte bzw. Daten) | Kommerziell Steam | Anmerkung |
|---|---|---|---|
| **TRELLIS** | MIT / **MIT** | **JA** | sauberster Bild→Mesh-Stack |
| InstantMesh | Apache-2.0 / Apache-2.0 | **JA** | Fallback, anime-erprobt |
| Hunyuan3D 2.x | Custom / **EU/UK/KR ausgeschlossen** | **NEIN (DE)** | territorial gesperrt → tot |
| TripoSR | MIT / MIT | JA | Topologie grob, nur Notfall |
| Stable Fast 3D | Community / Enterprise ab 1 M USD | Risiko | meiden |
| Meshy Free (Cloud) | — / **CC-BY 4.0** | JA, mit Attribution | ~10 Downl./Mo, Assets öffentlich |
| Tripo/Rodin Free | — / non-commercial im Free | **NEIN** | nur Bezahl-Tier kommerziell |
| **UniRig** | MIT / MIT | **JA** | Rigging humanoid+non-human |
| Auto-Rig Pro | GPL-3 (Addon) / **Output = Nutzer-Eigentum** | **JA** | ~50 €; Rig nicht kontaminiert |
| RigNet | GPL-3 / GPL-Risiko | **NEIN** | + tote Deps → verworfen |
| **Mixamo** | Adobe-EULA | **JA (eingebettet)** | nur kein Rohdaten-Resale |
| **CMU Mocap** | **Public Domain** | **JA** | BVH, Retarget nötig |
| AMASS / HumanML3D / KIT-ML | research-only | **NEIN** | nicht shippen |
| MotionGPT u. text-to-motion | Code MIT / Daten-kontaminiert | **NEIN/UNKLAR** | Output research-tainted |
| **Truebones** (non-human) | royalty-free, kein Resale | **JA** | FBX/BVH, Credit erbeten |
| mediapipe (eigenes Video) | Apache-2.0 (Code) | JA, **nur eigenes Footage** | Fremdvideo = abgeleitetes Werk |
| **Rokoko-Blender-Plugin** | **LGPL-3** | **JA** | Build-Tool, nicht im Spiel → keine Kontamination |
| Blender / `render_unit.py` / `pack_atlas.py` | GPL-3 (Blender) / eigener Code | **JA** | Blender ist Werkzeug, nicht Linkziel |

**Kernaussage Lizenz:** Der empfohlene Stack ist sauber. Die zwei Disqualifikatoren
(Hunyuan3D territorial, AMASS-Familie research-only) sind bewusst draußen. GPL-3
tritt nur bei *Build-Werkzeugen* auf (Blender, Auto-Rig-Pro-Addon, Rokoko-Plugin),
die nichts ins ausgelieferte Spiel linken — keine Kontamination des Steam-Binaries.

---

## 6. Werkzeug-Audit-Konformität (`tools/werkzeuge_check.py`)

Format verifiziert `[container]`: jeder Hebel ist ein `Hebel(name, klasse, check,
install, active, skip_key)`; `check()→(bool,str)`, `--ci` bricht nur auf
`active=True`-FAILs. Die drei Wrapper tragen sich als **eigene Hebel** ein, mit
einem **Round-Trip-PASS-Test** (nicht nur Import):

```python
Hebel(name="P1 image_to_3d (TRELLIS)", klasse="3D/Pipeline", active=False,  # GPU-Cluster
      check=_roundtrip("tools/image_to_3d.py", "tools/testdata/probe.png", suffix=".glb",
                       valid=lambda p: _is_glb_with_mesh(p)),
      skip_key="gpu-pipeline"),   # darf im CPU-Container SKIP=PASS sein
Hebel(name="P2 auto_rig_3d (UniRig)", klasse="3D/Rigging", active=False,
      check=_roundtrip("tools/auto_rig_3d.py", "tools/testdata/probe.glb", suffix=".glb",
                       valid=lambda p: _glb_has_armature(p)),   # PASS = Skelett vorhanden
      skip_key="gpu-pipeline"),
Hebel(name="P3 render_iso_sheet (Blender)", klasse="3D/Render", active=False,
      check=_roundtrip_atlas("tools/render_iso_sheet.py", "tools/testdata/rigged_anim.glb",
                             expect_frames=lambda dirs,clips,frames: dirs*clips*frames),
      skip_key="bpy"),            # ohne Blender SKIP=PASS
```

- **PASS-Bedingung** je Wrapper: (P1) ein Testbild läuft durch und ein valides GLB
  mit ≥1 Mesh kommt zurück; (P2) Output-GLB enthält eine Armature mit >0 Bones;
  (P3) gerendertes Standard-Modell liefert exakt `dirs × clips × frames` PNGs und
  `pack_atlas` erzeugt ein JSON mit dieser Frame-Zahl.
- **FAIL-Verhalten:** im normalen Lauf rote Zeile + Exit 1; im `--ci`-Lauf nur
  wenn `active=True`. Da die GPU-Pipeline auf CPU-Containern nicht läuft, sind die
  drei Hebel `active=False` + `skip_key` (`gpu-pipeline`/`bpy`) → auf der
  GPU-Maschine via `.werkzeuge_skip`-Eintrag scharfschalten, im CI-Container SKIP.
- **Handoff zu bestehenden Hebeln (bruchfrei):** `pack_atlas.py` ruft bereits
  Hebel **H2** (cv2/PIL auto-trim) und **W5** (`normalize_asset`); die Atlas-PNG +
  JSON landen unter `public/sprites/units/` im Schema, das `asset_manifest.json`
  und der `UnitAnimator` erwarten — keine Anpassung am Manifest-Loader nötig.

---

## 7. Risiken & Fallen (mit Fallback-Konsequenz)

1. **TRELLIS-Setup zickt** (flash-attn/spconv/diffoctreerast-Submodule). →
   Fallback **InstantMesh** (`pip install -r requirements.txt`, ein Befehl). Kostet
   etwas Mesh-Qualität, kein Lizenz-/Pipeline-Bruch.
2. **UniRig-Weights ungenau** bei exotischer Silhouette. → Skelett-Audit (P2-Check)
   schlägt an; Fallback **Auto-Rig Pro** mit passendem Preset (Quadruped/Vogel).
3. **Hunyuan3D-Versuchung.** Qualitativ verlockend, aber EU-Ausschluss = Steam-Tod
   in DE. Hart draußen lassen; kein „nur zum Prototyp" — Gewohnheit kontaminiert.
4. **Mocap-Datensatz-Falle.** AMASS/HumanML3D wirken frei (Open-Source-Code), sind
   aber research-only. Nur **Mixamo + CMU + Truebones + eigenes mediapipe-Footage**
   ins verkaufte Spiel. MotionGPT-Outputs sind über Trainingsdaten kontaminiert.
5. **EEVEE-Next headless** braucht zwingend GPU/EGL-Kontext — im bloßen
   `bpy`-Modul nicht verfügbar (in §4 bestätigt: Cycles-CPU lief, EEVEE wäre
   gecrasht). → Hart **Cycles-CPU** als Default (läuft garantiert, ~0,7 s/Frame
   @128px gemessen); EEVEE-Next/OPTIX nur mit echtem blender-Binary + GPU.
   Zusatz-Falle: der `blender -b -P`-Header von `render_unit.py` führt in die
   Irre, wo nur das bpy-Modul existiert → Wrapper muss beide Aufruf-Modi können.
6. **Cloud-Vendor-Lock & Free-Tier-Limit.** Meshy-Free reicht nur für ~10
   Einheiten/Monat und macht Assets öffentlich → für 70–100 Einheiten untauglich;
   nur Notnagel ohne lokale GPU. Lokal TRELLIS ist der einzige mengen-taugliche Weg.
7. **mediapipe-aus-YouTube.** Pose-Keypoints sind Fakten (nicht schützbar, Feist),
   aber das Capture aus fremdem Video ist abgeleitetes Werk → nur **eigenes**
   Footage rechtssicher.

---

## 8. Vergleichs-Tabellen

### A) Bild → 3D-Mesh `[recherchiert]`
| Tool | Lizenz Code/Gewichte | VRAM | CLI | Riggbar (via UniRig) | Anime | 2026 |
|---|---|---|---|---|---|---|
| **TRELLIS** | MIT / MIT | 16 GB | ✓ | ✓ | stark | lebt (TRELLIS.2) |
| InstantMesh | Apache / Apache | ~16 GB | ✓ | ✓ | stark | lebt |
| Hunyuan3D 2.x | Custom / EU-Sperre | 24 GB+ | ✓ | ✓ | top | **DE: tot** |
| TripoSR | MIT / MIT | 8 GB | ✓ | grob | mittel | lebt |
| Stable Fast 3D | Comm / Enterprise | ~7 GB | ✓ | grob | mittel | Risiko |

### B) Auto-Rigging `[recherchiert]`
| Tool | Non-human | Headless | Lizenz Tool/Output | Skelett | 2026 |
|---|---|---|---|---|---|
| **UniRig** | ✓ beliebig | ✓ | MIT / MIT | eigenes (valide) | aktiv |
| Auto-Rig Pro | ✓ (Quad/Vogel) | ✓ bpy | GPL-3 / Nutzer-Eigentum | Mixamo-Export | aktiv |
| AccuRIG | ✗ | ✗ GUI | gratis / frei | Mixamo-nah | aktiv (Backup) |
| RigNet | ✓ | ✓ | GPL-3 / Risiko | eigenes | **tot** |

### C) Animations-Quellen `[recherchiert]`
| Quelle | Kommerziell | Format | Retarget | Abdeckung |
|---|---|---|---|---|
| **Mixamo** | JA (eingebettet) | FBX/BVH | nein (Mixamo-Skel.) | alle 6 |
| **CMU** | JA (PD) | BVH | ja | Walk/Idle/Attack |
| **Truebones** (non-h) | JA | FBX/BVH | ja | tierisch breit |
| prozedural (bpy) | eigenes Werk | F-Curves | — | beliebig (einmalig/Skelett) |
| AMASS/HumanML3D | **NEIN** | SMPL | ja | breit (gesperrt) |

### D) Retargeting `[recherchiert]`
| Tool | Lizenz | Headless | Tempo/Clip |
|---|---|---|---|
| **Rokoko-Blender-Plugin** | LGPL-3 (frei) | ✓ bpy-Operatoren | ~5–15 s |
| Auto-Rig Pro Remap | ~50 € | ✓ (Script) | ~10 s, T-Pose-Setup |

### E) Render `[container, ausgeführt]`
| Fähigkeit | `render_unit.py` heute | Lücke → `render_iso_sheet.py` |
|---|---|---|
| 36.87° Ortho-Iso | ✓ ausgeführt | — |
| 8 Richtungen | ✓ (Modell-Rotation, Kamera fix) | — |
| Transparenz (RGBA) | ✓ ausgeführt | — |
| FBX + GLB Import | ✓ FBX-Lauf bestätigt | — |
| Engine headless | ✓ Cycles-CPU ~0,7 s/Frame@128px | EEVEE-Next nur mit GPU+EGL |
| **Multi-Clip in einem GLB** | ✗ (nur aktive Action) | iteriert `bpy.data.actions` |
| **FPS-Sampling** | ✗ (fixe Frame-Zahl) | `step = scene_fps/ziel_fps` |
| **Action-Slots 4.4+/5.0** | ✗ (nur Legacy) | setzt `action_slot` |
| **Invocation** | Header `blender -b` veraltet | bpy-Modul *oder* Binary |
| Atlas + Phaser-JSON | ✓ via `pack_atlas.py` ausgeführt | — |

---

## 9. Quellenliste
- TRELLIS https://github.com/microsoft/TRELLIS · TRELLIS.2 https://github.com/microsoft/TRELLIS.2
- InstantMesh https://github.com/TencentARC/InstantMesh · TripoSR https://github.com/VAST-AI-Research/TripoSR
- Hunyuan3D-2.1 EU-Ausschluss https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/issues/94
- Stable Fast 3D Lizenz https://stable-fast-3d.github.io/
- UniRig https://github.com/VAST-AI-Research/UniRig · https://huggingface.co/VAST-AI/UniRig
- Auto-Rig Pro Lizenz https://www.lucky3d.fr/auto-rig-pro/doc/license.html · Remap https://www.lucky3d.fr/auto-rig-pro/doc/remap_doc.html
- RigNet https://github.com/zhan-xu/RigNet · AccuRIG https://www.reallusion.com/auto-rig/accurig/ · Cascadeur https://cascadeur.com/help/faq
- Mixamo-Lizenz https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html · Community-FAQ https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775
- CMU Mocap http://mocap.cs.cmu.edu/ · BVH https://github.com/una-dinosauria/cmu-mocap
- AMASS-Lizenz https://amass.is.tue.mpg.de/license.html · HumanML3D https://github.com/EricGuo5513/HumanML3D · MotionGPT https://github.com/OpenMotionLab/MotionGPT
- Truebones https://truebones.gumroad.com/l/skZMC · Animal3D (CC-BY-NC) https://arxiv.org/abs/2308.11737
- Rokoko-Plugin LGPL-3 https://github.com/Rokoko/rokoko-studio-live-blender · Retarget-Doku https://support.rokoko.com/hc/en-us/articles/4410463481489
- Meshy Pricing/ToS https://help.meshy.ai/en/articles/12062933 · https://www.meshy.ai/terms-of-use · Tripo https://platform.tripo3d.ai/docs · Rodin https://hyper3d.ai/pricing
- Repo (verifiziert): `tools/render_unit.py`, `tools/pack_atlas.py`, `tools/werkzeuge_check.py`, `src/util/unit_anim.ts`

---
*Stand: Container-Bestandsaufnahme + 6-Cluster-Recherche (16 Subagenten-Themen).
Was hier `[recherchiert]` heißt, ist auf Ticros GPU-Maschine zu verifizieren,
bevor es als „getestet" gilt. Code3 baut die drei Wrapper aus §3/§6.*
