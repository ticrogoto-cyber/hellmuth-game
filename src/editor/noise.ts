// Schnelles, deterministisches Wert-Rauschen fuer das Terrain-Blending des
// Editors (Blueprint V3 §2.2: "prozedurale Noise-Masken, Code generiert sie per
// Skript, kostet null KREA-Punkte"). Reines Hash-Rauschen ohne Tabellen oder
// Abhaengigkeiten -- tausende Samples pro Chunk muessen guenstig sein.
//
// Alles ist seed-getrieben und damit reproduzierbar: derselbe Seed plus dieselbe
// Karte ergeben Bit fuer Bit dasselbe Bild (Voraussetzung fuer den Gate-
// Roundtrip). Keine Math.random-Aufrufe irgendwo im Renderpfad.

/** 32-bit Integer-Hash (xorshift/multiply). Streut auch nahe Eingaben gut. */
function hashInt(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return h >>> 0;
}

/** Gitterpunkt-Hash (ix, iy, seed) -> [0,1). */
function hash2(ix: number, iy: number, seed: number): number {
  // Zwei Achsen + Seed in einen Integer mischen, dann hashen. Die grossen
  // Primfaktoren entkoppeln benachbarte Zellen.
  const h = hashInt(Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519));
  return h / 4294967296;
}

/** Quintische Glaettung (Perlins smootherstep): C2-stetig, keine Gitter-Artefakte. */
function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Lineare Interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Wert-Rauschen 2D in [0,1]. Bilineare Interpolation der vier Gitter-Hashes mit
 * quintischer Glaettung. `x`,`y` sind in Rauscheinheiten (eine Einheit = eine
 * Gitterzelle des Rauschens).
 */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoother(x - x0);
  const fy = smoother(y - y0);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

/**
 * Fraktales Wert-Rauschen (fBm): Summe mehrerer Oktaven mit halbierter Amplitude
 * und verdoppelter Frequenz. Ergebnis auf [0,1] normiert. Liefert die organisch-
 * wolkige Struktur, die harte Kanten und Wiederholungsperioden bricht.
 */
export function fbm2(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    // Pro Oktave ein eigener Seed-Versatz, sonst liegen die Oktaven deckungsgleich.
    sum += amp * valueNoise2(x * freq, y * freq, seed + o * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Domain-Warp: liefert einen Versatz (dx, dy) aus zwei unabhaengigen fBm-Feldern,
 * zentriert um null und auf [-amp, amp] skaliert. Auf die Sample-Position eines
 * Gewichtsfeldes addiert, franst es jede 0.5-Kontur organisch aus, statt sie der
 * Diamant-Geometrie folgen zu lassen (Organik-Gesetz §7 Viertens).
 */
export function warp2(x: number, y: number, seed: number, amp: number, freq: number, octaves = 3): Vec2 {
  const nx = fbm2(x * freq, y * freq, seed + 7001, octaves);
  const ny = fbm2(x * freq, y * freq, seed + 9173, octaves);
  return { x: (nx - 0.5) * 2 * amp, y: (ny - 0.5) * 2 * amp };
}

/**
 * Quantisiertes Niederfrequenz-Rauschen -> Ganzzahl in [0, n). Waehlt eine
 * Variante (oder Region) so, dass gleiche Werte in grossen, unregelmaessigen
 * Flecken zusammenliegen statt pro Kachel zu flackern. `freq` klein halten
 * (grobe Flecken). Kanten zwischen Flecken werden andernorts weichgeblendet.
 */
export function patchIndex(x: number, y: number, seed: number, n: number, freq: number): number {
  const v = fbm2(x * freq, y * freq, seed + 4441, 3);
  return Math.min(n - 1, Math.max(0, Math.floor(v * n)));
}

/**
 * Periodisches Wert-Rauschen: identisch zu valueNoise2, aber das Gitter wird
 * modulo `period` (in Gitterzellen) umgeschlagen. Damit ist das Feld exakt
 * kachelbar -- Voraussetzung, um die vier Boden-Varianten zu einer groesseren
 * NAHTLOSEN Textur zu verschmelzen, ohne an der Wiederholungsgrenze eine Naht
 * zu erzeugen.
 */
export function periodicValueNoise2(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoother(x - x0);
  const fy = smoother(y - y0);
  const p = Math.max(1, Math.round(period));
  const wrap = (i: number) => ((i % p) + p) % p;
  const n00 = hash2(wrap(x0), wrap(y0), seed);
  const n10 = hash2(wrap(x0 + 1), wrap(y0), seed);
  const n01 = hash2(wrap(x0), wrap(y0 + 1), seed);
  const n11 = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

/**
 * Kachelbares fBm. `x`,`y` laufen ueber [0, basePeriod) je Kachelkante; jede
 * Oktave schlaegt bei `basePeriod * freq` um, sodass die Summe ueber die volle
 * Kachelkante periodisch bleibt.
 */
export function periodicFbm2(
  x: number,
  y: number,
  basePeriod: number,
  seed: number,
  octaves = 4,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicValueNoise2(x * freq, y * freq, basePeriod * freq, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Glatter Schwellwert: 0 unterhalb e0, 1 oberhalb e1, dazwischen weicher Hermite-Verlauf. */
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministischer Pseudo-Zufall fuer Einzelinstanzen (Doodad-Jitter,
 * Decal-Rotation): aus zwei Integer-Koordinaten plus Seed ein [0,1)-Wert. Ersetzt
 * Math.random im Editor, damit gespeicherte Karten exakt reproduzierbar rendern.
 */
export function rand2(ix: number, iy: number, seed: number): number {
  return hash2(ix, iy, seed);
}
