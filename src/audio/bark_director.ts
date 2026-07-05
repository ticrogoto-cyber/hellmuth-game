// Einheiten-Stimmen / Barks (Strang 3) -- Phaser-Wrapper um den reinen
// Entscheidungs-Kern (bark_state.ts). Ein Voice-Handle (nur der Sprecher =
// units[0], kein Chor); Variantenwahl macht der Shuffle-Bag im AudioManager;
// Barks ordnen sich dem Strang-1-Cap unter (Set-Kategorie ui = geschuetzte
// Stimm-Spur). Funnel: Selektion/Befehl/Tod-Events (kein neuer Emit-Pfad).

import type Phaser from "phaser";
import { EVT_UNIT_DIED } from "../systems/death_fx";
import { EVT_UNITS_SELECTED, EVT_COMMAND_MOVE } from "../systems/game_events";
import type { AudioManager, KlangHandle } from "./audio_manager";
import type { BarkKat } from "./bark_state";
import { BarkKern } from "./bark_state";

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const IDLE_MS = 12000;

export class BarkDirector {
  private readonly scene: Phaser.Scene;
  private readonly audio: AudioManager;
  private readonly kern = new BarkKern();
  private current?: KlangHandle;
  private letzteAktivitaet = now();
  private letzterTyp?: string;
  private letzteFraktion?: string;
  private readonly onSelect: (p?: unknown) => void;
  private readonly onCommand: (p?: unknown) => void;
  private readonly onDeath: (p?: unknown) => void;

  constructor(scene: Phaser.Scene, audio: AudioManager) {
    this.scene = scene;
    this.audio = audio;
    this.onSelect = (p?: unknown): void => {
      const o = obj(p);
      this.trigger("select", str(o.unitType), str(o.faction));
    };
    this.onCommand = (p?: unknown): void => {
      const o = obj(p);
      const kat: BarkKat = o.kind === "attack" ? "attack" : "move";
      this.trigger(kat, str(o.unitType), str(o.faction));
    };
    this.onDeath = (p?: unknown): void => {
      const o = obj(p);
      this.trigger("death", str(o.unitType), str(o.faction));
    };
    scene.events.on(EVT_UNITS_SELECTED, this.onSelect);
    scene.events.on(EVT_COMMAND_MOVE, this.onCommand);
    scene.events.on(EVT_UNIT_DIED, this.onDeath);
    scene.events.once("shutdown", () => this.dispose());
  }

  /** Pro Frame aus game_scene.update: Idle-Bark nach Stille. */
  tick(): void {
    if (!this.letzterTyp) return;
    if (now() - this.letzteAktivitaet > IDLE_MS) {
      this.trigger("idle", this.letzterTyp, this.letzteFraktion);
    }
  }

  private trigger(kat: BarkKat, typeId: string | undefined, faction: string | undefined): void {
    if (!typeId) return;
    const e = this.kern.entscheide(kat, now());
    if (kat !== "idle") {
      this.letzteAktivitaet = now();
      this.letzterTyp = typeId;
      this.letzteFraktion = faction;
    }
    if (!e.spiele) return;
    const setKey = `bark.${typeId}.${e.kat}`;
    if (!this.audio.hasSet(setKey)) return; // kein Bark fuer diesen Typ -> still
    this.current?.stop();
    this.current = this.audio.playSet(setKey, { faction, unitType: typeId }) ?? undefined;
    if (kat === "idle") this.letzteAktivitaet = now();
  }

  private dispose(): void {
    this.scene.events.off(EVT_UNITS_SELECTED, this.onSelect);
    this.scene.events.off(EVT_COMMAND_MOVE, this.onCommand);
    this.scene.events.off(EVT_UNIT_DIED, this.onDeath);
    this.current?.stop();
    this.current = undefined;
  }
}

function obj(p: unknown): Record<string, unknown> {
  return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
