#!/usr/bin/env python3
"""Offline-Alpha-Bake der Boden-Decals (Strang 4).

Die Quell-PNGs (assets/source/maps/decals/*.png) sind 1024x1024 RGB OHNE Alpha:
mehrere Flecken auf undurchsichtigem Grund. Dieses Skript stellt sie frei und
schreibt RGBA nach public/sprites/maps/decals/.

Verfahren (gemessener Fix gegen das Geisterquadrat, KEIN Saettigungstor):
  - BG-Farbe aus den VIER 48x48-Ecken mitteln (faengt Vignetten wie oil-3,
    statt nur einen 6px-Rand zu nehmen).
  - Distanz d = ||rgb - bg||. Hysterese: strong d<=28 (sicher FG), weak d<=70.
  - binary_propagation verbindet schwaches FG mit starkem FG (entfernt Inseln).
  - Alpha = clip((d-28)/(70-28), 0, 1).
  - Despill: an halbtransparenten Raendern den BG-Farbstich herausrechnen.

HINWEIS: benoetigt numpy + scipy + Pillow. Im Web-/CI-Container ohne diese Libs
NICHT lauffaehig -- dort backt der Editor dieselbe Logik LIVE
(src/editor/terrain_assets.ts -> buildDecalCutouts, verifiziert am Bild). Sobald
die Libs vorhanden sind:  python3 tools/process_decals.py
"""

from __future__ import annotations
import os
import sys

SRC = "assets/source/maps/decals"
DST = "public/sprites/maps/decals"
STRONG = 28.0
WEAK = 70.0
CORNER = 48


def main() -> int:
    try:
        import numpy as np
        from PIL import Image
        from scipy.ndimage import binary_propagation
    except ImportError as e:  # pragma: no cover - Container ohne Libs
        print(f"process_decals: fehlende Lib ({e}). Editor backt live; Skript uebersprungen.")
        return 0

    if not os.path.isdir(SRC):
        print(f"process_decals: Quellordner fehlt: {SRC}")
        return 1
    os.makedirs(DST, exist_ok=True)

    for name in sorted(os.listdir(SRC)):
        if not name.lower().endswith(".png"):
            continue
        rgb = np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB"), dtype=np.float64)
        h, w, _ = rgb.shape
        # BG aus vier Ecken.
        corners = np.concatenate([
            rgb[:CORNER, :CORNER].reshape(-1, 3),
            rgb[:CORNER, w - CORNER:].reshape(-1, 3),
            rgb[h - CORNER:, :CORNER].reshape(-1, 3),
            rgb[h - CORNER:, w - CORNER:].reshape(-1, 3),
        ], axis=0)
        bg = corners.mean(axis=0)

        d = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
        strong = d > WEAK  # sicher Vordergrund (weit von BG)
        weak = d > STRONG
        keep = binary_propagation(strong, mask=weak)  # Inseln entfernen
        alpha = np.clip((d - STRONG) / (WEAK - STRONG), 0.0, 1.0)
        alpha = np.where(keep | (d > WEAK), alpha, 0.0)

        # Despill: am Rand (0<alpha<1) den BG-Stich abziehen.
        out = rgb.copy()
        edge = (alpha > 0.02) & (alpha < 0.98)
        out[edge] = np.clip(out[edge] - (1.0 - alpha[edge])[:, None] * (bg - 0.0) * 0.25, 0, 255)

        rgba = np.dstack([out, (alpha * 255.0)]).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(os.path.join(DST, name))
        print(f"  freigestellt: {name}  (BG={bg.astype(int).tolist()})")
    print("process_decals: fertig.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
