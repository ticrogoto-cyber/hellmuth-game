import Phaser from "phaser";
import { GROUND_AURA } from "../data/balance";

// Bodenanbindung (They-Are-Billions-Stil): pro Objekt ein weicher, gerichteter
// Kontaktschatten, der exakt am Fusspunkt ansetzt und in die globale
// Lichtgegenrichtung wegfaellt, plus eine dezente Kontaktverdunklung direkt am
// Fuss. Keine mittige, nach unten versetzte Scheibe. Die weiche Schattentextur
// wird einmalig prozedural erzeugt (weisser Radialverlauf, per Tint eingefaerbt)
// und von Gebaeuden wie Doodads geteilt; handgemalte Override-PNGs haben Vorrang.

/** Objektklasse fuer Fusspunkt-Kalibrierung und Override-Auswahl. */
export type ShadowKind = "building" | "tree" | "cluster" | "wald" | "rock";

/** Globales Override-PNG (uebersteuert die prozedurale Schattentextur). */
const OVERRIDE_GLOBAL = "boden-aura";
/** Klassenspezifische Override-PNGs (Wurzelwerk vs. Geroell/Sand). */
const OVERRIDE_BAUM = "boden-aura-baum";
const OVERRIDE_FELS = "boden-aura-fels";
/** Schluessel der prozeduralen weichen Schattenscheibe. */
const PROC_KEY = "__ground_shadow_disc";
const PROC_SIZE = 128;

/** Weiche, weisse Radial-Scheibe (per Tint einfaerbbar), einmalig erzeugt. */
function ensureSoftDisc(scene: Phaser.Scene): string {
  if (scene.textures.exists(PROC_KEY)) return PROC_KEY;
  const canvas = scene.textures.createCanvas(PROC_KEY, PROC_SIZE, PROC_SIZE);
  if (!canvas) return PROC_KEY;
  const ctx = canvas.context;
  const c = PROC_SIZE / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.82)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PROC_SIZE, PROC_SIZE);
  canvas.refresh();
  return PROC_KEY;
}

/** Schattentextur fuer eine Klasse: klassen-Override, dann global, dann prozedural. */
function shadowTextureKey(scene: Phaser.Scene, kind: ShadowKind): string {
  const perClass =
    kind === "rock" ? OVERRIDE_FELS : kind === "building" ? undefined : OVERRIDE_BAUM;
  if (perClass && scene.textures.exists(perClass)) return perClass;
  if (scene.textures.exists(OVERRIDE_GLOBAL)) return OVERRIDE_GLOBAL;
  return ensureSoftDisc(scene);
}

/**
 * Erzeugt die Boden-Schatten-Bilder eines Objekts in LOKALEN Koordinaten
 * relativ zum Fusspunkt (0,0 = Fuss): [gerichteter Schatten, Kontaktverdunklung].
 * Der Aufrufer haengt sie in den Container (Gebaeude) oder verschiebt sie an die
 * Welt-Position des Fusspunkts (Doodad) und setzt die Tiefe. `displayWidth` ist
 * die bereits skalierte Anzeigebreite des Objekts.
 */
export function createGroundShadow(
  scene: Phaser.Scene,
  kind: ShadowKind,
  displayWidth: number,
): Phaser.GameObjects.Image[] {
  const key = shadowTextureKey(scene, kind);
  const sizeRatio = kind === "building" ? GROUND_AURA.sizeRatioBuilding : GROUND_AURA.sizeRatioDoodad;
  const base = displayWidth * sizeRatio;
  const len = base * GROUND_AURA.shadowLength;
  const wid = base * GROUND_AURA.shadowWidth;
  const footY = (GROUND_AURA.footOffsetY[kind] ?? 0) * displayWidth;

  // Schatten faellt entgegen der Lichtrichtung; Mitte etwas vom Fuss weg, sodass
  // die Naehkante am Fuss ansetzt (Schatten kommt unter dem Objekt hervor).
  const dir = Phaser.Math.DegToRad(GROUND_AURA.lightAngle + 180);
  const off = len * 0.42;
  const shadow = scene.add
    .image(Math.cos(dir) * off, footY + Math.sin(dir) * off, key)
    .setOrigin(0.5, 0.5)
    .setRotation(dir)
    .setDisplaySize(len, wid)
    .setTint(GROUND_AURA.shadowColorHex)
    .setAlpha(GROUND_AURA.shadowAlpha);

  // Dezente Kontaktverdunklung exakt am Fuss, iso-flach, ohne Versatz.
  const cW = base * GROUND_AURA.contactRatio;
  const contact = scene.add
    .image(0, footY, key)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(cW, cW * GROUND_AURA.contactFlatten)
    .setTint(GROUND_AURA.shadowColorHex)
    .setAlpha(GROUND_AURA.contactAlpha);

  return [shadow, contact];
}
