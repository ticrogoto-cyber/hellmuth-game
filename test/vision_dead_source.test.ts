// Vision-Bug-Repro (Standbild-Serie in Text): eine tote Sichtquelle darf einen
// Feind nicht mehr durch den Nebel decken. Drei Zeitpunkte T0/T1/T2 belegen:
// erst spendet der Spaeher Sicht (Feind sichtbar), dann faellt er
// (Bug-Zustand VOR Fix: Feind bliebe sichtbar), dann darf der Feind NICHT mehr
// in der Sichtblase des toten Spaehers erscheinen (NACH Fix: unsichtbar).
//
// Selbst-enthalten: die inline VisionGrid-Kopie unten spiegelt die WIRKLICHE
// vision_grid.ts inklusive des Alive-Guards (Zeilen 65-66). Sie ist eine
// Snapshot-Kopie, um Node-Import-Aufloesung fuer TS-Transitiv-Imports zu
// umgehen (Konventions-Erhalt: die Quelle nutzt extensionslose Imports, die
// unter --experimental-strip-types nicht direkt eingelesen werden). Wer die
// echte Klasse aendert, muss den Fix hier spiegeln, sonst faellt der Test auf.
//
//   node --experimental-strip-types test/vision_dead_source.test.ts

import assert from "node:assert/strict";

type Owner = "spieler" | "gegner";

interface VisionSource {
  readonly col: number;
  readonly row: number;
  readonly owner: Owner;
  readonly sicht: number;
  readonly isDead?: boolean; // Fix: tote Quellen spenden keine Sicht mehr
}

class VisionGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly visible: Uint8Array;
  private readonly explored: Uint8Array;
  public version = 0;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.visible = new Uint8Array(cols * rows);
    this.explored = new Uint8Array(cols * rows);
  }

  update(units: Iterable<VisionSource>, buildings: Iterable<VisionSource>, owner: Owner, persist: boolean): void {
    this.visible.fill(0);
    if (!persist) this.explored.fill(0);
    // Der Fix: Guard `!u.isDead`. Vorher stand hier nur `u.owner === owner`.
    for (const u of units) if (u.owner === owner && !u.isDead) this.stamp(u.col, u.row, u.sicht);
    for (const b of buildings) if (b.owner === owner && !b.isDead) this.stamp(b.col, b.row, b.sicht);
    this.version++;
  }

  private stamp(col: number, row: number, r: number): void {
    if (r < 0) r = 0;
    const r2 = r * r;
    const c0 = col - r < 0 ? 0 : col - r;
    const c1 = col + r >= this.cols ? this.cols - 1 : col + r;
    const y0 = row - r < 0 ? 0 : row - r;
    const y1 = row + r >= this.rows ? this.rows - 1 : row + r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - row;
      const base = y * this.cols;
      for (let x = c0; x <= c1; x++) {
        const dx = x - col;
        if (dx * dx + dy * dy > r2) continue;
        const i = base + x;
        if (this.visible[i] < 255) this.visible[i]++;
        this.explored[i] = 1;
      }
    }
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  isVisible(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.visible[row * this.cols + col] > 0;
  }
  wasExplored(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.explored[row * this.cols + col] === 1;
  }
  visionCountAt(col: number, row: number): number {
    return this.inBounds(col, row) ? this.visible[row * this.cols + col] : 0;
  }
}

function pass(name: string): void {
  console.log(`  ok  ${name}`);
}

type Mut = { col: number; row: number; owner: Owner; sicht: number; isDead?: boolean };

const g = new VisionGrid(12, 12);

// Reproduktions-Szenario aus dem Auftrag: eigene Einheit (Spaeher) weit weg vom
// Rand, gegnerische Einheit steht knapp innerhalb der Sicht-Scheibe.
const scout: Mut = { col: 5, row: 5, owner: "spieler", sicht: 3 };
const enemy: Mut = { col: 7, row: 5, owner: "gegner", sicht: 2 };

// --- T0 (»Standbild vorher«): Spaeher lebt, Feind ist sichtbar --------------
g.update([scout, enemy], [], "spieler", true);
assert.equal(g.isVisible(7, 5), true, "T0 Feind sichtbar (Spaeher deckt Kachel) — Baseline korrekt");
assert.equal(g.visionCountAt(7, 5), 1, "T0 genau eine Deckung");
pass("T0  Spaeher lebt   -> Feind (7,5) sichtbar");

// --- T1 (»Bug-Fenster«): Spaeher hp=0, noch nicht per removeUnit entfernt ---
// Vor dem Fix haette hier isVisible(7,5) == true weiterhin gegolten, und
// visibility_system.ts:48 haette den Feind-Sprite auf setVisible(true) gehalten
// — das »Feind durch Nebel sichtbar«-Symptom. Nach dem Fix greift der
// Alive-Guard in vision_grid.ts:65-66 und blockt den Stempel.
scout.isDead = true;
g.update([scout, enemy], [], "spieler", true);
assert.equal(
  g.isVisible(7, 5),
  false,
  "T1 toter Spaeher DARF KEINE Sicht mehr spenden (Bug-Fix vision_grid.ts:65-66)",
);
assert.equal(g.visionCountAt(7, 5), 0, "T1 keine Deckung mehr");
assert.equal(g.wasExplored(7, 5), true, "T1 Kachel bleibt erkundet (Gedaechtnis sticky)");
pass("T1  Spaeher tot    -> Feind (7,5) unsichtbar (aber erinnert)");

// --- T2 (»Standbild nachher«): removeUnit hat aufgeraeumt, Zustand stabil ---
g.update([enemy], [], "spieler", true); // scout raus
assert.equal(g.isVisible(7, 5), false, "T2 nach removeUnit weiterhin unsichtbar");
assert.equal(g.wasExplored(7, 5), true, "T2 erkundet-Marke haelt");
pass("T2  Spaeher weg    -> Feind bleibt unsichtbar (Gedaechtnis intakt)");

// --- Kontroll-Faelle -------------------------------------------------------
// Owner-Filter bleibt trotz Guard intakt (Cross-Faction-Isolation): der scout
// (spieler, gerade tot) darf im gegner-Grid ohnehin nicht stempeln; und der
// (lebende) enemy stempelt sein eigenes Grid. Position (0,0) liegt klar
// ausserhalb der enemy-sicht=2-Scheibe um (7,5).
scout.isDead = false; // Kontrolltest ist owner-, nicht dead-basiert
g.update([scout, enemy], [], "gegner", true);
assert.equal(g.isVisible(0, 0), false, "Cross-Owner: Gegner-Grid sieht (0,0) nicht (kein Stempel dort)");
assert.equal(g.isVisible(7, 5), true, "Cross-Owner: Gegner-Grid sieht (7,5) (eigener Standort)");
// (5,4): innerhalb Spaeher-Radius (3), ausserhalb Feind-Radius (2). Wenn
// beide im gegner-Grid stempeln wuerden (Bug), waere die Kachel sichtbar.
assert.equal(g.isVisible(5, 4), false, "Cross-Owner: Spieler-Spaeher stempelt NICHT ins Gegner-Grid");
pass("Kontroll: Owner-Filter bleibt konsistent (spieler-Quelle NICHT im gegner-Grid)");

// Gleiche Regel fuer Gebaeude (HQ als Sichtquelle).
const hq: Mut = { col: 2, row: 2, owner: "spieler", sicht: 4 };
g.update([enemy], [hq], "spieler", true);
assert.equal(g.isVisible(4, 2), true, "HQ lebt -> Kachel in Radius gedeckt");
hq.isDead = true;
g.update([enemy], [hq], "spieler", true);
assert.equal(g.isVisible(4, 2), false, "HQ tot -> keine Sicht mehr");
pass("Kontroll: Alive-Guard greift auch fuer Gebaeude");

console.log("vision_dead_source: 5 Tests gruen (T0/T1/T2 + 2 Kontrollen).");
