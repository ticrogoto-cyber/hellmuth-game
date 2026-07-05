// Explosions-Vertrag (Solutions §5.1), eins-zu-eins uebernommen, nur in
// HELLMUTH-Typen + lowercase_snake_case. VFX/SFX/Damage sind reine Hooks/Daten;
// die Knockback-Schicht liest nur `origin`, `inner/outerRadius`, `falloff`,
// `knockback`, die Lifecycle-Felder und die Filter. Damage selbst loest ein
// anderes System aus (Naht: combat_system) -- hier nur der Vertrag.

import type { FactionId } from "../../data/loader";
import type { FalloffShape } from "./falloff";

export interface Vec2 {
  x: number;
  y: number;
}

export type DamageType = "kinetic" | "fire" | "viral" | "toxic" | "pure";

export enum ExplosionTrigger {
  PROJECTILE_IMPACT = "projectile",
  SELF_DESTRUCT = "selfdestruct",
  ABILITY_CASTER = "ability_self",
  ABILITY_TARGETED = "ability_target",
  DEATH_RATTLE = "death",
  WORLD_EVENT = "scripted",
  CHAIN_REACTION = "chain",
}

export type ExplosionState = "SPAWNED" | "ARMED" | "RESOLVING" | "DEAD";

/** Bitmaske, welche Ziel-Klassen die Explosion erfasst. */
export const TargetMask = {
  GROUND: 1 << 0,
  AIR: 1 << 1,
  BUILDING: 1 << 2,
  SELF: 1 << 3,
} as const;
export type TargetMask = number;

export interface ExplosionStage {
  offsetMs: number;
  offsetOrigin: Vec2;
  inheritSpec: Partial<ExplosionSpec>;
}

export interface ExplosionSpec {
  // Identitaet
  id: string;
  archetype: string;
  trigger: ExplosionTrigger;
  sourceEntityId: string | null;
  sourceFaction: FactionId | "neutral";

  // Raum
  origin: Vec2;
  followsSource: boolean;
  innerRadius: number; // Full-Effect-Zone in px
  outerRadius: number; // Wirkung faellt auf 0
  falloff: FalloffShape; // Default 'quadratic'

  // Schaden (Hook fuer combat; Knockback ignoriert das)
  damage: {
    amount: number;
    type: DamageType;
    pierce: boolean;
    armorIgnore: number; // 0..1
  };

  // Knockback (null fuer reine DoT-Pools)
  knockback: {
    peakForce: number; // Impuls am Epizentrum
    stunMs: number; // Default 0 (Stagger ist separat, vom Impuls abgeleitet)
    liftZ: number; // optisches Anheben fuer Fake-3D
  } | null;

  // Lebenszyklus
  delayMs: number; // Fuse
  durationMs: number; // 0 = instant, >0 = persistent (tickt)
  tickIntervalMs: number; // bei persistent
  state: ExplosionState;

  // Filter
  affects: TargetMask;
  factionRule: "all" | "enemies" | "allies" | "ignore-list";
  ignoreEntityIds: Set<string>;
  friendlyFireMultiplier: number;

  // Mehrstufig (Cluster / Ringsequenz)
  stages: ExplosionStage[];
  currentStage: number;

  // VFX/SFX-Hooks (entkoppelt von der Physik)
  vfxRef: string;
  sfxRef: string;
  cameraShake: { amplitude: number; durationMs: number } | null;
}

/** Bequemer Default-Builder: fuellt die Pflichtfelder mit sinnvollen Werten,
 *  damit Aufrufer (Demo, combat) nur die paar relevanten Felder setzen. */
export function makeExplosion(partial: Partial<ExplosionSpec> & { origin: Vec2 }): ExplosionSpec {
  return {
    id: partial.id ?? "explosion",
    archetype: partial.archetype ?? "frag",
    trigger: partial.trigger ?? ExplosionTrigger.PROJECTILE_IMPACT,
    sourceEntityId: partial.sourceEntityId ?? null,
    sourceFaction: partial.sourceFaction ?? "neutral",
    origin: partial.origin,
    followsSource: partial.followsSource ?? false,
    innerRadius: partial.innerRadius ?? 32,
    outerRadius: partial.outerRadius ?? 96,
    falloff: partial.falloff ?? "quadratic",
    damage: partial.damage ?? { amount: 0, type: "kinetic", pierce: false, armorIgnore: 0 },
    knockback: partial.knockback ?? { peakForce: 350, stunMs: 0, liftZ: 0 },
    delayMs: partial.delayMs ?? 0,
    durationMs: partial.durationMs ?? 0,
    tickIntervalMs: partial.tickIntervalMs ?? 0,
    state: partial.state ?? "SPAWNED",
    affects: partial.affects ?? TargetMask.GROUND,
    factionRule: partial.factionRule ?? "all",
    ignoreEntityIds: partial.ignoreEntityIds ?? new Set<string>(),
    friendlyFireMultiplier: partial.friendlyFireMultiplier ?? 1.0,
    stages: partial.stages ?? [],
    currentStage: partial.currentStage ?? 0,
    vfxRef: partial.vfxRef ?? "",
    sfxRef: partial.sfxRef ?? "",
    cameraShake: partial.cameraShake ?? null,
  };
}
