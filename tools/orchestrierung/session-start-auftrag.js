#!/usr/bin/env node
// SessionStart-Hook: spielt AUFTRAG.md (und, falls vorhanden, STATUS.md) in jede
// frisch gestartete Claude-Code-Session ein — ohne dass ein Mensch etwas tippt.
// Plattformneutral (node, kein git-bash/WSL noetig). Gemessen-bewiesen (O4):
// eine frische Session sah und EXECUTIERTE den Auftrag autonom.
//
// Einrichtung (in Ticros Repo, NICHT in diesem Container):
//   .claude/settings.json:
//   { "hooks": { "SessionStart": [ { "hooks": [
//       { "type": "command",
//         "command": "node $CLAUDE_PROJECT_DIR/hellmuth/tools/orchestrierung/session-start-auftrag.js" }
//   ] } ] } }
//
// Konvention: Hook druckt JSON mit .hookSpecificOutput.additionalContext nach
// stdout; dieser Text wird vor dem ersten Turn in den Kontext injiziert.

const fs = require("fs");
const path = require("path");

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const parts = [];

for (const name of ["AUFTRAG.md", "STATUS.md"]) {
  const f = path.join(root, name);
  if (fs.existsSync(f)) {
    parts.push(`=== ${name} (automatisch eingespielt, kein Mensch hat es getippt) ===\n` +
               fs.readFileSync(f, "utf8").trim());
  }
}

if (parts.length === 0) process.exit(0); // nichts einzuspielen -> stiller Durchlauf

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: parts.join("\n\n"),
  },
}));
