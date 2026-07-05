#!/usr/bin/env python3
"""
hud_distortion_proof.py — Paket A, Melde-Zaesur Beleg 1: »die Verzerrung ist tot«.

Vergleicht am Testobjekt MODERAT-Panel-Leiste (moderat_strip_h_e) drei Zustaende:
  1. ALTE KETTE   public/.../v2/moderat/strip_h/strip_h_e.png (relight+palette+
                  steel_present+grain) — ausgewaschenes Relief, +Saettigung.
  2. NEUER MASTER public/.../v3/moderat/strip_h/strip_h_e.png (freistellen+trim+
                  achromatischer Graustufen-Master) — Relief 1:1, Saettigung 0.
  3. GETOENT      Master + luminanzerhaltende Toenung. Exakt das W3C-Modell von
                  CSS mix-blend-mode:color = SetLum(Cs, Lum(Cb)) — also das, was
                  der Browser zur Laufzeit rechnet. Relief bleibt, Farbe kommt.

Misst LumaStd (Relief) und mittlere Saettigung je Zustand und legt eine
Vorher/Nachher-PNG ab. Lauf: python3 tools/hud_distortion_proof.py
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
OLD = os.path.join(ROOT, "public/sprites/ui/hud/v2/moderat/strip_h/strip_h_e.png")
NEW = os.path.join(ROOT, "public/sprites/ui/hud/v3/moderat/strip_h/strip_h_e.png")
SRC = os.path.join(ROOT, "assets/source/ui/freigestellt/moderat_strip_h_e.png")
OUT = os.path.join(ROOT, "docs/proof/paket_a_distortion.png")
TINT = (192, 64, 122)  # PLATZHALTER-Magenta (= FACTION_TINT_PLACEHOLDER.moderat)


def load(p):
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)


def luma(rgb):
    return rgb @ np.array([0.299, 0.587, 0.114])


def stats(rgba):
    op = rgba[..., 3] > 12
    if op.sum() < 10:
        return 0.0, 0.0
    rgb = rgba[..., :3]
    lstd = float(np.std(luma(rgb)[op]))
    sat = (rgb.max(2) - rgb.min(2))[op].mean() / 255.0
    return lstd, sat


def set_lum(color_rgb, master_rgba):
    """W3C SetLum(Cs, Lum(Cb)): Cs = flache Fraktionsfarbe (oben, mix-blend
    color), Cb = Graustufen-Master (unten, liefert Luma). Ergebnis traegt die
    Luma/Relief des Masters und die Chroma der Farbe. Identisch zum Browser."""
    cs = np.array(color_rgb, np.float32) / 255.0
    cs = np.broadcast_to(cs, master_rgba[..., :3].shape).copy()
    lb = luma(master_rgba[..., :3]) / 255.0                       # Lum(Cb)
    d = (lb - luma(cs))[..., None]
    c = cs + d                                                    # SetLum: shift
    # ClipColor: Gamut zurueckfalten, ohne die Luma zu aendern
    lum = luma(c)[..., None]
    n = c.min(2, keepdims=True)
    x = c.max(2, keepdims=True)
    lo = n < 0
    c = np.where(lo & (lum > n), lum + (c - lum) * lum / np.maximum(lum - n, 1e-6), c)
    hi = x > 1
    c = np.where(hi & (x > lum), lum + (c - lum) * (1 - lum) / np.maximum(x - lum, 1e-6), c)
    out = np.clip(c, 0, 1) * 255.0
    return np.dstack([out, master_rgba[..., 3]]).astype(np.uint8)


def _font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def band(rgba, label, w=1040, h=150, bg=(30, 30, 34)):
    """Asset opak-getrimmt, auf Hoehe h skaliert, linkes w-Fenster, ueber bg."""
    op = np.where(rgba[..., 3] > 12)
    if len(op[0]):
        y0, y1, x0, x1 = op[0].min(), op[0].max(), op[1].min(), op[1].max()
        rgba = rgba[y0:y1 + 1, x0:x1 + 1]
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    scale = h / im.height
    im = im.resize((max(1, int(im.width * scale)), h), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h + 26), (*bg, 255))
    ImageDraw.Draw(canvas).text((8, 5), label, font=_font(16), fill=(235, 235, 235))
    canvas.alpha_composite(im.crop((0, 0, min(w, im.width), h)), (0, 26))
    return canvas


def chain_on_source(src):
    """Die ECHTE Farbkette (process_ui_v2.steel_present + desat) auf dieselbe
    Quelle — zeigt, was die Kette anrichtet, unabhaengig vom mild ausgefallenen
    Versand-Artefakt. Gibt LumaStd zurueck (oder None, falls Import scheitert)."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(__file__))
        from process_ui_v2 import steel_present, desat  # noqa: PLC0415
        rgb, a = src[..., :3].copy(), src[..., 3]
        crushed = steel_present(desat(rgb, a, sat=0.92), a)
        return stats(np.dstack([crushed, a]))[0]
    except Exception as ex:  # noqa: BLE001
        print("  (chain_on_source uebersprungen:", ex, ")")
        return None


def main():
    old, new, src = load(OLD), load(NEW), load(SRC)
    lo, so = stats(old)
    ln, sn = stats(new)
    ls, ss = stats(src)
    lc = chain_on_source(src)
    tint = set_lum(TINT, new.astype(np.float32))
    lt, st = stats(tint.astype(np.float32))

    print("== MODERAT-Panel-Leiste — Relief (LumaStd) und Saettigung ==")
    print(f"  QUELLE (cut)        LumaStd={ls:5.1f}  sat={ss:.3f}")
    if lc is not None:
        print(f"  KETTE auf Quelle    LumaStd={lc:5.1f}            <- steel_present+desat zerdrueckt")
    print(f"  ALTE KETTE  (v2)    LumaStd={lo:5.1f}  sat={so:.3f}   <- Versand-Artefakt")
    print(f"  NEUER MASTER(v3)    LumaStd={ln:5.1f}  sat={sn:.3f}   <- achromatisch, Relief erhalten")
    print(f"  GETOENT (Browser)   LumaStd={lt:5.1f}  sat={st:.3f}   <- Relief = Master (Toenung flach)")
    keep = ln / max(ls, 1e-6) * 100.0
    print(f"\n  Master vs Quelle:   {keep:.0f} % Relief erhalten (SetLum aendert die Luma nicht)")
    if lc is not None:
        print(f"  Master vs Kette:    +{(ln - lc) / max(lc, 1e-6) * 100:.0f} % Relief gegenueber der Kette")
    print(f"  LumaStd-Schwelle >= 45: {'ERFUELLT' if ln >= 45 else 'unter Schwelle'} ({ln:.1f}) "
          f"— Quellen-Decke dieser (bewusst ruhigsten) Leiste: {ls:.1f}")

    rows = [band(old, "1  ALTE KETTE  v2/.../strip_h_e.png  (relight+palette+steel_present+grain)"),
            band(new, "2  NEUER MASTER  v3/.../strip_h_e.png  (freistellen+trim, achromatisch, Median~162)"),
            band(tint.astype(np.float32), "3  GETOENT  Master + CSS mix-blend color (SetLum) — Platzhalter-Magenta")]
    W = max(r.width for r in rows)
    H = sum(r.height for r in rows) + 8 * (len(rows) - 1)
    sheet = Image.new("RGBA", (W, H), (16, 16, 18, 255))
    y = 0
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height + 8
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.convert("RGB").save(OUT)
    print(f"\n  Vorher/Nachher: {os.path.relpath(OUT, ROOT)}  ({W}x{H})")


if __name__ == "__main__":
    main()
