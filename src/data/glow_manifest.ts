import type { SpriteEntry } from "./sprites";

// Asset-Manifest-Slot fuer den HELLMUTH-Produktions-Glow (Destille). Generiert
// reproduzierbar ueber tools/_gen/gen_glow_radial.py, abgelegt unter
// public/sprites/effects/. Optional: fehlt die Datei, faellt ProductionGlow
// auf eine prozedurale Notfall-Textur (gleichem Falloff) zurueck.

const FX = "sprites/effects/";

export const GLOW_HELLMUTH_KEY = "glow_hellmuth_radial_512";

export const GLOW_FX_MANIFEST: SpriteEntry[] = [
  { key: GLOW_HELLMUTH_KEY, path: `${FX}glow_hellmuth_radial_512.png`, optional: true },
];
