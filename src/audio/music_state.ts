// Reiner Zustandsautomat fuer die dynamische Musik (Strang 4). Phaser-frei und
// importfrei -> in Node testbar. Der MusicDirector kapselt nur Events + Streams.
//
// Hysterese (der Kern): Combat braucht `enter` Treffer in `fenster` ms (filtert
// Arbeiter-Selbstwehr) und haelt dann `hold` ms (Flacker-Bremse). Terminal
// (victory/defeat) ueberschreibt alles.

export type MusicState = "explore" | "tension" | "combat" | "victory" | "defeat";

export interface MusicKernCfg {
  fenster: number;
  enter: number;
  hold: number;
}

const KERN_DEFAULT: MusicKernCfg = { fenster: 1500, enter: 2, hold: 6000 };

export class MusicKern {
  private readonly cfg: MusicKernCfg;
  private hits: number[] = [];
  private combatBis = 0;
  private terminal?: MusicState;
  private zustand: MusicState = "explore";

  constructor(cfg: Partial<MusicKernCfg> = {}) {
    this.cfg = { ...KERN_DEFAULT, ...cfg };
  }

  get aktuell(): MusicState {
    return this.zustand;
  }

  registerHit(nowMs: number): void {
    this.hits.push(nowMs);
  }

  setTerminal(s: "victory" | "defeat"): void {
    this.terminal = s;
  }

  tick(nowMs: number): MusicState {
    if (this.terminal) {
      this.zustand = this.terminal;
      return this.zustand;
    }
    this.hits = this.hits.filter((t) => nowMs - t <= this.cfg.fenster);
    if (this.hits.length >= this.cfg.enter) this.combatBis = nowMs + this.cfg.hold;
    if (nowMs < this.combatBis) this.zustand = "combat";
    else if (this.hits.length >= 1) this.zustand = "tension";
    else this.zustand = "explore";
    return this.zustand;
  }
}
