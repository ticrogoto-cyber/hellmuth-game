// Dynamische Musik (Strang 4) -- Phaser-Wrapper um den reinen Zustandsautomaten
// (music_state.ts). Horizontal-Crossfade zwischen explore/tension/combat/
// victory/defeat (Stem-Layering verworfen). Streamt die Tracks (MediaElement)
// und blendet sie equal-power-artig ueber. Reiner Event-Konsument (Kampf-/
// Ausgang-Events), kein neuer Emit-Pfad.

import type Phaser from "phaser";
import { EVT_UNIT_HIT } from "../systems/death_fx";
import { EVT_VICTORY, EVT_DEFEAT } from "../systems/game_events";
import type { AudioManager } from "./audio_manager";
import type { StreamHandle } from "./audio_backend";
import type { MusicState } from "./music_state";
import { MusicKern } from "./music_state";
import { braucheLoopCrossfade } from "./audio_util";

const MUSIK_SET: Record<MusicState, string> = {
  explore: "music.explore",
  tension: "music.tension",
  combat: "music.combat",
  victory: "music.victory",
  defeat: "music.defeat",
};

const FADE_IN = 0.8; // s (600-900 ms rein)
const FADE_OUT = 3.0; // s (2500-3500 ms raus)
const LOOP_TAIL = 0.4; // s Tail-Crossfade (300-500 ms; kein sample-genauer Loop)
const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

function terminalState(s: MusicState): boolean {
  return s === "victory" || s === "defeat";
}

export class MusicDirector {
  private readonly scene: Phaser.Scene;
  private readonly audio: AudioManager;
  private readonly kern = new MusicKern();
  private current?: StreamHandle;
  private currentState?: MusicState;
  private readonly onHit: () => void;
  private readonly onVictory: () => void;
  private readonly onDefeat: () => void;

  constructor(scene: Phaser.Scene, audio: AudioManager) {
    this.scene = scene;
    this.audio = audio;
    this.onHit = (): void => this.kern.registerHit(now());
    this.onVictory = (): void => this.kern.setTerminal("victory");
    this.onDefeat = (): void => this.kern.setTerminal("defeat");
    scene.events.on(EVT_UNIT_HIT, this.onHit);
    scene.events.on(EVT_VICTORY, this.onVictory);
    scene.events.on(EVT_DEFEAT, this.onDefeat);
    scene.events.once("shutdown", () => this.dispose());
  }

  /** Pro Frame aus game_scene.update aufrufen. */
  tick(): void {
    const s = this.kern.tick(now());
    if (s !== this.currentState) this.wechsel(s);
    else this.loopTick();
  }

  get zustand(): MusicState {
    return this.kern.aktuell;
  }

  /**
   * Tail-Crossfade-Loop (Physik T3): faellt die Restzeit eines nicht-terminalen
   * Tracks unter den Tail, in einen frischen Durchlauf desselben Tracks
   * ueberblenden -- sauberer Uebergang statt hartem Schnitt/Padding-Knack.
   */
  private loopTick(): void {
    const s = this.currentState;
    if (!s || terminalState(s) || !this.current) return;
    if (braucheLoopCrossfade(this.current.position(), this.current.dauer(), LOOP_TAIL)) {
      this.starte(s, FADE_IN);
    }
  }

  private wechsel(s: MusicState): void {
    this.starte(s, FADE_IN);
    this.currentState = s;
  }

  /** Startet einen frischen Stream des Zustands und blendet den alten aus. */
  private starte(s: MusicState, fadeIn: number): void {
    this.audio.resume();
    // Nicht-terminale Tracks loopen ueber diesen Crossfade, nicht ueber el.loop.
    const neu = this.audio.streamSet(MUSIK_SET[s], { loop: false, gain: 0 });
    neu?.fade(1, fadeIn);
    const alt = this.current;
    if (alt) {
      alt.fade(0, FADE_OUT);
      this.scene.time.delayedCall(FADE_OUT * 1000 + 200, () => alt.stop());
    }
    this.current = neu ?? undefined;
  }

  private dispose(): void {
    this.scene.events.off(EVT_UNIT_HIT, this.onHit);
    this.scene.events.off(EVT_VICTORY, this.onVictory);
    this.scene.events.off(EVT_DEFEAT, this.onDefeat);
    this.current?.stop();
    this.current = undefined;
  }
}
