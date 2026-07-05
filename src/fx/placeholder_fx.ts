import type Phaser from "phaser";
import type { FxService } from "./fx_service";
import type { FxContext, FxOpts } from "./fx_types";

// Neutraler Platzhalter-Effekt -- BEWUSST kein echter VFX. Kein Glow, kein
// Partikel, keine Bloom, kein additives Blending: eine flache magenta Diagnose-
// Raute mit Fadenkreuz, die kurz auflebt und in den Pool zurueckkehrt. Sie
// beweist die ganze Kette im echten Browserbild:
//   spawn -> Dispatch -> Pool-acquire -> Treiber-Tick -> Render -> Pool-release.
// Wird ersetzt, sobald die Effekt-Pakete echte Handler liefern (Heilige
// Reihenfolge: erst Platzhalter-Form, dann Kunst).

const KEY = "placeholder";
const DEBUG_COLOR = 0xff00ff;
const HALF_W = 18; // halbe Rautenbreite (Iso-Andeutung, ~5:3)
const HALF_H = 11; // halbe Rautenhoehe

/** Zeichnet die Diagnose-Raute + Fadenkreuz einmal in lokale (0,0)-Koordinaten. */
function draw(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.lineStyle(2, DEBUG_COLOR, 1);
  g.beginPath();
  g.moveTo(0, -HALF_H);
  g.lineTo(HALF_W, 0);
  g.lineTo(0, HALF_H);
  g.lineTo(-HALF_W, 0);
  g.closePath();
  g.strokePath();
  g.lineBetween(-5, 0, 5, 0);
  g.lineBetween(0, -5, 0, 5);
}

/** Steckt den Platzhalter-Handler in den Dienst. */
export function registerPlaceholderFx(fx: FxService): void {
  fx.register(KEY, (ctx: FxContext, x: number, y: number, opts: FxOpts) => {
    const g = ctx.pool.acquire(KEY, () => ctx.scene.add.graphics());
    draw(g);
    g.setPosition(x, y)
      .setDepth(opts.depth ?? ctx.depthFor(y))
      .setScale(opts.scale ?? 1)
      .setAlpha(1);

    const life = opts.duration ?? 700;
    let t = 0;
    ctx.drive((dt) => {
      t += dt;
      // Volle Deckkraft bis 70 % der Lebensdauer, dann linear auslaufen -- reine
      // Liveness, kein Leuchten.
      const k = t / life;
      g.setAlpha(k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3));
      if (t < life) return true;
      ctx.pool.release(KEY, g);
      return false;
    });
  });
}
