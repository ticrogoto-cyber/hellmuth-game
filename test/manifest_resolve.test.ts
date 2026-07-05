// Phaser-freier Test der Manifest-Aufloesung (Paket D): Format-Kette,
// EN-Referenz-Fallback, Sprite-Schluessel, Binding-Auswahl.
//   node --experimental-strip-types test/manifest_resolve.test.ts

import assert from "node:assert/strict";
import {
  audioUrls,
  fileCacheKey,
  fileKey,
  dateienFuerSprache,
  waehleSetKey,
  referenzVon,
} from "../src/audio/manifest_resolve.ts";
import type { AudioSet, AudioBinding, AudioManifest } from "../src/audio/manifest_resolve.ts";

let geprueft = 0;
function pruefe(name: string, fn: () => void): void {
  fn();
  geprueft++;
  console.log("  ok  " + name);
}

pruefe("Format-Kette ogg -> m4a -> mp3", () => {
  assert.deepEqual(audioUrls({ stem: "sfx/x" }), [
    "audio/sfx/x.ogg",
    "audio/sfx/x.m4a",
    "audio/sfx/x.mp3",
  ]);
  assert.deepEqual(audioUrls({ stem: "sfx/x", formats: ["ogg"] }), ["audio/sfx/x.ogg"]);
  assert.deepEqual(audioUrls({ sprite: "sheet", marker: "a" }), []); // Sprite -> ueber Sheet
});

pruefe("Cache- vs. Varianten-Schluessel (Sprite)", () => {
  assert.equal(fileCacheKey({ stem: "a" }), "a");
  assert.equal(fileCacheKey({ sprite: "sheet", marker: "befehl" }), "sheet");
  assert.equal(fileKey({ sprite: "sheet", marker: "befehl" }), "sheet#befehl");
  assert.equal(fileKey({ stem: "a" }), "a");
});

pruefe("Sprach-Fallback: aktiv -> Referenz(EN) -> neutral, sonst leer", () => {
  const v: AudioSet = {
    key: "v",
    bus: "stimme",
    files: [
      { stem: "a_de", lang: "de" },
      { stem: "a_en", lang: "en" },
      { stem: "a_ko", lang: "ko" },
    ],
  };
  assert.deepEqual(dateienFuerSprache(v, "ko", "en").map(fileKey), ["a_ko"]);
  assert.deepEqual(dateienFuerSprache(v, "zh", "en").map(fileKey), ["a_en"]); // EN-Referenz
  assert.deepEqual(dateienFuerSprache(v, "zh", "ja").map(fileKey), []); // weder zh noch ja -> Stille
});

pruefe("Sprachneutrale Sets bleiben unveraendert", () => {
  const sfx: AudioSet = { key: "s", bus: "sfx", files: [{ stem: "x" }, { stem: "y" }] };
  assert.deepEqual(dateienFuerSprache(sfx, "ko", "en").map(fileKey), ["x", "y"]);
});

pruefe("waehleSetKey: faction-Selektor, dann *, dann erstes", () => {
  const b: AudioBinding = {
    event: "e",
    pick: "faction",
    sets: { hellmuth: "setA", "*": "setB" },
  };
  assert.equal(waehleSetKey(b, { faction: "hellmuth" }), "setA");
  assert.equal(waehleSetKey(b, { faction: "moderat" }), "setB"); // Fallback *
  const f: AudioBinding = { event: "e", pick: "first", sets: { "*": "nur" } };
  assert.equal(waehleSetKey(f, {}), "nur");
});

pruefe("Referenzsprache: Default EN, sonst Manifest-Wert", () => {
  const ohne = { referenzSprache: undefined } as unknown as AudioManifest;
  assert.equal(referenzVon(ohne), "en");
  const mit = { referenzSprache: "ko" } as unknown as AudioManifest;
  assert.equal(referenzVon(mit), "ko");
});

console.log(`\nmanifest_resolve: ${geprueft} Tests gruen.`);
