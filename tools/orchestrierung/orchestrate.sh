#!/usr/bin/env bash
# orchestrate.sh — dummer Orchestrator: N Aufgaben, je eigener git-worktree+Branch,
# je eine headless `claude -p` Session PARALLEL, JSON gesammelt, Übersicht, Aufräumen.
#
# Voraussetzung: in einem git-Repo ausführen. `claude` im PATH. node nur für JSON-Parse.
# Windows: git-bash oder WSL (dieses Skript ist bash). Reine-node-Variante: orchestrate.mjs
set -u

# ---- Konfiguration -------------------------------------------------------
REPO="${REPO:-$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null)}"
WORKDIR="${WORKDIR:-/tmp/orch}"
MODEL="${MODEL:-claude-haiku-4-5-20251001}"
MAX_TURNS="${MAX_TURNS:-2}"
TIMEOUT_S="${TIMEOUT_S:-180}"

# Aufgaben: jede Zeile = "ID|||PROMPT". Ergebnisdatei je Aufgabe: $WORKDIR/out_<ID>.txt
TASKS=(
  "A|||Schreibe mit dem Write-Tool in die Datei /tmp/orch/out_A.txt exakt das Wort FERTIG_A und sonst nichts. Keine weitere Erklaerung."
  "B|||Schreibe mit dem Write-Tool in die Datei /tmp/orch/out_B.txt exakt das Wort FERTIG_B und sonst nichts. Keine weitere Erklaerung."
)

if [ -z "$REPO" ]; then echo "FEHLER: kein git-Repo gefunden (REPO leer)"; exit 2; fi
mkdir -p "$WORKDIR"
echo "Repo:    $REPO"
echo "Workdir: $WORKDIR"
echo "Modell:  $MODEL"
echo

# ---- Eine Session als Funktion (laeuft im Hintergrund) -------------------
run_one() {
  local id="$1" prompt="$2"
  local wt="$WORKDIR/wt_$id"
  local branch="orch-tmp-$id-$$"
  local out="$WORKDIR/out_$id.txt"
  local json="$WORKDIR/session_$id.json"
  local err="$WORKDIR/session_$id.err"

  rm -f "$out" "$json" "$err"

  # 1) Worktree + temp-Branch (isolierter Arbeitsbaum, kollidiert nicht)
  if ! git -C "$REPO" worktree add -b "$branch" "$wt" HEAD >/dev/null 2>"$err.wt"; then
    echo "WT_FAIL"  > "$json.status"; cat "$err.wt" >> "$err"; return
  fi

  # 2) Headless-Session. Nested-claude-env scrubben (injizierte Flags vermeiden),
  #    stdin schliessen, acceptEdits (skip-permissions ist unter root verboten),
  #    --add-dir gibt Schreibrecht ausserhalb des cwd auf $WORKDIR.
  env -u CLAUDE_CODE_CHILD_SESSION \
      -u CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES \
      -u CLAUDECODE \
      -u CLAUDE_CODE_ENTRYPOINT \
      -u CLAUDE_CODE_SESSION_ID \
      timeout "$TIMEOUT_S" \
      claude -p "$prompt" \
        --output-format stream-json --verbose \
        --model "$MODEL" \
        --max-turns "$MAX_TURNS" \
        --permission-mode acceptEdits \
        --add-dir "$WORKDIR" \
        > "$json" 2>"$err" < /dev/null
  echo "$?" > "$json.status"
}

# ---- PARALLEL starten ----------------------------------------------------
pids=()
ids=()
echo "Starte ${#TASKS[@]} Sessions parallel ..."
for t in "${TASKS[@]}"; do
  id="${t%%|||*}"; prompt="${t#*|||}"
  run_one "$id" "$prompt" &
  pids+=("$!"); ids+=("$id")
  echo "  -> Session $id gespawnt (pid $!)"
done

# ---- warten --------------------------------------------------------------
echo; echo "Warte auf Abschluss ..."
for p in "${pids[@]}"; do wait "$p"; done

# ---- Übersicht (JSON parsen) --------------------------------------------
echo; echo "==================== ERGEBNIS ===================="
printf "%-4s %-8s %-9s %-12s %-38s %s\n" "ID" "exit" "result" "out-file" "session_id" "result-text"
for id in "${ids[@]}"; do
  json="$WORKDIR/session_$id.json"
  out="$WORKDIR/out_$id.txt"
  status="$(cat "$WORKDIR/session_$id.json.status" 2>/dev/null || echo '?')"
  outstate="FEHLT"; [ -s "$out" ] && outstate="$(tr -d '\n' < "$out")"
  # JSON-Parse via node (robuster als grep). Faellt auf '-' zurueck, wenn leer.
  read -r sid rsubtype rerr < <(node -e '
    const fs=require("fs");let f=process.argv[1];
    let sid="-",sub="-",err="-";
    try{for(const l of fs.readFileSync(f,"utf8").trim().split("\n")){
      let o; try{o=JSON.parse(l)}catch(e){continue}
      if(o.type==="system"&&o.subtype==="init") sid=o.session_id;
      if(o.type==="result"){sub=o.subtype;err=String(o.is_error);}
    }}catch(e){}
    process.stdout.write(sid+" "+sub+" "+err);
  ' "$json" 2>/dev/null)
  [ -z "$sid" ] && sid="-"
  printf "%-4s %-8s %-9s %-12s %-38s %s\n" "$id" "$status" "${rsubtype:-/}" "$outstate" "${sid:-/}" "is_error=${rerr:-/}"
done
echo "=================================================="

# ---- Aufräumen -----------------------------------------------------------
echo; echo "Raeume auf ..."
for id in "${ids[@]}"; do
  wt="$WORKDIR/wt_$id"; branch="orch-tmp-$id-$$"
  git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1
  git -C "$REPO" branch -D "$branch" >/dev/null 2>&1
done
git -C "$REPO" worktree prune >/dev/null 2>&1
echo "Worktrees uebrig:"; git -C "$REPO" worktree list
