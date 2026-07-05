# AUDIO-ENGINE — Fundament + Mix & Raum + Inhalt + Format/L10n

Status nach **Paket A-D + Physik**: Backend + Voice-Limiter + Manifest (A);
Mix-Busse + Limiter + Ducking + Pan (B); Barks + Musik + Ambience, gestreamt (C);
Format-Kette + Audio-Sprites + lazy Lokalisierung mit EN-Fallback (D); Wucht-
Kopplung + Anti-Monotonie + Robustheit (Physik). Offen nur noch die echten
Tondateien und der Terrain-`dominantSort`-Sampler (editor).

## Architektur-Wahrheit

HELLMUTH liefert **fertige Audiodateien** aus. **Keine Live-API.** Stimmen
(Helmut = Ticros geklonte Stimme), SFX, Musik, Ambience kommen aus ElevenLabs
ueber die GitHub-Bruecke -- wie die Grafik. Die Engine kennt nur das **Manifest**
(`game/data/audio_manifest.json`) plus die **Dateien** unter `public/audio/`
(Vite liefert sie unter `/audio/`). Fehlt eine Datei: **no-op, nie throw** --
der Drop-a-file-Vertrag.

## Die eine Schnittstelle

Ausloeser rufen nie direkt Phaser, sondern:

```ts
audio.play(event, ctx); // event = gebundenes Spielereignis, ctx = Kontext
```

`ctx` traegt `{ x?, y?, faction?, unitType?, biome?, importance?, lautstaerke?,
loop? }`. Der Manager loest auf: **Binding -> Set -> Sprach-/Varianten-Wahl**,
wendet **Dedup + Voice-Limiting + Stealing** an und reicht nur zugelassene
Voices ans Backend.

## Bausteine (`src/audio/`)

| Datei | Rolle |
|---|---|
| `audio_manifest.ts` | Schema (Set/Binding/File) + Loader + Aufloesungs-Helfer. |
| `voice_limiter.ts` | Dedup + Caps + Priority-Stealing. Phaser-frei, getestet. |
| `audio_backend.ts` | `AudioBackend`-Interface + WebAudio-Voice-Engine + `PhaserAudioBackend` (+ Raw-Fallback, Silent). |
| `audio_manager.ts` | Fassade: `play/playSet`, Bus-/Master-Mix, Sprache, Listener, Stats. |
| `install_audio.ts` | Duenner additiver Bus-Hook (abonniert die gebundenen Ereignisse). |
| `audio_preload.ts` | Phaser-Loader fuer Audiodateien (toleriert fehlende). |
| `audio_lang.ts` | Aktive Sprache aus `?lang=`. |
| `audio_dev.ts` | Mess-Bruecke `?audio-debug=1` (Sets spielen, Voice-Zaehler, Stress). |

## Strang 1 — Backend + Voice-Limiting

**Backend:** Phaser-`WebAudioSoundManager` ist die Ausgabeschicht; der
`AudioManager` sitzt darueber. `PhaserAudioBackend` zieht den AudioContext aus
Phasers Sound-Manager (teilt dessen Unlock-/Suspend-Lebenszyklus). Howler
verworfen. `RawWebAudioBackend` (eigener Context) ist der dokumentierte
V2-Notausgang. Pro Voice **genau 1 Gain + 1 StereoPanner**, kein Convolver.
**KEIN PannerNode** -- iOS-Safari hat keinen; StereoPanner ist Pflicht und faellt
sauber auf "kein Panning" zurueck. AudioContext startet suspended -> erster
Gesture entsperrt, bis dahin still.

**Voice-Limiting** (`voice_limiter.ts`, der Audio-Zwilling der VFX-LOD-Kappe):

- **Dedup VOR Allokation**, keyed `category+faction`: Fenster hit 60 ms,
  death 90 ms, ui 40 ms, building 0. Das ist die Antwort auf
  "50 Treffer -> 1-2 Sounds".
- **Kategorie-Caps:** hit_melee/hit_ranged je 8, unit_death 6, building_death 3,
  building_idle 4, combat_fx 8, ui 4, music 2, ambient 4. **Global-Hard-Cap 48.**
- **Prioritaet** `4*cat + 3*prox + 2*imp - 1*age`; **Voice-Stealing** killt den
  leisesten/aeltesten gleicher Kategorie (sonst global), nur wenn der Neue
  hoehere Prioritaet hat. Kein Virtual-Queue in V1.

**Abnahme:** `npm run test:audio` (8 Tests gruen) deckt Dedup, Caps, Global-Cap,
300-Ausloeser-Fall und Priority ab. In-Game: `?audio-debug=1`, Taste **S** feuert
50/150/300 gleichzeitig; der Live-Zaehler im Overlay (und das
DevTools-WebAudio-Panel) zeigt reale Voices <= 48. Chrome **und** iOS-Safari.

## Strang 7 — Manifest & Ordner-Vertrag (Keystone)

Schema (`game/data/audio_manifest.json`):

```jsonc
{
  "version": 2,
  "sprachen": ["de", "en", "ko"],   // erweiterbar zh/ja
  "standardSprache": "de",
  "sets": {
    "sfx.hit.melee": {              // AudioSet
      "key": "sfx.hit.melee", "bus": "sfx", "kategorie": "hit_melee",
      "cooldownMs": 60, "maxVariants": 4,
      "files": [ { "stem": "sfx/hit/nah_01" }, { "stem": "sfx/hit/nah_02" } ]
    },
    "voice.helmut.select": {        // lokalisierte Stimme
      "key": "voice.helmut.select", "bus": "stimme", "kategorie": "ui",
      "files": [
        { "stem": "voice/hellmuth/helmut/select_01", "lang": "de" },
        { "stem": "voice/hellmuth/helmut/select_01_ko", "lang": "ko" }
      ]
    }
  },
  "bindings": [                      // AudioBinding: Ereignis -> Set
    { "event": "fx.unit_hit", "pick": "first", "sets": { "*": "sfx.hit.melee" } },
    { "event": "sel.units_selected", "pick": "faction",
      "sets": { "hellmuth": "voice.helmut.select", "*": "sfx.ui.select" } }
  ]
}
```

- **AudioFile** = `stem` (ohne Endung) + `formats?` (Default ogg, m4a) + `lang?`.
  Der Player nimmt das erste vom Browser unterstuetzte Format.
- **AudioSet** = Varianten auf einem Bus, mit `gain/loop/cooldownMs/maxVariants/
  optional/kategorie`. Mehrere `files` = Anti-Repetition.
- **AudioBinding** = `event` -> `sets` mit `pick` (`faction|unitType|biome|first`).
  `"*"` ist der Default-Selektor.
- **Busse:** `master, musik, sfx, stimme, ambience` (echte Gain-Nodes,
  musik/sfx/stimme/ambience -> master).

**Ordner** (`public/audio/`), `AUDIO_ROOT = "audio/"`:

```
sfx/{hit,death,ui,resource}/   music/   ambience/   voice/<faction>/<unit>/
```

**Bindings + Emit-Punkte** (additive Einzeiler, das Manifest definiert die Keys):

| Ereignis | Quelle | Status |
|---|---|---|
| `fx.unit_hit` / `fx.unit_died` / `fx.building_died` | combat/game_scene | schon emittiert (gekoppelt) |
| alle `ui:*` | html_hud (game.events) | schon emittiert (gekoppelt) |
| `sel.units_selected` | game_scene (Pointer-Up + Control-Group) | **neu verdrahtet** |
| `sel.command_move` | game_scene `command()` | **neu verdrahtet** |
| `prod.unit_ready` | production_system `spawn()` | **neu verdrahtet** |
| `state.match_start` / `state.victory` / `state.defeat` | game_scene | **neu verdrahtet** |
| `biome.entered` | Ambience-System | Binding da, Emitter folgt (Paket C) |

**Abnahme:** korrekt benannte Datei in den Ordner -> spielt am gebundenen
Ereignis **ohne Code-Aenderung**; Start ohne `public/audio/` laeuft (Stub gruen)
**vor** jeder ElevenLabs-Lieferung.

## Strang 6 — Mix-Busse & Ducking (Paket B)

Graph: `Voice -> voiceGain -> StereoPanner -> busDuck -> busUser -> master ->
DynamicsCompressor (Limiter) -> destination`.

- **Master-Limiter** (Pflicht): thr −3 dBFS, ratio 20:1, attack 3 ms,
  release 250 ms -- faengt Vollmix-Spitzen ab, kein Clipping.
- **Zwei Gains je Bus:** `busUser` (Slider) und `busDuck` (Automation), damit
  Regler und Ducking sich nicht ueberschreiben.
- **Ducking** (`audio_ducking.ts`): Voice→Music −9 dB (80/350 ms),
  Voice→Ambience −6 dB, Wichtige-SFX (building_death)→Music −6 dB (40/300 ms),
  Kampf→Ambience −5 dB (120/600 ms). `setTargetAtTime`, **τ = ms/3000**,
  **tiefste Senkung gewinnt** (Refcount, kein Stapeln). Hart-Mute und
  Compressor-Sidechain verworfen (kein Sidechain-Eingang in WebAudio).
- **UI-SFX** laufen auf dem SFX-Bus als geschuetzte **nicht-positionale Spur**
  (kein Pan/Distanz, nie gecullt, eigener Cap 4, von Kampf-Voices nicht
  stehlbar -- Limiter-`geschuetzt`).

## Strang 2 — Positionaler Klang (Paket B)

Stereo-Pan(Screen-X) + Distanz-Gain. **Kein PannerNode/HRTF** (300 Convolver =
Budget-Tod), iOS-StereoPanner-Fallback wie Paket A.

- `pan = clamp((wx − cam.midPoint.x)·zoom / halfW, −1, +1)` (Iso-Y NICHT im Pan).
- Inverse Distanzkurve, `refPx = 0.45·halfW`; Distanz aus x **und** y.
- **Off-Screen-Hard-Cull** mit Marge 80 px (0,5·TILE) **vor** Allokation ->
  kartenferne Schwaerme erzeugen null Knoten. Bricht eine Salve das Budget, ist
  die Antwort der **Voice-Cap (Strang 1)**, nicht ein teurer Node. Effektiv
  mischende Stimmen nach Cull+Cap ≈ 20–40.
- Reitet auf denselben `fx.unit_*`-Events (Welt-Pixel), kein neuer Emit-Pfad.
  Kamera kommt ueber `audio.setCamera(cam)` (game_scene); nicht-positionale
  Kategorien (UI/Musik/Ambience/Stimme) sind zentriert, voll, nie gecullt.

## Inhaltsschicht (Paket C)

**Streaming-Naht:** Musik und Ambience laufen ueber ein gestreamtes
`HTMLAudioElement` (`MediaElementAudioSourceNode`) in den Musik-/Ambience-Bus --
NICHT als Puffer (ein 90-s-Track = ~126 MB PCM). SFX/Voice bleiben gepufferte
Voices. `audio.streamSet(setKey)` -> `StreamHandle{fade,stop}`.

- **Strang 3 — Barks** (`bark_director.ts` / reiner `bark_state.ts`):
  Shuffle-Bag-Variante (AudioManager), Cooldowns (Select 350 / Befehl 600 /
  Idle 12 000 ms), Annoyed ab 6 Klicks/1200 ms, Interruption Death>Befehl>
  Selektion>Idle, ein Sprecher (`units[0]`). Set-Kategorie `ui` = geschuetzte
  Stimm-Spur. Funnel: `sel.units_selected`/`sel.command_move` (jetzt mit
  `unitType`+`kind`) und `fx.unit_died`. Held `hellmut` = Ticros Stimme.
- **Strang 4 — Musik** (`music_director.ts` / reiner `music_state.ts`):
  Horizontal-Crossfade explore/tension/combat/victory/defeat. **Hysterese:**
  Combat = 2 Treffer/1500 ms, Exit-Hold 6000 ms; rein 0,8 s / raus 3,0 s.
  Terminal (victory/defeat) ueberschreibt. Konsumiert `fx.unit_hit` +
  `state.victory/defeat`.
- **Strang 5 — Ambience** (`ambience_director.ts` / reiner `ambience_state.ts`):
  5x5-Sonden/500 ms ueber `worldView` (Mitte 3x3 doppelt), Hysterese >=3 Polls
  und >=60 %, Crossfade ~3 s, Ziel-Gain ~0,07 (felt-not-heard). Terrain ueber
  injizierten Sampler (Stub bis editor-Merge). Emittiert `biome.entered`.

## Format & Lokalisierung (Paket D)

- **Format-Kette** `[.ogg, .m4a, .mp3]` (`STANDARD_FORMATE`): Phaser waehlt die
  erste vom Browser unterstuetzte Datei (eingebauter Fallback). WebM/Opus
  verworfen (Safari hat Opus nur im Ogg-Container). Pro `AudioFile` ueber
  `formats?` ueberschreibbar.
- **Audio-Sprites** fuer kurze UI/SFX (1 Request, 1 Decode): `manifest.sprites`
  definiert ein Sheet (`stem` + `marks{name:{start,dauer}}`); ein `AudioFile`
  referenziert es per `{sprite,marker}`. Der Loader laedt das Sheet einmal, der
  Backend spielt die Region per `offset`/`dauer`. Voice bleibt einzeln je
  Sprache (selektiver Tausch); Musik einzeln gestreamt.
- **Lokalisierung manifest-getrieben** (`AudioFile.lang`): aktive Sprache aus
  der Registry (`?lang=` > localStorage > Default), **lazy Sprach-Pakete**
  (`ladeSprachpaket` laedt beim Wechsel nur die fehlenden Stimm-Dateien nach,
  SFX/Musik unberuehrt), Laufzeit-Tausch **ohne Rebuild**, **EN-Referenz-
  Fallback statt Stille** (Wwise-Muster). DE/EN/KO; ZH/JA durch Ordner +
  Manifest-Eintrag.
- **Kosten:** nur das gewaehlte Format zaehlt initial; weitere Sprachen lazy ->
  resident statt aller Sprachen gleichzeitig.

## Destillat-System (Code5)

Zwei event-gekoppelte Sets, raeumlich verortet, drei optionale Slots je Set:
- **`destille.drip`** (Kategorie `building_idle`, Cap 4): HELLMUTH-Tropfen, ruhig.
  Hook `fx.destillat_produced` (je Destille alle 5 s). Jitter ±100 Cent / ±1 dB.
- **`parasit.drain`** (Kategorie `combat_fx`, Cap 8): MODERAT-Parasit-Saug,
  scharf. Hook `fx.destillat_dropped`. Jitter ±200 Cent / ±1,5 dB; `combat_fx`
  duckt die Musik wie Kampf-SFX (combat>ambient-Regel). Position aus dem Event
  (DROPPED traegt `killerFaction` -> auf `ctx.faction` abgebildet, fuer den
  Dedup pro Front). Per-Set-Jitter ueber `jitterPitchCents`/`jitterDb`.

## Mess-Bruecke (`?audio-debug=1`)

Overlay listet die Sets (Taste/Klick spielt), zeigt den Live-Voice-Zaehler je
Kategorie samt Cap. `L` Sprache (loest lazy Nachladen aus), `M` Stumm, `[`/`]`
Master, `H` Live-Hook, **`S` Stress** (50/150/300). Im Dev-Modus sind fehlende
Dateien hoerbar (Synthton). Tests: `npm run test:audio` (43 Tests: Limiter, Mix,
Inhalt, Manifest, Robustheit, Destillat).

## Physik — Wucht, Variation, Robustheit

- **Wucht-Kopplung (T1):** `explosion.ts` triggert am Einschlag-Frame t=0
  `audio.playSet(big ? "impact.big" : "impact.small")`. Sub-Bass steckt
  vorgemischt im `big`-Asset (Gebaeude-/Held-Tod), eine Voice pro Explosion
  (Limiter), `impact.big` = Kategorie `building_death` -> duckt die Musik. Das
  redundante `fx.building_died`-Binding entfaellt (Explosion besitzt den Impact).
- **Anti-Monotonie (T2):** pro Voice Pitch-Jitter ±200 Cent (`detune`) +
  Volume-Jitter ±1,5 dB (`audio_util.jitter`), additiv im Backend; per Set ueber
  `jitter:false` abschaltbar.
- **Robustheit (T3):**
  - **Musik-Loop:** Tail-Crossfade (`braucheLoopCrossfade`, 400 ms) statt
    `element.loop` -- kein Padding-Knack.
  - **Lazy-Sprachwechsel:** Puffer-Fallback auf EN-Referenz, bis das Paket da
    ist (statt Stille; `waehleQuelle`).
  - **Scene-Shutdown:** `audio.stopAll()` + Direktor-Dispose geben Voices/Streams
    frei.
  - **Manifest-Validierung:** `validateManifest` meldet Tippfehler in
    Pfad/Key/Sprite frueh (Warnung beim Laden).
  - **Decode-Robustheit:** fehlende Dateien liefern bei SPA-Hosting HTML (200);
    der Loader prueft jede URL per HEAD (`istAudioAntwort`) und ueberspringt
    Nicht-Audio -> kein `Unable to decode audio data`-Spam.

## Offen (nach den Tondateien)

- **Echte Tondateien** (ElevenLabs, inkl. `impact.big`/`impact.small` mit
  vorgemischtem Transient/Body/Sub/Tail) -> droppen ins Manifest-Set.
- **Terrain-`dominantSort`** (editor) ueber den injizierten Ambience-Sampler
  nachziehen (Kampf-Events von dynamics sind schon live).
- Optional **Stufe 2** der Wucht: prozedurale Schichtung (`detune`/`layers`/
  `lowpassHz`) statt vorgemischt -- erst wenn Stufe 1 sitzt.
