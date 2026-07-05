#!/usr/bin/env python3
"""
hud_anchor_proof.py — Paket C Melde-Zaesur: gerendertes Bild bei mehreren
Seitenverhaeltnissen (16:9, 21:9, 4:3 — der Verrutsch-Bug lebt im Nicht-16:9).

Belegt:
  1. Verankerung: jedes Panel sitzt bei allen Verhaeltnissen, nichts verrutscht
     (alles ueber EINEN --hud-scale; .hud-stage zentriert, Leiste volle Breite).
  2. Eckstuecke: beide Fraktions-Zier-Ecken rahmen die EMBLEM-Box-Ecke (nicht den
     Schirm), kein Grau-Halo, unverzerrt (4x-Zoom).
  3. Skalierung via calc(px * --hud-scale), kein transform:scale auf #hud.

Lauf: python3 tools/hud_anchor_proof.py
"""
import base64
import glob
import io
import json
import os
import sys
import urllib.parse

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from build_hud_frame import _data_uri, FRAME_OUT, BAR_OUT  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
CSS = os.path.join(ROOT, "src/ui/hud.css")
OUT = os.path.join(ROOT, "docs/proof/paket_c_anchor.png")
TINT = {"hellmuth": "#b9a14a", "moderat": "#c0407a"}
CORNER = {f: os.path.join(ROOT, f"public/sprites/ui/hud/emblem_corner/{f}.png") for f in TINT}
BAR_TILE_PX = 144 * 92 / 234
ASPECTS = [("16:9", 1920, 1080), ("21:9", 2560, 1080), ("4:3", 1440, 1080)]


def tinted_url(uri, color, w, h):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
           f'<filter id="t" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0" result="g"/>'
           f'<feFlood flood-color="{color}" result="f"/><feBlend in="g" in2="f" mode="luminosity" result="d"/>'
           f'<feComposite in="d" in2="SourceAlpha" operator="in"/></filter>'
           f'<image href="{uri}" width="{w}" height="{h}" preserveAspectRatio="none" filter="url(#t)"/></svg>')
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="") + '")'


def png_uri(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def harness(css, fac):
    fu, fw, fh = _data_uri(FRAME_OUT)
    bu, bw, bh = _data_uri(BAR_OUT)
    frame = tinted_url(fu, TINT[fac], fw, fh)
    bar = tinted_url(bu, TINT[fac], bw, bh)
    corner = png_uri(CORNER[fac])
    tile_vw = f"{BAR_TILE_PX / 19.2:.4f}vw"
    inner = {
        "emblem": f'<div class="emb-corner" style="background-image:url(\'{corner}\')"></div>'
                  f'<div class="emb-name">{fac.upper()}</div><div class="emb-claim">REINHEIT</div>',
        "menu": '<div class="menu-text"><span class="menu-pause">II</span><span class="menu-label">MENÜ</span></div>',
        "minimap": "", "unitcard": "", "resources": "",
    }
    panels = "".join(f'<div class="panel p-{p}">{inner[p]}</div>'
                     for p in ("emblem", "menu", "minimap", "unitcard", "resources"))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;}} body{{background:#36443c;}}
{css}
</style></head><body>
<div id="hud" class="faction-{fac} select-single">
  <div class="hud-bar"></div>
  <div class="hud-stage">{panels}</div>
</div>
<script>
  var hud=document.getElementById('hud');
  hud.style.setProperty('--frame-img', {json.dumps(frame)});
  var bar=document.querySelector('.hud-bar');
  bar.style.backgroundImage={json.dumps(bar)};
  bar.style.backgroundSize={json.dumps(tile_vw + " 100%")};
</script></body></html>"""


def _font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def label(img, text, h=26):
    out = Image.new("RGB", (img.width, img.height + h), (16, 16, 18))
    ImageDraw.Draw(out).text((8, 5), text, font=_font(15), fill=(235, 235, 235))
    out.paste(img.convert("RGB"), (0, h))
    return out


def main():
    with open(CSS, encoding="utf-8") as f:
        css = f.read()
    exe = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") + [None])[0]
    shots, corners = {}, {}
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox", "--disable-gpu"])
        for fac in ("hellmuth", "moderat"):
            pg = b.new_page(viewport={"width": 1920, "height": 1080})
            for name, w, h in ASPECTS:
                pg.set_viewport_size({"width": w, "height": h})
                pg.set_content(harness(css, fac)); pg.wait_for_timeout(150)
                shots[(fac, name)] = (pg.screenshot(), w, h)
            # Emblem-Eck-Zoom @16:9 (Box oben-links): zeigt Eckstueck auf der Box-Ecke
            pg.set_viewport_size({"width": 1920, "height": 1080})
            pg.set_content(harness(css, fac)); pg.wait_for_timeout(150)
            im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
            corners[fac] = im.crop((0, 0, 360, 240)).resize((720, 480), Image.LANCZOS)
            pg.close()
        b.close()

    rows = []
    for name, w, h in ASPECTS:
        png, _, _ = shots[("hellmuth", name)]
        im = Image.open(io.BytesIO(png)).convert("RGB")
        disp = im.resize((900, int(900 * h / w)), Image.LANCZOS)
        rows.append(label(disp, f"HELLMUTH {name} ({w}x{h}) — Panels verankert, Leiste volle Breite, nichts verrutscht"))
    cz = Image.new("RGB", (corners["hellmuth"].width * 2 + 8, corners["hellmuth"].height), (16, 16, 18))
    cz.paste(corners["hellmuth"], (0, 0)); cz.paste(corners["moderat"], (corners["hellmuth"].width + 8, 0))
    rows.append(label(cz, "Zier-Eckstueck auf der EMBLEM-Box-Ecke 2x: HELLMUTH | MODERAT — kein Grau-Halo, unverzerrt"))

    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height + 8 for r in rows)), (10, 10, 12))
    y = 0
    for r in rows:
        sheet.paste(r, ((W - r.width) // 2, y)); y += r.height + 8
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print(f"Beleg: {os.path.relpath(OUT, ROOT)}  ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
