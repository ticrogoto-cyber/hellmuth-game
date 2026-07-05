#!/usr/bin/env bash
# get_mining_weights.sh — Gewichte fuer tools/mine_mockup.py, Checksummen-gesichert.
#
# LIZENZEN (alle kommerziell nutzbar, Belege in mine_mockup.py-Header):
#   Real-ESRGAN anime_6B  BSD-3    GroundingDINO swint  Apache-2.0
#   SAM2.1 hiera-small    Apache   rembg isnet-anime    MIT/Apache
#   birefnet-general      MIT
# VERBOTEN: RMBG-2.0 (BRIA, non-commercial), FLUX.1-dev (NC).
#
# Checksummen-Modell: Trust-on-first-use mit Lock-Datei. Beim ERSTEN
# erfolgreichen Download wird die SHA256 gemessen und in
# tools/mining_weights.sha256.lock geschrieben; jeder spaetere Lauf prueft
# gegen die Lock-Datei (die Lock-Datei wird committet, damit alle Container
# gegen denselben Stand pruefen). KEINE Fantasie-Hashes im Skript —
# Session-Messung 2026-07-02: die Gewichts-Hosts sind in Cloud-Code-Sessions
# proxy-gesperrt (github-Releases fremder Repos: "add_repo"-Wand;
# dl.fbaipublicfiles.com: connect-tot). Dieses Skript auf einer Maschine mit
# offenem Netz laufen lassen, tools/models/ + Lock-Datei kopieren/committen.
set -euo pipefail
cd "$(dirname "$0")"
LOCK="mining_weights.sha256.lock"
touch "$LOCK"
mkdir -p models/realesrgan models/groundingdino models/sam2 models/u2net

fetch() { # url dst
  local url="$1" dst="$2"
  local want have
  want="$(grep -F "  $dst" "$LOCK" | cut -d' ' -f1 || true)"
  if [ -f "$dst" ]; then
    have="$(sha256sum "$dst" | cut -d' ' -f1)"
    if [ -n "$want" ] && [ "$have" = "$want" ]; then echo "OK (cache)  $dst"; return 0; fi
    if [ -n "$want" ]; then echo "FEHLER: $dst weicht von Lock ab ($have != $want)"; return 1; fi
  fi
  echo "LADE  $url"
  curl -fL --retry 3 -o "$dst.part" "$url"
  have="$(sha256sum "$dst.part" | cut -d' ' -f1)"
  if [ -n "$want" ] && [ "$have" != "$want" ]; then
    echo "FEHLER: Download-SHA $have != Lock $want — Abbruch."; rm -f "$dst.part"; return 1
  fi
  mv "$dst.part" "$dst"
  if [ -z "$want" ]; then
    echo "$have  $dst" >> "$LOCK"
    echo "LOCK  $dst -> $have (Trust-on-first-use; Lock-Datei committen!)"
  fi
  echo "OK  $dst"
}

# Real-ESRGAN anime_6B (BSD-3, ~18 MB)
fetch "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth" \
      models/realesrgan/RealESRGAN_x4plus_anime_6B.pth

# GroundingDINO swint_ogc (Apache-2.0, ~694 MB)
fetch "https://github.com/IDEA-Research/GroundingDINO/releases/download/v0.1.0-alpha/groundingdino_swint_ogc.pth" \
      models/groundingdino/groundingdino_swint_ogc.pth

# SAM 2.1 hiera-small (Apache-2.0, ~176 MB)
fetch "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt" \
      models/sam2/sam2.1_hiera_small.pt

# rembg-Modelle: der rembg-eigene pooch-Downloader prueft SHA selbst (Vendor-Hash).
python3 - <<'PY'
import os
os.environ["U2NET_HOME"] = os.path.abspath("models/u2net")
from rembg import new_session
for m in ("isnet-anime", "birefnet-general", "u2net"):
    try:
        new_session(m)
        print(f"OK  rembg {m}")
    except Exception as e:
        print(f"FEHLER rembg {m}: {e}")
PY

echo "Fertig. Lock-Stand:"
cat "$LOCK"
