// Ereignisnamen fuer die Kommunikation zwischen HUD-Scene und GameScene.
// Gesendet ueber den globalen Game-EventEmitter (this.game.events).

/** HUD bittet um Bauplatzierung. Payload: Gebaeudetyp-Id (string). */
export const UI_BUILD_REQUEST = "ui:build-request";

/** HUD bittet um Einheitenproduktion. Payload: Einheitentyp-Id (string). */
export const UI_PRODUCE_REQUEST = "ui:produce-request";

/** HUD bittet um Abbruch der gerade inspizierten Baustelle. Kein Payload. */
export const UI_BUILD_CANCEL = "ui:build-cancel";

/** HUD-Pause-Button umschalten. Kein Payload. */
export const UI_PAUSE_TOGGLE = "ui:pause-toggle";

/** HUD bittet um Storno eines Warteschlangen-Eintrags. Payload: Index (number). */
export const UI_QUEUE_CANCEL = "ui:queue-cancel";

/** Bau abgelehnt (Tech-Stufe/Limit). Payload: { typeId, reason }. Gefeuert auf
 *  game.events (gleicher Bus wie UI_BUILD_REQUEST). reason z. B.
 *  "destille_max_reached" | "destille_tier_too_low". */
export const EVT_BUILD_REJECTED = "ui:build-rejected";
export interface BuildRejectedEvent {
  typeId: string;
  reason: string;
}
