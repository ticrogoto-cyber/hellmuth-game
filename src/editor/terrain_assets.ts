// Terrain-Bestand des Editors: die drei Bodensorten (je vier nahtlose Varianten)
// und die zwei Decal-Saetze (je vier). Echtes Material aus assets/source/maps/
// (Briefing §6), per Vite-URL-Import gebuendelt -- kein Laufzeit-fetch, kein
// Kopieren nach public/.
//
// Kernstueck: aus den vier Varianten einer Sorte wird EINMAL beim Laden eine
// groessere, NAHTLOSE "Schmelz"-Textur gemischt (periodisches Rauschen ->
// kachelbar). Sie traegt die Variantenvielfalt in grossen, weichen Flecken, statt
// dass eine 1024er-Kachel sichtbar repetiert (Organik-Gesetz §7 Drittens).

import Phaser from "phaser";

// Vite-Glob: die echten PNGs als gebuendelte URLs. Schluessel = Pfad.
const GROUND_URLS = import.meta.glob("../../assets/source/maps/ground/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const DECAL_URLS = import.meta.glob("../../assets/source/maps/decals/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Findet die gebuendelte URL einer Datei anhand ihres Basenamens. */
function urlByBasename(map: Record<string, string>, basename: string): string | undefined {
  for (const key of Object.keys(map)) {
    if (key.endsWith("/" + basename)) return map[key];
  }
  return undefined;
}

export interface GroundSort {
  /** Stabiler Id-Schluessel; landet als groundType in der Karte. */
  id: string;
  label: string;
  /** Dateibasis der vier Varianten (ohne .png). */
  files: string[];
  /** Phaser-Texturschluessel je Variante (= `gnd_<id>_<i>`). */
  keys: string[];
  /** Fraktions-Konnotation (nur fuer die Palette/Bezug, nicht fuer Mechanik). */
  hint: "neutral" | "hellmuth" | "moderat";
  /** Reserve-Fuellfarbe, falls eine Textur fehlt (defensiv, nie Schwarz). */
  fallback: string;
  /** Prozeduraler Platzhalter (kein KREA-PNG): Varianten werden gemottelt erzeugt
   *  statt flach gefuellt. Fuer die HELLMUTH-Zielsorte, bis Ticro die Textur liefert. */
  procedural?: boolean;
}

export interface DecalSet {
  id: string;
  label: string;
  files: string[];
  keys: string[];
  faction: "neutral" | "hellmuth" | "moderat";
  procedural?: boolean;
}

// Die drei realen Sorten (Briefing §6). Reihenfolge = Pinsel 1..3 und zugleich
// die Default-groundTypes neuer Karten.
export const GROUND_SORTS: GroundSort[] = [
  {
    id: "erde-tot",
    label: "Tote Erde",
    files: ["boden-erde-tot-1", "boden-erde-tot-2", "boden-erde-tot-3", "boden-erde-tot-4"],
    keys: ["gnd_erde-tot_0", "gnd_erde-tot_1", "gnd_erde-tot_2", "gnd_erde-tot_3"],
    hint: "moderat",
    fallback: "#3b342b",
  },
  {
    id: "sandlehm",
    label: "Sandlehm",
    files: ["boden-sandlehm-1", "boden-sandlehm-2", "boden-sandlehm-3", "boden-sandlehm-4"],
    keys: ["gnd_sandlehm_0", "gnd_sandlehm_1", "gnd_sandlehm_2", "gnd_sandlehm_3"],
    hint: "hellmuth",
    fallback: "#46492f",
  },
  {
    id: "steppe",
    label: "Steppe",
    files: ["boden-steppe-1", "boden-steppe-2", "boden-steppe-3", "boden-steppe-4"],
    keys: ["gnd_steppe_0", "gnd_steppe_1", "gnd_steppe_2", "gnd_steppe_3"],
    hint: "neutral",
    fallback: "#6b6147",
  },
  // HELLMUTH-Zielsorte der Terrainwandlung: hell, gruenlich, lebendig (Apotheke-/
  // Reinheit-Kanon) -- deutlich abgehoben von sandlehm, damit die Umfaerbung IMMER
  // sichtbar ist. PROZEDURALER Platzhalter (kein KREA-PNG); Ticro liefert die echte
  // Bodentextur spaeter, dann nur `procedural` entfernen und PNGs unter `keys` legen.
  {
    id: "klarflur",
    label: "Klarflur (Platzhalter)",
    files: ["boden-klarflur-1", "boden-klarflur-2", "boden-klarflur-3", "boden-klarflur-4"],
    keys: ["gnd_klarflur_0", "gnd_klarflur_1", "gnd_klarflur_2", "gnd_klarflur_3"],
    hint: "hellmuth",
    fallback: "#6f9a4a",
    procedural: true,
  },
  // Sumpfiger Uebergangs-Boden (Neutral-Zone zwischen den Fraktionen): dunkel,
  // schlammig-gruenbraun, neblig. PROZEDURALER Platzhalter.
  {
    id: "sumpf",
    label: "Sumpf (Platzhalter)",
    files: ["boden-sumpf-1", "boden-sumpf-2", "boden-sumpf-3", "boden-sumpf-4"],
    keys: ["gnd_sumpf_0", "gnd_sumpf_1", "gnd_sumpf_2", "gnd_sumpf_3"],
    hint: "neutral",
    fallback: "#3a4030",
    procedural: true,
  },
];

export const DECAL_SETS: DecalSet[] = [
  {
    id: "moos",
    label: "Moos",
    files: ["bodendekor-moos-1", "bodendekor-moos-2", "bodendekor-moos-3", "bodendekor-moos-4"],
    keys: ["decal_moos_0", "decal_moos_1", "decal_moos_2", "decal_moos_3"],
    faction: "neutral",
  },
  {
    id: "sirup",
    label: "Sirup-Lache",
    files: [
      "bodendekor-sirupfleck-oil-1",
      "bodendekor-sirupfleck-oil-2",
      "bodendekor-sirupfleck-oil-3",
      "bodendekor-sirupfleck-oil-4",
    ],
    keys: ["decal_sirup_0", "decal_sirup_1", "decal_sirup_2", "decal_sirup_3"],
    faction: "moderat",
  },
  // Magenta-Adern im GENERIK-Boden: leuchtende Risse (#B0186A) die Korruption
  // sichtbar machen. Prozedural (kein KREA-PNG).
  {
    id: "magenta-ader",
    label: "Magenta-Ader",
    files: [
      "bodendekor-magenta-ader-1",
      "bodendekor-magenta-ader-2",
      "bodendekor-magenta-ader-3",
      "bodendekor-magenta-ader-4",
    ],
    keys: ["decal_magenta-ader_0", "decal_magenta-ader_1", "decal_magenta-ader_2", "decal_magenta-ader_3"],
    faction: "moderat",
    procedural: true,
  },
];

export function sortById(id: string): GroundSort | undefined {
  return GROUND_SORTS.find((s) => s.id === id);
}

/**
 * Zielsorte der Terrainwandlung je Fraktion (VFX Strang 2): MODERAT korrumpiert die
 * Erde (tote, dunkle), HELLMUTH begruent sie (helle Klarflur). ZWEI getrennte Ziele,
 * KEIN geteiltes -- so ist die Umfaerbung beider Fraktionen immer sichtbar. Liefert
 * die Sorten-Id; den Index holt der Aufrufer aus terrain.groundTypes. */
export function factionTargetSortId(faction: "moderat" | "hellmuth"): string {
  return faction === "moderat" ? "erde-tot" : "klarflur";
}
export function decalById(id: string): DecalSet | undefined {
  return DECAL_SETS.find((d) => d.id === id);
}

/**
 * Haengt alle Boden- und Decal-Texturen in den Phaser-Loader. Fehlt eine URL
 * (Glob leer), wird sie ausgelassen -- das Melt baut dann aus der Fallbackfarbe
 * (kein Crash, sichtbarer Hinweis im Bericht).
 */
export function enqueueTerrainLoads(load: Phaser.Loader.LoaderPlugin): void {
  for (const sort of GROUND_SORTS) {
    sort.files.forEach((file, i) => {
      const url = urlByBasename(GROUND_URLS, file + ".png");
      if (url) load.image(sort.keys[i], url);
    });
  }
  for (const set of DECAL_SETS) {
    set.files.forEach((file, i) => {
      const url = urlByBasename(DECAL_URLS, file + ".png");
      if (url) load.image(set.keys[i], url);
    });
  }
}

// --- Variantenquellen je Sorte ----------------------------------------------
// Statt einer periodischen Schmelz-Textur (die bei ~2048px sichtbar repetierte,
// vom 2D-Autokorrelations-Gate belegt) haelt die Registry die VIER Quellvarianten
// je Sorte. Der Renderer komponiert sie regionsweise im Welt-Raum (nicht-
// periodisch, Strang 3): kein Tile- und kein Regionsperioden-Peak.

interface TerrainRegistry {
  /** Die vier Quellvarianten je Sorten-Id (Pattern-Quellen fuer die Region-Komposition). */
  variants: Record<string, (HTMLImageElement | HTMLCanvasElement)[]>;
  /** Mittlere Helligkeit je Sorte (0..1), fuer Lesbarkeit/Fallback. */
  luma: Record<string, number>;
  /** Quellbild je Decal-Schluessel (freigestellt, fuer den Streupinsel). */
  decals: Record<string, HTMLImageElement | HTMLCanvasElement>;
}

/** Volle Flaeche aus der Fallbackfarbe, falls eine Variante fehlt. */
function flatVariant(color: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
  }
  return cv;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Prozedurale, NAHTLOS kachelnde Bodenvariante (periodisches Plasma) um eine
 * Grundfarbe -- gemotteltes, lebendiges Gruen statt flacher Flaeche. Platzhalter
 * fuer eine Sorte ohne KREA-PNG (HELLMUTH-Zielsorte), bis Ticro die echte Textur
 * liefert. Pro Variante ein eigener Phasen-Versatz -> die Anti-Repetition greift.
 */
function proceduralGroundVariant(base: string, variant: number): HTMLCanvasElement {
  const n = 256;
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const [br, bg, bb] = hexToRgb(base);
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const TAU = Math.PI * 2;
  const ph = variant * 0.37;
  // Nur ganzzahlige Frequenzen -> exakt kachelbar (kein Naht-Sprung im Pattern).
  const terms = [
    { fx: 1, fy: 2, px: 0.2 + ph, py: 0.1, a: 1.0 },
    { fx: 3, fy: 1, px: 0.6, py: 0.4 + ph, a: 0.55 },
    { fx: 2, fy: 4, px: 0.8 + ph, py: 0.3, a: 0.4 },
    { fx: 5, fy: 3, px: 0.1, py: 0.7 + ph, a: 0.28 },
    { fx: 6, fy: 7, px: 0.5, py: 0.2 + ph, a: 0.18 },
  ];
  let ampSum = 0;
  for (const t of terms) ampSum += t.a;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      let s = 0;
      for (const t of terms) s += t.a * Math.sin(TAU * (t.fx * u + t.px)) * Math.cos(TAU * (t.fy * v + t.py));
      const m = s / ampSum; // ~[-1,1]
      // Helligkeit moduliert + ein Hauch mehr Gruen in den hellen Partien (lebendig).
      const light = 1 + m * 0.22;
      const i = (y * n + x) * 4;
      d[i] = Math.max(0, Math.min(255, br * light));
      d[i + 1] = Math.max(0, Math.min(255, bg * light + Math.max(0, m) * 14));
      d[i + 2] = Math.max(0, Math.min(255, bb * light));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Prozedurale Magenta-Ader-Decal-Textur: leuchtende Risse (#B0186A) auf
 * transparentem Grund, nahtlos kachelbar. Domain-Warp + Ridge-Noise fuer
 * organische Riss-Linien. Pro Variante ein Phasen-Versatz.
 */
function proceduralMagentaVein(variant: number): HTMLCanvasElement {
  const n = 512;
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const TAU = Math.PI * 2;
  const ph = variant * 1.13;
  // Magenta #B0186A = rgb(176, 24, 106)
  const mr = 176, mg = 24, mb = 106;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      // Domain warp: shift coords with low-freq sine waves.
      const wu = u + 0.08 * Math.sin(TAU * (2 * v + 0.3 + ph));
      const wv = v + 0.06 * Math.cos(TAU * (3 * u + 0.7 + ph));
      // Ridge noise: abs(sin) produces vein-like ridges.
      let ridge = 0;
      ridge += Math.abs(Math.sin(TAU * (4 * wu + 1 * wv + ph)));
      ridge += 0.5 * Math.abs(Math.sin(TAU * (2 * wu - 3 * wv + 0.5 + ph)));
      ridge += 0.3 * Math.abs(Math.sin(TAU * (7 * wu + 5 * wv + 1.2 + ph)));
      // Narrow veins: power-sharpen and threshold.
      const vein = Math.max(0, 1 - ridge);
      const sharp = Math.pow(vein, 6);
      // Glow: wider, dimmer halo around the vein.
      const glow = Math.pow(vein, 2) * 0.3;
      const alpha = Math.min(1, sharp + glow);
      const brightness = 0.6 + 0.4 * (sharp / Math.max(0.01, alpha));
      const i = (y * n + x) * 4;
      d[i] = Math.min(255, Math.round(mr * brightness + 40 * sharp));
      d[i + 1] = Math.min(255, Math.round(mg * brightness + 10 * sharp));
      d[i + 2] = Math.min(255, Math.round(mb * brightness + 20 * sharp));
      d[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Mittlere Helligkeit eines Bildes aus einer 16x16-Stichprobe (0..1). */
function sampleLuma(src: CanvasImageSource): number {
  const cv = document.createElement("canvas");
  cv.width = 16;
  cv.height = 16;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0.3;
  ctx.drawImage(src, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  return s / (d.length / 4);
}

/**
 * Sammelt die Quellvarianten aller Sorten und die Decal-Quellbilder. Einmalig
 * nach dem Laden aufrufen. Kein teures Pixel-Verschmelzen mehr -- die Region-
 * Komposition macht der Renderer beim Backen.
 */
export function buildTerrainRegistry(scene: Phaser.Scene): TerrainRegistry {
  const reg: TerrainRegistry = { variants: {}, luma: {}, decals: {} };
  for (const sort of GROUND_SORTS) {
    const vs: (HTMLImageElement | HTMLCanvasElement)[] = [];
    let luma = 0.3;
    sort.keys.forEach((k, i) => {
      if (scene.textures.exists(k)) {
        const src = scene.textures.get(k).getSourceImage() as HTMLImageElement;
        vs.push(src);
        if (i === 0) luma = sampleLuma(src);
      } else if (sort.procedural) {
        // Prozeduraler Platzhalter (gemottelt, nahtlos) statt flacher Flaeche.
        const cv = proceduralGroundVariant(sort.fallback, i);
        vs.push(cv);
        if (i === 0) luma = sampleLuma(cv);
      } else {
        vs.push(flatVariant(sort.fallback));
      }
    });
    reg.variants[sort.id] = vs;
    reg.luma[sort.id] = luma;
  }
  for (const set of DECAL_SETS) {
    set.keys.forEach((k, i) => {
      if (scene.textures.exists(k)) {
        reg.decals[k] = scene.textures.get(k).getSourceImage() as HTMLImageElement;
      } else if (set.procedural && set.id === "magenta-ader") {
        const cv = proceduralMagentaVein(i);
        scene.textures.addCanvas(k, cv);
        reg.decals[k] = cv;
      }
    });
  }
  return reg;
}

// --- Decal-Freistellung -----------------------------------------------------
// Die Decal-PNGs sind quadratische Blatt-Texturen (mehrere Flecken auf
// undurchsichtigem Grund), NICHT freigestellt. Damit ein Decal nicht als harte
// Kachel auf dem Boden klebt, leiten wir EINMAL eine freigestellte Variante ab:
// organisch-radiale Alpha-Maske (Rausch-Rand) per 'destination-in'. Das ist eine
// erlaubte Ableitung (Maske) aus dem Bestand, keine neue Asset-Generierung.

/** Suffix der freigestellten Decal-Textur. */
export function decalCutKey(key: string): string {
  return key + "_cut";
}

// Mittlere BG-Farbe aus den vier 48x48-Ecken (faengt Vignetten wie oil-3, statt
// nur einen 6px-Rand zu mitteln -- gemessener Fix gegen das Geisterquadrat).
function cornerBackground(d: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const S = 48;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const corners: [number, number][] = [
    [0, 0],
    [w - S, 0],
    [0, h - S],
    [w - S, h - S],
  ];
  for (const [ox, oy] of corners) {
    for (let y = oy; y < oy + S; y++) {
      for (let x = ox; x < ox + S; x++) {
        const i = (y * w + x) * 4;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
    }
  }
  return [r / n, g / n, b / n];
}

/**
 * Freistellung per DISTANZ-MATTE (kein Saettigungstor -- das liess das warme
 * Beige durch). Alpha = clip((d-28)/(70-28)) mit d = Abstand zur Eck-BG-Farbe.
 * Innen voll, BG transparent, weicher Saum dazwischen. In-Browser (kein PIL im
 * Container); dieselbe Logik wie das offline tools/process_decals.py.
 */
export function buildDecalCutouts(scene: Phaser.Scene): void {
  const SIZE = 512;
  const STRONG = 28;
  const WEAK = 70;
  for (const set of DECAL_SETS) {
    if (set.procedural) continue;
    for (const key of set.keys) {
      const cut = decalCutKey(key);
      if (!scene.textures.exists(key) || scene.textures.exists(cut)) continue;
      const srcImg = scene.textures.get(key).getSourceImage() as CanvasImageSource;
      const cv = document.createElement("canvas");
      cv.width = SIZE;
      cv.height = SIZE;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      ctx.drawImage(srcImg, 0, 0, SIZE, SIZE);
      const img = ctx.getImageData(0, 0, SIZE, SIZE);
      const d = img.data;
      const [br, bg, bb] = cornerBackground(d, SIZE, SIZE);
      for (let i = 0; i < d.length; i += 4) {
        const dist = Math.sqrt((d[i] - br) ** 2 + (d[i + 1] - bg) ** 2 + (d[i + 2] - bb) ** 2);
        d[i + 3] = Math.round(Math.min(1, Math.max(0, (dist - STRONG) / (WEAK - STRONG))) * 255);
      }
      ctx.putImageData(img, 0, 0);
      scene.textures.addCanvas(cut, cv);
    }
  }
}

export type { TerrainRegistry };
