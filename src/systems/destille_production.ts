import { DESTILLE_PRODUCTION_RATE_MS } from "../data/balance";
import type { GameState } from "./game_state";
import type { Owner } from "../data/loader";
import { EVT_DESTILLAT_PRODUCED } from "./death_fx";
import type Phaser from "phaser";

// HELLMUTH autonome Destillat-Produktion (docs/DESTILLAT-SYSTEM.md).
// Tickt im deterministischen Sim-Pfad und summiert je Besitzer ueber alle
// FERTIGEN Destillen: 1 Destillat pro DESTILLE_PRODUCTION_RATE_MS pro Destille,
// linear in der Anzahl, ohne Arbeiter-Input (wie Gunst in Age of Mythology).
// Fester Akkumulator -> reproduzierbar. Beruehrt nur Ressourcen, keine
// Positionen -> hash() bleibt erhalten. Pro produzierender Destille wird
// EVT_DESTILLAT_PRODUCED emittiert (reine Renderer-/Audio-Naht; kein Effekt
// auf den Sim-Zustand, daher hash-neutral). Scene-Param ist optional, damit
// headless Determinismus-Tests den Producer ohne Phaser konstruieren koennen.

const OWNERS: Owner[] = ["spieler", "gegner"];

export class DestilleProduction {
  private accMs = 0;

  constructor(
    private readonly state: GameState,
    private readonly scene?: Phaser.Scene,
  ) {}

  /** Matchstart/Seed: Akkumulator zuruecksetzen (Test-Isolation/Determinismus). */
  public reset(): void {
    this.accMs = 0;
  }

  public update(dtMs: number): void {
    this.accMs += dtMs;
    while (this.accMs >= DESTILLE_PRODUCTION_RATE_MS) {
      this.accMs -= DESTILLE_PRODUCTION_RATE_MS;
      for (const owner of OWNERS) {
        const n = this.state.destilleCount(owner, true);
        if (n > 0) {
          this.state.addResource(owner, "destillat", n);
          this.emitProduced(owner);
        }
      }
    }
  }

  /** Emittiert je fertige Destille des Besitzers EVT_DESTILLAT_PRODUCED mit
   *  Welt-Position (Code5-Audio; VFX-Listener kann spaeter andocken). */
  private emitProduced(owner: Owner): void {
    if (!this.scene) return;
    for (const b of this.state.buildings) {
      if (b.owner !== owner || b.typeId !== "destille" || !b.fertig) continue;
      this.scene.events.emit(EVT_DESTILLAT_PRODUCED, {
        x: b.x,
        y: b.y,
        faction: b.faction,
      });
    }
  }
}
