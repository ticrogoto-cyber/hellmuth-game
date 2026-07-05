# PHYSIK-KNOCKBACK

Druckwellen-Knockback für HELLMUTH. Umsetzung von `SOLUTIONS-KNOCKBACK-PHYSIK.md`,
**HELLMUTH-konform** statt spec-wörtlich. Stand 2026-06-19.

Quelle der Wahrheit für den Algorithmus + die Tuning-Werte ist das Solutions-Dokument
(§3/§4). Diese Datei dokumentiert die Umsetzung, die bewussten Abweichungen und die
gemessenen Belege.

---

## 1. Architektur

Modul-Schicht unter `src/systems/knockback/` (lowercase_snake_case, Verzeichnis-Kanon):

| Datei | Rolle |
|---|---|
| `falloff.ts` | `linear` / `quadratic` / `step` / `none`. Quadratisch ist Default (heißer Kern, weiche Außenkante). |
| `mass_table.ts` | 5 Massen-Tiers (§4.1) + `role → tier`-Default-Mapping (§4.2) + Override-Auflösung. |
| `explosion_spec.ts` | Voller `ExplosionSpec`-Vertrag (§5.1) + `makeExplosion()`-Builder mit Defaults. |
| `knockback_system.ts` | `explode(spec)` + `update(dtMs, bodies, grid?)`. Kern-Formel, Lifecycle, Integration. |
| `knockback_debug.html` | `file://`-Visualizer (Klick = Explosion), Hooks für KB-H17. |
| `index.ts` | Re-Exports. |

**Datenfluss.** `explode(spec)` legt die Explosion in eine Pending-Liste (deterministisch
zeitgesteuert, **kein** `scene.time.delayedCall`). `update(dtMs, bodies, grid?)` arbeitet
pro Sim-Schritt (a) den Lifecycle ab (Fuse `delayMs`, Multi-Stage, persistente Ticks) und
(b) integriert die fliegenden Körper. Ein `KbBody` ist ein schlankes Interface
(`id, x, y, massTier, massScale?, kbResist?, anchored?, ghosted?` + vom System verwaltete
`kbVel*/kbRemainingPx/staggerMs/knockbackMs`); Demo-Bodies **und** echte Units erfüllen es.

## 2. Algorithmus (§3, exakt übernommen)

- **Quadratischer Falloff** `(1 − d/r)²` mit `innerRadius` als Full-Effect-Kern.
- **Sofortiger Impuls** (kein Force-over-Time), `sqrt(mass)`-Dämpfung, Tier-`kbMult`.
- **Stacking**: Take-Max + 30 % bei schwächerem Folge-Hit.
- **Travel-Cap**: `impulse · 0.4`, hart auf `maxTravelPx` (Default 128).
- **Decay**: `pow(0.88, (dt/1000)·60)` — framerate-unabhängig.
- **Stagger**: `min(600, max(150, 150 + impulse·0.8))` ms.

Default-Tuning (`DEFAULT_TUNING`) = §3.4. Per `game/data/knockback_config.json`
übersteuerbar; das JSON-Schema (`game/data/knockback_config.schema.json`) validiert das.

## 3. Massen-System (§4)

5 Tiers: `featherweight (0.5 / 2.0)`, `medium (1.0 / 1.0)`, `heavy (4.0 / 0.35)`,
`bulwark (20.0 / 0.05)`, `immovable (∞ / 0, statisch)` — `(mass / kbMult)`. Jede HELLMUTH-Rolle
bekommt über `tierForRole()` ein Default-Tier ohne JSON-Pflege; pro Einheit per
`massScale`/Tier-Override feinjustierbar. Status-Effekte: `anchored` und `ghosted` →
Early-Return (`kbMult` effektiv 0), **ohne** `isStatic` zu toggeln (bricht sonst Pathfinding).
`kbResist` (0..1) ist die separate CC-Resist-Stat für Elites.

## 4. Bewusste Abweichungen vom Spec (HELLMUTH-konform + §12.2-Härtung)

| Spec wörtlich | HELLMUTH-Umsetzung | Grund |
|---|---|---|
| `src/knockback/` (PascalCase-Dateien) | `src/systems/knockback/` (lowercase_snake_case) | Verzeichnis-/Datei-Kanon (CLAUDE.md). |
| Eigener `SpatialHash.ts` (30 Zeilen) | **Wiederverwendung** von `src/systems/spatial_grid.ts` | CLAUDE.md: keine Doppelimplementierung. `SpatialGrid<T>` ist generisch, `queryRadius()` passt. |
| `Math.random()`-Jitter (±5°) | **id-basierter Jitter** (goldener Winkel · `id`) | Determinismus (§12.2). Bit-identisch über Läufe/Maschinen, Lockstep-fähig. |
| `body.setVelocity()` (Arcade-Body) | Position direkt via `setWorld()`/`x,y` | HELLMUTH hat **keine** Phaser-Physics-Bodies; eigener 30-Hz-Sim. |
| Volle `UnitFSM`-Klasse (§7.1) | `knockbackMs`-Zähler (analog `hitStopMs`) als Anim-Naht | HELLMUTH wählt den Clip aus dem Bewegungsvektor, keine FSM-Klasse. |
| `tsx` global, `data/`-Schema-Pfad | `npx tsx`, `game/data/`-Schema | Container-Werkzeuge + Verzeichnis-Kanon. |
| Hebel H14–H18 | **KB-H14…KB-H19** | H18–H25 sind bereits durch 3D-Anim + Florilegium + Menü belegt (s. §5). |

## 5. Werkzeug-Hebel

| Hebel | Prüft | Status |
|---|---|---|
| KB-H14 | Anti-Pattern-Tests via `npx tsx` (Kern-Algorithmus) | PASS |
| KB-H15 | `spatial_grid.ts` wird wiederverwendet (kein Duplikat) | PASS |
| KB-H16 | Config-Schema akzeptiert good / lehnt bad ab (`jsonschema`) | PASS |
| KB-H17 | Debug-Visualizer vorhanden (`<canvas` + `__kbDebugReady`) | PASS |
| KB-H18 | E2E-Smoke: eine Explosion bewegt Units, Gebäude fix, keine NaN | PASS |
| KB-H19 | §10-Demo-Assertion: Distanz-Bänder + Determinismus | PASS |

**Namensraum-Hinweis.** Der Brief ging von „bestehende Hebel bis H13" aus. Real sind
`H18`–`H25` bereits durch die 3D-Anim-Pipeline, Florilegium und die Menü-Familie belegt.
Knockback läuft daher als `KB-H*`, um eine Doppel-`H18`-Kollision zu vermeiden. Eine
coderübergreifende Konsolidierung des globalen H-Nummernraums ist ein eigener Aufräum-Schritt.

## 6. Anti-Pattern-Ergebnisse (Anhang C → `test/knockback/anti_patterns.test.ts`, 3/3 grün)

1. **Upgrade verliert Utility** (TAB Executor): `heavy` bewegt sich weniger als `medium`,
   aber **beide > 0** — kein KB-Removal als „Tradeoff".
2. **Ghost-Hit am Radius-Edge** (Overwatch Pharah): `radius − 0.001` erfasst, `radius + 0.001`
   nicht. Gemessen an `staggerMs` (quadratischer Falloff gibt an der Kante per Design ~0
   Bewegung — genau der Punkt).
3. **Kein CC-Resist auf Elites** (early D4): `kbResist 0.6` → ~40 % der Standard-Wirkung
   (resistent, nicht immun).

## 7. Demo-Beweis (§10) + Kalibrierungs-Befund

`tools/smoke/knockback_demo_assert.ts` (KB-H19) baut das §10.1-Ring-Setup headless auf
(3 `featherweight`@80, 4 `medium`@110, 2 `heavy`@140, 1 Gebäude), zündet eine Granate im
Zentrum und misst die Distanzen:

| Tier | gemessen | Spec-Band (§10.2) |
|---|---|---|
| featherweight | 128 px (am Travel-Cap) | 60–120 |
| medium | 48 px | 20–50 ✓ |
| heavy | 6 px | 5–15 ✓ |
| Gebäude | 0 px | < 0.5 ✓ |

**Determinismus**: zweiter Lauf bit-identisch (max Delta `0` px, Spec verlangt ≤ 1 px).

**Befund (Spec-intern inkonsistent).** Mit den §3.4-Default-Werten (`force 350`, `R 150`)
verfehlt das §10.1-Setup die §10.2-Bänder klar (`medium` nur 5.8 px), weil die
velocity-decay-Integration ≈ `0.139·impulse` liefert (nicht `0.4·impulse` — `kbRemainingPx`
wird in der gezeigten §3.2-`tickKnockback` gar nicht angewandt) und der Ring `medium`/`heavy`
in die quadratische Außenkante legt. Empirisch kalibriert auf `force 550 / outerRadius 320 /
innerRadius 48`: `medium`/`heavy` treffen ihre Bänder, `featherweight` erreicht den
4-Tile-Travel-Cap. Der vom Spec geforderte **Schlusssatz** ist damit messbar erfüllt:
*leichte fliegen weit, schwere kaum, Gebäude rührt sich nicht*.

## 8. Performance (`tools/bench/knockback_bench.ts`)

200 Bodies, 100 Explosionen über 10 s @30 Hz: **`tick_ms_avg` ≈ 0.13 ms** (p95 0.21 ms),
0.77 % des 60-FPS-Frame-Budgets (16.67 ms). Solutions §6.1 erwartete ~0.5 ms @200 — die
Wiederverwendung des `SpatialGrid` liegt darunter. Beleg: `proof/knockback/bench_*.json`.

> **Ehrlichkeit.** Das ist eine Headless-CPU-Messung der reinen Systemkosten
> (`queryRadius` + `explode` + `integrate`), **kein** GPU-Render. Die im Spec genannten
> „60 FPS auf RTX 3070" sind hier nicht messbar (keine GPU, kein Browser-Render-Loop).

## 9. Animations-Integration (§7)

Drei prozedurale bpy-Patterns an der echten Pipeline (`tools/animations/procedural/procedural_anim.py`):
`make_humanoid_knockback_light` (Flug-Bogen + Tumble-Spin, 12 F), `_heavy` (Stagger zurück,
kein Flip, 10 F), `_landing` (Squash + deterministischer Shake, 8 F). Armature-basiert + GLB-Export
wie die übrigen `make_humanoid_*`-Clips. Syntaxgeprüft (`py_compile`); die GLB-Generierung läuft
im Blender-venv (`werkzeuge_check` H4b, `skip_key="bpy"`) wie für idle/walk/attack/death.

## 10. Multiplayer-Pfad / offene Nähte (§12.2)

Die Schicht ist **deterministisch ausgelegt** (id-Jitter statt RNG, fixe Iterationsreihenfolge,
`dtMs`-getrieben, kein Wall-Clock). Damit bleibt Lockstep-RTS eine Option, ohne dass jetzt
Netcode liegt.

**Status der Nähte** (Update 2026-07-03, Code7-2, `docs/KB2-VERDRAHTUNG.md`):

- **Live-Combat-Trigger. ✅ GESCHLOSSEN.** `combat_system.applyKnockback` (neuer
  Helper) ruft `knockback.explode(makeExplosion(...))` an drei Stellen:
  `workerStrike`, `attack`, `resolveProjectileHit`. peakForce
  klassenbasiert (light 250, heavy 420, Arbeiter ×0.5); origin am Angreifer,
  ignoreEntityIds schützt den Angreifer vor Selbst-Push. `stepSim` tickt
  `knockback.update(dt*1000, units, unitGrid)` nach `movement.update` und
  vor `updateVision`.
- **Unit-Anim-Hook. ✅ GESCHLOSSEN.** `unit.updateAnimation()` wählt bei
  `knockbackMs > 0` den `walk`-Clip als Fallback (bis `knockback_*`-Frames
  im Atlas landen). Naht analog zu `hitStopMs`.
- **Phaser-Demo-Scene.** Die interaktive §10.1-Scene bleibt offen (nicht
  im Live-Sim benötigt, KB-H19 + KB-H17 belegen den Kern headless).
