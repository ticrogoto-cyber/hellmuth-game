import Phaser from "phaser";
import { getBloodSystem } from "./blood_system";
import type { GameState } from "./game_state";
import type { Unit } from "../entities/unit";

// VERLETZUNGS-BLUTSPUR (Blut-Paket B, Strang 4). Eine Einheit unter 15 % HP zieht
// eine persistente Blutspur -- die Lebenspunkte-Anzeige der realsymbolischen Art:
// der Spieler liest den Zustand am Blut. Distanz-Akkumulator (kein Per-Frame-
// Stempeln -> sonst framerate-gekoppelte Dichte) auf ECHTEM Weg: unit.moving ist
// Befehls-Absicht (Separation schubst auch Stehende an), darum wird der real
// zurueckgelegte Schritt gemessen. Eigene Drossel, getrennt vom Fenster-DRAW_CAP.
// Referenz: Vintage Story »Blood Trail«, DoW-Rueckzug.

const WOUND_HP_FRAC = 0.15;
const WOUND_DRIP_PX = 48; // ein Tropfen je ~48 px Weg
const WOUND_DRIP_CAP_PER_FRAME = 12; // eigener Kanal, nicht der Fenster-DRAW_CAP=24
const WOUND_STEP_EPS = 0.05; // echter Schritt (analog MOVING_EPS der dynamics)

interface Acc {
  lx: number;
  ly: number;
  d: number;
}

const systems = new WeakMap<Phaser.Scene, WoundTrailSystem>();

export function getWoundSystem(scene: Phaser.Scene): WoundTrailSystem {
  let s = systems.get(scene);
  if (!s) {
    s = new WoundTrailSystem(scene);
    systems.set(scene, s);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => systems.delete(scene));
  }
  return s;
}

export class WoundTrailSystem {
  private readonly acc = new WeakMap<Unit, Acc>();
  private cursor = 0; // Round-Robin-Start gegen Verhungern unter der Drossel
  private dripped = 0; // Diagnose
  private lastWounded = 0; // Diagnose

  constructor(private readonly scene: Phaser.Scene) {
    const onUpdate = (_t: number, delta: number): void => this.update(delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
    (scene as unknown as { wounds?: WoundTrailSystem }).wounds = this;
  }

  /**
   * Pro Frame: jede Einheit unter 15 % HP, die SICH ECHT BEWEGT, akkumuliert Weg;
   * je WOUND_DRIP_PX faellt ein persistenter (drip-Slot, 5-Min-Fade) Tropfen.
   * Gedrosselt durch WOUND_DRIP_CAP_PER_FRAME (Round-Robin). Stillstand -> nichts;
   * auf >15 % geheilt -> Spur stoppt, das Gelegte bleibt.
   */
  public update(_delta: number): void {
    const gs = this.scene.registry.get("gameState") as GameState | undefined;
    if (!gs) return;
    const units = gs.units;
    const n = units.length;
    if (n === 0) return;

    let stamped = 0;
    let wounded = 0;
    for (let k = 0; k < n && stamped < WOUND_DRIP_CAP_PER_FRAME; k++) {
      const u = units[(this.cursor + k) % n];
      let a = this.acc.get(u);
      if (!a) {
        this.acc.set(u, { lx: u.x, ly: u.y, d: 0 });
        continue; // erster Frame: nur Position merken
      }
      const step = Math.hypot(u.x - a.lx, u.y - a.ly);
      a.lx = u.x;
      a.ly = u.y;
      const hurt = u.maxHp > 0 && u.hp / u.maxHp < WOUND_HP_FRAC;
      if (hurt) wounded++;
      if (hurt && step > WOUND_STEP_EPS) {
        a.d += step;
        while (a.d >= WOUND_DRIP_PX && stamped < WOUND_DRIP_CAP_PER_FRAME) {
          a.d -= WOUND_DRIP_PX;
          getBloodSystem(this.scene).stampPersistentSlot(u.x, u.y, u.faction, 0.16, "drip");
          stamped++;
          this.dripped++;
        }
      }
    }
    this.lastWounded = wounded;
    this.cursor = (this.cursor + 1) % n;
  }

  /** Diagnose fuer die Mess-Bruecke. */
  public stats(): { dripped: number; wounded: number } {
    return { dripped: this.dripped, wounded: this.lastWounded };
  }
}
