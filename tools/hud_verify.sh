#!/usr/bin/env bash
# hud_verify.sh — Pflicht-Selbstabnahme vor jedem HUD-Push: beide Pruefer.
#   1) hud_spec_check.py  (statisch: parst hud.css gegen die Spec)
#   2) hud_browser.mjs check (live: misst die GERENDERTE App in Headless-Chromium
#      gegen die Spec -- der speclines-Eigenvergleich)
# Exit 1, sobald einer rot ist.
set -uo pipefail
cd "$(dirname "$0")/.."
export PW_CHROME="${PW_CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"

echo "== Build =="
npm run build >/tmp/hv_build.log 2>&1 || { echo "BUILD FAIL"; tail -20 /tmp/hv_build.log; exit 1; }

echo "== Pruefer 1: hud_spec_check (statisch) =="
python3 tools/hud_spec_check.py | tail -2
s1=${PIPESTATUS[0]}

echo "== Pruefer 2: hud_browser check (live gerendert) =="
pkill -f "vite preview" 2>/dev/null; sleep 1
node tools/hud_browser.mjs check 2>/tmp/hv_live.err | tail -20
s2=${PIPESTATUS[0]}
pkill -f "vite preview" 2>/dev/null

if [ "$s1" -ne 0 ] || [ "$s2" -ne 0 ]; then echo "GATE FAIL (static=$s1 live=$s2)"; exit 1; fi
echo "GATE PASS (beide Pruefer gruen)"
