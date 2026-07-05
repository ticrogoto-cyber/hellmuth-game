#!/usr/bin/env node
// orchestrate.mjs — reine-node-Variante des Orchestrators (Windows ohne git-bash/WSL).
// Gleiches Verhalten wie orchestrate.sh: N Aufgaben, je git-worktree+Branch,
// je headless `claude -p` PARALLEL, JSON gesammelt, Übersicht, Aufräumen.
//
// Start:  node orchestrate.mjs            (REPO via env oder auto-detect)
// Windows-Hinweis: claude.cmd muss im PATH sein; Pfade ggf. anpassen.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const WORKDIR = process.env.WORKDIR || "/tmp/orch";
const MODEL   = process.env.MODEL   || "claude-haiku-4-5-20251001";
const MAX_TURNS = process.env.MAX_TURNS || "2";
const TIMEOUT_MS = Number(process.env.TIMEOUT_S || 180) * 1000;

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}
const REPO = process.env.REPO ||
  git(["rev-parse", "--show-toplevel"], process.cwd()).stdout?.trim();
if (!REPO) { console.error("FEHLER: kein git-Repo gefunden"); process.exit(2); }
mkdirSync(WORKDIR, { recursive: true });

const TASKS = [
  ["A", "Schreibe mit dem Write-Tool in die Datei /tmp/orch/out_A.txt exakt das Wort FERTIG_A und sonst nichts. Keine weitere Erklaerung."],
  ["B", "Schreibe mit dem Write-Tool in die Datei /tmp/orch/out_B.txt exakt das Wort FERTIG_B und sonst nichts. Keine weitere Erklaerung."],
];

console.log(`Repo:    ${REPO}\nWorkdir: ${WORKDIR}\nModell:  ${MODEL}\n`);

// Nested-claude-env scrubben, damit keine injizierten Flags (z.B. partial-messages) stoeren.
const childEnv = { ...process.env };
for (const k of ["CLAUDE_CODE_CHILD_SESSION","CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES",
                 "CLAUDECODE","CLAUDE_CODE_ENTRYPOINT","CLAUDE_CODE_SESSION_ID"]) delete childEnv[k];

function runOne(id, prompt) {
  return new Promise((resolve) => {
    const wt = path.join(WORKDIR, `wt_${id}`);
    const branch = `orch-tmp-${id}-${process.pid}`;
    const jsonPath = path.join(WORKDIR, `session_${id}.json`);

    const add = git(["worktree", "add", "-b", branch, wt, "HEAD"], REPO);
    if (add.status !== 0) { resolve({ id, exit: "WT_FAIL", branch }); return; }

    const out = [];
    const child = spawn("claude", [
      "-p", prompt,
      "--output-format", "stream-json", "--verbose",
      "--model", MODEL,
      "--max-turns", MAX_TURNS,
      "--permission-mode", "acceptEdits",
      "--add-dir", WORKDIR,
    ], { cwd: wt, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });

    const killer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", d => out.push(d));
    child.on("close", (code) => {
      clearTimeout(killer);
      try { require("node:fs").writeFileSync(jsonPath, Buffer.concat(out)); } catch {}
      resolve({ id, exit: code, branch });
    });
  });
}

// require shim fuer ESM (writeFileSync oben)
import { createRequire } from "node:module";
globalThis.require = createRequire(import.meta.url);

console.log(`Starte ${TASKS.length} Sessions parallel ...`);
const results = await Promise.all(TASKS.map(([id, p]) => {
  console.log(`  -> Session ${id} gespawnt`);
  return runOne(id, p);
}));

console.log("\n==================== ERGEBNIS ====================");
console.log(["ID","exit","result","out-file","session_id"].join("\t"));
for (const r of results) {
  const jp = path.join(WORKDIR, `session_${r.id}.json`);
  const op = path.join(WORKDIR, `out_${r.id}.txt`);
  let sid="-", sub="-", err="-";
  if (existsSync(jp)) for (const l of readFileSync(jp,"utf8").trim().split("\n")) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.type==="system" && o.subtype==="init") sid=o.session_id;
    if (o.type==="result") { sub=o.subtype; err=String(o.is_error); }
  }
  const outstate = existsSync(op) ? readFileSync(op,"utf8").trim() : "FEHLT";
  console.log([r.id, r.exit, sub, outstate, sid, "is_error="+err].join("\t"));
}
console.log("==================================================\n");

console.log("Raeume auf ...");
for (const r of results) {
  git(["worktree","remove","--force", path.join(WORKDIR,`wt_${r.id}`)], REPO);
  git(["branch","-D", r.branch], REPO);
}
git(["worktree","prune"], REPO);
console.log("Worktrees uebrig:\n" + git(["worktree","list"], REPO).stdout);
