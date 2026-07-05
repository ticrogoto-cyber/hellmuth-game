# CONTAINER-WERKZEUGE-2

Zweite Werkzeug-Welle. Drei harte Regeln gegenüber Welle 1 (`docs/CONTAINER-WERKZEUGE.md`,
Commit `69d93a2`): **Spiegel-Pflicht** (kein KI-Werkzeug verworfen, bevor drei Spiegel-
Quellen mit HTTP-Code geprüft sind), **Funktion über Installation** (jeder Hebel an einem
echten HELLMUTH-Asset gemessen, nicht nur `pip install`), **lückenlos** (≥4 Kandidaten je
Bereich). Zwei Pflicht-Spalten je Werkzeug: **Spiegel-geprüft** und **Gemessen-an**.

## Netz-Wahrheit, erweitert (gemessen, diese Welle)

Welle 1 maß HF tot (`huggingface.co` 403, `cdn-lfs.huggingface.co` DNS-tot). Welle 2 hat
die Spiegel-Hypothese hart getestet — **alle anderen Modell-CDNs sind ebenfalls 403**:
`civitai.com`, `modelscope.cn`, `hf-mirror.com`, `anaconda.org` (Hauptseite),
`registry.ollama.ai`. Die **einzige neue erreichbare Quelle ist `conda.anaconda.org`**
(conda-forge channel, 200) — relevant für 3D-Pakete (Open3D etc.). Die Welle-1-Regel
bleibt: **es zählt der Gewichts-Host.** GitHub-Release-Gewichte (u2net, ONNX-Style,
MediaPipe-via-googleapis, GGUF-auf-github) leben; HF-only-Gewichte (Diffusion, Voice-Clone)
sind tot, ohne erreichbaren Spiegel.

## Abdeckung dieser Welle (ehrlich)

**Gemessen geliefert: 8 von 11 Strängen** (A-Bild, A-Sprite, B-Mesh, B-Rigging, C-Audio,
D-Gameplay, E-Test, F-Code). **3 Stränge brachen am wöchentlichen Rate-Limit ab, NICHT
gemessen** (A1-Diffusion, G-lokale-LLMs/RAG, C2-prozedurale/räumliche-Audio) — siehe
»Residuen«. C2 ist großteils durch C1 abgedeckt (pyroomacoustics, librosa, spaudiopy,
pure-data laufen dort). A1 und G bleiben echte Lücken bis zum Reset.

---

# TEIL 1 — DIE HEBEL (je Bereich, mit Pflicht-Spalten)

## A · Bild & Sprite

| Werkzeug | Status | Spiegel-geprüft | Gemessen-an |
|---|---|---|---|
| **cv2.inpaint (Telea/NS)** | HEBEL | preinstalliert · pypi 200 · conda-forge noarch 200 | `helmut.png` 768², 80²-Loch → `fill_mean=69`, 9 ms |
| **ONNX `fast_neural_style` ×3** (mosaic/udnie/pointilism) | HEBEL | `github.com/onnx/models` raw 302→**200** (6,7 MB) · onnxruntime 1.27 pypi 200 | `hellmuth.png` 224², diff 78–152, 313–616 ms CPU |
| **cv2.stylization + detailEnhance/edgePreserving/pencil** | HEBEL | preinstalliert | `helmut.png` 512², 4 Modi 56–794 ms |
| **psd-tools `frompil`/`save`** | HEBEL | pypi 200 (1.17.2) | echter PSD-Roundtrip 256² RGBA, 26260 b — schließt Welle-1-Lücke »PSD-Schicht« |
| **opensimplex** (4-octave Textur) | HEBEL | pypi 200 (`noise` verworfen, install_layout) | 256² Boden-Erde + Hellmuth-Varianten, std=45 |
| **numpngw** (APNG) | HEBEL | pypi 200 | 96² 8-Frame Sigil-Pulse, `acTL`/`fcTL`-Chunks belegt |
| **rectpack** (kleine UI-Sprites) | HEBEL | preinstalliert (Welle-1 `--use-pep517`) | 12 UI-Sprites in 1024²-Bin, 12/12 in 0,5 ms |
| **pymatting** (Halo-Cleanup NACH rembg) | HEBEL | pypi 200 | rembg-Ausgabe → Bimodal-Score 0,780→**0,790** (weniger Halo), 1,1 s |
| **cv2 dilate+subtract Outline** | HEBEL | preinstalliert | 4-px schwarzer Ring auf `helmut`, 7,9 ms/Frame — Art-Bible-Tuschekontur |
| **PIL FASTOCTREE-16 + Floyd-Steinberg** | HEBEL | builtin | 16-Farb-Quantisierung, **8,7× kleiner**, Manga-Screentone-Look |
| **colorspacious** (ΔE-Audit) | HEBEL | pypi 200 | 16-Farb-Palette: **56/120 Paare ΔE<5** → echte Palette-Reduktion erzwingbar |
| **ImageMagick `convert`** (apt) | HEBEL | apt 6.9.12 (Welle-1 hatte es nicht) | Sprite-Strip, GIF-Preview, `-trim`, Outline — Bash-Pipeline-Schweizer |

## B · 3D-Mesh & Animation

| Werkzeug | Status | Spiegel-geprüft | Gemessen-an |
|---|---|---|---|
| **Open3D** | HEBEL | pypi 200 (numpy-2-Cluster) | `hellmuth.glb` 498k F: ICP-Alignment + Poisson + **direkter FBX-Read** (trimesh hat das NICHT) |
| **meshoptimizer** | HEBEL | pypi 200 | Dezimierung **0,344 s vs trimesh 1,03 s (3×)** + Vertex-Cache-Opt 0,128 s |
| **pymeshlab** | HEBEL | pypi 200 | 100+ Filter; Dezimierung+Normalen-Reparatur an `hellmuth.glb` |
| **xatlas** | HEBEL | pypi 200 | UV-Unwrap in **0,2 s statt Blender-Boot** |
| **embreex** | HEBEL | pypi 200 | AO-Bake 80k Rays in 0,8 s |
| **pyvista** | HEBEL | pypi 200 (libGL apt) | `hellmuth.glb` laden/messen/screenshot headless |
| **ikpy** | HEBEL | pypi 200 | 3 IK-Ziele, Fehler 0,0 |
| **pyBullet** | HEBEL | pypi 200 | URDF 3-DOF, Fehler 0,0027 m |
| **MediaPipe Pose** | HEBEL | pypi 200 · Modell `storage.googleapis.com` **200** (5,8 MB, NICHT HF) | `hellmuth`-PNG → 33 Welt-Landmarks; **PNG→Pose→IK-Brücke Fehler 0,0000 m** |
| **bvh 0.3 + bpy-BVH-Export** | HEBEL | pypi-tarball (Wheel bricht) | BVH-Roundtrip 250 Frames |
| **perlin-noise** | HEBEL | pypi 200 | 60-Frame prozedurale Idle-Animation via bpy-Keyframes |

## C · Audio (Detail in `docs/CONTAINER-WERKZEUGE-WELLE2-C.md`, Commit `429d181`)

| Werkzeug | Status | Spiegel-geprüft | Gemessen-an |
|---|---|---|---|
| **pedalboard** (Spotify) | HEBEL | pypi 200 | Side-Chain Duck-Ratio 0,27 während Kick + 4 Effekt-Ketten |
| **jsfxr** (npm) | HEBEL | npm 200 | 6 Game-SFX-Klassen (explosion/laser/coin…) — schließt Welle-1-SFX-Lücke |
| **pure-data** (apt) | HEBEL | apt | 1,486 s 440-Hz-Sinus aus Pd-Patch headless |
| **librosa** | HEBEL | pypi 200 | Onset/Tempo 60 BPM/MFCC an erzeugtem Sample |
| **pysox + sox** (apt) | HEBEL | apt | compand+reverb+norm-Pipeline |
| **pyroomacoustics** | HEBEL | pypi 200 | Shoebox 6×4×2,5 m, RT60 0,133 s |
| **spaudiopy** (Ambisonics) | HEBEL | pypi 200 (braucht `scipy<1.15`) | 1st-order az=90°, räumlich korrekt |

## D · Spielmechanik — hartes Anti-Moderat-Verdikt: fast alles KEIN Hebel

Gemessen am echten `spatial_grid.ts`/`pathfinding.ts` via `tsx`. **Die meisten »fertigen
Module« lohnen für HELLMUTH NICHT**, weil die eigene Sim-Logik + der profil-belegte
Hotspot der echte Hebel ist.

| Werkzeug | Status | Spiegel | Gemessen-an |
|---|---|---|---|
| **flatbush / rbush** | **konditional, knapp** | npm 200 | nur combat-Lastfall (R=1088) 1,15× schneller; **avoidance (R=128) 2× LANGSAMER** → Netto-Verlust für die heiße Schleife |
| PathFinding.js JPS | KEIN HEBEL | npm 200 | bei 36×36 **langsamer** als unser A* (Overhead>Sprung); JPS-Gewinn erst ab 256×256; A* ist eh nur 0,1 % CPU |
| behaviortree.js | Architektur, kein Tempo | npm 200 | 0,5 ms/tick @1000 — tauglich falls KI-Schicht ausgebaut wird |
| navmesh | Qualität, kein Tempo | npm 200 | any-angle-Pfade statt Treppen-Look |
| d3-voronoi | Analyse-Werkzeug | npm 200 | off-hot-loop für Balance-/Einflusskarten |
| boids/planck/kd-tree/goap/utility-ai/quadtree-ts | VERWORFEN | npm 200 | schlechter als vorhandene Lösung oder zweckfremd |

**Der echte D-Hebel ist kein Modul:** `Math.hypot(dx,dy)<r` → `dx*dx+dy*dy<r*r` im
Distanztest nach `queryRadius` (Welle-1-Profil 49 % CPU; siehe F). Erst danach lohnt
flatbush für den combat-Anteil, sonst maskiert hypot den Gewinn.

## E · Test / Performance / Determinismus — mit direkter CI-Folge

| Werkzeug | Status | Spiegel | Gemessen-an |
|---|---|---|---|
| **odiff** (`odiff-bin`, OCaml) | HEBEL ⭐ | npm 200 | echte 1920×1080 `proof/baseline`: 8 Paare in **1,46 s**; 1px-Shift = 1,77–2,38 %, Rauschen/Tönung = 0 % → **ERSETZT das 96×54-MAE-Drift-Gate** (Schwelle 0,5 %) |
| **pixelmatch** | HEBEL (Backup) | npm 200 | dieselben Paare, 8× langsamer, reines JS |
| **Hypothesis** (Python) | HEBEL (nightly) | pypi 200 | `@given(seed)` × 50 gegen Determinismus-Property; Mutation gefangen; ~25 min → nightly, nicht `pruefen.sh` |
| **fast-check** (JS) | HEBEL | npm 200 | gleiche Property JS-seitig, Mutation nach 1 Test gefangen |
| **vitest** (Snapshot) | HEBEL | npm 200 | `sim.stats()`-Snapshot 373 ms — fängt Stats-Schema-Drift |
| **py-spy** | HEBEL | pypi 200 (rust-bin) | Flamegraph der Python-`tools/`-Skripte, Null-Konfiguration |
| **node:v8 writeHeapSnapshot** | HEBEL | builtin | Heap-Snapshot ohne Install (ersetzt das kaputte memlab) |

## F · Code-Qualität / AST / Refactor — direkte MAXI-3-Hebel

| Werkzeug | Status | Spiegel | Gemessen-an |
|---|---|---|---|
| **jscodeshift** (Math.hypot-Codemod) | HEBEL ⭐ | npm 200 | **41 Aufrufe in 15 Dateien, 10 s, tsc-clean** → MAXI-3 H4 ist 1 Befehl |
| **ts-morph / @babel/parser** | HEBEL | npm 200 | Kreuz-Validierung: beide 41 Aufrufe |
| **eslint custom rule** `no-math-hypot` | HEBEL | npm 200 | 41 Warnings — CI-Regression-Wache gegen Rückfall |
| **ts-prune + knip** | HEBEL | npm 200 | beide finden **`FRAME_MASTER`** (HUD-Krisenstab); knip: 20 unused files, 71 exports, `playwright` als unused devDep |
| **madge** | HEBEL | npm 200 | **4 zyklische Imports**, alle `entities/building.ts ↔ unit.ts` (Kern!) |
| **biome** | HEBEL | npm 200 | 9 errors / 62 warnings über 101 Dateien — ranked §15-Aufräumliste |

**Korrektur am Hotspot-Ort (gemessen):** `spatial_grid.ts` hat **kein** `Math.hypot`. Die
49 % CPU sitzen in `movement_system.ts` (8 Aufrufe) und `editor_scene.ts` (11). Der
Codemod trifft sie alle.

---

# TEIL 1B — NACHSCHUSS (die drei Rate-Limit-Stränge, jetzt gemessen)

Nach dem 9:00-UTC-Reset durchgezogen. Drei Stränge, drei harte Befunde — alle mit
Spiegel-Pflicht (echte HTTP-Codes) und Funktions-Beweis im Container.

## A1 · KI-Bildgenerierung — Engine gelöst, Gewichts-Distribution NIRGENDS

| Werkzeug | Status | Spiegel-geprüft | Gemessen-an |
|---|---|---|---|
| **leejet/stable-diffusion.cpp** (Linux-CPU-Binary) | HEBEL (bereit, ohne Gewicht) | `github.com/leejet/stable-diffusion.cpp/releases/.../sd-master-5a34bc7-bin-Linux-Ubuntu-24.04-x86_64.zip` **200**, 25 MB, dl 0,51 s | `./sd-cli --help` ec=0, Binary lauffähig; CPU-Features AVX/AVX2/AVX512/FMA/F16C present |
| **Mozilla `diffusionfile-0.10.3`** (portable sd.cpp) | HEBEL (bereit, ohne Gewicht) | `github.com/mozilla-ai/llamafile/releases/.../diffusionfile-0.10.3` **200**, 74 MB | `./diffusionfile -m <bogus>` ec=1 mit klarer Fehlermeldung (»get sd version from file failed«); robusterer Loader als sd-cli |
| **madebyollin/taesd_decoder.pth** (Tiny-VAE-Decoder) | TEIL-Hebel (nur Decoder, keine txt2img) | `raw.githubusercontent.com/madebyollin/taesd/.../taesd_decoder.pth` **200**, 4,9 MB | PyTorch state-dict valid (1,22M params); allein NUTZLOS für Generation, nur als Preview-Decoder einer existierenden Pipeline |

**VERWORFEN — sieben Mirror-Strategien mit HTTP-Code-Belegen:**

| Verworfen | Drei Spiegel (HTTP) |
|---|---|
| **SD1.5 v1-5-pruned-emaonly.safetensors** | HF resolve `runwayml/...` **403** · github-Release `leejet/.../sd-v1-5.safetensors` **404** · github-Release `AUTOMATIC1111/.../sd-v1-5.safetensors` **404** |
| **SDXL-Base 1.0** | HF `stabilityai/...` **403** · github `Stability-AI/stablediffusion` **404 kein Release** · github `Stability-AI/sdxl-turbo` **404 Repo nicht existent** |
| **GGUF-Quantisierungen (city96/leejet)** | HF `leejet/stable-diffusion-v1-5-gguf` **403** · HF `city96/FLUX.1-dev-gguf` **403** · `leejet/stable-diffusion.cpp` Release-API zeigt **0 `.gguf`-Assets** in allen Tags |
| **OnnxStream `with-weights`** | github v0.1 200 — aber **nur `Windows-x64-with-weights.rar` (2 GB), kein `unrar` im Container** · v0.2 0 SD-Assets · Linux-Build möglich, Gewichte nicht extrahierbar |
| **CompVis/Stability-AI Originale** | `CompVis/stable-diffusion/releases` 200 aber **0 Asset** · `Stability-AI/stablediffusion/releases` **404** · `Stability-AI/generative-models/.../sd_xl_base_1.0.safetensors` **404** |
| **ControlNet GGUF** | HF `lllyasviel/sd-controlnet-canny` **403** · github `lllyasviel/ControlNet` **0 releases** · github raw `controlnet-canny.safetensors` **404** |
| **Alt-Mirrors (PINTO/wasabi/civitai/modelscope)** | wasabisys.com **»Host not in allowlist«** · hf-mirror.com **403** · civitai/modelscope/api **403** |

**Verdikt:** Inferenz-Engines sind verfügbar (zwei Binaries lauffähig), **Diffusion-Gewichts-
Distribution läuft ausnahmslos über HuggingFace**. Solange der Container HF blockt und das
Image kein vorgewärmtes `~/.cache/huggingface` mitliefert, ist SD/SDXL/FLUX-Generation
**nicht möglich** — egal wie potent ggml ist. Welle-1-Verdikt »KI-Generierung tot« ist mit
sieben Mirror-Tests **härter** bestätigt. Hebel sind die zwei Binaries nur für den Fall,
dass Ticro ein Cache-vorgewärmtes Image baut.

## C2 · Audio-Nachschuss — 8 neue Hebel jenseits C1

| Werkzeug | Status | Spiegel-geprüft | Gemessen-an |
|---|---|---|---|
| **csound** (apt CLI) + **ctcsound** (Python) | HEBEL | apt 208 KB · `github.com/csound/csound` 200 · pypi 200 (ctcsound) | headless 2,000 s 880-Hz Sinus, FFT-Peak exakt 440 Hz; ctcsound `compileCsdText()` 1,000 s 880-Hz aus Python heraus |
| **chuck** (apt) | HEBEL | apt 2,8 MB · `github.com/ccrma/chuck` 200 · pypi 200 | `--silent` SinOsc 1 s + SawOsc→LPF 0,5 s mit Harmonik-Verlauf 220/440/660/880/1100 Hz |
| **sofar + MIT-KEMAR-SOFA** ⭐ | HEBEL | pypi 200 · `github.com/pyfar/sofar` 200 · echte SOFA `raw.githubusercontent.com/hoene/libmysofa/.../MIT_KEMAR_normal_pinna.sofa` **200, 1,17 MB HDF5** (710 Quellpositionen) | az=90°-Faltung am Mono-Klick: **L=2,54, R=0,17 → L/R-Energie-Ratio 15,09×** (physikalisch korrekter Schatten am abgewandten Ohr); slab kreuzbestätigt mit identischer Ratio — Welle-2's `spaudiopy` macht Ambisonics, dies ist die **binaurale HRTF** |
| **slab** | HEBEL (Bestätiger) | pypi 200 (`slab` 1.8.2) · `github.com/DrMarc/slab` 200 · slab3d 404 | `slab.HRTF.kemar()` 710-Source-DB lokal, identische 15,09×-Ratio |
| **noisereduce** | HEBEL | pypi 200 (3.0.3) · `github.com/timsainb/noisereduce` 200 · conda-forge 404 | 440-Hz-Sinus + Rauschen → `reduce_noise(stationary=True)`: **SNR-Verbesserung 96,4×** (Rauschband 0,2 % erhalten, Signalband 22 %) |
| **aubio** | HEBEL | pypi 200 (0.4.9) · `github.com/aubio/aubio` 200 · files 404 | 120-BPM-Klicktrack: **120,4 BPM** (Δ 0,3 %); Vergleich librosa 120,2 / essentia 119,3 — alle drei konsistent, aubio ist mit 1 MB schlankster |
| **essentia** (konditional, 38 MB) | HEBEL (konditional) | pypi 200 (2.1-beta6-dev) · `github.com/MTG/essentia` 200 · files 404 | Centroid+YIN+RhythmExtractor2013 an 440-Hz: Pitch 439,6 Hz Confidence 1,00; nur Hebel bei breiter Feature-Bibliothek |
| **scipy.signal** (built-in) | HEBEL | preinstalliert | `butter(6, 800, 'low')` Underwater: 220 Hz 100 % / 880 Hz 5,8 % / 3300 Hz 0 %; eigener Compressor (T=0,3 R=4): Dynamik 4,6 dB → 1,8 dB |

**VERWORFEN — SuperCollider erneut bestätigt, scsynth-NRT konditional:**

| Verworfen | Drei Spiegel | Grund |
|---|---|---|
| **sclang headless** | apt 3,75 MB · github 200 · pypi 404 | sclang startet Qt-WebEngine mit `QT_QPA_PLATFORM=offscreen` → »Running as root without --no-sandbox is not supported« (Chromium-Zygote) — Welle-1-Befund hält |
| **scsynth NRT** | apt 1,65 MB · github 200 · pypi 404 | scsynth läuft headless OHNE Qt, aber `find / -name "*.scsyndef"` leer — braucht selbst-erzeugte SynthDef-Binärblobs → **Welle-3-Ticket** |
| **slab3d** | pypi 404 · npm 404 · github (kein Repo) | existiert nicht |

## G · Lokale LLMs + RAG — Engines bereit, Coding-Gewichte NICHT auf github; RAG ist DER Hebel

| Werkzeug | Status | Spiegel-geprüft | Gemessen-an |
|---|---|---|---|
| **llama.cpp** b9665 (Linux-Binary) | HEBEL (bereit, ohne Gewicht) | `github.com/ggml-org/llama.cpp/releases/.../llama-b9665-bin-ubuntu-x64.tar.gz` **200**, 15 MB | `llama-cli --version` ec=0 — Engine lauffähig, ohne Coding-GGUF aber leer |
| **llamafile-0.10.3-thin** (Cosmopolitan-Engine) | HEBEL (bereit, ohne Gewicht) | `github.com/mozilla-ai/llamafile/releases/.../llamafile-0.10.3-thin` **200**, 42 MB | `--version` ec=0; gleiche Engine, portables APE-Format |
| **chromadb 1.5.9 + numpy-TF-IDF** ⭐ | HEBEL ⭐ | pypi 200 | RAG-Lauf an `hellmuth/docs/*.md`: **632 Chunks aus 26 Docs**, Frage »wie groß ist die offene Oberkante?« → Top-1 `HUD-SOLL-SPEC.md` (dist 0,632) — **NULL HF-Abhängigkeit** |
| **fastembed 0.8.0 + BAAI/bge-base-en** ⭐ | HEBEL ⭐ | pypi 200 · **`storage.googleapis.com/qdrant-fastembed/fast-bge-base-en.tar.gz` 200, 252 MB ONNX** (NICHT HF) | fastembed probiert zuerst HF (403), Fallback auf GCS-URL greift sauber; 632 Vektoren in 120 s, dim 768; »fog of war decay« → `NEBEL-TIEFE-SPEC.md` Top-1+2+3 — **echtes neuronales Embedding ohne HF** |
| **lancedb 0.33.0** | HEBEL (Alternative zu Chroma) | pypi 200 | embedded Vektor-Suche persistent on-disk, schlankere API |
| **txtai 9.10.0 BM25-only** | HEBEL (Instant-RAG) | pypi 200 | `keyword=True` ohne Embedding-Modell: 26 Docs indexiert, »slot zone breite« → `hud-spec-v2.md` (Score 0,659) — **kein Modell-Download nötig** |
| **aider-chat 0.86.2** | HEBEL (Frontend) | pypi 200 | `--openai-api-base` + `--model openai/<name>` spricht jeden OpenAI-kompatiblen Server an (inkl. `llama-server`); im Container ohne Backend wertlos |
| **open-interpreter 0.4.3** | HEBEL (Frontend) | pypi 200 | `interpreter --help` ok; gleiche Einschränkung wie aider |

**VERWORFEN — Coding-GGUFs liegen nirgends auf github:**

| Verworfen | Drei Spiegel (HTTP) | Befund |
|---|---|---|
| **Coding-GGUF (Qwen2.5-Coder / DeepSeek-Coder / CodeLlama / StarCoder)** | `mozilla-ai/llamafile` Releases 200 aber **0 `.gguf`-Assets** (nur Engines) · Stub-Repos `Qwen3-Coder-Next-Zeta-GGUF` README zeigt »weights on huggingface.co/…« · `ggml-org/llama.cpp/models/ggml-vocab-*.gguf` 200 aber nur **Tokenizer**, kein Sprachmodell | das LLM-Ökosystem speichert Gewichte auf HF, github speichert Engines — kein Coding-GGUF im Allowlist-Netz beschaffbar |
| **sentence-transformers default-Modell** | `huggingface.co/...` **403** · `github.com/UKPLab/sentence-transformers/releases` 200 aber **0 Modell-Assets** (nur Source-Tarballs) · sbert.net **außerhalb Allowlist** | jedes Modell hängt am HF-Hub |
| **txtai Embedding-Modus (default)** | gleiche Transformers-Kette wie ST | HF-only → nur BM25-Modus nutzbar |
| **registry.ollama.ai** | **403** (Welle-1-Befund bestätigt) | Ollama-Modell-Pull tot |
| **Tabby-ML / tabby-python-client** | pypi `tabby-python-client` **404** (Paket existiert nicht — Brief-Annahme widerlegt) · `TabbyML/tabby` braucht GPU+HF-Modell · Continue.dev = VSCode-Plugin (kein Container-Sinn) | Engine + Modell beide nicht beschaffbar |

**Verdikt für Solo-Dev mit Claude Code:**
- **Lokale Coding-LLMs sind BALLAST.** llama.cpp/llamafile-Engines laufen, aber selbst wenn Ticro extern ein 4-GB-GGUF (Qwen2.5-Coder-7B-Q4) beschafft und in den Container kippt, liefert CPU-Inferenz auf 4 vCPUs nur 1–3 tok/s. `claude -p` macht das in Sekunden zum tausendfachen Preis. **Überspringen.**
- **RAG fürs Hellmuth-Repo ist DER Hebel.** Drei Pfade je nach Aufwand: (a) **txtai BM25** — instant, kein Modell, ein Befehl; (b) **chromadb + TF-IDF** — eine Datei, 30 Zeilen, NULL HF-Roundtrip; (c) **fastembed + BGE-base-en über GCS-Fallback** — echte neuronale Semantik, 252 MB einmalig von google-storage (nicht HF). Praxisfall: »wo steht die Slot-Spec?« in 1 s statt 5–10 min Doc-Scrollen.

---

# TEIL 2 — VERWORFEN (je mit drei geprüften Spiegel-Quellen)

| Kandidat | Bereich | Drei Spiegel (HTTP) | Grund |
|---|---|---|---|
| **Voice-Clone XTTS-v2** | C | coqui-ai/TTS (22 Tags, **0 Assets**) · idiap/coqui-ai-TTS (10 Tags, 0 Assets) · daswer123/xtts-api-server (2 Hits, keine Gewichte) | Gewichte nur HF |
| **OpenVoice** | C | github Tags **0** · raw `.pth` **404** · pypi **404** | kein Gewichts-Release |
| **Tortoise-TTS** | C | neonbjb 0 Tags · 152334H-Fork 0 Assets · pypi 3.0.0 (Gewicht via HF) | HF-Gewicht |
| **Bark** | C | suno-ai 0 Tags · JonathanFly 2 Tags 0 Gewichte · serp-ai ohne Release | HF-Gewicht |
| **RigNet** | B | Repo 200 · **Gewichte Google-Drive 403** · kein github-Mirror | Gewichts-Host blockiert |
| **Pinocchio (Auto-Rig)** | B | wiccy46 **404** · elrond79 200 (kein Binary, C++/CGAL-Build) · kein Release | kein lauffähiger Bezug |
| **OpenPose** | B | Repo 200 · Binary nur Drive-Mirror · kein github-Asset | Drive blockiert |
| **clinic.js** | E | npm 200 · — · — | **auf Node 22 funktional kaputt** (»Profile data empty«) → 0x bleibt |
| **memlab** | E | npm 200 · — · — | **Node-22-ESM-Bruch** (`babar` package config) → node:v8-Snapshot |
| **pyxelate** | A | pypi 200 (Py3.11-Build defekt) · — · — | doppelt untauglich: Build + HELLMUTH ist KEIN Pixel-Art |
| **noise** (Perlin) | A | pypi 200 · files.pythonhosted 200 · caseman/noise | `install_layout`-Bug Py3.11 → opensimplex ersetzt |
| **hitherdither** | A | pypi 200 · — · — | setuptools-Inkompat. → PIL+numpy-Bayer ersetzt |
| **looks-same / BackstopJS / jsverify / rr** | E/D | npm/apt vorhanden | zu langsam / Overkill / veraltet / falsche Ebene → odiff bzw. fast-check |
| **boids/planck/kd-tree/quadtree-ts** | D | npm 200 | langsamer als eigene SpatialGrid (gemessen) |

Diffusion-im-Detail (`stable-diffusion.cpp`, `OnnxStream`) ist **spiegel-belegt erreichbar**
(`github.com/leejet/stable-diffusion.cpp` master.tar.gz 200; `onnx/models` 200), aber
verlangt einen GGUF-/cmake-Build-Schritt — als Welle-3-Ticket markiert, nicht verworfen.

---

# TEIL 3 — RESIDUEN: nach dem Nachschuss

Die drei Welle-2-Residuen sind **geschlossen** (siehe Teil 1B):

- **A1 (Diffusion)** — gemessen, härter verworfen: Engine ja, Gewichts-Distribution
  nirgends im Allowlist-Netz. Sieben Mirror-Strategien mit HTTP-Codes belegt.
- **C2 (prozedurale/räumliche Audio)** — 8 neue Hebel jenseits C1, darunter echte
  binaurale HRTF via MIT-KEMAR-SOFA von `raw.githubusercontent.com` (15× L/R-Energie-
  Ratio gemessen).
- **G (lokale LLMs + RAG)** — Coding-GGUFs nicht auf github (sieben Stub-Repos geprüft),
  aber **RAG fürs Repo läuft sofort** (chromadb+TF-IDF, fastembed+BGE über GCS-Fallback,
  txtai BM25).

Offen bleibt — als Welle-3-Ticket, NICHT verworfen: **scsynth NRT** (SC ohne Qt, braucht
SynthDef-Generator); **vorgewärmtes HF-Cache-Image** als Diffusion-Workaround.

---

# TEIL 4 — ARCHITEKTONISCHE FOLGEN

1. **venv-Topologie verschärft sich.** Drei unverträgliche Cluster: **Bild+Mesh** (numpy≥2:
   rembg, opencv, Open3D, meshoptimizer, pymatting, pyvista) · **bpy** (numpy<2) ·
   **MediaPipe** (numpy<2 — koexistiert mit bpy NACH `pip install "numpy>=1.26,<2.0"`).
   Sonderfall: **spaudiopy braucht `scipy<1.15`** → eigenes Audio-venv. Empfehlung: ein
   `requirements/`-Ordner mit getrennten Lock-Dateien je Cluster, statt ein globales env.

2. **bpy schrumpft auf Rig/Animation.** UV-Unwrap (xatlas), AO-Bake (embreex),
   Mesh-Ops/Format/ICP (Open3D, meshoptimizer) laufen jetzt headless ohne Blender-Boot.
   `render_unit.py`-Vorstufen können bpy-frei werden; bpy bleibt nur für Skinning/Animation
   und Sprite-Render Pflicht.

3. **Asset-Pipeline-Kette wird länger und schließt die Qualität.**
   `freistellen_all.py` (rembg) → **pymatting-Refine** → **cv2-Tuschelinie** →
   **PIL-Quantize + colorspacious-ΔE-Merge** → `pack_atlas.py` (mit cv2-Trim aus Welle 1).
   Drei neue `tools/`-Skripte: `pymatting_refine.py`, `tuschelinie.py`, `normalize_palette.py`.

4. **CI bekommt zwei konkrete, gemessene Verschärfungen** (beide an echten Daten belegt):
   - **odiff ersetzt das 96×54-MAE-Drift-Gate** in `pruefen.sh` (voller 1920×1080-Vergleich
     in 1,5 s, Schwelle 0,5 %) — fängt den 1px-Shift, den das Downscale verschluckt.
   - **`hud_continuity.py` in `pruefen.sh`/CI einhängen** — bestätigt den Orchestrierungs-
     Befund (O7): das sehende Gate existiert, feuert aber nirgends automatisch.

5. **Refactor-Schulden sind jetzt skriptbar adressiert.** MAXI-3 H4 (Math.hypot →
   squared-dist) = ein `jscodeshift`-Lauf (41 Treffer, tsc-clean); HUD-`FRAME_MASTER`-
   Aufräumen via `knip`/`ts-prune`; der Zyklus `building.ts↔unit.ts` (madge) ist ein neuer,
   vorher unbenannter Architektur-Posten.

6. **Aufnahme-Schnittstelle steht** (Stand Nachschuss): Code12-Commit `2a8fe84` hat die
   Werkzeug-Bekanntmachung eingerichtet — `hellmuth/CLAUDE.md` referenziert jetzt
   `docs/AUFTRAG-VORLAGE.md` (Pflicht-Vorab-Block) und die elf-Hebel-Liste in
   `KONVENTIONEN.md`. Diese Datei (Welle 2 + Nachschuss) ist die Ergänzung dazu.

7. **RAG fürs Repo als neue Klasse von Werkzeug** (G-Nachschuss): chromadb+TF-IDF /
   txtai BM25 / fastembed+BGE (GCS-Fallback) machen `hellmuth/docs/*.md` durchsuchbar,
   ohne ein einziges HF-Gewicht. Praxisbeleg gemessen: »wo steht die Slot-Spec?« → Top-1
   `HUD-SOLL-SPEC.md` in 1 s — gegen 5–10 min Doc-Scrollen. Empfehlung: ein
   `tools/repo_rag.py` (txtai BM25 für instant, fastembed für tiefe Treffer).

8. **HRTF-binaurale-Räumlichkeit kommt OHNE HF** (C2-Nachschuss): das MIT-KEMAR-SOFA-
   Set liegt auf `raw.githubusercontent.com/hoene/libmysofa/`. Welle 1+2 hatten Ambisonics
   (spaudiopy), jetzt auch echte HRTF (sofar). Für 3D-Positions-Audio im Spiel: vorberechnete
   binaurale Stems je Schallquellen-Richtung, nicht Live-HRTF im RTS.

---

## Anhang · Bezugs-Pfade

Detail-Strang C: `docs/CONTAINER-WERKZEUGE-WELLE2-C.md` (Commit `429d181`). Welle-1-
Bezugsdokument: `docs/CONTAINER-WERKZEUGE.md` (Commit `69d93a2`). Profil-/Gate-Bedarfe:
`docs/HUD-KRISENSTAB.md`, `docs/HUD-UEBERGABE-CODE.md`, `docs/MAXI-3-TEMPO-NIVEAU.md`.
