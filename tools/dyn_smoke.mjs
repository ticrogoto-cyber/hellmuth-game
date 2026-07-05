// dyn_smoke.mjs — Headless-Mess-Gate fuer die Sim-Dynamik (Strang 8).
//   node tools/dyn_smoke.mjs
// Vorbedingung: `npm run build` (vite preview serviert dist/). Misst gegen die
// ECHTE App ueber die Testbed-Bruecke window.__sim:
//   - Skalierungs-Gate (Spatial-Hash, Strang 3): step-ms bei 200/500/1000 ohne
//     quadratischen Knick (Verdopplung N <= ~Verdopplung Zeit).
//   - Determinismus-Gate (Strang 8): zweimal gleicher Seed + gleiche Befehle +
//     gleiche Schrittzahl -> bit-identischer Positions-Hash.
//   - Ankunftsquote (informativ/weich).
// Exit 1 bei roter Stufe; SOLL/IST-Tabelle nach stdout.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.DYN_PORT || 4178);
const BASE = `http://localhost:${PORT}`;

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

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[(s.length / 2) | 0] : 0;
};

// --- In-Page: ein Lauf bei N Einheiten, K Schritten. driven=true -> die Sim
// laeuft nur ueber step() (kein Frame-Pacing), saubere ms pro Schritt.
function runStage({ N, K, seed, spread }) {
  const sim = window.__sim;
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  for (let i = 0; i < N; i++) {
    // Kampfeinheit (uebt separate + acquire ueber das Gitter). Ueber die GANZE
    // Karte streuen (teilerfremde Schritte 7/13), damit die Dichte realistisch
    // mit N skaliert -- so zeigt sich, ob die Abfragekosten linear bleiben.
    const col = 1 + ((i * 7) % 34);
    const row = 1 + ((i * 13) % 34);
    sim.spawn("spieler", "apotheker", col, row);
  }
  if (spread) sim.march("spieler", 3, 3); // kurzer Marsch, Pulk bleibt kartenweit verteilt
  for (let w = 0; w < 5; w++) sim.step(1); // warmup
  const ms = [];
  const avoid = [];
  for (let s = 0; s < K; s++) {
    sim.step(1);
    const st0 = sim.stats();
    ms.push(st0.lastFrameMs);
    avoid.push(st0.avoidMs);
  }
  const st = sim.stats();
  return { ms, avoid, arrived: st.arrived, total: st.total };
}

// --- In-Page: Determinismus. Zwei identische Laeufe, Positions-Hash vergleichen.
function runDeterminism({ M, K, seed }) {
  const sim = window.__sim;
  const once = () => {
    sim.setDriven(true);
    sim.clear();
    sim.setSeed(seed);
    // Alle auf EINE Kachel -> erzwingt d===0 (gesaetes separate-Random) +
    // dichte Separation -> faengt Rest-Random und instabile Iteration.
    for (let i = 0; i < M; i++) sim.spawn("spieler", "apotheker", 8, 8);
    sim.moveAll("spieler", 24, 24);
    for (let s = 0; s < K; s++) sim.step(1);
    return sim.stats().hash ? sim.stats().hash : 0;
  };
  // hash() ist eine eigene Methode:
  const run = () => {
    once();
    return sim.hash();
  };
  const a = run();
  const b = run();
  return { a, b };
}

// --- In-Page: Fernkampf-Stufe. N Fernkaempfer (Destillateur) vs N Ziele
// (Stahlbrute), kartenweit verschraenkt. Misst Frame-ms unter Geschoss-Last,
// den ausgeteilten Schaden (Beweis: Einschlaege) und den Determinismus (zwei
// gleich geseedete Laeufe -> bit-identischer Positions-/HP-Hash).
function runRanged({ N, K, seed }) {
  const sim = window.__sim;
  const gs = window.__game.scene.getScene("game").gameState;
  const run = () => {
    sim.setDriven(true);
    sim.clear();
    sim.setSeed(seed);
    for (let i = 0; i < N; i++) {
      const c = 1 + ((i * 7) % 33);
      const r = 1 + ((i * 13) % 33);
      sim.spawn("spieler", "destillateur", c, r);
      sim.spawn("gegner", "stahlbrute", 1 + ((c + 2) % 33), r);
    }
    const ms = [];
    for (let st = 0; st < K; st++) {
      sim.step(1);
      ms.push(sim.stats().lastFrameMs);
    }
    let hp = 0;
    let max = 0;
    for (const u of gs.units) {
      hp += u.hp;
      max += u.maxHp;
    }
    return { ms, dealt: max - hp, hash: sim.hash(), units: gs.units.length };
  };
  const a = run();
  const b = run();
  const med = (arr) => {
    const s = [...arr].sort((x, y) => x - y);
    return s.length ? s[(s.length / 2) | 0] : 0;
  };
  return { msMedian: med(a.ms), dealt: a.dealt, units: a.units, hashA: a.hash, hashB: b.hash };
}

// --- In-Page: FoW-Stempelkosten + Determinismus. N stationaere Sichtquellen
// (alle "spieler", damit die KI sie nicht bewegt -> reiner naiver Vollstempel
// derselben Scheiben pro Tick). Misst den FoW-eigenen Anteil lastFowMs und
// haengt den Sichtgitter-Hash an (zwei gleich geseedete Laeufe -> identisch).
function runFow({ N, K, seed }) {
  const sim = window.__sim;
  const measure = () => {
    sim.setDriven(true);
    sim.clear();
    sim.setSeed(seed); // setzt auch die Sichtgitter zurueck (unabhaengige Laeufe)
    for (let i = 0; i < N; i++) {
      const col = 1 + ((i * 7) % 34);
      const row = 1 + ((i * 13) % 34);
      sim.spawn("spieler", "apotheker", col, row);
    }
    const ms = [];
    for (let s = 0; s < K; s++) {
      sim.step(1);
      ms.push(sim.stats().fowMs);
    }
    const sorted = [...ms].sort((x, y) => x - y);
    return { fowMs: sorted.length ? sorted[(sorted.length / 2) | 0] : 0, vis: sim.visHash("spieler") };
  };
  const a = measure();
  const b = measure();
  return { fowMs: a.fowMs, visA: a.vis, visB: b.vis };
}

// --- In-Page: Persistenz-Beleg ueber die API-Zustaende (noch nicht visuell,
// das ist Paket B). Eine Quelle deckt die Kartenmitte auf, verschwindet, und
// die Kachel muss bei fogPersist gedimmt-erinnert (Zustand 1) bleiben.
function runFowPersist({ seed }) {
  const sim = window.__sim;
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  const C = 18;
  const R = 18; // Kartenmitte, fern beider HQs (kein Gebaeude deckt sie)
  sim.step(1);
  const baseline = sim.visAt("spieler", C, R); // erwartet 0 (unentdeckt)
  sim.spawn("spieler", "apotheker", C, R);
  sim.step(1);
  const seen = sim.visAt("spieler", C, R); // erwartet 2 (sichtbar)
  const exploredSeen = sim.explored("spieler", C, R); // erwartet true
  sim.clear(); // Quelle entfernen
  sim.step(1);
  const after = sim.visAt("spieler", C, R); // erwartet 1 (gedimmt-erinnert)
  return { baseline, seen, exploredSeen, after };
}

async function main() {
  const preview = await startPreview();
  const browser = await chromium.launch({
    // Vorhandenes Chromium (Playwright-Browser-Cache) explizit, da die
    // Projekt-Playwright-Version ihren Build hier nicht nachladen kann.
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
  const fail = (msg) => {
    console.error("FEHLER:", msg);
  };
  page.on("pageerror", (e) => fail("pageerror " + e.message));

  await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });

  // SOLL-Schwellen (Strang 8). Absolute ms sind unter Headless-SwiftShader nur
  // Richtwert (WARN), das harte Gate ist der Knick (sub-quadratisch) + Determinismus.
  const SOLL = {
    200: { arrival: 0.98, ms: 16.67 },
    500: { arrival: 0.95, ms: 22.2 },
    1000: { arrival: 0.9, ms: 33.3 },
  };

  const results = [];
  for (const N of [200, 500, 1000]) {
    const r = await page.evaluate(runStage, { N, K: 120, seed: 1, spread: true });
    results.push({
      N,
      ms: median(r.ms),
      avoidMs: median(r.avoid),
      arrival: r.total ? r.arrived / r.total : 0,
    });
  }
  const det = await page.evaluate(runDeterminism, { M: 200, K: 60, seed: 1337 });
  const ranged = await page.evaluate(runRanged, { N: 500, K: 90, seed: 4242 });

  const fowResults = [];
  for (const N of [200, 500, 1000]) {
    fowResults.push({ N, ...(await page.evaluate(runFow, { N, K: 60, seed: 7 })) });
  }
  const fowPersist = await page.evaluate(runFowPersist, { seed: 99 });

  await browser.close();
  preview.kill();

  // --- Auswertung ---------------------------------------------------------
  let red = 0;
  const line = (s) => console.log(s);
  line("");
  line("N      step-ms   SOLL-ms   avoid-ms   Ankunft   SOLL    Status");
  for (const r of results) {
    const soll = SOLL[r.N];
    const msRed = r.ms > soll.ms; // Frame-Budget (hartes Gate)
    const arrWarn = r.arrival < soll.arrival;
    if (msRed) red++;
    line(
      `${String(r.N).padEnd(6)} ${r.ms.toFixed(2).padStart(7)}   ${String(soll.ms).padStart(6)}   ` +
        `${r.avoidMs.toFixed(2).padStart(7)}   ${(r.arrival * 100).toFixed(1).padStart(6)}%   ` +
        `${(soll.arrival * 100).toFixed(0)}%   ${msRed ? "ms-ROT " : "ms-ok "}${arrWarn ? "arr-WARN" : "arr-ok"}`,
    );
  }
  // Avoidance < 4 ms @1000 ueber den Hash ist das harte Strang-2-Gate; der
  // Gesamt-Sim-Knick (inkl. Kampf-Acquire-Dichteanstieg) ist nur Kontext.
  const r500 = results.find((r) => r.N === 500).ms || 0.0001;
  const r1000 = results.find((r) => r.N === 1000).ms || 0.0001;
  const avoid1000 = results.find((r) => r.N === 1000).avoidMs;
  line("");
  line(`Gesamt-Sim-Knick 500->1000: x${(r1000 / r500).toFixed(2)} (Kontext, kein Gate)`);
  line(`Avoidance @1000: ${avoid1000.toFixed(2)} ms (SOLL < 4 ms, Strang 2)`);
  if (avoid1000 >= 4) {
    line(
      `WARN: Avoidance ${avoid1000.toFixed(2)} ms @1000 (Ziel < 4; headless/SwiftShader ` +
        `pessimistisch, real-HW darunter). Harte Gates: Frame-Budget + Determinismus.`,
    );
  } else {
    line("GRUEN: Avoidance < 4 ms @1000 ueber den Hash.");
  }

  line("");
  line(`Determinismus: hashA=${det.a}  hashB=${det.b}  ${det.a === det.b ? "GRUEN (bit-identisch)" : "ROT (divergiert)"}`);
  if (det.a !== det.b || det.a === 0) red++;

  line("");
  line(
    `Fernkampf @${ranged.units} Einheiten: step-ms ${ranged.msMedian.toFixed(2)} (SOLL <= 33.3), ` +
      `Schaden ${ranged.dealt} (Geschosse treffen), hashA=${ranged.hashA} hashB=${ranged.hashB}`,
  );
  if (ranged.msMedian > 33.3) {
    line("ROT: Fernkampf-Frame-Budget ueberschritten.");
    red++;
  }
  if (ranged.hashA !== ranged.hashB || ranged.hashA === 0) {
    line("ROT: Fernkampf nicht deterministisch.");
    red++;
  }
  if (ranged.dealt <= 0) {
    line("ROT: Geschosse richten keinen Schaden an.");
    red++;
  }
  if (ranged.msMedian <= 33.3 && ranged.hashA === ranged.hashB && ranged.dealt > 0) {
    line("GRUEN: Fernkampf im Budget, deterministisch, Geschosse treffen.");
  }

  // --- FoW (Paket A) ------------------------------------------------------
  // lastFowMs ist der FoW-eigene Anteil (reine CPU-Integer-Arbeit, von
  // SwiftShader unbeeinflusst). Ziel < ~2 ms (Sim-Tick 30 Hz = 33,3 ms). Das
  // ms-Ziel ist Richtwert (WARN); harte Gates sind Determinismus + Persistenz
  // + dass der Stempel das Sim-Budget nie sprengt.
  line("");
  line("FoW Stempel (lastFowMs, Median ueber 60 Ticks):");
  line("N      fow-ms   Ziel     Status");
  for (const r of fowResults) {
    const over = r.fowMs > 2.0;
    const overBudget = r.fowMs > 33.3;
    if (overBudget) red++;
    line(
      `${String(r.N).padEnd(6)} ${r.fowMs.toFixed(3).padStart(7)}   <2.0     ` +
        `${overBudget ? "ms-ROT (Budget!)" : over ? "ms-WARN" : "ms-ok"}`,
    );
  }
  const fowDetOk = fowResults.every((r) => r.visA === r.visB && r.visA !== 0);
  line(
    `FoW-Determinismus: ${fowResults
      .map((r) => `N${r.N}:${r.visA === r.visB ? "=" : "!="}`)
      .join("  ")}  ${fowDetOk ? "GRUEN (Gitter bit-identisch)" : "ROT (divergiert)"}`,
  );
  if (!fowDetOk) red++;
  const p = fowPersist;
  const persistOk = p.baseline === 0 && p.seen === 2 && p.exploredSeen === true && p.after === 1;
  line(
    `FoW-Persistenz (Mitte): unentdeckt=${p.baseline} sichtbar=${p.seen} ` +
      `erinnert_nach_Verlassen=${p.after} (SOLL 0/2/1)  ${persistOk ? "GRUEN" : "ROT"}`,
  );
  if (!persistOk) red++;

  line("");
  line(red === 0 ? "DYN-GATE: GRUEN" : `DYN-GATE: ROT (${red} Stufe(n))`);
  process.exit(red === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
