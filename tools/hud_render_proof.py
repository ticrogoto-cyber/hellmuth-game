#!/usr/bin/env python3
"""
hud_render_proof.py — Paket B Melde-Zaesur: gerendertes Bild beider Fraktionen.

Rendert das HUD-Gerippe (5 Panels + durchgehende Leiste) in echtem Chromium mit
DEMSELBEN Substrat wie das Spiel: ein Graustufen-Master-Nine-Slice + Bar-Rapport,
luminanzerhaltend getoent (SVG feBlend luminosity), border-image/background round.

Belegt:
  1. Kacheln waechst mit der Bildbreite (Motiv-Wiederholungen 1080p < 1440p < 4K),
     scharf, kein angeschnittener Endkachel (round).
  2. Ecken sauber: 4x-Zoom auf eine Panel-Ecke (nativer Nine-Slice, kein Spalt).
  3. Eine Quelle, zwei Fraktionen: identischer Master, nur die Toenung wechselt.

Lauf: python3 tools/hud_render_proof.py
"""
import glob
import io
import json
import os
import sys
import urllib.parse

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from build_hud_frame import _data_uri, FRAME_OUT, BAR_OUT  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
CSS = os.path.join(ROOT, "src/ui/hud.css")
OUT = os.path.join(ROOT, "docs/proof/paket_b_frame.png")
TINT = {"hellmuth": "#b9a14a", "moderat": "#c0407a"}  # FACTION_TINT_PLACEHOLDER
BAR_TILE_PX = 144 * 92 / 234  # Rapport-Aspekt auf 92px Bandhoehe (= bottomBar())


def tinted_url(uri, color, w, h):
    """Python-Spiegel von hud_tint.tintedBorderImage (eingebetteter Master)."""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<filter id="t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feColorMatrix type="saturate" values="0" result="g"/>'
        f'<feFlood flood-color="{color}" result="f"/>'
        f'<feBlend in="g" in2="f" mode="luminosity" result="d"/>'
        f'<feComposite in="d" in2="SourceAlpha" operator="in"/>'
        f'</filter>'
        f'<image href="{uri}" width="{w}" height="{h}" preserveAspectRatio="none" filter="url(#t)"/>'
        f'</svg>'
    )
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="") + '")'


def harness(css, faction):
    fu, fw, fh = _data_uri(FRAME_OUT)
    bu, bw, bh = _data_uri(BAR_OUT)
    frame = tinted_url(fu, TINT[faction], fw, fh)
    bar = tinted_url(bu, TINT[faction], bw, bh)
    tile_vw = f"{BAR_TILE_PX / 19.2:.4f}vw"
    panels = "".join(f'<div class="panel p-{p}"></div>'
                     for p in ("emblem", "menu", "minimap", "unitcard", "resources"))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;}}
body{{background:#36443c;}}  /* faux Spielwelt-Gruen, damit Rahmen/Leiste lesen */
{css}
</style></head><body>
<div id="hud" class="faction-{faction} select-single">
  <div class="hud-bar"></div>{panels}
</div>
<script>
  var hud=document.getElementById('hud');
  hud.style.setProperty('--frame-img', {json.dumps(frame)});
  var bar=document.querySelector('.hud-bar');
  bar.style.backgroundImage={json.dumps(bar)};
  bar.style.backgroundSize={json.dumps(tile_vw + " 100%")};
</script></body></html>"""


def tiling_html(css, widths):
    """Pruefstand fuer `round`: dieselbe getoente Bar-Quelle in Containern
    WACHSENDER Breite (gleiche Aufloesung). round -> Kachelzahl ∝ Breite; der
    Fehlerfall `stretch` haelt sie konstant."""
    bu, bw, bh = _data_uri(BAR_OUT)
    bar = tinted_url(bu, TINT["moderat"], bw, bh)
    tile_vw = f"{BAR_TILE_PX / 19.2:.4f}vw"
    rows = ""
    for i, w in enumerate(widths):
        rows += (f'<div class="t" data-w="{w}" style="position:absolute;left:0;top:{i*100}px;'
                 f'width:{w}px;height:80px;background-color:#1a1418;background-repeat:round;'
                 f'background-size:{tile_vw} 100%"></div>')
    return (f'<!doctype html><body style="margin:0;background:#0c0c0e">{rows}'
            f'<style>{css}</style><script>for(const e of document.querySelectorAll(".t"))'
            f'e.style.backgroundImage={json.dumps(bar)};</script></body>')


def count_repeats(png_bytes):
    """Kachelzahl = Breite / Grundperiode (Autokorrelation der Mittelzeile; erster
    starker Peak = Kachelbreite, robuster gegen Harmonische als reine FFT)."""
    im = np.asarray(Image.open(io.BytesIO(png_bytes)).convert("L")).astype(np.float32)
    row = im[im.shape[0] // 2]
    row = row - row.mean()
    ac = np.correlate(row, row, "full")[len(row) - 1:]
    # Kachelbreite ist ~56px (Rapport-Aspekt auf 92px), unabhaengig von der
    # Containerbreite -> Lag-Suche auf ein festes Fenster um die Grundperiode.
    lo, hi = 30, min(len(row) // 2, 110)
    lag = int(np.argmax(ac[lo:hi])) + lo
    return int(round(len(row) / lag))


def _font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def label(img, text, h=26):
    out = Image.new("RGB", (img.width, img.height + h), (16, 16, 18))
    ImageDraw.Draw(out).text((8, 5), text, font=_font(15), fill=(235, 235, 235))
    out.paste(img, (0, h))
    return out


def main():
    with open(CSS, encoding="utf-8") as f:
        css = f.read()
    exe = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") + [None])[0]
    widths = [480, 960, 1920]
    full, zoom, strips, reps = {}, {}, {}, {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox", "--disable-gpu"])
        # 1+2: vollstaendiges HUD-Gerippe beider Fraktionen (ein Master, Toenung wechselt)
        for fac in ("hellmuth", "moderat"):
            pg = b.new_page(viewport={"width": 1920, "height": 1080})
            pg.set_content(harness(css, fac)); pg.wait_for_timeout(150)
            full[fac] = pg.screenshot()
            im = Image.open(io.BytesIO(full[fac])).convert("RGB")
            zoom[fac] = im.crop((496, 799, 646, 949)).resize((600, 600), Image.NEAREST)
            pg.close()
        # Kachel-Pruefstand: round -> Kachelzahl waechst mit der Kantenlaenge
        pg = b.new_page(viewport={"width": 1920, "height": 360})
        pg.set_content(tiling_html(css, widths)); pg.wait_for_timeout(150)
        for i, w in enumerate(widths):
            png = pg.screenshot(clip={"x": 0, "y": i * 100, "width": w, "height": 80})
            reps[w] = count_repeats(png)
            strips[w] = Image.open(io.BytesIO(png)).convert("RGB")
        pg.close()
        b.close()

    print("== `round`-Beleg: Kachelzahl der Bar-Quelle vs. Kantenlaenge (1920px Viewport) ==")
    base = reps[widths[0]] / widths[0]
    for w in widths:
        print(f"  Breite {w:4d}px -> {reps[w]:3d} Kacheln  (∝ Breite: erwartet ~{base*w:.0f}; "
              f"konstant waere der stretch-Fehler)")

    rows = []
    for fac in ("hellmuth", "moderat"):
        im = Image.open(io.BytesIO(full[fac])).convert("RGB").resize((960, 540), Image.LANCZOS)
        rows.append(label(im, f"{fac.upper()}  1920x1080  — EIN Graustufen-Master, Toenung {TINT[fac]}"))
    zr = Image.new("RGB", (zoom["hellmuth"].width * 2 + 8, zoom["hellmuth"].height), (16, 16, 18))
    zr.paste(zoom["hellmuth"], (0, 0)); zr.paste(zoom["moderat"], (zoom["hellmuth"].width + 8, 0))
    rows.append(label(zr, "Panel-Ecke 4x (Einheitenkarte o.l.): HELLMUTH | MODERAT — nativer Nine-Slice, kein Spalt"))
    for w in widths:
        sw = strips[w].resize((min(960, w), strips[w].height * min(960, w) // w), Image.LANCZOS) if w > 960 \
            else strips[w]
        rows.append(label(sw, f"Bar-Quelle, Container {w}px -> {reps[w]} Kacheln (round, waechst mit Kantenlaenge)"))

    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height + 8 for r in rows)), (10, 10, 12))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y)); y += r.height + 8
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print(f"\n  Beleg: {os.path.relpath(OUT, ROOT)}  ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
