import type { FxService } from "./fx_service";
import type { FxOpts } from "./fx_types";
import { getBloodSystem } from "../systems/blood_system";
import { hash01 } from "./stamp_hash";

// NACHPULSENDE LEICHE (Blut-Paket B, Strang 3) -- der USP. Kanon ist Erloeschen/
// Herzschlag, NICHT Wunde/Gore: der Koerper zuckt noch, waehrend die Substanz ihn
// verlaesst. N=4 Bursts @ 2,5 Hz, exponentiell abklingend, ~1,6 s gesamt -- sitzt
// VOR dem 8-s-Wrack-Stempel (keine Timer-Kollision). Pro Puls eine kleine
// Aufwaerts-Fontaene (blood_splash, ohne ax/ay -> nach oben) + eine Fenster-Marke;
// 15 % der Pulse hinterlassen eine bleibende (5-Min-)Marke. Referenz: Myth
// (getaktete Post-Tod-Emission), SC2 (»shaking before still« + Decay).
//
// Kanon-Kipp (Ticro): will er »Versickern« statt »Herzschlag«, wird daraus ein
// kontinuierlicher Strom (RATE >= 8 Hz). Default ist der Herzschlag.

const N = 4; // Bursts
const PERIOD = 400; // 2,5 Hz
const DECAY = 0.55; // exponentielles Abklingen je Beat
const MAX_PULSE_DRIVERS = 120; // Waechter gegen Treiber-Flut im Massengefecht
const PERSIST_DROP_CHANCE = 0.15;

let pulseDrivers = 0;

export function registerCorpsePulse(fx: FxService): void {
  // pulseDrivers ist modul-global; FxService.destroy() leert die Treiber per
  // length=0 OHNE ihren Sterbe-Pfad -> Restwert blutet ueber den Scene-Neustart
  // und saettigt den Deckel (MAX_PULSE_DRIVERS), dann faellt der USP-Leichenpuls
  // aus. EINMAL je Scene (installFx) -> Reset (gleiche Lehre wie ground_mist.ts).
  pulseDrivers = 0;
  fx.register("corpse_pulse", (ctx, x, y, o: FxOpts) => {
    if (pulseDrivers >= MAX_PULSE_DRIVERS) return; // Substrat-Deckel
    pulseDrivers++;
    const faction = o.faction;
    let t = 0;
    let beat = 0;

    const fire = (): void => {
      const decay = Math.exp(-beat * DECAY); // 1 .. ~0,19
      // Aufwaerts-Mini-Fontaene (NORMAL-Tropfen ueber den Paket-A-Handler).
      fx.spawn("blood_splash", x, y - 4, { faction, count: Math.max(2, Math.round(7 * decay)) });
      // sichtbare Puls-Marke (drip-Slot) + 15 % bleibende Marke. Wuerfel
      // deterministisch aus Leichen-Punkt + Puls-Index (Gefechts-VFX Paket 6:
      // kein Math.random in der Streuung) -> replay-identische Persist-Marken.
      getBloodSystem(ctx.scene).stampWindowSlot(x, y, faction, 0.14 + 0.16 * decay, "drip");
      if (hash01(x, y, beat) < PERSIST_DROP_CHANCE) {
        getBloodSystem(ctx.scene).stampPersistentSlot(x, y, faction, 0.22, "drip");
      }
    };

    fire(); // erster Herzschlag bei t=0
    beat++;
    ctx.drive((dt) => {
      t += dt;
      while (beat < N && t >= beat * PERIOD) {
        fire();
        beat++;
      }
      if (beat >= N && t >= (N - 1) * PERIOD + 250) {
        pulseDrivers--;
        return false; // Treiber raeumt sich ab (kein Leak)
      }
      return true;
    });
  });
}
