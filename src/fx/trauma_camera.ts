import Phaser from "phaser";
import { valueNoise2 } from "../editor/noise";

// TRAUMA-KAMERA (Code7 Tempo-Kalibrierung Paket 2, Blueprint-2-Synthese §1.5
// "trauma-Kamera nach Eiserloh: trauma², Perlin, Zufuhr-Deckel, render-only,
// kein Rotations-Shake in Iso"; Referenz-Kanon: Squirrel Eiserloh, GDC 2016
// "Math for Game Programmers: Juicing Your Cameras with Math").
//
// ERSETZT das bisherige Phaser-cameras.main.shake (Random-Offset pro Frame ->
// vom Menschen als "sirenenartige Frequenz" wahrgenommen). Der neue Sampler
// tastet ein deterministisches 2D-value-Noise als Zeitrauschen ab -- KEIN
// Math.random, keine Wanduhr-Interferenz, weiche C2-Kurve.
//
// Modell (Eiserloh):
//   trauma in [0,1]              -- akkumulierter "Erschuetterungspegel"
//   trauma -= decay * dt         -- exponentieller Zerfall (1/s)
//   amp = maxAmp * trauma^2      -- quadratisch, damit kleine Ereignisse ruhig
//   offX = amp * (noise(f*t, 0)*2 - 1)   -- Perlin/Value-Noise als Zeit-Sample
//   offY = amp * (noise(0, f*t)*2 - 1)   -- unabhaengige Achse (zweite Zeile)
//   camera.scrollX/Y += offX/offY (nur diesen Frame, naechster Frame ueberschreibt)
//
// KEIN Rotations-Shake: Iso-Projektion verdreht sonst die Kachel-Achsen. Kein
// Zoom-Shake (der Mensch beschrieb den Zoom als eigenes Problem, Paket 3).
//
// Zufuhr-Deckel je Ereignis-Klasse (Brief §2 "Trauma-Zufuhr pro Ereignis-
// Klasse mit Deckel"): jede Klasse (unit_hit, unit_died, explosion, building_died)
// hat einen eigenen Trauma-Beitrag; ein Wert wird addiert und trauma auf [0,1]
// geklemmt. Massengefecht saettigt damit von selbst (Sattel bei 1).

// --- Kalibrierung (aus dem Eiserloh-Kanon, Blueprint-2-Prinzipien ratifiziert)
//
// Der Mensch beschrieb "hochfrequentes, kurzes Zittern" -- typische Ursachen
// bei Phaser-Shake sind hohe Frequenz (60 Hz Random) und harter Reset ohne
// Zerfall. Die Zahlen unten sind bewusst konservativ:
//   MAX_AMP = 24 px  -- Peak-Verschiebung bei trauma=1; das entspricht ~0.06
//                       eines 400er-Viewport-Rands und liegt UEBER 60 FPS klar
//                       koerperlich spuerbar, aber nicht bildzerstoerend.
//   DECAY = 1.5 /s   -- trauma halbiert sich alle ~460 ms; ein Peak-Trauma
//                       (=1) klingt ohne Nachzufuhr nach ~1.3 s auf 10% ab.
//   FREQ = 9 Hz      -- Noise-Samples pro Sekunde (Brief §2: "Frequenz halbieren"
//                       gg. Phaser's implizite Frame-Rate). Fuehlt sich als
//                       Vibrieren an, nicht als Sirene.
// Zufuhr-Deckel (typische Trauma-Beitraege pro Klasse):
//   BUILDING_DIED : 0.85  (HQ-Verlust: fast Vollton, ein Ereignis reicht)
//   EXPLOSION_BIG : 0.55  (Reactor/Explosionsserie: dosiert)
//   UNIT_DIED     : 0.10  (Massengefecht saettigt sanft)
//   UNIT_HIT      : 0.03  (grosse Frequenz + kleiner Beitrag = leichtes Grundrauschen)
// Die Werte sind der Alt-Wert-Nachfolger und im Commit als Startwerte deklariert.

export const TRAUMA_MAX_AMP_PX = 24;
export const TRAUMA_DECAY_PER_S = 1.5;
export const TRAUMA_NOISE_HZ = 9;
/** Trauma-Beitrag je Ereignis-Klasse. Klemmung auf [0,1] durch addTrauma. */
export const TRAUMA_ADD: Record<TraumaEventClass, number> = {
  building_died: 0.85,
  explosion_big: 0.55,
  explosion_small: 0.2,
  unit_died: 0.1,
  unit_hit: 0.03,
};
/** Fallback fuer die Wrapper-Kompatibilitaet (shakeCamera-Legacy-API). */
const LEGACY_INTENSITY_TO_TRAUMA = 40; // intensity=0.0132 -> trauma ~0.53

export type TraumaEventClass =
  | "building_died"
  | "explosion_big"
  | "explosion_small"
  | "unit_died"
  | "unit_hit";

export class TraumaCamera {
  private trauma = 0;
  private tSec = 0; // Wanduhr-Sekunden (nur fuer den Noise-Sample-Zeitindex)
  private enabled = true;
  private appliedX = 0; // letzter angewandter Offset (Overlay/Probe)
  private appliedY = 0;
  private didApply = false;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
      delete (scene as unknown as { __trauma?: TraumaCamera }).__trauma;
    });
    (scene as unknown as { __trauma?: TraumaCamera }).__trauma = this;
  }

  /** Zufuhr eines Trauma-Beitrags (klassenbasiert). Deckel auf 1. */
  add(cls: TraumaEventClass): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + TRAUMA_ADD[cls]);
  }

  /** Roh-Zufuhr (fuer den Legacy-shakeCamera-Wrapper, s. shake.ts). */
  addRaw(amount: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.trauma = 0;
  }

  /** Diagnose-Sonde (Overlay + Beweis-Harness). */
  probe(): { trauma: number; amp: number; offX: number; offY: number } {
    return {
      trauma: Math.round(this.trauma * 1000) / 1000,
      amp: Math.round(TRAUMA_MAX_AMP_PX * this.trauma * this.trauma * 100) / 100,
      offX: Math.round(this.appliedX * 100) / 100,
      offY: Math.round(this.appliedY * 100) / 100,
    };
  }

  private tick(_time: number, dtMs: number): void {
    const cam = this.scene.cameras.main;

    // 1. VORHERIGEN Offset UNBEDINGT zuruecknehmen (Anti-Drift). Der Trauma-
    //    Offset war fuer genau EINEN Frame gedacht; im naechsten Frame ziehen
    //    wir ihn unabhaengig davon, was zwischenzeitlich passiert ist, wieder
    //    ab. Nutzer-Pan/Center-Logik wirkt dann in der gewuenschten Richtung
    //    weiter (Panning-Delta wird nicht rueckgaengig gemacht, nur unser
    //    Offset). Ohne diese Unbedingtheit hatten wir Drift, sobald jemand
    //    zwischen zwei Frames scroll* setzte (panCamera lief vor uns).
    if (this.didApply) {
      cam.scrollX -= this.appliedX;
      cam.scrollY -= this.appliedY;
      this.didApply = false;
      this.appliedX = 0;
      this.appliedY = 0;
    }

    const dt = dtMs / 1000;
    // 2. Zerfall (exponentiell nach Alter, framerate-unabhaengig).
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY_PER_S * dt);
    this.tSec += dt;
    if (this.trauma <= 0) return;

    // 3. amp = maxAmp * trauma^2 (Eiserloh). Zwei unabhaengige Noise-Achsen.
    const amp = TRAUMA_MAX_AMP_PX * this.trauma * this.trauma;
    // Sample-Koordinaten: Zeit * Frequenz, zweite Achse aus separatem "Kanal"
    // (Seed 1 vs. 2), damit x/y unabhaengig laufen. Value-Noise ist [0,1] ->
    // auf [-1,1] verschieben.
    const s = this.tSec * TRAUMA_NOISE_HZ;
    const nx = valueNoise2(s, 0, 1) * 2 - 1;
    const ny = valueNoise2(0, s, 2) * 2 - 1;
    const offX = amp * nx;
    const offY = amp * ny;

    // 4. Anwenden. Ein Frame lang; wird oben im naechsten Tick zurueckgenommen.
    cam.scrollX += offX;
    cam.scrollY += offY;
    this.appliedX = offX;
    this.appliedY = offY;
    this.didApply = true;
  }
}

const systems = new WeakMap<Phaser.Scene, TraumaCamera>();
export function getTraumaCamera(scene: Phaser.Scene): TraumaCamera {
  let s = systems.get(scene);
  if (!s) {
    s = new TraumaCamera(scene);
    systems.set(scene, s);
  }
  return s;
}

/** Legacy-Bruecke: bilde Phaser-shake(intensity,duration) auf Trauma ab.
 *  Wird von src/fx/shake.ts fuer die Bestandsaufrufer genutzt. */
export function shakeToTrauma(intensity: number): number {
  return Math.min(1, intensity * LEGACY_INTENSITY_TO_TRAUMA);
}
