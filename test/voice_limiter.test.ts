// Phaser-freier Test des Voice-Limiters. Laeuft ohne Framework ueber Nodes
// Type-Stripping:  node --experimental-strip-types test/voice_limiter.test.ts
// (siehe package.json -> "test:audio").

import assert from "node:assert/strict";
import { VoiceLimiter, DEFAULT_CONFIG, KATEGORIEN } from "../src/audio/voice_limiter.ts";
import type { Kategorie, VoiceRequest } from "../src/audio/voice_limiter.ts";

let geprueft = 0;
function pruefe(name: string, fn: () => void): void {
  fn();
  geprueft++;
  console.log("  ok  " + name);
}

// 1. DEDUP: 50 Treffer gleicher Kategorie+Fraktion im selben Frame -> 1 zulaessig.
pruefe("Dedup kollabiert 50 gleiche Treffer auf 1", () => {
  const L = new VoiceLimiter();
  let zugelassen = 0;
  for (let i = 0; i < 50; i++) {
    if (!L.istDuplikat("hit_melee", "hellmuth", 1000)) zugelassen++;
  }
  assert.equal(zugelassen, 1);
});

pruefe("Dedup-Fenster laeuft ab", () => {
  const L = new VoiceLimiter();
  assert.equal(L.istDuplikat("hit_melee", "hellmuth", 1000), false); // erster
  assert.equal(L.istDuplikat("hit_melee", "hellmuth", 1030), true); // < 60 ms
  assert.equal(L.istDuplikat("hit_melee", "hellmuth", 1100), false); // > 60 ms
});

pruefe("building_death hat kein Dedup (Fenster 0)", () => {
  const L = new VoiceLimiter();
  assert.equal(L.istDuplikat("building_death", "moderat", 1000), false);
  assert.equal(L.istDuplikat("building_death", "moderat", 1000), false);
});

pruefe("verschiedene Fraktionen sind getrennt", () => {
  const L = new VoiceLimiter();
  assert.equal(L.istDuplikat("hit_melee", "hellmuth", 1000), false);
  assert.equal(L.istDuplikat("hit_melee", "moderat", 1000), false); // andere Fraktion
});

// 2. CAPS: Kategorie haelt ihre Obergrenze; leiser Neuer wird verworfen,
//    lauterer stiehlt.
pruefe("Kategorie-Cap haelt; leiser faellt, lauter stiehlt", () => {
  const L = new VoiceLimiter();
  const cap = DEFAULT_CONFIG.caps.hit_melee;
  for (let i = 0; i < cap; i++) {
    const req: VoiceRequest = { kategorie: "hit_melee", faction: "f" + i, prox: 0.5, imp: 0.4, nowMs: 0 };
    const d = L.pruefe(req);
    assert.ok(d.admit);
    L.registriere(i, req);
  }
  assert.equal(L.anzahlKat("hit_melee"), cap);

  const leise: VoiceRequest = { kategorie: "hit_melee", faction: "x", prox: 0.05, imp: 0.05, nowMs: 0 };
  assert.equal(L.pruefe(leise).admit, false);

  const laut: VoiceRequest = { kategorie: "hit_melee", faction: "y", prox: 1, imp: 1, nowMs: 0 };
  const d = L.pruefe(laut);
  assert.ok(d.admit);
  assert.ok(d.stealId !== undefined);
});

// 3. GLOBAL-HARD-CAP: nie mehr aktive Voices als das globale Limit.
pruefe("Global-Cap bindet (custom global=5)", () => {
  const L = new VoiceLimiter({ global: 5 });
  let id = 0;
  for (let i = 0; i < 100; i++) {
    const req: VoiceRequest = {
      kategorie: KATEGORIEN[i % KATEGORIEN.length] as Kategorie,
      faction: "f" + i,
      prox: 0.5,
      imp: 0.5,
      nowMs: 0,
    };
    const d = L.pruefe(req);
    if (!d.admit) continue;
    if (d.stealId !== undefined) L.entferne(d.stealId);
    L.registriere(id++, req);
  }
  assert.ok(L.anzahl() <= 5, `total ${L.anzahl()} <= 5`);
});

// 4. ABNAHME-FALL: 300 gleichzeitige Treffer (eindeutige Fraktionen, kein Dedup)
//    -> aktive Voices <= 48 (Summe der Caps bindet sogar frueher).
pruefe("300 gleichzeitige Ausloeser -> aktive Voices <= 48", () => {
  const L = new VoiceLimiter();
  const events: Kategorie[] = ["hit_melee", "hit_ranged", "unit_death", "building_death", "ui"];
  let id = 0;
  for (let i = 0; i < 300; i++) {
    const req: VoiceRequest = {
      kategorie: events[i % events.length],
      faction: "f" + i, // eindeutig -> Dedup greift nicht
      prox: Math.random(),
      imp: Math.random(),
      nowMs: 0,
    };
    const d = L.pruefe(req);
    if (!d.admit) continue;
    if (d.stealId !== undefined) L.entferne(d.stealId);
    L.registriere(id++, req);
  }
  assert.ok(L.anzahl() <= DEFAULT_CONFIG.global, `total ${L.anzahl()} <= ${DEFAULT_CONFIG.global}`);
  for (const k of events) {
    assert.ok(L.anzahlKat(k) <= DEFAULT_CONFIG.caps[k], `${k} <= cap`);
  }
});

// 5. PRIORITAET: building_death rangiert ueber hit_melee bei gleichem Rest.
pruefe("Prioritaet: building_death > hit_melee", () => {
  const L = new VoiceLimiter();
  const a = L.prioritaet("building_death", 0.5, 0.5, 0);
  const b = L.prioritaet("hit_melee", 0.5, 0.5, 0);
  assert.ok(a > b, `${a} > ${b}`);
});

console.log(`\nvoice_limiter: ${geprueft} Tests gruen.`);
