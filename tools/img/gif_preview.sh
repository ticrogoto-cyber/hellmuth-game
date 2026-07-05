#!/usr/bin/env bash
# gif_preview.sh — animierte GIF-Vorschau einer Frame-Folge fuer Review.
# Bash-Pendant zu numpngw (APNG); GIFs sind in Markdown/PR ueberall sichtbar.
#
# Aufruf:
#   tools/img/gif_preview.sh <pattern> <out.gif> [fps]
#   tools/img/gif_preview.sh 'build/frames/idle_*.png' /tmp/idle.gif 12
set -euo pipefail
PAT="${1:?Frame-Glob}"
OUT="${2:?out.gif}"
FPS="${3:-12}"
DELAY="$(awk -v f="$FPS" 'BEGIN{printf "%.0f", 100/f}')"
shopt -s nullglob
mapfile -t FRAMES < <(ls -1 $PAT 2>/dev/null | sort)
[ "${#FRAMES[@]}" -gt 0 ] || { echo "FAIL keine Frames fuer Muster: $PAT"; exit 2; }
convert -delay "$DELAY" -loop 0 "${FRAMES[@]}" -layers Optimize "$OUT"
B="$(stat -c %s "$OUT")"
echo "OK  ${#FRAMES[@]} Frames @ ${FPS} fps (delay ${DELAY}cs)  ->  $OUT (${B} B)"
