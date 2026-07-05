import type { SpriteEntry } from "./sprites";

// Asset-Manifest-SLOTS fuer das Blut-System (Blut-Paket B / Strang 6). NUR die
// Slots/Namen -- KEINE Texturen gebaut. Bis Ticros KREA-PNGs unter
// sprites/effects/ liegen, erzeugt blood_system.ensureSubstanceTextures
// prozedurale Platzhalter unter DENSELBEN Schluesseln; das echte PNG ueberschreibt
// sie kommentarlos ueber das exists()-Gate (preload laedt optional, fehlende
// Dateien fallen ueber FILE_LOAD_ERROR auf den Platzhalter zurueck).
//
// Ziel-Aufloesungen (Solutions): puddle 512x4, explo 768x2, splash 256x3,
// drip 128x3, landing 256x3. straight-Alpha, Varianten Pflicht (die Engine
// rotiert/spiegelt random -> Wiederholung faellt nicht auf).

const FX = "sprites/effects/";

function slots(stem: string, n: number): SpriteEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `${stem}-${i + 1}`,
    path: `${FX}${stem}-${i + 1}.png`,
    optional: true,
  }));
}

export const BLOOD_FX_MANIFEST: SpriteEntry[] = [
  ...slots("blut-hellmuth", 4), // puddle 512 (HELLMUTH rotes Blut)
  ...slots("ploerre-moderat", 4), // puddle 512 (MODERAT Magenta-Ploerre)
  ...slots("blut-explo", 2), // explo 768
  ...slots("ploerre-explo", 2), // explo 768
  ...slots("splash-hellmuth", 3), // splash 256 (Spritz-Settle)
  ...slots("splash-moderat", 3),
  ...slots("drip-hellmuth", 3), // drip 128 (Puls/Wundspur)
  ...slots("drip-moderat", 3),
  ...slots("landing-hellmuth", 3), // landing 256 (Ballistik-Lande-Stempel)
  ...slots("landing-moderat", 3),
  { key: "fx_scorch", path: `${FX}fx_scorch.png`, optional: true }, // geteilt mit Paket C
];
