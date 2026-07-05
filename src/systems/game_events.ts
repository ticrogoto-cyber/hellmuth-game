// Gameplay-Ereignisnamen fuer additive Taps (Audio, spaeter ggf. VFX/Telemetrie).
// Reine String-Konstanten, keine Audio-Abhaengigkeit. Emittiert auf der
// GameScene (this.events); Konsumenten abonnieren ueber den Audio-Binding-Layer.
//
// Bestehende Ereignisse leben woanders und bleiben dort: Kampf/Tod in
// systems/death_fx.ts (fx.*), UI-Befehle in ui/ui_events.ts (ui:*).

/** Spieler-Auswahl bestaetigt. Payload: { count, faction }. */
export const EVT_UNITS_SELECTED = "sel.units_selected";

/** Bewegungs-/Angriffsbefehl erteilt. Payload: { x, y, faction }. */
export const EVT_COMMAND_MOVE = "sel.command_move";

/** Einheit fertig produziert und gespawnt. Payload: { x, y, faction, unitType }. */
export const EVT_UNIT_READY = "prod.unit_ready";

/** Match begonnen. Kein Payload. */
export const EVT_MATCH_START = "state.match_start";

/** Sieg. Kein Payload. */
export const EVT_VICTORY = "state.victory";

/** Niederlage. Kein Payload. */
export const EVT_DEFEAT = "state.defeat";

/** Biom betreten (Ambience-System, Paket C). Payload: { biome }. */
export const EVT_BIOME_ENTERED = "biome.entered";
