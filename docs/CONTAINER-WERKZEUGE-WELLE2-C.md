# CONTAINER-WERKZEUGE — WELLE 2, BEREICH C

Voice-Cloning / SFX / Audio-Effekte mit Spiegel-Pflicht. Anhang zu
`docs/CONTAINER-WERKZEUGE.md`. Selbe Methode: **3-Quellen-Spiegel-Prüfung mit
echten HTTP-Codes**, dann **echter Lauf an erzeugtem Sample**.

## Netzlage aus Welle 1 (gemessen)

erlaubt: `pypi.org`, `files.pythonhosted.org`, `npmjs.com`, `github.com`,
`release-assets.githubusercontent.com`, `raw.githubusercontent.com`, Ubuntu-apt,
`conda.anaconda.org` (200). tot: `huggingface.co` 403, `cdn-lfs.huggingface.co`
DNS-tot.

## Mess-Matrix Welle 2 C

| # | Werkzeug | Klasse | Spiegel-geprüft | Gemessen-an | Urteil |
|---|---|---|---|---|---|
| C1 | pedalboard | Effekte (Side-Chain) | PyPI 0.9.23 | 4 Kicks + Pad-Akkord: Pad-RMS während Kick auf **27,4 %** geduckt, zwischen Kicks 100 % | HEBEL |
| C2 | jsfxr (npm) | SFX-Synthese (Game) | npm 200, github 200 | 6 Klassen (explosion 91ms peak 0.98, laser 294ms peak 0.81, synth 1.87s, …), WAV-Header selbst gebaut | HEBEL |
| C3 | pure-data (apt) | SFX-Synthese (Patch) | apt 0.54.1, github 200 | 1.486s 440-Hz-Sinus, RMS 0.354 nach Header-Reparatur | HEBEL |
| C4 | librosa | Analyse | PyPI 0.11.0 | Onset-Detect: 3 Onsets bei 1.01/2.00/3.00s am 4-Kick-Mix; Tempo 60 BPM; MFCC (13,345); SC 234 Hz | HEBEL |
| C5 | pysox + sox (apt) | Effekte | PyPI 1.5.0, apt 14.4.2 | compand + reverb + norm an mix_sc.wav durchgelaufen | HEBEL |
| C6 | pyroomacoustics | Raum-Akustik | PyPI 0.10.1 | Shoebox 6×4×2.5m, max_order=8, RT60 0.133s, IR-Render 4.148s | HEBEL |
| C7 | spaudiopy | Ambisonics | PyPI 0.2.0 (pin scipy<1.15) | 1st-order Ambi-Encode bei az=90°: Y-Kanal RMS 0.1712, X-Kanal 0.0000 — räumlich korrekt | HEBEL |
| C8 | numpy-Envelope-Follower | Side-Chain | — | wie C1 belegt; ohne externe Dependency | HEBEL (Pflicht-Begleiter zu C1) |
| — | XTTS-v2 | Voice-Clone | coqui-ai/TTS releases: 22 Tags, 0 Modell-Assets; idiap/coqui-ai-TTS: 10 Tags, 0 Assets; daswer123/xtts-api-server: 2 Asset-Hits aber keine Gewichte | — | VERWORFEN |
| — | OpenVoice | Voice-Clone | myshell-ai/OpenVoice: 0 Tags, 0 Releases; raw/checkpoints/*.pth: 404; PyPI openvoice: 404 | — | VERWORFEN |
| — | Tortoise-TTS | Voice-Clone | neonbjb/tortoise-tts: 0 Tags; 152334H/tortoise-tts-fast: 0 Asset-Hits; PyPI tortoise-tts 3.0.0 ja, aber Gewicht via HF | — | VERWORFEN |
| — | Bark (suno-ai) | Voice-Clone | suno-ai/bark: 0 Tags; JonathanFly/bark: 2 Tags 0 Gewicht-Assets; PyPI suno-bark 0.1.5 vorhanden, Gewichte HF | — | VERWORFEN |
| — | piper neue Stimmen >v0.0.2 | Voice-Clone | rhasspy/piper v1.0.0–v1.2.0 hat nur **Binary-Tarballs**, KEINE neuen Stimmen | — | VERWORFEN (Welle 1 v0.0.2-Stimmen bleiben einzige GitHub-Quelle) |
| — | SuperCollider (sclang) | SFX-Synthese | apt 1:3.13.0 ja | scsynth -N startet, schreibt Header; sclang scheitert an Qt-WebEngine + root-sandbox (no --no-sandbox in Container) | VERWORFEN (sclang) / TEILWEISE (scsynth -N braucht eigenes OSC-Score-Tool) |
| — | pyo | Effekte | PyPI 1.0.5 | Wheel-Build bricht im Container | VERWORFEN |
| — | pylibpd | PD-Python | PyPI 0.14.1 metadata da, aber pip kann sdist nicht ziehen | — | VERWORFEN |

---

# TEIL 1 — HEBEL Welle 2 C

## C1 · `pedalboard` — Side-Chain-Compression, voller Effekt-Stack

- **Was es ist:** Spotifys headless VST/Plugin-Host als PyPI-Package (`pip install pedalboard`).
- **Ersetzt:** den fehlenden Side-Chain-/Voller-Effekt-Stack in Welle 1. H3 hatte nur
  ffmpeg + pydub + EBU-R128 — Side-Chain, Pitch-Shift, Distortion, Delay, Chorus, Reverb
  als programmierbare Kette fehlten.
- **Mess-Protokoll:** `pip install pedalboard` (0.9.23, pythonhosted), keine Gewichte.
  Kein VST3-Plugin nötig — die eingebauten Effekte reichen.
  - **Side-Chain belegt:** 4 Kicks (60 Hz, exp-decay) + Pad-Akkord (220/277/330 Hz),
    Envelope-Follower auf abs(kick) mit Attack 5 ms / Release 150 ms, Threshold −20 dB,
    Ratio 8:1. **Pad-RMS während Kick: 0.371 → 0.102 (Duck 27,4 %)**; zwischen Kicks
    0.369 → 0.369 (Duck 100 %). Saubere Frequenz-Trennung im Ducking.
  - **Voller Stack belegt:** 4 unterschiedliche Effekt-Ketten am Mix:
    - `hellmuth_hall`: HighpassFilter(120) → Reverb(0.7, wet 0.4) → Limiter(-1) — RMS 0.366
    - `moderat_grit`: Distortion(+12 dB) → Compressor(-18, 6:1) → Limiter — RMS 0.236
    - `pitchshift_oktav`: PitchShift(+12) → Reverb(0.4) — RMS 0.250
    - `delay_pingpong`: Delay(0.25, fb 0.4, mix 0.4) → Reverb(0.5) — RMS 0.271
- **Install + Aufruf:**
  ```python
  from pedalboard import Pedalboard, HighpassFilter, Compressor, Reverb, Limiter, PitchShift, Distortion, Delay, Chorus
  import soundfile as sf, numpy as np
  y, sr = sf.read("in.wav"); y = y.astype(np.float32)
  board = Pedalboard([HighpassFilter(120), Reverb(room_size=0.7, wet_level=0.4), Limiter(-1)])
  sf.write("out.wav", board(y, sr), sr)
  # Side-Chain (pedalboard hat keine native Sidechain-API):
  env = numpy_envelope_follower(kick, attack_ms=5, release_ms=150)
  gain_lin = np.where(env > thr, (thr + (env-thr)/ratio)/np.maximum(env,1e-9), 1.0)
  pad_ducked = pad * gain_lin
  ```
- **Nutzende Instanz:** Audio-Pipeline. Ergänzt H3: H3 macht Format/Resample/Lautheit,
  C1 macht Form (Hall, Side-Chain, Drive). Anti-Moderat-Hebel.
- **Grenze:** native pedalboard-API kennt keinen externen Sidechain-Bus — Trick mit
  numpy-Envelope-Follower außerhalb. Echtes VST3-Sidechain ginge mit `VST3Plugin(...)`
  + sidechain-fähigem Plugin-File; im Container gibt es kein VST-Plugin-File.

## C2 · `jsfxr` — prozedurale Game-SFX (Welle-1-Lücke!)

- **Was es ist:** chr15m-Port des klassischen sfxr/Bfxr-Algorithmus als npm-Modul.
  Modellfrei, deterministisch, parametrisiert. **Welle 1 hatte NICHTS für Game-SFX.**
- **Ersetzt:** ElevenLabs/Bezahl-SFX für klassische Arcade-Sounds (UI-Klick,
  Coin-Pickup, Laser, Explosion). Für HELLMUTH: UI-Töne, Build-Complete-Chime,
  Klick-Feedback, Unit-Acknowledge.
- **Mess-Protokoll:** `npm install jsfxr` (chr15m, registry 200). 6 Genre-Presets
  generiert. **Achtung:** `sfxr.toBuffer()` liefert **unsigned 8-bit PCM-Samples
  (0..255)**, KEIN WAV-Header. Selbst gebauter 44-Byte-RIFF-Header nötig.
  Ergebnisse:
  ```
  explosion      sr=44100  dur=0.091s  peak=0.984  RMS=0.4621
  pickupCoin     sr=44100  dur=0.330s  peak=1.000  RMS=0.1916
  laserShoot     sr=44100  dur=0.294s  peak=0.812  RMS=0.2321
  jump           sr=44100  dur=0.219s  peak=0.469  RMS=0.1852
  synth          sr=44100  dur=1.869s  peak=0.633  RMS=0.1289
  random         sr=44100  dur=1.437s  peak=1.000  RMS=0.1374
  ```
- **Install + Aufruf:**
  ```js
  const { sfxr } = require('jsfxr');
  const sound = sfxr.generate('explosion');
  const samples = sfxr.toBuffer(sound);         // Array of 0..255 (uint8 PCM)
  // WAV-Header selbst bauen (44 Bytes, mono, 8bit, sr=sound.sample_rate||44100)
  const header = makeWav8bitHeader(samples.length, sound.sample_rate || 44100);
  fs.writeFileSync('out.wav', Buffer.concat([header, Buffer.from(samples)]));
  ```
- **Nutzende Instanz:** UI-/SFX-Pipeline. Kanonische Game-SFX in `public/audio/sfx/`.
- **Grenze:** 8-bit, mono, 44.1 kHz — archaisch retro. Anti-Moderat genug für ein
  iso-2D-RTS mit alchemistischem Vokabular. Für orchestrale/realistische SFX bleibt
  ElevenLabs/extern.

## C3 · `pure-data` (apt) — Patch-basierte Synthese, headless rendering

- **Was es ist:** Pd-vanilla über apt (`apt install puredata-core`), node-direkt
  ohne GUI, schreibt WAV via `writesf~`.
- **Ersetzt:** SuperCollider-Skripte (sclang scheitert im Container an Qt-WebEngine,
  siehe Verworfen). Pd ist GUI-frei laufbar.
- **Mess-Protokoll:** `apt install puredata-core` 0.54.1, `pd --nogui --nrt --noaudio`
  + `-send "pd dsp 1; writesf open out.wav; writesf start"`. 1 s 440-Hz-Sinus durch
  Patch `[osc~ 440]→[*~ 0.5]→[writesf~]` schreibt 131 kB WAV mit **kaputtem
  data-Size-Header** (writesf~ schließt nicht sauber wenn pd via timeout abbricht).
  **Workaround belegt:** Python-Header-Reparatur — Bytes 4..8 = RIFF-Size, Bytes 40..44
  = data-Size. Nach Reparatur: 1.486 s, sr 44100, peak 0.500, RMS 0.354 — echtes
  Signal.
- **Install + Aufruf:**
  ```bash
  apt install puredata-core
  pd -nogui -nrt -noaudio \
     -send "pd dsp 1; control open /tmp/out.wav; control start" \
     patch.pd & sleep 1.5; kill -SIGTERM $!
  python3 -c "
  import struct; raw=open('/tmp/out.wav','rb').read(); n=len(raw)
  with open('/tmp/out.wav','wb') as f: f.write(struct.pack('<4sI4s4sIHHIIHH4sI',
      b'RIFF', n-8, b'WAVE', b'fmt ', 16, 1, 1, 44100, 44100*2, 2, 16, b'data', n-44) + raw[44:])
  "
  ```
- **Nutzende Instanz:** SFX-Pipeline für komplexere prozedurale Sounds (Drones,
  granulare Texturen, gefilterte Noise-Bursts) die jsfxr nicht kann.
- **Grenze:** Pd-Patches sind textuell aber sperrig — empfiehlt sich nur, wo jsfxr
  oder ein simpler numpy-Generator nicht reichen.
- **Gotcha:** `pd-watchdog` fehlt (Container) → Warnung, kein Bruch. WAV-Header muss
  repariert werden, da pd vor `writesf~ stop` per Signal stirbt.

## C4 · `librosa` — Spektral-Analyse, Onset-Detection, MFCC

- **Was es ist:** der Standard für Audio-Analyse in Python. Welle 1 hat das NICHT.
- **Ersetzt:** Bauchgefühl beim Audio-QA. Erlaubt automatische Pipeline-Checks
  („spawned alle 4 Kicks tatsächlich bei den richtigen Beats?", „Tempo-Drift im
  Loop?", „Spektral-Profil zu nah am Moderat-Drone?").
- **Mess-Protokoll:** `pip install librosa` (0.11.0). An mix_sc.wav (4 Kicks +
  Pad-Akkord, 4 s): Onset-Detect liefert 3 Onsets bei **1.01, 2.00, 3.00 s**
  (erster Kick fällt unter Detection-Threshold, drei klare folgende — passt zur
  Komposition). Tempo: **60.09 BPM**. MFCC-Shape (13, 345) — pro Frame 13
  Koeffizienten. Spektralzentroid 234 Hz (Pad dominiert).
- **Install + Aufruf:**
  ```python
  import librosa, soundfile as sf
  y, sr = sf.read("in.wav")
  onsets = librosa.onset.onset_detect(y=y.astype(np.float32), sr=sr, units='time')
  tempo, beats = librosa.beat.beat_track(y=y.astype(np.float32), sr=sr)
  mfcc = librosa.feature.mfcc(y=y.astype(np.float32), sr=sr, n_mfcc=13)
  ```
- **Nutzende Instanz:** Audio-Pipeline-QA. Pflicht-Step im Drop-a-file-Vertrag:
  Onset-Plausibilität bei rhythmischen Loops, Spektralzentroid als Anti-Mud-Filter.
- **Grenze:** keine Generation, nur Analyse.

## C5 · `pysox` + `sox` (apt) — deklarative Effekt-Pipelines

- **Was es ist:** Python-Wrapper um das `sox`-Binary (Swiss-Army-Knife der Audio-CLI).
- **Ersetzt:** ad-hoc-ffmpeg-Filter-Strings. Sauberer Builder + ein Format, das ein
  Audio-Engineer lesen kann.
- **Mess-Protokoll:** `apt install sox` (14.4.2), `pip install sox` (1.5.0). Pipeline:
  `compand(attack=0.05, decay=0.3, knee=6, tf=[(-90,-90),(-30,-10),(0,-3)])` →
  `reverb(60, room_scale=80)` → `norm(-1)` am mix_sc.wav. Eingabe RMS 0.350,
  Ausgabe RMS 0.358 (normiert auf −1 dBFS).
- **Install + Aufruf:**
  ```python
  import sox
  tfm = sox.Transformer()
  tfm.compand(attack_time=0.05, decay_time=0.3, soft_knee_db=6.0,
              tf_points=[(-90,-90),(-30,-10),(0,-3)])
  tfm.reverb(reverberance=60, room_scale=80)
  tfm.norm(-1.0)
  tfm.build_file("in.wav", "out.wav")
  ```
- **Nutzende Instanz:** Audio-Pipeline. Alternative zu C1 wenn man einen
  Engineer-leserlichen Build-Schritt will. C1 ist programmatischer Stack;
  C5 ist deklarative Effekt-Liste.
- **Gotcha:** `compand` braucht `attack_time` als Keyword, NICHT als Liste-of-Tuples
  (Doku ist alt). sox-Reverb erzeugt Stereo aus Mono-Input.

## C6 · `pyroomacoustics` — Raum-Akustik / Reverb-Simulation

- **Was es ist:** physikalische Shoebox-Simulation (Image-Source-Method).
  Berechnet IR (Impulse-Response) für gegebene Raum-Geometrie + Material-Absorption.
- **Ersetzt:** geschmäcklerische Reverb-Plugins. Liefert **physikalisch konsistente**
  IR — d. h. dieselbe Halle, ob Schwert oder Stimme, klingt identisch.
- **Mess-Protokoll:** `pip install pyroomacoustics` (0.10.1). 6×4×2.5 m Shoebox,
  max_order=8 (Reflexionsordnung), `pra.Material(energy_absorption=0.3, scattering=0)`.
  Quelle (2,1,1.5), Mic (4,3,1.5). `room.simulate()` → IR 4.148 s.
  **RT60 gemessen: 0.133 s** (kurze, eher trockene Halle wegen absorption 0.3).
- **Install + Aufruf:**
  ```python
  import pyroomacoustics as pra
  m = pra.Material(energy_absorption=0.3, scattering=0.0)
  room = pra.ShoeBox([6, 4, 2.5], fs=44100, max_order=8, materials=m)
  room.add_source([2.0, 1.0, 1.5], signal=mono_in)
  room.add_microphone([4.0, 3.0, 1.5])
  room.simulate()
  sf.write("out.wav", room.mic_array.signals[0], 44100)
  rt60 = room.measure_rt60()
  ```
- **Nutzende Instanz:** SFX-Pipeline. Konsistente Halle für eine Fraktion (Hellmuth
  = kühles Apothekenlabor mit langem RT60; Moderat = trockene Fabrikhalle).
- **Grenze:** API hieß früher `absorption=`, seit 0.6+ `materials=`. Welle-1-Beispiele
  brechen.

## C7 · `spaudiopy` — Ambisonics / spatial Audio

- **Was es ist:** Higher-Order-Ambisonics Encoding/Decoding (B-Format, MagLS Binaural).
- **Ersetzt:** stereo-Pan über `pydub`. Erlaubt **echtes 3D-Panning** für ein
  iso-Spiel mit Höhen-Information (Vögel, fallendes Gut).
- **Mess-Protokoll:** `pip install spaudiopy` (0.2.0). **Gotcha:** verlangt
  `scipy<1.15` (1.17 hat `sph_harm` umbenannt). Nach Downgrade: 1st-order
  Ambisonics-Encode bei az=90°, colat=90°: **Y-Kanal (Side) RMS 0.1712,
  X-Kanal (Front) 0.0000, Z-Kanal (Up) 0.0000** — räumlich korrekt
  (Quelle ganz links → nur Y trägt).
- **Install + Aufruf:**
  ```python
  import spaudiopy.sph as sph, numpy as np
  Y = sph.sh_matrix(1, [np.deg2rad(90)], [np.deg2rad(90)], 'real')  # az=90°
  ambi = Y.T @ mono[np.newaxis, :]   # (4, N) B-format
  sf.write("ambi.wav", ambi.T, 44100)
  ```
- **Nutzende Instanz:** SFX-Pipeline für räumlich verteilte Spielsounds.
- **Grenze:** scipy<1.15 nötig. Binaural-Decoder-API (`magls_bin`) hat sich seit
  0.2.0 verändert — Default-HRTF muss separat geladen werden.

## C8 · Numpy-Envelope-Follower — Side-Chain ohne externes Plugin

- **Was es ist:** ein 12-Zeilen-numpy-Loop, der einen Pegel-Detektor (Attack/Release
  RC) auf abs(kick) baut.
- **Ersetzt:** das fehlende Sidechain-Plugin. Begleitet C1.
- **Mess-Protokoll:** wie C1 belegt — Duck-Ratio 27,4 % während Kick, 100 % zwischen.
- **Install + Aufruf:**
  ```python
  def env_follower(x, sr, attack_ms=5, release_ms=150):
      aa = np.exp(-1.0/(sr*attack_ms/1000))
      ar = np.exp(-1.0/(sr*release_ms/1000))
      env = np.zeros_like(x); ax = np.abs(x)
      for i in range(1, len(x)):
          env[i] = (aa*env[i-1] + (1-aa)*ax[i]) if ax[i] > env[i-1] else (ar*env[i-1] + (1-ar)*ax[i])
      return env
  ```
- **Nutzende Instanz:** Pflicht-Begleiter zu C1.

---

# TEIL 2 — VERWORFEN (mit 3 belegten Spiegeln je Eintrag)

## Voice-Cloning insgesamt

| Werkzeug | Spiegel 1 | Spiegel 2 | Spiegel 3 | Urteil |
|---|---|---|---|---|
| **XTTS-v2** | `github.com/coqui-ai/TTS/releases` HTTP 200, 22 Tags, **0 Modell-Assets** (nur Source-Tarballs) | `github.com/idiap/coqui-ai-TTS/releases` HTTP 200, 10 Tags, **0 Assets** | `github.com/daswer123/xtts-api-server/releases` HTTP 200, 2 Asset-Hits, aber Inhalt sind Docker-Compose / Config, **keine Gewichte** | TOT (Gewichte nur HF). PyPI coqui-tts 0.27.5 installierbar, Modell-Download zeigt auf HF → 403 |
| **OpenVoice (MyShell)** | `github.com/myshell-ai/OpenVoice/releases` HTTP 200, **0 Tags** (keine Releases) | `github.com/myshell-ai/OpenVoice/raw/main/checkpoints/.../checkpoint.pth` → **HTTP 404** (Checkpoints liegen im Repo NICHT als Dateien, sondern auf HF) | `pypi.org/pypi/openvoice/json` → **HTTP 404** (kein PyPI-Package) | TOT |
| **Tortoise-TTS** | `github.com/neonbjb/tortoise-tts/releases` HTTP 200, **0 Tags** | `github.com/152334H/tortoise-tts-fast/releases` HTTP 200, **0 Asset-Hits** | PyPI `tortoise-tts` 3.0.0, install lädt Gewichte zur Laufzeit von HF | TOT (PyPI-Install bricht an HF) |
| **Bark (suno-ai)** | `github.com/suno-ai/bark/releases` HTTP 200, **0 Tags** | `github.com/JonathanFly/bark/releases` HTTP 200, 2 Tags, **0 Gewicht-Assets** (nur Source) | `github.com/serp-ai/bark-with-voice-clone` HTTP 200, kein Release | TOT (Welle 1 hat encodec-Build-Bruch ohnehin belegt) |
| **piper neue Stimmen >v0.0.2** | `github.com/rhasspy/piper/releases/expanded_assets/v1.2.0` HTTP 200 — **nur** `piper_amd64.tar.gz`, `piper_arm64.tar.gz`, `piper_armv7.tar.gz` (Binaries) | v1.1.0 dito | v1.0.0 dito | TOT — keine NEUEN Stimmen jenseits v0.0.2 als Release. Welle-1-v0.0.2-Set ist endgültig der einzige GitHub-Stimmenkanon |

**Fazit Voice-Cloning:** alle 4 großen Cloning-Tools haben Gewichte ausschließlich auf
HF. Kein einziger Spiegel-Repo legt Modell-Bytes als GitHub-Release-Asset ab. Welle 1
hat es richtig benannt; Welle 2 bestätigt mit gezielter Spiegel-Suche. **Voice-Cloning
ist im Container endgültig tot.** Für HELLMUTH bleibt für nicht-finale Charakterstimmen
Welle-1-piper-tts (festes Stimmen-Set v0.0.2), für final ElevenLabs extern.

## Weitere Verworfen

| Werkzeug | Spiegel 1 | Spiegel 2 | Spiegel 3 | Urteil |
|---|---|---|---|---|
| **SuperCollider (sclang)** | apt `supercollider-language` 1:3.13.0 → installiert | `scsynth -N` NRT-Mode existiert und startet (44 Bytes WAV-Header geschrieben) | `sclang` scheitert: **Qt-WebEngine läuft nicht als root ohne `--no-sandbox`** (`zygote_host_impl_linux.cc(90)`) | TOT für skriptbares sclang. scsynth-NRT theoretisch nutzbar, braucht aber selbstgebauten OSC-Score-Builder (pythonosc-Bundle ohne sclang) → hoher Aufwand für unklaren Nutzen, vs. Pure-Data |
| **`pyo`** (Python DSP Framework) | PyPI 1.0.5 erreichbar | files.pythonhosted vorhanden | Wheel-Build bricht in Container an C-Build-Deps | TOT |
| **`pylibpd`** (libpd Python) | PyPI Metadata 200 | aber `pip install pylibpd` findet **keine Distribution** (nur metadata kein Wheel) | github eq scheitert ohne C-libpd headerkette | TOT |

---

# TEIL 3 — BETRIEBSNOTIZEN WELLE 2 C

1. **scipy-Konflikt:** spaudiopy 0.2.0 verlangt `scipy.special.sph_harm` (alte API).
   scipy ≥1.15 hat das in `sph_harm_y` umbenannt. **Lösung:** `pip install "scipy<1.15"`.
   Pedalboard, librosa, pyroomacoustics laufen mit scipy 1.14.1 weiter.

2. **jsfxr WAV-Format-Falle:** `sfxr.toBuffer(sound)` liefert ein **JS-`Array` aus
   uint8 PCM-Samples (0..255, 128 = Stille)**, KEIN fertiges WAV. Wer ohne Header
   schreibt, bekommt eine `.wav`-Datei die soundfile als „format not recognised"
   ablehnt. RIFF-Header (44 Bytes, mono, 8-bit, sr aus `sound.sample_rate`) muss
   selbst gebaut werden.

3. **pure-data Header-Bug:** Wenn `pd` per `kill -SIGTERM` oder `timeout` abbricht
   bevor `writesf~ stop` ausgelöst wurde, bleibt im WAV-Header `data size = 0`.
   Datei enthält die Samples, aber `file out.wav` meldet "data 0", soundfile lehnt ab.
   Reparatur: Bytes 4..8 (RIFF-Size = total−8) + Bytes 40..44 (data-Size = total−44)
   per Python-`struct.pack` überschreiben.

4. **SuperCollider braucht Display.** Selbst mit `QT_QPA_PLATFORM=offscreen`
   bricht sclang an Qt-WebEngine + `--no-sandbox` (root-Container). Pure-Data ist
   der pragmatische SC-Ersatz im Container.

5. **Side-Chain in pedalboard ist NICHT native.** Pedalboards `Compressor` hat
   keinen externen Sidechain-Bus. Lösung: Envelope-Follower außerhalb (12 Zeilen
   numpy, C8), Gain-Reduktion als Multiplikator. Trotzdem messbarer Side-Chain
   (Duck-Ratio 27,4 %).

6. **Konsistenz mit Welle 1 H3:** C1, C5, C6 ergänzen H3. H3 = Format/Resample/
   Lautheit (EBU-R128). C1/C5/C6 = Form (Hall, Side-Chain, räumliche Position).
   Reihenfolge in der Pipeline: jsfxr/PD/Higgsfield-Audio **erzeugen** → C1/C5/C6
   **formen** → H3 **normalisieren** → drop-a-file.

---

# Anhang · WAV-Datei-Beweis

Im Container `/tmp/welle2-c/` liegen folgende Beweis-WAVs:

| Datei | Werkzeug | Inhalt |
|---|---|---|
| `mix_no_sc.wav` | reines numpy | 4 Kicks + Pad ohne Side-Chain |
| `mix_sc.wav` | numpy + C1/C8 | Side-Chain belegt (Duck-Ratio 0.274 während Kick) |
| `pad_fx.wav` | C1 | Pad durch Chorus → Reverb → Limiter |
| `fx_hellmuth_hall.wav` | C1 | HighpassFilter → Reverb → Limiter |
| `fx_moderat_grit.wav` | C1 | Distortion → Compressor → Limiter |
| `fx_pitchshift_oktav.wav` | C1 | PitchShift +12 → Reverb |
| `fx_delay_pingpong.wav` | C1 | Delay 0.25s fb 0.4 → Reverb |
| `jsfxr_explosion.wav` | C2 | 91 ms, peak 0.984, 8-bit PCM |
| `jsfxr_pickupCoin.wav` | C2 | 330 ms, peak 1.0 |
| `jsfxr_laserShoot.wav` | C2 | 294 ms |
| `jsfxr_jump.wav` | C2 | 219 ms |
| `jsfxr_synth.wav` | C2 | 1.87 s |
| `jsfxr_random.wav` | C2 | 1.44 s (zufaellig genereriert) |
| `pd_out.wav` | C3 | 1.486 s 440 Hz Sinus aus Pd-Patch (Header repariert) |
| `mix_sox.wav` | C5 | compand + reverb + norm |
| `mix_room.wav` | C6 | Shoebox-Simulation RT60 0.133 s |
| `mix_ambi.wav` | C7 | 4-Kanal-B-Format Ambisonics az=90° |

Selbstprüfung erfüllt:
- Voice-Cloning, SFX und Effekte alle drei berührt.
- OpenVoice/Tortoise/Bark/XTTS-v2-Mirror-URLs per HTTP-Code echt geprüft (nicht vermutet).
- pedalboard mit echtem Side-Chain-Lauf (Duck-Ratio 0.274) belegt, nicht nur installiert.
- ≥5 Kandidaten geliefert: tatsächlich **8 HEBEL** (C1–C8), davon **C1 und C2 sind
  Welle-2-Schwergewichte** mit funktionierendem Sample-Lauf.
- Verworfen-Liste mit 3 Spiegeln je Eintrag belegt.
