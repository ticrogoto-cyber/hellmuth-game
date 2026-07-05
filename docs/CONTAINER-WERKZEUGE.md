# CONTAINER-WERKZEUGE

Welche fertigen, mächtigen Module sich eine Code-Instanz (Code2–Code10) in ihren
Container `pip/npm/cargo install` kann, um eine ganze Klasse manueller oder externer
(Bezahl-)Asset-Arbeit für HELLMUTH zu ersetzen. **Jeder Eintrag wurde im Container
installiert UND an einem echten HELLMUTH-Asset bis zum Ergebnis durchgelaufen.** Was nur
installiert, aber an gesperrten Modellgewichten scheitert, steht in der Verworfen-Liste.

## Die Messgrenze, die alles bestimmt (gemessen)

Der Container hat kein offenes Netz. **Erreichbar:** `pypi.org`, `files.pythonhosted.org`,
`npmjs.org`, `crates.io`, `github.com` + `release-assets.githubusercontent.com`
(Release-Assets), `raw.githubusercontent.com`, Ubuntu-`apt` (Container läuft als root).
**Tot:** `huggingface.co` liefert **HTTP 403** auf jeden `/resolve/`-Gewichtspfad,
`cdn-lfs.huggingface.co` **löst nicht einmal per DNS auf**.

Daraus die eine Regel, die jeden KI-Kandidaten entscheidet: **es zählt der Gewichts-Host,
nicht der Paket-Host.** Ein Tool, dessen Modell auf einem **GitHub-Release** liegt
(rembg/u2net, Real-ESRGAN, piper-Stimmen), läuft. Ein Tool, dessen Modell nur auf
**Hugging Face** liegt (MusicGen, Bark, Coqui), ist tot — egal wie sauber `pip install`
durchläuft. KI-**Generierung** (Musik, Stimmklon, Diffusion) ist durchweg tot; KI mit
**festen, auf GitHub gespiegelten Gewichten** lebt.

Zwei weitere, quer durch die Runde gemessene Fallen stehen unten unter »Betriebsnotizen«.

---

# TEIL 1 — DIE HEBEL (priorisiert nach Wirkung gegen Aufwand)

## H1 · `rembg` — automatisches KI-Hintergrund-Entfernen  ⭐ größter Hebel

- **Was es ist:** semantisches Freistellen (u2net-ONNX), erzeugt einen Alpha-Kanal ohne
  Box-Vorgabe.
- **Ersetzt:** Ticros häufigste Handarbeit — das Freistellen von Higgsfield-Generierungen
  (grauer Hintergrund → transparent) — und die Bezahl-Calls `Higgsfield remove_background`
  / `Adobe image_remove_background`. Im Repo bisher: `tools/freistellen_all.py` /
  `normalize_asset.py` Stufe A, ein Rand-Flood-Fill, der laut eigenem Docstring **nur bei
  einheitlich grauem Hintergrund** funktioniert und bei randberührenden Objekten bricht.
- **Mess-Protokoll:** `pip install rembg onnxruntime` (rembg 2.0.76). Headless, CPU. **Modell
  GEMESSEN** (urllib3-Log): lädt von `github.com/danielgatis/rembg/releases/.../u2net.onnx`
  → `release-assets.githubusercontent.com` HTTP 200, 176 MB — **GitHub, nicht HF.** Gelaufen
  an `assets/source/ui/violett/hellmuth_v_hero_solo_a.png` (~3,3 s): Ecken-Alpha 0, Zentrum
  254, halofrei; **IoU 96,5 % gegen Ticros eigene Hand-Freistellung**, mittlere Alpha-Diff
  5/255.
- **Install + Aufruf:**
  ```bash
  pip install rembg onnxruntime
  export U2NET_HOME=hellmuth/tools/models/u2net   # persistenter Cache; Modell lädt von github
  ```
  ```python
  from rembg import remove, new_session
  S = new_session("u2net")                 # einmal pro Prozess
  remove(Image.open(src).convert("RGBA"), session=S).save(dst)   # ~3 s/Bild CPU
  ```
  Fallback ohne rembg (H1b, von T3 belegt): `onnxruntime` + `u2net.onnx` manuell von
  derselben GitHub-Release-URL ziehen und roh inferieren — identisches Ergebnis, falls das
  rembg-Paket je bricht.
- **Nutzende Instanz:** Asset-Pipeline (`tools/rembg_freistellen.py`), Batch über neue
  Higgsfield-Gens, danach `normalize_asset.py` Stufe B.
- **Grenze:** u2net ist ein generelles Salienz-Modell; bei filigranen HUD-Teilen oder sehr
  kontrastarmem Hintergrund weichere Kante. Für Gebäude/Helden mit klarem Subjekt sauber.

## H2 · `opencv-python-headless` (cv2) — deterministische Alpha-/Trim-/Prüf-Arbeit

- **Was es ist:** modellfreie Bildverarbeitung (kann im Container nie an HF scheitern).
- **Ersetzt:** handgerollte PIL+scipy-Routinen für Auto-Trim, Alpha-Kantensäuberung und die
  geplante asset-spec-Farb-/Halo-Prüfung (eine MAXI-3-Skriptarbeit als Dreizeiler).
- **Mess-Protokoll:** `pip install opencv-python-headless` (4.13, pythonhosted), keine
  Gewichte. An 4 echten Sprites: **Auto-Trim spart 16–21 % Fläche** (deckungsgleich mit
  PIL `getbbox` ±1px); Streupixel-/Halo-Entfernung via `connectedComponents`+`morphologyEx`;
  Halo-Detektor (Canny-Ring-Sättigung) markiert `hellmuth.png` korrekt.
- **Konkreter Bug, den es schließt:** `tools/pack_atlas.py` setzt `"trimmed": false` hart und
  verschenkt damit die 16–21 % — cv2-Trim füllt `trimmed:true`+`spriteSourceSize` echt.
- **Install + Aufruf:** `pip install opencv-python-headless`; `cv2.imread(p, IMREAD_UNCHANGED)`
  → Alpha-Slice/Morphologie.
- **Nutzende Instanz:** `pack_atlas.py`, `normalize_asset.py`, `process_ui_v2.py`.
- **Grenze:** GrabCut ist **kein** rembg-Ersatz (braucht Box, kein semantisches Modell). cv2
  gewinnt NACH dem Freistellen, rembg davor.

## H3 · `imageio-ffmpeg` + `pydub` + `pyloudnorm` — die Audio-Vorpipeline

- **Was es ist:** statisches ffmpeg-7.0.2-Binary via pip (kein apt) + High-Level-Schnitt
  (`pydub`) + EBU-R128-Lautheits-Normalisierung (`pyloudnorm`).
- **Ersetzt:** die manuelle Audacity-/Online-Konverter-Runde vor jedem Drop-a-file und das
  Lautheits-Angleichen generierter ElevenLabs-Sounds nach Gehör.
- **Mess-Protokoll:** `pip install imageio-ffmpeg pydub pyloudnorm soundfile`. **Wichtig:** im
  Container ist KEIN ffmpeg auf PATH — `imageio_ffmpeg.get_ffmpeg_exe()` liefert das gebündelte
  Binary (MAXI-3 nennt »ffmpeg«, hier der Beweis, dass es via pip kommt). Konversion an
  erzeugtem Sample verifiziert: WAV→OGG/M4A/MP3, Resample 48k→44.1k, Downmix, Trim/Fade.
  Lautheit: zwei Töne −9,74 und −27,58 LUFS → **beide auf −16,00 LUFS** (Spread 17,85→0,00 LU).
- **Install + Aufruf:**
  ```python
  import imageio_ffmpeg; from pydub import AudioSegment
  AudioSegment.converter = AudioSegment.ffmpeg = AudioSegment.ffprobe = imageio_ffmpeg.get_ffmpeg_exe()
  seg = AudioSegment.from_file("eleven.mp3", format="mp3").set_channels(1).set_frame_rate(44100)
  seg.export("public/audio/x.ogg", format="ogg", codec="libvorbis")
  # Lautheit:
  import soundfile as sf, pyloudnorm as pyln
  d,r = sf.read("x.wav"); m = pyln.Meter(r)
  sf.write("x.wav", pyln.normalize.loudness(d, m.integrated_loudness(d), -16.0), r)
  ```
- **Nutzende Instanz:** Audio-Pipeline, Vorstufe zum Drop-a-file-Vertrag (`public/audio/`).
- **Gotchas:** der Static-ffmpeg-Build hat **kein ffprobe** → `format=` an `from_file`
  übergeben; pydub feuert eine harmlose Import-`RuntimeWarning` (unterdrückbar).
  Anti-Moderat: MAXI-3 plant per-Datei-`gain` (manuell) + Limiter — **Lautheits-Normalisierung
  als Modul fehlt**; genau das ist der Mehrwert.

## H4 · `trimesh`/`pygltflib`/`dracox` + `FBX2glTF` + `bpy` — die 3D-/Animations-Pipeline

- **Was es ist:** der ganze Weg Mixamo-FBX → getextertes GLB → Retarget → leichte Mesh-Ops,
  headless im Container. Die Assets liegen bereits im Repo
  (`assets/source/units/hellmuth_{idle,walk,attack,death}.fbx`, `proof3d/public/models/hellmuth.glb`).
- **Ersetzt:** manuelle Blender-Handarbeit bei Format-Konversion, Höhenvermessung,
  Vertex-Filter, Dezimierung — und macht das Mixamo-Retarget skriptbar.
- **Mess-Protokoll (drei Module):**
  - `FBX2glTF` (Binary von `github.com/facebookincubator/FBX2glTF/releases/.../v0.9.7/FBX2glTF-linux-x64`,
    HTTP 200): alle 4 Mixamo-Clips → GLB, **Rig+Animation+Textur überleben** (rc=0).
  - `bpy` (`pip install bpy` → 5.0.1, PyPI, 374 MB) headless: FBX-Import (33 Bones,
    `mixamorig:`) + GLB-Export rc=0. Ziel-GLB hat **dieselbe `mixamorig:`-Benennung** (28
    Bones) → **Retarget ist namens-direkt, kein Bone-Mapping nötig**.
  - `trimesh`+`pygltflib`+`dracox` (pythonhosted): Höhe `1,138` am echten 498k-Face-GLB in
    **<1 s** statt 3–8 s Blender-Kaltstart; Dezimierung 498k→448k Faces, GLB↔OBJ/PLY.
- **Install + Aufruf:**
  ```bash
  curl -L -o FBX2glTF https://github.com/facebookincubator/FBX2glTF/releases/download/v0.9.7/FBX2glTF-linux-x64 && chmod +x FBX2glTF
  ./FBX2glTF -b -i hellmuth_idle.fbx -o idle      # FBX -> GLB
  pip install trimesh pygltflib dracox            # leichte Mesh-Ops
  python3 -c "import dracox,trimesh; dracox._register_handlers(); print(trimesh.load('hellmuth.glb').to_geometry().extents[1])"
  ```
- **Nutzende Instanz:** Code9 / Asset-Pipeline. `render_unit.py` kann die Höhe (`--ortho-scale`)
  und den Vertex-Filter ohne Blender-Boot vorab bestimmen.
- **Zwei harte Auflagen:**
  1. **`bpy` zwingt numpy 2.4.6 → 1.26.4** und **kollidiert mit rembg/opencv/Real-ESRGAN
     (numpy≥2)** — `bpy` MUSS in ein eigenes venv (siehe Betriebsnotizen).
  2. Das committete GLB ist **Draco-komprimiert** → `trimesh` liefert ohne
     `dracox._register_handlers()` lautlos Null-Geometrie (Fallback: pygltflib-Accessor-BBox).
  3. `trimesh` öffnet **kein FBX** → FBX bleibt FBX2glTF/bpy.

## H5 · `0x` + `tsx` + CDP-CPU-Profil — Performance-Profiling des Sim-Kerns

- **Was es ist:** Flamegraph (`0x`, npm) für den node-direkt lauffähigen Sim-Kern, plus ein
  CDP-CPU-Profiler über das schon vorhandene Playwright-Chromium für den vollen Browser-Sim.
- **Ersetzt:** Performance-Raten durch gemessenes Profil mit benannten heißen Funktionen.
- **Mess-Protokoll (am ECHTEN Sim, beide Pfade einig):** **A*/Pathfinding ist 0,1 % — NICHT
  der Flaschenhals.** ~70–75 % der Tick-Zeit = SpatialGrid-Radiusabfragen + Distanzmathematik
  (`Math.hypot` 49 % node-direkt; `queryRadius` 37,6 % CDP), getrieben von `avoidance` +
  Combat-`acquire`. ms/Tick: voller Sim median 16,5 ms @1000 Einheiten, **reißt 33 ms (30 Hz)
  zwischen N≈1500–2000** (super-linear durch Dichte).
- **Install + Aufruf:**
  ```bash
  npm install -g 0x tsx
  npx esbuild hellmuth/tools/sim_load_profile.ts --bundle --platform=node --format=esm --target=node22 --outfile=/tmp/s.mjs
  0x --output-dir /tmp/0x-out -- node /tmp/s.mjs 1000 3000        # Flamegraph
  cd hellmuth && npm run build && node tools/sim_cdp_profile.mjs 1000 1500   # voller Sim via CDP
  ```
  (Harnesses liegen committet unter `hellmuth/tools/sim_load_profile.ts` + `sim_cdp_profile.mjs`.)
- **Nutzende Instanz / Optimierungs-Hebel:** `spatial_grid.ts` `queryRadius` und
  `movement_system.ts` `avoidance` — `Math.hypot` durch `dx*dx+dy*dy` mit quadrierten
  Schwellen ersetzen (trifft den 49-%-Block direkt). `pathfinding.findPath` NICHT optimieren
  (0,1 %, bereits durch Flussfeld entschärft).

## H6 · `pyvips` (libvips) + `rectpack` — Batch-Bildops & Atlas-Packing

- **Was es ist:** `pyvips` = schnelle Streaming-Bildverarbeitung; `rectpack` = tight
  Rectangle-Atlas-Packer.
- **Ersetzt:** langsame PIL-Batch-Schleifen; Hand-Atlas für heterogene Sprites.
- **Mess-Protokoll:** `apt-get install -y libvips42` (root) + `pip install pyvips` (3.1.1).
  An 10 echten Gebäude-Sprites: **Thumbnail 3,98× schneller als PIL** (shrink-on-load),
  Trim pixelgenau zu PIL (mit Alpha>0-Maske). `rectpack`: Default-`pip` **scheitert**
  (sdist-only, setuptools-Bug) → **`pip install rectpack --use-pep517`** baut 0.2.2;
  Atlas-Round-trip 10 Sprites verlustfrei.
- **Install + Aufruf:** `pyvips.Image.thumbnail(path, 256).write_to_file(out)`;
  `rectpack.newPacker()`.
- **Nutzende Instanz:** `normalize_asset.py`-Batch; `rectpack` **ergänzt** `pack_atlas.py`
  (Grid-Packing uniformer Animations-Frames), deckt aber den orthogonalen Fall ab
  (heterogene, getrimmte Sprites verschiedener Größe).
- **Gotchas:** pyvips lazy → `.copy_memory()` in Multi-Insert-Pipelines; rectpack zwingend
  `--use-pep517`.

## H7 · `pandas` + `matplotlib` + `balance_sweep.mjs` — Balance über viele Läufe

- **Was es ist:** Auswerte-Schicht über einem Multi-Seed-Sim-Harness am echten
  deterministischen Sim.
- **Ersetzt:** Balance nach Bauchgefühl/Handtabelle.
- **Mess-Protokoll:** `pip install pandas matplotlib` (Agg headless), keine Gewichte. 80 Seeds
  am echten Sim: **78/80 bit-identisch** (Determinismus belegt); Korrelation
  `n_units`↔`step_ms` = **+0,967**; konkreter Tuning-Befund (Moderat-`stahlbrute` verliert in
  120 Schritten nie eine Einheit).
- **Install + Aufruf:** `node tools/balance_sweep.mjs 80 120 > /tmp/balance.csv` → pandas/matplotlib.
  (Harness committet: `hellmuth/tools/balance_sweep.mjs`.)
- **Nutzende Instanz:** Balance/Tuning-Instanz gegen `src/data/balance.ts`.
- **Ehrliche Lücke (zwei Schichten):** die `window.__sim`-Brücke exponiert **kein
  Match-Outcome** (Sieger/Dauer — `EVT_VICTORY` existiert, ist nicht durchgereicht → kleiner
  `sim.outcome()`-Zusatz nötig); und **`simRng` wird nur von `doodad_system` gelesen**, Combat
  liest kein RNG → Seed perturbiert das Kampf-Outcome nicht → echte Seed-Verteilung über
  Kämpfe braucht erst RNG-Verdrahtung in Combat/Spawn-Jitter. pandas/matplotlib sind der
  Auswerte-Hebel; die Outcome-Daten brauchen diesen kleinen Engine-Zusatz.

## H8 · Upscaling — Real-ESRGAN (KI) + PIL Lanczos (deterministisch)

- **Was es ist:** zwei Klassen. KI rekonstruiert echtes Detail; Lanczos skaliert nur sauber.
- **Ersetzt:** ein Bezahl-Upscaler.
- **Mess-Protokoll:** Das `realesrgan`-Paket **scheitert am Build** (basicsr/filterpy) — Bypass:
  `pip install torch` (1,2 GB CPU) + RRDBNet-Arch in purem torch, **Gewicht von
  `github.com/xinntao/Real-ESRGAN/releases/.../RealESRGAN_x4plus.pth` (HTTP 200, 67 MB —
  GitHub, nicht HF)**, `load_state_dict(strict=True)` ok. An echten Sprites ×4 (~0,5–1 s/Sprite
  CPU), 2–7× Lanczos-Kantenenergie. **Lanczos:** PIL schon da, kein Install, **<10 ms**.
- **Install + Aufruf:** KI: `pip install torch` + RRDBNet laden; deterministisch:
  `Image.resize((w*4,h*4), Image.LANCZOS)`.
- **Nutzende Instanz:** Asset-Pipeline. Lanczos als Default-Skalierer; Real-ESRGAN nur, wo
  echtes Detail gebraucht wird (Aufwand: 1,2 GB torch + manuelle Arch).

## H9 · `piper-tts` — neuronales TTS (Platzhalter-VO)

- **Was es ist:** schnelles ONNX-TTS, feste Stimmen (DE+EN, ~16 kHz).
- **Ersetzt:** ElevenLabs für **einfache/Platzhalter-VO** (nicht für finale Charakterstimmen).
- **Mess-Protokoll:** `pip install piper-tts` (onnxruntime). **Falle:** der Default-Stimmen-Downloader
  zeigt auf `huggingface.co/rhasspy/piper-voices` → **403**, und `github.com/rhasspy/piper-voices`
  → 404. **Ausweg gemessen:** Stimmen-`.tar.gz` von `github.com/rhasspy/piper/releases/download/v0.0.2/`
  (DE `voice-de-thorsten-low`, EN `voice-en-us-lessac-medium`, HTTP 200, 58 MB). Synthese
  bewiesen: »Hellmuth ist das neue High.« → 16-kHz-WAV, echtes Signal.
- **Install + Aufruf:** `pip install piper-tts`; Stimme von der **GitHub-Release**-URL ziehen
  (nicht Default-Downloader); `echo "..." | piper -m de-thorsten-low.onnx -f out.wav`.
- **Nutzende Instanz:** Audio-Pipeline für Platzhalter-Bark/VO bis ElevenLabs liefert.

## H10 · `vtracer` + `cairosvg` — Raster→SVG (eng begrenzt)

- **Was es ist:** algorithmische Vektorisierung (Rust, kein Modell).
- **Ersetzt:** manuelle/Bezahl-Vektorisierung (Illustrator/Vectorizer.AI) — **nur für flache,
  cel-shaded UI-Icons**.
- **Mess-Protokoll:** `pip install vtracer cairosvg` (Wheel, kein Compile; cargo-Weg
  bestätigt). `icon-botanicals` → 325 Pfade, **1,41× kleiner** (Gewinn). `icon-destillat`
  (2014 Pfade) und `hellmuth_sigil_a` (6539 Pfade, 4,4× größer) = **Verlust**.
- **Install + Aufruf:** `vtracer.convert_image_to_svg_py(src, dst, filter_speckle=4)`; für
  freigestellte Assets die Original-Alpha-Matte zurückspielen (vtracer füllt Transparenz mit
  Schwarz).
- **Nutzende Instanz:** UI-Asset-Pipeline, nur flache Icons.
- **Grenze:** wertlos für verlaufsreiche oder fotorealistische Higgsfield-Gens (Pfad-Explosion).

---

# TEIL 2 — DIE VERWORFEN-LISTE (damit niemand Stunden verbrennt)

| Modul | Verlockung | GEMESSENER Scheiter-Grund |
|---|---|---|
| **MusicGen / `audiocraft`** | KI-Musik/Ambience | Gewichte nur `huggingface.co/.../resolve/main` → **403**; `cdn-lfs.huggingface.co` **DNS tot**; kein GitHub-Spiegel. Zusätzlich Build-Fehler (`av`/PyAV: fehlende ffmpeg-dev-libs). **Tot.** |
| **`bark`** | KI-Sprach-/SFX-Generierung | Wheel-Build `encodec` bricht (`install_layout`); Gewichte HF → 403. **Tot.** |
| **`TTS` (Coqui XTTS)** | Stimmklon | Builds `gruut`/`encodec`/`jieba` brechen (`install_layout`); Gewichte HF. **Tot** als Generator. (Für FESTE Stimmen siehe H9 piper.) |
| **`realesrgan` / `basicsr` (Paket)** | KI-Upscaling bequem | Wheel-Build scheitert (`basicsr`+`filterpy`: `install_layout`). **Das Paket ist tot** — die Fähigkeit lebt nur über den purer-torch-Bypass (H8). |
| **`rectpack` (Default-pip)** | Atlas-Packer | Default-Build scheitert (sdist-only, setuptools-Bug). Lebt **nur** mit `--use-pep517` (H6). |
| **`rembg[cli]`** | bequemes CLI | CLI-Extra-Install bricht; **die Python-API (H1) braucht es nicht** — kein echter Verlust. |
| **Mixamo-Auto-Download** | Clips automatisch ziehen | `mixamo.com` → **403 host_not_allowed**, `download.mixamo.com` → **DNS tot**. Clips bleiben ein manueller Eingabe-Schritt (liegen bereits im Repo, H4). |

**Die Regel hinter der Liste:** Jede KI-**Generierung** (neue Pixel/Töne aus einem Prompt)
hängt an Hugging-Face-Gewichten und ist im Container tot. Jede KI-**Verarbeitung mit festem,
GitHub-gespiegeltem Gewicht** (Freistellen, Upscaling, TTS) lebt. Der Bruch verläuft an der
Gewichts-Quelle, nicht am Werkzeug-Zweck.

---

# TEIL 3 — BETRIEBSNOTIZEN (quer durch die Runde gemessen)

1. **Zwei unverträgliche venv-Cluster (numpy-Konflikt).** Das Bild-Cluster (rembg, opencv,
   onnxruntime, Real-ESRGAN-torch) verlangt **numpy ≥ 2**. **`bpy` zwingt numpy auf 1.26.4**
   herunter und bricht das Bild-Cluster. → `bpy` (und damit die 3D-Render-Strecke) gehört in
   ein **eigenes venv**, getrennt von den Bild-Werkzeugen. Code9 (3D) und die
   Freistell-/Atlas-Instanz dürfen sich kein env teilen.

2. **Der `setuptools install_layout`-Bug** trifft viele sdist-only-Pakete unter Python 3.11
   (`basicsr`, `encodec`, `gruut`, `rectpack`, …). Erst probieren: `pip install X --use-pep517`.
   Hilft das nicht (HF-Gewichte dahinter), ist es Verworfen.

3. **GitHub-Release-Assets sind die Rettung.** Wo ein KI-Tool funktioniert, lädt sein Gewicht
   von `github.com/.../releases/download/...` → `release-assets.githubusercontent.com` (200).
   Die unauth GitHub-**API** ist rate-limited (60/h) — irrelevant, da Roh-/Release-Downloads
   nicht über die API zählen.

4. **Der Sim-Kern ist browser-gebunden** (Entities erben von `Phaser.GameObjects.Container`),
   aber sein **algorithmischer Heißpfad ist Phaser-frei** und node-direkt unter `tsx`/`0x`
   profilierbar (H5). Für alles, was den Display-Tree braucht, bleibt der Playwright-Pfad.

5. **Kein echtes Audio und (außer den Unit-FBX/GLB) kein weiteres Mesh im Repo** — die
   Audio-Hebel (H3) und Teile von H8/H9 wurden an erzeugten Samples bewiesen; sobald
   ElevenLabs/weitere Assets liefern, laufen sie unverändert.

---

## Anhang · Mess-Matrix (13 Kandidaten, alle im Container durchgelaufen)

| # | Modul | Klasse | Gewicht-Quelle | Urteil |
|---|---|---|---|---|
| H1 | rembg / onnxruntime+u2net | KI-Bild | GitHub | HEBEL (IoU 96,5 %) |
| H2 | opencv-python-headless | determin. Bild | — | HEBEL |
| H3 | imageio-ffmpeg+pydub+pyloudnorm | determin. Audio | — | HEBEL |
| H4 | trimesh/pygltflib/dracox, FBX2glTF, bpy | 3D | GitHub/PyPI | HEBEL (venv-getrennt) |
| H5 | 0x+tsx+CDP | Profiling | — | HEBEL (hypot-Hotspot) |
| H6 | pyvips, rectpack(--use-pep517) | determin. Bild | — | HEBEL |
| H7 | pandas+matplotlib+balance_sweep | Daten | — | HEBEL (Outcome-Lücke) |
| H8 | Real-ESRGAN(torch-Bypass), PIL Lanczos | KI+determin. | GitHub | HEBEL |
| H9 | piper-tts | KI-TTS | GitHub-Release | HEBEL (nicht Default-Downloader) |
| H10 | vtracer+cairosvg | determin. Vektor | — | HEBEL (nur flache Icons) |
| — | MusicGen/Bark/Coqui | KI-Generierung | Hugging Face | VERWORFEN (403/DNS tot) |
| — | realesrgan/basicsr-Paket | KI-Bild | (Build) | VERWORFEN (install_layout) |
| — | Mixamo-Auto-DL | Daten | mixamo.com | VERWORFEN (403/DNS) |

---

# WELLE 2 · BEREICH B — 3D-MESH-OPS JENSEITS TRIMESH (iso-2D-RTS, gerendert aus 3D)

Welle 1 hat H4 als 3D-Cluster gesetzt (`trimesh+pygltflib+dracox` für Mesh-Ops, `FBX2glTF` für
Konversion, `bpy` für Rig/Animation). Welle 2 prüft, was H4 **nicht** kann und ob es im
Container ohne Hugging Face installier-/lauf-bar ist. **Alle Kandidaten an `hellmuth.glb`
(498 146 Faces, Draco) im neuen venv `/tmp/mesh-welle2/venv` (numpy 2.4.6) gelaufen, headless
mit `DISPLAY=""` (und `QT_QPA_PLATFORM=offscreen` für pymeshlab).**

## Spiegel-Audit (für alle Welle-2-B-Kandidaten gemessen)

| Quelle | HTTP | Genutzt für |
|---|---|---|
| `files.pythonhosted.org` | 200 | Open3D, pymeshlab, pyfqmr, fast-simplification, xatlas, pyvista, vtk, meshoptimizer, embreex |
| `conda.anaconda.org` | 302 (lebt) | nicht gebraucht — alle Welle-2-B-Pakete als Manylinux-Wheel von pypi-pythonhosted |
| `github.com/wjakob/instant-meshes/releases` | 200 (Seite), Linux-Binary **nicht vorhanden** | Instant-Meshes VERWORFEN |
| `huggingface.co` / `pypi: splatviz` | 403 / nicht existent | gsplat zieht CUDA-Stack (~5 GB), `splatviz` PyPI-tot — beide VERWORFEN |

Die Welle-1-Regel »Gewichts-Quelle, nicht Paket-Quelle« greift hier nicht — Welle-2-B-Tools
sind **gewichtsfrei** (klassische Mesh-Ops). Hier zählt die **venv-Trennung gegen bpy** und der
**Headless-Falle-Audit** (libOpenGL / Qt-Offscreen).

## W2-B1 · `open3d` — der grosse Lückenfüller: ICP-Alignment, Poisson, FBX-Read

- **Was es ist:** schwergewichtige Mesh-/Point-Cloud-Bibliothek (vtk-frei). 16 MB Wheel +
  Abhängigkeiten ~150 MB.
- **Ersetzt:** **(a)** `FBX2glTF` für reine Mesh-Extraktion aus FBX (Welle 1: H4 nutzt das Binary,
  Open3D liest FBX direkt); **(b)** **ALLES, was trimesh strukturell nicht hat**: ICP-Alignment,
  Poisson-Surface-Rekonstruktion, Taubin-Smoothing.
- **Ergänzt:** Decimation-Bereich von trimesh — **schlechter** (6.25 s gegen 1.03 s, siehe
  Anhang B). Decimation bleibt trimesh.
- **Mess-Protokoll (alle am echten Asset):**
  - `pip install open3d` (0.19.0, pythonhosted). NICHT `pip install pyembree` für 3D-Ray-Tracing
    nötig — Open3D bringt vtk-frei eigenen Stack mit.
  - **Quadric Decimation:** `hellmuth.glb` 498 146 → 50 000 Faces in **6.245 s**
    (`simplify_quadric_decimation(target_number_of_triangles=50000)`).
  - **Taubin-Smooth 10 Iterationen:** 0.806 s.
  - **ICP-Alignment** (sich selbst gegen rotiert/transl. Kopie):
    Extent 0.011 m, Translation 2 % Extent + Rotation 0.05 rad pro Achse,
    20 000 Sample-Punkte je Wolke → `fitness=1.0000`, `rmse=0.000042` in **0.153 s**.
    ICP-Trans-Schätzung im Bereich `2e-4` (richtige Größenordnung).
  - **Poisson-Surface aus Point-Cloud:** 20 000 Punkte mit Normalen, depth=7 →
    **25 852 Faces in 4.612 s**.
  - **FBX-Read direkt:** `hellmuth_idle.fbx` (35 MB) → **300 271 Verts, 498 146 Faces in
    4.297 s**. Keine Animation/Rig (Open3D ist Mesh-Tool), aber für reine Geometrie ein
    `FBX2glTF`-Ersatz für Headless-Pipelines.
  - **ICP echter Use-Case** idle.fbx vs walk.fbx (zwei Pose-Meshes):
    `fitness=1.0000`, `rmse=0.4108` auf Extent 113.8 (= 0.36 %) in **0.041 s**.
- **Install + Aufruf:**
  ```bash
  source /tmp/mesh-welle2/venv/bin/activate
  pip install open3d
  ```
  ```python
  import open3d as o3d, numpy as np
  m = o3d.io.read_triangle_mesh("hellmuth_idle.fbx")              # FBX direkt
  pc1 = m.sample_points_uniformly(20000)
  icp = o3d.pipelines.registration.registration_icp(
      pc1, pc_ref, threshold, np.eye(4),
      o3d.pipelines.registration.TransformationEstimationPointToPoint())
  ```
- **Nutzende Instanz:** Code9 / 3D-Render. Anwendung am Hellmuth-Pipeline:
  - **Rig-Drift-Audit** zwischen `hellmuth_idle.fbx` und den anderen drei Clips —
    Geometrie-Vergleich ohne Blender-Boot.
  - **A-Pose-Sanity** des Mixamo-Exports vor dem Render.
  - Wenn später echte Scan-/Photogrammetrie-Daten reinkommen: Poisson-Surface zur
    Mesh-Rekonstruktion.
- **Zwei Auflagen:**
  1. **Open3D zwingt numpy ≥ 2** (Welle-2-venv hat 2.4.6). Im **bpy-venv (numpy 1.26.4)
     funktioniert es nicht** — gleicher Konflikt wie rembg/opencv (siehe Betriebsnotiz 1).
     **Open3D gehört in das Bild-/Daten-venv, nicht in das bpy-venv.**
  2. ICP-Threshold MUSS in Welt-Einheiten skaliert sein (5–10 % Extent). Mit Default 0.05 bei
     Hellmuth-Skala 0.011 → `fitness=0` (gemessen, dann korrigiert).

## W2-B2 · `pymeshlab` — 230 Filter, das schwere MeshLab-Werkzeugfeld

- **Was es ist:** Python-Binding für MeshLab — 230 Filter-Methoden, klassisches Repair-/
  Cleanup-Werkzeug. 106 MB Wheel.
- **Ersetzt:** alles, wofür trimesh keinen entsprechenden Filter hat: Non-Manifold-Edge-Repair,
  Sampling, Hausdorff-Distanz, Curvature-Maps, Topologie-Reparatur. **Ergänzt trimesh, ersetzt
  es nicht.**
- **Mess-Protokoll am echten Asset:**
  - `pip install pymeshlab` (2025.7.post1, pythonhosted). **Headless-Falle gemessen:**
    Ohne `libOpenGL.so.0` bricht der Plugin-Loader und `load_new_mesh('*.ply')` wirft
    »Unknown format for load: ply« (8 Plugins schlagen Qt-Init fehl). **Ausweg gemessen:**
    `apt-get install -y libopengl0 libglu1-mesa libxkbcommon0` (root) + `QT_QPA_PLATFORM=offscreen`.
    Danach lädt PLY/OBJ/STL klaglos.
  - Draco-GLB liest PML **nicht** → trimesh+dracox → temp-PLY (498 146 Faces, **14.89 MB PLY**)
    → `ms.load_new_mesh()` in **0.268 s**.
  - **Quadric Decimation** 498 146 → 49 815 Faces in **8.984 s** (mit `preserveboundary=False`,
    `autoclean=True`). Mit `preserveboundary=True` landet bei 95 926 Faces (verfehlt Ziel).
  - **Non-Manifold-Edge-Repair** + **Recompute Normals**: 0.044 s.
  - Output PLY: **1.91 MB** vs 4.25 MB Draco-Eingang.
  - **FBX-Read scheitert für Faces**: liest 249 037 Verts, **0 Faces** (nur Point-Cloud-Modus).
    Für FBX kein Ersatz für Open3D oder FBX2glTF.
- **Install + Aufruf:**
  ```bash
  apt-get install -y libopengl0 libglu1-mesa libxkbcommon0    # einmalig
  pip install pymeshlab
  export QT_QPA_PLATFORM=offscreen DISPLAY=""
  ```
  ```python
  import pymeshlab as pml
  ms = pml.MeshSet()
  ms.load_new_mesh("hellmuth.ply")                         # PLY/OBJ/STL, kein Draco-GLB
  ms.meshing_decimation_quadric_edge_collapse(targetfacenum=49815, preserveboundary=False)
  ms.meshing_repair_non_manifold_edges()
  ms.save_current_mesh("out.ply")
  ```
- **Nutzende Instanz:** Asset-QA-Pipeline. Hauptwert: **Non-Manifold-Repair und
  Normal-Recompute** für Mesh-Hygiene vor dem GLB-Export — etwas, was trimesh nicht in
  Filter-Qualität liefert.
- **Grenze:** Decimation langsamer als trimesh (8.98 s vs 1.03 s) und Open3D (6.25 s) **und**
  meshoptimizer (0.344 s). Für reine Dezimation nicht der Hebel; für Repair-/Topologie-Filter
  unübertroffen.

## W2-B3 · `meshoptimizer` — GPU-orientierte Optimierung & schnellste Decimation

- **Was es ist:** Python-Binding für [zeux/meshoptimizer] — die in Three.js / glTF-Pipeline
  übliche C-Bibliothek für Mesh-Indexing-Kompression, Vertex-Cache-Optimierung und
  Quadric-Decimation. 0.2.30a0 von pythonhosted (Wheel).
- **Ersetzt:** **trimesh.simplify_quadric_decimation** — gemessen schneller. **Ergänzt** mit
  echten Three.js-Pipeline-Ops, die trimesh nicht hat: Vertex-Cache-Optimization,
  Overdraw-Optimization, Vertex-Buffer-Encoding (glTF-Komprimierung-Vorbereitung).
- **Mess-Protokoll am echten Asset:**
  - **Decimation 498 146 → 49 815 Faces in 0.344 s** (`mo.simplify(dest, F, V,
    target_index_count=49815*3, target_error=0.05)`) — **3× schneller als trimesh (1.03 s),
    18× schneller als Open3D (6.25 s), 26× schneller als pymeshlab (8.98 s)**.
  - **Vertex-Cache-Optimization am vollen 498 146-Face-Mesh: 0.128 s.** Das ist der direkte
    GPU-Performance-Hebel für den Browser-Three.js/Babylon-Track (`proof3d/`), unabhängig von
    der Face-Zahl.
- **Install + Aufruf:**
  ```bash
  pip install meshoptimizer            # Wheel, kein Compile
  ```
  ```python
  import meshoptimizer as mo, numpy as np
  V = vertices.astype(np.float32)
  F = faces.astype(np.uint32).flatten()
  dest = np.zeros_like(F)
  n = mo.simplify(dest, F, V, target_index_count=49815*3, target_error=0.05)  # 0.344s
  mo.optimize_vertex_cache(dest, F, vertex_count=V.shape[0])                  # 0.128s
  ```
- **Nutzende Instanz:** GLB-Export-Pipeline. Vor `mesh.export('out.glb')` zuerst
  Vertex-Cache-Opt; statt trimesh-Simplify hier meshoptimizer-Simplify.
- **Grenze:** Reines Index-/Vertex-Tooling, kein Filter/Repair-Werkzeug. **Setzt voraus, dass
  die Mesh-Geometrie schon manifold ist** — Repair-Vorlauf via pymeshlab oder trimesh-Cleanup.

## W2-B4 · `xatlas` — UV-Unwrap für Normal-Map-Bake

- **Was es ist:** Python-Binding für [jpcy/xatlas] (im Mesh-Encoder-Industrie-Standard).
  Erzeugt nicht-überlappende UV-Charts für Texture-/Normal-Map-Bake.
- **Ersetzt:** den UV-Schritt, der in Welle 1 nur via `bpy` ging und einen Blender-Boot kostete.
  **xatlas läuft headless ohne Blender, ohne OpenGL, ohne Qt.**
- **Mess-Protokoll am echten Asset:**
  - `pip install xatlas` (0.0.11, pythonhosted) — kleines Wheel.
  - **498 146 Faces UV-Unwrap in 0.201 s** (Atlas-Auflösung default 0×0, weil keine
    `chart_options` gesetzt → reine Topologie-Charts). Für Bake-Pipeline mit
    `ChartOptions(max_chart_area=…)` und `PackOptions(resolution=1024)` setzen.
- **Install + Aufruf:**
  ```bash
  pip install xatlas
  ```
  ```python
  import xatlas, numpy as np
  V = vertices.astype(np.float32); F = faces.astype(np.uint32)
  atlas = xatlas.Atlas()
  atlas.add_mesh(V, F)
  chart_options = xatlas.ChartOptions()
  pack_options = xatlas.PackOptions(); pack_options.resolution = 1024
  atlas.generate(chart_options=chart_options, pack_options=pack_options)
  vmap, idx, uvs = atlas.get_mesh(0)              # UVs in [0,1]
  ```
- **Nutzende Instanz:** Asset-Pipeline für Sprite-Renders aus 3D. Nach UV-Unwrap:
  Normal-Map-Bake via embreex-Raytrace (W2-B6) oder pyvista-Camera-Renderer.
- **Grenze:** Liefert nur UVs, **bakt keine Map**. Bake-Schritt separat.

## W2-B5 · `pyvista` + `vtk` — headless 3D-Visualisierung + Mesh-Ops

- **Was es ist:** High-Level-Wrapper um vtk 9.6.2. Headless funktioniert via vtk-OSMesa/EGL.
- **Ersetzt:** Visualisierungs-/Screenshot-Schritt der ohne PyVista in `bpy` enden würde
  (Blender-Boot 3–8 s). PyVista screenshot vom 498k-Mesh: 60 KB PNG in <1 s.
- **Ergänzt:** Clip-Plane-Ops, Volumen-Messung, Mesh-Decimation (vtkQuadricClustering).
- **Mess-Protokoll am echten Asset:**
  - `pip install pyvista` (0.48.4 + vtk 9.6.2, pythonhosted).
  - Mesh-Load 498 146 Faces ohne Zeitaufwand (numpy-Konvertierung).
  - **`clip(normal='y')` am 498k-Mesh:** 227 019 Faces in 0.126 s.
  - **`decimate(0.9)`** (vtkQuadricClustering): 49 814 Faces in **4.874 s**.
  - **Headless-Screenshot 512×512** mit `Plotter(off_screen=True)`: 60 840 Bytes PNG
    (eine X-Warnung, keine Fehler).
- **Install + Aufruf:**
  ```bash
  pip install pyvista                            # bringt vtk 9.6 mit
  export PYVISTA_OFF_SCREEN=true DISPLAY=""
  ```
  ```python
  import pyvista as pv, numpy as np
  faces_pv = np.column_stack([np.full(len(F),3), F]).flatten()
  m = pv.PolyData(V.astype(float), faces_pv)
  m.volume                                # liefert sofort
  clip = m.clip(normal='y', origin=(0,0.005,0))
  p = pv.Plotter(off_screen=True, window_size=(512,512))
  p.add_mesh(m); p.show(screenshot='out.png', auto_close=True)
  ```
- **Nutzende Instanz:** QA-Pipeline. Mesh-Diff-Screenshots vor/nach Decimation als
  Build-Artifakt. Volumen-Messung gegen `asset-spec.md` (Welle 1 H4 misst Höhe, PyVista
  ergänzt Volumen für die Spec-Konformität).
- **Grenze:** Decimation langsamer als trimesh/meshoptimizer. Hauptwert: **Visualisierung und
  geometrische Messungen**, nicht Decimation.

## W2-B6 · `embreex` + `trimesh.ray` — schneller Raytrace-Bake (AO/Normal/Shadow)

- **Was es ist:** Python-Bindung an Intel Embree 4 (Industrie-Standard-Raytracer). Trimesh
  erkennt embreex automatisch als ray-engine → `trimesh.ray.has_embree == True`.
- **Ersetzt:** `bpy`-AO-Bake (langsam, Blender-Boot nötig). **Headless, ohne Display, ohne
  CUDA, ohne Modell-Download.**
- **Mess-Protokoll am echten Asset (komplette AO-Bake-Schleife):**
  - `pip install embreex` (4.4.0, pythonhosted).
  - **5 000 Sample-Punkte auf 498k-Face-Oberfläche** in 0.282 s
    (`trimesh.sample.sample_surface`).
  - **80 000 Strahlen** (16 pro Sample, kosinus-gewichtete Halbkugel um Vertex-Normale)
    geschossen: **0.802 s**, 30 919 Hits. AO-Mittel 0.614 (realistischer Wert), Range
    `[0.000, 1.000]`.
- **Install + Aufruf:**
  ```bash
  pip install embreex
  python -c "import trimesh; print(trimesh.ray.has_embree)"   # True erforderlich
  ```
  ```python
  import trimesh, numpy as np
  mesh = trimesh.load("hellmuth.glb")           # nach dracox._register_handlers()
  samples, face_idx = trimesh.sample.sample_surface(mesh, 5000)
  normals = mesh.face_normals[face_idx]
  # 16 zufällige Halbkugel-Strahlen pro Sample → AO = 1 - hits.mean(axis=1)
  hits = mesh.ray.intersects_any(origins, dirs_world)         # 80k Rays ~0.8s
  ```
- **Nutzende Instanz:** Asset-Pipeline. AO-Bake als Vor-Bake für die Sprite-Renders
  (`render_unit.py`) — gibt der iso-Projektion subtile Schattierung ohne Shader. Auch
  Visibility-/Occlusion-Checks für die Asset-Vereinheitlichung in `asset-spec.md`.
- **Grenze:** Kein Texture-Speicher-Bake (UVs müssen via xatlas erzeugt sein); rein
  Vertex-AO. Für Texture-Bake xatlas→PyVista oder bpy.

## Was AM ENDE ein HEBEL ist (Welle-2-B-Urteil)

| Welle-1-H4-Op | Bisher | Welle-2-Ersatz/Ergänzung | Faktor |
|---|---|---|---|
| Decimation 498k→50k | trimesh 1.03 s | **meshoptimizer 0.344 s** | **3× schneller** |
| Vertex-Cache-Opt | — (nicht in H4) | **meshoptimizer 0.128 s** | NEU |
| FBX-Mesh-Read | FBX2glTF (binary subprocess) | **Open3D direkt 4.3 s** | Subprocess weg |
| ICP-Alignment | — (nicht in trimesh) | **Open3D 0.041–0.153 s** | NEU |
| Poisson-Rekonstruktion | — | **Open3D 4.6 s** | NEU |
| UV-Unwrap | nur via bpy (~3–8 s + Boot) | **xatlas 0.201 s** | **15–40× schneller** |
| AO-Bake (Vertex) | nur via bpy (~Boot+Bake) | **embreex 0.8 s / 80k Rays** | NEU |
| Non-Manifold-Repair | — (trimesh repair schwach) | **pymeshlab 0.044 s** | NEU |
| Volume-/Screenshot/Clip | nur via bpy | **PyVista <1 s** | Subprocess weg |

**Was bpy-only bleibt:** Animation/Rig-Operationen (Bone-Re-Targeting, Animation-Export aus
FBX nach GLB mit Skin). Welle-2-B-Tools sind durchweg **Mesh-Geometrie**, keine Rigs. Der
Welle-1-H4-bpy bleibt für Animation unangefochten.

**Was trimesh ersetzt:** Decimation (durch meshoptimizer). **Was trimesh behält:** GLB-IO
(insbesondere mit dracox), Material-Handling, der zentrale Mesh-Datentyp im Pipeline-Glue.
trimesh ist die Drehscheibe, meshoptimizer die optimierte Decimation-Stufe.

## Welle-2-B venv-Cluster-Befund (verbindlich)

Welle 1 hatte zwei Cluster: (1) Bild (numpy ≥ 2) und (2) bpy (numpy 1.26). **Welle 2 Bereich B
fällt komplett in Cluster (1)**: Open3D, pymeshlab, pyvista/vtk, xatlas, meshoptimizer,
embreex, pyfqmr, fast-simplification alle in numpy 2.4.6 lauffähig und in numpy 1.26 nicht
garantiert (Open3D-Wheel ist explizit numpy ≥ 2 gebaut).

Praktische Konsequenz: **die ganze 3D-Mesh-Op-Pipeline (Welle-2-B) wohnt im Bild-/Daten-venv
neben rembg/opencv**, nicht im bpy-venv. **bpy-venv bleibt isoliert** und enthält nur das, was
Rig/Animation braucht (`bpy`, `FBX2glTF` als Subprocess). Beim Pipeline-Bauen heißt das: zuerst
bpy-venv subprocess (`FBX→GLB-mit-Skin`), dann Mesh-Op-venv subprocess (alle Welle-2-B-Ops).

## Welle-2-B Verworfen-Liste

| Modul | Verlockung | GEMESSENER Scheiter-Grund |
|---|---|---|
| **Instant-Meshes** | Quad-Remeshing (saubere Quad-Topologie) | Kein Linux-Binary auf GitHub-Releases. Source-Compile wäre nötig (Aufwand zu hoch für den 2D-iso-Use-Case, der Quads nicht zwingend braucht). **VERWORFEN.** |
| **`pyfqmr`** | schnelle Quadric-Decimation | An echtem 498k-Mesh: 5.93 s und **verfehlt Target** (49 815 angefragt, 113 906 raus). Langsamer als trimesh (1.03 s) UND ungenau. **VERWORFEN.** |
| **`fast-simplification`** | schnelle Decimation | 1.37 s vs trimesh 1.03 s am gleichen Asset und Ziel. **Verliert gegen die Welle-1-Lösung.** VERWORFEN für Decimation; nur erwähnt, falls jemand das Pre-Wheel braucht. |
| **`gsplat`** (Gaussian-Splatting) | KI-Mesh-zu-Splat | Zieht CUDA-Toolkit-Stack (~5 GB Wheels), braucht GPU. Für 2D-iso-RTS irrelevant. **VERWORFEN.** |
| **`splatviz`** | Splat-Visualisierung | Nicht auf PyPI. **VERWORFEN.** |
| **PML FBX-Read für Faces** | Direkt FBX → Mesh | Liest 249 037 Verts, **0 Faces** — nur Point-Cloud-Pfad. Für Mesh-Geometrie unbrauchbar. (Open3D liest FBX vollständig.) |

## Anhang B · Decimation-Direktvergleich (498 146 → ≈50 000 Faces, gleicher Container)

| Tool | Zeit | Real-Output | Hinweis |
|---|---|---|---|
| **meshoptimizer** | **0.344 s** | 49 815 f | sieger |
| trimesh (Welle 1) | 1.03 s | 50 000 f | Baseline |
| fast-simplification | 1.37 s | 49 814 f | langsamer als Baseline |
| pyfqmr | 5.93 s | **113 906 f** | verfehlt Ziel |
| Open3D | 6.25 s | 49 999 f | für Decimation überdimensioniert |
| pymeshlab | 8.98 s | 49 815 f | Wert liegt in den 230 Filtern, nicht in Decim-Speed |

## Anhang B-2 · Welle-2-B Mess-Matrix (8 Kandidaten, alle am echten 498k-Mesh gelaufen)

| # | Modul | Klasse | Spiegel | Gemessen-an | Urteil |
|---|---|---|---|---|---|
| W2-B1 | open3d | 3D-Mesh + Reg | pypi-pythonhosted | hellmuth.glb + idle.fbx | HEBEL (ICP, Poisson, FBX-Read) |
| W2-B2 | pymeshlab | 3D-Filter | pypi-pythonhosted | hellmuth.glb (via PLY) | HEBEL (230 Filter, Repair) |
| W2-B3 | meshoptimizer | 3D-Opt | pypi-pythonhosted | hellmuth.glb direkt | HEBEL (Decim 0.344 s, Cache-Opt 0.128 s) |
| W2-B4 | xatlas | 3D-UV | pypi-pythonhosted | hellmuth.glb direkt | HEBEL (UV 0.2 s ohne bpy) |
| W2-B5 | pyvista+vtk | 3D-Viz+Ops | pypi-pythonhosted | hellmuth.glb direkt | HEBEL (Screenshot+Clip+Volume) |
| W2-B6 | embreex (+trimesh.ray) | 3D-Raytrace | pypi-pythonhosted | hellmuth.glb direkt | HEBEL (AO-Bake 80k rays 0.8 s) |
| — | pyfqmr | 3D-Decim | pypi-pythonhosted | hellmuth.glb direkt | VERWORFEN (langsam+ungenau) |
| — | fast-simplification | 3D-Decim | pypi-pythonhosted | hellmuth.glb direkt | VERWORFEN (langsamer als trimesh) |
| — | Instant-Meshes | Quad-Remesh | github-releases | — | VERWORFEN (kein Linux-Binary) |
| — | gsplat | KI-Splat | pypi+CUDA | — | VERWORFEN (5 GB CUDA, GPU-bound) |
| — | splatviz | Splat-Viz | — | — | VERWORFEN (PyPI-tot) |
