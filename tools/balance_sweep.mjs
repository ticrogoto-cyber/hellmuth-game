// balance_sweep.mjs — Balance-Auswertung ueber VIELE Seeds am ECHTEN Sim.
//   node tools/balance_sweep.mjs [N_SEEDS] [K_STEPS] > /tmp/balance.csv
// Treibt den deterministischen Sim (window.__sim, Strang-8-Bruecke) ueber N
// Seeds durch dieselbe Fernkampf-Aufstellung wie dyn_smoke.runRanged und gibt
// pro Seed EINE CSV-Zeile mit echten Sim-Zahlen aus (Schaden je Fraktion,
// ueberlebende Einheiten je Fraktion, Median step-ms, Positions-Hash). Jeder
// Seed laeuft ZWEIMAL -> Determinismus-Beleg (hash_a==hash_b). Reine Messung,
// kein Gate. stdout = CSV, stderr = Fortschritt/Diagnose.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const N_SEEDS = Number(process.argv[2] || 80);
const K_STEPS = Number(process.argv[3] || 120);
const N_UNITS = Number(process.env.SWEEP_UNITS || 120); // je Fraktion verschraenkt
const PORT = Number(process.env.DYN_PORT || 4188);
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

// In-Page: EIN Fernkampf-Lauf bei gegebenem Seed. Spiegelt dyn_smoke.runRanged,
// aber gibt die Outcome-naehesten Zahlen zurueck, die die Bruecke hergibt:
// Schaden je Fraktion (max-hp - hp), Ueberlebende je Fraktion, Median step-ms,
// Positions-Hash. KEINE erfundenen Zahlen -- alles aus gs.units + sim.stats().
function runOne({ N, K, seed }) {
  const sim = window.__sim;
  const gs = window.__game.scene.getScene("game").gameState;
  sim.setDriven(true);
  sim.clear();
  sim.setSeed(seed);
  for (let i = 0; i < N; i++) {
    const c = 1 + ((i * 7) % 33);
    const r = 1 + ((i * 13) % 33);
    sim.spawn("spieler", "destillateur", c, r); // Hellmuth, Fernkampf
    sim.spawn("gegner", "stahlbrute", 1 + ((c + 2) % 33), r); // Moderat, Nahkampf-Brute
  }
  const ms = [];
  for (let st = 0; st < K; st++) {
    sim.step(1);
    ms.push(sim.stats().lastFrameMs);
  }
  // Schaden + Ueberlebende je Fraktion aus den lebenden Einheiten + Max-Pool.
  // Gefallene Einheiten sind aus gs.units entfernt; ihr Beitrag zaehlt im
  // Schaden ueber die spawn-bekannte Vollzahl je Seite (alle starten voll).
  let hpK = 0,
    maxK = 0,
    aliveK = 0;
  let hpG = 0,
    maxG = 0,
    aliveG = 0;
  for (const u of gs.units) {
    if (u.owner === "spieler") {
      hpK += u.hp;
      maxK += u.maxHp;
      aliveK++;
    } else if (u.owner === "gegner") {
      hpG += u.hp;
      maxG += u.maxHp;
      aliveG++;
    }
  }
  const med = (arr) => {
    const s = [...arr].sort((x, y) => x - y);
    return s.length ? s[(s.length / 2) | 0] : 0;
  };
  return {
    stepMsMedian: med(ms),
    // Schaden an noch lebenden + an gefallenen Einheiten je Seite. Gefallene:
    // (Startzahl N) - alive Einheiten haben ihre volle maxHp verloren. maxHp je
    // Typ ist konstant pro Seite, also (N - alive) * typMax addieren.
    aliveK,
    aliveG,
    hpK,
    maxK,
    hpG,
    maxG,
    hash: sim.hash(),
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
  page.on("pageerror", (e) => console.error("PAGEERROR", e.message));

  await page.goto(BASE + "/?renderer=canvas", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__sim && !!window.__game, { timeout: 30000 });

  // typMax je Seite einmal abfragen (fuer Schaden inkl. gefallener Einheiten).
  const typMax = await page.evaluate(() => {
    const data = window.__game.scene.getScene("game").gameData ?? null;
    return null; // wird unten ueber max/alive rekonstruiert, kein interner Zugriff noetig
  });

  // Zwei Modi:
  //   default   -> Seed-Sweep (Determinismus + Seed-Sensitivitaet pruefen).
  //   SWEEP_MODE=scale -> Kompositions-/Skalierungs-Sweep: variiere N je Lauf,
  //                       echte Streuung in Schaden/Ueberlebenden/step-ms.
  const MODE = process.env.SWEEP_MODE || "seed";

  if (MODE === "scale") {
    // N von 10..N_UNITS in Schritten -> echte Balance-Streuung ueber Massstaebe.
    console.log(
      "n_units,step_ms_median,alive_hellmuth,alive_moderat,total_alive," +
        "dealt_to_hellmuth,dealt_to_moderat,frac_hellmuth_survivors,hash",
    );
    const seed = 4242; // fest -> reine N-Variation, kein Seed-Rauschen
    const Ns = [];
    for (let n = 10; n <= N_UNITS; n += Math.max(2, Math.round(N_UNITS / 40))) Ns.push(n);
    let i = 0;
    for (const n of Ns) {
      const a = await page.evaluate(runOne, { N: n, K: K_STEPS, seed });
      const dealtToK =
        a.aliveK > 0 ? a.maxK - a.hpK + (n - a.aliveK) * (a.maxK / a.aliveK) : a.maxK - a.hpK;
      const dealtToG =
        a.aliveG > 0 ? a.maxG - a.hpG + (n - a.aliveG) * (a.maxG / a.aliveG) : a.maxG - a.hpG;
      console.log(
        [
          n,
          a.stepMsMedian.toFixed(3),
          a.aliveK,
          a.aliveG,
          a.aliveK + a.aliveG,
          Math.round(dealtToK),
          Math.round(dealtToG),
          (a.aliveK + a.aliveG > 0 ? a.aliveK / (a.aliveK + a.aliveG) : 0).toFixed(4),
          a.hash,
        ].join(","),
      );
      if (++i % 10 === 0) console.error(`... ${i}/${Ns.length} N-Stufen`);
    }
    await browser.close();
    preview.kill();
    console.error(`FERTIG (scale): ${Ns.length} N-Stufen, K=${K_STEPS}, seed=${seed}.`);
    process.exit(0);
  }

  // CSV-Kopf (Seed-Modus).
  console.log(
    "seed,step_ms_median,alive_hellmuth,alive_moderat,total_alive," +
      "dealt_to_hellmuth,dealt_to_moderat,hash_a,hash_b,deterministic",
  );

  let detFails = 0;
  for (let s = 0; s < N_SEEDS; s++) {
    const seed = 1000 + s; // breite, reproduzierbare Seed-Spanne
    const a = await page.evaluate(runOne, { N: N_UNITS, K: K_STEPS, seed });
    const b = await page.evaluate(runOne, { N: N_UNITS, K: K_STEPS, seed }); // Determinismus
    const det = a.hash === b.hash && a.hash !== 0;
    if (!det) detFails++;
    // Schaden = an lebenden verlorene HP + volle HP der gefallenen. Gefallene je
    // Seite: (N_UNITS - alive). typMax je Seite = max/alive (alle gleich), bei
    // alive==0 Rueckfall auf 0 (Seite ausgeloescht, Schaden = volle Startpool-HP
    // ist dann unbekannt ueber die Bruecke -> als lebende-HP-Differenz gemeldet).
    const dealtToK = a.aliveK > 0 ? a.maxK - a.hpK + (N_UNITS - a.aliveK) * (a.maxK / a.aliveK) : a.maxK - a.hpK;
    const dealtToG = a.aliveG > 0 ? a.maxG - a.hpG + (N_UNITS - a.aliveG) * (a.maxG / a.aliveG) : a.maxG - a.hpG;
    console.log(
      [
        seed,
        a.stepMsMedian.toFixed(3),
        a.aliveK,
        a.aliveG,
        a.aliveK + a.aliveG,
        Math.round(dealtToK),
        Math.round(dealtToG),
        a.hash,
        b.hash,
        det ? 1 : 0,
      ].join(","),
    );
    if ((s + 1) % 10 === 0) console.error(`... ${s + 1}/${N_SEEDS} Seeds`);
  }

  await browser.close();
  preview.kill();
  console.error(
    `FERTIG: ${N_SEEDS} Seeds, K=${K_STEPS} Schritte, ${N_UNITS}+${N_UNITS} Einheiten. ` +
      `Determinismus-Fehler: ${detFails}/${N_SEEDS}.`,
  );
  process.exit(detFails === 0 ? 0 : 2);
}

main().catch((e) => {
  console.error("ABBRUCH:", e.stack || e.message);
  process.exit(1);
});
