// destillat_smoke.mjs — Verhaltens-Gate fuer das Destillat-System
// (docs/DESTILLAT-SYSTEM.md). Vorbedingung: `npm run build`. Treibt die ECHTE
// App ueber window.__sim. 10 Checks (9 Brief + Kritiker-Gegenprobe #1).
// Determinismus gegen die dyn_smoke-Baseline laeuft separat (dyn_smoke.mjs).
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.DEST_PORT || 4181);
const BASE = `http://localhost:${PORT}`;
const STEP_MS = 1000 / 30;
const STEPS_5S = Math.round(5000 / STEP_MS); // 150

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
        /* not up */
      }
      if (++tries > 80) return reject(new Error("vite preview kam nicht hoch"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

// 1+2: Produktion (1 Destillat / 5 s / Destille, linear).
function runProduction({ n, seed }) {
  const sim = window.__sim;
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed); // resetEconomy: spieler.destillat -> 0
  sim.clearBuilt(); // Reste vorheriger Laeufe entfernen
  for (let i = 0; i < n; i++) sim.place("spieler", "destille", 13 + i * 3, 13, true);
  const stepN = (k) => {
    for (let s = 0; s < k; s++) sim.step(1);
  };
  // Knapp ueber die Fenstergrenze stempeln (Float-sicher): 152 Schritte ~5,07 s
  // (1 Fenster), 304 ~10,13 s (2 Fenster).
  stepN(152);
  const at5 = sim.destillat("spieler");
  stepN(152);
  const at10 = sim.destillat("spieler");
  return { at5, at10 };
}

// 3+4+4b+4c: Bau-Gate (Tech-Stufe / Limit) UND echter Bau-Pfad mit selektiertem
// Arbeiter (Check 4c, Auditor-Haerten: nicht nur das Gate, sondern beginPlacement
// + Builders-Filter + tryPlace). Reject-Events werden abgefangen.
function runBuildGate({ seed }) {
  const sim = window.__sim;
  const game = window.__game;
  const gs = game.registry.get("gameState");
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  sim.clearBuilt();
  gs.selectUnits([]); // sauberer Start: keine Selektion vom vorherigen Lauf

  // Check 4: Tech-Stufe 1 (kein Labor) -> Destille abgelehnt (auch der echte
  // Pfad reicht das Gate VOR dem Builders-Check; rejTier muss kommen).
  let rejTier = null;
  const onRej1 = (e) => {
    if (rejTier === null) rejTier = e;
  };
  game.events.on("ui:build-rejected", onRej1);
  const techAtStart = sim.tech("spieler");
  const tier1Build = sim.tryBuild("destille", 14, 14);
  const tier1Gate = sim.canBuild("spieler", "destille");
  game.events.off("ui:build-rejected", onRej1);

  // Tech-Stufe 2 herstellen (Labor abseits der Destille-Pruefstelle).
  sim.place("spieler", "labor", 26, 26, true);
  const techAfterLabor = sim.tech("spieler");
  const allowedAt2 = sim.canBuild("spieler", "destille"); // Check 4b

  // Check 4c (Auditor-Befund Agent 8): ECHTE Bauplatzierung mit selektiertem
  // Arbeiter -- spannt beginPlacement -> Builders-Filter -> tryPlace komplett auf.
  sim.spawn("spieler", "sammler", 24, 24);
  const worker = gs.units[gs.units.length - 1];
  gs.selectUnits([worker]);
  const countDest = () => {
    let n = 0;
    for (const b of gs.buildings) if (b.typeId === "destille") n++;
    return n;
  };
  const destBefore = countDest();
  const tier2RealBuild = sim.tryBuild("destille", 22, 22);
  const destAfter = countDest();
  gs.selectUnits([]);

  // Check 3: drei FERTIGE Destillen test-platzieren + den oben gebauten ergeben
  // 4 -> Limit (3) ueberschritten, weitere Versuche abgelehnt (Event).
  sim.place("spieler", "destille", 8, 8, true);
  sim.place("spieler", "destille", 8, 11, true);
  sim.place("spieler", "destille", 8, 14, true);
  let rejMax = null;
  const onRej2 = (e) => {
    if (rejMax === null) rejMax = e;
  };
  game.events.on("ui:build-rejected", onRej2);
  const fourthBuild = sim.tryBuild("destille", 14, 14);
  const maxGate = sim.canBuild("spieler", "destille");
  game.events.off("ui:build-rejected", onRej2);

  return {
    techAtStart,
    tier1Build,
    tier1Gate,
    rejTier,
    techAfterLabor,
    allowedAt2,
    destBefore,
    tier2RealBuild,
    destAfter,
    fourthBuild,
    rejMax,
    maxGate,
  };
}

// 5-8 + 10: Parasit-Drop. killGen: ein MODERAT-Killer toetet eine HELLMUTH-Unit
// (mass). withDestille setzt vorher eine HELLMUTH-Destille (Wirt).
function runParasite({ seed }) {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");

  // Toetung erzwingen: Killer bekommt das Ziel direkt + Reacquire aus; Ziel hp=1.
  const forceKill = (killerOwner, killerType, victimOwner, victimType) => {
    sim.spawn(killerOwner, killerType, 10, 10);
    sim.spawn(victimOwner, victimType, 11, 10);
    const killer = gs.units[gs.units.length - 2];
    const victim = gs.units[gs.units.length - 1];
    killer.attackTarget = victim;
    killer.fireState = "frei";
    killer.reevalMs = 1e9;
    victim.hp = 1;
    for (let s = 0; s < 12 && !victim.isDead; s++) sim.step(1);
  };

  // Frischer Match-Zustand (Ressourcen zurueck, Test-Bauten weg). gegner.destillat
  // startet bei 1500 (Kanon) -> wir messen DELTAS, nicht Absolutwerte.
  const fresh = () => {
    sim.setDriven(true);
    sim.clear();
    sim.setSeed(seed);
    sim.clearBuilt();
  };

  // Check 5: MODERAT toetet HELLMUTH (mass), KEINE Destille -> kein Drop.
  fresh();
  const b5 = sim.destillat("gegner");
  forceKill("gegner", "stahlbrute", "spieler", "sammler");
  const noHost = sim.destillat("gegner") - b5;

  // Check 6: mit HELLMUTH-Destille -> Drop = 2 (mass).
  fresh();
  sim.place("spieler", "destille", 18, 18, true);
  const b6 = sim.destillat("gegner");
  forceKill("gegner", "stahlbrute", "spieler", "sammler");
  const withHost = sim.destillat("gegner") - b6;

  // Check 7: HELLMUTH toetet MODERAT (strong) -> HELLMUTH bekommt keinen Drop.
  fresh();
  const b7s = sim.destillat("spieler");
  const b7g = sim.destillat("gegner");
  forceKill("spieler", "hellmuth", "gegner", "stahlbrute");
  const hellmuthDrop = sim.destillat("spieler") - b7s;
  const gegnerNoDrop = sim.destillat("gegner") - b7g;

  // Check 8: Friendly-Fire (MODERAT toetet MODERAT), Wirt vorhanden -> kein Drop.
  fresh();
  sim.place("spieler", "destille", 18, 18, true);
  const b8 = sim.destillat("gegner");
  forceKill("gegner", "stahlbrute", "gegner", "sirup_trupp");
  const friendlyFire = sim.destillat("gegner") - b8;

  // Check 10 (Kritiker #1): Wirt zerstoert -> Drop hoert SOFORT auf (kein Cache).
  fresh();
  sim.place("spieler", "destille", 18, 18, true);
  const b10a = sim.destillat("gegner");
  forceKill("gegner", "stahlbrute", "spieler", "sammler");
  const beforeDestroy = sim.destillat("gegner") - b10a; // erwartet 2
  const dest = gs.buildings.find((b) => b.typeId === "destille" && b.faction === "hellmuth");
  if (dest) gs.removeBuilding(dest);
  sim.clear(); // nur Einheiten weg; Destillat + (fehlende) Destille bleiben
  const b10b = sim.destillat("gegner");
  forceKill("gegner", "stahlbrute", "spieler", "sammler");
  const afterDestroy = sim.destillat("gegner") - b10b; // muss 0 sein (Wirt fort)

  return { noHost, withHost, hellmuthDrop, gegnerNoDrop, friendlyFire, beforeDestroy, afterDestroy };
}

// 9: Determinismus der Destillat-Logik selbst (Auditor-Befund Agent 8: hash()
// hashiert nur Positionen). Szenario faengt BEIDE Pfade ein -- HELLMUTH-
// Produktion (5-s-Fenster) UND MODERAT-Parasit-Drop (Wirt aktiv). Zwei gleich
// geseedete Laeufe muessen Positions-Hash UND beide Destillat-Werte bit-
// identisch teilen, und die Werte muessen non-trivial sein (sonst koennte ein
// toter Logik-Pfad trotzdem "deterministisch" wirken).
function runDeterminism({ seed }) {
  const sim = window.__sim;
  const gs = window.__game.registry.get("gameState");
  const once = () => {
    sim.setDriven(true);
    sim.clear();
    sim.setSeed(seed);
    sim.clearBuilt();
    sim.place("spieler", "destille", 18, 18, true);
    // Erzwungener Parasit-Kill (Wirt vorhanden -> mass-Drop 2).
    sim.spawn("gegner", "stahlbrute", 10, 10);
    sim.spawn("spieler", "sammler", 11, 10);
    const killer = gs.units[gs.units.length - 2];
    const victim = gs.units[gs.units.length - 1];
    killer.attackTarget = victim;
    killer.fireState = "frei";
    killer.reevalMs = 1e9;
    victim.hp = 1;
    // 160 Schritte ~5,33 s: Kill fruehzeitig + ein Produktions-Fenster schliesst sich.
    for (let s = 0; s < 160; s++) sim.step(1);
    return { hash: sim.hash(), klar: sim.destillat("spieler"), gen: sim.destillat("gegner") };
  };
  const a = once();
  const b = once();
  return { a, b };
}

async function main() {
  const preview = await startPreview();
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) return route.abort();
    return route.continue();
  });
  page.on("pageerror", (e) => {
    if (/decode audio data/i.test(e.message)) return;
    console.error("PAGEERR", e.message);
  });
  await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const prod1 = await page.evaluate(runProduction, { n: 1, seed: 1 });
  const prod2 = await page.evaluate(runProduction, { n: 2, seed: 1 });
  const gate = await page.evaluate(runBuildGate, { seed: 2 });
  const para = await page.evaluate(runParasite, { seed: 3 });
  const det = await page.evaluate(runDeterminism, { seed: 4242 });

  await browser.close();
  preview.kill();

  let red = 0;
  const checks = [];
  const want = (n, ok, got) => {
    if (!ok) red++;
    checks.push([n, ok, got]);
  };

  want("1  1 Destille: 5 s -> 1, 10 s -> 2", prod1.at5 === 1 && prod1.at10 === 2, `5s=${prod1.at5} 10s=${prod1.at10}`);
  want("2  2 Destillen: 5 s -> 2 (linear)", prod2.at5 === 2, `5s=${prod2.at5}`);
  want("3  Vierte Destille abgelehnt + Event", gate.fourthBuild === false && gate.rejMax?.reason === "destille_max_reached" && !gate.maxGate.ok, `build=${gate.fourthBuild} ev=${gate.rejMax?.reason} gate=${JSON.stringify(gate.maxGate)}`);
  want("4  Destille auf Tech-Stufe 1 abgelehnt + Event", gate.tier1Build === false && gate.rejTier?.reason === "destille_tier_too_low" && !gate.tier1Gate.ok, `tech=${gate.techAtStart} build=${gate.tier1Build} ev=${gate.rejTier?.reason}`);
  want("4b Tech 2 nach Labor erlaubt", gate.techAfterLabor === 2 && gate.allowedAt2.ok, `tech=${gate.techAfterLabor} ok=${gate.allowedAt2.ok}`);
  want("4c Echter Bau-Pfad (Arbeiter selektiert) platziert die Destille", gate.tier2RealBuild === true && gate.destAfter === gate.destBefore + 1, `built=${gate.tier2RealBuild} vor=${gate.destBefore} nach=${gate.destAfter}`);
  want("5  MODERAT-Kill ohne Wirt -> kein Drop", para.noHost === 0, `${para.noHost}`);
  want("6  MODERAT-Kill mit Wirt (mass) -> Drop 2", para.withHost === 2, `${para.withHost}`);
  want("7  HELLMUTH-Kill -> kein HELLMUTH-Drop", para.hellmuthDrop === 0 && para.gegnerNoDrop === 0, `hellmuth=${para.hellmuthDrop} gegner=${para.gegnerNoDrop}`);
  want("8  Friendly-Fire -> kein Drop", para.friendlyFire === 0, `${para.friendlyFire}`);
  want(
    "9  Destillat-Logik deterministisch (Hash + Werte) und non-trivial",
    det.a.hash === det.b.hash &&
      det.a.hash !== 0 &&
      det.a.klar === det.b.klar &&
      det.a.gen === det.b.gen &&
      det.a.klar > 0 &&
      det.a.gen > 1500, // 1500 Start + Drop > 0
    `hashA=${det.a.hash} hashB=${det.b.hash} klarA=${det.a.klar} klarB=${det.b.klar} genA=${det.a.gen} genB=${det.b.gen}`,
  );
  want("10 Wirt zerstoert -> Drop stoppt (kein Cache)", para.beforeDestroy === 2 && para.afterDestroy === 0, `vor=${para.beforeDestroy} nach=${para.afterDestroy}`);

  const line = (s) => console.log(s);
  line("");
  line("DESTILLAT-SYSTEM — Verhaltens-Gate (docs/DESTILLAT-SYSTEM.md):");
  line("STATUS  CHECK");
  for (const [n, ok, got] of checks) line(`${ok ? "GRUEN " : "ROT   "}  ${n.padEnd(46)} ${got}`);
  line("");
  line(`Rohwerte: prod1=${JSON.stringify(prod1)} prod2=${JSON.stringify(prod2)}`);
  line(`          gate=${JSON.stringify(gate)}`);
  line(`          para=${JSON.stringify(para)} det=${JSON.stringify(det)}`);
  line("");
  line(red === 0 ? "DESTILLAT-GATE: GRUEN" : `DESTILLAT-GATE: ROT (${red} Check(s))`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
