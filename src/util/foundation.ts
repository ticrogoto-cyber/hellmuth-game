import Phaser from "phaser";
import { FOUNDATION } from "../data/balance";

// Fundamentfleck-System (C&C-Vorbild): EIN Stempel pro Objekt, nicht pro Kachel.
// Die zugeordnete Textur wird einmal als flache 2:1-Ellipse auf den Fusspunkt
// gestempelt, skaliert auf die Anzeigegroesse des Objekts plus grosszuegigem
// Rand (FOUNDATION.extent), sodass ein sichtbarer Ring um das Objekt entsteht.
// Der weiche Uebergang in den Boden kommt vom ausfransenden Alpharand der PNGs.
// Fuer sehr grosse Objekte (Schwelle FOUNDATION.tileAboveWidth) wird statt einer
// Streckung gekachelt und mit einer Ellipse maskiert.

// Fundamentfleck-System (C&C-Vorbild): EIN Stempel pro Objekt. DIN-A4/A5-Regel:
// das Fundament liegt an DERSELBEN Bildschirmposition mit DEMSELBEN Anker wie
// das Objekt-Sprite (0.5/1.0 = unterer Rand) und ist nur groesser. Dadurch ist
// die untere Kante deckungsgleich und das Fundament ragt oben und seitlich als
// sichtbarer Ring ueber das Objekt hinaus, ohne Offset oder Verschiebung. Der
// weiche Uebergang in den Boden kommt vom ausfransenden Alpharand der PNGs. Fuer
// sehr grosse Objekte (Schwelle FOUNDATION.tileAboveWidth) wird statt gestreckt
// gekachelt und mit einer Ellipse maskiert.

/**
 * Baut das Fundament eines Objekts und liefert das Weltobjekt (vom Aufrufer zu
 * zerstoeren). Sauberer No-Op (undefined), wenn das System aus ist, kein
 * Texturschluessel gesetzt ist, die Textur fehlt oder die Breite 0 ist.
 *
 * `x`/`y` ist die Position des Objekt-Sprites (Anker 0.5/1.0), `displayWidth`
 * dessen Anzeigebreite in Weltpixeln und `extent` der Kategorie-Faktor.
 */
export function createFoundation(
  scene: Phaser.Scene,
  textureKey: string | undefined,
  x: number,
  y: number,
  displayWidth: number,
  extent: number,
  depth: number,
): Phaser.GameObjects.GameObject | undefined {
  if (!FOUNDATION.enabled || !textureKey || displayWidth <= 0) return undefined;
  if (!scene.textures.exists(textureKey)) return undefined;

  const fundW = displayWidth * extent;
  // Flaches Band am Fuss (heightRatio klein), damit es seitlich ueber den Sprite
  // ragt, aber kaum nach oben und nicht hinter dem Objekt verschwindet.
  const fundH = fundW * FOUNDATION.heightRatio;

  // Normalfall: ein gestreckter Stempel. Selber Anker (0.5/1.0) und selbe
  // Position wie das Objekt, nur groesser. Von der hochaufgeloesten Quelle wird
  // herunterskaliert, also scharf.
  if (fundW <= FOUNDATION.tileAboveWidth) {
    return scene.add
      .image(x, y, textureKey)
      .setOrigin(0.5, 1)
      .setDisplaySize(fundW, fundH)
      .setAlpha(FOUNDATION.alpha)
      .setDepth(depth);
  }

  // Ausweichlogik fuer sehr grosse Objekte: Textur kacheln (tileScale < 1, statt
  // sie ueber die ganze Flaeche zu strecken) und mit einer Ellipse maskieren.
  // Maskenmitte = Sprite-Mitte bei Anker 0.5/1.0 (also y - fundH/2).
  const texW = scene.textures.get(textureKey).source[0]?.width || fundW;
  const ts = scene.add
    .tileSprite(x, y, fundW, fundH, textureKey)
    .setOrigin(0.5, 1)
    .setTileScale(FOUNDATION.tileAboveWidth / texW, FOUNDATION.tileAboveWidth / texW)
    .setAlpha(FOUNDATION.alpha)
    .setDepth(depth);
  const maskG = scene.make.graphics({});
  maskG.fillStyle(0xffffff, 1);
  maskG.fillEllipse(x, y - fundH / 2, fundW, fundH);
  ts.setMask(maskG.createGeometryMask());
  // Maske mit dem TileSprite mitraeumen.
  ts.once(Phaser.GameObjects.Events.DESTROY, () => maskG.destroy());
  return ts;
}
