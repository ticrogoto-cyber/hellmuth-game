# KNOCKBACK-VERDRAHTUNG (Code7-2)

Code7-2, 2026-07-03. Auftrag `CODE72KNOCKBACKVERDRAHTUNG.md`. Basis `05b3f85`
auf `claude/quirky-fermat-8rewv0`. Schließt die zwei in
`docs/PHYSIK-KNOCKBACK.md §10` als offen dokumentierten Nähte.

Zwei chirurgische Änderungen, Knockback-Kern unangetastet, Bench-Tests
KB-H14…KB-H19 bleiben grün.

## Problem A — Knockback verdrahtet

### Naht 1 (Trigger) — `combat_system.ts`

Neuer Helper `applyKnockback(attacker, target, sev, originX, originY)` und
drei Aufrufer:

| Stelle | Zeile (nach dem Fix) | Kalibrierung |
|---|---|---|
| `workerStrike` — Arbeiter-Schlag | nach `applyDamage` (Naht 1a) | `sev=light`, isWorker × 0.5 → peakForce = 125 |
| `attack` — Nahkampf | nach `attackCooldownMs`-Reset (Naht 1b) | `sev=hitSeverity(attacker)`: heavy=420, light=250 |
| `resolveProjectileHit` — Fernkampf-Einschlag | nach `applyDamage` (Naht 1c) | origin = Schützenmündung (ax,ay), sev aus Projektil |

**Explosions-Kalibrierung** (empirisch, siehe §4):

```ts
this.knockback.explode(makeExplosion({
  origin: { x: originX, y: originY },
  innerRadius: 100,   // ≥ Iso-Tile-Distanz (93 px), Vollpeak bei Nachbarkachel
  outerRadius: 170,   // knapp darüber, Kollateralen nur Kissen
  knockback: { peakForce, stunMs: 0, liftZ: 0 },
  ignoreEntityIds: attacker instanceof Unit ? new Set([String(attacker.id)]) : new Set(),
}));
```

`peakForce`-Tabelle: `light 250`, `heavy 420`, Arbeiter zusätzlich ×0.5.
Bei Distanz ~93 px zwischen Iso-Nachbarkacheln, `sqrt(mass=1.0)`-Dämpfung,
`kbMult=1.0` (medium) ergibt das einen wahrgenommenen Push von ~40 px im
Tick nach dem Schlag; Travel-Cap bei 128 px (§3.4 der Spec).

### Naht 2 (Tick) — `game_scene.ts:stepSim`

`KnockbackSystem` als scene-lokale Instanz (`private knockback = new KnockbackSystem()`),
via Konstruktor an `CombatSystem` durchgereicht. In `stepSim` **nach**
`movement.update(dt)` und **vor** `updateVision()`:

```ts
this.movement.update(dt);
this.knockback.update(dt * 1000, this.gameState.units, this.gameState.unitGrid);
this.gameState.updateVision();
```

- `dt * 1000` = ms (Spec-API), `dt` selbst ist `SIM.fixedDtMs / 1000`.
- `gameState.unitGrid` (SpatialGrid<Unit>) wird direkt durchgereicht — Unit
  erfüllt den `KbBody`-Vertrag jetzt strukturell.

### KbBody-Vertrag auf Unit — `entities/unit.ts`

Neun neue public-Felder (statische aus Rolle, Runtime von KnockbackSystem
verwaltet):

```ts
public massTier!: MassTier;
public massScale?: number;
public kbResist?: number;
public anchored?: boolean;
public ghosted?: boolean;
public kbVelX = 0;
public kbVelY = 0;
public kbRemainingPx = 0;
public staggerMs = 0;
public knockbackMs = 0;  // Anim-Naht-Signal
```

Ctor setzt `this.massTier = resolveMassTier(this.def.role)` — Rolle → Tier:
`worker/flyer=featherweight, caster/ranged/melee=medium, heavy=heavy,
siege=bulwark` (Kern-Mapping in `src/systems/knockback/mass_table.ts`).

### Unit-Anim-Naht — `entities/unit.ts:updateAnimation`

Neuer Zweig **vor** gather/walk/attack, **nach** hitStopMs (analog zu jenem):

```ts
if (this.knockbackMs > 0) {
  clip = "walk";   // Fallback bis knockback_light/heavy im Atlas landet (Doku §9)
}
```

`knockbackMs` wird von `KnockbackSystem.integrate()` verwaltet (dekrementiert
mit dtMs, wird bei Impulse-Anwendung auf `staggerMs` gesetzt = 150–600 ms).

## Problem B — Sammler-Reichweite (kein Bug)

**Kartierer-Befund + empirische Bestätigung:** Der Sammler kämpft bereits
korrekt auf Nahkampf-Distanz 1. Der Code-Pfad ist wasserdicht:

1. `combat_system.ts:101-104` `tickUnit`: `if (u.isWorker) tickWorkerDefense; return;`
   — acquire/reevaluate/attack/launchProjectile werden für Sammler **nie** erreicht.
2. `tickWorkerDefense` → `nearestEnemyUnitInRange(u, WORKER_COMBAT.range=1)`
   → Chebyshev-Distanz ≤ 1 Kachel; sonst kein Treffer.
3. `workerStrike` schlägt direkt (kein Projectile, kein Tracer).
4. `issueAttack` blockt manuelle Sammler-Angriffs-Kommandos (`canAttack=false`
   weil `schaden=0`).

**Empirischer Test** (`tools/kb2_ist.mjs`, gelaufen VOR jeder Verdrahtung):
Sammler bei (15,15) vs. Apotheker bei (18,15) — nach 5 s ist der Sammler
auf `dist_tiles=1`. Der Sammler HAT den Feind eingeholt und schlägt auf
Nahkampf-Distanz. HP-Verlauf zeigt Schlagabtausch: Sammler 40→16 (er verliert
gegen Apotheker), Feind 200→66. **Kein Distanz-Angriff.**

**Wahrscheinlichste Ursache der menschlichen Wahrnehmung:** Der **Vorposten**
(`game/data/buildings.json:198-201`: `schaden=10, reichweite=5, angriffstyp="fern"`)
stand neben dem Sammler und feuerte auf 5 Kacheln — visuell leicht mit dem
Sammler-Schlag zu verwechseln, weil der Projektil-Tracer aus der Nähe des
Sammlers kam.

**Bau-Empfehlung** (nicht ausgeführt, folgt eigenem Auftrag): optionaler
Assert im Loader (`src/data/loader.ts`), der `role==="worker" ⇒
angriffstyp==="nah" && reichweite<=1` erzwingt, damit künftige JSON-Änderungen
den Nahkampf-Kanon nicht wieder aufreißen.

## Subtile Seiten-Verschiebung — analytisch

Der Mensch berichtet: »Einheiten schieben sich nicht mehr subtil zur Seite«.
Kartierer-Befund:

- `avoidance()` läuft **unbedingt** pro Sim-Tick (`movement_system.ts:320`).
- Push-Skalierung: `sepStepPx = 4` (Pixel/Frame, **nicht** TIME_SCALE-skaliert)
  × `avoidWeightMoving = 0.35` → **max ~1.4 px/Frame** für Läufer.
- `separationSpeed` (den ich in der Tempo-Session TIME_SCALE-skaliert habe)
  ist **dead code** — wird nirgendwo im avoidance-Pfad gelesen. Meine
  Tempo-Änderung hatte auf das Verhalten **null Wirkung**.
- Der Push existiert also unverändert, aber ist mit 1.4 px/Frame sehr subtil.
  Wenn der Mensch früher »sichtbarer« schieben sah, ist entweder die
  Diagnose ungenau (visueller Vergleich mit alter Bewegungsgeschwindigkeit,
  die jetzt halbiert ist → das gleiche Push-Delta wirkt in absoluten Zahlen
  weniger dominant) oder es gab historische Änderungen an `avoidWeightMoving`
  bzw. `sepStepPx`, die außerhalb dieses Auftrags liegen.

**Status:** kein Bau in diesem Auftrag. Als **Residuum R1** flagged. Wenn
Ticro spürbar mehr Ausweichen möchte, ist der eine Regler `avoidWeightMoving`
in `balance.ts` (0.35 → 0.55 wären ~2.2 px/Frame Push).

## A/B-Beweise (`tools/kb2_ab.mjs`)

**Strategie:** Ein Build, zwei Zustände. VORHER wird durch Monkey-Patch der
KnockbackSystem-Instanz erzeugt: `kb.explode = () => {}` (Trigger zählt weiter,
aber die pending-Liste bleibt leer → keine Wirkung). NACHHER ist die echte
Verdrahtung. Target wird VOR jedem Tick auf Basis-Position zurückgesetzt, um
die Selbstverteidigungs-Bewegung als Störfaktor zu neutralisieren — der
Push-Delta ist dann rein Knockback.

**Gate 6/6 GRÜN** (`proof/kb2/messwerte.json`):

| Prüfung | Ist |
|---|---|
| Naht 1 (Trigger): NACHHER ruft `knockback.explode` | 2 Aufrufe (2 Schläge in 4 s) |
| Naht 1 (Trigger): VORHER ruft `explode` ebenso (Trigger unabhängig vom Kill) | 2 Aufrufe |
| Naht 2 (Tick): NACHHER max Push je Tick > 30 px | **74,3 px** |
| Wirkung vs Baseline: Push-Verhältnis ≥ 5× | **11,6×** (74,3 vs 6,4) |
| Wirkung isoliert: pushDelta > 30 px | **+67,9 px** |
| VORHER-Baseline: kein Knockback (kbVel stets 0) | 0 |

**Standbilder:**

- `proof/kb2/vorher_peak.png` — Apotheker steht direkt neben Hellmuth (Nahkampf-Distanz 1)
- `proof/kb2/nachher_peak.png` — Apotheker weggeschleudert, sichtbarer Schockwellen-/Rauch-Trail

**Bench-Regression** (`python3 tools/werkzeuge_check.py`):

```
KB-H14 knockback_system (Anti-Pattern-Tests via tsx)            GRUEN 3/3
KB-H15 SpatialGrid-Wiederverwendung (kein Duplikat)             GRUEN
KB-H16 Knockback-Config-Schema (jsonschema good/bad)            GRUEN
KB-H17 Knockback-Debug-Visualizer (canvas + Ready-Flag)         GRUEN
KB-H18 Knockback-E2E-Smoke (tsx, eine Explosion bewegt Units)   GRUEN 4/4
KB-H19 §10-Demo-Assertion (Distanz-Baender + Determinismus)     GRUEN
```

Kern unangetastet, Bench weiter grün.

## Residuen / Bericht an Fable

- **R1 subtile Seiten-Verschiebung** (Problem A Zusatz): heute technisch aktiv
  (avoidance läuft, ~1.4 px/Frame), aber vom Menschen offenbar nicht mehr als
  ausreichend empfunden. Ein Regler-Fix (`MOVEMENT.avoidWeightMoving`) wäre
  eine Zahl in `balance.ts`, aber nicht Scope dieses Auftrags. `separationSpeed`
  ist dead code — meine TIME_SCALE-Skalierung dort ist Nullwirkung, für die
  nächste Aufräumsession zum Löschen markiert.
- **R2 Sammler-Reichweite** (Problem B): kein Bug im Code, Sammler kämpfen auf
  Nahkampf-Distanz 1. Der visuelle Effekt kam wahrscheinlich vom Vorposten
  (`schaden=10, reichweite=5, angriffstyp="fern"`) in der Nähe. Optionaler
  Loader-Assert für die Zukunft: `role="worker" ⇒ angriffstyp="nah"`.
- **R3 »Zurücklaufen zur Ressource« nach Kampf** (Nebenaspekt Problem B): der
  Sammler kämpft bis zum Tod (Selbstverteidigung), rückt aber nach dem Kampf
  nicht selbstständig zur Ressource zurück. Das ist eine KI-Zustandsmaschinen-
  Änderung, im Bericht wie gewünscht markiert — nicht ausgeführt.
- **R4 Kollateralschäden im Massengefecht:** `outerRadius=170` erfasst neben
  target auch Nachbarn (~1.8 Tile-Radien). Bei dicht gepackten Formationen
  bekommt die ganze Reihe einen Push-Kissen-Effekt. Das kann als **Feature**
  gesehen werden (Massengefecht »wackelt«) oder Anti-Feature. Wenn Ticro es
  eng haben will: `outerRadius: 170 → 110`, `innerRadius: 100 → 90`, dann
  wirkt es nur auf die eine Nachbarkachel.
- **R5 Anim-Clip fehlt:** `knockback_light/_heavy/_landing` sind in `tools/animations/procedural/procedural_anim.py` als bpy-Patterns spec-treu vorhanden, aber
  noch nicht im Atlas — Fallback ist walk. Wenn die Atlas-Frames landen,
  wird die Zeile in `unit.ts:updateAnimation` von `clip = "walk"` auf
  `clip = "knockback"` (mit passendem UnitClip-Type-Erweiterung) umgestellt.

## Ausführbare Beweise

```bash
cd hellmuth && npm run build
PW_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node tools/kb2_ab.mjs                    # -> Gate 6/6 GRUEN
python3 tools/werkzeuge_check.py 2>&1 | grep KB-H  # -> alle 6 GRUEN
```

## Änderungsprotokoll (kompakt)

| Datei | Änderung |
|---|---|
| `src/entities/unit.ts` | +9 KbBody-Felder, `resolveMassTier` im Ctor, Anim-Naht `knockbackMs>0 → walk` |
| `src/systems/combat_system.ts` | `knockback` per Konstruktor, `applyKnockback`-Helper + 3 Trigger (workerStrike, attack, resolveProjectileHit) |
| `src/scenes/game_scene.ts` | `KnockbackSystem`-Instanz, an CombatSystem durchgereicht, Tick nach `movement.update` |
| `docs/PHYSIK-KNOCKBACK.md` | §10: Naht 1 + 2 als **geschlossen** markiert |
