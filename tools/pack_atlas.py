#!/usr/bin/env python3
"""
pack_atlas.py — packt eine PNG-Sequenz aus render_unit.py zu einem
Phaser-kompatiblen Spritesheet (PNG) + Atlas-JSON.

Eingabe-Dateinamen: <unit>_<clip>_<dir>_<frame>.png  (dir in Grad, 3-stellig)
Aufruf:
  python tools/pack_atlas.py --in build/sprites/helmut \
      --out-img assets/sprites/units/helmut.png \
      --out-json assets/sprites/units/helmut.json \
      --pivot 0.5 0.92 [--normalize] [--no-trim]

--normalize laesst jeden Frame durch normalize_asset.normalize_rgb laufen
(Pflicht laut asset-spec.md, falls die Frames noch roh sind).

--no-trim schaltet den Auto-Trim aus (Welle-1-Hebel H2: cv2/PIL-Auto-Trim
spart 16-21 % Atlas-Byte am gemessenen Eingangssatz). Default ist Trim AN,
weil das vorherige `trimmed:false` hartcodiert die 16-21 % verschenkt hat.
"""

import argparse
import json
import math
import os
import re
import numpy as np
from PIL import Image

NAME = re.compile(r"^(?P<unit>.+)_(?P<clip>[^_]+)_(?P<dir>\d{3})_(?P<frame>\d+)\.png$", re.I)


def maybe_normalize(img: Image.Image, do: bool) -> Image.Image:
    if not do:
        return img
    from normalize_asset import normalize_rgb, DEFAULTS
    arr = np.asarray(img.convert("RGBA")).astype(np.float32) / 255.0
    rgb = normalize_rgb(arr[..., :3], DEFAULTS)
    out = np.concatenate([rgb, arr[..., 3:4]], axis=-1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    """Tight-Bounding-Box ueber alpha>0 (Welle-1-Hebel H2). Primaer cv2 (das
    `connectedComponents`-Pattern aus den Mess-Notes); Fallback PIL.getbbox,
    deckungsgleich +/-1 Pixel laut Welle-1-Messung an 4 echten Sprites.
    Liefert (left, top, right, bottom) im PIL-Konvention oder None bei leerem
    Alpha. Eingang ist RGBA; bei RGB ist die Box das ganze Bild."""
    rgba = img.convert("RGBA")
    try:
        import cv2
        arr = np.asarray(rgba)
        alpha = arr[:, :, 3]
        nz = cv2.findNonZero((alpha > 0).astype(np.uint8))
        if nz is None:
            return None
        x, y, w, h = cv2.boundingRect(nz)
        return (x, y, x + w, y + h)
    except ImportError:
        # Fallback: PIL getbbox auf dem Alpha-Kanal. Welle-1-Messung:
        # deckungsgleich zu cv2 +/-1 Pixel.
        alpha = rgba.split()[3]
        return alpha.getbbox()


def trim_frame(img: Image.Image, do_trim: bool) -> tuple[Image.Image, tuple[int, int]]:
    """Schneidet transparente Raender ab und liefert (trimmed_img, (ox, oy)),
    wobei (ox, oy) der Versatz vom Original-Ursprung zur Trim-Box ist. Ohne
    Trim oder ohne Alpha-Kanal: Identitaet."""
    if not do_trim:
        return img, (0, 0)
    bbox = alpha_bbox(img)
    if bbox is None:
        return img, (0, 0)
    left, top, right, bottom = bbox
    if (left, top, right, bottom) == (0, 0, img.width, img.height):
        return img, (0, 0)
    return img.crop(bbox), (left, top)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-img", required=True)
    ap.add_argument("--out-json", required=True)
    ap.add_argument("--pivot", type=float, nargs=2, default=[0.5, 0.92])
    ap.add_argument("--normalize", action="store_true")
    ap.add_argument("--no-trim", action="store_true",
                    help="Auto-Trim ausschalten (Welle-1-Hebel H2). "
                         "Default: Trim AN; ohne Trim wird der alte Bug "
                         "wiederhergestellt (16-21 %% Byte-Mehr).")
    args = ap.parse_args()

    files = []
    for f in sorted(os.listdir(args.inp)):
        m = NAME.match(f)
        if m:
            files.append((f, m.groupdict()))
    if not files:
        raise SystemExit(f"keine passenden PNGs in {args.inp}")

    do_trim = not args.no_trim

    raw = [(meta, maybe_normalize(Image.open(os.path.join(args.inp, f)), args.normalize))
           for f, meta in files]
    # (metadata, original_image, trimmed_image, (offset_x, offset_y))
    items = []
    for meta, original in raw:
        trimmed, offset = trim_frame(original, do_trim)
        items.append((meta, original, trimmed, offset))

    fw = max(it[2].width for it in items)
    fh = max(it[2].height for it in items)
    cols = math.ceil(math.sqrt(len(items)))
    rows = math.ceil(len(items) / cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))

    frames, anims = {}, {}
    for idx, (meta, original, trimmed, offset) in enumerate(items):
        cx, cy = (idx % cols) * fw, (idx // cols) * fh
        # zentriert einsetzen (gleiche Frame-Box fuer alle, Trim-Offset bleibt
        # im spriteSourceSize.x/y abgelegt -> Phaser positioniert korrekt)
        ox, oy = cx + (fw - trimmed.width) // 2, cy + (fh - trimmed.height) // 2
        sheet.alpha_composite(trimmed, (ox, oy))
        key = f"{meta['unit']}_{meta['clip']}_{meta['dir']}_{int(meta['frame']):02d}"
        frames[key] = {
            "frame": {"x": cx, "y": cy, "w": fw, "h": fh},
            "rotated": False,
            # Welle-1-Hebel H2: trimmed=true + echte spriteSourceSize. Die alte
            # Variante hatte `trimmed:false` hartcodiert -> 16-21 % Atlas-Byte
            # verschenkt; Trim-Offsets werden hier im Atlas-JSON gespeichert,
            # damit Phaser zur Laufzeit korrekt positioniert.
            "trimmed": do_trim and (trimmed.size != original.size or offset != (0, 0)),
            "spriteSourceSize": {
                "x": offset[0], "y": offset[1],
                "w": trimmed.width, "h": trimmed.height,
            },
            "sourceSize": {"w": original.width, "h": original.height},
        }
        anims.setdefault(f"{meta['clip']}_{meta['dir']}", []).append(key)

    for k in anims:
        anims[k].sort()

    os.makedirs(os.path.dirname(args.out_img) or ".", exist_ok=True)
    sheet.save(args.out_img)
    # Meta-Block-Schluessel = Einheitenname aus den Frames (war hartcodiert
    # "hellmuth" -> brach die Atlas->Manifest-Uebergabe fuer jede andere Einheit;
    # fuer hellmuth selbst unveraendert, da unit == "hellmuth").
    unit_key = items[0][0]["unit"] if items else "unit"
    atlas = {
        "frames": frames,
        "meta": {"image": os.path.basename(args.out_img),
                 "size": {"w": sheet.width, "h": sheet.height}, "scale": 1},
        unit_key: {"pivot": {"x": args.pivot[0], "y": args.pivot[1]},
                   "frameSize": {"w": fw, "h": fh},
                   "anims": anims},
    }
    with open(args.out_json, "w") as fh_:
        json.dump(atlas, fh_, indent=2)
    trim_tag = "Trim AN (H2)" if do_trim else "Trim AUS (Legacy-Bug)"
    print(f"Atlas: {len(frames)} Frames ({fw}x{fh}), {len(anims)} Clips/Richtungen "
          f"-> {args.out_img} + {args.out_json}  [{trim_tag}]")


if __name__ == "__main__":
    main()
