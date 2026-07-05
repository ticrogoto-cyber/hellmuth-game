#!/usr/bin/env python3
"""
gen_glow_radial.py — Reproduzierbares 512x512 PNG fuer den HELLMUTH-Produktions-
Glow (Destille). Cosinus-Falloff vom Zentrum E8B33A zur vollen Transparenz am
Rand. Linear waere ein sichtbarer Ring -- Cosinus ist weich, deshalb von der
Spec gefordert.

Aufruf:
    python tools/_gen/gen_glow_radial.py [out_path]
Default: public/sprites/effects/glow_hellmuth_radial_512.png

Bit-identisch bei jedem Lauf -- keine Zufallszahlen, deterministische Floats.
Hash via:  sha256sum <out>
"""
from __future__ import annotations
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# HELLMUTH-Gold aus der Master-Palette (DESTILLAT-SYSTEM Spec).
CORE_R = 0xE8
CORE_G = 0xB3
CORE_B = 0x3A

SIZE = 512


def build_glow(size: int = SIZE) -> np.ndarray:
    """Erzeugt RGBA-Array: voll-opakes Gold im Zentrum, smooth zum Rand auf 0.

    Falloff = 0.5 * (cos(pi * t) + 1) auf t = clip(radius / R, 0, 1).
    Das ist eine Cosinus-Glocke ohne Ring (linearer Fall haette einen sichtbaren
    Saum am 100-%-Punkt).
    """
    r = size / 2.0
    # Pixel-Koordinaten (-r .. +r), zentriert.
    yy, xx = np.indices((size, size), dtype=np.float64)
    yy = yy - (size - 1) / 2.0
    xx = xx - (size - 1) / 2.0
    dist = np.sqrt(xx * xx + yy * yy)
    t = np.clip(dist / r, 0.0, 1.0)
    # Cosinus-Falloff: weicher als Smoothstep, weicher als Linear.
    falloff = 0.5 * (np.cos(math.pi * t) + 1.0)  # 1 im Zentrum, 0 am Rand
    alpha = np.clip(falloff * 255.0, 0.0, 255.0).astype(np.uint8)

    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = CORE_R
    rgba[..., 1] = CORE_G
    rgba[..., 2] = CORE_B
    rgba[..., 3] = alpha
    return rgba


def main() -> int:
    out = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("public/sprites/effects/glow_hellmuth_radial_512.png")
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    rgba = build_glow(SIZE)
    img = Image.fromarray(rgba, mode="RGBA")
    # Deterministische PNG-Optionen (keine Zeitstempel im Header).
    img.save(out, format="PNG", optimize=False, compress_level=6)
    print(f"OK  {out}  {SIZE}x{SIZE}  RGBA  core=#{CORE_R:02X}{CORE_G:02X}{CORE_B:02X}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
