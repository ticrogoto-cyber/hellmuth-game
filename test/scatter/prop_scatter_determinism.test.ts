// Determinismus-Beweis fuer CODE4 PROP-SCATTERING (Welle 0, Strang D).
//
// Sechs Checks im Muster von test/vfx/splatter_determinism.test.ts:
//   1. Zwei Laeufe gleicher Eingabe -> bit-identische Ausgabe.
//   2. Reihenfolge-Invarianz: dieselbe Menge existierender Doodads in umgekehrter
//      Reihenfolge -> identische Streuung.
//   3. Seed-Separation: zwei unterschiedliche Seeds -> unterschiedliche Ausgabe.
//   4. Salt-Separation: Kategorie-Salts trennen die Streams (kein Overlap-Klumpen).
//   5. Zaehl-Fenster: Ausgabezahl liegt im erwarteten Rahmen fuer 'zielbild'.
//   6. Kanonische Sortierung: Ausgabe folgt (col asc, row asc, type localeCompare).
//
// Lauf: npx tsx test/scatter/prop_scatter_determinism.test.ts

import assert from "node:assert/strict";
import { scatterProps, emptyProjection, canonicalize, PRESETS } from "../../src/systems/prop_scatter.ts";
import type { ScatterMapProjection } from "../../src/systems/prop_scatter.ts";
import type { BuildingTable, BuildingDef } from "../../src/data/loader.ts";
import type { MapDoodad } from "../../src/maps/map_format.ts";

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

// Minimales BuildingTable, das die Scatter-Modul-Signatur bedient.
const btDef = (role: BuildingDef["role"], w: number, h: number): BuildingDef => ({
  name: role,
  faction: "hellmuth",
  role,
  grundflaeche: { w, h },
});
const buildingTable: BuildingTable = {
  apotheke: btDef("hq", 2, 2),
  zuckermaschine: btDef("hq", 2, 2),
  hain: btDef("resource", 1, 1),
  quelle: btDef("resource", 1, 1),
};

// Realistische, nicht-leere Projektion: zwei HQs, zwei Ressourcenknoten, ein
// wenig Wasser -- so wie eine echte 36x36-Karte.
function proj(): ScatterMapProjection {
  const base = emptyProjection(36, 36);
  return {
    ...base,
    buildings: [
      { type: "apotheke", col: 4, row: 4, faction: "hellmuth" },
      { type: "zuckermaschine", col: 30, row: 30, faction: "moderat" },
    ],
    nodes: [
      { type: "hain", col: 10, row: 5 },
      { type: "quelle", col: 25, row: 25 },
    ],
    spawns: [
      { player: 0, col: 4, row: 4, faction: "hellmuth" },
      { player: 1, col: 30, row: 30, faction: "moderat" },
    ],
    water: [
      { c: 0, r: 15 }, { c: 1, r: 15 }, { c: 2, r: 15 },
      { c: 0, r: 16 }, { c: 1, r: 16 }, { c: 2, r: 16 },
    ],
  };
}

check("1) Bit-Identitaet: zwei Laeufe mit identischer Eingabe", () => {
  const a = scatterProps(proj(), { seed: 42, buildingTable, preset: "zielbild" });
  const b = scatterProps(proj(), { seed: 42, buildingTable, preset: "zielbild" });
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(a.doodads.length, b.doodads.length);
});

check("2) Reihenfolge-Invarianz: existierende Doodads in umgekehrter Reihenfolge", () => {
  // Wir fuegen ein paar bestehende Doodads hinzu (aus einem vorherigen Scatter);
  // die Streuung MUSS diese als soft-Keepout respektieren, egal in welcher
  // Reihenfolge sie in der Eingabe stehen.
  const existing: MapDoodad[] = [
    { type: "fels-1", col: 12, row: 12, variant: 0, mirror: false, scale: 1, rotation: 0, seed: 1 },
    { type: "baum-1", col: 20, row: 8, variant: 0, mirror: true, scale: 1, rotation: 0, seed: 2 },
    { type: "wald", col: 5, row: 25, variant: 0, mirror: false, scale: 1, rotation: 0, seed: 3 },
  ];
  const pA: ScatterMapProjection = { ...proj(), doodads: existing };
  const pB: ScatterMapProjection = { ...proj(), doodads: [...existing].reverse() };
  const rA = scatterProps(pA, { seed: 7, buildingTable, preset: "zielbild" });
  const rB = scatterProps(pB, { seed: 7, buildingTable, preset: "zielbild" });
  assert.equal(canonicalize(rA), canonicalize(rB));
});

check("3) Seed-Separation: unterschiedliche Seeds -> unterschiedliche Ausgabe", () => {
  const a = scatterProps(proj(), { seed: 1, buildingTable, preset: "zielbild" });
  const b = scatterProps(proj(), { seed: 2, buildingTable, preset: "zielbild" });
  assert.notEqual(canonicalize(a), canonicalize(b));
});

check("4) Salt-Separation: Kategorien haben eigenstaendige Streams", () => {
  // Ein Lauf, in dem NUR baum aktiv ist, darf keine Wald-Zellen belegen, und
  // umgekehrt. Wenn die Salts kollidieren wuerden, wuerden identische
  // Kandidatenpunkte in beiden Kategorien auftauchen.
  const onlyBaum = scatterProps(proj(), { seed: 5, buildingTable, preset: "zielbild", categories: ["baum"] });
  const onlyFels = scatterProps(proj(), { seed: 5, buildingTable, preset: "zielbild", categories: ["fels"] });
  const baumPos = new Set(onlyBaum.doodads.map((d) => `${d.col},${d.row}`));
  const felsPos = new Set(onlyFels.doodads.map((d) => `${d.col},${d.row}`));
  let overlap = 0;
  for (const p of baumPos) if (felsPos.has(p)) overlap++;
  assert.ok(overlap === 0, `Salt-Kollision: ${overlap} identische Positionen zwischen baum und fels`);
});

check("5) Zaehl-Fenster fuer 'zielbild' auf 36x36", () => {
  const r = scatterProps(proj(), { seed: 99, buildingTable, preset: "zielbild" });
  // Erwartung aus DEFAULT_RULES: wald 2, fels 8, baum 11, streu 8 Cluster * ~5.5 Satelliten.
  // Presets: alle density=1.0. Reales Ergebnis kann durch Keepout-Rejection
  // niedriger liegen -- wir pruefen ein weites Fenster.
  const wald = r.stats.generated.wald;
  const fels = r.stats.generated.fels;
  const baum = r.stats.generated.baum;
  const streu = r.stats.generated.streu;
  assert.ok(wald >= 1 && wald <= 3, `wald=${wald} ausserhalb [1..3]`);
  assert.ok(fels >= 4 && fels <= 10, `fels=${fels} ausserhalb [4..10]`);
  assert.ok(baum >= 6 && baum <= 14, `baum=${baum} ausserhalb [6..14]`);
  assert.ok(streu >= 15 && streu <= 90, `streu=${streu} ausserhalb [15..90]`);
});

check("6) Kanonische Sortierung: col asc, row asc, type localeCompare", () => {
  const r = scatterProps(proj(), { seed: 123, buildingTable, preset: "zielbild" });
  for (let i = 1; i < r.doodads.length; i++) {
    const a = r.doodads[i - 1];
    const b = r.doodads[i];
    const key = a.col - b.col || a.row - b.row || a.type.localeCompare(b.type);
    assert.ok(key <= 0, `nicht sortiert bei Index ${i}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
});

// Rand-Check: preset='duenn' vs 'dicht' liefert monotone Zaehlrelation.
check("7) Preset-Monotonie: duenn <= zielbild <= dicht (Summen)", () => {
  const d = scatterProps(proj(), { seed: 7, buildingTable, preset: "duenn" });
  const z = scatterProps(proj(), { seed: 7, buildingTable, preset: "zielbild" });
  const g = scatterProps(proj(), { seed: 7, buildingTable, preset: "dicht" });
  // Auf Kategorie-Ebene gilt Monotonie streng nur im Erwartungswert; wir pruefen
  // die Summe (robuster gegenueber Poisson-Rejection-Rauschen).
  const sum = (obj: Record<string, number>): number =>
    Object.values(obj).reduce((a, x) => a + x, 0);
  const sD = sum(d.stats.generated);
  const sZ = sum(z.stats.generated);
  const sG = sum(g.stats.generated);
  assert.ok(sD <= sZ, `duenn (${sD}) > zielbild (${sZ})`);
  assert.ok(sZ <= sG, `zielbild (${sZ}) > dicht (${sG})`);
});

check("8) Presets-Registry: alle drei Namen aufloesbar", () => {
  assert.ok(PRESETS.duenn);
  assert.ok(PRESETS.zielbild);
  assert.ok(PRESETS.dicht);
});

console.log(failed === 0 ? "\nPROP-SCATTER-DETERMINISMUS: GRUEN (8/8)" : `\nPROP-SCATTER-DETERMINISMUS: ROT (${failed})`);
process.exit(failed === 0 ? 0 : 1);
