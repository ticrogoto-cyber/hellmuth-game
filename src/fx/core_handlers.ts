import type { FxService } from "./fx_service";
import type { FxOpts } from "./fx_types";
import { getFxSystem } from "../systems/fx";
import { getBloodSystem } from "../systems/blood_system";
import { getDebrisSystem } from "../systems/debris_system";
import { DEBRIS } from "../data/balance";

// Paket A — die drei Fundament-Techniken (S1 Glow, S2 Funken/Rauch, S3 Flipbook)
// als erste Handler hinter dem spawn(typ)-Dispatcher. Duenne Adapter: sie mappen
// den offenen FxOpts-Sack auf die getippten FxSystem-Methoden. Die Technik lebt in
// systems/fx.ts (erweitert, nicht dupliziert); hier ist nur die Naht.

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Registriert flash/sparks/shockwave/smoke/sheet auf dem Dienst. */
export function registerCoreFx(fx: FxService): void {
  fx.register("flash", (ctx, x, y, o: FxOpts) => {
    getFxSystem(ctx.scene).flash(x, y, { color: o.color, scale: o.scale, duration: o.duration, depth: o.depth });
  });

  fx.register("sparks", (ctx, x, y, o: FxOpts) => {
    getFxSystem(ctx.scene).burst(x, y, {
      color: o.color,
      scale: o.scale,
      duration: o.duration,
      depth: o.depth,
      count: num(o.count),
      speed: num(o.speed),
    });
  });

  fx.register("shockwave", (ctx, x, y, o: FxOpts) => {
    getFxSystem(ctx.scene).shockwave(x, y, {
      color: o.color,
      scale: o.scale,
      duration: o.duration,
      depth: o.depth,
    });
  });

  fx.register("smoke", (ctx, x, y, o: FxOpts) => {
    getFxSystem(ctx.scene).smoke(x, y, {
      color: o.color,
      scale: o.scale,
      depth: o.depth,
      rise: num(o.rise),
      frequency: num(o.frequency),
    });
  });

  // Flipbook: braucht einen Sheet-Schluessel + Frame-Anzahl in den Opts. Fehlt das
  // Sheet, ist playFrames ein No-op (die Sheets kommen mit Paket C).
  fx.register("sheet", (ctx, x, y, o: FxOpts) => {
    const key = typeof o.sheet === "string" ? o.sheet : undefined;
    if (!key) return;
    getFxSystem(ctx.scene).playFrames(x, y, key, num(o.frames) ?? 0, {
      frameRate: num(o.frameRate),
      scale: o.scale,
      rotation: o.rotation,
      blendAdd: o.blendAdd === true,
      depth: o.depth,
      anchor: o.anchor === "ground" ? "ground" : "center",
    });
  });

  // Blut (Paket B): Fenster-Spritzer bzw. Blutexplosion (Naht zu Paket C ueber
  // fx.spawn("blood_burst", ...) bzw. spaeter fx.explosion(register:'blood')).
  fx.register("blood", (ctx, x, y, o: FxOpts) => {
    getBloodSystem(ctx.scene).stampWindow(x, y, o.faction, o.scale ?? 0.4);
  });
  fx.register("blood_burst", (ctx, x, y, o: FxOpts) => {
    getBloodSystem(ctx.scene).bloodBurst(x, y, o.faction, o.scale ?? 1);
  });
  // Blut-Ballistik (Blut-Paket B): Tropfen im Bogen, persistente Lande-Marken.
  fx.register("blood_ballistic", (ctx, x, y, o: FxOpts) => {
    getDebrisSystem(ctx.scene).throwBlood(x, y, o.faction, num(o.count) ?? DEBRIS.bloodCount);
  });
}
