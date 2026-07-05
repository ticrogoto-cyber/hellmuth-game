// Phaser-freier Test der Physik-Robustheit: Anti-Monotonie-Jitter,
// Decode-Robustheit (HEAD-Pruefung), Musik-Loop-Crossfade, Manifest-Validierung.
//   node --experimental-strip-types test/audio_robust.test.ts

import assert from "node:assert/strict";
import { jitter, istAudioAntwort, braucheLoopCrossfade } from "../src/audio/audio_util.ts";
import { validateManifest, dateienInSprache } from "../src/audio/manifest_resolve.ts";
import type { AudioManifest, AudioSet } from "../src/audio/manifest_resolve.ts";

let geprueft = 0;
function pruefe(name: string, fn: () => void): void {
  fn();
  geprueft++;
  console.log("  ok  " + name);
}

// --- T2: Jitter ----------------------------------------------------------

pruefe("Jitter: Pitch ±200 Cent, Volume ±1,5 dB in Grenzen", () => {
  const lo = jitter(() => 0);
  const hi = jitter(() => 1);
  assert.equal(lo.detuneCents, -200);
  assert.equal(hi.detuneCents, 200);
  assert.ok(lo.gainFaktor > 0.84 && lo.gainFaktor < 0.85, `${lo.gainFaktor}`);
  assert.ok(hi.gainFaktor > 1.18 && hi.gainFaktor < 1.19, `${hi.gainFaktor}`);
  const mid = jitter(() => 0.5);
  assert.equal(mid.detuneCents, 0);
  assert.ok(Math.abs(mid.gainFaktor - 1) < 1e-9);
});

// --- T3: Decode-Robustheit ----------------------------------------------

pruefe("istAudioAntwort: HTML/404 abweisen, echtes Audio zulassen", () => {
  assert.equal(istAudioAntwort(true, "audio/ogg"), true);
  assert.equal(istAudioAntwort(true, "application/ogg"), true);
  assert.equal(istAudioAntwort(true, null), true);
  assert.equal(istAudioAntwort(true, "text/html; charset=utf-8"), false); // SPA-Fallback
  assert.equal(istAudioAntwort(false, "audio/ogg"), false); // 404
});

// --- T3: Musik-Loop-Crossfade -------------------------------------------

pruefe("braucheLoopCrossfade: erst im Tail, nicht ohne Dauer", () => {
  assert.equal(braucheLoopCrossfade(9.7, 10, 0.4), true); // Restzeit < Tail
  assert.equal(braucheLoopCrossfade(5, 10, 0.4), false);
  assert.equal(braucheLoopCrossfade(5, 0, 0.4), false); // Dauer unbekannt -> kein Loop
  assert.equal(braucheLoopCrossfade(-1, 10, 0.4), false);
});

// --- T3: Manifest-Validierung -------------------------------------------

const ok: AudioManifest = {
  version: 2,
  sprachen: ["de", "en"],
  standardSprache: "de",
  referenzSprache: "en",
  sets: { a: { key: "a", bus: "sfx", kategorie: "hit_melee", files: [{ stem: "x" }] } },
  bindings: [{ event: "e", pick: "first", sets: { "*": "a" } }],
};

pruefe("validateManifest: sauberes Manifest -> keine Probleme", () => {
  assert.deepEqual(validateManifest(ok), []);
});

pruefe("validateManifest: Binding auf unbekanntes Set faellt auf", () => {
  const m: AudioManifest = { ...ok, bindings: [{ event: "e", pick: "first", sets: { "*": "fehlt" } }] };
  assert.ok(validateManifest(m).some((p) => p.includes("fehlt")));
});

pruefe("validateManifest: kaputte Sprite-Referenz faellt auf", () => {
  const m: AudioManifest = {
    ...ok,
    sets: { a: { key: "a", bus: "sfx", files: [{ sprite: "nope", marker: "m" }] } },
  };
  assert.ok(validateManifest(m).some((p) => p.includes("nope")));
});

pruefe("validateManifest: unbekannter Bus faellt auf", () => {
  const m = { ...ok, sets: { a: { key: "a", bus: "weird", files: [{ stem: "x" }] } } } as unknown as AudioManifest;
  assert.ok(validateManifest(m).some((p) => p.includes("Bus")));
});

// --- T3: Puffer-Fallback-Baustein ---------------------------------------

pruefe("dateienInSprache filtert die Referenzsprache (Puffer-Fallback)", () => {
  const set: AudioSet = {
    key: "v",
    bus: "stimme",
    files: [
      { stem: "a_de", lang: "de" },
      { stem: "a_en", lang: "en" },
    ],
  };
  assert.deepEqual(dateienInSprache(set, "en").map((f) => f.stem), ["a_en"]);
  assert.deepEqual(dateienInSprache(set, "ko").map((f) => f.stem), []);
});

console.log(`\naudio_robust: ${geprueft} Tests gruen.`);
