import Phaser from "phaser";
import { FxSystem, getFxSystem, CORPSE_LINGER_MS } from "./fx";
import { getBloodSystem } from "./blood_system";
import { getWoundSystem } from "./wound_trail_system";
import { getDebrisSystem } from "./debris_system";
import { explosion } from "../fx/explosion";
import { getFx } from "../fx";
import { hitStopStruck, deathFreezeMs } from "../fx/impact";
import { DEBRIS } from "../data/balance";
import { PALETTE } from "../fx/palette";
import { addTrauma } from "../fx/shake";
import type { FactionId } from "../data/loader";
import { DEATH_FRAME_MS } from "../util/unit_anim";

// Event-getriebener Tod-/Treffer-FX-Layer (Freigabe 11.06., Leitplanke):
// combat.kill() bleibt semantisch unangetastet, die Einheit verlaesst den State
// sofort. Im Kill-/Treffer-Pfad werden NUR Ereignisse emittiert; dieser Layer
// hoert darauf und erzeugt reine Darstellung (Leiche, Flash, Shockwave). Die
// Leiche existiert fuer kein System ausser dem Renderer -- kein Eingriff in
// Kampflogik, Kollision oder Pfadfindung.

export const EVT_UNIT_HIT = "fx.unit_hit";
export const EVT_UNIT_DIED = "fx.unit_died";
export const EVT_BUILDING_DIED = "fx.building_died";
/** MODERAT-Parasit-Drop beim Toeten (Destillat-System). Payload fuer Code4-VFX
 *  + Code5-Audio: {x, y, amount, killerFaction}. Gefeuert im Sim-Pfad (combat). */
export const EVT_DESTILLAT_DROPPED = "fx.destillat_dropped";
export interface DestillatDropEvent {
  x: number;
  y: number;
  amount: number;
  killerFaction: FactionId;
}

/** HELLMUTH-Destille produziert ein Destillat (autonom, alle 5 s je Destille).
 *  Payload: {x, y, faction} je Destille -- Code5 spielt den Tropfen-Sound
 *  raeumlich verortet (Audio-Naht; ein VFX-Listener kann spaeter andocken).
 *  Gefeuert im Sim-Pfad (destille_production). */
export const EVT_DESTILLAT_PRODUCED = "fx.destillat_produced";
export interface DestillatProducedEvent {
  x: number;
  y: number;
  faction: FactionId;
}

/** Treffer-Schwere (Physik A1): leichte vs. schwere Waffe/Einheit. Steuert
 *  Blut-/Funken-Skala und die Hit-Stop-Dauer (Code7). */
export type HitSeverity = "light" | "heavy";
/** Tod-Tiering (Physik A2), aus `role` abgeleitet: Schwarm/Arbeiter, teuer/stark,
 *  Held. Steuert Truemmer-Anzahl/Wucht (Code7). */
export type DeathTier = "mass" | "strong" | "hero";

export interface HitEvent {
  x: number;
  y: number;
  faction?: FactionId;
  /** Angreiferposition (dynamics-Kopplung). Setzt die Spritzrichtung; fehlt sie,
   *  spritzt das Blut nach oben (Aufwaerts-Degradation). */
  ax?: number;
  ay?: number;
  /** Treffer-Schwere (A1): skaliert Blut/Funken, speist den Hit-Stop. */
  sev?: HitSeverity;
}

/** Momentaufnahme einer sterbenden Einheit/eines Gebaeudes fuer Leiche/Einsturz. */
export interface DeathSnapshot {
  x: number;
  y: number;
  faction?: FactionId;
  /** Einheitentyp (typeId), fuer typabhaengige Konsumenten (z. B. Tod-Barks). */
  unitType?: string;
  /** Atlas-Texturschluessel + letzter Frame (eingefroren), falls vorhanden. */
  key?: string;
  frame?: string;
  sx?: number;
  sy?: number;
  /** Death-Clip-Wiedergabe (dynamics-Timing): Atlas-Stamm, Blickrichtung (Grad), Fussanker. */
  deathStem?: string;
  deathDeg?: number;
  originY?: number;
  /** Tod-Tiering (A2): Truemmer-Anzahl/Wucht (Einheiten). */
  sev?: DeathTier;
  /** Grundflaeche (A2, nur Gebaeude): Einsturz-Stauchen + Truemmer-Menge. */
  footprint?: { w: number; h: number };
}

// Flash-/Burst-Farbe je Fraktion (HELLMUTH gold-weiss, MODERAT magenta),
// aus der zentralen FX-Palette (Paket 1).
function factionColor(f?: FactionId): number {
  return f === "moderat" ? PALETTE.MAGENTA_GLOW : PALETTE.GOLD_WEISS;
}

/**
 * Haengt den Tod-/Treffer-FX-Layer an die Scene. Abonniert die Kill-/Treffer-
 * Ereignisse, raeumt beim Scene-Shutdown auf. Vorerst mit den prozeduralen
 * Primitiven (flash/shockwave); playFrames wird scharf, sobald die abgenommenen
 * Effekt-Frames im Repo liegen.
 */
// Per-Scene-Idempotenz wie die getXxxSystem-Singletons: verhindert doppelte
// Event-Registrierung bei einem Scene-Restart oder versehentlichem Doppelaufruf
// (sonst feuern Tod-/Treffer-FX mehrfach). installDeathFx war bisher als einziger
// Installer ungeschuetzt.
const deathFxInstalled = new WeakMap<Phaser.Scene, true>();

export function installDeathFx(scene: Phaser.Scene): void {
  if (deathFxInstalled.get(scene)) return;
  deathFxInstalled.set(scene, true);
  const fx = getFxSystem(scene);
  const blood = getBloodSystem(scene);
  // Verletzungs-Blutspur-System anstossen (self-tickend ueber gameState.units).
  getWoundSystem(scene);

  const debris = getDebrisSystem(scene);
  const debrisFaction = (f?: FactionId): "hellmuth" | "moderat" => (f === "hellmuth" ? "hellmuth" : "moderat");

  const onHit = (e: HitEvent): void => {
    // Trauma-Zufuhr Klasse unit_hit (0.03): grosses Volumen im Massengefecht,
    // kleiner Beitrag -> saettigt zum leichten Grundrauschen, kein Dauer-Peak.
    addTrauma(scene, "unit_hit");
    // Additiver Treffer-Funke (Impact-Flash, fraktionsfarbig) -- KEIN Blut.
    fx.flash(e.x, e.y - 16, { color: factionColor(e.faction), scale: 0.5, duration: 150 });
    // Gerichtete Spritz-Fontaene (NORMAL-Blut in Treffer-Richtung). ax/ay aus dem
    // HitEvent (A1); fehlt es, degradiert blood_splash nach oben. sev skaliert die Menge.
    const count = e.sev === "heavy" ? 16 : 10;
    getFx(scene)?.spawn("blood_splash", e.x, e.y, { faction: e.faction, ax: e.ax, ay: e.ay, count });
    // Physik §7: lokaler Hit-Stop am getroffenen Sprite, gestaffelt nach Schwere
    // (leicht 0 ms -> laeuft glatt, schwer ~45 ms -> kurzer Freeze). Rein lesend
    // aus gameState, kein Sim-Eingriff, nie globaler timeScale.
    hitStopStruck(scene, e.x, e.y, e.faction, e.sev);
  };

  const onUnitDied = (s: DeathSnapshot): void => {
    // Trauma-Zufuhr Klasse unit_died (0.10): einzelner Tod dosiert spuerbar,
    // grosse Serien saettigen zur trauma=1-Deckel, aber klingen weich ab.
    addTrauma(scene, "unit_died");
    const c = factionColor(s.faction);
    fx.shockwave(s.x, s.y, { color: c, scale: 1.4 });
    fx.flash(s.x, s.y - 16, { color: c, scale: 1.0 });
    fx.burst(s.x, s.y - 14, { color: c, count: 9, speed: 95 });
    // Todespfuetze (Stufe 1) + ~20 % bleibende Spur (Stufe 2). BLUT-KALIBRIERUNG
    // (CODE4 BLUT+MAGENTA Paket 1): statt EINEM grossen Puddle (scale 0.55 auf
    // 512er-Textur = ~2 Kacheln breit -> "Fussballplatz voller Blut") emittieren
    // wir 3..5 kleine Splatter-Marken in Fusspunkt-Naehe (halbe-Kachel-Bereich).
    // Alpha in stampWindowSlot ist auf ~1/3 abgesenkt; kein Voll-Alpha mehr.
    blood.stampKillSplatter(s.x, s.y, s.faction, 1.0);
    // Persistente Marke bleibt (aber ebenfalls mit dem neuen Splatter-Muster):
    // maybePersistKill wuerfelt intern 20 % Persist-Chance und ruft
    // stampPersistent -> stampPersistentSlot mit Slot 'puddle'. Wir reduzieren die
    // Groesse hier auf 0.10 des alten Werts, damit auch die persistente Marke die
    // spec-konforme Halbe-Kachel-Grenze respektiert.
    blood.maybePersistKill(s.x, s.y, s.faction, 0.06);
    // USP: nachpulsende Leiche (Herzschlag, klingt ab) -- Blut-Paket B.
    getFx(scene)?.spawn("corpse_pulse", s.x, s.y, { faction: s.faction });
    // Physik A3: Tod wirft Truemmer (Anzahl nach Tod-Tiering). Code7 baut die
    // Flug-/Roll-Physik (debris_system); Code3 loest hier nur aus.
    debris.throw(s.x, s.y, debrisFaction(s.faction), DEBRIS.deathChunks[s.sev ?? "mass"]);
    // dynamics-Timing: Todes-Clip einmal abspielen, dann Leiche. Faellt der Clip
    // aus (Platzhalter ohne Death-Frames), statische Leiche ueber spawnCorpse.
    if (!playDeathThenCorpse(scene, fx, s)) spawnCorpse(scene, fx, s);
  };

  const onBuildingDied = (s: DeathSnapshot): void => {
    // Trauma-Zufuhr Klasse building_died (0.85): fast Vollton bei einem einzelnen
    // HQ-Verlust; hier explizit VOR der Explosion, damit auch die Legacy-shake-
    // Bruecke ueber explosion.ts nicht mit einer separaten Klasse doppelt zufuegt.
    addTrauma(scene, "building_died");
    // Paket C: mehrschichtiges Explosions-Komposit mit Offsets (ersetzt die alte
    // Inline-Komposition bei t=0). Register nach Fraktion.
    const register = s.faction === "hellmuth" ? "hellmuth" : "moderat";
    explosion(scene, s.x, s.y, register, { big: true, faction: s.faction, scale: 2.2 });
    // MODERAT-Gebaeude sind mechanisch -> Ploerre/Schutt-Fleck, weltgenagelt.
    blood.stampPersistent(s.x, s.y, s.faction, 1.1);
    // Physik A3: Gebaeude-Einsturz wirft mehr Truemmer (Anzahl ~ Grundflaeche).
    const fp = s.footprint;
    const chunks = Math.min(16, DEBRIS.buildingChunks + (fp ? Math.floor((fp.w * fp.h) / 2) : 0));
    debris.throw(s.x, s.y, debrisFaction(s.faction), chunks);
  };

  scene.events.on(EVT_UNIT_HIT, onHit);
  scene.events.on(EVT_UNIT_DIED, onUnitDied);
  scene.events.on(EVT_BUILDING_DIED, onBuildingDied);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(EVT_UNIT_HIT, onHit);
    scene.events.off(EVT_UNIT_DIED, onUnitDied);
    scene.events.off(EVT_BUILDING_DIED, onBuildingDied);
    deathFxInstalled.delete(scene);
  });
}

function spawnCorpse(scene: Phaser.Scene, fx: FxSystem, s: DeathSnapshot): void {
  if (s.key && scene.textures.exists(s.key)) {
    const spr = scene.add
      .sprite(s.x, s.y, s.key, s.frame)
      .setOrigin(0.5, 1)
      .setDepth(s.y)
      .setTint(0x9a918a); // leicht entsaettigt/abgedunkelt
    if (s.sx != null) spr.setScale(s.sx, s.sy ?? s.sx);
    fx.corpse(spr, { x: s.x, y: s.y });
  } else {
    // Platzhalter-Einheiten (kein Atlas): dunkler Fleck als Leiche.
    const e = scene.add.ellipse(s.x, s.y - 6, 22, 12, 0x14110a, 0.5).setDepth(s.y);
    fx.corpse(e, { x: s.x, y: s.y });
  }
  // Wrack-/Blut-Abdruck, sobald die Leiche zu verblassen beginnt (schliesst das
  // Wrack-Decal-TODO): ein Bodenfleck bleibt, wo der Koerper lag.
  // Wrack-/Blut-Abdruck (BLUT-KALIBRIERUNG): war 0.5 -> ~2 Kacheln, jetzt 0.06
  // (~halbe Kachel), passt zum spec-konformen Splatter-Mass.
  scene.time.delayedCall(CORPSE_LINGER_MS, () => getBloodSystem(scene).stampWindow(s.x, s.y, s.faction, 0.06));
}

// --- dynamics-Timing aufgepfropft: Todes-Clip abspielen, dann Leiche ----------
// Traegt das WANN (Clip-Wiedergabe ueber DEATH_FRAME_MS); das vfx-Blut/corpse_pulse
// haengt in installDeathFx daran. Quelle: claude/dynamics death_fx.

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}
function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Spielt die Todesanimation der Einheit einmal ab und laesst dann die Leiche
 * liegen. Gibt false zurueck, wenn kein Death-Clip im Atlas liegt -- dann faellt
 * der Aufrufer auf das Standbild-Leichensprite (spawnCorpse) zurueck.
 */
function playDeathThenCorpse(scene: Phaser.Scene, fx: FxSystem, s: DeathSnapshot): boolean {
  if (!s.key || !s.deathStem || s.deathDeg == null || !scene.textures.exists(s.key)) {
    return false;
  }
  const tex = scene.textures.get(s.key);
  const prefix = `${s.deathStem}_death_${pad3(s.deathDeg)}_`;
  let n = 0;
  while (tex.has(`${prefix}${pad2(n)}`)) n++;
  if (n === 0) return false;

  const spr = scene.add
    .sprite(s.x, s.y, s.key, `${prefix}${pad2(0)}`)
    .setOrigin(0.5, s.originY ?? 1)
    .setDepth(s.y);
  if (s.sx != null) spr.setScale(s.sx, s.sy ?? s.sx);

  // Physik §7: Tod-Hit-Stop. Der Akteur = das Todes-Clip-Sprite; es haelt Frame 0
  // fuer die nach Tier gestaffelte Dauer (Held lang, Masse gar nicht), DANN spielt
  // der Clip. Reiner Engine-Timer, kein Sim-Eingriff.
  const freezeMs = deathFreezeMs(s.sev);
  let i = 0;
  const playClip = (): void => {
    scene.time.addEvent({
      delay: DEATH_FRAME_MS, // eine Wahrheit mit dem Animator
      repeat: n - 1,
      callback: () => {
        i++;
        spr.setFrame(`${prefix}${pad2(Math.min(i, n - 1))}`);
        if (i >= n - 1) {
          spr.setTint(0x9a918a); // entsaettigte/abgedunkelte Leiche
          fx.corpse(spr, { x: s.x, y: s.y });
        }
      },
    });
  };
  if (freezeMs > 0) scene.time.delayedCall(freezeMs, playClip);
  else playClip();
  return true;
}
