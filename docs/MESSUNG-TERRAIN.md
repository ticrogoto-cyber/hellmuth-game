# MESSBERICHT — TERRAIN-IST-STAND (CODE9)

**Branch-Spitze:** `claude/quirky-fermat-8rewv0` @ `bc248257a214597340738a9718d294d99a83de2b` (`bc24825`, »Knockback Welle 2 — §10-Demo-Assertion, bpy-Anims, Doku, KB-H19«, 2026-06-19); lokal identisch mit origin zum Messzeitpunkt. `git log --oneline -5`: `bc24825` · `3951008` Retarget Hip-Copy-Location · `c51c78d` Solutions-Quelle auf die Linie · `476fe1c` proof: refresh menu_main.png · `f21b845` Schreibweise-Kanon.

**Messdatum:** 2026-07-02 (21:13 UTC).

**Gesamtzahl gelesener Dateien:** 92 (Vereinigungsmenge über sechs parallele Mess-Läufe; jede Fundstelle wurde anschließend von einer zweiten Instanz adversarial gegen die Datei geprüft — Zeilen und Wortlaut unten sind die geprüfte, korrigierte Fassung).

---

## Block A — DIRECTION.md, Stand V3

### A1 — Version an der Branch-Spitze

Ein Datum oder eine explizite Versionsnummer im Dateitext: **NICHT VORHANDEN.** Die Datei (64 Zeilen) markiert ihren Stand nur indirekt: `hellmuth/docs/DIRECTION.md:1` »# DIRECTION.md — die eine Richtungs-Wahrheit (verbindlich)«; Zeilen 3–6: »Dies ist das **jüngste vom Menschen bestätigte** Richtungsdokument. … Bei Konflikt zwischen Richtungsdokumenten gilt das jüngste vom Menschen bestätigte — und das ist **dieses**.«; Zeile 21 »### Kerngesetz V3«; Zeilen 10–12 setzen `BLUEPRINT-V3-HUD-EDITOR.md` als ranghöchst (»Bei Konflikt gilt V3«).

Git-Beleg: `git log --follow -- hellmuth/docs/DIRECTION.md` kennt **genau einen** Commit — `e9be274` (2026-06-12, »Loop-Blaupause als Werkzeug«, ein Großimport, der u. a. CLAUDE.md, .mcp.json, Workflows, PDFs, Fonts einbrachte). Die Datei ist seitdem bis zur Spitze `bc24825` unverändert. Der Stand an der Spitze ist die V3-referenzierende Fassung.

### A2 — Festlegungen zum Terrain-Rendering

DIRECTION.md selbst enthält genau eine Terrain-Passage, `DIRECTION.md:21–26` (Kerngesetz V3):

> »Kein Bild ist je größer als ein Baustein. Struktur, Layout und Verhalten leben ausschließlich in Code und Daten. … Karte = Daten (`map.hellmuth.json`) plus In-Engine-Editor; Megatextur nur noch als Backdrop/Fallback im Code.«

Zu Tilemap-Ansatz, Chunk-System, Layer-Aufbau, Tile-Größe schweigt DIRECTION.md: **NICHT VORHANDEN.** Die Festlegungen stehen in den von DIRECTION.md:10–15 für verbindlich erklärten Dateien:

- **`BLUEPRINT-V3-HUD-EDITOR.md`** (ranghöchst): Z. 73 »In-Engine, nicht Tiled. … dieselbe Iso-Mathematik (160×96) …«; Z. 74 definiert `map.hellmuth.json` mit den Layern **Splat-Layer (Terrain-Gewichte pro Zelle), Doodad-Liste, Wasser-Layer, Ressourcen/Vorkommen, Spawnpunkte, Kollisions-Overrides, Metadaten** (»Das Spiel lädt exakt dieses Format, kein Importer«); Z. 75 »Megatextur-Erbe: Chunk-Renderer und Kollisionsmasken-Import bleiben im Code … nicht mehr als Autorenweg«; Z. 79–84: Terrainmalen über **Gewichtsmischung statt diskreter Kacheltypen**, pro Bodentyp eine nahtlose Textur, Übergangskanten mit **prozeduralen Noise-Masken** gebrochen, Z. 84 »Gerendert wird das Komposit in Boden-Chunks unter der Sprite-Ebene (vorhandener Chunk-Renderer)«; Z. 121 »Terrain-Texturen (nahtlos, **1024×1024**, je 2 Varianten …)«; Z. 129 Klippen auf »160×96-Fußraster«.
- **`BLUEPRINT-V2-NIFTY-PLUS-ASSETS.md`**: Z. 34 »Tile-Größe: 1 Bodentile = **160×96 px** bei Zoom 1 (Verhältnis 5:3, festgelegt, wird nie wieder angefasst)«; Z. 97 Chunk-Rendering + Kachel-Fallback (»4–6 Varianten pro Typ … System-Fallback, Minimap-Basis, Prototyping«).
- **`asset-spec.md`**: Z. 19–21 und 34–35 (Tile 160×96, Kantenwinkel `atan(0.6) ≈ 30,96°`, »nie die Kamera«); Z. 87 Ordner `ground/`.

Eine konkrete **Chunk-Pixelgröße oder Zellenzahl pro Chunk ist in keiner der vier Dokumentdateien beziffert** — NICHT VORHANDEN (im Code dagegen schon, siehe B3).

### A3 — Territorium / Korruption / Creep / Bodenkontrolle

In DIRECTION.md: **NICHT VORHANDEN** (Volltext gelesen). Repo-weite Suche (`territorium|korruption|corruption|creep|bodenkontrolle|influence`, case-insensitive) über die **git-getrackten** Markdown-Dateien unter `hellmuth/`: genau 2 Treffer, beide das Wort »Influencer« in einem Audio-Signet-Namen — `docs/SOUND-RECHERCHE.md:324` und `:710`. Weitere Muster-Treffer existieren nur in gitignorierten Phaser-Vendor-Changelogs unter `node_modules/` (5 Stück, sämtlich Drittanbieter-Text). Ein Terrain-Kontroll-, Creep- oder Korruptions-**Konzept** ist in sämtlichen Projektdokumenten **NICHT VORHANDEN.** (Der nächste Verwandte im *Code* ist die Terrainwandlung, siehe B5.)

### A4 — Außer Kraft gesetzte V2-Teile, unklare Reste

Explizit ersetzt (`DIRECTION.md:10–12`, wortgleich `BLUEPRINT-V3:3`): **der Megatextur-Kartenweg (V2 §5.1)** und **der bildbasierte HUD-Ansatz (Auftrag §7)** — »Bei Konflikt gilt V3.« Weiter gültig laut `DIRECTION.md:13–14`: V2-Mechanik, Einheiten-Pipeline, Effekt-Architektur, Fraktions-/Asset-Gesetze.

Unklare V2-Reste → als OFFENE WIDERSPRÜCHE Nr. 1–5 am Berichtsende gelistet (Branch-Name, fehlende VISUAL-TARGET-ANWEISUNG.md, unmarkierter §5.1-Text, Electron vs. Tauri, AP7 vs. V3-H1–H7).

---

## Block B — Terrain-Code im Repo

### B1 — Dateien, die Boden rendern

Kern-Renderpfade unter `hellmuth/src/`:

1. `src/editor/terrain_render.ts` (760 Z.) — Klasse `TerrainRenderer` (Z. 76): Splat-Boden als geschichtete Canvas-Chunk-Texturen. Kopfkommentar Z. 1–6 verbatim: »Splat-Terrain-Renderer (Blueprint V3 §2.2). Boden wird NICHT aus sichtbaren Einzelkacheln gesetzt, sondern als geschichtete Texturebenen komponiert … Dasselbe System nutzt der Editor zum Malen UND das Spiel beim Laden jeder Karte — ein System, nicht zwei.«
2. `src/scenes/game_scene.ts` — drei Boden-Zweige: `buildEditorTerrain()` (442–448, Splat für Editor-Karten); `drawTerrain()` (524–548, Fallback als EIN `tileSprite` mit Fraktionstextur); `drawTerrainPlaceholder()` (586–607, Schachbrett-Diamanten). Weiche in `create()` 222–235.
3. `src/systems/map_texture.ts` — `renderMegatexture()` (65–95): ein Karten-PNG als unterste Ebene in ≤2048-px-Chunks; plus `importCollisionMask()` (118–155).
4. `src/editor/terrain_assets.ts` (364 Z.) — Boden-Quellen: `GROUND_SORTS` (60–98), `DECAL_SETS` (100–120), Loader (143–156), Registry (258–288), prozedurale Platzhalter-Variante (197–237), Decal-Freistellung (336–362); rendert nicht selbst.
5. `src/editor/terrain_transform.ts` (156 Z.) — `TerrainTransform`: fließende Laufzeit-Umfärbung über ein NICHT gespeichertes Gewichts-Overlay (`TerrainRenderer.delta`); »Null zusätzliche RenderTexture → 0 MB« (Z. 1–6).
6. `src/editor/editor_scene.ts` (1284 Z.) — Editor instanziiert denselben Splat-Boden (237–238), Pinsel `paintTerrain()` (587–604), Radierer (643–661).
7. `src/editor/map_view.ts` — `drawDecal()` (95–109) setzt Boden-Decals; `renderMapContent()` (67–87) für Editor UND Spiel.
8. `src/editor/noise.ts` (169 Z.) — deterministisches Wert-Rauschen für die Terrain-Masken.

Boden-NAHE Ebenen (über dem Boden, nicht der Boden): `util/foundation.ts` (Fundamentflecken, 29–75), `util/ground_aura.ts` (Kontaktschatten, 56–90), `systems/doodad_system.ts` (Streu/Hindernisse), `editor/fog_render.ts` (Welt-Nebel, Tiefe −67000..−64000), `fx/ground_mist.ts` (Default AUS), `systems/blood_system.ts` (Blut-RT »zwischen Terrain und Decals«), `systems/veil_system.ts` (FoW-Schleier, −60000), `editor/gate.ts` (misst nur).

### B2 — Technischer Aufbau der »Tilemap«

**Phaser-Tilemap: NICHT VORHANDEN** (Grep `Tilemap|tilemap` über `src/` = 0 Treffer); auch kein Sprite-Grid aus Einzelkacheln. Drei Pfade:

- **(a) Splat-Renderer** (Editor-Karten + Editor): pro Chunk ein `HTMLCanvasElement` (`mkCanvas` 136–141, `buildChunks` 169–187), registriert per `textures.addCanvas` (369), platziert als `add.image(...).setDepth(TERRAIN_LAYER_DEPTH)` (373–376; `TERRAIN_LAYER_DEPTH = -99000`, Z. 24). Komposition per **Canvas2D-Painter, ausdrücklich kein WebGL-Shader** (Z. 8–11: Textur füllen → per `destination-in` durch die Maske stanzen → per `source-over` stapeln). Kernmethoden: `compositeChunk()` 444–476, `fillSortVariants()` 484–508, `buildFrayedMask()` 620–638, `applyToneJitter()` 645–669. Update: `markDirtyWorldRect()` 421–428 → `recompositeDirty()` 431–442 → `refreshCanvasTexture()` mit `tex.refresh()` 672–676. Datenmodell: `weights: Float32Array` Layout `[(row*cols+col)*nSorts+k]` (82–83), Glättungskopie `smooth` (84–86), Laufzeit-Overlay `delta` (87–89).
- **(b) Megatextur-Pfad** (Nicht-Editor-Karten): `renderMegatexture()` zerlegt EIN PNG in Frames (`tex.add`, 85) als Images auf `MAP_DEPTH = -99000` (21), `MAX_CHUNK = 2048` (23–24). Die Assets `sprites/maps/neutral.png`/`neutral_mask.png` (sprites.ts:21–22) sind **NICHT VORHANDEN** → dieser Pfad läuft real als No-op (Guard Z. 70).
- **(c) Fallback-Boden** (Nicht-Editor, aktiv): `drawTerrain()` legt EIN `tileSprite` bei Depth −100000 (543–547) mit `TERRAIN_SPRITE = { klarheit: "boden-klarheit", generik: "boden-generik" }` (sprites.ts:183–186); Kachelmaßstab aus `TERRAIN.groundCoverageWorldPx / texW` (539–540); optionale Mipmaps per rohem WebGL2 (`tryGroundMipmaps` 557–584); ohne Textur Diamant-Platzhalter (586–607, Farben game_scene.ts:80–81).

Einzige RenderTexture im Umfeld ist das Blut, nicht der Boden (blood_system.ts:19–21: »Terrain-Chunks sind CanvasTexture → rt.draw darauf unmöglich; Blut bekommt daher seine EIGENE RT«).

### B3 — Tile-Größe, Karten-Dimensionen, Chunk/Culling

- **Tile:** `TILE_WIDTH = 160` (`src/util/iso.ts:8`), `TILE_HEIGHT = 96` (iso.ts:11); iso.ts:3–5: »5:3-Diamantprojektion (asset-spec.md §1 …)«.
- **Karte:** `GRID_COLS = 36`, `GRID_ROWS = 36` (`src/util/world.ts:16–17`). Loader-Klemme 1..512 mit Default 36 (map_format.ts:215–216); Editor-URL-Klemme 8..256, Default 36 (editor_scene.ts:1275–1278). Das Spiel verwirft Editor-Karten ≠ 36×36: `if (map.cols !== GRID_COLS || map.rows !== GRID_ROWS) return undefined` (game_scene.ts:403). Der Renderer selbst ist größenagnostisch (terrain_render.ts:123–124). Ausgelieferte Karten: leer/offen/dicht alle 36×36 (gemessen).
- **Chunks (Splat):** `CHUNK = 512` Welt-Px je Kante (terrain_render.ts:26); `MASK_RES = 256` (27); `REGION_VARMASK_RES = 96` (33); Ton-Jitter-Raster 48 (646). Für 36×36 rechnerisch 5760×3456 Welt-Px → 12×7 = **84 Chunks** (abgeleitet, keine Code-Konstante; Laufzeit via `chunkCount()` 416–418).
- **Chunks (Megatextur):** `MAX_CHUNK = 2048` Quelltextur-Px (map_texture.ts:23–24).
- **Culling:** `updateCull(cam)` (388–406), Rechteck-Overlap gegen `cam.worldView` mit 1-Chunk-Marge (400), gedrosselt auf >½-Chunk-Bewegung/Zoomwechsel (390–393); Aufruf je Frame (game_scene.ts:1166; editor_scene.ts:500). Doc 381–386: »Bei 36×36 sind alle sichtbar (No-op); zahlt sich bei großen Karten aus.«
- **Dirty-Rebake:** Wandlungs-Tick `TICK_MS = 200`, `GROW_PER_TICK = 0.9` Kacheln (terrain_transform.ts:23–24); Rebake nur dirty Chunks (game_scene.ts:1158–1162).
- **Tiefenstaffel:** TileSprite/Platzhalter −100000 · Splat/Megatextur −99000 · Fundament −95000 · Streu −90000 · Boden-Aura −80000 (game_scene.ts:546; terrain_render.ts:24; map_texture.ts:21; world.ts:41/39/45).

### B4 — Bodensorten und Übergänge

**Vier Sorten** in `GROUND_SORTS` (terrain_assets.ts:60–98): `erde-tot` / »Tote Erde« / hint `generik` / fallback `#3b342b` (62–68) · `sandlehm` / hint `klarheit` (70–76) · `steppe` / hint `neutral` (78–84) · `klarflur` / »Klarflur (Platzhalter)« / hint `klarheit` / `procedural: true` (89–97; Kommentar 85–88: »KLARHEIT-Zielsorte der Terrainwandlung … PROZEDURALER Platzhalter (kein KREA-PNG); Ticro liefert die echte Bodentextur später«). Je Sorte 4 Varianten-Dateien; PNGs für erde-tot/sandlehm/steppe existieren (12 Dateien), klarflur-PNGs **NICHT VORHANDEN** (prozedural, 197–237). Dazu 2 Decal-Sätze (`moos` neutral, `sirup` generik; 100–120) — Dekor, keine Sorte. Karten-Palette: `map.groundTypes` + fehlende Sorten angehängt (terrain_render.ts:115–116); gemessene Karten: offen/dicht = `["erde-tot","sandlehm","steppe"]`, leer = `["neutral","klarheit","generik"]`. Fallback-Pfad kennt zusätzlich die 2 Fraktions-Kachelböden (`TERRAIN_SPRITE`).

**Übergänge: weiche Splat-Blend-Masken — kein Autotiling, keine Übergangs-Tiles, keine harten Kanten.** Kontinuierliche Gewichte pro Zelle (`addWeight` 232–240); 3×3-mittengewichtete Glättung (`rebuildSmooth` 285–310); bilineares Sampling (340–353); Rand-Ausfransung per zweiskaligem Domain-Warp + smoothstep-Feather (`frayedCoverage` 591–601; `TILE_FREQ = 1/(6*TILE_WIDTH)`, `FINE_FREQ = 1/(2*TILE_WIDTH)` 46–47; `WARP_DIST = 0.6*TILE_WIDTH`, `WARP_FINE = 0.15*TILE_WIDTH` 51–52; `FEATHER = 0.1` 56); Alpha-Maske je Chunk in 256er-Auflösung + Box-Blur Radius 1 (620–638, 730–760); Anti-Wiederholung über 4 Varianten regionsweise (`REGION_PX = 3*TILE_WIDTH`, 32) plus Makro-Tönung (`TINT_STRENGTH = 0.1`, 35). Das Pixel-Gate erzwingt Übergangsbreite 8..115 px (`gate.ts:36–37`). Megatextur-/TileSprite-Pfad: keine Übergänge.

### B5 — Ownership/Fraktion/Territorium auf Tile-Ebene

**NICHT VORHANDEN** — kein Datenfeld speichert pro Kachel einen Besitzer. Grep (`owner|faction|fraktion|territor|corruption|korrup|creep|influence`, 65 Treffer-Dateien): alle `owner`/`faction`-Treffer liegen auf **Entity-/Kartenobjekt-Ebene** (`Owner = "spieler" | "gegner"` loader.ts:17; `GridEntity.owner` entity.ts:30; `MapNode.owner` map_format.ts:41; `MapBuilding.faction` 52–57; `MapSpawn.faction` 92–97); `territor`/`creep`: **0 Treffer**; `influence`/»Einfluss« nur als Kommentarwort (game_scene.ts:429; terrain_transform.ts:32); »korrumpiert« nur im Kommentar terrain_assets.ts:127–128.

Tile-Gitter, die **kein** Ownership sind: Kollisions-Set `blocked` (game_state.ts:50, 237–239, besitzerlos); Sicht pro Fraktion `vision: Record<Owner, VisionGrid>` (game_state.ts:28–31; Uint8Arrays vision_grid.ts:31–32/43–44) — Sicht, kein Besitz; `syrupZones: Set<string>` + `CellKind = "walkable"|"blocked"|"water"|"syrup"` (game_scene.ts:144/286; map_format.ts:21) — Zonenart ohne Fraktion; `inSyrupZone()` (game_scene.ts:1384–1385) hat **keinen Aufrufer** (map_texture.ts:109 kündigt den Slow-Effekt als »später« an).

**Nächster Verwandter: die Terrainwandlung (VFX Strang 2)** — fraktionsgetrieben, pro Kachel wirkend, aber **rein visuell und nicht gespeichert**:

- Overlay `delta: Float32Array`, terrain_render.ts:87–89 verbatim: »wird beim Sampling ADDIERT, aber NIE gespeichert (exportCells liest nur weights). Damit 0 MB, mechanik-neutral.« APIs `setTransformAt` (211–214), `maxTransformAt` (218–222).
- Treiber `TerrainTransform` (39–156): pro Fraktionsgebäude eine wachsende Quelle (`GROW_PER_TICK = 0.9` Kacheln je 200 ms), Ziel-Overlay `TARGET = 2.5` (34), weiches Band `SOFT_FRAC = 0.75`/`SOFT_MIN = 8` (30–31), **reversibel** bei Gebäude-Tod (`reverseAt` 55–69).
- Fraktions-Zielsorte `factionTargetSortId` (terrain_assets.ts:131–133 verbatim): `return faction === "generik" ? "erde-tot" : "klarflur";` — Doc 127–130: »GENERIK korrumpiert die Erde (tote, dunkle), KLARHEIT begrünt sie (helle Klarflur).«
- Spiel-Verdrahtung `registerTerrainRecolor()` (game_scene.ts:412–439): `onBuildingAdded` → Quelle mit `radius = 7 + max(footprint.w, footprint.h)` (430); `onBuildingRemoved` → `reverseAt` (434–437); No-op ohne Splat-Terrain (410/415).
- Editor-Dev-API: `addTransform` (1110), `pumpTransform` (1120–1128, deterministisch für Headless), `factionSortIdx` (1133–1134); Harness `tools/editor_browser.mjs:683–684, 735–740`.
- Zementierte Invariante gegen Terrain-als-Mechanik, map_format.ts:102–107 verbatim: »`w[]` ist REIN RENDER. Die Begehbarkeit wird NIE aus dem dominanten Boden-Gewicht abgeleitet … Kein Code-Pfad darf `w[]` für Kollision/Pathfinding lesen.«

---

## Block C — Karten-Datenstruktur und Editor

### C1 — Was der Editor pro Tile speichert

**Kein Datensatz pro Kachel** — das Format ist dünn besetzt: pro *gemalter* Zelle `{c, r, w[]}`. `map_format.ts:111–116` verbatim:

```ts
export interface MapTerrain {
  /** Index in groundTypes, der ueberall gilt, wo keine Zelle gesetzt ist. */
  default: number;
  /** Pro gemalter Zelle die Gewichte je Bodentyp (Reihenfolge = groundTypes). */
  cells: { c: number; r: number; w: number[] }[];
}
```

Gewichte: im FILE Ganzzahlen 0..255 (`WEIGHT_SCALE = 255`, Z. 10–12), im Speicher Floats 0..1 (Z. 108–109). Weitere zellbezogene Listen: `water: {c,r}[]` (126–127), `collision: {c,r,kind}[]` (137–138). Objektlisten mit Sub-Kachel-Floats: `MapDoodad` (23–35: type/col/row/variant?/mirror?/scale?/rotation?/seed?), `MapDecal` (64–77: set/col/row/variant/rot/scale/alpha/mirror), `MapBuilding` (52–57), `MapNode` (37–42), `MapSpawn` (92–97), `MapFog` (83–90: col/row/radius/density). Editor-Strichdaten (`EditStroke`, editor_scene.ts:99–115) sind reiner Undo-RAM, nicht persistiert.

Echter Auszug `game/maps/dicht.hellmuth.json:2063–2073` (groundTypes Z. 2009–2013 = `["erde-tot","sandlehm","steppe"]`):

```json
"terrain": { "cells": [ { "c": 0, "r": 0, "w": [ 255, 172, 0 ] },
```

Serialize: `saveMap` (297–334) — Max-Normierung → Quantisierung 0..255, deterministische Sortierung, `JSON.stringify(sortKeysDeep(obj), null, 2)` (333, RFC-8785-Prinzip Z. 291–294); Alias `serializeMap` (336–337). Deserialize: `loadMap` (213–289, »migrieren, validieren, klemmen, deduplizieren, sortieren, dequantisieren … Bricht nie hart ab«). Editor-Anbindung: editor_scene.ts:1081–1082 (serialize/load), Roundtrip-Beweis 1087–1091; Speichern/Laden/Spielen editor_ui.ts:311–339 (Download `karte.hellmuth.json`, File-Input, `sessionStorage` + `?map=__session`).

### C2 — Dateiformat, Fundorte, Loader

Format: JSON `*.hellmuth.json`, pretty-printed, rekursiv schlüsselsortiert (map_format.ts:1, 333; `docs/KARTENEDITOR.md:36`). **Genau drei Kartendateien im Repo** (`hellmuth/game/maps/`):

| Datei | Größe | version | Inhalt (per JSON-Parse) |
|---|---|---|---|
| `dicht.hellmuth.json` | 187.539 B | 2 | cells=1293, doodads=72, decals=128, nodes=5, spawns=2; Key `buildings` fehlt |
| `offen.hellmuth.json` | 167.768 B | 2 | cells=1283, doodads=40, decals=57, nodes=6, spawns=2; Key `buildings` fehlt |
| `leer.hellmuth.json` | 439 B | **1** | cells=0, spawns=2; Keys `decals`/`buildings`/`fog` fehlen |

`hellmuth/data/maps/index.json` (257 B) ist **keine Karte**, sondern der Skirmish-Menü-Index (ein Eintrag `first_clearing`; Leser `src/menu/maps_data.ts:3, 18–20`).

Loader: **einziger Parser ist `loadMap`** (`src/maps/map_format.ts:213–289`). Spiel: Vite-Glob `import.meta.glob("../../game/maps/*.hellmuth.json")` (game_scene.ts:71–74), Auflösung `resolveEditorMap()` (381–405; `?map=name`, `?map=__session` via sessionStorage, Größen-Gate Z. 403). Editor: identisches Glob (editor_scene.ts:59–62), `loadMapByName()` (306–314), Datei-Upload (editor_ui.ts:322–332). Prüf-Loader `src/maps/roundtrip_check.ts:6, 32–43`. Weitere Grep-Treffer (`sprites.ts:160` Sprite-Atlas gleichen Namensbestandteils; `menu/index.ts:11` + `skirmish_setup.ts:2,61` als `loadMaps`-Index-Konsumenten) sind **keine** Kartenparser.

### C3 — Erweiterbarkeit pro Tile (nur Fakten)

**(a) Versionierung: JA.** `MAP_FORMAT_VERSION = 2` (map_format.ts:8), Feld `version` (119), Migrationsgerüst `migrate` (177–204, »Gerüst für weitere Stufen« Z. 180), Default fehlende Version → 1 (184), v1→v2-Stufe (185–202). Dateien tragen 2/2/1 (s. o.).

**(b) Loader-Toleranz: geteilt.** Top-Level **tolerant UND verlustfrei**: unbekannte Keys werden nach `meta.__unknown` durchgereicht (`KNOWN_KEYS` 169–174; Durchreichung 266–270 verbatim; Test `roundtrip_check.ts:122–129` mit `zukunftsfeld`). Ein striktes Schema (Zod/Ajv/JSON-Schema): **NICHT VORHANDEN** (einziger Treffer ist der Kommentar `src/data/loader.ts:3`, der genau das als späteren Schritt benennt). **Pro Terrain-Zelle** dagegen destrukturierendes Lesen von **nur `c`,`r`,`w`** (225–232; Neuaufbau `return {c,r,w}` 237); `saveMap` schreibt pro Zelle ebenfalls nur `{c,r,w}` (303). Code-Fakt: ein Zusatzfeld pro Zelle erzeugt **keinen Ladefehler**, überlebt aber den ersten load→save-Roundtrip **nicht**; ein pro-Zelle-Meta-Container ist NICHT VORHANDEN. Gleiches Nur-bekannte-Felder-Muster in allen `norm*`-Funktionen (398–447).

**(c) Defaults: JA, durchgängig.** Fehlende Listen → `[]` (`arr` 372–374); cols/rows → 36 (215–216); groundTypes → `["neutral","klarheit","generik"]` (217–218, 142); name → »Unbenannte Karte« (274); kaputte Gewichte → 0 (`asNum` 352–355, `dequant` 362–364); Objekt-Defaults in `norm*` (`?? 0`, `?? 1`, kind-Default `"blocked"` 393). Beleg: `leer.hellmuth.json` ohne decals/buildings/fog lädt über dieselben Pfade.

---

## Block D — Boden-Assets

### D1 — Boden-Texturen/Tiles (tabellarisch)

**`hellmuth/assets/source/maps/ground/` — 12 Splat-Quelltexturen** (per `file` gemessen; 3 Sorten × 4 Varianten):

| Datei(en) | Auflösung | Größen (Bytes) |
|---|---|---|
| `boden-erde-tot-1..4.png` | je 1024×1024 RGB | 1.967.323 / 2.025.149 / 2.063.907 / 2.029.891 |
| `boden-sandlehm-1..4.png` | je 1024×1024 RGB | 1.581.819 / 1.722.405 / 1.619.343 / 1.707.010 |
| `boden-steppe-1..4.png` | je 1024×1024 RGB | 1.558.135 / 1.664.520 / 1.573.180 / 1.614.797 |

Geladen per Vite-Glob (terrain_assets.ts:14), nur bei `?map=…` (preload_scene.ts:60–62).

**`hellmuth/public/sprites/terrain/` — 5 Dateien:**

| Datei | Auflösung | Größe |
|---|---|---|
| `boden-generik.png` | **4096×4096** RGB | 33.919.659 |
| `boden-klarheit.png` | 1254×1254 RGB | 3.162.645 |
| `boden-fundament-erde.png` | 1254×1254 RGBA | 2.536.100 |
| `boden-fundament-moos.png` | 1254×1254 RGBA | 2.964.398 |
| `boden-fundament-sand.png` | 1254×1254 RGBA | 2.036.688 |

(Fraktions-Kachelböden: sprites.ts:55–56, 183–186; Fundamente optional: sprites.ts:70–74, Zuordnung balance.ts:145–153, 205–210.)

`processed/`, `selected/`, `raw/`: Boden-Assets **NICHT VORHANDEN** (nur UI-PNGs bzw. `.gitkeep`). Namens-Treffer `grass`/`splat`/`ground` in Dateinamen: NICHT VORHANDEN (nur Ordnername `ground/`). Im Code referenziert, aber als Datei NICHT VORHANDEN: `boden-klarflur-1..4` (prozedural, s. B4), `boden-aura*` (optional, prozeduraler Fallback balance.ts:59–61), `sprites/maps/neutral.png`/`neutral_mask.png` (Megatextur), sowie 16 nicht-optionale Terrain-Doodads `fels-*/baum-*/wald/streu-1..7` (sprites.ts:76–91 — siehe WIDERSPRÜCHE).

### D2 — Übergangs-Tiles / Rand-Decals

Übergangs-Tiles: **NICHT VORHANDEN** — Übergänge entstehen ausschließlich prozedural im Splat-Renderer (terrain_render.ts:1–4). Die Suche `edge|transition|rand` trifft nur zwei HUD-UI-Assets (`kedge_b/d.png` unter `ui/hud/v2/klarheit/begleiter/`), keine Bodenränder.

Boden-**Decals**: 8 Dateien unter `assets/source/maps/decals/` — `bodendekor-moos-1..4.png` und `bodendekor-sirupfleck-oil-1..4.png`, je 1024×1024 RGB (1.549.983–1.775.982 B). **Nicht freigestellt**; Freistellung zur Laufzeit per Distanz-Matte (`buildDecalCutouts`, terrain_assets.ts:336–362, SIZE=512/STRONG=28/WEAK=70 an 337–339; Doku KARTENEDITOR.md:99–102). Datenformat `MapDecal` (map_format.ts:59–77). Weitere Decal-Slots im Code **ohne** Dateien: `blood_manifest.ts:24–36` (`blut-*`, `ploerre-generik-*` »puddle 512 (GENERIK Magenta-Ploerre)«, `fx_scorch` u. a.) — `public/sprites/effects/` enthält nur `glow_klarheit_radial_512.png`; bis dahin prozedurale Platzhalter (blood_manifest.ts:3–6).

### D3 — Als korrumpierter Boden lesbare Assets

(Urteil nur per Dateiname + Code-/Doku-Zitat, keine Bild-Inhaltsanalyse.) Muster `dunkel|dark|corrupt|verseucht|magenta` in Asset-Dateinamen: **NICHT VORHANDEN** (0 Treffer). Muster `generik`: 72 Datei-Treffer, davon genau **ein** Boden-Asset: `public/sprites/terrain/boden-generik.png` (alle übrigen 71 = UI/HUD). Zusätzlich per Namen/Code lesbar: **`boden-erde-tot-1..4.png`** — der Code weist `erde-tot` explizit als GENERIK-Korrumpierungs-Ziel aus (terrain_assets.ts:127–133; KARTENEDITOR.md:268–269: »GENERIK → erde-tot (korrumpiert, dunkel)«). **Magenta existiert nur als Code-Farbe, nicht als Asset:** `0xff3bd0` als GENERIK-FX-Farbe (projectile_system.ts:208–209 »krankes Magenta (Platzhalter)«; death_fx.ts:87; editor_ui.ts:149 `#ff3da5`); Doku kombiniert Sorte + Welt-Tint: NEBEL-TIEFE-SPEC.md:153 »magenta-getöntem GENERIK-Terrain (`erde-tot` + `0xff3bd0`-Welt)«.

---

## Block E — Render-Architektur und Laufzeit-Änderbarkeit

### E1 — Laufzeit-Austausch einzelner Tiles?

Beide Boden-Pfade werden beim Scene-Start **einmalig** gebaut; der Splat-Pfad ist zur Laufzeit änderbar — **chunk-granular (512 Welt-Px), nicht tile-granular**. Ein `setTile`/`putTileAt`-System: NICHT VORHANDEN (Grep trifft nur `setTileScale`/`setTilePosition` auf TileSprites).

- **Pfad A (Nicht-Editor):** einmalig in `create()` (game_scene.ts:232–235: `drawTerrain(); renderMegatexture(this);`); map_texture.ts hat **keine** Update-/Refresh-Methode, einziger Aufrufer ist game_scene.ts:234.
- **Pfad B (Splat):** Erstaufbau game_scene.ts:225–226 → `build()` (terrain_render.ts:365–379). Laufzeit-Änderung: **Datenmodell zell-granular** (`setCell` 225–229, `setCellWeights` 204–208, `addWeight` 232–240, `setTransformAt`/`maxTransformAt` 211–222), **Neuzeichnung chunk-granular**: `markDirtyWorldRect` (421–428) → `recompositeDirty()` (431–442, nur dirty Chunks; dabei `rebuildSmooth()` über das ganze Gewichtsfeld, Kostenkommentar Z. 283) → `tex.refresh()` (672–676).
- **Wandlung im Spiel:** Gebäude-Hooks (game_scene.ts:427–438) → `TerrainTransform.tick()` alle 200 ms (terrain_transform.ts:82–101) → `recompositeDelta()` schreibt das Overlay **zellweise** (Z. 131, 142) und markiert **regional** dirty (Bounding-Box aller Quellen, Z. 154); Spiel-Loop game_scene.ts:1158–1162 verbatim: `if (this.terrainTransform?.tick(time)) this.terrainDirty = true; if (this.terrainDirty && this.terrain) { this.terrain.recompositeDirty(); … }`.
- **Editor:** Pinsel → `markTerrainDirty` (607–611) → Loop 485–501 (Rebake 496–499, Cull 500); Undo `restoreStroke` (1001–1023); Kartenwechsel = Voll-Neubau (`applyMap` 1061–1072); Headless-Haken `pumpTransform` (1120–1128), `flush` (1256–1260).
- Doku deckungsgleich: KARTENEDITOR.md:155 »Der Boden wird gebacken, nicht pro Frame gemischt«; 159–160 »chunkweise (512 px) … on-edit nur die Chunks unterm Pinsel neu.«

### E2 — Performance-Budgets / FPS-Ziele / Tile-Count-Grenzen

Dokumentierte Budgets (alle Fundstellen):

- **Sim-Takt:** game_scene.ts:90–93 verbatim: »Fester Sim-Takt (Strang 8) … 30 Hz halbiert die O(n²)-Last gegen 60. maxStepsPerFrame bremst die Todesspirale …« `const SIM = { fixedDtMs: 1000 / 30, maxStepsPerFrame: 5 };` dazu Z. 1190: »Frame-Budget 16,67 ms, nicht 33,3 ms«.
- **Gemessene Grenzen:** CONTAINER-WERKZEUGE.md:147–148: »ms/Tick: voller Sim median 16,5 ms @1000 Einheiten, **reißt 33 ms (30 Hz) zwischen N≈1500–2000**«; ORCHESTRIERUNG.md:148 (»ms/Tick gegen 33 ms«); PHYSIK-KNOCKBACK.md:117–119 (Knockback ≈0,13 ms avg, 0,77 % des 16,67-ms-Budgets) und 121–123 (»60 FPS auf RTX 3070« nur als Solutions-Spec-Erwartung, »hier nicht messbar«).
- **Terrain/Karten:** KARTENEDITOR.md:169–173: »Chunking (512 px) + worldView-Culling … Beleg `perf 96`: ~59 FPS bei Pan, 48 von 540 Chunks sichtbar (91 % gecullt). Residuum: kein Speicher-Deckel … bis ~64×64 bequem«. Tile-Count im Spiel fest 36×36 (world.ts:16–17 + Gate game_scene.ts:403); Editor 8..256 (editor_scene.ts:1274–1278). veil_system.ts:10 begründet die FoW-Architektur gegen »1296 per-Tile-Quads = Budget-Tod«.
- **FX-Kappen:** `MAX_LIVE = 256` (projectile_system.ts:19); Partikel-Budgets (fx.ts:38); TODO.md: LOD-Kappe ~40 reiche Explosionen/Frame (246), Stempel 24/Frame (207–208, 301–302), `WOUND_DRIP_CAP_PER_FRAME=12` (329), `bloodDropMax=96`/`landingCap=24` (335).
- **Asset-Budgets:** BLUEPRINT-V2:72–82 (Frames pro Animation, Abspielrate 15–20 fps, 300–400 Frames/Einheit gesamt). Nebel-Alpha-Deckel 0,55 (NEBEL-TIEFE-SPEC.md:13).

Ein eigenständiges, verbindliches **FPS-Ziel-Dokument** darüber hinaus: **NICHT VORHANDEN.**

### E3 — Update-Schleifen / Tick-System

**Das feste Tick-System existiert bereits global — nicht erst im Knockback-Strang.** 30-Hz-Akkumulator in game_scene.ts:1174–1183 (verbatim geprüft: `while (this.simAcc >= SIM.fixedDtMs && steps < SIM.maxStepsPerFrame) { this.stepSim(SIM.fixedDtMs); … }`), Konstante Z. 93. `stepSim` (1201–1217) mit fester Systemreihenfolge: rebuildUnitGrid → movement → updateVision → resource → destilleProduction → build → production → repair → combat → order → ai; Eigenmessung `lastSimMs` (1216); Testbed `window.__sim.step(n)` (1277–1285, `setDriven` 1243–1245).

Weitere Schleifen: Phaser-rAF → `GameScene.update()` (1142–1196: Direktoren, Fog, Terrain-Wandlung+Rebake, Cull, Kamera, dann Sim-Akkumulator, dann Render-Pfad); `EditorScene.update()` (485–501, kein fester Tick, einzige Drossel `TICK_MS = 200` der Wandlung); FX am Scene-UPDATE-Event (fx.ts:152–153); AmbienceDirector 500-ms-Poll (ambience_director.ts:45–49); `hud_scene.ts` ohne eigenes update.

**Knockback-Strang** (Commits `c5b3d32` 2026-06-18 und `bc24825` 2026-06-19; Autor beider nur »Claude«, Instanz-Kennung nicht messbar): definiert **keine eigene Schleife und keinen eigenen Takt** — dtMs-getrieben (`update(dtMs, bodies, grid)` knockback_system.ts:117; framerate-unabhängiger Decay Z. 246), für den bestehenden 30-Hz-Schritt gebaut (Kopfkommentar 5–6), aber **im Spiel nicht verdrahtet**: außerhalb `src/systems/knockback/` existiert keine Knockback-Referenz in `src/` (Grep bestätigt); PHYSIK-KNOCKBACK.md:140–142 benennt die offene Naht wörtlich (»`combat_system.resolveProjectileHit` würde `knockback.explode(spec)` rufen; `stepSim` würde … ticken. Beides bleibt offen …«). Harnesses nutzen den Takt lokal (`const DT = 1000 / 30;` tools/smoke/knockback_smoke.ts:9, knockback_demo_assert.ts:14).

---

## Block F — Spielzustand

### F1 — Wo der zentrale Zustand lebt

**Kein ECS, kein Store-Framework** (adversarial geprüft: package.json-dependencies enthalten nur `phaser`; einziger `archetype`-Treffer ist ein String-Feld in `knockback/explosion_spec.ts:47`). Muster: **eine zentrale Zustandsklasse + klassische Entity-Hierarchie + Systeme mit Konstruktor-Injektion.**

- **`GameState`** (`src/systems/game_state.ts:14`; Selbstbeschreibung 11–13: »Zentrale Spielzustands-Halterung. Einzige Wahrheit über Entities, Ressourcenstände (je Besitzer), Auswahl und belegte Kacheln. Systeme lesen und mutieren hier; Scene und HUD lesen hier. Keine Darstellung, keine Eingabe.«). Inhalt: units/buildings/nodes (15–17), SpatialGrids (22–23), `vision` je Fraktion (28–31, Schreibmonopol `updateVision` Z. 26–27), resources/enemyResources (37–39), Auswahl (42–44), `blocked`-Kacheln (50), Hooks `onBuildingAdded/Removed` (58–59); Methoden 88–372.
- **Entity-Hierarchie:** `GridEntity extends Phaser.GameObjects.Container` (entity.ts:14; id/col/row/hp/owner 18–30) → `Unit` (unit.ts:64; trägt path/flowField/gather/buildTarget/moveState/fireState/attackTarget/orders 80–121; Rollenverteilung 60–62: »Die Logik dazu liegt in den Systemen; die Unit ist Daten- und Darstellungsträger«), `Building` (building.ts:32), `ResourceNode` (resource_node.ts:25).
- **Zustand → Scenes, drei Wege:** (a) einmalige Konstruktion + Registry: `new GameState(data)` existiert **genau einmal** (game_scene.ts:239), `registry.set("gameState", …)` (240); GameData via preload_scene.ts:23–24. (b) Konstruktor-Injektion an alle Sim-Systeme (game_scene.ts:298–324; Empfangsseite z. B. resource_system.ts:15–18). (c) Registry als Service-Locator für scene-ferne Leser (html_hud.ts:391, wound_trail_system.ts:57, parasit_drain.ts:73, production_glow.ts:128, impact.ts:49).
- **HUD-Sonderfall:** Phaser-`HudScene` hält keinen Zustand mehr (hud_scene.ts:3–14 »ERSATZLOS deaktiviert«); das sichtbare HUD ist DOM (`html_hud.ts`) und pollt per rAF aus der Registry (388–402).
- **Meta/Persistenz außerhalb:** localStorage (Audio audio_bus.ts:75/105, Sprache, Optionen, Skirmish, Florilegium-Lesestand, Stub main.ts:133), sessionStorage (Editor-Karte editor_ui.ts:337), WeakMap-Singletons je Scene für FX (fx/index.ts:20 u. a.).

### F2 — System-Kommunikation

Sechs koexistierende Muster, je belegt:

1. **Direkte Methodenaufrufe in fester Tick-Reihenfolge** (Haupt-Muster): `stepSim` game_scene.ts:1201–1217; System→System über injizierte Referenzen (resource_system.ts:26: `this.movement.moveAdjacentTo(unit, …)`).
2. **Scene-Event-Bus (`this.events`)** — vollständig belegtes Beispiel `fx.unit_died`: Definition `EVT_UNIT_DIED` death_fx.ts:21; **Sender** combat_system.ts:317 `this.scene.events.emit(EVT_UNIT_DIED, snap)` (+ Dev-Hotkey game_scene.ts:1131); **Empfänger** death_fx.ts:158 (`scene.events.on`), bark_director.ts:47, und datengetriebener Audio-Tap install_audio.ts:46 über `audio_manifest.json:200` (`"event": "fx.unit_died" → "sfx.death.unit"`). Weitere Events: game_events.ts (z. B. `EVT_UNITS_SELECTED` Z. 9), Emits game_scene.ts:296/763/874/961/969/1523, production_system.ts:119, combat_system.ts:331, ambience_director.ts:92.
3. **Globaler Game-Bus (`game.events`)** für DOM-HUD ↔ Scene: `UI_BUILD_REQUEST` (ui_events.ts:5), Sender html_hud.ts:529, Empfänger game_scene.ts:669 (Handler 648–650); Bus-Trennungsregel install_audio.ts:7–8 (»`ui:*` auf game.events, alles übrige auf scene.events«). Rückkanal `EVT_BUILD_REJECTED` wird emittiert (build_system.ts:47, 85), hat aber **keinen Abonnenten** (siehe WIDERSPRÜCHE).
4. **Callback-Hooks am GameState:** `onBuildingAdded?/Removed?` (game_state.ts:58–59, Auslösung 119/205, Registrierung game_scene.ts:427) — der Verdrahtungspunkt der Terrainwandlung.
5. **WeakMap-Service-Locator je Scene** für FX-Dienste (fx/index.ts:20/77–79; getFxSystem, getBloodSystem, getWoundSystem, getDebrisSystem; Nutzung z. B. death_fx.ts:119).
6. **DOM-CustomEvent auf `window`** — zwei Instanzen: der tote Stub `skirmish:start` (main.ts:135, kein Listener; als Stub deklariert Z. 130) **und** ein **lebender** Kanal `audio:volume-changed` (`AUDIO_VOLUME_EVENT` audio_bus.ts:13, Sender audio_bus.ts:54–55, Empfänger florilegium_audio.ts:33).

Eine eigene Message-Bus-Klasse jenseits der Phaser-EventEmitter: **NICHT VORHANDEN.**

---

## OFFENE WIDERSPRÜCHE

**Doku ↔ Doku / Realität:**

1. **Branch-Name:** DIRECTION.md:30–33 nennt `claude/hopeful-cannon-z94t30` als einzigen Arbeitsbranch und `claude/great-sagan-ifnem6` (Stand `1d8e5b4`) als eingefroren; real existieren nur `claude/quirky-fermat-8rewv0` und `claude/sharp-newton-ceo48s`, `1d8e5b4` ist kein gültiges Objekt. Protokolliert als unabgenickte Entscheidung C3 (ENTSCHEIDUNGEN.md:173–177).
2. **VISUAL-TARGET-ANWEISUNG.md fehlt**, wird aber als gültige Spec referenziert (BLUEPRINT-V2:25 »gilt unverändert«, V2:121, asset-spec.md:8) — und ist zugleich der Referent des per V3 ersetzten »Auftrag §7«.
3. **V2 §5.1 unmarkiert:** V2:97 nennt Megatexturen im Dateitext weiter »Hauptweg«; die Außerkraftsetzung steht nur extern (DIRECTION.md:10–12, V3:3, »in der geänderten Fassung« — Fassung nirgends markiert).
4. **Electron vs. Tauri:** DIRECTION.md:43–44 (Electron + steamworks.js) vs. hellmuth/CLAUDE.md:27–28 und TODO.md:373 (Tauri). DIRECTION gibt sich Vorrang (17–19), Text unbereinigt.
5. **AP7 vs. V3-H1–H7** (V3:59–65): Verhältnis nirgends aufgelöst; AP7 verweist auf die fehlende Datei aus Punkt 2.

**Code ↔ Code / Doku:**

6. terrain_assets.ts spricht von »drei Bodensorten« (Z. 1, 59), `GROUND_SORTS` enthält **vier** (inkl. klarflur-Platzhalter).
7. game_scene.ts:243–244 kommentiert »KLARHEIT → sandlehm«, der Code liefert `klarflur` (terrain_assets.ts:131–133; auch Kommentar 416–417 veraltet).
8. `DEFAULT_GROUND_TYPES = ["neutral","klarheit","generik"]` (map_format.ts:142, so in leer.hellmuth.json) existieren als Sorten-Ids in `GROUND_SORTS` **nicht**; der Renderer fällt still auf `GROUND_SORTS[0]` zurück (terrain_render.ts:158).
9. **Megatextur-Pfad = Code ohne Asset:** sprites.ts:21–22 deklariert `sprites/maps/neutral.png`/`neutral_mask.png`, game_scene.ts:234 ruft den Renderer — die Dateien fehlen, der Pfad läuft als No-op.
10. `leer.hellmuth.json` trägt version 1 bei `MAP_FORMAT_VERSION = 2` (nicht durch kanonische saveMap gelaufen).
11. **buildings-Key:** saveMap schreibt `buildings` immer (map_format.ts:321–323), beide v2-Karten haben den Key nicht → die Dateien sind nicht byte-identisch zu ihrer eigenen Normalform, im Kontrast zu KARTENEDITOR.md:36 (»bit-identisch«).
12. **Menü-Index ↔ Karten:** index.json listet nur `first_clearing` — eine solche Kartendatei existiert nicht; die drei existierenden Karten stehen nicht im Index; der Skirmish-Start ist Stub (main.ts:128–137), kein Codepfad verbindet `first_clearing` mit einer Karte.
13. KARTENEDITOR.md-Werkzeugtabelle (28–36) führt das `building`-Tool nicht, das der Code als achtes Werkzeug hat (editor_scene.ts:64–72; später eigener Doku-Abschnitt 316–337).
14. **16 nicht-optionale Terrain-Doodad-Sprites fehlen** (sprites.ts:76–91: fels/baum/wald/streu) — in `public/sprites/terrain/` und `dist/` nicht vorhanden; KARTENEDITOR.md:96–97 behauptet deren Nutzung; Laufzeit-Fallback ist Platzhalterform + console.warn (sprites.ts:2–3, preload_scene.ts:47).
15. `public/sprites/README.md:15` listet den terrain/-Ordnerinhalt unvollständig (Fundament-PNGs fehlen; zugleich gelistete buildings/units-Dateien existieren nicht).
16. KARTENEDITOR.md:111–114 markiert zwei der 12 Quelltexturen als naht-defekt (`boden-erde-tot-2` Naht/Innen ≈ 11; `boden-steppe-1` ≈ 2,9).
17. **Kartengrößen-Dreiklang:** Renderer »beliebig große Karten möglich« (terrain_render.ts:123–124) + Editor 8..256 (editor_scene.ts:1274–1278) vs. Spiel-Gate hart 36×36 (game_scene.ts:403) vs. Doku-Speichergrenze »bis ~64×64 bequem« (KARTENEDITOR.md:172).
18. Knockback-Spec intern inkonsistent: DEFAULT_TUNING trägt §3.4-Werte (force 350, knockback_system.ts:56–67), die die §10.2-Bänder verfehlen; Demo-Assert läuft mit 550/320/48 (knockback_demo_assert.ts:5–17; PHYSIK-KNOCKBACK.md:106–112 benennt es selbst).
19. `EVT_BUILD_REJECTED`: dokumentiert als HUD-Rückmeldung (ui_events.ts:19–22), zweifach emittiert (build_system.ts:47/85), **kein Abonnent im Repo**.
20. WERKZEUGE.md:3 zählt »Siebenundzwanzig Werkzeuge«, der Check führt 28 aktive + 24 reservierte Hebel; zugleich meldet der Lauf FAIL 19/28 ACTIVE gegen die eigene Stopp-Signal-Doktrin (WERKZEUGE.md:9).

## NICHT MESSBAR

- **Referent »Auftrag §7«** (der ersetzte bildbasierte HUD-Ansatz): VISUAL-TARGET-ANWEISUNG.md fehlt im Repo, der ersetzte Wortlaut ist nicht messbar.
- **Ob V2 §5.1 die »geänderte Fassung«** aus V3:3 ist: keine Versions-/Änderungsmarkierung; Dateihistorie beginnt erst mit dem Sammel-Import `e9be274`.
- **Entstehung/Bestätigung von DIRECTION.md vor 2026-06-12:** ältere Stände sind nicht im Repo.
- **Laufzeitwerte ohne Programmlauf** (Read-only-Auftrag): tatsächliche Chunk-Anzahl/sichtbare Chunks (12×7=84 nur abgeleitet), FPS/Frame-Zeiten des aktuellen Builds, fehlerfreies Laden/Rendern der drei Karten, Byte-Identität des save(load(x))-Roundtrips für die Repo-Dateien (aus dem Code ableitbar ist nur der fehlende buildings-Key, Widerspruch 11). Zitierbar sind nur dokumentierte Messwerte (KARTENEDITOR.md:171; CONTAINER-WERKZEUGE.md:147–148).
- **Bildinhalt der Boden-PNGs** (ob `boden-generik.png`/`boden-erde-tot-*` tatsächlich dunkel/magenta-getönt aussehen): keine Bild-Inhaltsanalyse durchgeführt; Urteil nur über Dateinamen, Code-Kommentare, Doku.
- **Ob der Megatextur-Pfad je mit echtem Asset lief** (neutral.png fehlt).
- **Zuordnung des Knockback-Strangs zu »Code7«:** Commit-Metadaten beider Knockback-Commits nennen als Autor nur »Claude« ohne Instanz-Kennung.

---

## Fußnote (nachtraeglich, 2026-07-03): Fraktions-Umbenennung

Dieser Bericht datiert vom 2026-07-02 gegen `bc24825` und verwendet durchgängig die damals geltenden Fraktions-Namen **KLARHEIT** und **GENERIK**. Am 2026-07-03 wurden diese per Kanon-Schritt (Code6-NAMENS-DRIFT) auf **HELLMUTH** bzw. **MODERAT** umbenannt — in Code, Doku und Asset-Pfaden. Der Bericht selbst bleibt als historischer Beleg unverändert; wo er »KLARHEIT« schreibt, meint der aktuelle Kanon HELLMUTH, wo er »GENERIK« schreibt, meint er MODERAT. Regel siehe `KONVENTIONEN.md`, Abschnitt »Fraktions-Bezeichner«.
