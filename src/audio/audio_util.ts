// Reine Audio-Hilfen (Physik-Paket): Phaser-frei/importfrei -> Node-testbar.
// Variation (Anti-Monotonie), Decode-Robustheit, Musik-Loop-Crossfade.

/** Pro-Instanz-Variation gegen Monotonie (Game-Feel). */
export interface Jitter {
  /** Pitch in Cent. */
  detuneCents: number;
  /** Linearer Lautstaerke-Faktor aus den dB-Grenzen. */
  gainFaktor: number;
}

/**
 * Erzeugt einen einzelnen Jitter-Wert. Default ±200 Cent / ±1,5 dB
 * (Combat-Vorgabe); per Set ueberschreibbar (z. B. ruhige Destille-Tropfen
 * ±100 Cent / ±1 dB).
 */
export function jitter(
  rng: () => number = Math.random,
  pitchCents = 200,
  dbRange = 1.5,
): Jitter {
  const detuneCents = (rng() * 2 - 1) * pitchCents;
  const db = (rng() * 2 - 1) * dbRange;
  return { detuneCents, gainFaktor: Math.pow(10, db / 20) };
}

/**
 * Ist die Antwort eine ECHTE Audiodatei? Fehlende Dateien liefern bei
 * SPA-Hosting `index.html` (200, text/html) statt 404 -- das wuerde Phaser als
 * Audio zu dekodieren versuchen (`Unable to decode audio data`-Spam). Nur laden,
 * wenn ok UND nicht text/html.
 */
export function istAudioAntwort(ok: boolean, contentType: string | null): boolean {
  if (!ok) return false;
  return !(contentType ?? "").toLowerCase().includes("text/html");
}

/**
 * Soll ein Musik-Track JETZT in den naechsten Loop-Durchlauf ueberblenden?
 * (Tail-Crossfade statt sample-genauem Loop -- MP3/OGG-Padding knackt.) Erst,
 * wenn die Restzeit unter `tailSec` faellt und die Dauer bekannt ist.
 */
export function braucheLoopCrossfade(position: number, dauer: number, tailSec: number): boolean {
  if (!(dauer > 0) || position < 0) return false;
  return position >= dauer - tailSec;
}
