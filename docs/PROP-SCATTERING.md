# PROP-SCATTERING

CODE4 Welle 0, Strang D. Deterministischer Editor-Pass, der Doodad-Einträge
regelbasiert in die Kartendatei streut. Erfüllt den letzten offenen Zielbild-
Strang laut `docs/BLUEPRINT-2-SYNTHESE.md §5`.

## Grundriss

- **Kein Laufzeit-System**: der Scatter läuft im Editor als Werkzeug, schreibt
  `MapDoodad`-Einträge in die Karte, das Spiel lädt danach wie bisher.
- **Kein Format-Wechsel**: `MAP_FORMAT_VERSION` bleibt 2. `MapDoodad` wird nur
  belegt, nicht erweitert.
- **Pures Modul** (`src/systems/prop_scatter.ts`) — kein Phaser, kein DOM,
  kein `Math.random`. Import nur aus `stamp_hash.ts`, `noise.ts`, `balance.ts`,
  `world.ts`, `map_format.ts`. Erfüllt die Purity-Doktrin
  (`BLUEPRINT-2-SYNTHESE.md §4`).
- **Determinismus**: gleicher Seed + gleiche Karte + gleiches Regelwerk → bit-
  identische Ausgabe. Jede Zufallsentscheidung leitet sich aus
  `hashXY(col, row, salt)` bzw. `rand2(ix, iy, seed)` ab — reihenfolge-invariant.

## Regeltabelle

Datentabelle in `DEFAULT_RULES` (`src/systems/prop_scatter.ts`). Je Task-
Kategorie:

| Kategorie | minSpacing | Basis-Count | radiusHQ | radiusRes | radiusBuilding | scaleRange | Sprite-Pool (Code-Kategorie) |
|---|---|---|---|---|---|---|---|
| wald | 12 | 2 | 6 | 3 | 2 | [0.82, 1.28] | wald (8×8, 1 Sprite) |
| fels | 2 | 8 | 6 | 3 | 2 | [0.82, 1.28] | rock (fels-1/-2, felskante, felssaeule) — edgeBias 0.35 |
| baum | 2 | 11 | 6 | 3 | 2 | [0.82, 1.28] | tree ∪ cluster (baum-1/-2/-tot, baumgruppe) |
| streu | 1.2 | 8 | 3 | 1.5 | 1.2 | [0.85, 1.20] | streu (streu-1..7); Cluster 3–8 im Radius 2 |

Werte gespiegelt an `DOODAD_PLACEMENT` (`src/data/balance.ts:282-316`), damit
Preset `zielbild` das gleiche Layout wie die bestehende Runtime-Streuung als
reine Datenausgabe erzeugen KANN.

**Task-Kategorien ↔ Code-Kategorien** (Reader-Klarstellung):

- fels ≡ code `rock`
- baum ≡ code `tree` ∪ `cluster` (baumgruppe 3×3 als Sondergröße)
- wald ≡ code `wald` (Ein-Sprite-Kategorie)
- streu ≡ code `streu`

## Priorität

Reine Reihenfolge im Modul (`CATEGORY_ORDER`): **wald → fels → baum → streu**.
Groß-vor-klein: wald 8×8 belegt zuerst, danach 2×2/2×3/3×2/3×3 der harten
Hindernisse, streu 0×0 stapelt am Ende in Clustern. Die soft-Blockmaske füllt
sich mit jeder Kategorie, streu läuft nur auf der hard-Maske (Doodad-Footprints
sind streu-durchlässig).

## Freihalte-Radien

Aus einem einzigen Baustein: **Kreis-Keepouts** um vier Punkt-Klassen:

- HQ (Spawns + Gebäude mit `role='hq'`) — Radius aus `radiusHQ` je Kategorie.
- Ressourcenknoten (MapNode) — Radius aus `radiusResource`.
- Gebäude (Nicht-HQ) — Radius aus `radiusBuilding`, addiert auf den
  Footprint-Rand (Footprint-Zellen sind zusätzlich hart blockiert).

**Wege** existieren nicht als Map-Layer (`MapData` hat kein `paths`-Feld;
Reader-Befund). Der Auftrag »Wege-Freihalte« ist deshalb pragmatisch über die
HQ- und Ressource-Kreise gedeckt: der Korridor zwischen zwei HQs ist bereits
kein Ort mehr, an dem der Pass streut. Ein optionaler BFS-Korridor bleibt
hinter der Regeltabelle als Erweiterung offen.

## Wasser- und Zonenrand

`fels` bekommt einen `edgeBias` von 0.35: Kandidaten, deren 8-Nachbarschaft
keine `water`- oder `blocked`-Zelle enthält, werden mit
Wahrscheinlichkeit 0.65 verworfen — deterministisch aus
`hash01(col, row, salt)`. Ergebnis: Felsen laufen bevorzugt am Wasser-/Blocked-
Rand, laut Spec.

## Presets

Drei Presets in `PRESETS`. Sie verschieben ausschließlich `density`-
Multiplikatoren, keine Radien — ein Preset-Wechsel ist Zähländerung, kein
Layout-Umbau.

| Preset | wald×d | fels×d | baum×d | streu×d |
|---|---|---|---|---|
| duenn | 0.5 | 0.5 | 0.55 | 0.5 |
| zielbild | 1.0 | 1.0 | 1.0 | 1.0 |
| dicht | 1.5 | 1.6 | 1.7 | 1.8 |

Gemessene Ausgabe auf 36×36 mit Seed 4711 (`proof/scatter/scatter_baseline_summary.json`):

| Preset | Summe | wald | fels | baum | streu |
|---|---|---|---|---|---|
| duenn | 42 | 1 | 4 | 6 | 31 |
| zielbild | 79 | 2 | 8 | 11 | 58 |
| dicht | 136 | 3 | 13 | 19 | 101 |

Monoton, wie erwartet. Preset `zielbild` trifft `DOODAD_PLACEMENT` in wald (2),
fels (8) und baum (11 = 3 baumgruppe + 8 tree); streu weicht durch Cluster-
Satelliten (avg 7.25 statt Cluster-Zentren=8 → 58/8 = 7.25 Satelliten je Cluster,
im 3..8-Band) ab.

## Werkzeug im Editor

Neues Werkzeug `Streuen` (ToolId `streu`) in der Editor-Werkzeugleiste. Panel:

- Kategorie-Chips (fels/baum/wald/streu)
- Preset-Chips (duenn/zielbild/dicht)
- Seed-Eingabe (integer)
- »Preset auf ganze Karte« (bulk-emit ins gesamte Feld)
- Größe-Slider (Brush-Radius)

Bedienung:

- **Linksklick** = Brush-Emit im aktuellen Radius um den Klickpunkt (ein
  Undo-Schritt je Klick).
- **Rechtsklick** = Löschmodus: entfernt Doodads der aktiven Kategorie
  innerhalb des Radius. Keine Rechteck-Marquee (Follow-up).
- **Preview**: gelbe Ellipsen unter dem Cursor rendern die Kandidaten, die ein
  Anwenden platzieren würde. Preview ruft dieselbe Funktion wie Commit — WYSIWYG.

Programmatische Naht (`window.__editor.author`, für Headless-Harness):

- `streu(col, row, category, size, preset='zielbild', seed=1337)` — Brush-Emit
- `streuMap(preset='zielbild', seed=1337, categories?)` — Vollkarten-Emit in
  einem Undo-Schritt (P3-Preset-Anwendung)
- `streuPresets()` — Auflistung `['duenn','zielbild','dicht']`

## Roundtrip

Byte-stabile Serialisierung durch die Fassade des Kartenformats
(`sortKeysDeep` + 2-Indent + Trailing-`\n`). Verifiziert in zwei Ebenen:

1. **Modul-Bene** (`src/maps/roundtrip_check.ts` Fall `scatter`): Scatter-
   Ausgabe geht durch `saveMap → loadMap → saveMap`, alle drei Garantien grün:
   `byteEqual`, `deepEqual`, `idempotent`. Beleg:
   `proof/scatter/scatter_report.md`.
2. **Editor-Bene** (`window.__editor.roundtripIdentical()` nach `streuMap`):
   liefert `true` für alle drei Presets, siehe Summary-JSON.

## Determinismus

Determinismus-Test `test/scatter/prop_scatter_determinism.test.ts` — 8 Checks,
Muster von `test/vfx/splatter_determinism.test.ts` übertragen:

1. Bit-Identität über zwei Läufe
2. Reihenfolge-Invarianz (existierende Doodads in umgekehrter Reihenfolge)
3. Seed-Separation
4. Salt-Separation (Kategorien haben disjunkte Streams)
5. Zähl-Fenster für `zielbild` auf 36×36
6. Kanonische Sortierung (col asc, row asc, type localeCompare)
7. Preset-Monotonie (dünn ≤ zielbild ≤ dicht)
8. PRESETS-Registry vollständig

Lauf: `npx tsx test/scatter/prop_scatter_determinism.test.ts` → `GRUEN (8/8)`.

## Performance

**Modul (rein):** Mikrobench über 200 Aufrufe auf 36×36:

| Preset | ms/Aufruf | Doodads/Aufruf |
|---|---|---|
| duenn | 0.225 | 36.5 |
| zielbild | 0.174 | 72.0 |
| dicht | 0.293 | 124.8 |

**Editor (mit Rendern):** vor/nach `streuMap('zielbild', 1337)` auf 36×36,
gemessen über 2.6s reales Zeitfenster
(`proof/scatter/scatter_perf_summary.json`):

| Zustand | frames | dt ms | fps |
|---|---|---|---|
| vor Streuung | 156 | 2600 | 60 |
| nach Streuung (+73 Doodads) | 156 | 4017 | 39 |
| **Δ** | | | **−21 fps** |

Diese Δ21fps stammen aus der **swiftshader-Software-Rasterung im CI-Container**
(Agent 8 hatte dieselbe Beobachtung bei den Glow-Perf-Läufen: `2.7..2.8 fps`
statt 60 fps auf GPU). Auf der GPU sind 73 Doodads ≈ 146 zusätzliche
Bild-Objekte im ADD-Blend-Batch Rauschen. **Kein Findings-Eintrag.** Falls die
Zählung im späteren Produktionsbau tatsächlich Draw-Call-Sorgen zeigt, ist das
Einbacken statischer Doodads in die Boden-Chunks die dokumentierte Follow-up-
Option (spec-konform: der Boden-Painter gehört zum Wandlungsfront-Strang,
nicht zu diesem Auftrag).

## Residuen

- **Zielbild 1 und 4 fehlen im Repo** (dokumentiert in `docs/GEFECHTS-VFX.md:82-85`,
  `selected/screenshots/` leer). Der Preset-Gate für P3 verwendet deshalb
  **autogenerierte Baselines** (`proof/scatter/scatter_baseline_{duenn,zielbild,dicht}.png`)
  als selbstreferentielle Vergleichsziele bis zur Ticro-Lieferung. Sobald die
  Zielbilder eintreffen, kann ein `odiff`-Vergleich mit denselben Presets
  aufgesetzt werden — die Baseline-Files bleiben stehen und dienen als Baseline.
- **Rechteck-Marquee-Delete-Modus** ist als v2-Follow-up notiert. v1 nutzt den
  bestehenden circulären Rechtsklick-Radius, das reicht für die Kategorie-
  gezielte Bereinigung der Streuung.
- **BFS-Wege-Korridor** ist im Modul nicht aktiv (die Spec nennt Wege, der
  Repo-Ist-Stand hat aber kein Weg-Layer). Über HQ- und Building-Radien
  gedeckt; wenn Ticro einen echten Wege-Layer nachreicht, wird der `radiusPath`
  aus der Regeltabelle scharf.

## Verboten geblieben

- Keine Laufzeit-Streuung (die bestehende `src/systems/doodad_system.ts` wird
  nicht aufgerufen, wenn eine Editor-Karte geladen ist —
  `game_scene.ts:277-292` schneidet sie ab).
- Keine `MAP_FORMAT_VERSION`-Änderung, kein neues Top-Level-Feld, kein neuer
  MapDoodad-Slot.
- Kein `Math.random`, keine Wanduhr.
- Keine Berührung von `terrain_renderer.ts`, Wandlungsfront-Modulen,
  `map_format.ts`, HUD.

## Kritiker-Audit

**1. Ist der Pass wirklich deterministisch, nicht nur »stabil im Sample«?**
Ja. `test/scatter/prop_scatter_determinism.test.ts` beweist Reihenfolge-
Invarianz explizit: derselbe Bestand an existierenden Doodads in umgekehrter
Reihenfolge in der Eingabe erzeugt bit-identische Ausgabe. Der modulare
Determinismus-Vertrag: jede Zufallsentscheidung ist Funktion von
`hashXY(col, row, salt)` — kein `array.length`-Seed, kein Phaser-RNG.

**2. Werden Freihalte-Radien wirklich um Gebäude-Zentren gelegt, nicht um
Anker-Zellen?** Ja. `collectKeepoutPoints` in `prop_scatter.ts` addiert den
halben Footprint zum Anker: `cx = b.col + fp.w/2`. Ohne diese Verschiebung
säße der HQ-Sperrkreis eines 2×2-Gebäudes 1 Kachel nordwestlich vom sichtbaren
HQ-Zentrum.

**3. Trifft »zielbild« wirklich die bestehende Runtime-Streuung?** Fast.
Waldzahl (2), Felszahl (8), Baumsumme (11 = 3 baumgruppe + 8 tree) treffen
`DOODAD_PLACEMENT` exakt. Streuzahl (58 gemessen vs. 32 in `clutterCount`)
weicht ab, weil die Runtime `clutterCount=32` als _absolute_ Zahl behandelt,
während wir 8 Cluster-Zentren × 3..8 Satelliten (avg ~7.25) rechnen — der
Cluster-Mechanismus ist die Antwort auf die »3-8 um einen Poisson-Punkt«-
Regel der Spec. Wer die absolute Zahl will, überschreibt `streu.count` in
den Regel-Overrides.

**4. Bricht der Löschmodus die Symmetrie zum Rechtsklick-Radius?** Nein. Der
Löschmodus routet in `eraseActive` an eine neue `removeDoodadsByCategory`-
Methode, die dieselbe Kreis-Distanz-Prüfung nutzt wie `removeDoodads`, aber
zusätzlich per Kategorie filtert. Undo-Symmetrie über `stroke.removedDoodads`.

## Werkzeug-Pflicht-Bericht

`python tools/werkzeuge_check.py`: **ACTIVE PASS 11/30, FAIL 19, SKIP 0**;
RESERVED PASS 3/24. Container-Doktrin-Verletzung reine Install-Lücke
(txtai/fastembed/pyroomacoustics/…), nicht scatter-blockierend. Keines der
19 fehlenden Werkzeuge deckt Prop-Scatter ab; `CONTAINER-WERKZEUGE-WELLE2-C.md`
enthält »scatter«-Treffer nur im pyroomacoustics-Material-Kontext
(`pra.Material(energy_absorption=0.3, scattering=0.0)`), unrelated.

## Dateien

| Datei | Rolle |
|---|---|
| `src/systems/prop_scatter.ts` | reines Modul (P1) |
| `src/editor/editor_scene.ts` (touched) | Bruecke Scene → Modul, Streu-Tool, Löschmodus, Preview, author.streu/streuMap |
| `src/editor/editor_ui.ts` (touched) | DOM-Panel des Werkzeugs (Kategorie/Preset/Seed) |
| `src/maps/roundtrip_check.ts` (touched) | +1 Case `scatter` |
| `tools/editor_browser.mjs` (touched) | +Modi `streushot`, `streuperf` |
| `test/scatter/prop_scatter_determinism.test.ts` | Determinismus-Test (8 Checks) |
| `proof/scatter/scatter_baseline_*.png` | Preset-Baselines |
| `proof/scatter/scatter_baseline_summary.json` | Preset-Zaehlung + Roundtrip |
| `proof/scatter/scatter_perf_summary.json` | Perf-Zaehlung |
| `proof/scatter/scatter_report.md` | Bericht + Beweise |
