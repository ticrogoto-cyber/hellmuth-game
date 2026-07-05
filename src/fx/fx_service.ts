import type Phaser from "phaser";
import { FxPool } from "./fx_pool";
import type { FxContext, FxDriver, FxHandler, FxOpts } from "./fx_types";

// Effekte liegen ueber den Einheiten. Die Sortier-Konvention im Spiel ist
// depth = y; dieser Aufschlag hebt Effekte verlaesslich vor die Sprites.
export const FX_DEPTH_LIFT = 1000;

/**
 * Zentraler Effekt-Dienst: Handler-Register + spawn-Dispatcher + Treiber-Tick.
 * Bewusst technik-agnostisch -- der Dienst kennt nur Typ-Schluessel und das
 * Handler-Interface. Die konkreten Effekte registrieren sich spaeter ueber
 * register(); der Dienst entscheidet nie ueber Glow/Partikel/Sheet/Bake.
 *
 * Lebt pro Scene. Der per-Frame-Tick wird in index.ts an das Scene-UPDATE-Event
 * gehaengt (kein Eingriff in GameScene.update noetig). destroy() raeumt beim
 * Scene-Shutdown auf.
 */
export class FxService {
  private readonly handlers = new Map<string, FxHandler>();
  private readonly drivers: FxDriver[] = [];
  private readonly ctx: FxContext;
  public readonly pool: FxPool;

  constructor(scene: Phaser.Scene) {
    this.pool = new FxPool();
    this.ctx = {
      scene,
      pool: this.pool,
      depthFor: (y) => y + FX_DEPTH_LIFT,
      drive: (driver) => this.drivers.push(driver),
    };
  }

  /**
   * Registriert einen Handler fuer einen Effekt-Typ. Warnt im Dev-Build, wenn ein
   * bestehender Typ ueberschrieben wird (frueher Hinweis auf eine Doppel-
   * Registrierung beim Merge der Effekt-Pakete).
   */
  register(type: string, handler: FxHandler): void {
    if (import.meta.env.DEV && this.handlers.has(type)) {
      console.warn(`[fx] Handler fuer "${type}" wird ueberschrieben.`);
    }
    this.handlers.set(type, handler);
  }

  /** Ist ein Handler fuer diesen Typ registriert? */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /** Registrierte Effekt-Typen (Diagnose / Mess-Bruecke). */
  types(): string[] {
    return [...this.handlers.keys()];
  }

  /**
   * Saubere API: feuert einen Effekt an Weltkoordinate (x, y). Fehlt der Handler,
   * gibt es im Dev-Build eine Warnung und sonst ein No-op -- nie einen Crash, denn
   * der Effekt-Layer ist reine Darstellung und darf die Spiellogik nie reissen.
   */
  spawn(type: string, x: number, y: number, opts: FxOpts = {}): void {
    const handler = this.handlers.get(type);
    if (!handler) {
      if (import.meta.env.DEV) console.warn(`[fx] kein Handler fuer "${type}" -- ignoriert.`);
      return;
    }
    handler(this.ctx, x, y, opts);
  }

  /**
   * Bequemer Aufruf fuer das Explosions-Komposit (Paket C). Delegiert an den
   * "explosion"-Handler; haelt den Dienst dabei generisch (keine Kopplung an die
   * Explosionslogik). register ∈ "moderat" | "hellmuth" | "blood".
   */
  explosion(x: number, y: number, register: string, opts: FxOpts = {}): void {
    this.spawn("explosion", x, y, { ...opts, register });
  }

  /**
   * Per-Frame-Tick: treibt alle aktiven Treiber und entfernt fertige per Swap-Pop.
   * Ein einzelner defekter Treiber darf den Tick nicht reissen (try/catch); er
   * fliegt heraus. Neu waehrend des Ticks registrierte Treiber laufen ab dem
   * naechsten Frame.
   */
  tick(_time: number, deltaMs: number): void {
    for (let i = this.drivers.length - 1; i >= 0; i--) {
      let alive = false;
      try {
        alive = this.drivers[i](deltaMs);
      } catch (e) {
        if (import.meta.env.DEV) console.error("[fx] Treiber-Fehler:", e);
      }
      if (!alive) {
        this.drivers[i] = this.drivers[this.drivers.length - 1];
        this.drivers.pop();
      }
    }
  }

  /** Diagnose-Schnappschuss fuer die Mess-Bruecke. */
  stats(): { handlers: number; drivers: number; pool: { live: number; parked: number } } {
    return { handlers: this.handlers.size, drivers: this.drivers.length, pool: this.pool.stats() };
  }

  /** Scene-Shutdown: Treiber leeren, Handler vergessen, Pool zerstoeren. */
  destroy(): void {
    this.drivers.length = 0;
    this.handlers.clear();
    this.pool.destroy();
  }
}
