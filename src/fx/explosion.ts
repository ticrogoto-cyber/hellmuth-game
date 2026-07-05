import type Phaser from "phaser";
import type { FxService } from "./fx_service";
import type { FxOpts } from "./fx_types";
import { getFxSystem } from "../systems/fx";
import { getBloodSystem } from "../systems/blood_system";
import { getDebrisSystem } from "../systems/debris_system";
import { DEBRIS } from "../data/balance";
import { PALETTE } from "./palette";
import { addTrauma } from "./shake";
import type { AudioManager } from "../audio/audio_manager";

// EXPLOSIONEN & ZAUBER-FX (Paket C). Eine Explosion ist ein Komposit kurzlebiger,
// ZEITVERSETZTER Schichten (RA3/SAGE-FXList), kein Einzelclip. Die InitialDelay-
// Staffelung traegt die Wucht -- nicht alles auf t=0. Bis echte Sheets vorliegen,
// komponiert dieser Fallback die vorhandenen Primitive (flash/burst/smoke/scorch)
// mit Offsets. KANON: Mechanik-Huelle bauen, Inhalts-Slots leer lassen.

export type ExplosionRegister = "moderat" | "hellmuth" | "blood";

interface RegisterDef {
  flash: number; // Blitzfarbe
  fireball: number; // Feuerball-/Energiefarbe
  energyAdd: boolean; // ADD-Energie (HELLMUTH-Magie)
  debris: number; // Funken-/Schuttfarbe
  debrisCount: number;
  smokeColor: number;
  scorch: boolean;
}

// Register-Tabelle. Farben aus der Fraktionspalette (Ticro-Kanon); weitere
// Register/Farben jenseits der Palette sind Ticros offener Slot.
const REG: Record<"moderat" | "hellmuth", RegisterDef> = {
  // MODERAT mechanisch: Magenta-Blitz, oranger Feuerball, Stahlschutt, grauer Rauch.
  // Fraktionsfarben aus der FX-Palette; Feuerball/Rauch sind physikalische Toene.
  moderat: {
    flash: PALETTE.MAGENTA_GLOW,
    fireball: 0xff9a3a,
    energyAdd: false,
    debris: 0xffb070,
    debrisCount: 16,
    smokeColor: 0x6b6b6b,
    scorch: true,
  },
  // HELLMUTH magisch: Gold-Blitz, tuerkis Energie (ADD), wenig Schutt / VIEL Funken.
  hellmuth: {
    flash: PALETTE.GOLD_GLOW,
    fireball: 0x8ff0d4,
    energyAdd: true,
    debris: PALETTE.GOLD_HELL,
    debrisCount: 24,
    smokeColor: 0xa8c0b6,
    scorch: true,
  },
};

// Kalibrierung (RA3/SAGE-FXList-Startwerte; PIXELS_PER_TILE = 128).
const T_FLASH = 160;
const D_FIREBALL = 400;
const OFF_SMOKE = 80;
const OFF_SECONDARY = 120;
const OFF_SCORCH = 200;
const SCORCH_WORLD = 320; // ~2,5 Tiles
const SCORCH_TEX = 256;
const LOD_CAP = 40; // reiche Explosionen pro Frame

// LOD-Drossel: pro Frame nur LOD_CAP volle Komposite; darueber nur die billigen
// Schichten (Flash + Funken), damit 300 Explosionen spielbar bleiben.
let lodFrame = -1;
let lodCount = 0;

function fireball(
  scene: Phaser.Scene,
  register: string,
  def: RegisterDef,
  x: number,
  y: number,
  scale: number,
): void {
  const key = `fx_explo_${register}`;
  if (scene.textures.exists(key)) {
    // Sheet vorhanden (Paket-A-S3-Player) -> abspielen.
    getFxSystem(scene).playFrames(x, y, key, 12, { scale: scale * 1.2, blendAdd: def.energyAdd, anchor: "center" });
    return;
  }
  // Fallback (heutiger Look): additiver, expandierender Glow als Feuerball.
  getFxSystem(scene).flash(x, y - 8, { color: def.fireball, scale: scale * 1.7, duration: D_FIREBALL });
}

/**
 * Explosions-Komposit. register waehlt die Schicht-Palette; opts.big schaltet
 * Shake + groessere Skala; opts.scale ueberschreibt die Groesse; opts.faction
 * geht an die blood-Nutzlast.
 */
export function explosion(
  scene: Phaser.Scene,
  x: number,
  y: number,
  register: ExplosionRegister,
  opts: FxOpts = {},
): void {
  const big = opts.big === true;
  const scale = typeof opts.scale === "number" ? opts.scale : big ? 1.4 : 0.9;

  // LOD-Frame-Drossel.
  const frame = scene.game.loop.frame;
  if (frame !== lodFrame) {
    lodFrame = frame;
    lodCount = 0;
  }
  const lite = lodCount >= LOD_CAP;
  lodCount++;

  const fx = getFxSystem(scene);

  // blood-Register (Naht zu Paket B): persistenter Blut-Stempel + Gibs, KEIN
  // Feuer/Scorch. Nutzlast des Blutexplosions-Zaubers.
  if (register === "blood") {
    fx.flash(x, y - 10, { color: 0x8a0f12, scale: scale * 0.8, duration: 170 });
    getBloodSystem(scene).bloodBurst(x, y, opts.faction, scale);
    // Blut-Ballistik: Tropfen im Bogen, persistente Lande-Marken (Blut-Paket B).
    getDebrisSystem(scene).throwBlood(x, y, opts.faction, DEBRIS.bloodCount);
    return;
  }

  const def = REG[register];

  // Wucht-Kopplung (Physik T1): Impact-Sound auf den Einschlag-Frame t=0 (nicht
  // den Clip-Anfang). Sub-Bass steckt vorgemischt im big-Asset; eine Voice pro
  // Explosion (Limiter kappt), big duckt die Musik (Kategorie building_death).
  const audio = scene.registry.get("audio") as AudioManager | undefined;
  audio?.playSet(big ? "impact.big" : "impact.small", { x, y, faction: opts.faction });

  // t=0: Blitz, Feuerball, Schutt(-Funken), Shake (nur gross + nah).
  fx.flash(x, y - 10, { color: def.flash, scale: scale * 1.3, duration: T_FLASH });
  fireball(scene, register, def, x, y, scale);
  fx.burst(x, y - 8, { color: def.debris, count: lite ? 6 : def.debrisCount, speed: 150 * scale, scale: 1.2 * scale, duration: 520 });
  if (big && !lite && scene.cameras.main.worldView.contains(x, y)) {
    // Trauma-Klasse explosion_big (Code7 Tempo-Kalibrierung Paket 2). Loeste
    // frueher shakeCamera(0.006*scale, 220) aus (Phaser-Random-Kette); jetzt
    // dosiert klassenbasiert. Bei Gebaeude-Tod fuegt death_fx zusaetzlich
    // "building_died" (0.85) hinzu -> Summe ~1.0 (HQ-Voll-Peak).
    addTrauma(scene, "explosion_big");
  }
  // Paket D: wenige grosse Hero-Chunks (getunte Wurfparabel) nur bei grossen
  // Explosionen; der ballistische Klein-Schutt steckt schon im burst() oben.
  if (big && !lite) getDebrisSystem(scene).throw(x, y, register, DEBRIS.heroChunks);

  if (lite) return; // LOD: nur die billigen Schichten

  // t=+80 ms: Rauch (ueberlebt ~2 s), NORMAL, geordnet abgeraeumt. Maessige Groesse,
  // damit er die hellen Schichten nicht zudeckt.
  scene.time.delayedCall(OFF_SMOKE, () => {
    const em = fx.smoke(x, y - 6, { color: def.smokeColor, scale: scale * 0.55, rise: -24, frequency: 150 });
    fx.releaseSmoke(em, 360);
  });
  // t=+120 ms: Sekundaer-Blitz.
  scene.time.delayedCall(OFF_SECONDARY, () => fx.flash(x, y - 14, { color: def.flash, scale: scale * 0.7, duration: 150 }));
  // t=+200 ms: Scorch (bleibt; in die Boden-RT gestempelt). Groesse aus dem
  // Scorch-Anker (~2,5 Tiles), entkoppelt von der visuellen Explosions-Skala.
  if (def.scorch) {
    const scorchScale = (SCORCH_WORLD / SCORCH_TEX) * (big ? 1.8 : 1.0);
    scene.time.delayedCall(OFF_SCORCH, () => getBloodSystem(scene).stampScorch(x, y, scorchScale));
  }
}

/** Registriert den "explosion"-Handler am Dispatcher (Naht: fx.spawn/fx.explosion). */
export function registerExplosionFx(fx: FxService): void {
  // LOD-Drossel-Zustand je Scene-Installation zuruecksetzen (Konsistenz mit dem
  // Reset-Muster der uebrigen FX-Module; der Frame-Zaehler selbst ist game-global).
  lodFrame = -1;
  lodCount = 0;
  fx.register("explosion", (ctx, x, y, o: FxOpts) => {
    const reg = o.register;
    const r: ExplosionRegister = reg === "hellmuth" ? "hellmuth" : reg === "blood" ? "blood" : "moderat";
    explosion(ctx.scene, x, y, r, o);
  });
}
