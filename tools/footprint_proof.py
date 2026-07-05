#!/usr/bin/env python3
"""
footprint_proof.py — Beleg fuer das Gebaeude-Skalierungsgesetz (asset-spec.md):
Sprite-Grundflaeche = Footprint x Tile (160x96 pro Tile). Rendert pro Gebaeude
ein Tile-Grid, markiert die Footprint-Raute und legt das ECHTE Sprite, skaliert
auf dispW = (w+h)*HALF_W = (w+h)*80, mit Unterkante-Mitte ins Rautenzentrum --
exakt dieselbe Iso-Mathematik und derselbe Anker wie src/entities/building.ts.

Lauf:  python3 tools/footprint_proof.py   (Ausgabe nach /tmp/fp/<name>.png)
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HW, HH = 80, 48  # HALF_W, HALF_H (Tile 160x96)
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.environ.get("SHOT_DIR", "/tmp/fp")


def gs(c, r):
    return ((c - r) * HW, (c + r) * HH)


def tile_corners(c, r):
    x, y = gs(c, r)
    return [(x, y - HH), (x + HW, y), (x, y + HH), (x - HW, y)]


def _font(sz, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", sz)
    except OSError:
        return ImageFont.load_default()


def panel(name, fp):
    w, h = fp["w"], fp["h"]
    GC, GR = w + 3, h + 3
    c0, r0 = 1, 1
    dispW = (w + h) * HW
    pts = [p for c in range(GC) for r in range(GR) for p in tile_corners(c, r)]
    cont = gs(c0 + (w - 1) / 2, r0 + (h - 1) / 2)
    spr, sh = None, 0
    p = os.path.join(ROOT, f"public/sprites/buildings/{name}.png")
    if os.path.exists(p):
        spr = Image.open(p).convert("RGBA")
        sh = int(spr.height * dispW / spr.width)
        spr = spr.resize((dispW, sh), Image.LANCZOS)
    sx0, sy0 = cont[0] - dispW / 2, cont[1] - sh
    pts += [(sx0, sy0), (sx0 + dispW, cont[1])]
    xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
    M, LABH = 40, 66
    ox, oy = M - min(xs), M - min(ys) + LABH
    W = int(max(xs) - min(xs) + 2 * M); H = int(max(ys) - min(ys) + 2 * M + LABH)
    im = Image.new("RGBA", (W, H), (34, 38, 34, 255)); d = ImageDraw.Draw(im)
    for c in range(GC):
        for r in range(GR):
            cor = [(x + ox, y + oy) for x, y in tile_corners(c, r)]
            infp = c0 <= c < c0 + w and r0 <= r < r0 + h
            if infp:
                d.polygon(cor, fill=(120, 180, 110, 90))
            d.line(cor + [cor[0]], fill=(150, 220, 140, 255) if infp else (110, 120, 110, 255), width=1)
    if spr is not None:
        im.alpha_composite(spr, (int(sx0 + ox), int(sy0 + oy)))
    fp_d = [(gs(c0, r0)[0] + ox, gs(c0, r0)[1] - HH + oy),
            (gs(c0 + w - 1, r0)[0] + HW + ox, gs(c0 + w - 1, r0)[1] + oy),
            (gs(c0 + w - 1, r0 + h - 1)[0] + ox, gs(c0 + w - 1, r0 + h - 1)[1] + HH + oy),
            (gs(c0, r0 + h - 1)[0] - HW + ox, gs(c0, r0 + h - 1)[1] + oy)]
    d.line(fp_d + [fp_d[0]], fill=(255, 210, 90, 255), width=3)
    by = max(ys) + oy + 14
    d.line([(sx0 + ox, by), (sx0 + dispW + ox, by)], fill=(255, 210, 90, 255), width=2)
    for ex in (sx0 + ox, sx0 + dispW + ox):
        d.line([(ex, by - 6), (ex, by + 6)], fill=(255, 210, 90, 255), width=2)
    d.rectangle([0, 0, W, LABH], fill=(18, 20, 18, 255))
    d.text((8, 6), name.upper(), fill=(255, 235, 180), font=_font(20))
    d.text((8, 32), f"Footprint {w}x{h} = {w*h} Tiles  |  Sprite-Breite {dispW}px = (w+h)*80 = Footprint-Breite",
           fill=(190, 230, 180), font=_font(15, bold=False))
    return im.convert("RGB")


def main():
    data = json.load(open(os.path.join(ROOT, "game/data/buildings.json")))
    bs = data["buildings"] if "buildings" in data else data
    os.makedirs(OUT, exist_ok=True)
    for name, v in bs.items():
        if v.get("role") == "resource":
            continue
        panel(name, v.get("grundflaeche", {"w": 1, "h": 1})).save(os.path.join(OUT, f"{name}.png"))
        print(f"proof: {name} {v.get('grundflaeche')}")


if __name__ == "__main__":
    main()
