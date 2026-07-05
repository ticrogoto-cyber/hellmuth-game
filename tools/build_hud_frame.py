#!/usr/bin/env python3
"""
build_hud_frame.py — Paket B: das EINE Nine-Slice-Rahmen-Master + EIN nahtloser
Bar-Rapport, beide als achromatische Graustufen-Master (Tönung zur Laufzeit, A).

Ausgabe:
  public/sprites/ui/hud/v3/frame/panel_master.png  (320x320, Slice 32, grau)
  public/sprites/ui/hud/v3/bar/bar_master.png       (nahtloser H-Rapport <=256px)

»Ein Master, Tönung wechselt« (V3 §1.1): beide Fraktionen rahmen aus DIESEM einen
Master; HELLMUTH/MODERAT unterscheiden sich nur per CSS-/SVG-Tönung (hud_tint).
Quellen (Auswahl, per Manifest-/Tool-Swap änderbar):
  - Rahmen  <- hellmuth/blocks/orn/frame.png  (sauberster Nine-Slice, echte Ecken)
  - Bar     <- moderat_strip_h_e               (gleichmäßigstes Stahlband, kachelt)

Lauf: python3 tools/build_hud_frame.py
"""
import base64
import io
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from build_hud_assets import load_cut, resolve, to_master, luma_std  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
PUB = os.path.join(ROOT, "public")
FRAME_SRC = os.path.join(PUB, "sprites/ui/hud/hellmuth/blocks/orn/frame.png")
FRAME_OUT = os.path.join(PUB, "sprites/ui/hud/v3/frame/panel_master.png")
BAR_SRC_STEM = "moderat_strip_h_e"
BAR_OUT = os.path.join(PUB, "sprites/ui/hud/v3/bar/bar_master.png")
DATA_TS = os.path.join(ROOT, "src/ui/hud_master_data.ts")


def _save(rgba, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(path)


def build_frame_master():
    """Den sauberen Nine-Slice (320x320, Slice 32) achromatisch mastern. Struktur
    — vier echte Eck-Slices + Kanten, transparente Mitte — bleibt erhalten; nur
    die Farbe fällt (Tönung kommt zur Laufzeit)."""
    rgba = np.asarray(Image.open(FRAME_SRC).convert("RGBA")).astype(np.uint8)
    master = to_master(rgba)
    _save(master, FRAME_OUT)
    print(f"frame_master: {master.shape[1]}x{master.shape[0]} (Slice 32, grau) "
          f"LumaStd={luma_std(master):.1f} -> {os.path.relpath(FRAME_OUT, ROOT)}")


def _opaque_band_rows(a, thr=0.5):
    ra = (a > 30).mean(axis=1)
    mask = ra > thr
    best, s = (0, 0), None
    for y in range(len(mask)):
        if mask[y]:
            s = y if s is None else s
        elif s is not None:
            if y - s > best[1] - best[0]:
                best = (s, y)
            s = None
    if s is not None and len(mask) - s > best[1] - best[0]:
        best = (s, len(mask))
    return best


def _best_seam(band, lo, hi, step=8):
    """(x0, L) mit minimalem Spaltenunterschied band[:,x0] vs band[:,x0+L]."""
    W = band.shape[1]
    best = None
    for L in range(lo, min(hi, W - 16), step):
        for x0 in range(2, W - L - 14, 6):
            d = np.abs(band[:, x0, :3].astype(np.float32)
                       - band[:, x0 + L, :3].astype(np.float32)).mean()
            if best is None or d < best[2]:
                best = (x0, L, d)
    return best


def _seamless_h(band, x0, L, F=12):
    """Nahtloser Rapport: Endkachel über F px in den Anfang überblenden."""
    E = band[:, x0:x0 + L + F].astype(np.float32)
    out = E[:, :L].copy()
    for i in range(F):
        w = i / F
        out[:, i] = E[:, i] * w + E[:, L + i] * (1 - w)
    return out.clip(0, 255).astype(np.uint8)


def build_bar_master(lo=96, hi=224):
    """Aus dem Stahlband-Master einen nahtlosen H-Rapport <=256px (ideal 96-192)
    schneiden — die WIEDERHOL-EINHEIT für background-repeat:round (kein
    2172px-Vollband mehr, kein 'gestreckt')."""
    src = resolve(BAR_SRC_STEM)
    cut = load_cut(BAR_SRC_STEM, src)
    master = to_master(cut)
    yt, yb = _opaque_band_rows(master[..., 3])
    band = master[yt:yb, :, :]
    x0, L, d = _best_seam(band, lo, hi)
    tile = _seamless_h(band, x0, L)
    _save(tile, BAR_OUT)
    print(f"bar_master: Rapport {tile.shape[1]}x{tile.shape[0]} (Naht-Rest {d:.1f}/255) "
          f"LumaStd={luma_std(tile):.1f} -> {os.path.relpath(BAR_OUT, ROOT)}")
    return tile.shape[1], tile.shape[0]


def _data_uri(path):
    """PNG als self-contained data:-URI (Graustufen+Alpha -> kleiner als RGBA)."""
    im = Image.open(path).convert("LA")
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}", im.width, im.height


def emit_master_ts():
    """Die Master als eingebettete data:-URIs in ein TS-Modul schreiben. EIN SVG,
    das als CSS border-image/background dient, laeuft im secure static mode und
    kann KEINE externen Bilder laden -> der Master MUSS eingebettet sein. Die
    Fraktionsfarbe legt hud_tint.tintedBorderImage zur Laufzeit drueber."""
    fu, fw, fh = _data_uri(FRAME_OUT)
    bu, bw, bh = _data_uri(BAR_OUT)
    ts = (
        "// AUTO-GENERIERT von tools/build_hud_frame.py — NICHT von Hand editieren.\n"
        "// Der EINE Graustufen-Master (Nine-Slice-Rahmen + Bar-Rapport), als\n"
        "// self-contained data:-URI eingebettet (CSS-SVG kann keine externen Bilder\n"
        "// laden). Fraktionsfarbe legt hud_tint.tintedBorderImage zur Laufzeit drueber.\n\n"
        "export interface HudMaster { uri: string; w: number; h: number }\n\n"
        f'export const FRAME_MASTER: HudMaster = {{ w: {fw}, h: {fh}, uri: "{fu}" }};\n\n'
        f'export const BAR_MASTER: HudMaster = {{ w: {bw}, h: {bh}, uri: "{bu}" }};\n'
    )
    with open(DATA_TS, "w", encoding="utf-8") as f:
        f.write(ts)
    print(f"master-data: {os.path.relpath(DATA_TS, ROOT)} "
          f"(frame {len(fu) // 1024}KB, bar {len(bu) // 1024}KB base64)")


if __name__ == "__main__":
    build_frame_master()
    build_bar_master()
    emit_master_ts()
