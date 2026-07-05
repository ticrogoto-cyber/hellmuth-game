// audio_bus.ts — globale Lautstaerke-Schnittstelle (CODE2-MENU-FAMILIE Aufgabe 5).
// Die EINZIGE neue globale Audio-Schnittstelle. Das Optionen-Menue schreibt,
// HUD-Sound / Florilegium-Voice / Spiel-Musik lesen. Werte 0..1.
//
// Bei jeder Aenderung wird ein Custom-Event `audio:volume-changed` auf `window`
// gefeuert; laufende Audio-Quellen koennen darauf hoeren und sich anpassen.
// Persistenz teilt sich den localStorage-Schluessel mit dem Optionen-Menue
// (hellmuth_options_v1), liest/schreibt aber nur die vier Lautstaerke-Felder.

export type AudioBusChannel = "master" | "music" | "sfx" | "voice";

const STORAGE_KEY = "hellmuth_options_v1";
export const AUDIO_VOLUME_EVENT = "audio:volume-changed";

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

interface AudioBusShape {
  master: number;
  music: number;
  sfx: number;
  voice: number;
  effectiveMusic(): number;
  effectiveSfx(): number;
  effectiveVoice(): number;
  set(channel: AudioBusChannel, value: number): void;
  loadFromStorage(): void;
  saveToStorage(): void;
}

export const AudioBus: AudioBusShape = {
  master: 1.0,
  music: 1.0,
  sfx: 1.0,
  voice: 1.0,

  effectiveMusic(): number {
    return clamp01(this.master) * clamp01(this.music);
  },
  effectiveSfx(): number {
    return clamp01(this.master) * clamp01(this.sfx);
  },
  effectiveVoice(): number {
    return clamp01(this.master) * clamp01(this.voice);
  },

  /** Einen Kanal setzen, persistieren, Event feuern. */
  set(channel: AudioBusChannel, value: number): void {
    this[channel] = clamp01(value);
    this.saveToStorage();
    try {
      window.dispatchEvent(
        new CustomEvent(AUDIO_VOLUME_EVENT, {
          detail: {
            channel,
            master: this.master,
            music: this.music,
            sfx: this.sfx,
            voice: this.voice,
          },
        }),
      );
    } catch {
      /* kein window (Node-Test) -> still */
    }
  },

  /** Vier Lautstaerke-Felder aus localStorage ziehen. Tolerant: fehlende
   *  Felder bleiben auf Default 1.0. */
  loadFromStorage(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const o = JSON.parse(raw) as Partial<Record<AudioBusChannel, number>>;
      if (typeof o.master === "number") this.master = clamp01(o.master);
      if (typeof o.music === "number") this.music = clamp01(o.music);
      if (typeof o.sfx === "number") this.sfx = clamp01(o.sfx);
      if (typeof o.voice === "number") this.voice = clamp01(o.voice);
    } catch {
      /* kaputter Eintrag -> Defaults */
    }
  },

  /** Vier Felder zurueckschreiben, ohne andere Optionen-Felder zu zerstoeren. */
  saveToStorage(): void {
    let current: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) current = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* ignorieren, neu schreiben */
    }
    current.master = this.master;
    current.music = this.music;
    current.sfx = this.sfx;
    current.voice = this.voice;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* kein localStorage -> still */
    }
  },
};

// Beim Modul-Laden den persistierten Stand ziehen (idempotent).
AudioBus.loadFromStorage();

// Globaler Handle fuer andere Module + den Headless-Check H25
// (tools/menu_ui_check.py prueft effectiveMusic/Sfx/Voice).
try {
  (window as unknown as { __audioBus: typeof AudioBus }).__audioBus = AudioBus;
} catch {
  /* kein window (Node-Test) -> still */
}
