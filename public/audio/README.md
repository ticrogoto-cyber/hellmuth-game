# public/audio/ — Audio-Web-Root

Hierher gehoeren die **fertigen Tondateien** (Uploads aus ElevenLabs). Vite
liefert diesen Ordner unter `/audio/` aus; die `stem`-Pfade im Manifest
(`game/data/audio_manifest.json`) sind relativ zu diesem Ordner und **ohne
Endung** -- der Player nimmt das erste vorliegende Format.

## Ordner

```
sfx/hit/        Treffer (nah/fern)                 -> Bus sfx
sfx/death/      Tod (Einheit/Gebaeude)             -> Bus sfx
sfx/ui/         UI-/Befehls-Klicks                 -> Bus sfx
sfx/resource/   Sammeln/Abladen                    -> Bus sfx
music/          Musik-Tracks (gestreamt)           -> Bus musik
ambience/       Atmosphaere-Betten (gestreamt)     -> Bus ambience
voice/<lang>/   Barks: bark_<typeId>_<kat>_<NN>    -> Bus stimme
```

Beispiele: `sfx/hit/nah_01.ogg`, `music/combat.ogg` (+`.mp3`),
`ambience/steppe.ogg`, `voice/de/bark_hellmut_select_01.ogg` (de),
`voice/en/bark_hellmut_select_01.ogg` (en). Held `hellmut` = Ticros geklonte
Stimme. Musik/Ambience werden gestreamt (nicht dekodiert).

## Formate

Pro Klang liefern (Reihenfolge = Praeferenz): **`.ogg` (Opus/Vorbis), `.m4a`
(AAC, Safari), `.mp3`**. Der Browser nimmt das erste unterstuetzte. Eine
`.ogg`+`.m4a` deckt alle aktuellen Browser inkl. iOS/Safari ab; `.mp3` als
universelle Sicherung.

## Audio-Sprites (kurze UI/SFX)

Viele kurze Klaenge koennen als EIN Sheet ausgeliefert werden (1 Request, 1
Decode): z. B. `sfx/ui_sheet.ogg` mit Regionen, die in `audio_manifest.json`
unter `sprites` als `marks{name:{start,dauer}}` (Sekunden) stehen. Einzelne
Sets referenzieren das Sheet per `{ "sprite": "sfx_ui", "marker": "befehl" }`.

## Einhaengen (Drop-a-file)

1. Datei in den passenden Ordner legen (`.ogg` bevorzugt, `.m4a` fuer Safari).
2. Falls noch kein Eintrag existiert: ein `AudioSet` + ggf. `AudioBinding` in
   `game/data/audio_manifest.json` ergaenzen (Schema: `docs/AUDIO_ENGINE.md`).

Ist der `stem` bereits in einem Set referenziert, **genuegt das Ablegen der
Datei** -- sie spielt am gebundenen Ereignis ohne Code-Aenderung. Fehlt eine
Datei, degradiert die Engine still (no-op). Pruefen mit `?audio-debug=1`.

## Git

Audiodateien sind Binaer-Assets. Werden sie von `.gitignore` erfasst, mit
`git add -f <pfad>` einchecken (wie die Grafik-Assets).
