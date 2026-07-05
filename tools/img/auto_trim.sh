#!/usr/bin/env bash
# auto_trim.sh — schneidet transparente Raender mit ImageMagick weg und
# schreibt einen 1-px-Sicherheitsrand. Welle-2-Bash-Pendant zum cv2-Trim aus
# pack_atlas.py; nuetzlich fuer Drop-a-File-Vorbereitung.
#
# Aufruf:
#   tools/img/auto_trim.sh <in.png>  [out.png]
#   tools/img/auto_trim.sh assets/source/ui/orn/hellmuth_corner_a.png /tmp/cut.png
set -euo pipefail
IN="${1:?in.png}"
OUT="${2:-${IN%.png}_trim.png}"
[ -f "$IN" ] || { echo "FAIL $IN fehlt"; exit 2; }
W_IN="$(identify -format "%w" "$IN")"
H_IN="$(identify -format "%h" "$IN")"
convert "$IN" -trim +repage -bordercolor none -border 1x1 "$OUT"
W_OUT="$(identify -format "%w" "$OUT")"
H_OUT="$(identify -format "%h" "$OUT")"
B_IN="$(stat -c %s "$IN")"
B_OUT="$(stat -c %s "$OUT")"
PCT="$(awk -v a="$B_OUT" -v b="$B_IN" 'BEGIN{printf "%.1f", 100*(b-a)/b}')"
echo "OK  $IN  ${W_IN}x${H_IN} (${B_IN} B)  ->  $OUT  ${W_OUT}x${H_OUT} (${B_OUT} B, -${PCT}%%)"
