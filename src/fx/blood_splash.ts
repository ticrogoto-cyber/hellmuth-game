import Phaser from "phaser";
import type { FxService } from "./fx_service";
import type { FxOpts } from "./fx_types";
import { getBloodSystem, factionSub, substanceColor, DROP_KEY } from "../systems/blood_system";

// Gerichtete Spritz-Fontaene (Blut-Paket A, Strang 1). Anders als der radiale
// ADD-Funke aus burst() sind das NORMAL-Blend-Tropfen (opakes Blut), die in einem
// Kegel um die Treffer-Richtung fliegen. Code7: jetzt in Iso-Scheinhoehe statt in
// reiner Bildschirm-Y -- die Tropfen POPpen hoch, fliegen im Bogen und LANDEN auf
// dem Boden (gezeichnet y0 - h), statt flach zu kleben. Schwerkraft mit Truemmern
// und Gibs vereinheitlicht (GRAV 760). Beim Settle stempelt ein Bruchteil ins
// Fenster. Referenz: Valve env_blood (spraydir), SC2 Splat-Forward-Vector.

const CONE = 0.5; // +/- rad um das Heading (Boden-Richtung)
const SOFT_CAP = 400; // gleichzeitig lebende Tropfen
const SETTLE_STAMP_CHANCE = 0.3; // nur ein Bruchteil stempelt (DRAW_CAP-Schonung)
const GRAV = 760; // Welt-px/s^2, vereinheitlicht mit debris/gibs (war 480)
const ISO_X = 0.9; // Horizontaldrift (Bildschirm-x)
const ISO_Y = 0.5; // Boden-Drift (Bildschirm-y), iso geplattet
const POP_MIN = 150; // Scheinhoehe-Pop (px/s) -- garantiert jedem Tropfen einen Bogen
const POP_MAX = 280;

let liveDrops = 0; // globaler Soft-Cap-Zaehler

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

interface Drop {
  img: Phaser.GameObjects.Image;
  cx: number; // aktuelle Boden-Bildschirm-x
  cy: number; // aktuelle Boden-Bildschirm-y (Lande-Linie)
  vx: number; // Bodendrift x (px/s)
  vgy: number; // Bodendrift y (px/s, iso geplattet)
  vy: number; // Scheinhoehe-Vertikaltempo (hoch = +)
  h: number; // aktuelle Scheinhoehe (px)
  t: number; // Zeit seit Auswurf (s)
  air: number; // geschaetzte Flugzeit (s) fuer das Ausblenden
  settled: boolean;
}

export function registerBloodSplash(fx: FxService): void {
  // liveDrops ist modul-global; FxService.destroy() leert die Treiber per
  // length=0 OHNE ihren Settle-Pfad zu durchlaufen -> in-flight Tropfen
  // dekrementieren nie. Der Rest wuerde ueber den Scene-Neustart bluten und den
  // Soft-Cap dauerhaft saettigen (count<=0 -> gar keine Spritzer mehr).
  // registerBloodSplash laeuft EINMAL je Scene (installFx) -> hart zuruecksetzen
  // (gleiche Lehre wie ground_mist.ts).
  liveDrops = 0;
  fx.register("blood_splash", (ctx, x, y, o: FxOpts) => {
    const faction = o.faction;
    const sub = factionSub(faction);
    const color = substanceColor(sub);
    const ax = num(o.ax);
    const ay = num(o.ay);
    // Heading = vom Angreifer weg (Projektil-Richtung). Ohne ax/ay degradiert es
    // nach oben (dynamics-Kopplung: Code3 fuellt ax/ay am HitEvent in Phase A).
    const heading = ax !== undefined && ay !== undefined ? Math.atan2(y - ay, x - ax) : -Math.PI / 2;

    let count = num(o.count) ?? 10;
    count = Math.min(count, SOFT_CAP - liveDrops);
    if (count <= 0) return;

    const drops: Drop[] = [];
    for (let i = 0; i < count; i++) {
      const img = ctx.pool.acquire(DROP_KEY, () =>
        ctx.scene.add.image(0, 0, DROP_KEY).setBlendMode(Phaser.BlendModes.NORMAL),
      );
      const a = heading + (Math.random() * 2 - 1) * CONE;
      const speed = 80 + Math.random() * 150;
      const vy = POP_MIN + Math.random() * (POP_MAX - POP_MIN);
      img
        .setPosition(x, y)
        .setTint(color)
        .setAlpha(0.95)
        .setScale(0.35 + Math.random() * 0.5)
        .setDepth(y + 1000);
      drops.push({
        img,
        cx: x,
        cy: y,
        vx: Math.cos(a) * speed * ISO_X,
        vgy: Math.sin(a) * speed * ISO_Y,
        vy,
        h: 0,
        t: 0,
        air: (2 * vy) / GRAV,
        settled: false,
      });
      liveDrops++;
    }

    ctx.drive((dt) => {
      const s = dt / 1000;
      let alive = 0;
      for (const d of drops) {
        if (d.settled) continue;
        d.t += s;
        d.vy -= GRAV * s; // Scheinhoehe-Schwerkraft
        d.h += d.vy * s;
        d.cx += d.vx * s; // Bodendrift
        d.cy += d.vgy * s;
        const alpha = Math.max(0, 0.95 * (1 - d.t / (d.air + 0.12)));
        d.img.setPosition(d.cx, d.cy - d.h).setAlpha(alpha).setDepth(d.cy + 1000);
        if (d.h <= 0 && d.t > 0.02) {
          // Bodenkontakt: ein Bruchteil hinterlaesst eine Fenster-Marke (zaehlt gegen DRAW_CAP).
          if (Math.random() < SETTLE_STAMP_CHANCE) getBloodSystem(ctx.scene).stampWindow(d.cx, d.cy, faction, 0.16);
          ctx.pool.release(DROP_KEY, d.img);
          d.settled = true;
          liveDrops--;
        } else {
          alive++;
        }
      }
      return alive > 0;
    });
  });
}
