// Sprite-Manifest und Typ-zu-Key-Zuordnungen. Phaser-frei (nur Daten), damit
// es leicht erweiterbar und testbar bleibt. Der Preloader laedt alle Eintraege;
// fehlt eine Datei, behaelt die Entity ihre gezeichnete Platzhalterform.
//
// Konvention: Phaser-Texturschluessel = Dateistamm (eindeutig ueber alle
// Kategorien). Eine neue Zuordnung ist genau eine Zeile in den Records unten.

export interface SpriteEntry {
  key: string;
  path: string;
  /** Optionales Asset: fehlt es, wird ohne Warnung der Fallback genutzt. */
  optional?: boolean;
}

// Pfad relativ zum Web-Root. Dateien liegen unter hellmuth/public/sprites/ und
// werden von Vite unter /sprites/ ausgeliefert.
const ROOT = "sprites/";

export const SPRITE_MANIFEST: SpriteEntry[] = [
  // Karten-Megatextur + Kollisionsmaske (optional; fehlen -> Kachelboden-Fallback)
  { key: "map_megatexture", path: ROOT + "maps/neutral.png", optional: true },
  { key: "map_collision", path: ROOT + "maps/neutral_mask.png", optional: true },
  // Gebaeude (primaere Variante = Abwaertskompatibel, Varianten = _v2, _v3 etc.)
  { key: "apotheke", path: ROOT + "buildings/apotheke.png" },
  { key: "apotheke_v2", path: ROOT + "buildings/apotheke_v2.png", optional: true },
  { key: "apotheke_v3", path: ROOT + "buildings/apotheke_v3.png", optional: true },
  { key: "apotheke_v4", path: ROOT + "buildings/apotheke_v4.png", optional: true },
  { key: "labor", path: ROOT + "buildings/labor.png" },
  { key: "labor_v2", path: ROOT + "buildings/labor_v2.png", optional: true },
  { key: "kuratorium", path: ROOT + "buildings/kuratorium.png" },
  { key: "kuratorium_v2", path: ROOT + "buildings/kuratorium_v2.png", optional: true },
  { key: "beet", path: ROOT + "buildings/beet.png" },
  { key: "beet_v2", path: ROOT + "buildings/beet_v2.png", optional: true },
  { key: "beet_v3", path: ROOT + "buildings/beet_v3.png", optional: true },
  { key: "zuckermaschine", path: ROOT + "buildings/zuckermaschine.png" },
  { key: "zuckermaschine_v2", path: ROOT + "buildings/zuckermaschine_v2.png", optional: true },
  { key: "zuckermaschine_v3", path: ROOT + "buildings/zuckermaschine_v3.png", optional: true },
  { key: "zuckermaschine_v4", path: ROOT + "buildings/zuckermaschine_v4.png", optional: true },
  { key: "raffinerie", path: ROOT + "buildings/raffinerie.png" },
  { key: "raffinerie_v2", path: ROOT + "buildings/raffinerie_v2.png", optional: true },
  { key: "schlickwerk", path: ROOT + "buildings/schlickwerk.png" },
  { key: "schlickwerk_v2", path: ROOT + "buildings/schlickwerk_v2.png", optional: true },
  { key: "gaertank", path: ROOT + "buildings/gaertank.png" },
  { key: "gaertank_v2", path: ROOT + "buildings/gaertank_v2.png", optional: true },
  { key: "vorposten", path: ROOT + "buildings/vorposten.png" },
  { key: "vorposten_v2", path: ROOT + "buildings/vorposten_v2.png", optional: true },
  { key: "vorposten_v3", path: ROOT + "buildings/vorposten_v3.png", optional: true },
  { key: "destillatsickerung", path: ROOT + "buildings/destillatsickerung.png" },
  { key: "destillatsickerung_v2", path: ROOT + "buildings/destillatsickerung_v2.png", optional: true },
  // Destille (HELLMUTH, Tier 2) -- Asset-Luecke laut DESTILLAT-SYSTEM §"Asset-Luecke";
  // optional => Platzhalter-Fallback wie bei den uebrigen fehlenden Sprites, bis
  // Ticro per KREA das Bild liefert (Tonalitaet wie Apotheke/Labor, Footprint 2x2).
  { key: "destille", path: ROOT + "buildings/destille.png", optional: true },
  // Baustellen (Baustufen-Sprites, pro Fraktion und Footprint-Groesse)
  { key: "baustelle_h_2x2", path: ROOT + "buildings/baustelle_h_2x2.png", optional: true },
  { key: "baustelle_h_2x2_v2", path: ROOT + "buildings/baustelle_h_2x2_v2.png", optional: true },
  { key: "baustelle_h_3x3", path: ROOT + "buildings/baustelle_h_3x3.png", optional: true },
  { key: "baustelle_h_3x3_v2", path: ROOT + "buildings/baustelle_h_3x3_v2.png", optional: true },
  { key: "baustelle_h_4x4", path: ROOT + "buildings/baustelle_h_4x4.png", optional: true },
  { key: "baustelle_h_4x4_v2", path: ROOT + "buildings/baustelle_h_4x4_v2.png", optional: true },
  { key: "baustelle_m_2x2", path: ROOT + "buildings/baustelle_m_2x2.png", optional: true },
  { key: "baustelle_m_2x2_v2", path: ROOT + "buildings/baustelle_m_2x2_v2.png", optional: true },
  { key: "baustelle_m_3x3", path: ROOT + "buildings/baustelle_m_3x3.png", optional: true },
  { key: "baustelle_m_3x3_v2", path: ROOT + "buildings/baustelle_m_3x3_v2.png", optional: true },
  // MODERAT Destillerie (eigener Gebaeude-Subtyp, kein NAMING_CANON-Eintrag bisher)
  { key: "destillerie_m", path: ROOT + "buildings/destillerie_m.png", optional: true },
  { key: "destillerie_m_v2", path: ROOT + "buildings/destillerie_m_v2.png", optional: true },
  // Ruinen (Zerstoerungszustand, pro Fraktion)
  { key: "ruine_h", path: ROOT + "buildings/ruine_h.png", optional: true },
  { key: "ruine_h_v2", path: ROOT + "buildings/ruine_h_v2.png", optional: true },
  { key: "ruine_m", path: ROOT + "buildings/ruine_m.png", optional: true },
  { key: "ruine_m_v2", path: ROOT + "buildings/ruine_m_v2.png", optional: true },
  { key: "ruine_m_v3", path: ROOT + "buildings/ruine_m_v3.png", optional: true },
  { key: "ruine_m_v4", path: ROOT + "buildings/ruine_m_v4.png", optional: true },
  // Einheiten
  { key: "sammler", path: ROOT + "units/sammler.png" },
  { key: "apotheker", path: ROOT + "units/apotheker.png" },
  { key: "destillateur", path: ROOT + "units/destillateur.png" },
  { key: "alchemist", path: ROOT + "units/alchemist.png" },
  { key: "suchfalter", path: ROOT + "units/suchfalter.png" },
  { key: "kurator", path: ROOT + "units/kurator.png" },
  // hellmuth wird als Mehr-Clip-Atlas geladen (UNIT_ATLAS), nicht statisch.
  { key: "sirup-trupp", path: ROOT + "units/sirup-trupp.png" },
  { key: "stahlbrute", path: ROOT + "units/stahlbrute.png" },
  { key: "rohrkanone", path: ROOT + "units/rohrkanone.png" },
  { key: "schleuderer", path: ROOT + "units/schleuderer.png" },
  { key: "toxischer-nebler", path: ROOT + "units/toxischer-nebler.png" },
  // Ressourcenvorkommen
  { key: "hain", path: ROOT + "resources/hain.png" },
  { key: "hain_v2", path: ROOT + "resources/hain_v2.png", optional: true },
  { key: "hain_v3", path: ROOT + "resources/hain_v3.png", optional: true },
  { key: "hain_v4", path: ROOT + "resources/hain_v4.png", optional: true },
  { key: "hain_erschoepft", path: ROOT + "resources/hain_erschoepft.png", optional: true },
  { key: "hain_erschoepft_v2", path: ROOT + "resources/hain_erschoepft_v2.png", optional: true },
  { key: "hain_erschoepft_v3", path: ROOT + "resources/hain_erschoepft_v3.png", optional: true },
  { key: "hain_erschoepft_v4", path: ROOT + "resources/hain_erschoepft_v4.png", optional: true },
  // Quelle: Alt-Grafik (fruehere Iteration) entfernt (CODE4 BLUT+MAGENTA Paket 4).
  // Der Slot bleibt fuer den kuenftigen KREA-Drop, faellt bis dahin ueber das
  // exists()-Gate + optional-Flag lautlos auf die Entity-Platzhalterform zurueck.
  { key: "quelle", path: ROOT + "resources/quelle.png", optional: true },
  // Terrain
  { key: "boden-hellmuth", path: ROOT + "terrain/boden-hellmuth.png" },
  { key: "boden-moderat", path: ROOT + "terrain/boden-moderat.png" },
  // UI
  { key: "icon-botanicals", path: ROOT + "ui/icon-botanicals.png" },
  { key: "icon-reinwasser", path: ROOT + "ui/icon-reinwasser.png" },
  { key: "icon-destillat", path: ROOT + "ui/icon-destillat.png" },
  { key: "icon-population", path: ROOT + "ui/icon-population.png" },
  { key: "auswahlring", path: ROOT + "ui/auswahlring.png" },
  { key: "rally-marker", path: ROOT + "ui/rally-marker.png" },
  { key: "attack-cursor", path: ROOT + "ui/attack-cursor.png" },
  { key: "pause", path: ROOT + "ui/pause.png" },
  // Optionale, handgemalte Boden-Schatten (uebersteuern den prozeduralen).
  { key: "boden-aura", path: ROOT + "terrain/boden-aura.png", optional: true },
  { key: "boden-aura-baum", path: ROOT + "terrain/boden-aura-baum.png", optional: true },
  { key: "boden-aura-fels", path: ROOT + "terrain/boden-aura-fels.png", optional: true },
  // Fundamentflecken (kachelweise Stempel unter Weltobjekten). Optional: fehlen
  // sie, bekommt das Objekt keinen Fleck (kein Crash).
  { key: "boden-fundament-sand", path: ROOT + "terrain/boden-fundament-sand.png", optional: true },
  { key: "boden-fundament-erde", path: ROOT + "terrain/boden-fundament-erde.png", optional: true },
  { key: "boden-fundament-moos", path: ROOT + "terrain/boden-fundament-moos.png", optional: true },
  // Terrain-Doodads (Fels, Baum, Streu) — Schluessel = Dateiname ohne Endung.
  { key: "fels-1", path: ROOT + "terrain/fels-1.png" },
  { key: "fels-2", path: ROOT + "terrain/fels-2.png" },
  { key: "felskante", path: ROOT + "terrain/felskante.png" },
  { key: "felssaeule", path: ROOT + "terrain/felssaeule.png" },
  { key: "baum-1", path: ROOT + "terrain/baum-1.png" },
  { key: "baum-2", path: ROOT + "terrain/baum-2.png" },
  { key: "baumgruppe", path: ROOT + "terrain/baumgruppe.png" },
  { key: "baum-tot", path: ROOT + "terrain/baum-tot.png" },
  { key: "wald", path: ROOT + "terrain/wald.png" },
  { key: "streu-1", path: ROOT + "terrain/streu-1.png" },
  { key: "streu-2", path: ROOT + "terrain/streu-2.png" },
  { key: "streu-3", path: ROOT + "terrain/streu-3.png" },
  { key: "streu-4", path: ROOT + "terrain/streu-4.png" },
  { key: "streu-5", path: ROOT + "terrain/streu-5.png" },
  { key: "streu-6", path: ROOT + "terrain/streu-6.png" },
  { key: "streu-7", path: ROOT + "terrain/streu-7.png" },
  // KREA-Baum-Platzhalter: optional bis Ticro die echten Assets liefert.
  // Bis dahin Fallback auf bestehende Baum-Sprites via Doodad-System.
  { key: "hain-1", path: ROOT + "terrain/baum-1.png", optional: true },
  { key: "hain-2", path: ROOT + "terrain/baum-2.png", optional: true },
  { key: "hain-3", path: ROOT + "terrain/baum-1.png", optional: true },
  { key: "hain-4", path: ROOT + "terrain/baum-2.png", optional: true },
  { key: "hain-erschoepft-1", path: ROOT + "terrain/baum-tot.png", optional: true },
  { key: "hain-erschoepft-2", path: ROOT + "terrain/baum-tot.png", optional: true },
  { key: "hain-erschoepft-3", path: ROOT + "terrain/baum-tot.png", optional: true },
  { key: "hain-erschoepft-4", path: ROOT + "terrain/baum-tot.png", optional: true },
];

/** Pfad eines Sprite-Keys (z. B. fuer CSS-Cursor). */
export function spritePath(key: string): string | undefined {
  return SPRITE_MANIFEST.find((e) => e.key === key)?.path;
}

// --- Typ -> Sprite-Key (je eine Zeile) --------------------------------------

export const BUILDING_SPRITE: Record<string, string> = {
  apotheke: "apotheke",
  labor: "labor",
  kuratorium: "kuratorium",
  beet: "beet",
  zuckermaschine: "zuckermaschine",
  raffinerie: "raffinerie",
  schlickwerk: "schlickwerk",
  gaertank: "gaertank",
  vorposten: "vorposten",
  destille: "destille", // HELLMUTH, Tier 2 (DESTILLAT-SYSTEM)
};

export const NODE_SPRITE: Record<string, string> = {
  hain: "hain",
  quelle: "quelle",
  destillatsickerung: "destillatsickerung",
};

export const UNIT_SPRITE: Record<string, string> = {
  sammler: "sammler",
  apotheker: "apotheker",
  destillateur: "destillateur",
  alchemist: "alchemist",
  suchfalter: "suchfalter",
  kurator: "kurator",
  sirup_trupp: "sirup-trupp",
  stahlbrute: "stahlbrute",
  rohrkanone: "rohrkanone",
  schleuderer: "schleuderer",
  toxischer_nebler: "toxischer-nebler",
};

// --- Direktionale Mehr-Clip-Atlanten (render_unit.py -> pack_atlas.py) -------
// Einheiten mit Eintrag hier rendern als animierter Atlas-Sprite. Ein Atlas
// haelt mehrere Clips (idle/walk/attack/death, optional harvest); der Animator
// waehlt pro Frame Clip + Richtung + Frame. Texture- und Atlas-JSON liegen unter
// public/sprites/units/. Frame-Schluessel: <stem>_<clip>_<dir3>_<frame2>.
// Frames pro Clip liest der Animator zur Laufzeit aus dem Atlas (datengetrieben:
// neue Einheit = neuer Eintrag + gerenderte Dateien, keine weitere Aenderung).

export type UnitClip = "idle" | "walk" | "attack" | "death" | "harvest";

export interface UnitAtlas {
  key: string; // Phaser-Texturschluessel (== Atlas-Stamm)
  png: string; // Bildpfad (Web-Root)
  json: string; // Atlas-JSON-Pfad (Web-Root)
  stem: string; // Stamm im Frame-Schluessel, z. B. "hellmuth"
  dirs: number; // gerenderte Richtungen (8; Held spaeter 16)
  clips: UnitClip[]; // erwartete Clips (informativ; real zaehlt der Atlas)
  hitFrame?: number; // Treffer-Frame-Index des attack-Clips (Default: Clip-Mitte)
}

export const UNIT_ATLAS: Record<string, UnitAtlas> = {
  // Held: idle/walk/attack/death, 8 Richtungen. Dateitausch (16 Richtungen,
  // neue Textur) ohne Code-Aenderung -- nur dirs hier anpassen.
  hellmuth: {
    key: "hellmuth",
    png: ROOT + "units/hellmuth.png",
    json: ROOT + "units/hellmuth.json",
    stem: "hellmuth",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  sammler: {
    key: "sammler_atlas",
    png: ROOT + "units/sammler.png",
    json: ROOT + "units/sammler.json",
    stem: "sammler",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  destillateur: {
    key: "destillateur_atlas",
    png: ROOT + "units/destillateur.png",
    json: ROOT + "units/destillateur.json",
    stem: "destillateur",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  apotheker: {
    key: "apotheker_atlas",
    png: ROOT + "units/apotheker.png",
    json: ROOT + "units/apotheker.json",
    stem: "apotheker",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  kurator: {
    key: "kurator_atlas",
    png: ROOT + "units/kurator.png",
    json: ROOT + "units/kurator.json",
    stem: "kurator",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  alchemist: {
    key: "alchemist_atlas",
    png: ROOT + "units/alchemist.png",
    json: ROOT + "units/alchemist.json",
    stem: "alchemist",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  suchfalter: {
    key: "suchfalter_atlas",
    png: ROOT + "units/suchfalter.png",
    json: ROOT + "units/suchfalter.json",
    stem: "suchfalter",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  sirup_trupp: {
    key: "sirup_trupp_atlas",
    png: ROOT + "units/sirup_trupp.png",
    json: ROOT + "units/sirup_trupp.json",
    stem: "sirup_trupp",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  schleuderer: {
    key: "schleuderer_atlas",
    png: ROOT + "units/schleuderer.png",
    json: ROOT + "units/schleuderer.json",
    stem: "schleuderer",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  toxischer_nebler: {
    key: "toxischer_nebler_atlas",
    png: ROOT + "units/toxischer_nebler.png",
    json: ROOT + "units/toxischer_nebler.json",
    stem: "toxischer_nebler",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  rohrkanone: {
    key: "rohrkanone_atlas",
    png: ROOT + "units/rohrkanone.png",
    json: ROOT + "units/rohrkanone.json",
    stem: "rohrkanone",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
  stahlbrute: {
    key: "stahlbrute_atlas",
    png: ROOT + "units/stahlbrute.png",
    json: ROOT + "units/stahlbrute.json",
    stem: "stahlbrute",
    dirs: 8,
    clips: ["idle", "walk", "attack", "death"],
  },
};

export function unitAtlas(typeId: string): UnitAtlas | undefined {
  return UNIT_ATLAS[typeId];
}

// UI-Sprite-Schluessel (zentral, damit Tippfehler auffallen).
export const UI_SPRITE = {
  iconBotanicals: "icon-botanicals",
  iconReinwasser: "icon-reinwasser",
  iconDestillat: "icon-destillat",
  iconPopulation: "icon-population",
  auswahlring: "auswahlring",
  rallyMarker: "rally-marker",
  attackCursor: "attack-cursor",
  pause: "pause",
} as const;

export const TERRAIN_SPRITE = {
  hellmuth: "boden-hellmuth",
  moderat: "boden-moderat",
} as const;

// Feste Zielbreite (Weltpixel) fuer Welt-/UI-Marker-Sprites. Nie native
// Pixelgroesse verwenden, sonst fuellen sie den Bildschirm.
export const RALLY_MARKER_WIDTH = 56;

// --- Anzeigegroessen (Zielbreite in Weltpixeln), vom Gameplay-Footprint
// entkoppelt. Pro Typ ueberschreibbar; sonst Default. -------------------------

export const BUILDING_DISPLAY_WIDTH_DEFAULT = 100;
export const BUILDING_DISPLAY_WIDTH: Record<string, number> = {
  apotheke: 132,
  zuckermaschine: 132,
  beet: 84,
  vorposten: 92,
};

export const NODE_DISPLAY_WIDTH_DEFAULT = 56;
export const NODE_DISPLAY_WIDTH: Record<string, number> = {};

export const UNIT_DISPLAY_WIDTH_DEFAULT = 40;
export const UNIT_DISPLAY_WIDTH: Record<string, number> = {
  toxischer_nebler: 32, // Drohne: kleinstes Einheitenbild
  sirup_trupp: 34, // Arbeiter-Kugelbot: klein
  suchfalter: 36, // Schmetterling: leicht+klein
  schleuderer: 48, // Tank-auf-Stelzen: groesser als Infanterie
  alchemist: 52, // Schwere Infanterie
  rohrkanone: 56, // Sechsbein-Mech: breiter als Standard
  hellmuth: 80, // Held groesser als Standard-Einheiten
  stahlbrute: 80, // Riese: doppelte Hoehe laut Brief
};

// --- Varianten-System (AoE4-Stil: zufaellige Alternation bei Neubau) ---------
// Jeder Gebaeude-/Ressourcen-Typ kann mehrere Textur-Varianten haben. Die erste
// ist die Primaer-Textur (abwaertskompatibel mit BUILDING_SPRITE), weitere sind
// optional. Fehlt eine Variante zur Laufzeit (Textur nicht geladen), faellt die
// Auswahl lautlos auf die naechste vorhandene zurueck.

export const BUILDING_VARIANTS: Record<string, string[]> = {
  apotheke: ["apotheke", "apotheke_v2", "apotheke_v3", "apotheke_v4"],
  labor: ["labor", "labor_v2"],
  kuratorium: ["kuratorium", "kuratorium_v2"],
  beet: ["beet", "beet_v2", "beet_v3"],
  zuckermaschine: ["zuckermaschine", "zuckermaschine_v2", "zuckermaschine_v3", "zuckermaschine_v4"],
  raffinerie: ["raffinerie", "raffinerie_v2"],
  schlickwerk: ["schlickwerk", "schlickwerk_v2"],
  gaertank: ["gaertank", "gaertank_v2"],
  vorposten: ["vorposten", "vorposten_v2", "vorposten_v3"],
  destille: ["destille"],
};

export const NODE_VARIANTS: Record<string, string[]> = {
  hain: ["hain", "hain_v2", "hain_v3", "hain_v4"],
  quelle: ["quelle"],
  destillatsickerung: ["destillatsickerung", "destillatsickerung_v2"],
};

export const BAUSTELLE_VARIANTS: Record<string, Record<string, string[]>> = {
  hellmuth: {
    "2x2": ["baustelle_h_2x2", "baustelle_h_2x2_v2"],
    "3x3": ["baustelle_h_3x3", "baustelle_h_3x3_v2"],
    "4x4": ["baustelle_h_4x4", "baustelle_h_4x4_v2"],
  },
  moderat: {
    "2x2": ["baustelle_m_2x2", "baustelle_m_2x2_v2"],
    "3x3": ["baustelle_m_3x3", "baustelle_m_3x3_v2"],
  },
};

export const RUINE_VARIANTS: Record<string, string[]> = {
  hellmuth: ["ruine_h", "ruine_h_v2"],
  moderat: ["ruine_m", "ruine_m_v2", "ruine_m_v3", "ruine_m_v4"],
};

/** Pseudo-zufaellige, aber positionsstabile Variantenauswahl. */
function variantHash(col: number, row: number): number {
  let h = (col * 73856093) ^ (row * 19349663);
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  return (h >>> 16) ^ h;
}

export function pickVariant(keys: string[], col: number, row: number): string {
  if (keys.length <= 1) return keys[0];
  return keys[variantHash(col, row) % keys.length];
}

export function buildingSpriteKey(typeId: string): string | undefined {
  return BUILDING_SPRITE[typeId];
}

export function buildingVariantKey(
  typeId: string,
  col: number,
  row: number,
): string | undefined {
  const variants = BUILDING_VARIANTS[typeId];
  if (!variants || variants.length === 0) return BUILDING_SPRITE[typeId];
  return pickVariant(variants, col, row);
}
export function nodeSpriteKey(typeId: string): string | undefined {
  return NODE_SPRITE[typeId];
}
export function unitSpriteKey(typeId: string): string | undefined {
  return UNIT_SPRITE[typeId];
}
export function buildingDisplayWidth(typeId: string): number {
  return BUILDING_DISPLAY_WIDTH[typeId] ?? BUILDING_DISPLAY_WIDTH_DEFAULT;
}
export function nodeDisplayWidth(typeId: string): number {
  return NODE_DISPLAY_WIDTH[typeId] ?? NODE_DISPLAY_WIDTH_DEFAULT;
}
export function unitDisplayWidth(typeId: string): number {
  return UNIT_DISPLAY_WIDTH[typeId] ?? UNIT_DISPLAY_WIDTH_DEFAULT;
}
