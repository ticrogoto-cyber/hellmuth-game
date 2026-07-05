#!/usr/bin/env python3
"""
hud_input_proof.py — Paket D Melde-Zaesur: Klick-Geometrie + Ressourcen-Worst-Case.

Klick-Geometrie: rendert das HUD ueber einer Welt-Flaeche (#world) und prueft per
document.elementFromPoint, was an Testpunkten getroffen wird — bei 16:9/21:9/4:3.
Sichtbare Panels/Leiste schlucken Welt-Klicks, transparente Luecken lassen sie
durch. Das DOM ist die einzige Wahrheit (keine hartkodierte Parallel-Geometrie).

Ressourcen: fuellt die Felder mit dem Worst-Case (99999 / 9999/9999) und prueft,
dass nichts ueber die Box laeuft (rechtsbuendig, tabular-nums).

Lauf: python3 tools/hud_input_proof.py
"""
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
OUT = os.path.join(ROOT, "docs/proof/paket_d_input.png")
TINT = {"hellmuth": "#b9a14a", "moderat": "#c0407a"}
CORNER = os.path.join(ROOT, "public/sprites/ui/hud/emblem_corner/hellmuth.png")
BAR_TILE_PX = 144 * 92 / 234
ASPECTS = [("16:9", 1920, 1080), ("21:9", 2560, 1080), ("4:3", 1440, 1080)]
RES = ["99999", "99999", "99999", "9999/9999"]  # Worst-Case (5-stellig / 4-Slash)

PROBE_JS = """() => {
  const C = sel => { const e=document.querySelector(sel); if(!e) return null;
    const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]; };
  const W=innerWidth, H=innerHeight;
  const pts = [['Emblem',C('.p-emblem')],['Menue',C('.p-menu')],['Minimap',C('.p-minimap')],
    ['Einheitenkarte',C('.p-unitcard')],['Ressourcen',C('.p-resources')],
    ['Leiste(frei)',[W*0.22,H-6]],['Welt-oben',[W*0.5,H*0.32]],['Welt-links',[W*0.38,H*0.55]]];
  return pts.filter(p=>p[1]).map(([name,[x,y]])=>{
    const el=document.elementFromPoint(x,y); let hit='WELT';
    if(el){ const p=el.closest('#hud .panel');
      if(p) hit=(p.className.match(/p-[\\w]+/)||['HUD'])[0];
      else if(el.closest('#hud .hud-bar')) hit='Leiste';
      else if(el.closest('#hud')) hit='HUD'; }
    return {name,x:Math.round(x),y:Math.round(y),hit}; });
}"""


def tinted_url(uri, color, w, h):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
           f'<filter id="t" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0" result="g"/>'
           f'<feFlood flood-color="{color}" result="f"/><feBlend in="g" in2="f" mode="luminosity" result="d"/>'
           f'<feComposite in="d" in2="SourceAlpha" operator="in"/></filter>'
           f'<image href="{uri}" width="{w}" height="{h}" preserveAspectRatio="none" filter="url(#t)"/></svg>')
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="") + '")'


def harness(css, fac):
    fu, fw, fh = _data_uri(FRAME_OUT)
    bu, bw, bh = _data_uri(BAR_OUT)
    frame = tinted_url(fu, TINT[fac], fw, fh)
    bar = tinted_url(bu, TINT[fac], bw, bh)
    tile_vw = f"{BAR_TILE_PX / 19.2:.4f}vw"
    res = "".join(f'<div class="res-icon q{i}"></div><div class="res-val q{i}"><span class="rv">{RES[i]}</span></div>'
                  for i in range(4))
    panels = (f'<div class="panel p-emblem"><div class="emb-name">{fac.upper()}</div></div>'
              '<div class="panel p-menu"><div class="menu-text">MENÜ</div></div>'
              '<div class="panel p-minimap"></div><div class="panel p-unitcard"></div>'
              f'<div class="panel p-resources">{res}</div>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;}} body{{background:#36443c;}}
#world{{position:fixed;inset:0;z-index:0;pointer-events:auto;}}
{css}
</style></head><body>
<div id="world"></div>
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


def _font(sz, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    p = f"/usr/share/fonts/truetype/dejavu/{name}"
    return ImageFont.truetype(p, sz) if os.path.exists(p) else ImageFont.load_default()


def label(img, text, h=26):
    out = Image.new("RGB", (img.width, img.height + h), (16, 16, 18))
    ImageDraw.Draw(out).text((8, 5), text, font=_font(15), fill=(235, 235, 235))
    out.paste(img.convert("RGB"), (0, h))
    return out


def main():
    with open(CSS, encoding="utf-8") as f:
        css = f.read()
    exe = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") + [None])[0]
    rows, all_ok = [], True
    res_crop = None
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=["--no-sandbox", "--disable-gpu"])
        pg = b.new_page(viewport={"width": 1920, "height": 1080})
        for name, w, h in ASPECTS:
            pg.set_viewport_size({"width": w, "height": h})
            pg.set_content(harness(css, "hellmuth")); pg.wait_for_timeout(150)
            probes = pg.evaluate(PROBE_JS)
            shot = Image.open(io.BytesIO(pg.screenshot())).convert("RGB")
            dr = ImageDraw.Draw(shot)
            for pr in probes:
                world = pr["hit"] == "WELT"
                expect_world = pr["name"].startswith("Welt")
                ok = world == expect_world
                all_ok = all_ok and ok
                col = (90, 220, 90) if world else (235, 70, 70)
                x, y = pr["x"], pr["y"]
                dr.ellipse([x - 9, y - 9, x + 9, y + 9], outline=col, width=4)
                dr.text((x + 12, y - 8), f"{pr['name']}->{pr['hit']}{'' if ok else ' !!'}",
                        font=_font(15), fill=col)
            disp = shot.resize((960, int(960 * h / w)), Image.LANCZOS)
            rows.append(label(disp, f"HELLMUTH {name} — gruen=Welt erreichbar, rot=HUD schluckt (Klick-Geometrie aus DOM)"))
            if name == "16:9":
                # Ressourcen-Worst-Case-Ausschnitt
                e = pg.query_selector(".p-resources").bounding_box()
                pad = 24
                res_crop = Image.open(io.BytesIO(pg.screenshot())).convert("RGB").crop(
                    (int(e["x"] - pad), int(e["y"] - pad), int(e["x"] + e["width"] + pad), int(e["y"] + e["height"] + pad))
                ).resize((360, int((e["height"] + 2 * pad) * 360 / (e["width"] + 2 * pad))), Image.LANCZOS)
        pg.close(); b.close()

    print("== Klick-Geometrie (document.elementFromPoint, alle Verhaeltnisse) ==")
    print("   Panels/Leiste -> HUD schluckt; Welt-Punkte -> WELT.  Gesamt:",
          "ALLE KORREKT" if all_ok else "FEHLER")
    if res_crop is not None:
        rows.append(label(res_crop, "Ressourcen-Worst-Case 99999 / 9999/9999 — rechtsbuendig, tabular, in der Box"))

    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height + 8 for r in rows)), (10, 10, 12))
    y = 0
    for r in rows:
        sheet.paste(r, ((W - r.width) // 2, y)); y += r.height + 8
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print(f"\nBeleg: {os.path.relpath(OUT, ROOT)}  ({sheet.width}x{sheet.height})")


if __name__ == "__main__":
    main()
