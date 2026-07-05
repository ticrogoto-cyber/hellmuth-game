#!/usr/bin/env bash
# coupling_gate.sh — Anti-Self-Green P1b/P1c (HUD-KRISENSTAB.md §13).
#
# Sperrt exakt den f0c2ff4-Trick: dort wurden Drift-Baseline UND Render-Code im
# SELBEN Commit neu geschrieben, sodass der Drift das kaputte Bild gegen sich
# selbst verglich (MAE ~0). Regel:
#   * Kein Commit darf Render-Code UND proof/baseline/*.png zugleich anfassen.
#   * Eine Baseline-Aenderung ist nur als eigener Segnungs-Commit erlaubt, dessen
#     Betreff mit "BASELINE-ABNAHME:" beginnt und der NUR Baseline + Manifest
#     anfasst (kein Render-Code, nichts sonst).
#
#   bash tools/coupling_gate.sh [REF|RANGE]   # Default HEAD; RANGE = a..b
#
# Exit 1 bei Verstoss. Render-Code = die Dateien, die das HUD-Bild erzeugen.

set -uo pipefail
ARG="${1:-HEAD}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [[ "$ARG" == *..* ]]; then
  COMMITS="$(git rev-list "$ARG" 2>/dev/null)"
else
  COMMITS="$ARG"
fi
[ -z "$COMMITS" ] && { echo "PASS Koppelungs-Sperre: keine Commits in $ARG."; exit 0; }

fail=0
for c in $COMMITS; do
  files="$(git show --name-only --format= "$c" 2>/dev/null | sed '/^$/d')"
  [ -z "$files" ] && continue
  msg="$(git show -s --format=%s "$c" 2>/dev/null)"
  render=0; baseline=0; manifest=0; other=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      hellmuth/proof/baseline/APPROVED.sha256) manifest=1 ;;
      hellmuth/proof/baseline/*.png) baseline=1 ;;
      hellmuth/src/ui/*|*/hud.css|hud.css|*hud_tint*|*html_hud*|*hud_strip_data*|*hud_master_data*|*hud_assets*|hellmuth/src/*hud*) render=1 ;;
      *) other=1 ;;
    esac
  done <<< "$files"

  short="$(git rev-parse --short "$c" 2>/dev/null)"
  if [ "$baseline" = 1 ] && [ "$render" = 1 ]; then
    echo "ROT  $short: Render-Code UND proof/baseline/*.png im selben Commit (f0c2ff4-Muster)."
    fail=1
  fi
  if [ "$baseline" = 1 ] || [ "$manifest" = 1 ]; then
    case "$msg" in
      BASELINE-ABNAHME:*)
        if [ "$render" = 1 ] || [ "$other" = 1 ]; then
          echo "ROT  $short: Segnungs-Commit darf NUR Baseline + Manifest anfassen, nichts sonst."
          fail=1
        fi ;;
      *)
        echo "ROT  $short: Baseline/Manifest geaendert ausserhalb eines 'BASELINE-ABNAHME:'-Commits (Segnung ist ein eigener, signierter Akt)."
        fail=1 ;;
    esac
  fi
done

[ "$fail" = 0 ] && echo "PASS Koppelungs-Sperre: keine Render+Baseline-Vermischung ($ARG)."
exit $fail
