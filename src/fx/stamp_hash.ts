// Positions-gehashte Zufallszuege fuer Splatter/FX (Gefechts-VFX Paket 6).
// Phaser-FREI (Disziplin wie spatial_grid): headless per tsx testbar
// (test/vfx/splatter_determinism.test.ts, Beweis 4).
//
// Determinismus-Vertrag: alle Zuege haengen NUR vom Weltpunkt des Sim-Events
// (+ optionalem salt) ab -- reihenfolge-unabhaengig, bit-identisch ueber Laeufe
// und Maschinen. Kein Math.random, keine Wanduhr (Brief-Verbot).

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weltpunkt (+salt) -> uint32. 1/8-px-Quantisierung gegen Float-Rauschen. */
export function hashXY(wx: number, wy: number, salt = 0): number {
  const xi = Math.round(wx * 8);
  const yi = Math.round(wy * 8);
  let h = (Math.imul(xi, 73856093) ^ Math.imul(yi, 19349663) ^ Math.imul(salt | 0, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Ein deterministischer Zug [0,1) am Weltpunkt (fuer Einzel-Wuerfel). */
export function hash01(wx: number, wy: number, salt = 0): number {
  return hashXY(wx, wy, salt) / 4294967296;
}

/** Vier deterministische Zuege [0,1) fuer einen Stempel am Weltpunkt. */
export function stampDraws(wx: number, wy: number): [number, number, number, number] {
  const rnd = mulberry32(hashXY(wx, wy));
  return [rnd(), rnd(), rnd(), rnd()];
}
