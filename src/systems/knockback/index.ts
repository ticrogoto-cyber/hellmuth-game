// Knockback-Schicht (Solutions-Spec, HELLMUTH-konform). Re-Exports fuer Aufrufer
// (Demo-Scene, spaeter combat_system als Lockstep-Naht). Reine FX/Bewegungs-
// Schicht: deterministisch (id-Jitter), Phaser-Physics-frei, eigenes SpatialGrid.
export { KnockbackSystem, DEFAULT_TUNING, initKbState } from "./knockback_system";
export type { KbBody, KbTuning, BlastDebug } from "./knockback_system";
export { MASS_TABLE, tierForRole, resolveMassTier } from "./mass_table";
export type { MassTier, MassEntry } from "./mass_table";
export { falloff } from "./falloff";
export type { FalloffShape } from "./falloff";
export { ExplosionTrigger, TargetMask, makeExplosion } from "./explosion_spec";
export type { ExplosionSpec, ExplosionStage, ExplosionState, DamageType, Vec2 } from "./explosion_spec";
