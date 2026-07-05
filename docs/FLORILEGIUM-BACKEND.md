# FLORILEGIUM — BACKEND (Code9)

Gerüst ohne Inhalt. Datenstruktur, Validator, Audio-Generator. Code2 baut die
UI gegen den Schema-Vertrag in `data/florilegium/schema.json`.

## 1 · Schema-Entscheidungen

Datei: `hellmuth/data/florilegium/schema.json` (JSON-Schema Draft-07).
Pro Eintrag: `hellmuth/data/florilegium/<lang>/<category>/<slug>.json`.

| Feld | Typ | Constraints | Begründung |
|---|---|---|---|
| `id` | string | `^[a-z][a-z0-9_]{1,63}$` | lowercase\_snake (Repo-Regel `CLAUDE.md`). Eindeutig innerhalb der Kategorie. Dient als Slug für Pfade. |
| `category` | enum | `fraktionen`/`einheiten`/`gebaeude`/`substanzen`/`konzepte`/`welt` | Sechs feste Kategorien aus dem Brief. Bestimmt den Unterordner. |
| `title` | string | 1..120 | Lesbarer Folianten-Titel. |
| `order` | integer | ≥ 0 | Sortier-Index innerhalb der Kategorie. Lücken erlaubt. |
| `unlock.type` | enum | `always`/`build`/`kill`/`research` | Sichtbarkeits-Mechanik. `always` ⇒ ab Spielstart sichtbar. |
| `unlock.trigger` | string\|null | bei `always` darf `null` sein | ID des auslösenden Ereignisses (Gebäude/Einheit/Tech-Schlüssel). |
| `image` | string | `^florilegium/[a-z]+/[a-z0-9_]+\.png$` | Pfad-Konvention. Aufgelöst gegen `hellmuth/public/sprites/`. |
| `audio` | string | `^florilegium/[a-z]+/[a-z0-9_]+\.ogg$` | Pfad-Konvention, sprachneutral. Aufgelöst gegen `hellmuth/assets/voice/<lang>/`. |
| `text` | string | **200..2000 Zeichen** | Quelle für Eleven-Labs-TTS. Validator H22 erzwingt das Fenster. |
| `citation.source` | string\|null | `"Kreativer Suizid"` / `"Helmuths Buch"` / `null` | Buchquelle. `null` für Spielwelt-Einträge ohne Buch-Referenz. |
| `citation.page` | integer\|null | ≥ 1 | Seitennummer in der Quelle, oder `null`. |
| `tags` | string[] | je `^[a-z][a-z0-9_]{0,31}$`, ≤ 16, unique | Lowercase-Snake-Tags für Filter im UI. |

**Härtegrad:** `additionalProperties: false` auf allen Objekten — unbekannte
Felder sind ein FAIL. Damit kann der UI-Code (Code2) gegen ein festes Feldset
rendern, ohne Schemadrift.

**Sprachen:** Initial `de`. `en` rückwärtskompatibel, sobald Einträge vorliegen
(gleicher Validator, gleiche Schema-Datei).

## 2 · Werkzeug-Specs (H22, H23)

### H22 · `tools/florilegium_validate.py`

```
Aufruf:   python3 tools/florilegium_validate.py
          python3 tools/florilegium_validate.py data/florilegium/de
          python3 tools/florilegium_validate.py --strict-paths
Default:  data/florilegium/de/
```

Pure stdlib (kein `jsonschema`-Pip), Draft-07 hand-validiert. Pro Eintrag:
- Schema-konform (alle Pflichtfelder, Typen, Pattern, Enums)
- `category` aus erlaubter Liste; Ordnerpfad ↔ `category` müssen übereinstimmen
- `unlock.type` aus erlaubter Liste; `trigger` string oder null
- `text` ≥ 200 und ≤ 2000 Zeichen
- `image`-Pfad existiert unter `hellmuth/public/sprites/`
- `audio`-Pfad existiert unter `hellmuth/assets/voice/<lang>/`
- `id` einzigartig innerhalb `(lang, category)`

**Geruest-Phase:** Bei leerem Inhalts-Ordner Exit 0 mit Hinweis
*"PASS no entries yet, schema valid"*.

**Pfad-Warnungen:** Image-/Audio-Datei fehlt → `WARN` (Default). Mit
`--strict-paths` werden Warnungen zu `FAIL`. Default ist mild, damit das Gate
in der Geruest-Phase grün läuft, bevor Bilder/Audios gerendert sind.

### H23 · `tools/florilegium_voice.py`

```
Aufruf:   python3 tools/florilegium_voice.py data/florilegium/de/einheiten/apothekerin.json
          python3 tools/florilegium_voice.py data/florilegium/de
          python3 tools/florilegium_voice.py --dry-run data/florilegium/de
ENV:      ELEVENLABS_API_KEY (Pflicht)
          HELLMUTH_VOICE_ID  (Pflicht)
          FLORILEGIUM_MODEL  (optional, default 'eleven_multilingual_v2')
```

Vorrendert OGG via Eleven-Labs `POST /v1/text-to-speech/<voice_id>?output_format=ogg_44100`.

## 3 · Audio-Generator-Verhalten

**Voice-Settings** (Konstanten am Datei-Anfang, später anpassbar):

```
STABILITY        = 0.5
SIMILARITY_BOOST = 0.75
STYLE            = 0.0
USE_SPEAKER_BOOST = True
```

**Idempotenz:** SHA-256 über `voice-settings-signature || \x00 || text`.
State-Datei: `hellmuth/data/florilegium/.florilegium_audio_state.json` mit
Eintrag pro `<lang>/<audio-rel-path>`:

```json
{ "de/florilegium/einheiten/apothekerin.ogg": {
    "hash": "<sha256>", "bytes": 123456,
    "voice_id": "<id>", "model": "eleven_multilingual_v2",
    "settings": "s0.5-b0.75-y0.0-B"
} }
```

Liegt der Hash unverändert vor UND die OGG existiert → `SKIPPED`. Sonst neuer
API-Call, OGG geschrieben, State aktualisiert. Voice-Setting-Änderung
invalidiert den Hash automatisch — der nächste Lauf rendert neu.

**Budget-Cap:** 100 Einträge pro Lauf, hart. Mehr → `FAIL Budget-Cap verletzt`,
Abbruch ohne API-Call. Brief-Vorgabe.

**Output:** pro Eintrag `GENERATED` / `SKIPPED` / `FAILED` mit Pfad und
Detail, am Ende Sammelzeile. Exit 1 bei FAILED > 0, sonst 0.

**Dry-Run:** `--dry-run` schreibt keine Dateien und schickt KEINE API-Anfragen
(kein Budget-Verbrauch). Nützlich für CI und für den Werkzeug-Audit (H23 nutzt
`--dry-run` für seinen PASS-Test, damit `werkzeuge_check` keine Credits
verbrennt).

## 4 · Beispiel-Eintrag

```
hellmuth/data/florilegium/de/einheiten/apothekerin.json
hellmuth/public/sprites/florilegium/einheiten/apothekerin.png  (1x1 transparent, Platzhalter)
hellmuth/assets/voice/de/florilegium/einheiten/apothekerin.ogg  (von H23 gerendert)
```

JSON-Inhalt:

```json
{
  "id": "apothekerin",
  "category": "einheiten",
  "title": "Die Apothekerin",
  "order": 1,
  "unlock": { "type": "always", "trigger": null },
  "image": "florilegium/einheiten/apothekerin.png",
  "audio": "florilegium/einheiten/apothekerin.ogg",
  "text": "Die Apothekerin trägt drei Phiolen am Gürtel. Die erste ist immer leer. Helmuth schreibt in seinem Buch, wer destillieren will, muss zuerst lernen, wie Leere riecht. Wer das nicht ertragen kann, mischt Süßes hinein. Die Apothekerin trägt drei Phiolen, weil sie weiß, dass die Leere nicht eine Frage von einmal ist.",
  "citation": { "source": "Helmuths Buch", "page": null },
  "tags": ["hellmuth", "schluesseleinheit", "hellmuth"]
}
```

## 5 · Schnittstellen-Vertrag mit Code2

| Item | Pfad / Wert |
|---|---|
| **JSON-Schema (Vertrag)** | `hellmuth/data/florilegium/schema.json` |
| **Eintrags-Pfad** | `hellmuth/data/florilegium/<lang>/<category>/<slug>.json` |
| **Bild-Pfad-Wurzel** | `hellmuth/public/sprites/` — Eintrag liest `florilegium/<category>/<slug>.png` (sprachneutral) |
| **Audio-Pfad-Wurzel** | `hellmuth/assets/voice/<lang>/` — Eintrag liest `florilegium/<category>/<slug>.ogg` |
| **Sprachen** | Anfang `de`; `en` durch parallele Ordnerstruktur erweiterbar |
| **Sortierung im UI** | aufsteigend `order`; bei Gleichstand alphabetisch `title` |
| **Sichtbarkeit im UI** | `unlock.type == "always"` ⇒ stets sichtbar; sonst nach Spielzustand-Event (`build` / `kill` / `research` mit `trigger`) freischalten |
| **Validator-Pflicht** | Code2 darf voraussetzen, dass jeder Eintrag im Tree H22-grün ist (CI-Gate, siehe `docs/WERKZEUGE.md` Welle 5) |

Schema-Änderungen sind **breaking** für die UI. Mechanismus: PR mit
Schema-Diff plus Code2-Pendant in einem Sammel-Merge (siehe
`docs/PROZESS.md` Regel 1).

## 6 · Werkzeug-Audit-Eintrag

`docs/WERKZEUGE.md` Welle 5 listet H22 und H23 als Tools Nr. 22/23.
`tools/werkzeuge_check.py` enthält beide als `Hebel`-Einträge:

- **H22** (immer `active=True`): Validator-Roundtrip — Schema parsbar +
  `tools/florilegium_validate.py` Exit 0.
- **H23** (`active = bool(ELEVENLABS_API_KEY and HELLMUTH_VOICE_ID)`): ENV
  vorhanden → ACTIVE-PASS via `--dry-run`. Ohne ENV → RESERVED (nicht FAIL,
  Brief-Vorgabe).

Echter Audio-Round-Trip (Brief-Erfolgsmaßstab):

```
ELEVENLABS_API_KEY=... HELLMUTH_VOICE_ID=... \
  python3 tools/florilegium_voice.py data/florilegium/de/einheiten/apothekerin.json
ls hellmuth/assets/voice/de/florilegium/einheiten/apothekerin.ogg   # muss existieren
python3 tools/florilegium_validate.py --strict-paths                 # muss PASS
```
