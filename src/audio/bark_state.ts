// Reiner Entscheidungs-Kern fuer Einheiten-Barks (Strang 3). Phaser-frei/
// importfrei -> Node-testbar. Cooldown je Gruppe, Annoyed-Eskalation
// (>= annoyedClicks im Fenster), Interruption nach Prioritaet (ein Sprecher).

export type BarkKat = "select" | "annoyed" | "move" | "attack" | "death" | "idle";

const GRUPPE: Record<BarkKat, string> = {
  select: "select",
  // Annoyed eigene Gruppe (Cooldown 0): muss beim Klick-Spam sofort feuern,
  // nicht vom Select-Cooldown gehalten werden.
  annoyed: "annoyed",
  move: "command",
  attack: "command",
  death: "death",
  idle: "idle",
};
const COOLDOWN: Record<string, number> = { select: 350, command: 600, idle: 12000, death: 0, annoyed: 0 };
const PRIO: Record<BarkKat, number> = {
  death: 5,
  attack: 4,
  move: 4,
  select: 3,
  annoyed: 3,
  idle: 1,
};

export interface BarkKernCfg {
  annoyedClicks: number;
  clickFenster: number;
  barkDauer: number;
}

const KERN_DEFAULT: BarkKernCfg = { annoyedClicks: 6, clickFenster: 1200, barkDauer: 1200 };

export interface BarkEntscheid {
  spiele: boolean;
  kat: BarkKat;
}

export class BarkKern {
  private readonly cfg: BarkKernCfg;
  private readonly letzteGruppe = new Map<string, number>();
  private clicks: number[] = [];
  private curPrio = 0;
  private curBis = 0;

  constructor(cfg: Partial<BarkKernCfg> = {}) {
    this.cfg = { ...KERN_DEFAULT, ...cfg };
  }

  private cooldownAktiv(gruppe: string, nowMs: number): boolean {
    const cd = COOLDOWN[gruppe] ?? 0;
    const last = this.letzteGruppe.get(gruppe);
    return cd > 0 && last !== undefined && nowMs - last < cd;
  }

  entscheide(kat: BarkKat, nowMs: number): BarkEntscheid {
    let finalKat = kat;
    if (kat === "select") {
      this.clicks = this.clicks.filter((t) => nowMs - t <= this.cfg.clickFenster);
      this.clicks.push(nowMs);
      if (this.clicks.length >= this.cfg.annoyedClicks) finalKat = "annoyed";
    }
    const gruppe = GRUPPE[finalKat];
    if (this.cooldownAktiv(gruppe, nowMs)) return { spiele: false, kat: finalKat };

    const prio = PRIO[finalKat];
    if (nowMs < this.curBis && prio < this.curPrio) return { spiele: false, kat: finalKat };

    this.letzteGruppe.set(gruppe, nowMs);
    if (finalKat === "annoyed") this.clicks = [];
    this.curPrio = prio;
    this.curBis = nowMs + this.cfg.barkDauer;
    return { spiele: true, kat: finalKat };
  }
}
