// Anti-Pattern-Tests (Solutions Anhang C / Brief §"Anti-Pattern-Checks").
// Headless, ohne Phaser: die Knockback-Schicht zieht zur Laufzeit kein Phaser
// (loader/FactionId sind type-only). Lauf: `npx tsx test/knockback/anti_patterns.test.ts`.
import assert from "node:assert/strict";
import {
  KnockbackSystem,
  makeExplosion,
  initKbState,
  type KbBody,
  type MassTier,
} from "../../src/systems/knockback/index.ts";

const DT = 1000 / 30; // HELLMUTH-Sim: 30 Hz

function body(id: number, x: number, y: number, tier: MassTier, opts: Partial<KbBody> = {}): KbBody {
  return initKbState({ id, x, y, massTier: tier, ...opts }) as KbBody;
}

function settle(sys: KnockbackSystem, bodies: KbBody[], maxSteps = 300): void {
  for (let i = 0; i < maxSteps; i++) {
    sys.update(DT, bodies);
    if (bodies.every((b) => b.kbVelX === 0 && b.kbVelY === 0)) break;
  }
}

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

// --- Test 1: Upgrade verliert NICHT die Utility -----------------------------
// medium vs heavy auf gleicher Distanz, gleiche Explosion. Elite (heavy) bewegt
// sich WENIGER, aber beide > 0 (nicht immun).
check("Test 1 — Upgrade-verliert-Utility: heavy < medium, beide > 0", () => {
  const sys = new KnockbackSystem();
  const med = body(1, 60, 0, "medium");
  const hev = body(2, 0, 60, "heavy"); // gleiche Distanz 60 vom Ursprung
  const bodies = [med, hev];
  sys.explode(makeExplosion({ origin: { x: 0, y: 0 }, innerRadius: 0, outerRadius: 150, knockback: { peakForce: 350, stunMs: 0, liftZ: 0 } }));
  settle(sys, bodies);
  const dMed = Math.hypot(med.x - 60, med.y - 0);
  const dHev = Math.hypot(hev.x - 0, hev.y - 60);
  assert.ok(dMed > 0, `medium muss sich bewegen, war ${dMed}`);
  assert.ok(dHev > 0, `heavy darf NICHT immun sein, war ${dHev}`);
  assert.ok(dHev < dMed, `heavy (${dHev.toFixed(1)}) muss < medium (${dMed.toFixed(1)})`);
});

// --- Test 2: Ghost-Hit am Radius-Rand ---------------------------------------
// radius - 0.001 -> ERFASST; radius + 0.001 -> nicht erfasst. Gemessen an
// staggerMs (Erfassungs-Indikator): quadratischer Falloff gibt an der Aussenkante
// per Design ~0 Bewegung (Solutions Anhang C: weiche Kante, kein hartes Kippen) --
// der Anti-Pattern-Test prueft die RADIUS-GRENZE (edge-epsilon korrekt), nicht die
// Verschiebung. So bleibt der Test bei radius+-0.001 wie im Brief gefordert.
check("Test 2 — Ghost-Hit am Radius-Edge: innen erfasst, aussen nicht", () => {
  const sys = new KnockbackSystem();
  const R = 100;
  const inEdge = body(1, R - 0.001, 0, "medium");
  const outEdge = body(2, R + 0.001, 0, "medium");
  const bodies = [inEdge, outEdge];
  sys.explode(makeExplosion({ origin: { x: 0, y: 0 }, innerRadius: 0, outerRadius: R, knockback: { peakForce: 350, stunMs: 0, liftZ: 0 } }));
  sys.update(DT, bodies); // ein Schritt loest die Explosion aus
  assert.ok(inEdge.staggerMs > 0, "Einheit bei radius-0.001 muss vom Radius erfasst sein (staggerMs>0)");
  assert.ok(outEdge.staggerMs === 0, "Einheit bei radius+0.001 darf NICHT erfasst sein (staggerMs=0)");
});

// --- Test 3: CC-Resist auf Elites -------------------------------------------
// Standard kbResist 0, Elite kbResist 0.6, selbe Explosion -> Elite ~40 %.
check("Test 3 — CC-Resist: Elite-Knockback ~40 % der Standard-Wirkung", () => {
  const sys = new KnockbackSystem();
  const std = body(1, 60, 0, "medium", { kbResist: 0 });
  const elite = body(2, 0, 60, "medium", { kbResist: 0.6 }); // gleiche Distanz, gleicher Tier
  const bodies = [std, elite];
  sys.explode(makeExplosion({ origin: { x: 0, y: 0 }, innerRadius: 0, outerRadius: 150, knockback: { peakForce: 350, stunMs: 0, liftZ: 0 } }));
  settle(sys, bodies);
  const dStd = Math.hypot(std.x - 60, std.y - 0);
  const dElite = Math.hypot(elite.x - 0, elite.y - 60);
  assert.ok(dStd > 0 && dElite > 0, "beide muessen sich bewegen");
  const ratio = dElite / dStd;
  assert.ok(Math.abs(ratio - 0.4) < 0.1, `Verhaeltnis ${ratio.toFixed(3)} muss ~0.4 sein (1 - kbResist 0.6)`);
});

console.log(failed === 0 ? "\nANTI-PATTERN-TESTS: GRUEN (3/3)" : `\nANTI-PATTERN-TESTS: ROT (${failed})`);
process.exit(failed === 0 ? 0 : 1);
