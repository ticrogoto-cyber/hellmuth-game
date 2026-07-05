// Atmosphaere / Ambience (Strang 5) -- Phaser-Wrapper um den reinen
// Hysterese-Kern (ambience_state.ts). 5x5-Sonden alle 500 ms ueber den
// worldView, Histogramm (Mitte 3x3 doppelt), equal-power-Crossfade, max 2
// Streams, Ziel-Gain ~0,07 linear (felt-not-heard). Emittiert `biome.entered`.
//
// Terrain liegt auf claude/editor (dominantSort) -- hier ueber einen injizierten
// Sampler entkoppelt (Stub bis zum Merge, wie bei den Kampf-Events).

import type Phaser from "phaser";
import { worldToTile } from "../util/world";
import { EVT_BIOME_ENTERED } from "../systems/game_events";
import type { AudioManager } from "./audio_manager";
import type { StreamHandle } from "./audio_backend";
import { AmbienceKern } from "./ambience_state";

/** Liefert die Bodensorte einer Kachel (vom Terrain, claude/editor). */
export type TerrainSampler = (col: number, row: number) => string | undefined;

export interface AmbienceDirectorOpts {
  /** Terrain-Sampler. Default: Stub (eine Sorte -> stabiles Bett). */
  sampler?: TerrainSampler;
  /** Biom -> Ambience-Set-Schluessel. Default: ambient.<biome mit _>. */
  setFuer?: (biome: string) => string;
  pollMs?: number;
}

const AMBIENCE_GAIN = 0.07; // felt-not-heard (-30..-24 dBFS)
const CROSSFADE = 3.0; // s (2,5-4 s)

export class AmbienceDirector {
  private readonly scene: Phaser.Scene;
  private readonly audio: AudioManager;
  private readonly kern = new AmbienceKern();
  private readonly sampler: TerrainSampler;
  private readonly setFuer: (biome: string) => string;
  private current?: StreamHandle;
  private timer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, audio: AudioManager, opts: AmbienceDirectorOpts = {}) {
    this.scene = scene;
    this.audio = audio;
    // Stub-Sampler bis zum editor-Merge: eine stabile Sorte, kein Flackern.
    this.sampler = opts.sampler ?? ((): string => "steppe");
    this.setFuer = opts.setFuer ?? ((b: string): string => "ambient." + b.replace(/-/g, "_"));
    this.timer = scene.time.addEvent({
      delay: opts.pollMs ?? 500,
      loop: true,
      callback: () => this.poll(),
    });
    scene.events.once("shutdown", () => this.dispose());
  }

  get biome(): string | undefined {
    return this.kern.aktuell;
  }

  private poll(): void {
    const cam = this.scene.cameras.main;
    if (!cam) return;
    const hist = this.histogramm(cam.worldView);
    const r = this.kern.poll(hist);
    if (r.changed && r.biome) this.wechsel(r.biome);
  }

  /** 5x5-Sonden ueber den worldView; Mitte 3x3 doppelt gewichtet. */
  private histogramm(v: { x: number; y: number; width: number; height: number }): Record<string, number> {
    const hist: Record<string, number> = {};
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const wx = v.x + ((i + 0.5) / 5) * v.width;
        const wy = v.y + ((j + 0.5) / 5) * v.height;
        const t = worldToTile(wx, wy);
        const sorte = this.sampler(t.col, t.row);
        if (!sorte) continue;
        const mitte = i >= 1 && i <= 3 && j >= 1 && j <= 3;
        hist[sorte] = (hist[sorte] ?? 0) + (mitte ? 2 : 1);
      }
    }
    return hist;
  }

  private wechsel(biome: string): void {
    this.audio.resume();
    const neu = this.audio.streamSet(this.setFuer(biome), { loop: true, gain: 0 });
    neu?.fade(AMBIENCE_GAIN, CROSSFADE);
    const alt = this.current;
    if (alt) {
      alt.fade(0, CROSSFADE);
      this.scene.time.delayedCall(CROSSFADE * 1000 + 200, () => alt.stop());
    }
    this.current = neu ?? undefined;
    this.scene.events.emit(EVT_BIOME_ENTERED, { biome });
  }

  private dispose(): void {
    this.timer?.remove();
    this.timer = undefined;
    this.current?.stop();
    this.current = undefined;
  }
}
