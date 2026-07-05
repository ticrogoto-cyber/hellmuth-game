// Zentrale, tunebare Gameplay-Werte (Balancing). Engine-/Karten-Konstanten
// liegen in util/world.ts, das feste Startlayout als Konstanten am Kopf von
// scenes/game_scene.ts. Alles, was sich "spielgefuehlmaessig" einstellen
// laesst, gehoert hierher.

import { TIME_SCALE, type Cost, type BuildingRole, type FactionId } from "./loader";

// Terrain: durchgehender Boden der Spielerfraktion als achsenausgerichtete
// Rechteckflaeche (gerader Rand statt Iso-Treppe). Kamera-Grenzen sitzen exakt
// auf diesem Rechteck.
export const TERRAIN = {
  /** Randzone in Weltpixeln ueber die Bounding-Box des spielbaren Gitters. */
  borderPx: 280,
  /** Hintergrundfarbe (Kamera) je Fraktion, in Bodenton statt Schwarz. */
  bgColor: { hellmuth: "#26302a", moderat: "#241c22" } as Record<FactionId, string>,
  /**
   * Weltpixel, die EINE Bodenkachel abdeckt; daraus wird der TileSprite-
   * Massstab zur Laufzeit aus der tatsaechlichen Texturbreite berechnet
   * (tileScale = groundCoverageWorldPx / texture.width). So ist die
   * Kachelgroesse unabhaengig von der Texturaufloesung: 490 ergibt ~0.12 auf
   * 4096 (manuell bestaetigt) und ~0.39 auf 1254.
   */
  groundCoverageWorldPx: 490,
  /**
   * Mipmapping fuer die Bodentextur versuchen (nur WebGL2 zuverlaessig, da die
   * Quelle NPOT ist), damit es beim Rauszoomen scharf statt flimmrig bleibt.
   * Bei Problemen auf einzelnen GPUs abschaltbar.
   */
  mipmaps: true,
};

// Kamera-Begrenzung. Die Scroll-Grenzen sitzen weiter auf terrainRect(); hier
// nur, wie viel ueber den exakt einpassenden Mindestzoom hinaus herausgezoomt
// werden darf, ohne dass schwarzer Rand jenseits des Bodenrechtecks sichtbar
// wird.
export const CAMERA = {
  /**
   * Zusatzmarge auf den aus Bodenrechteck vs. Viewport abgeleiteten
   * Mindestzoom (0 = exakt einpassen, kein schwarzer Rand). Hoeher = etwas
   * naeher heran als die exakte Einpassung. Code7 Tempo-Kalibrierung 07-03:
   * Wert von 0 auf 0.20 angehoben -- der Mensch beschrieb die aeusserste
   * Zoomstufe als "Karte aus dem Weltraum". applyZoomSteps() berechnet die
   * mittlere Stufe automatisch nach; das Rein-Zoom bleibt bei 2.5x (nah). Kein
   * schwarzer Rand-Risiko (positiver Wert = enger als exakt einpassend). Der
   * andere geprueft-Weg -- eine vierte Stufe einfuegen -- waere teurer (Array-
   * Groesse + Grenzlogik + Semantik-Umkehrung); dies hier ist eine Zahl.
   */
  minZoomMargin: 0.2,
  /**
   * Drei feste Zoomstufen, nah -> fern. Das Mausrad schaltet eine Stufe pro
   * Tick (kein stufenloser Zoom). [0] = maximaler Reinzoom; [2] = Richtwert,
   * der tatsaechliche Rauszoom wird zur Laufzeit auf den dynamischen Mindestzoom
   * (terrainRect/Viewport) geklemmt; [1] (Standard) wird als exakte Mitte
   * (near+far)/2 zur Laufzeit berechnet, der Wert hier dient nur der Doku.
   */
  zoomSteps: [2.5, 1.0, 0.45],
  /** Startstufe beim Spielstart (1-basiert; 2 = Standard/Mitte). */
  startStep: 2,
};

// Weiche Boden-Aura (Verankerungsscheibe) zentriert unter dem Fusspunkt jedes
// Gebaeudes und jedes Hindernis-Doodads. Ersetzt den frueheren versetzten
// Schatten, der wie ein abgehobener Schlagschatten las. Ein weicher
// Radialverlauf (innen voll -> aussen 0, sandig-erdiger Ton, kein harter Rand)
// verankert das Objekt im Boden, statt es schweben zu lassen. Default
// prozedural erzeugt; ein vorhandenes public/sprites/terrain/boden-aura.png
// uebersteuert.
// Bodenanbindung im Stil von They Are Billions: KEINE mittige, nach unten
// versetzte Schatten-Scheibe (die liest das Auge als Schweben). Stattdessen pro
// Objekt ein weicher, GERICHTETER Kontaktschatten, der exakt am Fusspunkt
// ansetzt und in eine global einheitliche Lichtrichtung wegfaellt, plus eine
// dezente Abdunklung direkt am Fuss (unterer Sprite-Rand). Lichtrichtung und
// Schattenlaenge sind Regler. Default prozedural; ein vorhandenes
// boden-aura.png (global) bzw. boden-aura-baum.png / boden-aura-fels.png
// (klassenspezifisch) uebersteuert die Schattentextur. Streu bleibt ohne.
export const GROUND_AURA = {
  /**
   * Globale Lichtrichtung in Grad (0 = Ost, im Uhrzeigersinn bei y nach unten).
   * Der Schatten faellt in die Gegenrichtung (lightAngle + 180).
   */
  lightAngle: 240,
  /** Schattenlaenge relativ zur (klassenskalierten) Anzeigebreite. */
  shadowLength: 0.95,
  /** Schattenbreite relativ zur (klassenskalierten) Anzeigebreite. */
  shadowWidth: 0.55,
  /** Maximale Deckkraft des gerichteten Schattens (dunkel, aber weich). */
  shadowAlpha: 0.34,
  /** Dunkler Schattenton (Tint der weichen Schattentextur). */
  shadowColorHex: 0x171410,
  /** Deckkraft der dezenten Kontaktverdunklung exakt am Fuss (ohne Versatz). */
  contactAlpha: 0.3,
  /** Durchmesser der Kontaktverdunklung relativ zur Anzeigebreite. */
  contactRatio: 0.44,
  /** Iso-Stauchung der Kontaktscheibe (Hoehe/Breite). */
  contactFlatten: 0.5,
  /** Schattengroesse relativ zur Anzeigebreite je Objektklasse. */
  sizeRatioBuilding: 1.0,
  sizeRatioDoodad: 0.92,
  /**
   * Fusspunkt-Kalibrierung je Klasse: Bruchteil der Anzeigebreite (+ = nach
   * unten), damit Schatten und Kontakt dort sitzen, wo das Objekt den Boden
   * beruehrt (Stammfuss, Felssockel, Treppenfuss), nicht am unteren PNG-Rand.
   * Startwerte fuer die visuelle Kalibrierung gegen die echten Sprites.
   */
  footOffsetY: { building: 0.0, tree: -0.04, cluster: -0.03, wald: -0.03, rock: -0.02 } as Record<string, number>,
};

// --- Terrain-Doodads (Fels, Baum, Streu) ------------------------------------
// Datengetrieben: Footprint, Anzeigegroesse, Fraktion und Blockverhalten je
// Schluessel. Fels/Baum sind Hindernisse mit Footprint; Streu ist reine Deko
// (footprint 0, blockt nichts).

export type DoodadFaction = FactionId | "neutral";

// Platzierungs-Kategorie: steuert, ueber welchen Kategorie-Zaehler ein Doodad
// gestreut wird (Block E). Datengetrieben, damit Umsortieren ohne Codeaenderung
// geht.
export type DoodadCategory = "wald" | "cluster" | "tree" | "rock" | "streu";

export interface DoodadDef {
  /** Footprint in Gitterzellen. {w:0,h:0} = reine Deko ohne Footprint. */
  footprint: { w: number; h: number };
  /** Anzeigebreite in Weltpixeln (Foot-Anchor 0.5/1.0 wie Gebaeude). */
  displayWidthPx: number;
  faction: DoodadFaction;
  blocksMovement: boolean;
  blocksSight: boolean;
  /**
   * Texturschluessel des Fundamentflecks (kachelweise Stempel). Fehlt das Feld
   * oder die Textur, bekommt das Objekt keinen Fleck (sauberer No-Op). Streu
   * bleibt bewusst ohne.
   */
  foundationTexture?: string;
  /**
   * Hoher Verdecker: wird halbtransparent, sobald eine Spieler-Einheit dahinter
   * steht (Block B). Baeume und grosse Felsen true, Streu false.
   */
  tall: boolean;
  /** Platzierungs-Kategorie (Block E): bestimmt den zustaendigen Zaehler. */
  category: DoodadCategory;
  /**
   * Tiefen-Bezug: 'foot' = Fusspunkt-Y des Sprites (Default), 'top' =
   * noerdlichste Footprint-Zelle. Sehr grosse Doodads (Wald) auf 'top', damit
   * sie weiter hinten sortieren und Objekte an ihrem Suedrand korrekt davor
   * zeichnen, statt dass der riesige Sprite sie verdeckt.
   */
  depthMode?: "foot" | "top";
}

export const DOODADS: Record<string, DoodadDef> = {
  felssaeule: { footprint: { w: 2, h: 3 }, displayWidthPx: 220, faction: "neutral", blocksMovement: true, blocksSight: true, tall: true, category: "rock", foundationTexture: "boden-fundament-erde" },
  felskante: { footprint: { w: 3, h: 2 }, displayWidthPx: 240, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "rock", foundationTexture: "boden-fundament-erde" },
  "fels-1": { footprint: { w: 2, h: 2 }, displayWidthPx: 175, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "rock", foundationTexture: "boden-fundament-erde" },
  "fels-2": { footprint: { w: 2, h: 2 }, displayWidthPx: 175, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "rock", foundationTexture: "boden-fundament-erde" },
  wald: { footprint: { w: 8, h: 8 }, displayWidthPx: 620, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "wald", foundationTexture: "boden-fundament-moos", depthMode: "top" },
  baumgruppe: { footprint: { w: 3, h: 3 }, displayWidthPx: 210, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "cluster", foundationTexture: "boden-fundament-moos" },
  "baum-1": { footprint: { w: 2, h: 2 }, displayWidthPx: 150, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "tree", foundationTexture: "boden-fundament-moos" },
  "baum-2": { footprint: { w: 2, h: 2 }, displayWidthPx: 150, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "tree", foundationTexture: "boden-fundament-moos" },
  "baum-tot": { footprint: { w: 2, h: 2 }, displayWidthPx: 140, faction: "moderat", blocksMovement: true, blocksSight: false, tall: true, category: "tree", foundationTexture: "boden-fundament-erde" },
  "hain-1": { footprint: { w: 2, h: 2 }, displayWidthPx: 160, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "tree", foundationTexture: "boden-fundament-moos" },
  "hain-2": { footprint: { w: 2, h: 2 }, displayWidthPx: 155, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "tree", foundationTexture: "boden-fundament-moos" },
  "hain-3": { footprint: { w: 2, h: 2 }, displayWidthPx: 160, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "tree", foundationTexture: "boden-fundament-moos" },
  "hain-4": { footprint: { w: 2, h: 2 }, displayWidthPx: 155, faction: "hellmuth", blocksMovement: true, blocksSight: true, tall: true, category: "tree", foundationTexture: "boden-fundament-moos" },
  "hain-erschoepft-1": { footprint: { w: 2, h: 2 }, displayWidthPx: 145, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "tree", foundationTexture: "boden-fundament-erde" },
  "hain-erschoepft-2": { footprint: { w: 2, h: 2 }, displayWidthPx: 140, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "tree", foundationTexture: "boden-fundament-erde" },
  "hain-erschoepft-3": { footprint: { w: 2, h: 2 }, displayWidthPx: 145, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "tree", foundationTexture: "boden-fundament-erde" },
  "hain-erschoepft-4": { footprint: { w: 2, h: 2 }, displayWidthPx: 140, faction: "neutral", blocksMovement: true, blocksSight: false, tall: true, category: "tree", foundationTexture: "boden-fundament-erde" },
  "streu-1": { footprint: { w: 0, h: 0 }, displayWidthPx: 38, faction: "hellmuth", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
  "streu-2": { footprint: { w: 0, h: 0 }, displayWidthPx: 36, faction: "neutral", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
  "streu-3": { footprint: { w: 0, h: 0 }, displayWidthPx: 36, faction: "neutral", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
  "streu-4": { footprint: { w: 0, h: 0 }, displayWidthPx: 38, faction: "hellmuth", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
  "streu-5": { footprint: { w: 0, h: 0 }, displayWidthPx: 36, faction: "moderat", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
  "streu-6": { footprint: { w: 0, h: 0 }, displayWidthPx: 36, faction: "moderat", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
  "streu-7": { footprint: { w: 0, h: 0 }, displayWidthPx: 38, faction: "moderat", blocksMovement: false, blocksSight: false, tall: false, category: "streu" },
};

// Fundamentfleck-System (C&C-Vorbild): pro Objekt kachelweise Stempel einer
// Fundamenttextur, in eine RenderTexture zusammengefuehrt. ERSETZT den
// GROUND_AURA-Kontaktschatten fuer Objekte mit Fleck; Streu bleibt ohne.
export const FOUNDATION = {
  /** System aktiv? */
  enabled: true,
  /**
   * Globaler Fallback-Faktor (Fundamentbreite relativ zur Anzeigebreite), falls
   * fuer eine Kategorie kein eigener Wert gesetzt ist.
   */
  extent: 1.5,
  /** Sandring der Gebaeude: sichtbar, nicht uebertrieben. */
  extentBuilding: 1.3,
  /** Felsen: Erde braucht etwas mehr Ring. */
  extentRock: 1.4,
  /** Einzelbaeume: Moos nur knapp ueber den Stamm hinaus. */
  extentTree: 1.15,
  /** Wald: duenner Ring, Textur nicht strecken. */
  extentWald: 1.08,
  /** Baumgruppe: etwas mehr als Einzelbaum. */
  extentCluster: 1.12,
  /** Ressourcenvorkommen: Mittelwert. */
  extentNode: 1.25,
  /**
   * Hoehe des Fundaments relativ zur Fundamentbreite (Breite * extent * dieser
   * Wert). Klein = breites, flaches Band am Fuss, das seitlich ueber den Sprite
   * ragt, aber kaum nach oben (sonst verschwindet es hinter dem Objekt-Sprite).
   */
  heightRatio: 0.2,
  /**
   * Versatz des Fundaments nach Sueden/vorne (Pixel) je Kategorie, damit das Band
   * auch vorne am Fuss sichtbar ist (foundation.y = obj.y + offsetY).
   */
  offsetY: { building: 8, tree: 5, rock: 10, wald: 0, cluster: 5, node: 5 } as Record<string, number>,
  /** Ziel-Deckkraft des Fundaments (Mitte voll, Rand laeuft per Textur-Alpha aus). */
  alpha: 0.8,
  /**
   * Schwelle der Fundamentbreite (Weltpixel), ab der die Textur gekachelt und
   * maskiert statt gestreckt wird (Ausweichlogik fuer sehr grosse Objekte).
   */
  tileAboveWidth: 800,
  /** Fundamenttextur aller Gebaeude (beide Fraktionen): aufgeschuetteter Sand. */
  buildingTexture: "boden-fundament-sand",
  /** Fundamenttextur je Ressourcenvorkommen-Typ. */
  nodeTexture: {
    hain: "boden-fundament-moos",
    quelle: "boden-fundament-erde",
    destillatsickerung: "boden-fundament-erde",
  } as Record<string, string>,
};

/** Fundament-extent je Objektklasse, mit Fallback auf den globalen Wert. */
export function foundationExtent(category: DoodadCategory | "building" | "node"): number {
  const perCategory: Partial<Record<string, number>> = {
    building: FOUNDATION.extentBuilding,
    rock: FOUNDATION.extentRock,
    tree: FOUNDATION.extentTree,
    wald: FOUNDATION.extentWald,
    cluster: FOUNDATION.extentCluster,
    node: FOUNDATION.extentNode,
  };
  return perCategory[category] ?? FOUNDATION.extent;
}

/** Fundament-Versatz (Pixel nach Sueden) je Objektklasse; 0 als Fallback. */
export function foundationOffsetY(category: DoodadCategory | "building" | "node"): number {
  return FOUNDATION.offsetY[category] ?? 0;
}

// Halbtransparenz hoher Verdecker (Baeume, grosse Felsen, Gebaeude), sobald eine
// Spieler-Einheit dahinter steht. Rein visuell: aendert weder Kollision noch die
// Sicht-Verdeckung der Occlusion.
export const OCCLUDER_FADE = {
  /** Effekt aktiv? */
  enabled: true,
  /** Deckkraft des Verdeckers, waehrend eine Spieler-Einheit dahinter steht. */
  alpha: 0.45,
};

// --- Anzeige-Massstab der Welt-Objekte (zentrale Regler) ---------------------
// Maßstab ist ein Regler: Anzeigegroessen lassen sich hier justieren, ohne Code
// anzufassen. Doodad-Groessen stehen oben im DOODADS-Manifest; fuer Vorkommen
// und Gebaeude wirken die folgenden Faktoren auf die in sprites.ts definierten
// Basis-Anzeigebreiten.

// Ressourcenvorkommen (Hain, Quelle) waren zu winzig: globaler Anzeige-Massstab,
// optional je Vorkommen-Typ getrennt justierbar.
export const RESOURCE_NODE = {
  /** Globaler Anzeige-Massstab der Vorkommen-Sprites. */
  displayScale: 1.8,
  /** Optionaler Override je Vorkommen-Typ (z. B. {hain: 2.0}); sonst displayScale. */
  displayScalePerType: {} as Record<string, number>,
};

/** Anzeige-Massstab eines Vorkommens (Typ-Override vor globalem Default). */
export function resourceNodeScale(typeId: string): number {
  return RESOURCE_NODE.displayScalePerType[typeId] ?? RESOURCE_NODE.displayScale;
}

// Gebaeude wirkten zu klein gegen Baeume/Wald: Default hochgesetzt, Apotheke als
// Haupthaus am groessten. Aura/Schatten skalieren mit. Pro Typ uebersteuerbar.
export const BUILDING_DISPLAY_SCALE_DEFAULT = 1.35;
export const BUILDING_DISPLAY_SCALE: Record<string, number> = {
  apotheke: 1.5,
};

/** Anzeige-Massstab eines Gebaeudes (Typ-Override vor Default 1.35). */
export function buildingDisplayScale(typeId: string): number {
  return BUILDING_DISPLAY_SCALE[typeId] ?? BUILDING_DISPLAY_SCALE_DEFAULT;
}

// Auswahlkreis: Einheiten nutzen die feste Basisgroesse aus entity.ts; Gebaeude
// leiten ihren Ringradius aus der Anzeigegroesse ab (sonst zu klein).
export const SELECTION_RING = {
  /** Ringbreite relativ zur (skalierten) Anzeigebreite des Gebaeudes. */
  buildingScale: 0.62,
};

/** Platzierung der Doodads: fester Seed = reproduzierbares Layout. */
export const DOODAD_PLACEMENT = {
  seed: 1337,
  // Kategorie-Zaehler statt einer pauschalen obstacleCount (Block E).
  /** Anzahl Waelder (grosse Fuellflaechen). */
  waldCount: 3,
  /** Anzahl Baumgruppen (Dreierbaum). */
  clusterCount: 5,
  /** Anzahl Einzelbaeume (baum-1/2/tot). */
  singleTreeCount: 14,
  /** Anzahl Felsen. */
  rockCount: 10,
  /** Einzelbaeume, die um jeden Wald gestreut werden (weicher Waldrand). */
  forestEdgeTrees: 5,
  /** Suchband (Gitterzellen) um den Wald-Footprint fuer die Randbaeume. */
  forestEdgeBand: 3,
  // --- Natuerlichere Verteilung (Block C) ---
  /** Anteil der Einzelbaeume, die im Umkreis eines Waldes statt zufaellig stehen. */
  forestClusterBias: 0.6,
  /** Umkreis (Gitterzellen) um einen Wald, in dem geclusterte Baeume landen. */
  forestNearRadius: 8,
  /** Wahrscheinlichkeit, dass ein platzierter Fels eine kleine Gruppe bildet. */
  rockClusterChance: 0.5,
  /** Umkreis (Gitterzellen), in dem die Begleitfelsen einer Gruppe landen. */
  rockClusterRadius: 3,
  /** Maximaler Wald-Abstand als Anteil der Kartenbreite (Waelder beieinander). */
  forestProximity: 0.3,
  /** Anzahl begehbarer Streu-Deko. */
  clutterCount: 48,
  /** Mindestabstand zwischen Hindernissen (Gitterzellen). */
  minSpacingObstacles: 2,
  /** Sperrradius um HQ-Gebaeude (Gitterzellen). */
  exclusionRadiusHQ: 6,
  /** Sperrradius um Ressourcenvorkommen (Gitterzellen). */
  exclusionRadiusResource: 3,
};

// Kampf-Zielpriorität. Niedrigere Zahl = hoehere Prioritaet. Innerhalb
// derselben Stufe entscheidet die Naehe. Tunebar, um die Reihenfolge ohne
// Codeaenderung zu justieren.
export const COMBAT = {
  /** Reichweite, in der ohne Befehl von selbst ein Ziel aufgenommen wird. */
  acquireRange: 5,
  /** Intervall, in dem ein bestehendes Ziel auf hoehere Prioritaet geprueft wird (ms). */
  reevalIntervalMs: 500,
  priority: {
    /** Feindliche Kampfeinheiten (alles, was zurueckschiesst). */
    combatUnit: 0,
    /** Schiessende Verteidigungsgebaeude (Vorposten). */
    defenseBuilding: 1,
    /** Sonstige Gebaeude (Produktion, Ressourcen, HQ) und Nicht-Kaempfer. */
    other: 2,
  },
};

// Arbeiterwehr: Sammler/Sirup-Trupp koennen sich schwach im Nahkampf wehren,
// damit eine Gruppe (fuenf, sechs) eine einzelne Standardeinheit niederringt,
// einzeln aber klar unterlegen ist. Reine Selbstverteidigung, kein Jagen; HP
// der Arbeiter bleiben unveraendert (schwach). Symmetrisch fuer beide Fraktionen.
export const WORKER_COMBAT = {
  /** Schaden je Schlag (vor Ruestung). Niedrig: einzeln chancenlos. */
  damage: 3,
  /** Reichweite in Kacheln (Nahkampf). */
  range: 1,
  /** Schlagintervall in ms. TIME_SCALE-skaliert (Grundtempo, Code7 07-03). */
  cooldown: 1000 / TIME_SCALE,
  /** Wehrt sich automatisch, wenn ein Feind in Reichweite steht (kein Ausruecken). */
  autoRetaliate: true,
};

// Gebaeude-HP, nach Rolle gestaffelt (ueberschreibt die hp aus buildings.json,
// damit die Staffelung an einer Stelle justierbar ist). Logik: HQ am
// robustesten; Produktion/Aufruestung/Caster im Mittelfeld; Versorgung/
// Ressourcen darunter; ein selbst schiessender Verteidigungsbau ist bewusst
// FRAGIL, damit eine kleine Armee ihn unter Gegenfeuer in vertretbarer Zeit
// knackt.
export const BUILDING_HP: Partial<Record<BuildingRole, number>> = {
  hq: 1400,
  production: 750,
  upgrade: 750,
  caster: 750,
  supply: 550,
  resource: 550,
  defense: 380,
};

/** Reparatur beschaedigter Gebaeude durch Sammler. */
export const REPAIR = {
  /** Wiederhergestellte HP pro Sekunde und Sammler. TIME_SCALE-skaliert. */
  hpPerSecondPerWorker: 30 * TIME_SCALE,
  /** Anteil der Baukosten fuer eine volle Reparatur (0..1). */
  costFraction: 0.5,
  /** Ersatz-Baukosten fuer Gebaeude ohne eigene `kosten` (z. B. HQ). */
  fallbackKosten: { botanicals: 400, reinwasser: 200 } as Cost,
};

/** Bauen einer Baustelle durch Sammler. */
export const BUILD = {
  /** Fortschritts-Multiplikator je wirksamem Sammler (1 = Bau in `bauzeit`). */
  progressPerWorker: 1,
  /** Deckel gleichzeitig wirksamer Sammler an einer Baustelle. */
  maxWorkers: 3,
  /** Anteil der Baukosten, der bei Abbruch zurueckerstattet wird (0..1). */
  refundFraction: 0.5,
  /**
   * Grosszuegige Bauzone: maximaler Abstand (Kacheln, Mitte zu Mitte) eines
   * neuen Baus zu einem eigenen Gebaeude. Klein = klebt an der Basis, gross =
   * weite Bauzone.
   */
  maxRangeFromHQ: 16,
  /**
   * Bauzone waechst mit jedem eigenen Gebaeude (true) oder zaehlt nur vom HQ
   * (false). Schaltbar.
   */
  zoneFromAnyBuilding: true,
};

/** Steuerung: Tasten und Zeitschwellen. Zentral, damit leicht aenderbar. */
export const CONTROLS = {
  /** Maximaler Abstand zweier Klicks fuer Doppelklick (ms). */
  doubleClickMs: 300,
  /** Haltedauer der Entf-Taste zum Aufloesen eigener Einheiten (ms). */
  disbandHoldMs: 2500,
  /**
   * Kantenlaenge des Befehls-Cursors in Pixeln. Browser lehnen grosse
   * Cursor-Bilder ab; die Quell-Sprites werden darauf heruntergerechnet.
   */
  commandCursorPx: 40,
  keys: {
    /** Attack-Move scharf schalten. */
    attackMove: "A",
    /** Pause umschalten. */
    pause: "P",
    /** Stop (Befehle abbrechen, Position halten). */
    stop: "S",
    /** Hold Position (Haltung halten). */
    hold: "H",
  },
};

// Gegner-KI. Bewusst begrenzt: soll nur aufhoeren, sich offensichtlich dumm zu
// verhalten (kein Einzel-Selbstmord), nicht clever spielen.
export const AI = {
  /**
   * Schonfrist ab Spielstart (Sekunden), in der die KI baut und sammelt wie
   * sonst, aber KEINEN Offensivangriff startet. Danach greift sie nach der
   * unveraenderten Schwellwert-Logik an. Basisverteidigung gegen Eindringlinge
   * bleibt waehrend der Schonfrist aktiv (reaktiv, kein selbst gestarteter
   * Angriff).
   */
  attackGracePeriodSec: 300,
  /** Angriff erst, wenn eigene Armee >= Spieler-Armee * Faktor (1.0 = Paritaet). */
  attackThresholdFactor: 1.0,
  /** ... aber mindestens so viele eigene Kampfeinheiten. */
  minAttackSize: 3,
  /** Produktionsintervall (ms). TIME_SCALE-skaliert. */
  produceIntervalMs: 6000 / TIME_SCALE,
  /** Intervall, in dem Arbeiter neuen Sammelauftraegen zugeteilt werden (ms). TIME_SCALE-skaliert. */
  gatherIntervalMs: 1500 / TIME_SCALE,
  /** Dauer der Sammelphase am Anflugpunkt vor dem Sturm aufs HQ (ms). */
  stageMs: 4000,
  /** Sammelpunkt relativ zur HQ-Ecke (Kacheln, Richtung Kartenmitte). */
  gatherOffset: { col: -3, row: -3 },
  /** Kacheln um die eigene Basis, in denen Bedrohungen abgewehrt werden. */
  defendRadius: 8,
  /** Anflugpunkte relativ zum Spieler-HQ (Kacheln); zufaellig gewaehlt. */
  approachOffsets: [
    { col: -4, row: 4 },
    { col: 4, row: -4 },
    { col: 5, row: 5 },
  ],

  // --- Schwarm-KI (Strang 4, Paket 5). Mechanik-Huelle; Zahlen = KANON (Ticro). ---
  /** Schwarm-Lokomotion an: die Masse folgt dem Flussfeld zum Spieler-HQ statt
   *  per-Einheit-A*. (MODERAT hat keinen Helden -> alle Kaempfer sind Schwarm.) */
  swarmEnabled: true,
  /** Laerm-Aggro: Radius (Weltpixel) um einen Spielerangriff, in dem nahe
   *  Schwarmteile nachgezogen werden. PLATZHALTER (R_noise = Ticro). */
  noiseRadiusPx: 640,
  /** Sicht-Fairness (FoW Paket B): false = die KI aggro-zielt nur auf Einheiten,
   *  die ihr EIGENES Sichtgitter deckt (fair). true = der KI-Scan ignoriert den
   *  Nebel (cheatet). Default false; betrifft NUR den KI-Scan, nie den Spieler. */
  cheatVision: false,
};

/** Bewegung, Formation und Separation der Einheiten. */
export const MOVEMENT = {
  /** Abstand zwischen Formationsplaetzen beim Gruppenbefehl (Welt-Pixel). */
  formationSpacing: 34,
  /** Mindestabstand zweier ruhender Einheiten (Welt-Pixel). */
  separationDistance: 26,
  /** Schiebetempo der Separation im Stillstand (Welt-Pixel pro Sekunde).
   *  TIME_SCALE-skaliert, damit Ausweich-Geschwindigkeit dem Grundtempo folgt. */
  separationSpeed: 70 * TIME_SCALE,
  /** Tempo, mit dem aus den Bounds geratene Einheiten zurueckgezogen werden. */
  recoverSpeed: 140 * TIME_SCALE,
  // Strang 2 (lokale Vermeidung): Ruhe-Jitter -> 0, Avoidance auch fuer Laeufer.
  sepDeadbandPx: 1.5, // d >= minDist - dead -> null Kraft (kein Ruhe-Zittern)
  sepSnapPx: 0.5, // Netto-Schritt < snap -> 0 (Arrival-Snap)
  sepStepPx: 4, // max. Schiebeschritt/Frame (quadratische Daempfung statt 13er-Deckel)
  avoidWeightMoving: 0.35, // seitliche Korrektur fuer Laeufer (Flussfeld = 1.0)
  avoidTau: 0.25, // Vorausschau-Zeit (s): Lookahead = speed*tau (~96px); haelt das
  //                  Laeufer-Abfragefenster bei 3x3 Zellen -> Avoidance < 4 ms@1000
  stuckFrames: 120, // ~2 s eingekeilt -> niedrigere Prioritaet weicht aus
  goldenAngle: 2.399963, // deterministischer Tiebreak-Winkel (statt Math.random)
};

// Fog-of-War / Sicht (FoW Paket A, der Keystone). Mechanik-Huelle; die Radien
// sind KANON (Ticro tariert pro Typ ueber UnitDef.sicht / BuildingDef.sicht:
// Aufklaerer weit, Kampf mittel, Gebaeude eng). Hier nur die Defaults.
export const VISION = {
  /** Sichtradius (Kacheln), wenn eine Einheit/ein Gebaeude kein eigenes `sicht`
   *  in den Daten gesetzt hat. Kreisfoermiger Stempel um die Quelle. PLATZHALTER. */
  defaultSicht: 6,
  /** Persistenz: erkundete, dann verlassene Kacheln bleiben gedimmt-erinnert
   *  (sticky `explored`). false = kein Gedaechtnis (explored folgt visible). */
  fogPersist: true,
  /** Geist eines erkundeten, aktuell unsichtbaren Feind-Gebaeudes (FoW Paket B):
   *  Tint + Deckkraft aus dem spawnCorpse-Vorbild. KANON-LUECKE (Ticro tariert). */
  ghostTint: 0x9a918a,
  ghostAlpha: 0.5,
};

/**
 * Physik-Truemmer (Paket D, optionales Salz). burst() liefert den ballistischen
 * Klein-Schutt bereits gratis (gravityY); hier nur die wenigen grossen Hero-Chunks
 * pro Gebaeude-Explosion. KEINE Physik-Engine, kein Ragdoll, kein zerstoerbarer
 * Boden -- eine getunte, nicht-physische Wurfparabel. Bodenkontakt -> RT-Stempel.
 */
export const DEBRIS = {
  /** Grosse Chunks pro grosser Explosion (<=4, Ticro-Leitplanke). */
  heroChunks: 4,
  /** Globale Kappe gleichzeitig fliegender Chunks (von der Explosionsrate entkoppelt). */
  maxLive: 64,
  /** Anfangs-Steiggeschwindigkeit (Welt-px/s); Bogenhoehe ~ vy0^2/(2g). */
  launchUp: 380,
  /** Getunte, nicht-physische Schwerkraft (Welt-px/s^2). */
  gravity: 760,
  /** Horizontaldrift (Welt-px/s), iso-gedaempft (x0.6 schon eingerechnet). */
  driftMax: 78,
  /** Rotationstempo der taumelnden Chunks (rad/s, +/-). */
  spinMax: 5.5,
  /** Anzeigeskala der Chunks (Anteil der 64er-Textur). */
  scaleMin: 0.5,
  scaleMax: 0.85,
  // Blut-Ballistik (Blut-Paket B, Strang 5): dieselbe Parabel, aber persistente
  // Lande-Stempel statt Wrack-Decals. Eigene Kappe + Lande-Drossel.
  /** Tropfen je Blutexplosion. */
  bloodCount: 14,
  /** Globale Kappe gleichzeitig fliegender Bluttropfen. */
  bloodDropMax: 96,
  /** Persistente Lande-Stempel pro Frame (Pflicht-Drossel, Ziel <=24). */
  landingCap: 24,
  // Tod -> Truemmer-Wurf (Physik A3): Chunk-Anzahl nach Tod-Tiering (Einheiten)
  // bzw. Gebaeude-Basis (+ Grundflaeche). PLATZHALTER -- Code7/Ticro tarieren
  // Anzahl und Wucht (launchUp/gravity oben sind die Wucht-Regler).
  deathChunks: { mass: 2, strong: 4, hero: 7 } as Record<"mass" | "strong" | "hero", number>,
  buildingChunks: 10,
  // Aufprall + Rollen (Physik-Wucht, Code7): der koerperliche Zwischenschritt
  // zwischen Bodenkontakt und RT-Stempel. Restitution je Material (Stahl prallt
  // weniger, Glas/Phiole mehr -> belegter Korridor e=0,30..0,45); danach Roll-
  // reibung bis zur Ruhe, ERST DANN der schon vorhandene Stempel.
  restitution: { moderat: 0.32, hellmuth: 0.42 } as Record<"moderat" | "hellmuth", number>,
  /** Auftreff-Vertikaltempo (px/s), unter dem kein Huepfer mehr folgt -> Rollen. */
  bounceMinSpeed: 55,
  /** Harte Obergrenze sichtbarer Huepfer. */
  maxBounces: 3,
  /** Horizontaldaempfung pro Aufprall (vx-Faktor). */
  bounceDrag: 0.62,
  /** Rollreibung als vx-Faktor pro 1/60 s (framerate-normiert). */
  rollFriction: 0.92,
  /** Horizontaltempo (px/s), unter dem der Chunk ruht -> Stempel. */
  restSpeed: 16,
  /** Roll-Radius: Radius ~ chunkRollRadius * scale; Spin = vx / Radius. */
  chunkRollRadius: 18,
};

// Atmosphaerischer Welt-Nebel (Strang 8, NEBEL-TIEFE-SPEC §2). Re-Budget der
// frueheren EINEN NORMAL-Lage in VIER duenne Parallaxe-Lagen: Tiefe aus Schichtung,
// Drift, Skala und Tint -- NICHT aus mehr Deckkraft. Over-Blend (NORMAL nicht
// additiv: a=1-Prod(1-a_i*texMax)) der drei NORMAL-Lagen = 0.271, + ADD-Lichtwert
// ~= 0.314 visuelle Obergrenze < alphaCap 0.55 (Marge ~0.24). Beleg im Commit.
export const ATMO_FOG = {
  /** Betaeubungs-Deckel: der gemessene p99-Alpha-Beitrag muss darunter bleiben. */
  alphaCap: 0.55,
  /** Schwaden-Kachel deckt so viele Bodenkacheln (×TILE_WIDTH) -> in einer Nebelzone
   *  < 1 Wiederholung, kein sichtbarer Loop / Perioden-Peak. */
  tileWorldTiles: 10,
  /** Spitzen-Alpha-Deckel der Schwaden-Textur (nie voll deckend). */
  texMax: 0.85,
  /** Schwell-Maske der Textur: smoothstep(lo,hi) -> transparente Loecher unten,
   *  lesbare Ballen oben (Schwaden statt Schleier). */
  edgeLo: 0.42,
  edgeHi: 0.72,
  /** Maskentextur-Kantenlimit (Welt-Px herunterskaliert). */
  maskMax: 512,
  /** Vier Lagen, fern -> nah -> ADD-Schimmer. Alle teilen Wisp-Textur + BitmapMask.
   *  alpha: Deckkraft; scale: ×(tileWorldTiles·TILE_WIDTH); drift: Welt-px/s (gegen-
   *  laeufig gestaffelt, Differenzen im 0.2..0.5-Parallaxe-Korridor); blend; tint
   *  (fern kuehler/blasser, ADD heller -> atmosphaerische Perspektive); depth im
   *  Band -67000..-64000 (ueber Boden/Decals, unter Einheiten). */
  layers: [
    { role: "fern", alpha: 0.1, scale: 1.65, drift: { x: 3.0, y: 1.1 }, blend: "NORMAL", tint: 0x8fa8be, depth: -67000 },
    { role: "mittel", alpha: 0.18, scale: 1.0, drift: { x: 7.0, y: 2.5 }, blend: "NORMAL", tint: 0x9fb6c8, depth: -66000 },
    { role: "nah", alpha: 0.07, scale: 0.62, drift: { x: -9.5, y: -3.4 }, blend: "NORMAL", tint: 0x9fb6c8, depth: -65000 },
    { role: "add", alpha: 0.05, scale: 1.37, drift: { x: -4.5, y: -1.8 }, blend: "ADD", tint: 0xb4c6d6, depth: -64000 },
  ],
} as const;

// Lokale Nebel-Partikel (Strang 11, NEBEL-TIEFE-SPEC §3). STRUKTUR FINAL, AKTIVIERUNG
// SPAETER: `enabled` ist Default AUS -- Traegheit vor Partikel, die globale Atmo-
// Schicht traegt die Tiefe schon. Zwei gepoolte Typen (wie debris_system), beide
// NORMAL/getoent, Peak-Alpha Compositing-geprueft gegen die Grundschicht-Spitze ~0.51:
//   Typ A 0.08 + 0.51*(1-0.08) = 0.549 < 0.55 ✓   (0.10 ergaebe 0.559 > 0.55)
//   Typ B 0.07 + 0.51*(1-0.07) = 0.545 < 0.55 ✓
// Spawn nur an dichten Zonen (density > densityThreshold). Tiefe -63000 (knapp ueber
// der globalen Schicht -64000, unter den Einheiten).
// Persistente Splatter-Schicht (Gefechts-VFX Paket 6, H5-Soll): DEFAULT bleibt
// der Splatter fuer immer liegen (MODERAT-Aesthetik, Verwuestung akkumuliert wie
// Creep). Die Saettigungsbremse ist OPTIONAL hinter diesem Flag: ein ERASE-Rect
// mit alpha 0.02 alle ~10 s je RT (C3-Empfehlung b'). Ticros Schalter.
export const BLOOD_PERSIST_FADE = {
  enabled: false,
  alpha: 0.02,
  periodMs: 10000,
} as const;

export const GROUND_MIST = {
  enabled: false,
  depth: -63000,
  tint: 0x9fb6c8,
  densityThreshold: 0.8,
  /** Globale Kappe gleichzeitiger Partikel (gegen Mehrzonen-Akkumulation). */
  totalCap: 28,
  /** Typ A -- Bodennebel-Schwade. */
  groundMist: {
    cap: 16,
    spawnMs: 700,
    lifeMin: 5000,
    lifeMax: 8000,
    peakAlpha: 0.08,
    scaleFrom: 0.45,
    scaleTo: 0.8,
    vxMax: 6, // ±, screen-px/s
    vyMin: 1,
    vyMax: 3,
    meanderAmp: 4,
    meanderPeriodMin: 3500,
    meanderPeriodMax: 5000,
  },
  /** Typ B -- driftende Fetzen. */
  mistWisp: {
    cap: 4,
    spawnMsMin: 2500,
    spawnMsMax: 4000,
    lifeMin: 9000,
    lifeMax: 14000,
    peakAlpha: 0.07,
    scaleFrom: 1.2,
    scaleTo: 1.8,
    vxMin: 8,
    vxMax: 12,
    vyMax: 2,
  },
} as const;

// --- Destillat-System (docs/DESTILLAT-SYSTEM.md) -----------------------------
// HELLMUTH produziert autonom in der Destille; MODERAT erbeutet Destillat beim
// Toeten (Wirt-Bedingung: mind. eine HELLMUTH-Destille existiert). Defaults; Ticro
// tariert am Spiel.

/** Produktionsintervall je Destille (ms): 1 Destillat pro Intervall pro Destille. */
/** Destillat-Produktionsintervall (ms). TIME_SCALE-skaliert (Code7 07-03). */
export const DESTILLE_PRODUCTION_RATE_MS = 5000 / TIME_SCALE;
/** Maximale Destillen pro Spieler. Eine vierte wird abgelehnt. */
export const DESTILLE_MAX = 3;
/** Mindest-Tech-Stufe, um eine Destille zu bauen (1 = Start, 2 = nach 1 Upgrade-Bau). */
export const DESTILLE_TIER = 2;
/** MODERAT-Parasit-Drop je sev-Tier des getoeteten Opfers (Einheiten-Tode tragen
 *  mass|strong|hero; `light` ist vollstaendigkeitshalber gelistet). */
export const DESTILLAT_DROP: Record<"light" | "mass" | "strong" | "hero", number> = {
  light: 1,
  mass: 2,
  strong: 4,
  hero: 8,
};
