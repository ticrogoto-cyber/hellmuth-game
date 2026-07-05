# GEFECHTS-VFX

Code7, Welle 0 Strang C (Brief `CODE7GEFECHTSVFX.md`). Basis `bc24825` auf
`claude/quirky-fermat-8rewv0`. Pflichtlektüre `solutions/SOLUTIONS-ZIELBILD-REALISIERUNG.md`
(Branch `eloquent-hawking`): Hebel H3/H5/H7, Befunde C1/C3/D1–D3.

Dieses Dokument beginnt mit der **Paket-0-Kurzmessung** (Ist-Stand, bevor gebaut
wird) und wächst mit den Paketen 1–6 (Depth-Slots, Palette, Budgets,
Swap-Manifest, Residuen).

---

## Paket 0 — Kurzmessung (Ist-Stand vor dem Bau)

### 0.1 Atlas-Ist (Solutions-Frage 7)

| Frage | Ist-Befund | Beleg |
|---|---|---|
| Ladewege | Drei getrennte Wege: (1) Einzel-PNGs über EIN Manifest (`SPRITE_MANIFEST + BLOOD_FX_MANIFEST + GLOW_FX_MANIFEST`), (2) genau EIN Einheiten-Atlas (`hellmuth` via `this.load.atlas`), (3) prozedurale Canvas-Texturen als dominante FX-Strategie | `preload_scene.ts:49-58`, `sprites.ts:154-165` |
| FX-Atlas | **Existiert nicht.** `tools/pack_atlas.py` ist ein reiner Einheiten-Packer (`public/sprites/units/*.png\|json`); `public/sprites/effects/` enthält genau eine Datei (`glow_hellmuth_radial_512.png` aus `tools/_gen/gen_glow_radial.py`) | `pack_atlas.py:2-11`, `glow_manifest.ts:13` |
| Frame-Defs in einer CanvasTexture | **Muster existiert nicht** — kein `texture.add()`, kein `load.spritesheet` im ganzen `src/`. Prozedurale Texturen sind je ein eigener Key (`fx_glow`, `fx_ring`, `fx_soft_dot`, `fx_puff_soft`, `fx_smoke_puff`, …) | `systems/fx.ts:27-32,58-91` |
| Textur-Wechsel im Gefechts-Frame | Boden-Keys + Unit-Keys/Atlas + ~6 einzelne FX-Keys + **Projektile ganz ohne Textur** (Vektor-`Arc`, Graphics-Pipeline!) | `projectile_system.ts:176` |
| Ein-Atlas-Disziplin ohne Umbau durchsetzbar? | **Für neue FX: ja, net-new** — ein prozeduraler `fx_kit`-CanvasAtlas mit `texture.add()`-Frames dockt am etablierten Erzeuger-Idiom an (`ensureFxTextures`). Bestands-Keys umziehen wäre Umbau; nicht nötig, weil die MultiPipeline seit 3.50 mehrere Texturen pro Batch bindet — der teure Break ist der **Blend-Wechsel**, nicht der Textur-Wechsel (C1) | `systems/fx.ts:76`; C1-Befund |

**Konsequenz Paket 1/2:** Alle NEUEN VFX-Texturen (Tracer-Kern, Tracer-Halo,
Ring, Wolke, Rauch-Puff-Frames) entstehen in EINER CanvasTexture `fx_kit` mit
Frame-Defs; der Projektil-`Arc` (Graphics-Pipeline-Batch-Breaker) wird durch
Atlas-Sprites ersetzt.

### 0.2 Blut-RT-Ist gegen H5-Soll

Implementierung: `src/systems/blood_system.ts`, zweistufig — kamera-verankertes
Fenster-RT (`BloodSystem`, 2048×1536 @ scale 2, `recenter()` cleart) plus
persistente weltgenagelte Schicht (`HybridPersistBackend`).

| H5-Soll | Ist | Lücke? |
|---|---|---|
| Lazy allozierte RT-Chunks (2048) | **Keine Chunks**: EINE kartengroße Persist-RT in halber Bodenauflösung, **lazy** beim ersten persistenten Stempel, Downscale-Loop klemmt sie unter `maxTextureSize` (4096/8192) | Architektur-Abweichung, **keine Baustelle**: der VRAM-Deckel ist über Auflösung statt Chunk-Anzahl gelöst. VRAM-Rechnung: worst case 4096² RGBA = 64 MiB (bzw. 8192² = 256 MiB auf GPUs, die es melden — real durch halbe Auflösung + Downscale deutlich darunter). Chunk-Umbau wäre Doppelbau derselben Funktion. |
| LRU-Kappe | Kein LRU (nicht nötig ohne Chunks); Pro-Frame-Stempeldrossel `DRAW_CAP = 24` existiert | keine |
| Stempeln aus dem FX-Atlas | Stempel-Texturen prozedural + PNG-Override-Gate (`exists()`), Keys `SPLAT/EXPLO/SLOT_KEYS`; Textur-**Bake** seeded (`mulberry32`) | keine (Swap-Punkt dokumentiert) |
| **Seeded Rotation aus dem Sim-Event** | **`Math.random`** bei Key-Wahl, Winkel, Flip und Scale-Jitter der Laufzeit-Stempel | **LÜCKE 1 — wird gebaut** (Paket 6): deterministische Ableitung aus Sim-Event-Daten, Verbots-konform |
| **Default liegen lassen** (MODERAT-Ästhetik) | Persist-Fade ist **immer an** (`FADE_ALPHA_PERSIST = 0.0743`, Marke weg in ~5 min) | **LÜCKE 2 — wird gebaut** (Paket 6): Default liegen lassen, Bremse hinter Flag |
| ERASE-Bremse Alpha 0.02 alle ~10 s hinter Flag | ERASE-Quad-Mechanik existiert (`fade()`), aber als Dauer-Fade ohne Flag und mit anderen Werten | Teil von LÜCKE 2: Flag + Soll-Werte |
| Depth | Persist −97000, Fenster −96000 (zwischen Terrain −99000 und Fundament −95000) | keine |

**Konsequenz Paket 6:** Nur Lücke 1 (seeded Stempel-Ausrichtung) und Lücke 2
(Fade-Default → Flag) werden gebaut. Kein Chunk-/LRU-Umbau — nichts Doppeltes.

### 0.3 Nebenbefunde der Kartierung (bau-lenkend)

- **Depth-Staffel real** (zentral in `util/world.ts`, Rest Modul-Konstanten):
  TileSprite −100000 · Terrain-Splat/Megatextur −99000 · Blut-Persist −97000 ·
  Blut-Fenster −96000 · Fundament −95000 · Streu −90000 · Destillen-Pfütze −89000 ·
  Boden-Aura −80000 · Veil-Boden −60000 · Mist −63000 · Atmo-Nebel −67000…−64000 ·
  Einheiten ≈ y (0…1200) · FX-Partikel-Band 1 000 000.
  **Der Slot −80000…−60000 ist frei** → dort entsteht die zusammenhängende
  ADD-Boden-Schicht (Paket 3/5).
- **Blend-Break-Ist:** Top-Band (1e6) ist bereits konsolidiert (~2 Breaks).
  Im Welt-Band ist ADD verstreut (Destillen-Glow `b.y−1`, `fakeLight` `b.y`,
  Blitz/Schockwelle `y+1000`) → grob `2·(Destillen + fakeLights + aktive Blitze)`
  ≈ **~36 Breaks/Frame** im Gefechtsbild. Konsolidierungs-Hebel klar.
- **Farb-Ist:** FÜNF verschiedene Magentas (`0xff3bd0` FX ×4: `explosion.ts:34`,
  `blood_system.ts:560`, `death_fx.ts:87`, `projectile_system.ts:209`;
  `0xff2d78` parasit_drain; `0xc81aa8` blood substance; `0xff3da5` Editor-UI;
  `0xff00ff` Debug) und verstreutes Gold (`0xe8b33a`/`0xb8860b` destille_drip,
  `0xffd25a`/`0xffe79a` explosion, `0xf0e6b0` death_fx, `0xc8ff8f` Projektil).
  `#ff3da5` ist **Editor-UI-Chrome** (MODERAT-Fraktionsakzent in Panel-Rahmen,
  Chips, Spawn-Markern) — bleibt per Brief unangetastet.
- **Determinismus-Ist:** Es gibt **keinen Sim-Tick-Zähler** (nur `simAcc`-Restwert)
  und `simRng` ist deklariert, aber ungenutzt. Projektile ticken deterministisch
  im 30-Hz-`stepSim`; alles Visuelle (FxService, Anims, hitStop) läuft auf
  Render-dt. Bestehende `Math.random`-Nutzer im FX-Pfad: `ground_mist` (Phase),
  `corpse_pulse`, `blood_splash`, `blood_system`-Stempel. Für `sin(simTick)`
  wird ein monotoner `simTick` in `stepSim` eingeführt (Reset in `setSeed`).
- **Beweis-Infrastruktur:** `tools/phys_smoke.mjs` ist die Blaupause für den
  deterministischen Gefechts-Screenshot (`__sim.setSeed/setDriven/spawn/step`,
  `?renderer=canvas` fürs Capture). Draw-Call-/Blend-Break-Zählung läuft als
  separater WebGL-Lauf (swiftshader) mit `gl`-Hook — Canvas-Lauf fürs Bild,
  WebGL-Lauf für die Zahlen. `tools/balance_sweep.mjs` (zwei Läufe je Seed,
  FNV-1a-Hash) ist die Vorlage für den VFX-Determinismus-Nachweis (neue
  `__sim`-Sonde `vfxHash`).
- **Zielbilder:** Die drei Konzept-Screenshots (»Zielbild 2«) sind **nicht im
  Repo committet** (`selected/screenshots/` leer). Beweis 1 vergleicht daher
  gegen die dokumentierte Stil-Beschreibung (Stilbriefing V2: HELLMUTH Gold,
  MODERAT Chrom+Magenta) und listet die Differenzen ehrlich. → Residuum.

---

## 1. Palette (Paket 1) — `src/fx/palette.ts`

Einzige Farbquelle für Fraktions-FX (Stilbriefing V2). Physikalische Effektfarben
(Feuer-Orange, Rauch-Grau, Blut-Rot) bleiben lokal; Editor-UI-Chrome `#ff3da5`
und Debug-Pink sind kein FX und bleiben unangetastet.

| Konstante | Wert | Rolle |
|---|---|---|
| `GOLD` | `0xE8B33A` | HELLMUTH-Basiston (NORMAL-Flächen, Drips) |
| `GOLD_TIEF` | `0xB8860B` | dunkle Stufe (Pfützen, Ränder) |
| `GOLD_GLOW` | `0xFFD25A` | **ADD-Stufe** (Tracer, Ringe, Blitze) |
| `GOLD_HELL` | `0xFFE79A` | Funken/Schutt |
| `GOLD_WEISS` | `0xF0E6B0` | Todesblitz HELLMUTH |
| `SIRUP` | `0xB0186A` | MODERAT-Basiston (Substanz, Plörre) |
| `SIRUP_GLINT` | `0xC81E78` | Glanz/Linien (Parasit-Drain) |
| `SIRUP_TIEF` | `0x610D3A` | Painter-Schatten der Splat-Texturen |
| `MAGENTA_GLOW` | `0xFF30C0` | **ADD-Stufe**, ersetzt `0xff3bd0` |

**Kalibrierung (bewusst dokumentiert):** Die `*_GLOW`-Stufen werden heller
gefahren als die Boden-Palette, weil additive Blends gegen dunklen Boden sonst
absaufen. `MAGENTA_GLOW` = `SIRUP_GLINT` auf Leuchtstärke gezogen (Kanäle ~×1.6,
auf 255 gekappt), Farbton der Familie (~327°, Blau deutlich über Grün =
blau-stichig) erhalten — nie Richtung Bonbon-Rosa. Der HELLMUTH-Schuss wechselte
von Platzhalter-Grün (`0xc8ff8f`) auf die Gold-Familie (Brief: Gold-Tracer).

## 2. Depth-Staffel mit den neuen Slots (Pakete 3/5)

```
-100000  TileSprite-Platzhalterboden
 -99000  Terrain-Splat / Megatextur
 -97000  Blut persistent        -96000  Blut Fenster
 -95000  Fundament              -90000  Streu
 -89000  Destillen-Pfütze       -80000  Boden-Aura (Doodads)
 -70000  ★ AURA_FX_DEPTH — Boden-ADD-Band (Ringe, Boden-Glows, Destillen-Glow)
 -68500/-68000  Ambient-Nebel-TileSprites (NORMAL)
 -67000..-64000 ATMO_FOG (Editor-Maps)    -63500 Wolken   -63000 ground_mist
 -60000  Veil-Boden
      0..1200  Weltband (Einheiten/Gebäude/Doodads, y-sortiert, NORMAL)
  50000  Silhouette   500000 Selection   600000 Parasit-Drain   900000 Editor
 990000  ★ FX_AIR_ADD_DEPTH — Luft-ADD-Band (Tracer, Blitze, Schockwellen, Funken)
1000000  FX_PARTICLE_DEPTH — NORMAL-Deckel (Rauch, neutrale Flipbooks)
```

Regel: **Alles Additive gehört in genau eines der zwei ★-Bänder.** Ein ADD-Objekt
im Weltband kostet zwei Batch-Breaks; die Bänder kosten konstant ~4 Flushes,
egal wie viele Objekte darin liegen (C1-Flush-Regel).

## 3. FX-Kit + Swap-Manifest (Paket 2/Platzhalter)

Alle neuen VFX-Texturen sind **weiße** prozedurale Frames in EINER 512er-
CanvasTexture `fx_kit` (`src/fx/fx_kit.ts`), gefärbt per `setTint` aus der
Palette (Tint bricht den Batch nicht, D1). **Swap-Punkt:** ein echtes PNG
`fx_kit` gleichen Layouts ersetzt den Canvas ohne Code-Änderung (`exists()`-
Gate, Konvention wie blood_system). Layout-Vertrag:

| Frame | Rect (x,y,w,h) | Nutzer |
|---|---|---|
| `ring` | 0,0,256,256 | Auren-Ringe (aura_ring) |
| `cloud` | 256,0,256,256 | Nebel-Wolken (ambient_fx) |
| `puff_0..7` | k·64,256,64,64 | Schornstein-Emitter + Loop-Füller |
| `tracer_core` | 0,336,64,8 | Tracer-Kern (projectile) |
| `tracer_halo` | 0,360,64,24 | Tracer-Halo |
| `glow_soft` | 128,336,128,128 | Glow-Flackern |

Zusätzlich `fx_mist_tile` (256er-POT, torus-nahtlos) für die zwei Nebel-
TileSprites — eigener Key, weil TileSprites nicht aus Atlas-Sub-Rects kacheln.
Weitere Swap-Punkte im Bestand: `SPLAT/EXPLO/SLOT_KEYS` (blood_system),
`glow_hellmuth_radial_512.png` (`tools/_gen/gen_glow_radial.py`).

## 4. Budgets + Messwerte (Beweise 2/3/5)

Harness: `node tools/gefecht_shot.mjs` (Muster phys_smoke; Canvas-Lauf für
Bild/Determinismus/GC, WebGL-Lauf mit `gl`-Hook für Draw-Calls). Messwerte:
`proof/gefecht/messwerte.json`. Gate-Lauf 2026-07-03, **alle 8 Prüfungen GRÜN**:

| Beweis | Soll | Ist |
|---|---|---|
| Draw-Calls Gefechtsbild (WebGL, swiftshader) | < 30 | **avg 23,6 / max 29** |
| Blend-Wechsel | kein Anstieg trotz VFX-Vollausbau | **13,0 nachher = 13,0 vorher** (bc24825) |
| Ambient-Tick | ≤ 1,5 ms | **0,025–0,09 ms** |
| Ambient-Objekte | ~220-Korridor (D3) | 67 auf der Testmap (skaliert mit Gebäuden/Zonen) |
| Heap 60 s Dauerfeuer | kein monotoner Anstieg | **+0,3 %** (290→291 MiB, Sägezahn) |
| Determinismus | 2 Läufe gleicher Seed identisch | Hash gleich; **13 Ring-Puls-Phasen bit-identisch**; Splatter-Hash-Test 5/5 |

**Blend-Bilanz ehrlich:** Die Testmap hat eine VFX-unabhängige Blend-Grundlast
von ~13 Wechseln/Frame (Bloom-Kamera-Pass, FoW, Selection — im Vorher-Build
identisch gemessen). Die Konsolidierung beweist sich darin, dass **~35 neue
ADD-Objekte** (13 Ringe, 4 Glows, 30 Tracer, 12 Wolken, 2 Nebel-Layer, Rauch)
**keinen einzigen zusätzlichen Break** kosten. Das wörtliche »genau ein
Blend-Break« ist mit Boden-Ringen UNTER und Tracern ÜBER den Einheiten
topologisch nicht erreichbar (zwei ADD-Bänder = ~4 Flushes) und gegen die
Bestands-Grundlast nicht messbar — Kriterium daher: kein Anstieg (belegt).

## 5. Determinismus-Architektur (Verbots-Umsetzung)

- **Sim-Uhr:** `gameState.simTick` (monoton, 30 Hz, in `stepSim` inkrementiert,
  in `__sim.setSeed` genullt). Ring-Puls und Glow-Flackern: `sin(simTick·ω +
  id·goldenAngle)` — Phase aus stabiler Objekt-id (movement-Muster), nie Wanduhr.
- **Splatter:** `src/fx/stamp_hash.ts` (Phaser-frei): Winkel/Flip/Skala/Variante
  und der 15-%-corpse-pulse-Würfel aus `hashXY(wx,wy[,salt])` → mulberry32 —
  reihenfolge-unabhängig, bit-identisch (tsx-Test `test/vfx/
  splatter_determinism.test.ts`, 5/5).
- **Tracer:** Position/Rotation 1:1 aus dem Sim-Zustand des Projektils
  (30-Hz-`stepSim`); nur der kosmetische Ausklang-Fade läuft auf Render-dt.
- **Nebel/Wolken:** Drift aus `simTick`, Positionen seeded (goldener Winkel).

## 6. Beweis 1 — Screenshot + ehrliche Differenzliste

`proof/gefecht/gefecht_vfx.png` (deterministisch: Seed 42, 46 Steps,
Fernkampf-Duell destillateur↔schleuderer + Nahkampf, `?renderer=canvas`).
Sichtbar: gestreckte Tracer entlang der Flugbahnen, Auren-Ringe unter den
HELLMUTH-Einheiten, Rauch-Puffs, Blut-Spritzer im Nahkampf, beide Fraktionen
feuern.

**Differenzliste gegen das Zielbild** (die drei Konzept-Screenshots sind nicht
im Repo committet, `selected/screenshots/` leer → Vergleich gegen die
Stilbriefing-V2-Beschreibung; Residuum R1):

1. **Tint im Capture:** Der Canvas-Renderer (headless-Capture-Zwang, WebGL-
   Framebuffer-Capture instabil) wendet `setTint` auf die ADD-Streifen nicht an
   → Tracer erscheinen weiß statt gold/magenta. Im WebGL-Build (echter Browser)
   greift die Palette. Beleg-Weg für Farbe: WebGL-Lauf ohne Screenshot misst
   dieselbe Szene; Farb-Screenshot braucht einen Lauf mit echter GPU.
2. **Platzhalter-Körper:** Einheiten sind Ellipsen, Gebäude Karten-Platzhalter —
   Asset-Swap ist per FX-Kit-Manifest ein reiner Textur-Tausch (Brief-Ziel).
3. **Dichte:** Die Testmap hat 4 Gebäude → 2 Schornsteine/4 Glows statt der
   Zielbild-Dichte; die Budgets (8/20) greifen auf volleren Karten.

## 7. Residuen

- **R1 Zielbilder:** nicht im Repo (`selected/screenshots/` leer). Pixel-Diff
  (odiff) gegen Zielbild 2 wird nachgereicht, sobald Ticro die drei
  Konzept-Screenshots eincheckt.
- **R2 Partikel-RNG:** Die Phaser-INTERNE Streuung der Rauch-Emitter
  (speed/lifespan-Ranges) ist Engine-Math.random — Brief-Bauform »Emitter«
  (D3-Empfehlung) gegen Determinismus-Verbot abgewogen: alle EIGENEN Größen
  sind seeded; Rauch ist sim-folgenlose Kosmetik ohne Hash-Beteiligung.
  Ein voll deterministischer Rauch wäre ein Loop-Sprite-Umbau (D3 §2).
- **R3 ground_mist:** bleibt Default AUS (Strang-11-Eigentum): zonen-gebunden an
  Editor-Maps UND durchgängig Math.random-getrieben — Aktivierung erfordert
  dessen De-Randomisierung (Folgeauftrag). Die Ambient-Nebelschicht ersetzt die
  Funktion global (andere Ebene, kein Doppelbau).
- **R4 fakeLight:** Container-gebundene Ressourcen-Glows bleiben ADD im
  Weltband (~2 Breaks je Quelle) — Container-Architektur; Umzug wäre
  Ownership-Umbau. In der Blend-Grundlast enthalten und gemessen.
- **R5 Blend-Grundlast:** ~13 Wechsel/Frame aus Bestand (Bloom-PostFX-Pass,
  FoW, Selection) — Kandidat für einen eigenen Render-Audit-Strang.
- **R6 production_glow-Tween:** pulst weiter auf der Render-Uhr (Bestand);
  deterministische Umstellung auf simTick wäre konsistent, war aber nicht
  Paket-Scope.
- **R7 Headless-FPS:** swiftshader rendert ~3–6 FPS → WebGL-Messfenster klein
  (15 Frames). Auf echter GPU nachmessen, wenn verfügbar.

## 8. Ausführbare Beweise (Wiederholbarkeit)

```
npm run build
npx tsx test/vfx/splatter_determinism.test.ts        # Splatter 5/5
PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  SHOT_DIR=proof/gefecht node tools/gefecht_shot.mjs  # Gate (8 Pruefungen)
# optional Vorher-Vergleich: BEFORE_DIR=<checkout bc24825>/hellmuth voranstellen
```
