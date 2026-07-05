import Phaser from "phaser";

// CSS-Cursor aus einer geladenen Textur. Browser lehnen grosse Cursor-Bilder ab
// (Limit ~128px) und fallen still auf das Fallback-Schluesselwort zurueck; die
// Quell-Sprites sind aber deutlich groesser. Daher wird die Textur einmalig auf
// eine cursor-taugliche Kantenlaenge heruntergerechnet und als data-URL gecacht.
const cache = new Map<string, string>();

/**
 * Liefert einen CSS-`cursor`-Wert mit zentriertem Hotspot fuer die Textur `key`,
 * herunterskaliert auf `size` Pixel. Existiert die Textur nicht (oder schlaegt
 * das Zeichnen fehl), wird das Fallback-Schluesselwort allein zurueckgegeben.
 */
export function cursorFromTexture(
  scene: Phaser.Scene,
  key: string,
  size: number,
  fallback: string,
): string {
  if (!scene.textures.exists(key)) return fallback;
  const cacheKey = `${key}@${size}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.drawImage(src, 0, 0, size, size);
  const hot = Math.floor(size / 2);
  const css = `url(${canvas.toDataURL("image/png")}) ${hot} ${hot}, ${fallback}`;
  cache.set(cacheKey, css);
  return css;
}
