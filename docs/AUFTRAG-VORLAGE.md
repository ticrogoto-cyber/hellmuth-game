# AUFTRAG-VORLAGE — Pflicht-Kopf für jeden Code-Auftrag

Jeder neue Auftragsbrief (an Code1–Code12, Solutions, Fable, etc.) trägt diesen
Vorab-Block **oben**, vor SCHRITT 0, vor Werkstücken, vor allem anderen. Wer den
Block weglässt, sagt der nächsten Instanz nicht, was sie im Container hat — und
sie wird wieder Mixamo, ElevenLabs oder Photoshop empfehlen, statt zu messen.

---

## VORAB, vor allem anderen

1. Lies `KONVENTIONEN.md` (Branch-Disziplin, Push-Regeln, `--hud-scale`-Negativ-Gate).
2. Lies `hellmuth/docs/CONTAINER-WERKZEUGE.md` (alle im Container verfügbaren
   Werkzeuge — Welle 1, plus jede gepushte Welle 2/3-Ergänzung).
3. Wenn du in dieser Aufgabe **Asset-Verarbeitung, Audio, 3D, Atlas, Profiling oder
   Balance** brauchst, nutze die dort gelisteten Werkzeuge, **nicht** externe
   Bezahl-Dienste, und **nicht** Handarbeit für Ticro.

---

## Wie das durchgesetzt wird

- `hellmuth/tools/werkzeuge_check.py` prüft maschinell, ob die elf Hebel im venv
  importierbar/aufrufbar sind. Läuft als eigenes Gate (`gate:werkzeuge`) in
  `pruefen.sh` und in `.github/workflows/ci.yml`.
- `hellmuth/tools/lint_auftragsbrief.py` scannt jeden Auftragsbrief
  (`.md` unter `hellmuth/docs/` oder `/mnt/user-data/outputs/`, der „SCHRITT 0",
  „Werkstück" oder „Loop-Blaupause" enthält) nach `Mixamo`, `ElevenLabs`,
  `Adobe`, `Photoshop`, `Hugging Face`, `huggingface.co`. Findet er ein
  Vorkommen außerhalb eines Verworfen-Kontextes, gibt es eine Warnung mit
  Datei und Zeile aus, plus den internen Ersatz. Mit `--strict` wird daraus
  ein Fehler.

---

## Mini-Cheat-Sheet (gemessen, Welle 1)

| Aufgabe | Im Container | Statt |
|---|---|---|
| PNG freistellen | `rembg` (u2net) | Higgsfield-Bezahl-Call, Adobe, Hand-Maske |
| Auto-Trim Sprite, Halo-Detektor | `cv2` (`opencv-python-headless`) | Photoshop, PIL+scipy-Hand |
| Audio konvertieren (WAV/MP3/OGG) | `imageio-ffmpeg` + `pydub` | Audacity, Online-Konverter |
| Lautheit angleichen (−16 LUFS) | `pyloudnorm` | Bauchgefühl, Gain-per-Datei |
| FBX → GLB | `FBX2glTF`-Binary | Blender-GUI |
| Headless-Blender, Retargeting | `bpy` (eigenes venv!) | Blender-GUI, Mixamo (gesperrt) |
| Mesh-Höhe/Vertex-Filter/Dezimierung | `trimesh` + `dracox` | Blender-Kaltstart |
| Platzhalter-VO | `piper-tts` (GitHub-Stimmen) | ElevenLabs für Platzhalter |
| Upscalen | `Real-ESRGAN` (torch-Bypass) / PIL Lanczos | Bezahl-Upscaler |
| Batch-Thumbnails | `pyvips` | PIL-Schleife |
| Atlas-Packing heterogen | `rectpack --use-pep517` | Hand-Atlas |
| Balance über viele Seeds | `pandas` + `balance_sweep.mjs` | Tabelle nach Bauchgefühl |
| CPU-Profil des Sim-Kerns | `0x`/CDP + `sim_load_profile.ts` | Raten |

### Was im Container **NICHT** läuft (Hugging-Face-Wand)

`MusicGen`, `Bark`, `Coqui XTTS` (Stimmklon-Generierung). Wer das vorschlägt,
hat den Brief nicht gelesen.

---

## Pflicht-Klausel am Ende jedes Werkstücks

> Nach diesem Werkstück:
>
> - lief `pruefen.sh` mit `FAIL = 0` UND `gate:werkzeuge` PASS,
> - lief `hellmuth/tools/lint_auftragsbrief.py` auf den eigenen Auftragsbrief mit
>   0 unverortbaren Bezahl-Tool-Treffern,
> - liegt ein Beleg im Commit-Kommentar (gemessene Zahl, nicht behauptet).
