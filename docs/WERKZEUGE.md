# WERKZEUGE — Container-Inventar

Einunddreißig Werkzeuge sitzen im Container. Jede Code-Instanz prüft vor jedem Auftrag diese Liste, bevor sie irgendwas selbst baut. Doppelimplementierung ist ein roter Audit-Strich.

## Pflicht-Regel

Vor jedem Auftrag drei Schritte. Erstens `python tools/werkzeuge_check.py` im PASS-Modus laufen lassen und das Ergebnis im Bericht zitieren. Zweitens diese Liste lesen und prüfen, ob ein Werkzeug [...]

`werkzeuge_check.py` ist die Wahrheitsquelle. Wenn der Check ein Werkzeug als FAIL meldet, ist das ein Stopp-Signal vor jedem weiteren Schritt.

## CI-Klassifizierung (Fix A1, 2026-07-03)

Der `ci-fast`-Job installiert Python-Pakete via `pip install …` VOR dem
`werkzeuge_check.py --ci`-Lauf. Klassifizierung nach Messung im
`ubuntu-latest`-Runner (Python 3.11, Wheel-Verfügbarkeit):

- **Klasse 1** (ACTIVE, im ci-fast installiert): `rembg`, `onnxruntime`,
  `opencv-python-headless`, `Pillow`, `numpy`, `rectpack`, `pandas`,
  `matplotlib`, `pymatting`, `opensimplex`, `numpngw`, `pygltflib`, `trimesh`,
  `imageio-ffmpeg`, `pydub`, `pyloudnorm`, `soundfile`, `hypothesis`,
  `fastembed`, `mediapipe`. Reine Wheels, keine System-Deps über die
  ubuntu-latest-Base hinaus. **H18 `glb_validate`** hängt an `trimesh` und
  wird darüber PASS.
- **Klasse 2** (ACTIVE, System-Deps über `apt`): momentan keiner. `pyvips`
  (H6a) und `pyroomacoustics` sind bereits als `active=False` im Check
  geführt (RESERVED bis Bedarf).
- **Klasse 3** (RESERVED, nicht im ci-fast): `txtai` (schleppt cuda-toolkit-13
  + torch >2 GB an -- sprengt ci-fast-Budget; BM25/Neural läuft über
  `fastembed` + repo_rag-eigenen BM25-Fallback), `supriya` +
  `scsynth` (brauchen laufenden SuperCollider-Server im Container -- eigener
  langsamerer CI-Job, nicht ci-fast).
- **Zusatz 2026-07-04**: **H21 `render_iso_sheet`** und **H31 `convert_for_accurig`**
  sind in `ci-fast` **RESERVED**, weil sie `bpy` / Blender-Python voraussetzen,
  das im GitHub-Runner nicht verfügbar ist. Diese Werkzeuge bleiben für lokale
  bzw. spezialisierte Umgebungen vorgesehen und sind kein Pflicht-Gate für
  `ci-fast`.

**Modell-Gewichte H8 (RealESRGAN_x4plus.pth) und H9 (de-thorsten-low.onnx)**
bleiben RESERVED (`active=False` im Check). Wenn ein späterer Strang sie
braucht: `actions/cache@v4` mit dem GitHub-Release-Download aus dem Skript
`werkzeuge_check.py --install` -- ~130 MB, ein Lauf pro Cache-Key.

### Nach dem Fix freigelegter Folge-Befund (nicht Teil von A1)

Run 115 auf `886d6da` bestätigt den Werkzeug-Fix (alle drei Werkzeug-Steps
grün, Audio-Tests 5/5 grün), scheitert aber am Schritt `gate:assets` mit sieben
fehlenden UI-Asset-PNGs (`moderat_v_hero_slot_d`, `moderat_eye`,
`hellmuth_strip_v_a`, `hellmuth_v_topleft_a`, `hellmuth_sigil_b`,
`hellmuth_v_hero_anschluss_g`, `moderat_v_topleft_d`). Der Auftrag A1 sperrt
das Anfassen anderer CI-Bausteine ausdrücklich, aber es hilft der nächsten
Instanz zu wissen: **der Werkzeug-Bruch verdeckte diesen Asset-Bruch, der
schon vorher da war**. Eigener Folge-Auftrag.

---

## Welle 0/1 — Gates und Pipeline (acht Werkzeuge)

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 1 | `tools/hud_coherence.py` | Misst Helligkeit, Farbton, Lab-Distanz zwischen HUD-Zonen mit Median-Mengen | Vor jeder HUD-Abnahme, jede Asset-Iteration |
| 2 | `tools/hud_spec_check.py` | Liest die echte CSS und prüft Geometrie der Panels gegen `hud-spec-v2.md` | Bei jeder Layout-Änderung |
| 3 | `tools/hud_browser.mjs` | Headless Chromium-Render der gebauten App, liefert PNG des fertigen HUDs | Wenn der gerenderte Endzustand bewertet werden soll, nicht nur Komponenten |
| 4 | `tools/hud_gate.py` (Flag `?zonemap=1`) | Kombiniert Coherence + Spec + Render in einem Gate, mit Zonenkarte als Diagnose | Bei finaler HUD-Abnahme |
| 5 | `tools/normalize_asset.py` | Asset-Pipeline mit Flood-Fill, Hole-Removal, Hue-Window, Saturation, Bake | Auf jedes neue Sprite vor Manifest-Eintrag |
| 6 | `tools/krea_prompts.py` | Emittiert KREA-Prompts aus der Asset-Bibliothek mit Variantensystem | Wenn neue Assets gebraucht werden, vor Generierung |
| 7 | `tools/werkzeuge_check.py` | Selbst-Audit über alle Container-Werkzeuge, schaltet pro Werkzeug PASS oder FAIL | Vor und nach jedem Auftrag |
| 8 | `tools/lint_auftragsbrief.py` | Prüft Auftragsbriefe auf Spec-Anker, Beweisanforderungen, Quellenverweise | Beim Annehmen eines neuen Briefs |

---

## Welle 2 — Code12 W4-W11 (fünf Werkzeuge)

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 9 | `jscodeshift` | Codemod-Runner, kann z.B. `Math.hypot` über das Repo refactoren | Bei großflächigen Code-Transformationen, nicht von Hand |
| 10 | `odiff` | Pixel-genauer Bild-Diff, ersetzt manuelle 96×54-Vergleiche | Visuelle Regression in CI, jeder Asset-Vergleich |
| 11 | `rembg` + `pymatting` | Hintergrund-Entfernung plus Alpha-Matting für saubere Edges | Wenn Sprites freigestellt werden müssen, vor Manifest |
| 12 | `mediapipe` (Tasks-API, neue Version) | Liefert 33 Body-Landmarks, IK-Brücke für Charakter-Animation | Charakter-Rigging und Pose-Prüfung, Modelle in `tools/models/mediapipe/` (gitignore[...]
| 13 | `knip` + `madge` | Findet ungenutzten Code und zirkuläre Imports im TS-Repo | Vor jeder Aufräum-Welle, bei verdächtigem Bundle-Wachstum |

---

## Welle 3 — Code12 W12-W14 (vier Werkzeuge)

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 14 | `tools/repo_rag.py` (BM25 + Neural) | Volltextsuche und semantische Suche im Repo, beantwortet "wo steht X" | Vor jeder Recherche im eigenen Code, statt blindem grep |
| 15 | `tools/scsynth_synthdef.py` | Erzeugt SuperCollider SynthDefs und rendert WAV-Beweise mit FFT-Peak-Prüfung | Audio-Generierung und Audio-Tests |
| 16 | `auto_trim` (in `normalize_asset.py` integriert) | Schneidet transparente Ränder, spart 23-48 Prozent Sprite-Bytes | Auf jedes Sprite nach Freistellung, vor Atlas-Build |
| 17 | `tools/balance_sweep.py` | Vergleicht Sim-Hashes über N Seeds zwischen pre- und post-Patch | Determinismus-Beweis bei jeder Gameplay-Änderung |

---

## Welle 4 — 3D-Animations-Pipeline (Code3, vier Werkzeuge)

Voller End-to-End-Pfad aus dem KREA-Bild-zu-3D-Workflow zum Phaser-fertigen
Sprite-Atlas. Voraussetzung: bpy 4.2.0 (Hebel H4b PASS), trimesh (H4c PASS).
Stufe 1 (Image-to-3D) macht Ticro manuell in der KREA-UI; die anderen drei
Stufen sind hier vollautomatisch.

Vollständige Begründung der Architektur-Entscheidungen, Lizenz-Klauseln pro
Quelle und Backend-Strategie für Stufe 2 (Auto-Rigging) liegen in
`docs/PIPELINE-ANIMATIONS-IMPLEMENTATION.md`.

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 18 | `tools/glb_validate.py` | Eingangsvalidator für GLB-Dateien (Mesh-Anzahl, Triangle-Korridor, Genus, Watertight). Verhindert dass Bone-Heat-Crashes auf Marching-Cubes-Salat laufen und meld[...]
| 19 | `tools/auto_rig_3d.py` | Auto-Rigging mit Backend-Switch: `local-bpy-template` (humanoid, 0 €, ARMATURE_AUTO) oder `cloud-replicate` (UniRig auf Replicate, MIT, ~$0.07/Asset, non-humanoi[...]
| 20 | `tools/retarget_animation.py` | Mappt eine Quell-Animation (prozedurale Bibliothek oder optional CMU/BVH) per Constraint-Loop (bpy 4.2.0) auf das Skelett des gerigten GLB. Auto-Bone-Match [...]
| 21 | `tools/render_iso_sheet.py` | Wrapper um `render_unit.py` + `pack_atlas.py`, schließt die 4 Lücken (Multi-Clip-Iteration, FPS-Sampling, Action-Slots 4.4+, bpy-Modul-vs-Binary). 36.87°-I[...]

---

## Welle 5 — Florilegium-Backend + UI (Code9 + Code2, drei Werkzeuge)

In-Welt-Datenbank (Mass-Effect-Codex-Funktion, Diablo-Folianten-Rahmung).
Schema-Vertrag mit Code2 (UI) liegt in `data/florilegium/schema.json`.

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 22 | `tools/florilegium_validate.py` | Validiert Florilegium-Eintraege gegen `data/florilegium/schema.json` (id, category, unlock, image/audio-Pfade, text 200..2000) | Vor jedem Commit eines ne[...]
| 23 | `tools/florilegium_voice.py` | Vorrendert pro Eintrag eine OGG-Datei via Eleven-Labs-Voice-Klon (Helmuth). Idempotent (SHA-256 ueber text+settings), Budget-Cap 100/Lauf | Wenn ein neuer Ei[...]
| 24 | `tools/florilegium_ui_check.py` (+ `tools/florilegium_ui_browser.mjs`) | Headless-Chromium-Pruefung der Florilegium-UI gegen `dist/`. Misst Selektoren `#florilegium .flo-frame/.flo-list/.f[...]

**H22** ist immer ACTIVE — der Validator laeuft pure-stdlib und ist Pflicht-Gate
fuer jeden Florilegium-Commit. Geruest-Phase (leerer Inhalts-Ordner) ist PASS
mit dem Hinweis "no entries yet, schema valid".

**H23** ist ACTIVE genau dann, wenn `ELEVENLABS_API_KEY` UND `HELLMUTH_VOICE_ID`
gesetzt sind. Ohne Env -> RESERVED (nicht FAIL). Der `werkzeuge_check`-PASS-Test
ist ein `--dry-run` (kein API-Call, keine Kosten). Echter Round-Trip:

```
ELEVENLABS_API_KEY=... HELLMUTH_VOICE_ID=... \
  python3 tools/florilegium_voice.py data/florilegium/de/einheiten/apothekerin.json
```

Erfolg: die im `audio`-Feld benannte OGG-Datei existiert unter
`hellmuth/assets/voice/<lang>/florilegium/<category>/<slug>.ogg`.

**H24** ist `active=False` bis ein `dist/`-Build vorliegt (wie H3
`hud_browser.mjs`); ohne Build steht der Hebel als RESERVED in der Tabelle.
Echter Round-Trip (lokal, nach `npm run build`):

```
python3 tools/florilegium_ui_check.py            # Strukturpruefung
python3 tools/florilegium_ui_check.py --shoot    # Apothekerin-Render-Beweis
```

Erfolg: `proof/florilegium/apothekerin_fullview.png` existiert, und die
Strukturpruefung exitet 0.

---

## Welle 6 — Menü-Familie (Code2, ein Werkzeug)

Pre-Game-Screens (Hauptmenü, Skirmish, Optionen, Footer) plus der globale
`AudioBus`. Eigener DOM-Stamm `#hellmuth-menu`, Design-Tokens aus
`src/ui/design_system.css`. Details in `docs/MENU-FAMILIE.md`.

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 25 | `tools/menu_ui_check.py` (+ `tools/menu_ui_browser.mjs`) | Headless-Chromium-Pruefung der Menü-Familie gegen `dist/` (Flag `?menu=1`): 5 Menüpunkte (Kampagne disabled), Design-Tokens (Hi[...]

**H25** ist `active=False` bis ein `dist/`-Build vorliegt (RESERVED in der
Tabelle). Echter Round-Trip (lokal, nach `npm run build`):

```
python3 tools/menu_ui_check.py            # Strukturpruefung
python3 tools/menu_ui_check.py --shoot    # Hauptmenue-Render-Beweis
```

Erfolg: `proof/menu/menu_main.png` existiert, und die Strukturpruefung exitet 0.

Die Knockback-Hebel (Code-Physik) laufen als **KB-H14..KB-H18** im
`werkzeuge_check.py`, eigener Namensraum, um die globalen H-Nummern nicht doppelt
zu belegen.

---

## Welle 7 — Animations-Einstiegspunkt (Code3, zwei Werkzeuge)

Vereinheitlicht die Welle-4-Pipeline (H18–H21) hinter EINEM Befehl, so wie der
Brief `CODE3ANIMATIONSDETAIL.md` ihn als Erfolgsmassstab fordert. Quellen sind
nach Ticro-Strike (2026-06-17) auf **prozedural + CMU** reduziert; Mixamo und
Truebones sind raus (Strike plus 403-Netzschranke im Container). Voller
End-to-End-Beweis mit Zeitmessung in `docs/ANIMATIONS-PIPELINE-VOLL.md`.

| Nr | Werkzeug | Was es macht | Wann nutzen |
|---|---|---|---|
| 26 | `tools/animate_glb.py` | Vereinheitlichter Einstiegspunkt: `--rig X.glb --anim-type <type> --out Y.glb`. Dispatch: idle/walk/attack/death → Retarget-Pfad (ruft H20 mit prozeduraler Quell[...]
| 27 | `tools/animations/anim_library.py` (`resolve`/`search`) | Loest fuer einen Archetyp den besten Quell-Clip auf (`resolve walk --family humanoid`), Praeferenz prozedural vor CMU, dann kleins[...]
| 28 | `tools/tile_tools.py` (`kacheltest`/`heal`/`quilt`/`diamond`) | Nahtlos-Werkzeuge fuer Boden-Tiles: Naht-Score (Wrap-Diff/Innen-Diff, PASS < 1,6, synthetisch validiert), Offset+Heal per Ef[...]
| 29 | `tools/mine_mockup.py` (+ `tools/get_mining_weights.sh`) | Mockup-Ernte als Batch: Real-ESRGAN-anime -> GroundingDINO+SAM2 -> rembg(isnet-anime/birefnet) -> ImageMagick Erode+Trim. Jede St[...]
| 30 | `normalize_asset.py --keyer lab` (Upgrade Werkzeug 5) | Chroma-Distanz-Keying im CIELAB-Raum, weiche Delta-E-Rampe (t_in=8/t_out=22) gegen Rand-Median-Grau; Flood-Topologie (Schatten-Erhal[...]
| 31 | `tools/convert_for_accurig.py` | FBX-/OBJ-/GLB-/GLTF-Konverter fuer Reallusion AccuRIG: bpy-headless-Roundtrip normalisiert FBX-SDK v7700 (FBX 2020, KREA-Default) auf v7400 (FBX 2014, Accu[...]

---

## Anti-Pattern

Diese drei Reflexe sind verboten und gelten als roter Audit-Strich.

Erstens: ImageMagick-Bash-Pipelines für Sprite-Operationen schreiben. `normalize_asset.py` mit `auto_trim` macht es. ImageMagick bleibt für Einzel-Diagnostik im Terminal, nicht in Skripten.

Zweitens: eigenes Pixel-Diff mit `pixelmatch`, `Pillow.ImageChops` oder Bash-Loops bauen. `odiff` ist installiert und kalibriert.

Drittens: Repo nach Strings durchsuchen mit `grep -r` oder ad-hoc-Scripts. `repo_rag.py` BM25 macht es schneller und liefert reproduzierbare Treffer.

---

## Anhang: weitere Repo-Skripte (Coverage)

Die folgenden Repo-internen Skripte sind keine eigenständigen Werkzeuge im
Sinne der 17er-Liste oben, müssen aber im Manifest erwähnt sein, damit
`tools/check_manifest_coverage.py` keine Lücke meldet (Brief Schritt 4:
jedes `tools/*.py` muss hier genannt sein).

### Asset- und Pipeline-Skripte (nutzen ein gelistetes Werkzeug)

- `tools/freistellen_all.py` — Batch-Wrapper um Werkzeug 11 (`rembg + pymatting`).
- `tools/generate_unit_sprites.py` — Generator/Wrapper für Einheiten-Sprite-Erzeugung in der Code3-Pipeline; repo-internes Hilfsskript für Atlas-/Sprite-Builds.
- `tools/normalize_asset.py` — Werkzeug 5 (oben gelistet).
- `tools/pack_atlas.py` — Sprite-Atlas-Pack mit `auto_trim` (Werkzeug 16).
- `tools/process_decals.py` — Decal-Pipeline.
- `tools/process_ui_v2.py` — UI-Asset-Pipeline (Legacy).
- `tools/render_unit.py` — Einheit-3D-Render-Vorstufe.
- `tools/scale_hud_css.py` — HUD-CSS-Skalierung.
- `tools/build_hud_assets.py`, `tools/build_hud_frame.py`,
  `tools/build_hud_strips.py` — HUD-Asset-Builds.
- `tools/mediapipe_pose_to_ik.py` — Wrapper um Werkzeug 12 (`mediapipe`).
- `tools/animations/procedural/procedural_anim.py` — prozeduraler Animations-
  Generator (Quelle 4, bpy): Drohne/Insekt/Pflanze/Idle als GLB-Clips.
- `tools/animations/fetch_animations.py` — Beschaffung CMU (Public Domain) mit
  Lizenz-Sidecar pro Datei. Mixamo/Truebones nach Ticro-Strike entfernt.
- `tools/animations/anim_library.py` — Bibliotheks-Index (scannt Clips →
  MANIFEST.json) plus `resolve`/`search` (Werkzeug 27, speist H26).
- `tools/animate_glb.py` — Werkzeug 26 (oben in Welle 7 gelistet).
- `tools/_gen/gen_glow_radial.py` — Glow-Radial-Texturgenerator (FX, Destille-
  Produktions-Glow; Fremd-Skript Commit 2a879ce).

### Gates (Plicht in `pruefen.sh` / CI)

- `tools/asset_resolve_gate.py` — HUD-Manifest-Aufloesung.
- `tools/baseline_gate.py` — Baseline-Hash-Manifest.
- `tools/fog_depth_gate.py` — Nebel-Tiefe-Lesbarkeit.
- `tools/hud_continuity.py` — HUD-Durchgaengigkeit + Eckverschmelzung.
- `tools/hud_soll_gate.py` — HUD-Soll-Spec render-basiert.
- `tools/terrain_gate.py` — Terrain-Render-Gleichheit.

### Mess- und Probe-Skripte

- `tools/footprint_proof.py`, `tools/hud_anchor_proof.py`,
  `tools/hud_anchor_live_proof.py`, `tools/hud_distortion_proof.py`,
  `tools/hud_input_proof.py`, `tools/hud_render_proof.py`,
  `tools/hud_template_measure.py` — diverse HUD-Mess-Proben.
- `tools/audio_bpm_check.py`, `tools/audio_hrtf_demo.py`,
  `tools/audio_noisereduce_demo.py` — Welle-3-Audio-Praxis.
- `tools/status_gallery.py` — `proof/STATUS.md`-Galerie-Generator.

---

## Verteilung an alle Code-Instanzen

Jede aktive Session bekommt mit dem nächsten Auftragsbrief diese Zeile als erste inhaltliche Vorgabe.

```
Vor allem anderen: tools/werkzeuge_check.py laufen lassen, docs/WERKZEUGE.md
lesen, im Bericht den PASS-Stand pro Werkzeug zitieren. Doppelimplementierung
eines vorhandenen Werkzeugs ist roter Audit-Strich.
```

Code8 als Auditor prüft bei jeder Sammelabnahme stichprobenartig, ob die geprüften Sessions die Werkzeuge tatsächlich verwendet haben. Bei Verstoß landet der entsprechende Strang in den Welle[...]
