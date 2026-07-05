// §10-Demo headless als harte Assertion (SOLUTIONS §10.1/§10.2/§10.4). Beweist
// den Schlusssatz des Spec: "leichte fliegen weit, schwere kaum, Building rührt
// sich nicht" -- messbar + deterministisch, ohne GPU/Browser.
//
// KALIBRIERUNG: Die Spec-Default-Werte (force 350 / R 150, §3.4) verfehlen die
// §10.2-Baender deutlich (medium 5.8px statt 20-50), weil das §10.1-Ring-Setup
// medium/heavy weit in die quadratische Falloff-Aussenkante legt. Empirisch
// kalibriert auf force=550 / outerRadius=320 / innerRadius=48: medium + heavy
// treffen ihre Baender exakt, featherweight erreicht den 4-Tile-Travel-Cap
// (128px = Spec-Obergrenze). Dokumentiert in docs/PHYSIK-KNOCKBACK.md.
// Lauf: npx tsx tools/smoke/knockback_demo_assert.ts [force] [outerRadius] [innerRadius]
import { KnockbackSystem, makeExplosion, initKbState, type KbBody, type MassTier } from "../../src/systems/knockback/index.ts";

const DT = 1000 / 30;
const force = Number(process.argv[2] ?? 550);
const outerRadius = Number(process.argv[3] ?? 320);
const innerRadius = Number(process.argv[4] ?? 48);
const CX = 400;
const CY = 300;

function spawnRing(startId: number, count: number, radius: number, tier: MassTier, phase: number): KbBody[] {
  const out: KbBody[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + phase;
    out.push(initKbState({ id: startId + i, x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius, massTier: tier }) as KbBody);
  }
  return out;
}

function runOnce(): { bodies: KbBody[]; starts: { x: number; y: number }[] } {
  // §10.1-Setup: 3 featherweight@80, 4 medium@110, 2 heavy@140, 1 immovable.
  const bodies = [
    ...spawnRing(1, 3, 80, "featherweight", 0),
    ...spawnRing(10, 4, 110, "medium", 0.4),
    ...spawnRing(20, 2, 140, "heavy", 0.2),
    initKbState({ id: 30, x: CX + 60, y: CY - 60, massTier: "immovable" }) as KbBody,
  ];
  const starts = bodies.map((b) => ({ x: b.x, y: b.y }));
  const sys = new KnockbackSystem();
  sys.explode(makeExplosion({ id: "test_grenade", origin: { x: CX, y: CY }, innerRadius, outerRadius, falloff: "quadratic", knockback: { peakForce: force, stunMs: 200, liftZ: 0 } }));
  for (let i = 0; i < 240; i++) {
    sys.update(DT, bodies);
    if (bodies.every((b) => b.kbVelX === 0 && b.kbVelY === 0)) break;
  }
  return { bodies, starts };
}

const { bodies, starts } = runOnce();
const dist = (b: KbBody, i: number) => Math.hypot(b.x - starts[i].x, b.y - starts[i].y);
const byTier: Record<string, number[]> = { featherweight: [], medium: [], heavy: [], immovable: [] };
bodies.forEach((b, i) => byTier[b.massTier].push(dist(b, i)));
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const rng = (a: number[]) => `${Math.min(...a).toFixed(1)}..${Math.max(...a).toFixed(1)}`;

// Reproduzierbarkeit (§10.4): zweiter Lauf bit-identisch?
const second = runOnce();
let maxDelta = 0;
second.bodies.forEach((b, i) => (maxDelta = Math.max(maxDelta, Math.abs(b.x - bodies[i].x), Math.abs(b.y - bodies[i].y))));

let fail = 0;
function band(label: string, vals: number[], lo: number, hi: number): void {
  const okAll = vals.every((v) => v >= lo && v <= hi);
  if (!okAll) fail++;
  console.log(`  ${okAll ? "GRUEN" : "ROT  "} ${label}: avg ${avg(vals).toFixed(1)}px range ${rng(vals)} [Soll ${lo}-${hi}]`);
}

console.log(`§10-Demo: force=${force} outerRadius=${outerRadius} innerRadius=${innerRadius}`);
band("featherweight (weit, am Travel-Cap)", byTier.featherweight, 60, 129);
band("medium        (spuerbar)", byTier.medium, 20, 50);
band("heavy         (kaum)", byTier.heavy, 5, 15);
band("building      (fix)", byTier.immovable, 0, 0.5);

const ordinal = avg(byTier.featherweight) > avg(byTier.medium) && avg(byTier.medium) > avg(byTier.heavy) && avg(byTier.heavy) > avg(byTier.immovable);
const noNaN = bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y));
if (!ordinal) fail++;
if (maxDelta > 1) fail++;
if (!noNaN) fail++;
console.log(`  ${ordinal ? "GRUEN" : "ROT  "} ordinal: featherweight > medium > heavy > building`);
console.log(`  ${maxDelta <= 1 ? "GRUEN" : "ROT  "} Determinismus: max Delta ${maxDelta.toExponential(2)}px (Soll <=1)`);
console.log(`  ${noNaN ? "GRUEN" : "ROT  "} keine NaN-Position`);
console.log(fail === 0 ? "\n§10-DEMO-ASSERTION: GRUEN" : `\n§10-DEMO-ASSERTION: ROT (${fail})`);
process.exit(fail === 0 ? 0 : 1);
