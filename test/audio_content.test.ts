// Phaser-freier Test der Inhaltsschicht-Kerne (Paket C): Shuffle-Bag,
// Musik-Hysterese, Ambience-Hysterese, Bark-Entscheidung.
//   node --experimental-strip-types test/audio_content.test.ts

import assert from "node:assert/strict";
import { ShuffleBag } from "../src/audio/shuffle_bag.ts";
import { MusicKern } from "../src/audio/music_state.ts";
import { AmbienceKern } from "../src/audio/ambience_state.ts";
import { BarkKern } from "../src/audio/bark_state.ts";

let geprueft = 0;
function pruefe(name: string, fn: () => void): void {
  fn();
  geprueft++;
  console.log("  ok  " + name);
}

// --- Shuffle-Bag ----------------------------------------------------------

pruefe("Shuffle-Bag zieht jedes Element einmal, kein Sofort-Wiederholer", () => {
  const bag = new ShuffleBag(["a", "b", "c"], () => 0); // deterministisch
  const erst = [bag.zieh(), bag.zieh(), bag.zieh()];
  assert.equal(new Set(erst).size, 3); // alle drei genau einmal
  const naechste = bag.zieh();
  assert.notEqual(naechste, erst[2]); // kein Sofort-Wiederholer ueber die Grenze
});

pruefe("Shuffle-Bag mit einem Element liefert es immer", () => {
  const bag = new ShuffleBag(["x"]);
  assert.equal(bag.zieh(), "x");
  assert.equal(bag.zieh(), "x");
});

// --- Musik-Hysterese ------------------------------------------------------

pruefe("Musik: 2 Treffer -> combat, Hold 6 s, dann explore", () => {
  const m = new MusicKern();
  assert.equal(m.tick(0), "explore");
  m.registerHit(100);
  assert.equal(m.tick(100), "tension"); // 1 Treffer
  m.registerHit(150);
  assert.equal(m.tick(150), "combat"); // 2 Treffer im Fenster
  assert.equal(m.tick(2000), "combat"); // Hold (Treffer gepruned, combatBis aktiv)
  assert.equal(m.tick(6151), "explore"); // nach Hold (150 + 6000)
});

pruefe("Musik: einzelner Treffer loest kein Combat", () => {
  const m = new MusicKern();
  m.registerHit(0);
  assert.equal(m.tick(0), "tension");
  assert.equal(m.tick(1600), "explore"); // Treffer aus dem Fenster gefallen
});

pruefe("Musik: Terminal ueberschreibt alles", () => {
  const m = new MusicKern();
  m.setTerminal("victory");
  m.registerHit(0);
  m.registerHit(10);
  assert.equal(m.tick(10), "victory");
});

// --- Ambience-Hysterese ---------------------------------------------------

pruefe("Ambience: Erstbestimmung sofort, Wechsel erst nach 3 Polls >=60 %", () => {
  const a = new AmbienceKern();
  assert.deepEqual(a.poll({ steppe: 25 }), { changed: true, biome: "steppe" });
  assert.equal(a.poll({ sandlehm: 20, steppe: 5 }).changed, false); // 1
  assert.equal(a.poll({ sandlehm: 20, steppe: 5 }).changed, false); // 2
  const r = a.poll({ sandlehm: 20, steppe: 5 }); // 3
  assert.equal(r.changed, true);
  assert.equal(r.biome, "sandlehm");
});

pruefe("Ambience: unter 60 % kein Wechsel", () => {
  const a = new AmbienceKern();
  a.poll({ steppe: 10 });
  assert.equal(a.poll({ sandlehm: 5, steppe: 5 }).changed, false); // 50 %
  assert.equal(a.poll({ sandlehm: 5, steppe: 5 }).changed, false);
  assert.equal(a.poll({ sandlehm: 5, steppe: 5 }).changed, false);
});

pruefe("Ambience: Flackern an der Grenze loest keinen Wechsel", () => {
  const a = new AmbienceKern();
  a.poll({ steppe: 10 });
  a.poll({ sandlehm: 8, steppe: 2 }); // cand 1
  a.poll({ sandlehm: 8, steppe: 2 }); // cand 2
  assert.equal(a.poll({ steppe: 10 }).changed, false); // zurueck -> Reset
  a.poll({ sandlehm: 8, steppe: 2 }); // cand 1 (neu)
  assert.equal(a.poll({ sandlehm: 8, steppe: 2 }).changed, false); // erst cand 2
});

// --- Bark-Entscheidung ----------------------------------------------------

pruefe("Bark: Select-Cooldown 350 ms", () => {
  const b = new BarkKern();
  assert.equal(b.entscheide("select", 0).spiele, true);
  assert.equal(b.entscheide("select", 100).spiele, false); // < 350
  assert.equal(b.entscheide("select", 400).spiele, true); // > 350
});

pruefe("Bark: ab 6 Klicks im Fenster -> annoyed (feuert sofort)", () => {
  const b = new BarkKern();
  let letzte = b.entscheide("select", 0);
  for (let i = 1; i < 6; i++) letzte = b.entscheide("select", i * 50);
  assert.equal(letzte.kat, "annoyed");
  assert.equal(letzte.spiele, true);
});

pruefe("Bark: Befehl teilt Cooldown ueber move/attack", () => {
  const b = new BarkKern();
  assert.equal(b.entscheide("move", 0).spiele, true);
  assert.equal(b.entscheide("attack", 100).spiele, false); // Gruppe command, < 600
  assert.equal(b.entscheide("attack", 700).spiele, true);
});

pruefe("Bark: Interruption nach Prioritaet (Death > Befehl > Selektion)", () => {
  const b = new BarkKern();
  assert.equal(b.entscheide("move", 0).spiele, true); // prio 4 bis 1200
  assert.equal(b.entscheide("select", 10).spiele, false); // 3 < 4 unterdrueckt
  assert.equal(b.entscheide("death", 20).spiele, true); // 5 schneidet durch
});

console.log(`\naudio_content: ${geprueft} Tests gruen.`);
