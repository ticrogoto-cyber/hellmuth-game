# CLAUDE.md — HELLMUTH

Anweisungen für jede Claude-Session, die am Spiel HELLMUTH arbeitet. Vor jeder
Bearbeitung lesen. Diese Datei ist die Wurzel-Wahrheit des Spielprojekts. Alles
zu HELLMUTH liegt ausschließlich unter `hellmuth/`. Der Rest des umgebenden
Repos (Vokabular, Buch, Hellmuth-Soda-Site) wird hier nicht angefasst.

## Was HELLMUTH ist

HELLMUTH ist ein Browser-RTS über einen Krieg zwischen zwei Fraktionen:

- **DIE HELLMUTH** — ein apothekarisch-alchemistischer Orden.
- **DIE MODERAT** — eine industrielle Zuckermaschine.

## Richtung (verbindlich)

> Es gibt **genau eine** Richtungs-Wahrheit: **`docs/DIRECTION.md`**. Verbindlich
> sind **`BLUEPRINT-V2-NIFTY-PLUS-ASSETS.md`** plus **`asset-spec.md`**.
> Wo Aussagen in dieser Datei `DIRECTION.md` widersprechen, gewinnt
> `DIRECTION.md` (jüngstes vom Menschen bestätigtes Dokument).

## Stack

- **Phaser 3** als Engine (2D). Maßgeblich ist der lauffähige Sprite-Build
  (`src/`). Der Babylon-Track (`proof3d/`) ist **eingefroren**.
- **TypeScript** als Sprache.
- **Vite** als Build- und Dev-Server.
- **Browser zuerst.** Auslieferung: Electron + steamworks.js (DIRECTION.md ist maßgeblich; Entscheid Blueprint 2 A1).

Kein fremdes Spiel geforkt; eigener Code.

## Heilige Reihenfolge

Zuerst ein spielbarer Loop mit Platzhalter-Formen. Erst danach echte Kunst und
Ton. **Niemals Kunst vor Loop.** Wer die Reihenfolge umdreht, baut Deko um ein
Loch.

## Asset-Wahrheit

Maßgeblich ist **`asset-spec.md`** (Projektion, Normalisierungspass, Spec-Gesetz)
plus **`BLUEPRINT-V2-NIFTY-PLUS-ASSETS.md`**. Kohärenz kommt aus der einen
gemeinsamen Spezifikation, nicht aus einem 3D-Shader. Zielbild = die drei
Konzept-Screenshots. Kein Asset gelangt ohne Spec-Konformität und
Normalisierungspass (`tools/normalize_asset.py`) ins Spiel.

## Recht und Stil

- Keine Franchise-Bezüge in Namen, Code oder Bildsprache. Kein
  Warcraft-Remaster-Look.
- Eigener apothekarisch-alchemistischer Stil, eigene Assets.
- Eigene Assets bleiben Eigentum. Kein fremder Spielcode übernommen.

## Dateiregeln

- Dateinamen immer `lowercase_snake_case`.
- Rohdateien (`raw/`) nie überschreiben.
- Offene Punkte und getroffene Annahmen nach `TODO.md`, nicht raten.

## Verzeichnis-Kanon

- `src/` — Spielcode (Scenes, Systeme, Entities, UI, Util, Datenlader).
- `game/data/` — JSON-Datendefinitionen (Ressourcen, Einheiten, Gebäude, Tech).
- `game/assets/` — im Spiel genutzte Assets (vorerst leer, Platzhalter im Code).
- `docs/` — dauerhafte Projektdokumentation. Bei Unsicherheit dort nachsehen.
- `raw/higgsfield/` — unbearbeitete Generierungen, niemals überschreiben.
- `selected/` — kuratierte Auswahl aus `raw/`.
- `processed/` — finale, web- bzw. spielfertige Ableitungen.
- `tools/` — Hilfsskripte.

Siehe `docs/NAMING_CANON.md` für die verbindliche Benennung aller Fraktionen,
Gebäude, Einheiten, Ressourcen und Tech-Stufen.

## Auftrags-Disziplin

Jeder neue Code-Auftrag (Code1..Code12, Solutions, Fable, Drittinstanzen) folgt
der Vorlage **`docs/AUFTRAG-VORLAGE.md`** (Pflicht-Vorab-Block:
`../KONVENTIONEN.md` + `docs/CONTAINER-WERKZEUGE.md` lesen, bevor irgendetwas
Externes vorgeschlagen wird). Die Container-Werkzeuge ersetzen Bezahl-Tools an
gemessenen Stellen — siehe Mini-Cheat-Sheet in der Vorlage und die
elf-Hebel-Liste in `../KONVENTIONEN.md`.
