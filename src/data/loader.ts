// Datenschicht-Loader fuer HELLMUTH.
// Bindet die JSON-Definitionen aus game/data/ statisch und typisiert ein.
// Erweiterung um echte Validierung (z. B. zod) ist ein spaeterer Schritt
// (siehe TODO.md). Hier nur das Geruest: Typen + getypte Importe + Zugriff.

import resourcesJson from "../../game/data/resources.json";
import unitsJson from "../../game/data/units.json";
import buildingsJson from "../../game/data/buildings.json";
import techTreeJson from "../../game/data/tech_tree.json";
import assetManifestJson from "../../game/data/asset_manifest.json";

// --- Gemeinsame Typen -----------------------------------------------------

export type FactionId = "hellmuth" | "moderat";

/** Besitzer einer Entity. Steuert Auswahl und Feindbeziehung. */
export type Owner = "spieler" | "gegner";

/** Angriffsart einer kampffaehigen Entity. */
export type AngriffsTyp = "nah" | "fern";

export type ResourceId = "botanicals" | "reinwasser" | "destillat";

/** Kostenangabe: Teilmenge der Ressourcen mit Mengen. */
export type Cost = Partial<Record<ResourceId, number>>;

// --- Ressourcen -----------------------------------------------------------

export interface ResourceDef {
  label: string;
  start: number;
}

export type ResourceTable = Record<ResourceId, ResourceDef>;

// --- Einheiten ------------------------------------------------------------

export type UnitRole =
  | "worker"
  | "caster"
  | "melee"
  | "ranged"
  | "flyer"
  | "heavy"
  | "siege";

export interface UnitDef {
  name: string;
  faction: FactionId;
  role: UnitRole;
  hp: number;
  kosten: Cost;
  pop: number;
  /** Produktionsdauer in Sekunden. */
  bauzeit: number;
  kann_bauen?: boolean;
  /** Bewegungstempo in Kacheln pro Sekunde. */
  tempo: number;
  /** Sichtradius in Kacheln (Fog-of-War, kreisfoermig). Fehlt -> VISION.defaultSicht. */
  sicht?: number;
  /** Tragkraft pro Sammel-Trip (nur Arbeiter). */
  tragkraft?: number;
  /** Erntedauer pro Trip in Millisekunden (nur Arbeiter). */
  erntezeit_ms?: number;
  /** Schaden pro Angriff. 0 = kann nicht angreifen (z. B. Arbeiter). */
  schaden: number;
  /** Reichweite in Kacheln (Chebyshev). */
  reichweite: number;
  /** Angriffe pro Sekunde. */
  angriffstempo: number;
  /** Ruestung, wird vom Schaden abgezogen. */
  ruestung: number;
  /** Nah- oder Fernkampf. */
  angriffstyp: AngriffsTyp;
  /** Voraussetzungsgebaeude (Typ-Id): nur baubar, wenn es fertig steht. */
  requiresBuilding?: string;
}

export type UnitTable = Record<string, UnitDef>;

// --- Gebaeude -------------------------------------------------------------

export type BuildingRole =
  | "hq"
  | "resource"
  | "upgrade"
  | "caster"
  | "production"
  | "supply"
  | "defense";

/** Grundflaeche eines Gebaeudes in Kacheln (vom Anker nach +col/+row). */
export interface Footprint {
  w: number;
  h: number;
}

export interface BuildingDef {
  name: string;
  faction: FactionId;
  role: BuildingRole;
  hp?: number;
  pop_kap?: number;
  ressource?: ResourceId;
  /** Endlicher Ressourcenvorrat (nur Ressourcenknoten). */
  vorrat?: number;
  /** Baukosten je Ressource (nur baubare Gebaeude). */
  kosten?: Cost;
  /** Bauzeit in Sekunden (nur baubare Gebaeude). */
  bauzeit?: number;
  /** Grundflaeche in Kacheln. Fehlt sie, gilt 1x1. */
  grundflaeche?: Footprint;
  /** Sichtradius in Kacheln (Fog-of-War, kreisfoermig). Fehlt -> VISION.defaultSicht. */
  sicht?: number;
  /** Von einem Arbeiter baubar? */
  baubar?: boolean;
  /** Tech-Stufe als Vorbedingung (z. B. Destille = 2). Fehlt -> Stufe 1.
   *  Editor: tier-gated Eintraege werden im Katalog sichtbar markiert; das harte
   *  Gameplay-Tier-Gate sitzt im BuildSystem (Code3, DESTILLAT-SYSTEM §HELLMUTH). */
  tier?: number;
  /** Per-Fraktions-Cap (z. B. Destille max 3 je Spieler). Editor-seitig wird der
   *  Klick auf den (n+1). Eintrag abgewiesen; Spielregel sitzt im BuildSystem. */
  max_per_player?: number;
  /** Voraussetzungsgebaeude (Typ-Id): nur baubar, wenn es fertig vorliegt
   *  (deklarativer Gate-Pfad in GameState.canConstruct, generisch fuer alle
   *  Bauten mit Voraussetzung). Orthogonal zu `tier`. */
  requiresBuilding?: string;
  /** Ausbildbare Einheitentypen (nur Produktionsgebaeude). */
  produziert?: string[];
  /** Ruestung, wird vom erlittenen Schaden abgezogen. */
  ruestung?: number;
  /** Schaden pro Angriff (nur kampffaehige Gebaeude, z. B. Vorposten). */
  schaden?: number;
  /** Reichweite in Kacheln (nur kampffaehige Gebaeude). */
  reichweite?: number;
  /** Angriffe pro Sekunde (nur kampffaehige Gebaeude). */
  angriffstempo?: number;
  /** Nah- oder Fernkampf (nur kampffaehige Gebaeude). */
  angriffstyp?: AngriffsTyp;
}

export type BuildingTable = Record<string, BuildingDef>;

// --- Tech-Baum ------------------------------------------------------------

export interface TechTree {
  stufen: string[];
}

// --- Asset-Manifest -------------------------------------------------------

export interface AssetManifestEntry {
  key: string;
  type: string;
  path: string;
}

export interface AssetManifest {
  version: number;
  eintraege: AssetManifestEntry[];
}

// --- Gebuendelte Spieldaten ----------------------------------------------

export interface GameData {
  resources: ResourceTable;
  units: UnitTable;
  buildings: BuildingTable;
  techTree: TechTree;
  assetManifest: AssetManifest;
}

/**
 * Zentraler Tempo-Skalar (TIME_SCALE, Code7 Tempo-Kalibrierung 2026-07-03).
 * Der Mensch beschrieb das Spiel als "ungefaehr doppelt so schnell wie es soll".
 * 0.5 halbiert das gefuehlte Grundtempo: Bewegungen laufen halb so schnell,
 * Angriffe halb so oft, Baustellen brauchen doppelt so lang. Nur die Werte in
 * den JSON-Defs (tempo, angriffstempo, bauzeit, erntezeit_ms) sowie eine kleine
 * Handvoll ms-Raten in balance.ts werden hier zentral skaliert -- alles andere
 * (Sim-Takt 30 Hz, HP, Ruestung, Sichtradius, Reichweite, Knockback-Physik)
 * bleibt unberuehrt. Zurueckdrehen = eine Zahl aendern.
 *
 * Physik: `tempo` (Kacheln/s) wird MULTIPLIZIERT (kleiner = langsamer),
 * `angriffstempo` (Angriffe/s) wird ebenfalls multipliziert (kleiner = seltener
 * Angreifen -> laengerer Cooldown, weil combat_system Cooldown = 1000/tempoOf
 * rechnet), `bauzeit`/`erntezeit_ms` werden DIVIDIERT (kleiner Skalar = mehr
 * Sekunden bis fertig). Sammel-Rate an sich (Kaefig zwischen Baum und Basis)
 * ergibt sich aus tempo*erntezeit_ms + Wegzeit -> automatisch halbiert.
 */
export const TIME_SCALE = 0.5;

function scaleUnitDefs(units: UnitTable): UnitTable {
  const out: UnitTable = {};
  for (const [id, def] of Object.entries(units)) {
    out[id] = {
      ...def,
      tempo: def.tempo * TIME_SCALE,
      angriffstempo: def.angriffstempo * TIME_SCALE,
      bauzeit: def.bauzeit / TIME_SCALE,
      erntezeit_ms: def.erntezeit_ms != null ? def.erntezeit_ms / TIME_SCALE : def.erntezeit_ms,
    };
  }
  return out;
}

function scaleBuildingDefs(buildings: BuildingTable): BuildingTable {
  const out: BuildingTable = {};
  for (const [id, def] of Object.entries(buildings)) {
    out[id] = {
      ...def,
      bauzeit: def.bauzeit != null ? def.bauzeit / TIME_SCALE : def.bauzeit,
      angriffstempo: def.angriffstempo != null ? def.angriffstempo * TIME_SCALE : def.angriffstempo,
    };
  }
  return out;
}

/**
 * Laedt alle Spieldaten. Synchron, da die JSON statisch gebuendelt sind.
 * Die getypten Casts sind das Vertrauensband zwischen JSON und TS; eine echte
 * Schema-Validierung folgt spaeter (TODO.md). Ab 2026-07-03: Tempo-Raten werden
 * durch TIME_SCALE zentral skaliert (Code7 Tempo-Kalibrierung).
 */
export function loadGameData(): GameData {
  return {
    resources: resourcesJson as ResourceTable,
    units: scaleUnitDefs(unitsJson as UnitTable),
    buildings: scaleBuildingDefs(buildingsJson as BuildingTable),
    techTree: techTreeJson as TechTree,
    assetManifest: assetManifestJson as AssetManifest,
  };
}
