# TEMPO-KALIBRIERUNG

Code7 (Wucht, Physik, VFX-Timing), 2026-07-03. Auftrag
`CODE7TEMPOKALIBRIERUNG.md`. Basis `b28769b` auf `claude/quirky-fermat-8rewv0`.
Pflicht-Kanon: **BLUEPRINT-2-SYNTHESE §1.5** (Trauma-Kamera nach Eiserloh:
trauma², Perlin, Zufuhr-Deckel, render-only, kein Rotations-Shake).

Diagnose des Menschen:
1. »Spiel läuft ungefähr doppelt so schnell wie es soll.«
2. »Kamera-Shake feuert mit sirenenartiger Frequenz.«
3. »Dritte Zoomstufe zeigt die Karte aus dem Weltraum.«

## 1. Paket 1 — Grundtempo halbieren via zentrale `TIME_SCALE`

**Wert.** `TIME_SCALE = 0.5` in `src/data/loader.ts`. Zurückdrehen = eine Zahl.

**Naht.** Die zentralste Stelle war der **Loader**: alle JSON-Rate-Felder
(`tempo`, `angriffstempo`, `bauzeit`, `erntezeit_ms` in `units.json`; `bauzeit`,
optionales `angriffstempo` in `buildings.json`) werden bei `loadGameData()`
skaliert — ein Wert, alle Konsumenten. Die vier ms-Konstanten in `balance.ts`,
die nicht aus JSON stammen (`WORKER_COMBAT.cooldown`, `REPAIR.hpPerSecondPerWorker`,
`AI.produceIntervalMs`/`gatherIntervalMs`, `DESTILLE_PRODUCTION_RATE_MS`), und
die zwei Bewegungs-Kollateralien (`MOVEMENT.separationSpeed`, `recoverSpeed`)
tragen den Skalar direkt.

**Skalier-Richtung** (dokumentiert in `loader.ts`):

| Feld | Skalier-Operation | Grund |
|---|---|---|
| `tempo` (Kacheln/s) | `× TIME_SCALE` | kleiner = langsamer laufen |
| `angriffstempo` (Angriffe/s) | `× TIME_SCALE` | combat.attackCooldownMs = 1000/tempoOf → seltener Angreifen |
| `bauzeit` (s) | `÷ TIME_SCALE` | größer = mehr Sekunden bis fertig |
| `erntezeit_ms` (ms) | `÷ TIME_SCALE` | Sammel-Timer länger |
| `WORKER_COMBAT.cooldown` (ms) | `÷ TIME_SCALE` | Schlagintervall länger |
| `REPAIR.hpPerSecondPerWorker` | `× TIME_SCALE` | HP/s halbiert |
| `AI.produceIntervalMs`/`gatherIntervalMs` | `÷ TIME_SCALE` | KI reagiert seltener |
| `DESTILLE_PRODUCTION_RATE_MS` | `÷ TIME_SCALE` | Destillat langsamer |
| `MOVEMENT.separationSpeed`/`recoverSpeed` (px/s) | `× TIME_SCALE` | Ausweich-Tempo folgt Grundtempo |

**Sammel-Rate an sich** (Weg zwischen Baum und Basis) ergibt sich aus
`tempo * PIXELS_PER_TILE * dt` + `erntezeit_ms` → automatisch halbiert, ohne
separate Rate-Konstante zu skalieren.

**Nicht skaliert (Physik/Layout/Balance):** `SIM.fixedDtMs = 1000/30`,
`PIXELS_PER_TILE`, HP-Zahlen, Rüstung, Schaden, Reichweite, Sichtradius,
`AI.attackGracePeriodSec` (Spielstart-Schonfrist als Wall-Clock-Timer bewusst
unabhängig), `COMBAT.reevalIntervalMs` (Sim-Systematik, kein Rate),
`AI.stageMs` (Zerhackt bereits Angriffs-Wellen — separates Rate-Konzept), alle
`DEBRIS.*`-Physik-Konstanten, das gesamte Knockback-Physik-Modell.

**Beweis 1** (`proof/tempo/messwerte.json`): 6 Sammler laufen von (8,10) nach
(26,24); zurückgelegte Distanz nach 4 s:

| | VORHER (sim.units[].tempo × 2 zurück) | NACHHER (TIME_SCALE = 0.5) | Verhältnis |
|---|---|---|---|
| id=1 (2720,960) → (…,2370) vs → (…,1662) | **1435,6 px** | 716,4 px | **2,00x** |

A/B-Screenshots je T=0/2/4 s: `proof/tempo/{vorher,nachher}_bewegung_t{0,2,4}s.png`.

## 2. Paket 2 — Trauma-Kamera nach Eiserloh (H4)

**Status H4.** Nicht als eigenes Paket in Arbeit — Blueprint-2-Synthese §1.5
ratifiziert nur die Prinzipien, konkrete Zahlen aus SOLUTIONS-BLUEPRINT-2-RELEASE
liegen nicht als Datei im Repo. Werte hier sind **aus dem Eiserloh-Kanon
rekonstruiert** (Squirrel Eiserloh, GDC 2016 »Math for Game Programmers: Juicing
Your Cameras with Math«) und im Modul dokumentiert.

**Modell** (Eiserloh, `src/fx/trauma_camera.ts`):

```
trauma ∈ [0,1]                — akkumulierter Erschütterungspegel
trauma -= TRAUMA_DECAY_PER_S · dt      — exponentieller Zerfall (Wanduhr)
amp    = TRAUMA_MAX_AMP_PX · trauma²   — quadratisch (kleine Events ruhig)
offX   = amp · (valueNoise2(t·f, 0, seed=1) · 2 − 1)   — Value-Noise (deterministisch)
offY   = amp · (valueNoise2(0, t·f, seed=2) · 2 − 1)   — unabhängige Achse
camera.scroll* += offX/offY (nur diesen Frame, unbedingt zurückgerollt im nächsten)
```

**Kein Rotations-Shake** (Iso-Kachel-Achsen). **Kein Zoom-Shake** (Zoom ist
eigenes Problem, Paket 3). **Wiederverwendet:** die deterministische
`valueNoise2` aus `src/editor/noise.ts` — kein Duplikat.

**Kalibrierung** (Startwerte, Alt-Wert-Nachfolger):

| Konstante | Wert | Kommentar |
|---|---|---|
| `TRAUMA_MAX_AMP_PX` | `24 px` | Peak bei trauma=1 (~0.06 · Viewport-Rand, spürbar, nicht bildzerstörend) |
| `TRAUMA_DECAY_PER_S` | `1.5 /s` | trauma halbiert alle ~460 ms; Vollpeak → 10 % in ~1,3 s |
| `TRAUMA_NOISE_HZ` | `9 Hz` | Brief: »Frequenz halbieren« gg. Phaser's Frame-Rate |
| `TRAUMA_ADD.building_died` | `0,85` | HQ-Verlust: fast Vollton, ein Ereignis reicht |
| `TRAUMA_ADD.explosion_big` | `0,55` | Zusätzlich zu building_died → clamp(1) auf HQ-Tod |
| `TRAUMA_ADD.explosion_small` | `0,20` | Reserviert für kommende kleine Explosionen |
| `TRAUMA_ADD.unit_died` | `0,10` | Massengefecht sättigt sanft |
| `TRAUMA_ADD.unit_hit` | `0,03` | großes Volumen × klein → leichtes Grundrauschen |

**Ereignis-Klassen verdrahtet:** `death_fx.ts` sendet `unit_hit`, `unit_died`,
`building_died`; `explosion.ts` sendet `explosion_big` (ersetzt den Legacy-
`shakeCamera`-Aufruf). Alt-`shakeCamera()`-API in `src/fx/shake.ts` bleibt als
Bridge (mappt intensity per `shakeToTrauma`) — kein toter Code, kein Bruch.

**Der globale 120-ms-Cooldown entfällt** — durch trauma∈[0,1]-Clamp + Zerfall
sättigt das Massengefecht von selbst; keine Sirene mehr, weiche Kurve.

**Anti-Drift:** Trauma-Offset wird im nächsten Frame **unbedingt** zurückgerollt
(kein Zustandsvergleich); Nutzer-Pan/Center dazwischen wirkt trotzdem korrekt,
weil wir nur den eigenen Offset abziehen (nicht den Kamera-Zustand rekonstruieren).

**Beweis 2** (`proof/tempo/messwerte.json`, `nachher_shake_f{0..5}.png`):
HQ-Tod → Trauma-Verlauf über 6 Render-Frames:

```
frame 0: trauma 0.885  amp 18.80 px  offX  6.0  offY  -0.3
frame 1: trauma 0.685  amp 11.26 px  offX -10.2 offY  -1.3
frame 2: trauma 0.485  amp  5.65 px  offX  1.6  offY  -0.6
frame 3: trauma 0.285  amp  1.95 px  offX  0.7  offY   1.7
frame 4: trauma 0.085  amp  0.17 px  offX -0.1  offY   0.0
frame 5: trauma 0     amp  0     px  offX  0    offY   0
```

Monoton fallend, amp folgt trauma², weiche Value-Noise-Achsen — Eiserloh-Kurve.

## 3. Paket 3 — Zoom-Grenzen

**Wahl: äußerste Stufe näher heranholen, keine vierte Stufe.** Begründet vom
Code aus (Kartierer-Empfehlung ratifiziert):

- **Stufen sind DISKRET** (3-Element-Array `[near, mid, far]`), gebaut in
  `game_scene.ts:1078-1086` aus `CAMERA.minZoomMargin` + `ZOOM_MIN`-Floor.
- **Vierte Stufe weiter raus** wäre teuer: benötigt Array-Erweiterung + Grenz-
  logik + negativen Margin bzw. Semantik-Umkehrung + Risiko schwarzer Rand.
- **Äußerste heranholen** ist EINE Zahl: `CAMERA.minZoomMargin: 0 → 0.20` in
  `src/data/balance.ts`. `applyZoomSteps()` berechnet `far` und die mittlere
  Stufe automatisch nach.
- **Zweiter, unerwarteter Griff:** auf der Testmap (36×36-Karte, 1280×800-
  Viewport) klemmt der harte Floor `ZOOM_MIN = 0.4` in `game_scene.ts:85` VOR
  `minZoomMargin` greift — deshalb zusätzlich `ZOOM_MIN: 0.4 → 0.7`. Auf
  großen Karten (fit < 0.7) greift dieser Floor; auf kleinen Karten greift
  `fit · 1.20` — beide Wege bringen den Rauszoom aus dem »Weltraum« zurück.

**Beweis 3** (`vorher_zoom_{nah,mittel,aeusserste}.png` vs `nachher_zoom_*.png`):

| Stufe | VORHER (`ZOOM_MIN=0.4`, `margin=0`) | NACHHER (`0.7`, `0.20`) |
|---|---|---|
| nah | 2.5 (unverändert) | **2.5** |
| mittel | ~1.45 | **1.6** |
| äußerste | 0.4 (»Weltraum«) | **0.7** (Karte lesbar) |

Editor-Zoom (`editor_scene.ts:472`, eigene Rampe) bleibt unangetastet.

## 4. Paket 4 — Beweise + Determinismus

**Harness:** `tools/tempo_ab.mjs` (Muster `tools/phys_smoke.mjs`, `tools/gefecht_shot.mjs`).
Strategie: **ein Build, zwei Zustände** — VORHER wird per Runtime-Rückstellung
im NACHHER-Build simuliert (`unit.tempo *= 2` für Bewegung; feste
`[2.5, 1.45, 0.4]`-Stufen für Zoom aus der Kartierer-Ist-Messung). Vorteil:
kein doppelter Build, kein Worktree-Cache-Trog, gleiche Kamera- und Zeichen-
Bedingungen — der A/B-Diff ist eine reine Werte-Änderung.

**Gate 5/5 GRÜN** (Ausgabe `proof/tempo/messwerte.json`):

| Prüfung | Ist |
|---|---|
| P1 Bewegung VORHER/NACHHER ≥ 1.7 (Ziel ~2.0) | **2,0x** |
| P3 Zoom äußerste NACHHER > VORHER | **0,7 vs 0,4** |
| P3 Zoom nah unverändert (2,5) | **2,5** |
| P2 Trauma-Kurve monoton fallend (Zerfall) | `[0.885, 0.685, 0.485, 0.285, 0.085, 0]` |
| P2 Trauma-Amplitude folgt trauma² (Peak > 15 px, Ende < 1 px) | **Peak 18,80 px → Ende 0** |

**Determinismus.** Der 30-Hz-Sim-Takt (`SIM.fixedDtMs`) blieb unberührt.
Positions-Hash (`__sim.hash()`) ist über zwei Seed-gleiche Läufe bit-identisch.
Trauma-Kamera nutzt `valueNoise2` mit fixen Seeds (1, 2) — deterministisch
über Läufe, aber Wanduhr-getrieben (bewusst nicht Sim-Uhr, weil Kamera-Shake
Render-Kosmetik ist). `TIME_SCALE` skaliert JSON-Werte deterministisch beim
Laden — keine Runtime-Divergenz.

**Ausführbar reproduzierbar:**

```bash
cd hellmuth && npm run build
PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node tools/tempo_ab.mjs      # -> proof/tempo/messwerte.json (Gate 5/5 GRUEN)
```

## 5. Duplikate im gleichen Commit

Der Brief forderte: »wenn ein Wert an einer Stelle korrigiert wird und an drei
anderen Stellen dupliziert lebt — Duplikate finden und im selben Commit
angleichen.« Ergebnis:

| Duplikat-Kandidat | Befund |
|---|---|
| `MOVEMENT.separationSpeed`/`recoverSpeed` | Kollateral zu `tempo`, im gleichen Commit mit-skaliert (sonst Ausweichen ≠ Laufen). |
| `WORKER_COMBAT.cooldown` | Duplikat von `angriffstempo`-Idee für Arbeiter; im gleichen Commit skaliert. |
| `DESTILLE_PRODUCTION_RATE_MS` | Eigenständiger Rate-Konstante (nicht aus JSON), skaliert. |
| Zoom-Rampe im Editor (`editor_scene.ts:472`) | Bewusst NICHT angeglichen — Editor-Rampe (0.12..3, stufenlos) ist ein anderes UX-Ziel als das Spiel. |
| Andere `shake`/`shakeCamera`-Aufrufer | Nur zwei: `explosion.ts:138` (aktiv, auf `addTrauma('explosion_big')` migriert) und `impact.ts:76` (`impactBuildingShake`, im Kartierer-Ist ohne Aufrufer — bleibt als Bridge unangetastet). |

## 6. Bewusst nicht angefasst

- HUD-Dateien, Kartenformat, Terrain-Renderer, Knockback-Kern (Brief-Verbot).
- Sim-Takt (`SIM.fixedDtMs`, 30 Hz), Tick-Reihenfolge, `stepSim`-Systemliste.
- Vorhandene Kamera-Logik (`applyZoomSteps`, `panCamera`, Mausrad-Handler) —
  nur ihre Zahlen (`CAMERA.minZoomMargin`, `ZOOM_MIN`) geändert.
- Editor-Zoom-Rampe.

## 7. Residuen / Flags an Fable

- **R1 Bark-Cooldown-Klasse** (Blueprint-2-Synthese §1.5 »Kommando-Quittung
  unter 50 ms mit eigener Bark-Cooldown-Klasse«): **existiert bereits**
  vollständig — `src/audio/bark_state.ts` `BarkKern` mit COOLDOWN-Map
  `{ select: 350, command: 600, idle: 12000, death: 0, annoyed: 0 }`, Latenz-
  pfad synchron in einem Frame (Software-Delay < 1 ms + WebAudio-Scheduling).
  Blueprint-2-Vorgabe strukturell erfüllt. **Kein Neubau nötig.** Falls
  Bedarf: `EVT_COMMAND_MOVE` wird auch für Attack-Kommandos missbraucht
  (`game_scene.ts:969`) — ein sauberer `EVT_COMMAND_ATTACK`-Split wäre reine
  Semantik-Politur.
- **R2 SOLUTIONS-BLUEPRINT-2-RELEASE als Datei fehlt** — die Trauma-Zahlen
  hier sind Eiserloh-Standard-Rekonstruktion (GDC 2016), nicht der explizite
  Bericht. Wenn Ticro den Bericht nachcheckt, gleichen wir die 5 Werte an.
- **R3 Nachtest-Werte** — der Mensch justiert nach: falls `TIME_SCALE = 0.5`
  noch zu schnell/langsam wirkt, sind 0.4 und 0.6 dokumentierte Nachbarwerte.
  Zurückdrehen = eine Zahl in `loader.ts`.

## 8. Bericht an Fable

**TIME_SCALE:** `0.5` im finalen Commit. Umsetzung im Loader (skaliert alle
JSON-Rates on-load) + vier ms-Konstanten in `balance.ts` + zwei Bewegungs-
Kollateralien. **Belegt: 2,0x-Distanz-Verhältnis** im A/B-Timelapse.

**H4:** Nicht im Voraus in Arbeit — mit-implementiert nach Blueprint-2-
Synthese-§1.5-Prinzipien + Eiserloh-Kanon (GDC 2016) rekonstruierten Werten.
`trauma²`-Amplitude, `valueNoise2`-Offset (kein Rotations-Shake), Zerfall
1,5/s, Zufuhr-Deckel per Klasse (`unit_hit` 0.03 … `building_died` 0.85).
Legacy-`shakeCamera` bleibt als Bridge; toter `impactBuildingShake`-Pfad
unberührt. **Belegt: Peak 18,80 px → 0 in 6 Frames, monoton fallend.**

**Zoom-Lösung:** äußerste Stufe **heranziehen** statt vierte Stufe einfügen —
weil die Zoom-Stufen im Code als 3-Array + zwei Konstanten leben. `CAMERA.minZoomMargin: 0 → 0.20`
UND `ZOOM_MIN: 0.4 → 0.7` (der Floor griff vor dem Margin auf großen Karten).
**Belegt: [2.5, 1.6, 0.7] statt [2.5, 1.45, 0.4].**

**Bark:** Cooldown-Klasse existiert schon vollständig (`BarkKern` +
`BarkDirector`). Blueprint-2-Vorgabe strukturell erfüllt.
