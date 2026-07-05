// Stress-Bench (Brief §"Stress-Test", Solutions §10.3). 200 Einheiten, 10
// Explosionen/s an (deterministischen) Zufallspositionen, 10 s @30 Hz simuliert.
// Lauf: `npx tsx tools/bench/knockback_bench.ts`
//
// EHRLICHKEIT: Dies ist eine HEADLESS-CPU-Messung der reinen Knockback-Systemkosten
// (queryRadius + explode + integrate), KEINE Render-FPS. Es gibt hier keine GPU/
// keinen RTX-3070-Renderer. fps_cpu_equiv = 1000/tick_ms_avg = wieviele solcher
// Ticks pro Sekunde rechenbar waeren; das Render-Budget je Frame ist 16.67 ms (60
// FPS). Solange tick_ms_avg klein gegen 16.67 bleibt, ist das System NICHT der
// Flaschenhals (Solutions §6.1 erwartet ~0.5 ms @200).
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { KnockbackSystem, makeExplosion, initKbState, type KbBody, type MassTier } from "../../src/systems/knockback/index.ts";
import { SpatialGrid } from "../../src/systems/spatial_grid.ts";

const DT = 1000 / 30;
const SECONDS = 10;
const STEPS = Math.round((SECONDS * 1000) / DT);
const N = 200;
const EXPLOSIONS_PER_SEC = 10;
const PIXELS_PER_TILE = 64;
const WORLD = 2000;

// Deterministischer LCG (kein Math.random -> reproduzierbarer Bench).
let seed = 0x1234abcd;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
}

const TIERS: MassTier[] = ["featherweight", "medium", "heavy", "bulwark"];
const bodies: KbBody[] = [];
for (let i = 0; i < N; i++) {
  bodies.push(initKbState({ id: i + 1, x: rnd() * WORLD, y: rnd() * WORLD, massTier: TIERS[(rnd() * TIERS.length) | 0] }) as KbBody);
}

const sys = new KnockbackSystem();
const grid = new SpatialGrid<KbBody>(PIXELS_PER_TILE, WORLD + 512, WORLD + 512);
const explodeEveryMs = 1000 / EXPLOSIONS_PER_SEC;
let acc = 0;
let explosions = 0;

const samples: number[] = [];
for (let step = 0; step < STEPS; step++) {
  const t0 = performance.now();
  grid.rebuild(bodies);
  acc += DT;
  while (acc >= explodeEveryMs) {
    acc -= explodeEveryMs;
    explosions++;
    sys.explode(
      makeExplosion({
        id: `bench_${explosions}`,
        origin: { x: rnd() * WORLD, y: rnd() * WORLD },
        innerRadius: 24,
        outerRadius: 140,
        knockback: { peakForce: 320, stunMs: 0, liftZ: 0 },
      }),
    );
  }
  sys.update(DT, bodies, grid);
  samples.push(performance.now() - t0);
}

samples.sort((a, b) => a - b);
const sum = samples.reduce((s, v) => s + v, 0);
const avg = sum / samples.length;
const min = samples[0];
const max = samples[samples.length - 1];
const p95 = samples[Math.floor(samples.length * 0.95)];
const fpsCpuEquiv = avg > 0 ? Math.round(1000 / avg) : Infinity;
const FRAME_BUDGET_60 = 1000 / 60;

const out = {
  ts: new Date().toISOString(),
  note: "Headless-CPU-Messung der Knockback-Systemkosten (kein GPU-Render, keine RTX-3070). tick_ms = queryRadius+explode+integrate je Sim-Schritt.",
  bodies: N,
  explosions,
  steps: STEPS,
  sim_hz: 30,
  tick_ms_avg: Number(avg.toFixed(4)),
  tick_ms_min: Number(min.toFixed(4)),
  tick_ms_max: Number(max.toFixed(4)),
  tick_ms_p95: Number(p95.toFixed(4)),
  frame_budget_60fps_ms: Number(FRAME_BUDGET_60.toFixed(3)),
  headroom_pct_of_60fps_budget: Number(((avg / FRAME_BUDGET_60) * 100).toFixed(2)),
  fps_cpu_equiv: fpsCpuEquiv,
  verdict: avg < FRAME_BUDGET_60 ? "PASS: System-Tick unter 60-FPS-Frame-Budget" : "FAIL: System-Tick reisst 60-FPS-Budget",
};

mkdirSync("proof/knockback", { recursive: true });
const path = `proof/knockback/bench_${Date.now()}.json`;
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log(`\n-> ${path}`);
process.exit(out.tick_ms_avg < FRAME_BUDGET_60 ? 0 : 1);
