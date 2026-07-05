// Ducking (Strang 6). Senkt Ziel-Busse, solange Quell-Voices laufen -- ueber den
// busDuck-Gain (getrennt vom Slider-Gain busUser). Refcount je Regel, TIEFSTE
// Senkung gewinnt (kein Stapeln). Weich via setTargetAtTime, tau = ms/3000.
// Hart-Mute und Compressor-Sidechain verworfen (WebAudio hat keinen
// Sidechain-Eingang).
//
// Nur Typ-Importe -> dieses Modul laedt zur Laufzeit nichts Schweres und bleibt
// per Node-Type-Stripping testbar (siehe test/audio_mix.test.ts).

import type { BusId } from "./audio_manifest";
import type { Kategorie } from "./voice_limiter";

/** Minimaler Empfaenger der Duck-Automation (vom Backend erfuellt). */
export interface DuckSink {
  duckBus(bus: BusId, gain: number, tau: number): void;
}

export interface DuckRule {
  id: string;
  /** Quelle ueber Bus (z. B. alle Stimmen) ... */
  quelleBus?: BusId;
  /** ... oder ueber Kategorien (z. B. Kampf-SFX). */
  quelleKats?: Kategorie[];
  ziel: BusId;
  /** Senkung in dB (negativ). */
  db: number;
  attackMs: number;
  releaseMs: number;
}

// Duck-Tabelle (Paket B): tiefste Senkung je Ziel gewinnt.
export const DEFAULT_DUCKS: DuckRule[] = [
  { id: "voice>music", quelleBus: "stimme", ziel: "musik", db: -9, attackMs: 80, releaseMs: 350 },
  { id: "voice>ambient", quelleBus: "stimme", ziel: "ambience", db: -6, attackMs: 80, releaseMs: 350 },
  { id: "bigsfx>music", quelleKats: ["building_death"], ziel: "musik", db: -6, attackMs: 40, releaseMs: 300 },
  {
    id: "combat>ambient",
    quelleKats: ["hit_melee", "hit_ranged", "unit_death", "building_death", "combat_fx"],
    ziel: "ambience",
    db: -5,
    attackMs: 120,
    releaseMs: 600,
  },
];

const dbToLin = (db: number): number => Math.pow(10, db / 20);

export class DuckController {
  private readonly sink: DuckSink;
  private readonly rules: DuckRule[];
  private readonly refcount = new Map<string, number>();
  private readonly appliedDb = new Map<BusId, number>();

  constructor(sink: DuckSink, rules: DuckRule[] = DEFAULT_DUCKS) {
    this.sink = sink;
    this.rules = rules;
  }

  private passt(rule: DuckRule, bus: BusId, kat: Kategorie): boolean {
    if (rule.quelleBus && rule.quelleBus === bus) return true;
    if (rule.quelleKats && rule.quelleKats.includes(kat)) return true;
    return false;
  }

  /** Eine Quell-Voice hat begonnen. */
  engage(bus: BusId, kat: Kategorie): void {
    const ziele = new Set<BusId>();
    for (const r of this.rules) {
      if (!this.passt(r, bus, kat)) continue;
      this.refcount.set(r.id, (this.refcount.get(r.id) ?? 0) + 1);
      ziele.add(r.ziel);
    }
    for (const z of ziele) this.recompute(z);
  }

  /** Eine Quell-Voice ist beendet. */
  release(bus: BusId, kat: Kategorie): void {
    const ziele = new Set<BusId>();
    for (const r of this.rules) {
      if (!this.passt(r, bus, kat)) continue;
      this.refcount.set(r.id, Math.max(0, (this.refcount.get(r.id) ?? 0) - 1));
      ziele.add(r.ziel);
    }
    for (const z of ziele) this.recompute(z);
  }

  /** Aktuell angewandte Senkung eines Busses in dB (fuer Tests/Diagnose). */
  appliedDbOf(bus: BusId): number {
    return this.appliedDb.get(bus) ?? 0;
  }

  private recompute(ziel: BusId): void {
    const aktive = this.rules.filter((r) => r.ziel === ziel && (this.refcount.get(r.id) ?? 0) > 0);
    const neuDb = aktive.length > 0 ? Math.min(...aktive.map((r) => r.db)) : 0;
    const altDb = this.appliedDb.get(ziel) ?? 0;
    // Timing: vertieft sich die Senkung -> Attack der tiefsten aktiven Regel;
    // loest sie sich -> Release der repraesentativen Regel dieses Ziels.
    const taktgeber =
      aktive.length > 0
        ? aktive.reduce((a, b) => (b.db < a.db ? b : a))
        : this.rules.find((r) => r.ziel === ziel);
    if (!taktgeber) return;
    const tauMs = neuDb < altDb ? taktgeber.attackMs : taktgeber.releaseMs;
    this.appliedDb.set(ziel, neuDb);
    this.sink.duckBus(ziel, dbToLin(neuDb), tauMs / 3000);
  }
}
