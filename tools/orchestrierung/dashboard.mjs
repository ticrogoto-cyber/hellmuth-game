#!/usr/bin/env node
// dashboard.mjs — Ticros Kapitaens-Dashboard im Terminal.
// EIN Ueberblick: welche claude/*-Session ist fertig / gruen / wartet.
//
// Baut auf MAXI-3 H5 (STATUS.md + Sammel-Merge-Fenster) auf: H5 nennt das
// KONZEPT ("kein Code"), DIES ist der laufende Sammler dazu.
//
// ZWEI HAELFTEN, bewusst getrennt:
//   1. GIT-LOKAL (immer robust, kein Netz/Token): Branch, letzter Commit,
//      ahead/behind der Integrationslinie, ungemergte Arbeit.
//   2. CI-STATUS (braucht Netz/Token): wird NICHT hier geholt, sondern aus
//      einer JSON-Datei gelesen, die ein Helfer (Agent via GitHub-MCP, oder
//      `gh`) daneben legt. Fehlt sie -> Spalte zeigt "—", Dashboard laeuft
//      trotzdem. So degradiert es sauber offline.
//
// Lauf:  node dashboard.mjs [--base <ref>] [--ci <ci.json>] [--no-fetch]
// Default-Base: origin/claude/quirky-fermat-8rewv0 (Integrationslinie).
//
// Reines Node, keine Dependencies. Laeuft auf Windows mit git im PATH.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// ---- Argumente ----
const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const BASE = opt("--base", "origin/claude/quirky-fermat-8rewv0");
const CI_FILE = opt("--ci", "/tmp/collector/ci.json");
const NO_FETCH = args.includes("--no-fetch");
const PATTERN = opt("--pattern", "claude/*");
const REPO = opt("--repo", process.cwd());

// ---- git-Helfer ----
// -C <repo> bindet jeden Aufruf an das Repo, egal von wo das Skript laeuft.
function git(cmd) {
  return execSync(`git -C "${REPO}" ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function gitSafe(cmd, fallback = "") {
  try { return git(cmd); } catch { return fallback; }
}

// ---- 1. GIT-LOKAL ----

// Optionaler fetch, damit ahead/behind aktuell ist. Scheitert offline -> egal.
if (!NO_FETCH) {
  try {
    execSync(`git -C "${REPO}" fetch --quiet --all --prune`, { stdio: "ignore", timeout: 30000 });
  } catch { /* offline: weiter mit lokalem Stand */ }
}

// Branch-Quelle: bevorzugt remote (origin/claude/*), denn das ist der geteilte
// Stand. Fallback auf lokale Branches, wenn kein origin da ist.
// WICHTIG: --format und das Glob-Pattern MUESSEN gequotet sein. execSync laeuft
// durch die Shell; '%(refname:short)' enthaelt Klammern (Shell-Syntaxfehler)
// und '*' wuerde sonst gegen das cwd geglobt statt an git uebergeben.
const remoteGlob = `origin/${PATTERN}`;
let refs = gitSafe(
  `for-each-ref --format='%(refname:short)' 'refs/remotes/${remoteGlob}'`
).split("\n").filter(Boolean);
let usingRemote = refs.length > 0;
if (!usingRemote) {
  refs = gitSafe(
    `for-each-ref --format='%(refname:short)' 'refs/heads/${PATTERN}'`
  ).split("\n").filter(Boolean);
}
// origin/HEAD herausfiltern.
refs = refs.filter((r) => !r.endsWith("/HEAD"));

// Base-Ref normalisieren (existiert sie?).
const baseExists = gitSafe(`rev-parse --verify --quiet ${BASE}`) !== "";
const baseRef = baseExists ? BASE : refs[0];

function shortBranch(ref) {
  return ref.replace(/^origin\//, "");
}

// CI-Daten laden (Halbteil 2, optional).
let ciMap = {};
let ciMeta = null;
if (existsSync(CI_FILE)) {
  try {
    const raw = JSON.parse(readFileSync(CI_FILE, "utf8"));
    ciMeta = raw.generated_at || null;
    ciMap = raw.branches || raw; // erlaubt {branches:{...}} oder flach {...}
  } catch { ciMap = {}; }
}

function ciFor(branch) {
  const e = ciMap[branch];
  if (!e) return { label: "—", concl: null };
  // Eintrag kann String (conclusion) oder Objekt {conclusion,status,url} sein.
  const concl = typeof e === "string" ? e : e.conclusion;
  const status = typeof e === "string" ? null : e.status;
  if (status && status !== "completed") return { label: status, concl: null };
  return { label: concl || "?", concl };
}

// Pro Branch die Zeile bauen.
const rows = refs.map((ref) => {
  const branch = shortBranch(ref);
  // Letzter Commit: relative Zeit + gekuerzte Message.
  const when = gitSafe(`log -1 --format=%cr ${ref}`, "?");
  const sha = gitSafe(`log -1 --format=%h ${ref}`, "?");
  let msg = gitSafe(`log -1 --format=%s ${ref}`, "");
  if (msg.length > 42) msg = msg.slice(0, 41) + "…";

  // ahead/behind vs Base. left=behind (in base, nicht hier), right=ahead.
  let ahead = "?", behind = "?";
  if (baseRef && ref !== baseRef) {
    const ab = gitSafe(`rev-list --left-right --count ${baseRef}...${ref}`, "");
    if (ab) {
      const [b, a] = ab.split(/\s+/);
      behind = b; ahead = a;
    }
  } else if (ref === baseRef) {
    ahead = "0"; behind = "0";
  }

  // "offene Arbeit": hat der Branch Commits, die NICHT in der Base sind?
  // ahead>0 = fertige, aber noch nicht integrierte Arbeit -> wartet auf Merge.
  const aheadN = parseInt(ahead, 10);
  let state;
  if (ref === baseRef) state = "BASIS";
  else if (Number.isNaN(aheadN)) state = "?";
  else if (aheadN === 0) state = "gemergt";
  else state = `wartet(${aheadN})`;

  const ci = ciFor(branch);

  return { branch, when, sha, msg, ahead, behind, ciLabel: ci.label, ciConcl: ci.concl, state };
});

// ---- Ausgabe: EINE Tabelle ----

// Spaltenbreiten dynamisch.
function w(arr, key, min) {
  return Math.max(min, ...arr.map((r) => String(r[key]).length));
}
const cB = w(rows, "branch", 6);
const cW = w(rows, "when", 8);
const cM = w(rows, "msg", 7);
const cAB = 9; // "+12/-3"
const cCI = Math.max(7, ...rows.map((r) => r.ciLabel.length));
const cS = w(rows, "state", 7);

function ciCell(r) {
  const s = r.ciLabel.padEnd(cCI);
  if (r.ciConcl === "success") return `\x1b[32m${s}\x1b[0m`; // gruen
  if (r.ciConcl === "failure" || r.ciConcl === "cancelled" || r.ciConcl === "timed_out")
    return `\x1b[31m${s}\x1b[0m`; // rot
  return `\x1b[2m${s}\x1b[0m`; // dim fuer —/?/laufend
}
function stateCell(r) {
  const s = r.state.padEnd(cS);
  if (r.state === "BASIS") return `\x1b[36m${s}\x1b[0m`;
  if (r.state.startsWith("wartet")) return `\x1b[33m${s}\x1b[0m`; // gelb
  if (r.state === "gemergt") return `\x1b[2m${s}\x1b[0m`;
  return s;
}

const headBranch = gitSafe("rev-parse --abbrev-ref HEAD", "?");
console.log("");
console.log(`\x1b[1mKAPITAENS-DASHBOARD\x1b[0m  ·  Basis: ${baseRef}${baseExists ? "" : " (Fallback)"}  ·  HEAD: ${headBranch}`);
console.log(`Quelle: ${usingRemote ? "origin/* (remote)" : "lokale Branches"}  ·  CI: ${existsSync(CI_FILE) ? `aus ${CI_FILE}${ciMeta ? " @ " + ciMeta : ""}` : "keine ci.json -> Spalte —"}`);
console.log("");

// Header.
const H = [
  "Branch".padEnd(cB),
  "Commit".padEnd(cW),
  "Message".padEnd(cM),
  "ahead/behind".padEnd(cAB + 3),
  "CI".padEnd(cCI),
  "Strang".padEnd(cS),
].join("  ");
console.log("\x1b[1m" + H + "\x1b[0m");
console.log("─".repeat(H.length));

// Zeilen: wartende zuerst (Ticros Aufmerksamkeit), dann Basis, dann gemergt.
const order = (r) => (r.state.startsWith("wartet") ? 0 : r.state === "BASIS" ? 1 : 2);
rows.sort((x, y) => order(x) - order(y) || x.branch.localeCompare(y.branch, "en"));

for (const r of rows) {
  const ab = `+${r.ahead}/-${r.behind}`.padEnd(cAB + 3);
  console.log([
    r.branch.padEnd(cB),
    r.when.padEnd(cW),
    r.msg.padEnd(cM),
    ab,
    ciCell(r),
    stateCell(r),
  ].join("  "));
}

// ---- Zusammenfassung: was Ticro tun muss ----
const waiting = rows.filter((r) => r.state.startsWith("wartet"));
const redCI = rows.filter((r) => r.ciConcl === "failure");
console.log("");
console.log(`\x1b[1mZUSAMMENFASSUNG\x1b[0m`);
console.log(`  ${rows.length} Branches  ·  ${waiting.length} warten auf Merge  ·  ${redCI.length} mit rotem CI`);
if (waiting.length) {
  console.log(`  Merge-Queue (ahead>0, gruen): ` +
    (waiting.filter((r) => r.ciConcl === "success").map((r) => r.branch).join(", ") || "(keiner gruen)"));
}
if (redCI.length) {
  console.log(`  \x1b[31mRot — nicht mergen:\x1b[0m ` + redCI.map((r) => r.branch).join(", "));
}
console.log("");
