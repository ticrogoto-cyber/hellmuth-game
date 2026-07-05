import type Phaser from "phaser";
import type { FactionId } from "../data/loader";
import type { FxPool } from "./fx_pool";

// Vertrag des Effekt-Diensts. Der Dienst kennt NUR diese Typen, nie die konkrete
// Technik eines Effekts. Welche Technik je Effekt richtig ist (3D-Bake-zu-Sheet,
// handgemaltes Sheet, Phaser-Partikel oder additiver Glow), entscheidet der
// jeweilige Handler, der sich spaeter ueber FxService.register() einsteckt.

/**
 * Optionssack fuer einen Spawn. Bewusst offen: die generischen Felder versteht
 * jeder Handler, alles Weitere ist handler-spezifisch und wird erst scharf, wenn
 * die Effekt-Pakete einstecken.
 */
export interface FxOpts {
  /** Tint/Fraktionsfarbe, 0xRRGGBB. */
  color?: number;
  /** Groessenfaktor (1 = nativ). */
  scale?: number;
  /** Lebensdauer in ms. */
  duration?: number;
  /** Render-Tiefe; Default leitet der Dienst aus der Welt-y ab (depth = y + LIFT). */
  depth?: number;
  /** Fraktion fuer fraktionsabhaengige Faerbung. */
  faction?: FactionId;
  /** Ausrichtung in Radiant. */
  rotation?: number;
  /** Handler-spezifische Extras (Anzahl, Geschwindigkeit, Sheet-Key ...). */
  [key: string]: unknown;
}

/**
 * Per-Frame-Treiber fuer animierte oder lebensdauer-behaftete Effekte. Liefert
 * `false`, sobald der Effekt fertig ist; der Dienst raeumt ihn dann ab. Reine
 * Fire-and-forget-Effekte (Tween/Partikel mit Selbstzerstoerung) brauchen keinen
 * Treiber.
 */
export type FxDriver = (deltaMs: number) => boolean;

/**
 * Kontext, den jeder Handler beim Spawn erhaelt. Technik-agnostisch: der Handler
 * entscheidet selbst, ob er das Pooling nutzt und ob er einen Treiber registriert.
 */
export interface FxContext {
  readonly scene: Phaser.Scene;
  readonly pool: FxPool;
  /** Sortier-Konvention: depth = y; Effekte liegen ueber den Einheiten (+ LIFT). */
  depthFor(y: number): number;
  /** Registriert einen per-Frame-Treiber; der Dienst tickt ihn bis `false`. */
  drive(driver: FxDriver): void;
}

/**
 * Ein Handler erzeugt genau einen Effekt-Typ an Weltkoordinate (x, y). Steckt
 * spaeter ein; der Dienst ruft ihn ueber spawn(type, ...) auf.
 */
export type FxHandler = (ctx: FxContext, x: number, y: number, opts: FxOpts) => void;
