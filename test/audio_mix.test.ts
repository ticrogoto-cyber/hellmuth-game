// Phaser-freier Test der Mix-/Raum-Schicht (Paket B): Ducking-Refcount +
// Tiefste-Senkung-gewinnt, und die UI-Schutz-Regel im Voice-Limiter.
//   node --experimental-strip-types test/audio_mix.test.ts

import assert from "node:assert/strict";
import { DuckController } from "../src/audio/audio_ducking.ts";
import type { DuckSink } from "../src/audio/audio_ducking.ts";
import { VoiceLimiter } from "../src/audio/voice_limiter.ts";
import type { VoiceRequest } from "../src/audio/voice_limiter.ts";

let geprueft = 0;
function pruefe(name: string, fn: () => void): void {
  fn();
  geprueft++;
  console.log("  ok  " + name);
}

const dbToLin = (db: number): number => Math.pow(10, db / 20);
const nahe = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;

function fakeSink(): { sink: DuckSink; gainOf: (bus: string) => number } {
  const letzte = new Map<string, number>();
  return {
    sink: { duckBus: (bus, gain) => letzte.set(bus, gain) },
    gainOf: (bus) => letzte.get(bus) ?? 1,
  };
}

pruefe("Stimme duckt Musik -9 dB und Ambience -6 dB", () => {
  const f = fakeSink();
  const d = new DuckController(f.sink);
  d.engage("stimme", "ui");
  assert.ok(nahe(f.gainOf("musik"), dbToLin(-9)), `musik ${f.gainOf("musik")}`);
  assert.ok(nahe(f.gainOf("ambience"), dbToLin(-6)), `ambience ${f.gainOf("ambience")}`);
  assert.equal(d.appliedDbOf("musik"), -9);
});

pruefe("Release stellt den Bus zurueck (Refcount)", () => {
  const f = fakeSink();
  const d = new DuckController(f.sink);
  d.engage("stimme", "ui");
  d.engage("stimme", "ui"); // zweite Stimme
  d.release("stimme", "ui"); // noch eine aktiv
  assert.ok(nahe(f.gainOf("musik"), dbToLin(-9)), "noch geduckt");
  d.release("stimme", "ui"); // letzte weg
  assert.ok(nahe(f.gainOf("musik"), 1), `zurueck auf 1, ist ${f.gainOf("musik")}`);
  assert.equal(d.appliedDbOf("musik"), 0);
});

pruefe("Tiefste Senkung gewinnt (kein Stapeln)", () => {
  const f = fakeSink();
  const d = new DuckController(f.sink);
  // Kampf duckt Ambience -5; Stimme duckt Ambience -6. Beide aktiv -> -6.
  d.engage("sfx", "hit_melee"); // combat>ambient -5
  assert.equal(d.appliedDbOf("ambience"), -5);
  d.engage("stimme", "ui"); // voice>ambient -6 (tiefer)
  assert.equal(d.appliedDbOf("ambience"), -6);
  d.release("stimme", "ui"); // zurueck auf -5 (Kampf noch aktiv)
  assert.equal(d.appliedDbOf("ambience"), -5);
});

pruefe("Voice-Limiter: UI wird beim globalen Stealing NICHT gestohlen", () => {
  const L = new VoiceLimiter({ global: 3 });
  const ui: VoiceRequest = { kategorie: "ui", faction: "u", prox: 0.9, imp: 0.9, nowMs: 0 };
  L.registriere(100, ui);
  const a: VoiceRequest = { kategorie: "hit_melee", faction: "a", prox: 0.5, imp: 0.5, nowMs: 0 };
  const b: VoiceRequest = { kategorie: "hit_melee", faction: "b", prox: 0.5, imp: 0.5, nowMs: 0 };
  L.registriere(1, a);
  L.registriere(2, b);
  assert.equal(L.anzahl(), 3); // global voll

  const neu: VoiceRequest = { kategorie: "hit_melee", faction: "c", prox: 1, imp: 1, nowMs: 0 };
  const d = L.pruefe(neu);
  assert.ok(d.admit);
  assert.notEqual(d.stealId, 100); // niemals die UI-Voice
  assert.ok(d.stealId === 1 || d.stealId === 2);
});

console.log(`\naudio_mix: ${geprueft} Tests gruen.`);
