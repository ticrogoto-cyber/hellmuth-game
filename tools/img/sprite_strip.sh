#!/usr/bin/env bash
# sprite_strip.sh — packt eine Frame-Folge zu einem horizontalen Sprite-Strip
# (Phaser-kompatibel, gleich grosse Frames). Bash-Vorstufe zu pack_atlas.py,
# wenn nur ein einfacher Strip statt eines vollen Atlas gebraucht wird.
#
# Aufruf:
#   tools/img/sprite_strip.sh <pattern> <out.png>
#   tools/img/sprite_strip.sh 'build/frames/idle_*.png' /tmp/idle_strip.png
#
# Alle gefundenen Frames werden auf max-w/max-h gepuffert (kein Skalieren),
# dann horizontal aneinandergesetzt. Frame-Count und Frame-Size landen im stdout.
set -euo pipefail
PAT="${1:?Frame-Glob, z.B. build/frames/idle_*.png}"
OUT="${2:?out.png}"
shopt -s nullglob
mapfile -t FRAMES < <(ls -1 $PAT 2>/dev/null | sort)
[ "${#FRAMES[@]}" -gt 0 ] || { echo "FAIL keine Frames fuer Muster: $PAT"; exit 2; }

# Max-Dimensionen ueber alle Frames
MAX_W=0; MAX_H=0
for f in "${FRAMES[@]}"; do
  W="$(identify -format "%w" "$f")"
  H="$(identify -format "%h" "$f")"
  [ "$W" -gt "$MAX_W" ] && MAX_W="$W"
  [ "$H" -gt "$MAX_H" ] && MAX_H="$H"
done

# Jeder Frame auf MAX_WxMAX_H zentriert puffern, dann horizontal anhaengen.
TMP="$(mktemp -d)"; trap "rm -rf $TMP" EXIT
i=0
for f in "${FRAMES[@]}"; do
  convert "$f" -background none -gravity center -extent "${MAX_W}x${MAX_H}" "${TMP}/$(printf %04d.png $i)"
  i=$((i+1))
done
convert ${TMP}/*.png +append "$OUT"
echo "OK  ${#FRAMES[@]} Frames @ ${MAX_W}x${MAX_H}  ->  $OUT"
