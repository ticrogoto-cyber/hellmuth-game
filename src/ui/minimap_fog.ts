import type { GridPoint } from "../util/iso";
import type { VisionGrid } from "../systems/vision_grid";

// FoW Paket C -- Minimap-Faerbung (Drei-Zustand), KONSISTENT zum Schleier (Veil,
// Paket B). Bewusst DUENN und self-contained: reine Farb-/Lookup-Logik, KEIN
// HUD-Layout. Damit bleibt die Cross-Instanz-Naht zu Code1s Minimap
// (html_hud.ts, Rebuild auf claude/hud) beim Merge mechanisch: nur diese
// Funktionen + ein duenner Aufruf in updateMinimap wandern mit. Phaser-frei.

export type FogState = 0 | 1 | 2; // schwarz (unerkundet) | erinnert | sichtbar

/** Schleier-Deckkraft (0..1) einer Minimap-Zelle je Sicht-Zustand. Ton + Werte
 *  spiegeln den Veil: sichtbar klar (0), erinnert halb, unerkundet schwer. */
export function minimapFogAlpha(state: FogState): number {
  return state === 2 ? 0 : state === 1 ? 0.45 : 0.86;
}

/** Schleier-Grundton (rgb-Tripel), identisch zum Veil. */
export const MINIMAP_FOG_RGB = "8, 9, 13";

/** Deckkraft eines Blips (Gebaeude/Vorkommen) je Zustand: sichtbar voll, erinnert
 *  gedimmter Geist-Blip, unerkundet -1 (= nicht zeichnen). Konsistent zu Paket B. */
export function blipAlpha(state: FogState): number {
  return state === 2 ? 1 : state === 1 ? 0.5 : -1;
}

/** Hoechster Sicht-Zustand ueber mehrere Kacheln (Gebaeude-Footprint = OR), damit
 *  ein mehrkacheliges Gebaeude denselben Zustand zeigt wie unter dem Veil. */
export function tilesFog(vision: VisionGrid, tiles: GridPoint[]): FogState {
  let best: FogState = 0;
  for (const t of tiles) {
    const s = vision.visibilityAt(t.col, t.row);
    if (s > best) best = s;
    if (best === 2) break;
  }
  return best;
}
