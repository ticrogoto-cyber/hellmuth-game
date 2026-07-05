// Florilegium-Audio-Player (Subagent #11). HTMLAudioElement mit Goldlinie als
// Fortschritt + Restzeit; persistiert beim Eintrag-Wechsel (kein Auto-Stop).
// Lautstaerke kommt global aus dem AudioBus (effectiveVoice), reagiert live
// auf `audio:volume-changed`.

import { AudioBus, AUDIO_VOLUME_EVENT } from "../audio/audio_bus";

export interface NowPlaying {
  entryId: string;
  entryTitle: string;
  url: string;
}

export class FlorilegiumAudioPlayer {
  private readonly el: HTMLAudioElement;
  private current: NowPlaying | null = null;
  private isPlaying = false;

  constructor() {
    this.el = new Audio();
    this.el.preload = "none";
    this.el.volume = AudioBus.effectiveVoice();
    this.el.addEventListener("ended", () => {
      this.isPlaying = false;
      this.emit();
    });
    this.el.addEventListener("error", () => {
      this.isPlaying = false;
      this.emit();
    });
    this.el.addEventListener("timeupdate", () => this.emit());
    this.el.addEventListener("loadedmetadata", () => this.emit());
    window.addEventListener(AUDIO_VOLUME_EVENT, () => {
      this.el.volume = AudioBus.effectiveVoice();
    });
  }

  getVolume(): number {
    return AudioBus.effectiveVoice();
  }

  /** Spielt einen Eintrag ab. Persistiert beim Eintrag-Wechsel: bestehende
   *  Wiedergabe wird ueberlagert, weil die Spec sagt "Mini-Player bleibt".
   *  Hier konkret: wenn anderer Eintrag laueft -> stoppen, dann neu starten. */
  async play(entry: NowPlaying): Promise<boolean> {
    if (!entry.url) return false;
    this.el.volume = AudioBus.effectiveVoice();
    if (this.current?.entryId !== entry.entryId || this.current?.url !== entry.url) {
      this.el.pause();
      this.el.src = entry.url;
      this.current = { ...entry };
    }
    try {
      await this.el.play();
      this.isPlaying = true;
      this.emit();
      return true;
    } catch {
      this.isPlaying = false;
      this.emit();
      return false;
    }
  }

  /** Toggle nur auf laufender Quelle. */
  toggle(): void {
    if (!this.current) return;
    if (this.el.paused) {
      this.el.volume = AudioBus.effectiveVoice();
      void this.el
        .play()
        .then(() => {
          this.isPlaying = true;
          this.emit();
        })
        .catch(() => {
          this.isPlaying = false;
          this.emit();
        });
    } else {
      this.el.pause();
      this.isPlaying = false;
      this.emit();
    }
  }

  stop(): void {
    this.el.pause();
    this.el.currentTime = 0;
    this.isPlaying = false;
    this.current = null;
    this.emit();
  }

  /** Sprung auf bestimmten Fortschritt 0..1 (Klick auf die Goldlinie). */
  seekFraction(f: number): void {
    if (!this.el.duration || !isFinite(this.el.duration)) return;
    this.el.currentTime = Math.max(0, Math.min(this.el.duration, f * this.el.duration));
    this.emit();
  }

  /** Eintrag-spezifische Fortschritts-Info; falls anderer Eintrag aktiv ist,
   *  liefert die Methode `null` zurueck. */
  progressFor(entryId: string): { fraction: number; remainingSec: number } | null {
    if (!this.current || this.current.entryId !== entryId) return null;
    const d = this.el.duration;
    if (!d || !isFinite(d) || d <= 0) return { fraction: 0, remainingSec: 0 };
    const f = Math.max(0, Math.min(1, this.el.currentTime / d));
    return { fraction: f, remainingSec: Math.max(0, d - this.el.currentTime) };
  }

  /** Was laeuft gerade? Auch wenn die UI einen anderen Eintrag zeigt. */
  nowPlaying(): NowPlaying | null {
    return this.current;
  }
  playing(): boolean {
    return this.isPlaying;
  }
  paused(): boolean {
    return !!this.current && this.el.paused;
  }

  private readonly listeners: Array<() => void> = [];
  onChange(l: () => void): void {
    this.listeners.push(l);
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }
}

/** Sekunden → "−M:SS"-Form (Restzeit-Anzeige). */
export function formatRemaining(remainingSec: number): string {
  if (!isFinite(remainingSec) || remainingSec < 0) return "";
  const s = Math.floor(remainingSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `−${m}:${r.toString().padStart(2, "0")}`;
}
