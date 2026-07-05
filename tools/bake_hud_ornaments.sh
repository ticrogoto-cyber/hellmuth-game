#!/usr/bin/env bash
# bake_hud_ornaments.sh — kanonischer, reproduzierbarer Vereinheitlichungs-Pass
# fuer die HUD-Ornamente (die in die Assets gebackene Haelfte). Korn ist NICHT
# hier, sondern ein gemeinsamer Overlay-Layer ueber der ganzen Leiste (CSS).
#
# Schritte je Stueck: Freistellen (Standard, inkl. eingeschlossene Grund-Taschen)
# + Farb-Normalisierung + Hue-Angleichung an den Fraktionskanon. Mit IDENTISCHEN
# Parametern je Fraktion, damit alle Teile zusammenpassen.
#
# Hue-Ziele: HELLMUTH Gold 42 Grad (Messing/Amber -> Einheitenkarten-Gold),
# MODERAT Emblem-Magenta 339 Grad (Sirup/Roehren -> Emblem-Magenta). Fenster +/-40
# schuetzt HELLMUTH-Gruen (Kugel, Brennnesseln) und alles ausserhalb des Akzents.
# Mahlwerk zusaetzlich Saettigung x0.9 (Kristallkrusten-Sonderregel).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=assets/source/ui
OUT=processed/ui
N="python3 tools/normalize_asset.py"

K_ARGS="--mode building --hue-target 42 --hue-window 40 --hue-pull 0.40 --hue-sat-min 0.22"
G_ARGS="--mode building --hue-target 339 --hue-window 40 --hue-pull 0.45 --hue-sat-min 0.22"

for n in alambik destille medaillon knubbel_ecke moerser_brennnessel \
         streifen_moerser_h streifen_moerser_v streifen_phiolen_v; do
  $N --in "$SRC/hellmuth/$n.png" --out "$OUT/hellmuth/$n.png" $K_ARGS
done

for n in drohnenauge pumpstation sirup_ecke streifen_sirup_h streifen_sirup_v; do
  $N --in "$SRC/moderat/$n.png" --out "$OUT/moderat/$n.png" $G_ARGS
done
# Mahlwerk: Kristallkrusten-Saettigung -10 %
$N --in "$SRC/moderat/mahlwerk.png" --out "$OUT/moderat/mahlwerk.png" $G_ARGS --sat-scale 0.90

echo "HUD-Ornamente gebacken -> $OUT (Pumpstation bleibt zurueckgehalten bis korrigierte Fassung)."
