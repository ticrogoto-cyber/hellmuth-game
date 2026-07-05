// Reiner Hysterese-Kern fuer die Ambience (Strang 5). Phaser-frei/importfrei ->
// Node-testbar. Ein Kandidat-Biom muss das Histogramm mit >= minShare Anteil
// fuer >= minPolls aufeinanderfolgende Polls gewinnen, bevor gewechselt wird;
// die Erstbestimmung setzt sofort, damit das Bett startet.

export interface AmbienceKernCfg {
  minPolls: number;
  minShare: number;
}

const KERN_DEFAULT: AmbienceKernCfg = { minPolls: 3, minShare: 0.6 };

export interface PollErgebnis {
  changed: boolean;
  biome?: string;
}

export class AmbienceKern {
  private readonly cfg: AmbienceKernCfg;
  private current?: string;
  private kandidat?: string;
  private kandZahl = 0;

  constructor(cfg: Partial<AmbienceKernCfg> = {}) {
    this.cfg = { ...KERN_DEFAULT, ...cfg };
  }

  get aktuell(): string | undefined {
    return this.current;
  }

  poll(hist: Record<string, number>): PollErgebnis {
    let sieger: string | undefined;
    let max = 0;
    let total = 0;
    for (const [b, c] of Object.entries(hist)) {
      total += c;
      if (c > max) {
        max = c;
        sieger = b;
      }
    }
    if (!sieger || total === 0) return { changed: false, biome: this.current };

    if (this.current === undefined) {
      this.current = sieger;
      return { changed: true, biome: sieger };
    }

    const anteil = max / total;
    if (sieger === this.current || anteil < this.cfg.minShare) {
      this.kandidat = undefined;
      this.kandZahl = 0;
      return { changed: false, biome: this.current };
    }
    if (sieger === this.kandidat) this.kandZahl++;
    else {
      this.kandidat = sieger;
      this.kandZahl = 1;
    }
    if (this.kandZahl >= this.cfg.minPolls) {
      this.current = sieger;
      this.kandidat = undefined;
      this.kandZahl = 0;
      return { changed: true, biome: sieger };
    }
    return { changed: false, biome: this.current };
  }
}
