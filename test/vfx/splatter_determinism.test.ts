// Beweis 4 (Splatter-Rotationen): die positions-gehashte Stempel-Ausrichtung
// (src/fx/stamp_hash.ts, Phaser-frei) ist bit-identisch ueber Laeufe und
// reihenfolge-unabhaengig. Lauf: npx tsx test/vfx/splatter_determinism.test.ts
import assert from "node:assert/strict";
import { stampDraws, hash01, hashXY } from "../../src/fx/stamp_hash.ts";

let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`GRUEN  ${name}`);
  } catch (e) {
    failed++;
    console.log(`ROT    ${name} -> ${(e as Error).message}`);
  }
}

// Deterministisches Punktfeld (LCG, kein Math.random im Test selbst).
let seed = 0xc0de7;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}
const points: Array<[number, number]> = [];
for (let i = 0; i < 500; i++) points.push([rnd() * 8000, rnd() * 6000]);

check("Zwei Laeufe: stampDraws bit-identisch (500 Punkte x 4 Zuege)", () => {
  const runA = points.map(([x, y]) => stampDraws(x, y));
  const runB = points.map(([x, y]) => stampDraws(x, y));
  assert.deepEqual(runA, runB);
});

check("Reihenfolge-unabhaengig: rueckwaerts identisch zu vorwaerts", () => {
  const fwd = points.map(([x, y]) => stampDraws(x, y));
  const bwd = [...points].reverse().map(([x, y]) => stampDraws(x, y)).reverse();
  assert.deepEqual(fwd, bwd);
});

check("Winkel-Ableitung uniform (kein Klumpen)", () => {
  // 500 Zuege auf 361 Grad-Buckets: Erwartung bei Uniformitaet ~270 Uniques
  // (361*(1-(1-1/361)^500), Geburtstagsparadoxon). Klumpen laege weit darunter.
  const angles = new Set(points.map(([x, y]) => Math.round(stampDraws(x, y)[2] * 360)));
  assert.ok(angles.size >= 240 && angles.size <= 310, `${angles.size} Uniques (Erwartung ~270)`);
});

check("hash01-Wuerfel: Trefferquote ~15 % (corpse_pulse-Persist)", () => {
  let hits = 0;
  for (const [x, y] of points) for (let b = 0; b < 4; b++) if (hash01(x, y, b) < 0.15) hits++;
  const rate = hits / (points.length * 4);
  assert.ok(rate > 0.1 && rate < 0.2, `Rate ${rate.toFixed(3)} ausserhalb 0.10..0.20`);
});

check("salt trennt (beat 0..3 ergibt verschiedene Wuerfel)", () => {
  const [x, y] = points[0];
  const vals = new Set([0, 1, 2, 3].map((b) => hashXY(x, y, b)));
  assert.equal(vals.size, 4);
});

console.log(failed === 0 ? "\nSPLATTER-DETERMINISMUS: GRUEN (5/5)" : `\nSPLATTER-DETERMINISMUS: ROT (${failed})`);
process.exit(failed === 0 ? 0 : 1);
