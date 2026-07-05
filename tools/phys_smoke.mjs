// phys_smoke.mjs — Verhaltens-Gate fuer PHYSIK Phase A (Freischalt-Block).
//   node tools/phys_smoke.mjs
// Vorbedingung: `npm run build`. Treibt die ECHTE App ueber window.__sim und
// hoert die GEFEUERTEN Events ab (Payloads), liest die Truemmer-Statistik und
// belegt Wind-up + Hit-Stop. Determinismus deckt dyn_smoke ab (hash unveraendert).
//
// A1 EVT_UNIT_HIT mit Richtung (ax/ay) + Schwere (sev).
// A2 EVT_UNIT_DIED traegt sev-Tier; Gebaeude-Tod traegt Sprite + Grundflaeche.
// A3 Tod wirft Truemmer (debris.thrown steigt).
// A4 Attack-Clip mit Wind-up >=120 ms; Treffer auf hitFrameIdx, nicht Clip-Start.
// A5 Hit-Stop friert EINEN Sprite, waehrend die Sim weiterlaeuft.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.PHYS_PORT || 4180);
// SHOT_DIR vereinheitlicht das Ausgabe-Ziel aller Shot-Tools (Fallback = heutiger Pfad).
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/phys";
const BASE = `http://localhost:${PORT}`;
const STEP_MS = 1000 / 30;

function startPreview() {
  const p = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  return new Promise((resolve, reject) => {
    let tries = 0;
    const tick = async () => {
      try {
        const r = await fetch(BASE + "/");
        if (r.ok) return resolve(p);
      } catch {
        /* not up yet */
      }
      if (++tries > 80) return reject(new Error("vite preview kam nicht hoch"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

// --- A1 + A4: Treffer-Payload + Wind-up. Angreifer adjazent zum Ziel; erstes
// Hit-Event je Fraktion einfangen, Schrittzahl bis dahin messen.
function runHitAndWindup({ type, seed }) {
  const sim = window.__sim;
  const scene = window.__game.scene.getScene("game");
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  sim.spawn("spieler", type, 18, 18); // Angreifer (hellmuth)
  sim.spawn("gegner", "stahlbrute", 19, 18); // Ziel adjazent (moderat)
  const att = gs.units.find((u) => u.owner === "spieler");
  const hasClip = att.attackHasHitFrame();
  let firstOwn = null;
  let ownStep = -1;
  const onHit = (e) => {
    if (firstOwn === null && e.faction === "hellmuth") firstOwn = e; // unser Angreifer
  };
  scene.events.on("fx.unit_hit", onHit);
  let clipSeen = false;
  for (let s = 1; s <= 30; s++) {
    sim.step(1);
    if (att.currentClip && att.currentClip() === "attack") clipSeen = true;
    if (firstOwn !== null && ownStep < 0) ownStep = s;
    if (firstOwn !== null) break;
  }
  scene.events.off("fx.unit_hit", onHit);
  const dir = firstOwn ? Math.hypot((firstOwn.ax ?? firstOwn.x) - firstOwn.x, (firstOwn.ay ?? firstOwn.y) - firstOwn.y) : 0;
  return {
    hasClip,
    clipSeen,
    sev: firstOwn?.sev ?? null,
    axDefined: firstOwn ? Number.isFinite(firstOwn.ax) && Number.isFinite(firstOwn.ay) : false,
    dir,
    ownStep, // Schrittzahl bis zum ersten eigenen Treffer (ms = ownStep * STEP_MS in Node)
  };
}

// --- A2 (Tier-Mapping direkt) + A2-Event + A3 (Truemmer beim Tod).
function runDeathTiers({ seed }) {
  const sim = window.__sim;
  const scene = window.__game.scene.getScene("game");
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  // Tier-Mapping ueber deathSnapshot() (kein Kampf noetig).
  const tierOf = (type) => {
    sim.spawn("spieler", type, 5, 5);
    const u = gs.units[gs.units.length - 1];
    const sev = u.deathSnapshot().sev;
    gs.removeUnit(u);
    return sev;
  };
  const tiers = {
    hero: tierOf("hellmuth"),
    workerMass: tierOf("sammler"),
    flyerMass: tierOf("suchfalter"),
    meleeStrong: tierOf("apotheker"),
    heavyStrong: tierOf("stahlbrute"),
  };
  // Echter Tod: hellmuth (hellmuth) toetet einen sammler (gegner) -> EVT_UNIT_DIED
  // + Truemmer. sammler ist Arbeiter -> Tier "mass".
  sim.clear();
  const debris = scene.debris;
  const thrownBefore = debris.stats().thrown;
  sim.spawn("spieler", "hellmuth", 18, 18);
  sim.spawn("gegner", "sammler", 19, 18);
  const victim = gs.units.find((u) => u.owner === "gegner");
  victim.hp = 1; // ein Treffer genuegt
  let died = null;
  const onDied = (s) => {
    if (died === null) died = s;
  };
  scene.events.on("fx.unit_died", onDied);
  for (let s = 0; s < 30 && died === null; s++) sim.step(1);
  scene.events.off("fx.unit_died", onDied);
  return {
    tiers,
    diedSev: died?.sev ?? null,
    debrisThrownDelta: debris.stats().thrown - thrownBefore,
  };
}

// --- A2 (Gebaeude) + A3: Gebaeude-Tod traegt Sprite-Beschreibung + Grundflaeche,
// wirft Truemmer.
function runBuildingDeath({ seed }) {
  const sim = window.__sim;
  const scene = window.__game.scene.getScene("game");
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  const hq = gs.buildings.find((b) => b.owner === "gegner" && b.role === "hq");
  const snap = hq.deathSnapshot();
  // Realer Tod ueber den Kampf: HP auf 1, hellmuth adjazent ans HQ.
  const debris = scene.debris;
  const thrownBefore = debris.stats().thrown;
  hq.hp = 1;
  sim.spawn("spieler", "hellmuth", hq.col, hq.row); // auf dem Anker (dist 0, in Reichweite)
  const att = gs.units[gs.units.length - 1];
  att.attackTarget = hq; // explizit + Reacquire aus -> kein Prioritaets-Wechsel weg vom HQ
  att.fireState = "frei";
  att.reevalMs = 1e9;
  let died = null;
  const onB = (s) => {
    if (died === null) died = s;
  };
  scene.events.on("fx.building_died", onB);
  for (let s = 0; s < 40 && died === null; s++) sim.step(1);
  scene.events.off("fx.building_died", onB);
  return {
    snapFootprint: snap.footprint ?? null,
    snapKey: snap.key ?? null,
    diedFootprint: died?.footprint ?? null,
    debrisThrownDelta: debris.stats().thrown - thrownBefore,
  };
}

// --- A5: Hit-Stop friert EINEN Sprite, waehrend ein zweiter weiterlaeuft.
function runHitStop({ seed }) {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  // Zwei hellmuths mit je einem adjazenten, unsterblichen Ziel -> beide bleiben
  // im Attack-Clip (unabhaengig vom HQ, das ein Vortest zerstoert haben kann).
  sim.spawn("spieler", "hellmuth", 10, 10);
  sim.spawn("gegner", "stahlbrute", 11, 10);
  sim.spawn("spieler", "hellmuth", 10, 13);
  sim.spawn("gegner", "stahlbrute", 11, 13);
  for (const e of gs.units) if (e.owner === "gegner") e.hp = 1e9; // Ziele halten
  const hs = gs.units.filter((u) => u.owner === "spieler" && u.typeId === "hellmuth");
  const A = hs[0];
  const B = hs[1];
  if (!A || !B || !A.attackHasHitFrame()) return { skipped: true };
  for (let s = 0; s < 8; s++) sim.step(1); // in den Attack-Clip laufen
  const fA0 = A.currentFrame();
  const fB0 = B.currentFrame();
  A.hitStop(300); // ~9 Schritte einfrieren
  for (let s = 0; s < 4; s++) sim.step(1); // ~133 ms < 300
  const fA1 = A.currentFrame();
  const fB1 = B.currentFrame();
  for (let s = 0; s < 12; s++) sim.step(1); // Freeze laeuft aus (>300 ms)
  const fA2 = A.currentFrame();
  return {
    skipped: false,
    frozenHeld: fA1 === fA0, // A: Frame haelt waehrend Freeze
    otherAdvanced: fB1 !== fB0, // B: laeuft weiter (Sim + Anim global aktiv)
    resumedAfter: fA2 !== fA1 || true, // nach Freeze wieder frei (informativ)
  };
}

async function main() {
  const preview = await startPreview();
  const browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => {
    // Headless kann die Audio-Assets nicht dekodieren -> irrelevant fuer Physik.
    if (/decode audio data/i.test(e.message)) return;
    console.error("PAGEERR", e.message);
  });
  await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });
  await page.waitForTimeout(1200);

  // Realbild ZUERST (HQs noch intakt -> kein Sieg-Overlay): dichtes Nahkampf-
  // Gewuehl -> gerichtetes Blut, fliegende Truemmer, Leichen. Beleg A1/A3.
  let shot = null;
  try {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.evaluate(() => {
      const sim = window.__sim;
      const gs = window.__game.registry.get("gameState");
      sim.setDriven(true);
      sim.clear();
      sim.setSeed(3);
      for (let i = 0; i < 40; i++) {
        const c = 15 + (i % 6);
        const r = 15 + ((i / 6) | 0);
        sim.spawn("spieler", "apotheker", c, r);
        sim.spawn("gegner", "stahlbrute", c + 1, r);
      }
      const cam = window.__game.scene.getScene("game").cameras.main;
      cam.setZoom(1.7);
      const u = gs.units[0];
      if (u) cam.centerOn(u.x, u.y);
      for (let s = 0; s < 32; s++) sim.step(1); // ~1 s: Tote fallen, Truemmer fliegen
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOT_DIR}/brawl.png` });
    shot = `${SHOT_DIR}/brawl.png`;
  } catch (e) {
    console.error("SHOT-SKIP", e.message);
  }

  const hellmuth = await page.evaluate(runHitAndWindup, { type: "hellmuth", seed: 5 });
  const apotheker = await page.evaluate(runHitAndWindup, { type: "apotheker", seed: 5 });
  const deaths = await page.evaluate(runDeathTiers, { seed: 7 });
  const building = await page.evaluate(runBuildingDeath, { seed: 11 });
  const hitstop = await page.evaluate(runHitStop, { seed: 9 });

  await browser.close();
  preview.kill();

  let red = 0;
  const checks = [];
  const want = (name, ok, got) => {
    if (!ok) red++;
    checks.push([name, ok, got]);
  };
  const ms = (r) => (r.ownStep > 0 ? Math.round(r.ownStep * STEP_MS) : -1);
  const hellMs = ms(hellmuth);
  const apoMs = ms(apotheker);

  // A1
  want("A1 Treffer traegt Richtung (ax/ay) ", hellmuth.axDefined && hellmuth.dir > 1, `dir=${hellmuth.dir.toFixed(1)} axDef=${hellmuth.axDefined}`);
  want("A1 Schwere: hellmuth (heavy) = heavy", hellmuth.sev === "heavy", hellmuth.sev);
  want("A1 Schwere: apotheker (melee) = light", apotheker.sev === "light", apotheker.sev);
  // A4
  want("A4 hellmuth hat Attack-Clip (live)", hellmuth.hasClip && hellmuth.clipSeen, `clip=${hellmuth.hasClip} seen=${hellmuth.clipSeen}`);
  want("A4 Wind-up >=120 ms vor dem Treffer", hellMs >= 120, `${hellMs} ms`);
  want("A4 ohne Clip schlaegt sofort (Kontrast)", apoMs >= 0 && apoMs < hellMs, `apotheker=${apoMs} ms vs hellmuth=${hellMs} ms`);
  // A2 Tiers
  want("A2 Tier hero (hellmuth)", deaths.tiers.hero === "hero", deaths.tiers.hero);
  want("A2 Tier mass (worker/flyer)", deaths.tiers.workerMass === "mass" && deaths.tiers.flyerMass === "mass", `${deaths.tiers.workerMass}/${deaths.tiers.flyerMass}`);
  want("A2 Tier strong (melee/heavy)", deaths.tiers.meleeStrong === "strong" && deaths.tiers.heavyStrong === "strong", `${deaths.tiers.meleeStrong}/${deaths.tiers.heavyStrong}`);
  want("A2 EVT_UNIT_DIED traegt sev (mass)", deaths.diedSev === "mass", deaths.diedSev);
  // A3
  want("A3 Einheiten-Tod wirft Truemmer", deaths.debrisThrownDelta > 0, `+${deaths.debrisThrownDelta}`);
  // A2 Gebaeude
  want("A2 Gebaeude-Snapshot traegt Grundflaeche", !!building.snapFootprint, JSON.stringify(building.snapFootprint));
  want("A2 EVT_BUILDING_DIED traegt Grundflaeche", !!building.diedFootprint, JSON.stringify(building.diedFootprint));
  want("A3 Gebaeude-Tod wirft Truemmer", building.debrisThrownDelta > 0, `+${building.debrisThrownDelta}`);
  // A5
  if (hitstop.skipped) {
    want("A5 Hit-Stop (Atlas noetig)", false, "uebersprungen: hellmuth-Atlas nicht geladen");
  } else {
    want("A5 Hit-Stop friert den Sprite (Frame haelt)", hitstop.frozenHeld, `frozenHeld=${hitstop.frozenHeld}`);
    want("A5 zweiter Sprite + Sim laufen weiter", hitstop.otherAdvanced, `otherAdvanced=${hitstop.otherAdvanced}`);
  }

  const line = (s) => console.log(s);
  line("");
  line("PHYSIK Phase A — Freischalt-Block (gefeuerte Events + Verhalten):");
  line("STATUS  PRUEFUNG                                              IST");
  for (const [name, ok, got] of checks) line(`${ok ? "GRUEN " : "ROT   "}  ${name.padEnd(50)} ${got}`);
  line("");
  line(`Rohwerte:`);
  line(`  hellmuth: ${JSON.stringify(hellmuth)}`);
  line(`  apotheker:${JSON.stringify(apotheker)}`);
  line(`  deaths:   ${JSON.stringify(deaths)}`);
  line(`  building: ${JSON.stringify(building)}`);
  line(`  hitstop:  ${JSON.stringify(hitstop)}`);
  if (shot) line(`Realbild (Canvas2D, Nahkampf): ${shot}`);
  line("");
  line(red === 0 ? "PHYS-A-GATE: GRUEN" : `PHYS-A-GATE: ROT (${red} Pruefung(en))`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
