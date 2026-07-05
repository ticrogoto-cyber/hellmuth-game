// Phaser-freier Test der Destillat-Sets (Code5): Bindings auf die richtigen
// Events, Kategorien (NICHT building_idle fuer drain -> Kritiker 2), Positions-
// Durchreichung via PlayCtx, optionale Slots, HEAD-Robustheit, Jitter-Tuning.
//   node --experimental-strip-types test/audio_destillat.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  audioUrls,
  bindingIndex,
  validateManifest,
  waehleSetKey,
} from "../src/audio/manifest_resolve.ts";
import type { AudioManifest } from "../src/audio/manifest_resolve.ts";
import { jitter, istAudioAntwort } from "../src/audio/audio_util.ts";
import { ctxAus } from "../src/audio/event_ctx.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(here, "..", "game", "data", "audio_manifest.json"), "utf8"),
) as AudioManifest;

let geprueft = 0;
function pruefe(name: string, fn: () => void): void {
  fn();
  geprueft++;
  console.log("  ok  " + name);
}

// Pflichtprobe 1: destille.drip triggert bei EVT_DESTILLAT_PRODUCED, raeumlich.
pruefe("Binding fx.destillat_produced -> destille.drip", () => {
  const b = bindingIndex(manifest).get("fx.destillat_produced");
  assert.ok(b, "Binding fx.destillat_produced fehlt");
  const setKey = waehleSetKey(b!, { faction: "hellmuth" });
  assert.equal(setKey, "destille.drip");
  const set = manifest.sets[setKey!];
  assert.equal(set.bus, "sfx");
  assert.equal(set.kategorie, "building_idle");
  // Räumliche Position kommt wirklich als PlayCtx an (nicht nur Binding):
  // EVT_DESTILLAT_PRODUCED-Payload {x,y,faction} -> ctx.
  const ctx = ctxAus({ x: 300, y: -120, faction: "hellmuth" });
  assert.equal(ctx.x, 300);
  assert.equal(ctx.y, -120);
  assert.equal(ctx.faction, "hellmuth");
});

// Pflichtprobe 2: parasit.drain triggert bei EVT_DESTILLAT_DROPPED, raeumlich.
// Kritiker 2: KATEGORIE combat_fx (nicht building_idle) -> richtiges Ducking.
pruefe("Binding fx.destillat_dropped -> parasit.drain (Kategorie combat_fx)", () => {
  const b = bindingIndex(manifest).get("fx.destillat_dropped");
  assert.ok(b, "Binding fx.destillat_dropped fehlt");
  const setKey = waehleSetKey(b!, {});
  assert.equal(setKey, "parasit.drain");
  const set = manifest.sets[setKey!];
  assert.equal(set.bus, "sfx");
  assert.equal(set.kategorie, "combat_fx");
  assert.notEqual(set.kategorie, "building_idle", "Kritiker 2: falsche Kategorie");
  // Räumliche Position + Fraktion kommen an: EVT_DESTILLAT_DROPPED trägt
  // killerFaction (nicht faction) -> ctxAus muss das auf ctx.faction abbilden,
  // sonst kollabiert der combat_fx-Dedup über beide Fronten.
  const ctx = ctxAus({ x: 64, y: 48, amount: 3, killerFaction: "moderat" });
  assert.equal(ctx.x, 64);
  assert.equal(ctx.y, 48);
  assert.equal(ctx.faction, "moderat");
});

// Pflichtprobe 3: Jitter-Bereiche eingehalten (drip sanfter, drain aggressiv).
pruefe("Jitter-Tuning: drip ±100/±1 dB, drain ±200/±1,5 dB", () => {
  const drip = manifest.sets["destille.drip"];
  const drain = manifest.sets["parasit.drain"];
  assert.equal(drip.jitterPitchCents, 100);
  assert.equal(drip.jitterDb, 1.0);
  assert.equal(drain.jitterPitchCents, 200);
  assert.equal(drain.jitterDb, 1.5);
  // Worst-case-Werte aus jitter() bestaetigen die Grenzen.
  const dlo = jitter(() => 0, drip.jitterPitchCents!, drip.jitterDb!);
  const dhi = jitter(() => 1, drip.jitterPitchCents!, drip.jitterDb!);
  assert.equal(dlo.detuneCents, -100);
  assert.equal(dhi.detuneCents, 100);
  const xlo = jitter(() => 0, drain.jitterPitchCents!, drain.jitterDb!);
  const xhi = jitter(() => 1, drain.jitterPitchCents!, drain.jitterDb!);
  assert.equal(xlo.detuneCents, -200);
  assert.equal(xhi.detuneCents, 200);
});

// Pflichtprobe 4: Manifest-Validierung kennt beide Sets, alle Slots optional;
// drei Varianten je Set (Anti-Monotonie wenn echte Assets kommen).
pruefe("Beide Sets optional, je drei Slots, Validator clean", () => {
  for (const k of ["destille.drip", "parasit.drain"]) {
    const set = manifest.sets[k];
    assert.ok(set, `Set ${k} fehlt`);
    assert.equal(set.optional, true, `${k}: nicht als optional markiert`);
    assert.equal(set.files.length, 3, `${k}: erwartet 3 Slots, hat ${set.files.length}`);
    for (const f of set.files) assert.ok(f.stem, `${k}: leerer Slot`);
  }
  // Kein neuer Validator-Befund durch die Erweiterung.
  assert.deepEqual(validateManifest(manifest), []);
});

// Pflichtprobe 5: HEAD-Probe weist HTML/404 sauber ab (kein Decode-Spam, wenn
// die Slots noch leer sind und der SPA-Host index.html mit 200 zurueckliefert).
pruefe("HEAD-Probe weist SPA-HTML auf den drip/drain-URLs ab", () => {
  const urls = [
    ...manifest.sets["destille.drip"].files.flatMap(audioUrls),
    ...manifest.sets["parasit.drain"].files.flatMap(audioUrls),
  ];
  assert.equal(urls.length, 18); // 2 Sets x 3 Slots x 3 Formate
  // Jede URL gelaeuft sich erwartungsgemaess durch den Loader: HTML-Antwort
  // ablehnen, echte Audio-Antwort zulassen, 404 ablehnen.
  for (const _url of urls) {
    assert.equal(istAudioAntwort(true, "text/html; charset=utf-8"), false);
    assert.equal(istAudioAntwort(false, "audio/ogg"), false);
    assert.equal(istAudioAntwort(true, "audio/ogg"), true);
  }
});

console.log(`\naudio_destillat: ${geprueft} Tests gruen.`);
