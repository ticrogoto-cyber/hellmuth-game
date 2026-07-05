# NEBEL-TIEFE-SPEC — HELLMUTH (Atmosphären-Schicht, Code2)

Buildbare Gestaltung für die Nebel-Tiefe, getrennt nach **Strang 8** (atmosphärische Tiefe) und **Strang 11** (lokale Partikel), plus belegte Referenzwerte und ein Nebel-Gate. Additiv über FoW-Maske + Terrain-Umfärbung — bricht beide nicht.

Beleg-Notation: `[belegt]` benannte Quelle · `[abgeleitet]` aus Technik/Physik hergeleitet · `[Schätzung]` Prinzip ohne externe Zahl · `[Folklore]` oft zitiert, nie belegt · `[R:datei:zeile]` Repo @ `claude/quirky-fermat-8rewv0`.

---

## 0 · Die Leitplanke & der Befund, der alles bestimmt

> **Tiefe entsteht aus Schichtung, Drift, Kantenbehandlung, Parallaxe und Farbe — NIE aus mehr Deckkraft.** »Dichter Nebel« ist einer der vier Betäubungs-Effekte (Maxi-Runde 2). Das Schlachtfeld bleibt lesbares Protokoll. Jeder Wert hier ist gegen diese Regel geprüft: erhöht er Tiefe bei gleicher Lesbarkeit, oder erstickt er? Letzteres fliegt raus.

**Der harte Befund (gemessen):** Das Alpha-Budget hat nur **~0,04 Headroom** zum 0,55-Deckel (gemessene Spitze p99 ~0,51) `[R:fog_render.ts:24-25]`. Eine weitere vollflächige Lage gleicher Bauart würde den Deckel reißen = Erstickung. **Tiefe ist daher ein RE-BUDGET, keine Addition:** die heutige eine NORMAL-Lage in 3–4 dünnere Parallaxe-Lagen aufteilen, deren Over-Blend-Summe ≤ heute bleibt. Mehr Parallaxe bei *gleicher oder geringerer* Deckkraft.

**Messbasis (heute, 2 Lagen):** NORMAL `ALPHA_BASE=0.28` + ADD `ALPHA_ADD=0.05`, `TEX_MAX=0.85`, Tint `0x9fb6c8`, Drift base {x:7,y:2.5} / add {x:−4.5,y:−1.8}, `TILE_WORLD=10·TILE_WIDTH=1600`, `ADD_SCALE=1.37`, geteilte Plasma-Textur (5 ganzzahlige sin·cos-Terme, `pow(c,1.5)`, garantiert kachelnd), 2 Draw-Calls konstant, FoW als radiale BitmapMask auf beide Lagen `[R:fog_render.ts:21-36,124-125,201-245]`. Drift ist deterministisch gegeben den dt-Strom (reines `tilePos += DRIFT·dt`, kein Random) `[R:fog_render.ts:89-94]`.

---

## 1 · Belegte Referenzwerte (Deliverable 2)

**Kernbefund (ehrlich):** Kein Referenz-Spiel veröffentlicht seine konkreten Nebel-Internas (Alpha, Lagen-Anzahl, Drift px/s). Belegbar sind die **Technik-Klasse** und die **Parallaxe-Korridore**.

| Größe | Belegter Wert / Korridor | Quelle | Tag |
|---|---|---|---|
| Parallaxe-Geschwindigkeits-Differenz | 0,2–0,5 zwischen Lagen natürlich; **>0,7 vermeiden** (Motion Sickness) | Parallax-Praxis (moonjump/builder.io) | [belegt] |
| Lagen-Anzahl | **3–5** für überzeugende Tiefe | Parallax-Praxis | [belegt] |
| Tiefenabhängige Nebelfarbe | Nebelfarbe (Transparenz + Value) **über Tiefe blenden** statt flach; Vorder-/Hinter-Farbe unabhängig | Ori GDC 2015; Hollow Knight | [belegt] |
| Farbtemperatur | kühles Blau-Grau als Stimmungs-Tint (`#6b7c94`/`#495b69`-Band); `0x9fb6c8` liegt korrekt drin | Silent-Hill-Paletten | [belegt für Band] |
| FBM (Noise) | Oktaven 4–6, Gain 0,5, Lacunarity 2,0; abs() = billowy | Book of Shaders / Quilez (verbatim) | [belegt] |
| Schwell-Maskierung | `smoothstep(0.3,1.0,noise)` → Schwaden statt Schleier | Godot Fog Shader | [belegt] |
| **Negativbeleg** | Atmosphären-Düsternis + FoW-Düsternis NICHT im selben Tonwertkeller → Zustands-Kollaps | They Are Billions »zu dunkel« (Steam) | [belegt] |
| Boden-Schwaden 2. Ebene | bodengebundene getönte Schwaden in iso (Caustic-Ground-Idiom) | PoE Wiki | [belegt für Idiom] |

**Folklore (NICHT als Referenzwert nutzen):** exakte Lagen-/Alpha-/Drift-Werte der konkreten Spiele (nirgends öffentlich); `0x9fb6c8` als »offizieller Silent-Hill-Wert« (= HELLMUTHs Eigen-Hommage, plausibel im SH-Band, nicht aus SH extrahiert).

---

## 2 · STRANG 8 — Atmosphärische Tiefe (Re-Budget 2 → 4 Lagen)

**Prinzip:** Die zwei vorhandenen Lagen bleiben als »mittlere« (L1) + »ADD-Schimmer« (L3); zwei neue kommen dazu — eine **ferne** (groß, langsam, kühlster Tint) und eine **nahe** (klein, schnell, Akzent). Alle teilen dieselbe Wisp-Textur + dieselbe BitmapMask (FoW/Terrain unberührt). 4 TileSprites = **4 Draw-Calls konstant** (`fogtest` würde [4,4,4]). Konstanten gehören in einen `ATMO_FOG`-Block in `balance.ts` (heute hart in `fog_render.ts`) `[R:fog_render.ts:20-36]`.

### Lagen-Tabelle (empfohlen)

| Lage | Rolle | Alpha | Skala (×`TILE_WORLD`) | Drift x/y (Welt-px/s) | Blend | Tint |
|---|---|---|---|---|---|---|
| **L0 fern** | Tiefen-Wash, kühlster Tint | **0.10** | **1.65×** | **{3.0, 1.1}** | NORMAL | `0x8fa8be` (kühler/blasser) |
| **L1 mittel** (= heute) | Grundschleier | **0.18** *(von 0.28 gesenkt)* | **1.00×** | **{7, 2.5}** (unverändert) | NORMAL | `0x9fb6c8` |
| **L2 nah** | Detail-Schwaden | **0.07** | **0.62×** | **{−9.5, −3.4}** | NORMAL | `0x9fb6c8` |
| **L3 ADD** (= heute) | Schimmer | **0.05** (unverändert) | **1.37×** (`ADD_SCALE`) | **{−4.5, −1.8}** (unverändert) | ADD | `0xb4c6d6` (heller) |

[Einzel-Alphas: Schätzung, in der Summe belegt · Drift/Skala: abgeleitet aus Parallaxe-Korridor + vorhandenem `DRIFT_BASE`]

**Over-Blend-Rechnung (NORMAL ist NICHT additiv: `a_out = 1 − Π(1−aᵢ·TEX_MAX)`):**
```
L0:  0.10·0.85 = 0.085
L1:  0.18·0.85 = 0.153
L2:  0.07·0.85 = 0.0595
Stack = 1 − (1−0.085)(1−0.153)(1−0.0595) = 1 − 0.7289 = 0.271
+ ADD-Schimmer (0.0425, addiert nur Lichtwert) → visuelle Obergrenze ≈ 0.314 < 0.55 ✓  (Marge ~0.24)
```
**`[belegt: Rechnung]`** Die heutige Einzel-Lage 0.28 **MUSS auf 0.18 sinken**, sonst rissen zwei zusätzliche Lagen das Budget. Tiefe kommt jetzt aus Schichtung, nicht aus L1-Deckkraft.

**Konservativer Alternativ-Satz** (gleichmäßiger verteilt, Over-Blend **0.252**): L0 0.085 / L1 0.080 / L2 0.070 / L3 ADD 0.045 — wenn mehr Marge gewünscht.

### Parallaxe-Spannen
Skalen-Spanne 1.65/0.62 = **2.66×**, Geschwindigkeits-Spanne 9.5/3.0 = **3.17×**; gegenläufige Drift (L0,L1 mit +, L2,L3 mit −), Beträge gestaffelt (fern langsam → nah schnell). Geschwindigkeits-Differenzen liegen im belegten 0,2–0,5-Korridor `[belegt]`. Skalen-Verhältnisse irrational-nah zu 1.0 und `ADD_SCALE` 1.37 → quasi-aperiodisch, kein sichtbarer Schwebungs-Loop `[plausibel]`.

### Alpha-Kurve & Kantenbehandlung
- **Schwell-Maskierung in der Textur:** `c = smoothstep(0.42, 0.72, c)` vor dem `TEX_MAX`-Deckel → unteres Drittel = **transparente Löcher** (Durchsicht garantiert), oberes = Schwaden statt Schleier `[belegt: smoothstep-Muster]`. Schmaler als das belegte 0.3–1.0 → härtere, lesbarere Ballen.
- **Alpha-over-distance** ist durch die gestaffelten Lagen-Alphas (0.10/0.18/0.07/0.05) realisiert: fern blasser, mittlere trägt, nah nur Akzent `[belegt: atmosphärische Perspektive]`.
- **Weiche Zonen-Kante** = die bestehende radiale BitmapMask (Mitte=Dichte, Rand=0), unverändert.

### Farb-/Tiefen-Behandlung
Tiefen-Tint-Gradient pro Lage (reine `setTint()`-Staffelung, null Mehrkosten): fern `0x8fa8be` (kühler/blasser), mittel/nah `0x9fb6c8` (Basis), ADD `0xb4c6d6` (heller). Fern = kühler/entsättigter = belegtes Atmosphären-Perspektive-Prinzip `[belegt]`. **Kein Farbersatz, nur Temperatur-/Helligkeits-Modulation.**

### Noise-Rezept (Domain-Warp VERBOTEN)
- **Plasma behalten** (garantiert kachelnd) + **2 ganzzahlige Hochfrequenz-Terme** (z. B. `{fx:7,fy:5,a:0.14}`, `{fx:6,fy:8,a:0.1}`) → FBM-artige 7-Oktaven-Granularität, bleibt exakt kachelnd. Amplituden im Gain≈0,5-Abfall (1.0→0.6→0.45→0.28→0.2→0.14→0.1) `[belegt: FBM-Profil]`.
- **Optional billowy:** ein `abs()`-Term `+0.18·abs(sin(τ·3·u)·cos(τ·4·v))` VOR `smoothstep` — nur mit `TEX_MAX`-Deckel, sonst raus `[belegt: abs()-Turbulenz]`.
- **⚠ Domain-Warp NICHT in der Textur:** Warp verschiebt den Definitionsbereich nicht-periodisch → die TileSprite-Kachel reißt eine **sichtbare Naht quer übers Schlachtfeld**. Im welt-getilten TileSprite verboten. Upgrade-Pfad: echtes tileable Value-Noise auf Torus (`mod`-Domain) ohne Warp `[belegt: Quilez-Warp bricht Periodizität]`.

### Tiefe-ohne-Deckkraft — Hebel-Ranking (für die Tuning-Reihenfolge)
1. **Differenzielle Drift (Motion-Parallaxe)** — stärkster 2D-Tiefen-Cue (Spreizung ~3,2×), Kosten ~0. `[belegt]`
2. **Skalen-Re-Budget** — Größenstaffelung, Over-Blend ≤ heute. Fundament.
3. **Kanten-Feathering** (smoothstep) — Tiefe durch Form; kann Lesbarkeit sogar erhöhen.
4. **Atmosphärische Perspektive** (Tint-Gradient) — billiger Cue, gedeckelt dosieren.
5. **Vignette / Y-Gradient** — schwächster Cue, **Erstickungs-Risiko in der Karten-Mitte → Default AUS**, nur Ränder/Horizont.

### Lesbarkeits-Selbstprüfung (Leitplanke pro Wert)
Alle vier Lagen + smoothstep + Tint-Gradient + Hochfrequenz-Terme: **Tiefe↑ bei gleicher Lesbarkeit** (keine addiert vollflächige Deckkraft; L1-Senkung erhöht Lesbarkeit sogar). **Rausgeflogen:** Domain-Warp (Naht), 5. NORMAL-Lage (Budget), Vignette in der Mitte (Erstickung).

---

## 3 · STRANG 11 — Lokale Nebel-Partikel (dezentes Salz)

**Leitsatz: Trägheit vor Partikel.** Die globale Schicht trägt die Tiefe bereits. Lokale Partikel sind reines Salz → **Default-Empfehlung: bauen, aber per Flag standardmäßig AUS**, nur auf den dichtesten Zonen testweise zuschalten. Zwei Typen, beide NORMAL, beide getönt `0x9fb6c8`, beide gepoolt mit Hard-Cap. Neue Datei `src/fx/ground_mist.ts`, registriert am `FxService` wie `registerCoreFx`; Treiber-basiert (live[]/free[] + `ctx.drive`) nach dem `debris_system`/`tickSparks`-Muster `[R:src/fx/fx_pool.ts; src/systems/debris_system.ts]`. Spawn nur an Zonen mit `density > 0.8` (der im Code genannte Schwellwert) `[R:fog_render.ts:11-12]`. Depth `-63000` (knapp über der globalen Schicht, unter Einheiten).

### Typ A — Bodennebel-Schwade (`ground_mist`)
| Parameter | Wert | Tag |
|---|---|---|
| Textur | `FX_PUFF_KEY` (radial, pow 1.3) | [belegt: eigener Code] |
| Blend / Tint | NORMAL / `0x9fb6c8` | [belegt] |
| Cap gleichzeitig | **16** | [Schätzung] |
| Spawn-Frequenz | alle **700 ms** / Zone | [Schätzung, abgel. von `mist` 600] |
| Lebensdauer | **5000–8000 ms** | [Schätzung] |
| Drift (vx, vy screen) | vx ∈ ±6 px/s, vy ∈ +1…+3 px/s | [Schätzung] |
| Mäander | Sinus auf vx, Amp ≈4 px/s, Periode 3,5–5 s, phasenversetzt | [Schätzung] |
| Größe-Verlauf | scale 0.45 → 0.80 (langsame Expansion) | [Schätzung] |
| **Alpha-Hügel** | 0 → **Peak 0.08** (~35 % Life) → 0 | [Schätzung, Compositing-geprüft] |
| Rotation | ≤ 0,15 rad/s | [Schätzung] |

### Typ B — Driftende Fetzen (`mist_wisp`)
| Parameter | Wert | Tag |
|---|---|---|
| Textur | `FX_WISP_SOFT_KEY` = `ensureRadial(…,256,1.05)` (breit/weich) | [Spec] |
| Blend / Tint | NORMAL / `0x9fb6c8` | [belegt] |
| Cap gleichzeitig | **4** | [Schätzung] |
| Spawn-Frequenz | alle **2500–4000 ms** | [Schätzung] |
| Lebensdauer | **9000–14000 ms** | [Schätzung] |
| Drift (vx, vy) | vx ∈ ±8…12 px/s quer, vy ≈ ±2 | [Schätzung] |
| Größe-Verlauf | scale 1.2 → 1.8 (riesig) | [Schätzung] |
| **Alpha-Hügel** | 0 → **Peak 0.07** (~40 % Life) → 0 | [Schätzung, Compositing-geprüft] |

### Compositing-Garantie (≤0,55 mit der Grundschicht)
Lokale Partikel blenden NORMAL über die Grundschicht-Spitze (~0,51): `a_out = a_top + a_bg·(1−a_top)`.
```
Typ A Peak 0.08:  0.08 + 0.51·0.92 = 0.549 < 0.55 ✓   (0.10 ergäbe 0.559 > 0.55 → DESHALB 0.08)
Typ B Peak 0.07:  0.07 + 0.51·0.93 = 0.545 < 0.55 ✓
```
**`[belegt: Rechnung]`** Der eine Wert, der vor Build fix sitzt: **Typ-A-Peak = 0.08** (nicht 0.10).

### Pooling / Drossel / Anti-Leck
- `acquire`/`release` über den vorhandenen `FxPool`; Hard-Cap → bei Erreichen kein Spawn. Globaler `TOTAL_MIST_CAP = 28` gegen Mehrzonen-Akkumulation. Treiber gibt bei `k≥1` zwingend `release()` + Swap-Pop frei; Treiber endet (`return false`), wenn die Zone inaktiv wird. `pool.stats()` macht ein Leck sichtbar (live wächst monoton = Bug) `[R:src/fx/fx_service.ts]`. Alle Bewegungen `·dt` (framerate-robust).

### Dichte-Presets (Ticro wählt Default)
- **MINIMAL:** nur Typ A, Cap 8, Frequenz 1000 ms, Peak 0.06.
- **STANDARD** (oben): Typ A Cap 16 + Typ B Cap 4, Peaks 0.08/0.07.
- **DICHT:** Typ A Cap 24 + Typ B Cap 6 — **nur wenn die Compositing-Rechnung pro Karte/Zoom bestätigt, dass ≤0,55 hält.**

---

## 4 · Fraktions-Tint des Nebels ⚠ OFFENE ENTSCHEIDUNG TICRO

**Datenlücke (entscheidend):** `MapFog` hat **kein** Fraktions-/Owner-Feld (nur col/row/radius/density) `[R:map_format.ts:68-75]`. Jeder Territorial-Tint braucht entweder ein neues `MapFog.faction?` (+ Editor-Pinsel + Roundtrip) **oder** eine Laufzeit-Ableitung aus den Gebäude-/Transform-Distanzfeldern. terrain_transform tönt heute via Max-Komposit auf Fraktions-Sorten (MODERAT→`erde-tot` dunkel, HELLMUTH→`klarflur` grün) `[R:terrain_transform.ts:113-145; terrain_assets.ts:128-134]`; der Nebel ist global neutral (`0x9fb6c8`).

| | **A · Neutral** | **B · Dezent getönt** | **C · Asymmetrisch thematisch** |
|---|---|---|---|
| Was | `0x9fb6c8` global, unverändert | 2. Tint-Lage: HELLMUTH grünlich / MODERAT magenta, niedrige Sättigung, additiv | Nebel **lichtet** sich über HELLMUTH (weniger Alpha), **verdichtet** über MODERAT (mehr Schwaden, gedeckelt); Tint bleibt neutral |
| Thema | keiner | mittel | **hoch** (»Hellmuth« als Mechanik) |
| Lesbarkeit | beste | **Risiko hoch** (Magenta-Nebel über magenta-Terrain frisst Kontrast) | niedrig–mittel (Tint neutral, kein Clash) |
| Aufwand | null | mittel (+Lage+Maske+Daten) | mittel–hoch (Masken-Deckung pro Fraktion) |
| ≤0,55 | unberührt | Base-Alpha leicht senken | HELLMUTH senkt (gut), MODERAT hart `Math.min(…,<0.55)` |

**Empfehlung (Vorschlag, Ticros Wahl):** **C konservativ gedeckelt** — die einzige Option, die die »Hellmuth«-These in Mechanik statt Farbe übersetzt und das Magenta-auf-Magenta-Problem umgeht. Falls kein neues `MapFog`-Feld gewünscht: **A** (null Kosten). **Warnung gegen B:** Magenta-Nebel über magenta-getöntem MODERAT-Terrain (`erde-tot` + `0xff3bd0`-Welt) frisst Silhouetten.

---

## 5 · Das Nebel-Gate (erweitert `editor_browser.mjs`)

Fünf maschinelle Checks. **`src/editor/gate.ts` (`runGate`) NICHT anfassen** — bleibt Naht-Wächter. Vier Checks docken an bestehende Kommandos an; die render-basierte Lesbarkeit liefert der neue Standalone-Prüfer `tools/fog_depth_gate.py` (committed). Render-Diff **relativ (mit/ohne Nebel im selben Lauf)**, NICHT absolut gegen ein PNG — SwiftShader rendert blasser, ein PNG-Vergleich wäre fragil; `proof/05_fog_of_war.png` ist das **Spiel-FoW**, nicht der Editor-Nebel `[R:editor/fog_render.ts vs systems/veil_system.ts]`.

| Check | Andockstelle | Methode | Schwelle | Fail |
|---|---|---|---|---|
| **(a) Alpha-Deckel** | `fogalpha` (existiert) `[R:editor_browser.mjs:531]` | p99 des rekonstruierten Alpha-Beitrags | `p99 ≤ 0.55`, `n > 100` | p99 > 0.55 |
| **(b) Einheiten-Erkennbarkeit** | NEU: `fogdepth`-Kommando → `fog_depth_gate.py` | Test-Sprite-ROI mit/ohne Nebel, Sobel-Kantenenergie-Erhalt `E_fog/E_clean` + RMS-Std-Erhalt | beide ≥ **0.60** | einer < 0.60 |
| **(c) Terrain-Erkennbarkeit** | dito, ROI über Terrain-Kante | Sobel + Std mit/ohne Nebel | beide ≥ **0.55** | einer < 0.55 |
| **(d) Drift-Determinismus** | NEU: Editor-API `fogDrift()` | zwei `update()`-Läufe mit identischem dt → identische `tilePosition` | `|Δ| < 1e-6` | jede Abweichung |
| **(e) Partikel-Pool-Leck** | `robusttest` (neuer Fall) | Partikel-/Draw-Call-Zahl über N Frames stabil | `count(t)=count(0)` | Wachstum (heute No-Op, da Partikel ungebaut) |

**Editor-API-Ergänzungen für Code2** (klein, in `editor_scene.ts` neben `fogStats`): `fogDrift() → [{x,y}×4]` (tilePosition JE LAGE — **Korrektur ggü. der ursprünglichen 2-Lagen-Notation `{bx,by,ax,ay}`: bei 4 Parallaxe-Lagen ist ein Array je Lage die ehrliche Form; der Determinismus-Vergleich deckt damit alle vier**); plus `fogResetDrift()`/`fogStep(dtMs)` für den deterministischen Zwei-Lauf-Vergleich; `fogParticleStats() → {count}` (heute 0). **`fogdepth`-Kommando in `editor_browser.mjs`:** rendert die Kontrollszene (Hochkontrast-Objekte obere Hälfte, Terrain-Kante untere) **ohne** Nebel (`without.png`) und **mit** maximaler Nebelquelle (`with.png`), ruft `python3 tools/fog_depth_gate.py --dir …` UND prüft den Drift-Determinismus über `fogDrift()` im selben Lauf.

### Die »nicht brechen«-Garantie
- **Draw-Call-Deckel bleibt klein:** `fogtest` hält `drawCalls 1..2` (bei 4 Lagen → 4; die Schwelle in `fogtest` ist auf die Lagenzahl anzupassen, der Konstanz-Test bleibt) `[R:editor_browser.mjs:469]`. Partikel dürfen den Deckel nicht sprengen (Grund, warum sie heute draußen sind).
- **`fogtest` bleibt grün** (`ed.gate()` mit Nebel) → kein Terrain-Naht-Eingriff (Tiefe liegt im Band −68000…−64000, additiv über der Maske).
- **FoW-Maske unberührt:** neue Lagen LESEN dieselbe BitmapMask (`setMask`), allokieren sie nicht neu; `robusttest` (B) `texAfter==texMid` deckt Maskenstabilität ab `[R:editor_browser.mjs:684]`.
- **Terrain-Umfärbung unberührt:** Nebel und delta-Overlay sind disjunkt; neue Nebel-Checks rufen kein `addTransform`/`pumpTransform`.
- Additiv heißt: neue Asserts NUR ergänzen, bestehende Schwellen NICHT lockern.

---

## 6 · OFFENE ENTSCHEIDUNGEN TICRO — Sammelliste

| # | Thema | Default-Vorschlag | § |
|---|---|---|---|
| A | Fraktions-Tint (Neutral / getönt / asymmetrisch) | **C konservativ**, sonst A | 4 |
| B | `MapFog.faction?`-Feld (datengetragen) vs Laufzeit-Ableitung | Laufzeit-Ableitung, falls B/C | 4 |
| C | Lagen-Anzahl 4 (Parallaxe) vs 3 (robuster) | **4** | 2 |
| D | Farbtemperatur-Gradient-Stärke (Tint-Spreizung) | moderat (`0x8fa8be…0xb4c6d6`) | 2 |
| E | Vignette / Y-Gradient | **aus** (nur Ränder, falls an) | 2 |
| F | Lokale Partikel: aus / nur Typ A / Typ A+B | **aus default**, Preset STANDARD bei Bedarf | 3 |
| G | Alpha-Deckel 0.55 vs konservativer (0.52) | **0.55** | 5 |
| H | Kanten-Erhalt-Schwellen (0.60/0.55) | an echten Sprites einschießen | 5 |

---

## 7 · Zusammenfassung für Code2

1. **Strang 8:** `fog_render.ts` von 2 auf 4 Lagen (Tabelle §2), L1-Alpha 0.28→0.18, Tint-Gradient, smoothstep(0.42,0.72) + 2 Hochfrequenz-Plasma-Terme. **Kein Domain-Warp.** Konstanten nach `balance.ts ATMO_FOG`.
2. **Strang 11** (optional, Default aus): neue `src/fx/ground_mist.ts`, zwei Partikel-Typen, Peak-α 0.08/0.07, Pool wie debris, Spawn bei density>0.8.
3. **Gate:** `fogDrift()`/`fogParticleStats()` in `editor_scene.ts`, `fogdepth`-Kommando in `editor_browser.mjs` → `tools/fog_depth_gate.py`. `fogalpha` (0.55) bleibt.
4. **Unberührt:** FoW-Maske, terrain_transform, `gate.ts`, minimap_fog.

*Jede Zahl mit Quelle/Tag. Offene Gestaltung als Ticro-Entscheidung markiert, nicht erfunden. Maschinelle Abnahme: `tools/fog_depth_gate.py` + die erweiterten `editor_browser.mjs`-Gates.*
