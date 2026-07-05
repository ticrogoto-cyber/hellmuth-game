// Voice-Limiter -- der Audio-Zwilling der VFX-LOD-Kappe. Phaser-frei und rein,
// damit er ohne Engine testbar ist (siehe voice_limiter.test.ts). Drei
// Mechanismen, in dieser Reihenfolge:
//
//   1. DEDUP VOR ALLOKATION (keyed category+faction): die Antwort auf
//      "50 Treffer in einem Frame -> 1-2 Sounds". Ein neuer Ausloeser innerhalb
//      des Dedup-Fensters seiner Kategorie wird verworfen, bevor irgendetwas
//      allokiert wird.
//   2. KATEGORIE-CAPS + GLOBAL-HARD-CAP: pro Kategorie eine Obergrenze, dazu ein
//      globales Hard-Cap (48). Schuetzt CPU und Mix.
//   3. VOICE-STEALING nach PRIORITAET: ist die Kategorie (oder global) voll,
//      stiehlt der Neue dem leisesten/aeltesten gleicher Kategorie den Platz --
//      aber nur, wenn er hoehere Prioritaet hat. Kein Virtual-Queue in V1.
//
// (Primaerquellen-belegt: SC2 versendet exakt dies als DupeMuteCount /
// DupeDestroyCount / ResourcePriority. Unterdimensionierte Voice-Caps waren die
// beruechtigten CoH/TA-Bugs -- hier die disziplinierte Fassung.)

export type Kategorie =
  | "hit_melee"
  | "hit_ranged"
  | "unit_death"
  | "building_death"
  | "building_idle"
  | "combat_fx"
  | "ui"
  | "music"
  | "ambient";

export const KATEGORIEN: readonly Kategorie[] = [
  "hit_melee",
  "hit_ranged",
  "unit_death",
  "building_death",
  "building_idle",
  "combat_fx",
  "ui",
  "music",
  "ambient",
];

export interface LimiterConfig {
  /** Max. gleichzeitige Voices je Kategorie. */
  caps: Record<Kategorie, number>;
  /** Globales Hard-Cap ueber alle Kategorien. */
  global: number;
  /** Dedup-Fenster je Kategorie in ms (0 = kein Dedup). */
  dedupMs: Record<Kategorie, number>;
  /** Kategorie-Prioritaetsgewicht 0..1 (der cat-Term in der Prioritaet). */
  katPrio: Record<Kategorie, number>;
  /** Alter, ab dem der age-Term saettigt (ms). */
  ageMaxMs: number;
  /** Geschuetzte Kategorien: nie als Opfer beim GLOBALEN Stealing (z. B. UI). */
  geschuetzt: Kategorie[];
}

export const DEFAULT_CONFIG: LimiterConfig = {
  caps: {
    hit_melee: 8,
    hit_ranged: 8,
    unit_death: 6,
    building_death: 3,
    // building_idle: ruhige periodische Gebaeude-Klaenge (Destille-Tropfen).
    // Klein, weil sie ohnehin selten und nicht zeitkritisch sind.
    building_idle: 4,
    // combat_fx: scharfe Drop-/Treffer-Effekte (Parasit-Saug). Wie hit_ranged.
    combat_fx: 8,
    ui: 4,
    music: 2,
    ambient: 4,
  },
  global: 48,
  dedupMs: {
    hit_melee: 60,
    hit_ranged: 60,
    unit_death: 90,
    building_death: 0,
    building_idle: 0,
    combat_fx: 50,
    ui: 40,
    music: 0,
    ambient: 0,
  },
  katPrio: {
    building_death: 1.0,
    unit_death: 0.75,
    ui: 0.7,
    music: 0.6,
    combat_fx: 0.5,
    hit_ranged: 0.45,
    hit_melee: 0.45,
    ambient: 0.35,
    building_idle: 0.3,
  },
  ageMaxMs: 4000,
  // UI-SFX sind die geschuetzte nicht-positionale Spur: eigener Cap, von
  // Kampf-Voices nicht stehlbar (Strang 6).
  geschuetzt: ["ui"],
};

/** Anfrage an den Limiter. prox/imp sind 0..1 (Manager berechnet sie). */
export interface VoiceRequest {
  kategorie: Kategorie;
  faction?: string;
  prox: number;
  imp: number;
  nowMs: number;
}

interface AktiveVoice {
  id: number;
  kategorie: Kategorie;
  faction?: string;
  startMs: number;
  prox: number;
  imp: number;
}

export interface AdmitDecision {
  /** true = abspielen. */
  admit: boolean;
  /** Wenn gesetzt: diese aktive Voice vorher stehlen (stoppen). */
  stealId?: number;
}

export class VoiceLimiter {
  private readonly cfg: LimiterConfig;
  private readonly geschuetztSet: Set<Kategorie>;
  private readonly aktive = new Map<number, AktiveVoice>();
  private readonly katZahl = new Map<Kategorie, number>();
  /** Letzter ZUGELASSENER Ausloeser je category+faction (fuer Dedup). */
  private readonly letzterTrigger = new Map<string, number>();

  constructor(cfg: Partial<LimiterConfig> = {}) {
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...cfg,
      caps: { ...DEFAULT_CONFIG.caps, ...cfg.caps },
      dedupMs: { ...DEFAULT_CONFIG.dedupMs, ...cfg.dedupMs },
      katPrio: { ...DEFAULT_CONFIG.katPrio, ...cfg.katPrio },
    };
    this.geschuetztSet = new Set(this.cfg.geschuetzt);
  }

  /**
   * Dedup VOR Allokation. true = Duplikat (verwerfen). Bei false wird der
   * Zeitstempel als letzter zugelassener Trigger vermerkt. building_death hat
   * Fenster 0 -> nie Duplikat.
   */
  istDuplikat(kategorie: Kategorie, faction: string | undefined, nowMs: number): boolean {
    const fenster = this.cfg.dedupMs[kategorie];
    if (fenster <= 0) return false;
    const key = kategorie + "|" + (faction ?? "");
    const letzte = this.letzterTrigger.get(key);
    if (letzte !== undefined && nowMs - letzte < fenster) return true;
    this.letzterTrigger.set(key, nowMs);
    return false;
  }

  /** Prioritaet: 4*cat + 3*prox + 2*imp - 1*age. */
  prioritaet(kategorie: Kategorie, prox: number, imp: number, ageMs: number): number {
    const cat = this.cfg.katPrio[kategorie] ?? 0.5;
    const age = Math.min(1, ageMs / this.cfg.ageMaxMs);
    return 4 * cat + 3 * prox + 2 * imp - 1 * age;
  }

  /**
   * Entscheidet ueber Zulassung. Kein Eintrag wird hier veraendert -- der
   * Aufrufer ruft bei admit `registriere` (und ggf. `entferne(stealId)`).
   */
  pruefe(req: VoiceRequest): AdmitDecision {
    const reqPrio = this.prioritaet(req.kategorie, req.prox, req.imp, 0);
    const katVoll = (this.katZahl.get(req.kategorie) ?? 0) >= this.cfg.caps[req.kategorie];
    const globalVoll = this.aktive.size >= this.cfg.global;

    if (!katVoll && !globalVoll) return { admit: true };

    // Opfer-Suche: bei voller Kategorie nur in dieser Kategorie, sonst global
    // (geschuetzte Kategorien wie UI sind dann nie Opfer).
    const kandidaten = katVoll
      ? [...this.aktive.values()].filter((v) => v.kategorie === req.kategorie)
      : [...this.aktive.values()].filter((v) => !this.geschuetztSet.has(v.kategorie));

    let opfer: AktiveVoice | undefined;
    let opferPrio = Infinity;
    for (const v of kandidaten) {
      const p = this.prioritaet(v.kategorie, v.prox, v.imp, req.nowMs - v.startMs);
      if (p < opferPrio || (p === opferPrio && opfer && v.startMs < opfer.startMs)) {
        opferPrio = p;
        opfer = v;
      }
    }

    if (opfer && reqPrio > opferPrio) return { admit: true, stealId: opfer.id };
    return { admit: false };
  }

  registriere(id: number, req: VoiceRequest): void {
    this.aktive.set(id, {
      id,
      kategorie: req.kategorie,
      faction: req.faction,
      startMs: req.nowMs,
      prox: req.prox,
      imp: req.imp,
    });
    this.katZahl.set(req.kategorie, (this.katZahl.get(req.kategorie) ?? 0) + 1);
  }

  entferne(id: number): void {
    const v = this.aktive.get(id);
    if (!v) return;
    this.aktive.delete(id);
    this.katZahl.set(v.kategorie, Math.max(0, (this.katZahl.get(v.kategorie) ?? 1) - 1));
  }

  anzahl(): number {
    return this.aktive.size;
  }

  anzahlKat(kategorie: Kategorie): number {
    return this.katZahl.get(kategorie) ?? 0;
  }

  stats(): { total: number; perKat: Record<string, number> } {
    const perKat: Record<string, number> = {};
    for (const kat of KATEGORIEN) perKat[kat] = this.katZahl.get(kat) ?? 0;
    return { total: this.aktive.size, perKat };
  }
}
