#!/usr/bin/env python3
"""
build_hud_strips.py — HUD-Reparatur: kanten-differenzierte Leisten als Graustufen-
Master (Rapport, DUNKLER getont als der Rahmen-Master, damit die Toenung das
Relief nicht aufhellt/auswaescht). Emit als data:-URIs in src/ui/hud_strip_data.ts;
die Fraktionsfarbe legt hud_tint.tintedBorderImage zur Laufzeit drueber.

Kanten-Zuordnung (Paket-Vorgabe):
  HELLMUTH: top = hellmuth_strip_h_b (offen), bottom = hellmuth_strip_h_a
            (geschlossen), sides = hellmuth_strip_h_a 90 Grad im UZS gedreht.
  MODERAT:  top+bottom = moderat_strip_h_e, sides = moderat_strip_v_e.

Lauf: python3 tools/build_hud_strips.py
"""
import base64
import io
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from build_hud_assets import load_cut, resolve, to_master  # noqa: E402
from build_hud_frame import _best_seam, _seamless_h, _opaque_band_rows  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
DATA_TS = os.path.join(ROOT, "src/ui/hud_strip_data.ts")
STRIP_MEDIAN = 78.0   # deutlich dunkler als der Rahmen-Master (~150) -> kein Glanz
STRIP_SPREAD = 150.0  # geringere Spanne -> ruhigere Highlights (kein grelles Magenta)


def h_rapport(master, lo=120, hi=320):
    """Nahtloser HORIZONTALER Rapport aus dem Master (auf das opake Band getrimmt)."""
    yt, yb = _opaque_band_rows(master[..., 3])
    band = master[yt:yb, :, :]
    x0, length, _ = _best_seam(band, lo, hi)
    return _seamless_h(band, x0, length)


def v_rapport(master, lo=120, hi=320):
    """Nahtloser VERTIKALER Rapport: Master nach horizontal drehen, schneiden,
    zurueckdrehen (CCW->CW), damit die Naht-Logik wiederverwendbar bleibt."""
    horiz = np.rot90(master, k=1)            # vertikal -> horizontal
    tile = h_rapport(horiz, lo, hi)
    return np.rot90(tile, k=3)               # zurueck -> vertikal


def strip_master(stem, target_median=STRIP_MEDIAN, target_spread=STRIP_SPREAD, rotate_cw=False):
    src = resolve(stem)
    if src is None:
        raise SystemExit(f"FEHLT (melden, nicht raten): {stem}")
    cut = load_cut(stem, src)
    master = to_master(cut, target_median=target_median, target_spread=target_spread)
    if rotate_cw:
        master = np.rot90(master, k=3)       # 90 Grad im Uhrzeigersinn
    return master


def _uri(rgba):
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA").convert("LA")
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True)
    return ("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"),
            im.width, im.height)


def main():
    # MODERAT dunkler als HELLMUTH: das hochchromatische Magenta liest sonst grell,
    # h_e (oben) traegt zudem mehr Ornament-Helligkeit als v_e (Seiten).
    strips = {
        "k_top": h_rapport(strip_master("hellmuth_strip_h_b", 92)),
        "k_bot": h_rapport(strip_master("hellmuth_strip_h_a", 92)),
        "k_side": v_rapport(strip_master("hellmuth_strip_h_a", 92, rotate_cw=True)),
        "g_h": h_rapport(strip_master("moderat_strip_h_e", 50, 86)),
        "g_v": v_rapport(strip_master("moderat_strip_v_e", 56, 100)),
    }
    lines = ["// AUTO-GENERIERT von tools/build_hud_strips.py — NICHT von Hand editieren.",
             "// Kanten-differenzierte Leisten als eingebettete Graustufen-Master (dunkel);",
             "// Fraktionsfarbe legt hud_tint.tintedBorderImage zur Laufzeit drueber.\n",
             "export interface HudStrip { uri: string; w: number; h: number }\n"]
    for key, rgba in strips.items():
        uri, w, h = _uri(rgba)
        lines.append(f'export const {key.upper()}: HudStrip = {{ w: {w}, h: {h}, uri: "{uri}" }};')
        print(f"{key:7s} {w}x{h}  ({len(uri)//1024}KB)")
    with open(DATA_TS, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("->", os.path.relpath(DATA_TS, ROOT))


if __name__ == "__main__":
    main()
