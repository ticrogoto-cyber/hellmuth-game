// H18 — E2E-Smoke (Solutions §9.1): eine Explosion, mindestens eine Einheit hat
// ihre Position geaendert. Headless (kein Phaser noetig), nutzt die ECHTE
// Knockback-Schicht inkl. des wiederverwendeten SpatialGrid (statt eines
// duplizierten SpatialHash -- CLAUDE.md: keine Doppelimplementierung).
// Lauf: `npx tsx tools/smoke/knockback_smoke.ts`
import { KnockbackSystem, makeExplosion, initKbState, type KbBody, type MassTier } from "../../src/systems/knockback/index.ts";
import { SpatialGrid } from "../../src/systems/spatial_grid.ts";

const DT = 1000 / 30;
const PIXELS_PER_TILE = 64;

function body(id: number, x: number, y: number, tier: MassTier): KbBody {
  return initKbState({ id, x, y, massTier: tier }) as KbBody;
}

// Gemischtes Feld um ein Epizentrum.
const bodies: KbBody[] = [
  body(1, 420, 300, "featherweight"),
  body(2, 480, 300, "medium"),
  body(3, 400, 360, "heavy"),
  body(4, 360, 280, "featherweight"),
  body(5, 400, 300, "immovable"), // Gebaeude: darf sich NICHT bewegen
];
const start = bodies.map((b) => ({ x: b.x, y: b.y }));

// SpatialGrid wie im Spiel (PIXELS_PER_TILE-Zelle); rebuild + Query-Pfad pruefen.
const grid = new SpatialGrid<KbBody>(PIXELS_PER_TILE);
grid.rebuild(bodies);
const near = grid.queryRadius(400, 300, 150);
if (near.length === 0) {
  console.error("KB-SMOKE: ROT — SpatialGrid.queryRadius lieferte 0 Kandidaten");
  process.exit(1);
}

const sys = new KnockbackSystem();
sys.explode(
  makeExplosion({
    id: "smoke_grenade",
    origin: { x: 400, y: 300 },
    innerRadius: 32,
    outerRadius: 150,
    knockback: { peakForce: 350, stunMs: 200, liftZ: 0 },
  }),
);

// ~1 s simulieren; pro Schritt Grid neu aufbauen (wie der Sim) + queryRadius nutzen.
for (let i = 0; i < 30; i++) {
  grid.rebuild(bodies);
  sys.update(DT, bodies, grid);
}

let moved = 0;
let buildingMoved = false;
bodies.forEach((b, i) => {
  const d = Math.hypot(b.x - start[i].x, b.y - start[i].y);
  if (d > 0.5) moved++;
  if (b.massTier === "immovable" && d > 0.001) buildingMoved = true;
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    console.error(`KB-SMOKE: ROT — NaN-Position bei id ${b.id}`);
    process.exit(1);
  }
});

if (buildingMoved) {
  console.error("KB-SMOKE: ROT — immovable-Gebaeude wurde verschoben");
  process.exit(1);
}
if (moved < 1) {
  console.error("KB-SMOKE: ROT — keine Einheit hat die Position geaendert");
  process.exit(1);
}
console.log(`KB-SMOKE: GRUEN — ${moved}/4 bewegliche Einheiten verschoben, Gebaeude fix, keine NaN`);
process.exit(0);
