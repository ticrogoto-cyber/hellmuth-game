// Roundtrip-Pruefung fuer das Kartenformat (Strang 6 PFLICHT-Beleg). Laeuft
// in-page (kein tsx im Container), aufgerufen ueber tools/editor_browser.mjs
// roundtrip. Prueft: byte-gleich, tief-gleich, idempotent, und dass loadMap als
// Normalform projiziert (OOB/Duplikate/NaN bereinigt).

import { loadMap, saveMap, type MapData } from "./map_format";
import { scatterProps, emptyProjection } from "../systems/prop_scatter";
import type { BuildingTable, BuildingDef } from "../data/loader";

export interface RoundtripCase {
  name: string;
  byteEqual: boolean;
  deepEqual: boolean;
  idempotent: boolean;
  note: string;
  ok: boolean;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    return true;
  }
  return false;
}

/** Ein Fall: rohe Karte -> Normalform -> Roundtrip; misst die drei Garantien. */
function check(name: string, raw: unknown, extraNote: (m: MapData) => string): RoundtripCase {
  const m1 = loadMap(raw); // Normalform-Projektion
  const s1 = saveMap(m1);
  const m2 = loadMap(JSON.parse(s1));
  const s2 = saveMap(m2);
  const s3 = saveMap(loadMap(JSON.parse(s2)));
  const byteEqual = s1 === s2;
  const deep = deepEqual(m1, m2);
  const idempotent = s2 === s3;
  const note = extraNote(m1);
  return { name, byteEqual, deepEqual: deep, idempotent, note, ok: byteEqual && deep && idempotent && !note.startsWith("FEHLER") };
}

export function runRoundtripCheck(): { pass: boolean; cases: RoundtripCase[] } {
  const cases: RoundtripCase[] = [];

  // 1) Repraesentative Karte mit allen Listen.
  cases.push(
    check(
      "voll",
      {
        version: 1,
        name: "Test",
        cols: 36,
        rows: 36,
        groundTypes: ["erde-tot", "sandlehm", "steppe"],
        terrain: { default: 0, cells: [{ c: 5, r: 6, w: [0.7, 0.3, 0] }, { c: 10, r: 2, w: [0, 1, 0.5] }] },
        water: [{ c: 1, r: 1 }],
        doodads: [{ type: "baum-1", col: 4.123, row: 5.987, mirror: true, scale: 1.1, rotation: 0, seed: 42 }],
        decals: [{ set: "moos", col: 3.5, row: 2.5, variant: 1, rot: 123.4, scale: 0.9, alpha: 0.8, mirror: false }],
        // Vorplatzierte Fraktionsgebaeude (DESTILLAT-SYSTEM): roundtrip-stabil mit
        // sort (col, row, type) und int-Koordinaten.
        buildings: [{ type: "destille", col: 12, row: 9, faction: "hellmuth" }],
        nodes: [{ type: "hain", col: 8, row: 8 }],
        spawns: [{ player: 1, col: 6, row: 30, faction: "hellmuth" }],
        fog: [{ col: 2.2, row: 3.3, radius: 4, density: 0.5 }],
        collision: [{ c: 0, r: 0, kind: "blocked" }],
      },
      () => "",
    ),
  );

  // 2) Float-Drift (0.1 + 0.2 = 0.30000000000000004).
  cases.push(
    check(
      "float-drift",
      { version: 1, cols: 36, rows: 36, groundTypes: ["a", "b"], terrain: { default: 0, cells: [{ c: 1, r: 1, w: [0.1 + 0.2, 0.7] }] } },
      () => "",
    ),
  );

  // 3) Duplikat-Zelle (letzte gewinnt).
  cases.push(
    check(
      "dup-zelle",
      { version: 1, cols: 36, rows: 36, groundTypes: ["a", "b"], terrain: { default: 0, cells: [{ c: 3, r: 3, w: [1, 0] }, { c: 3, r: 3, w: [0, 1] }] } },
      (m) => (m.terrain.cells.filter((c) => c.c === 3 && c.r === 3).length === 1 ? "" : "FEHLER: Duplikat nicht entfernt"),
    ),
  );

  // 4) Out-of-bounds (verworfen).
  cases.push(
    check(
      "oob",
      { version: 1, cols: 36, rows: 36, groundTypes: ["a", "b"], terrain: { default: 0, cells: [{ c: 999, r: 999, w: [1, 0] }] }, water: [{ c: -5, r: 2 }] },
      (m) => (m.terrain.cells.length === 0 && m.water.length === 0 ? "" : "FEHLER: OOB nicht verworfen"),
    ),
  );

  // 5) NaN/Infinity -> 0.
  cases.push(
    check(
      "nan-inf",
      { version: 1, cols: 36, rows: 36, groundTypes: ["a", "b"], terrain: { default: 0, cells: [{ c: 2, r: 2, w: [NaN, Infinity] }] } },
      (m) => {
        const c = m.terrain.cells[0];
        return c && Number.isFinite(c.w[0]) && Number.isFinite(c.w[1]) ? "" : "FEHLER: NaN/Inf nicht bereinigt";
      },
    ),
  );

  // 6) Doppel-Wasser (dedupe).
  cases.push(
    check(
      "doppel-wasser",
      { version: 1, cols: 36, rows: 36, groundTypes: ["a"], water: [{ c: 4, r: 4 }, { c: 4, r: 4 }] },
      (m) => (m.water.length === 1 ? "" : "FEHLER: Wasser nicht dedupliziert"),
    ),
  );

  // 7) Unbekannter Top-Level-Key (kuenftige Version) durchgereicht.
  cases.push(
    check(
      "unknown-key",
      { version: 99, cols: 36, rows: 36, groundTypes: ["a"], zukunftsfeld: { x: 1 } },
      (m) => ((m.meta?.__unknown as Record<string, unknown> | undefined)?.zukunftsfeld ? "" : "FEHLER: unbekannter Key verloren"),
    ),
  );

  // 8) Prop-Scatter-Ausgabe: die Ausgabe von scatterProps() geht bit-stabil durch
  //    die kanonische Serialisierung. Verifiziert den Determinismus-Vertrag von
  //    src/systems/prop_scatter.ts von der Speicher-Seite her.
  const btDef = (role: BuildingDef["role"], w: number, h: number): BuildingDef => ({
    name: role, faction: "hellmuth", role, grundflaeche: { w, h },
  });
  const buildingTable: BuildingTable = {
    apotheke: btDef("hq", 2, 2),
    zuckermaschine: btDef("hq", 2, 2),
    hain: btDef("resource", 1, 1),
  };
  const scatterMap: MapData = {
    version: 2,
    name: "scatter",
    cols: 36,
    rows: 36,
    groundTypes: ["neutral", "hellmuth", "moderat"],
    terrain: { default: 0, cells: [] },
    water: [],
    doodads: scatterProps(
      { ...emptyProjection(36, 36), buildings: [{ type: "apotheke", col: 4, row: 4, faction: "hellmuth" }] },
      { seed: 4711, buildingTable, preset: "zielbild" },
    ).doodads,
    decals: [],
    buildings: [{ type: "apotheke", col: 4, row: 4, faction: "hellmuth" }],
    nodes: [],
    spawns: [],
    fog: [],
    collision: [],
  };
  cases.push(
    check(
      "scatter",
      scatterMap,
      (m) => (m.doodads.length >= 10 ? "" : `FEHLER: Scatter erzeugte nur ${m.doodads.length} Doodads (>=10 erwartet)`),
    ),
  );

  return { pass: cases.every((c) => c.ok), cases };
}
