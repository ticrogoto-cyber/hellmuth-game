// Duenner Hook in den vorhandenen Ereignis-Bus. Rein additiv, baugleich zu
// installDeathFx: abonniert die schon emittierten Ereignisse, raeumt beim
// Scene-Shutdown auf, greift NICHT in Spiellogik ein.
//
// Die Zuordnung Ereignis -> Set liegt datengetrieben im Manifest (bindings);
// dieser Hook abonniert genau die gebundenen Ereignisse und reicht den
// Ausloeser an `audio.play(event, ctx)`. Bus-Trennung: `ui:*` liegen auf dem
// globalen game.events-Bus, alles uebrige auf scene.events (GameScene).

import Phaser from "phaser";
import type { AudioManager } from "./audio_manager";
import { ctxAus } from "./event_ctx";

export interface AudioHookController {
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  uninstall(): void;
}

function istGlobal(event: string): boolean {
  return event.startsWith("ui:");
}

/**
 * Haengt den Audio-Bus-Hook an die Scene. `audio` darf null sein -> No-op.
 * Standardmaessig aktiv; fehlt eine Tondatei, ist die Voice still (no-op).
 */
export function installAudio(
  scene: Phaser.Scene,
  audio: AudioManager | null | undefined,
): AudioHookController {
  let enabled = true;
  const sceneAbos: Array<[string, (...a: unknown[]) => void]> = [];
  const gameAbos: Array<[string, (...a: unknown[]) => void]> = [];

  if (audio) {
    for (const event of audio.boundEvents()) {
      const handler = (payload?: unknown): void => {
        if (!enabled) return;
        audio.play(event, ctxAus(payload));
      };
      if (istGlobal(event)) {
        scene.game.events.on(event, handler);
        gameAbos.push([event, handler]);
      } else {
        scene.events.on(event, handler);
        sceneAbos.push([event, handler]);
      }
    }
  }

  const uninstall = (): void => {
    for (const [e, h] of sceneAbos) scene.events.off(e, h);
    for (const [e, h] of gameAbos) scene.game.events.off(e, h);
    sceneAbos.length = 0;
    gameAbos.length = 0;
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, uninstall);

  return {
    setEnabled: (v: boolean): void => {
      enabled = v;
    },
    isEnabled: (): boolean => enabled,
    uninstall,
  };
}
