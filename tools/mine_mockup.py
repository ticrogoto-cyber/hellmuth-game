#!/usr/bin/env python3
"""mine_mockup.py — Mockup-Ernte als EIN Batch-Werkzeug (CODE1-Kette, H8/E1).

Kommandokette: Upscale -> Text-Prompt-Segmentierung -> Freistellung -> Nacharbeit.
Eingabe ein Mockup + Prompt-Liste, Ausgabe benannte, freigestellte Einzel-PNGs
in einen Sichtungs-Ordner (NIE direkt in assets/source/ — menschliche Sichtung
ist Pflicht).

BELEGTE GRENZE (E1-Befund, in Ehren halten): brauchbar fuer Props bis etwa
150 px Quellgroesse im Mockup (nach 4x-Upscale = 600 px Material, Ziel <= 1,5-2x
der Crop-Groesse). KEINE Hero-Gebaeude — die muessen als Einzelbild in KREA/GPT
nachgeneriert werden. Schatten schneidet die Segmentierung mit ab oder mit rein;
Schatten in der Engine als weiches Ellipsen-Sprite rekonstruieren.

LIZENZBLOCK (Stack komplett kommerziell nutzbar, E1/E3-Belege):
  Real-ESRGAN (+anime_6B-Gewichte)   BSD-3-Clause   github.com/xinntao/Real-ESRGAN
  GroundingDINO                      Apache-2.0     github.com/IDEA-Research/GroundingDINO
  Grounded-SAM-2 / SAM2              Apache-2.0     github.com/IDEA-Research/Grounded-SAM-2
  rembg (+u2net Apache/isnet Apache) MIT            github.com/danielgatis/rembg
  BiRefNet (birefnet-general)        MIT            github.com/ZhengPeng7/BiRefNet
  pymatting                          MIT            github.com/pymatting/pymatting

HARTE WARNUNG: Die BiRefNet-Variante RMBG-2.0 (BRIA) ist NON-COMMERCIAL und im
Stack VERBOTEN. Ebenso verboten: FLUX.1-dev (NC), rembg u2net_portrait
(APDrawing-Daten NC-belastet). Nur die oben gelisteten Gewichte verwenden.

Stufen (jede faellt einzeln zurueck, wenn ihr Werkzeug fehlt — der Lauf bricht
nicht, er DEGRADIERT und meldet es):
  1. Upscale:   Real-ESRGAN x4 anime_6B; Fallback PIL-Lanczos x4 (deterministisch,
                halluziniert nichts, aber schaerft auch nichts).
  2. Segmente:  GroundingDINO+SAM2 mit Text-Prompts ("pine tree. stone house. ...");
                Fallback Connected-Components auf der Freistell-Maske (findet
                freistehende Objekte, kann sie aber nicht BENENNEN — Ausgabe
                heisst dann objekt_NN statt prompt-Name).
  3. Alpha:     rembg isnet-anime; Fallback birefnet-general; Fallback u2net.
  4. Nacharbeit: Halo-Erode (1 px) + Trim (+1 px Rand) via ImageMagick, Fallback cv2.

Gewichte holen:  bash tools/get_mining_weights.sh   (Checksummen-gesichert)
Netz-Doktrin: der Gewichts-Host entscheidet (docs/CONTAINER-WERKZEUGE.md).
Session-Messung 2026-07-02: github-Releases FREMDER Repos sind in Cloud-Sessions
proxy-gesperrt ("add_repo"-Wand), dl.fbaipublicfiles.com connect-tot ->
get_mining_weights.sh auf einer Maschine MIT offenem Netz laufen lassen und
tools/models/ herueberkopieren; danach laeuft alles offline.

Aufruf:
  python3 tools/mine_mockup.py --in docs/ref/tab-hud.png \
      --prompts "pine tree. stone house. monk. drone. rock. fence." \
      --out /tmp/mining_sichtung
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "tools" / "models"


def _log(msg: str) -> None:
    print(f"[mine] {msg}")


# --- Stufe 1: Upscale ---------------------------------------------------------

def upscale(img: Image.Image) -> tuple[Image.Image, str]:
    w8 = MODEL_DIR / "realesrgan" / "RealESRGAN_x4plus_anime_6B.pth"
    if w8.exists():
        try:
            import torch  # noqa: F401
            # RRDBNet-Bypass wie Welle-1-H8; anime_6B hat 6 Bloecke.
            from torch import nn  # noqa: F401
            _log("Real-ESRGAN anime_6B gefunden — torch-Bypass")
            return _realesrgan_x4(img, w8), "realesrgan-anime6b"
        except Exception as exc:  # noqa: BLE001
            _log(f"Real-ESRGAN-Fallback ({exc.__class__.__name__}: {exc})")
    out = img.resize((img.width * 4, img.height * 4), Image.LANCZOS)
    return out, "lanczos-x4 (DEGRADED: kein Real-ESRGAN-Gewicht)"


def _realesrgan_x4(img: Image.Image, weight: Path) -> Image.Image:
    import torch
    from torch import nn as _nn  # lokale RRDB-Definition, Welle-1-H8-Muster

    class RDB(_nn.Module):
        def __init__(self, nf=64, gc=32):
            super().__init__()
            self.c1 = _nn.Conv2d(nf, gc, 3, 1, 1)
            self.c2 = _nn.Conv2d(nf + gc, gc, 3, 1, 1)
            self.c3 = _nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
            self.c4 = _nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
            self.c5 = _nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
            self.l = _nn.LeakyReLU(0.2, True)

        def forward(self, x):
            x1 = self.l(self.c1(x))
            x2 = self.l(self.c2(torch.cat((x, x1), 1)))
            x3 = self.l(self.c3(torch.cat((x, x1, x2), 1)))
            x4 = self.l(self.c4(torch.cat((x, x1, x2, x3), 1)))
            x5 = self.c5(torch.cat((x, x1, x2, x3, x4), 1))
            return x5 * 0.2 + x

    class RRDB(_nn.Module):
        def __init__(self, nf, gc=32):
            super().__init__()
            self.r1, self.r2, self.r3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

        def forward(self, x):
            return self.r3(self.r2(self.r1(x))) * 0.2 + x

    class RRDBNet(_nn.Module):
        def __init__(self, nb=6, nf=64, gc=32):
            super().__init__()
            self.conv_first = _nn.Conv2d(3, nf, 3, 1, 1)
            self.body = _nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
            self.conv_body = _nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_up1 = _nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_up2 = _nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_hr = _nn.Conv2d(nf, nf, 3, 1, 1)
            self.conv_last = _nn.Conv2d(nf, 3, 3, 1, 1)
            self.l = _nn.LeakyReLU(0.2, True)

        def forward(self, x):
            fea = self.conv_first(x)
            fea = fea + self.conv_body(self.body(fea))
            fea = self.l(self.conv_up1(torch.nn.functional.interpolate(fea, scale_factor=2)))
            fea = self.l(self.conv_up2(torch.nn.functional.interpolate(fea, scale_factor=2)))
            return self.conv_last(self.l(self.conv_hr(fea)))

    net = RRDBNet()
    sd = torch.load(weight, map_location="cpu")
    net.load_state_dict(sd.get("params_ema", sd.get("params", sd)), strict=True)
    net.eval()
    x = torch.from_numpy(np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
                         ).permute(2, 0, 1)[None]
    with torch.no_grad():
        y = net(x)[0].clamp(0, 1).permute(1, 2, 0).numpy()
    return Image.fromarray((y * 255).astype(np.uint8))


# --- Stufe 2: Segmentierung ---------------------------------------------------

def segment(img: Image.Image, prompts: list[str]) -> tuple[list[dict], str]:
    gd = MODEL_DIR / "groundingdino" / "groundingdino_swint_ogc.pth"
    s2 = MODEL_DIR / "sam2" / "sam2.1_hiera_small.pt"
    if gd.exists() and s2.exists():
        try:
            return _grounded_sam2(img, prompts, gd, s2), "grounded-sam2"
        except Exception as exc:  # noqa: BLE001
            _log(f"Grounded-SAM-2-Fallback ({exc.__class__.__name__}: {exc})")
    return _connected_components(img), \
        "connected-components (DEGRADED: keine GroundingDINO/SAM2-Gewichte — Objekte unbenannt)"


def _grounded_sam2(img, prompts, gd_w, s2_w):
    # Import erst hier: groundingdino + sam2 sind pip-Pakete, die nur mit
    # Gewichten sinnvoll sind. Prompt-Format: "a. b. c." (GroundingDINO-Konvention).
    from groundingdino.util.inference import load_model, predict  # noqa: WPS433
    raise NotImplementedError(
        "Grounded-SAM-2-Zweig vorbereitet; erster Lauf braucht die Gewichte aus "
        "tools/get_mining_weights.sh und `pip install groundingdino-py sam2`.")


def _connected_components(img: Image.Image) -> list[dict]:
    """Interims-Ernte ohne Text-Prompts: erst global freistellen, dann
    zusammenhaengende Alpha-Inseln als Objekt-Kandidaten croppen."""
    from scipy import ndimage
    rgba = _rembg(img)
    a = np.asarray(rgba)[..., 3]
    lbl, n = ndimage.label(a > 32)
    out = []
    if not n:
        return out
    sizes = np.bincount(lbl.ravel())
    order = np.argsort(sizes[1:])[::-1] + 1
    for i, li in enumerate(order[:40]):
        if sizes[li] < 400:  # Mini-Splitter sind Ausschuss
            break
        ys, xs = np.where(lbl == li)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = rgba.crop((x0, y0, x1, y1))
        out.append({"name": f"objekt_{i:02d}", "img": crop,
                    "bbox": (int(x0), int(y0), int(x1), int(y1)),
                    "src_px": int(max(x1 - x0, y1 - y0) / 4)})  # Quellgroesse vor Upscale
    return out


# --- Stufe 3: Alpha -------------------------------------------------------------

_REMBG_SESSION = None


def _rembg(img: Image.Image) -> Image.Image:
    global _REMBG_SESSION
    from rembg import new_session, remove
    os.environ.setdefault("U2NET_HOME", str(MODEL_DIR / "u2net"))
    if _REMBG_SESSION is None:
        for model in ("isnet-anime", "birefnet-general", "u2net"):
            try:
                _REMBG_SESSION = new_session(model)
                _log(f"rembg-Modell: {model}" + ("" if model == "isnet-anime"
                     else " (DEGRADED: isnet-anime nicht verfuegbar)"))
                break
            except Exception:  # noqa: BLE001
                continue
        if _REMBG_SESSION is None:
            raise SystemExit("kein rembg-Modell verfuegbar — tools/get_mining_weights.sh")
    return remove(img.convert("RGBA"), session=_REMBG_SESSION)


# --- Stufe 4: Nacharbeit ---------------------------------------------------------

def postprocess(img: Image.Image) -> Image.Image:
    if shutil.which("convert"):
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            a, b = Path(td) / "a.png", Path(td) / "b.png"
            img.save(a)
            subprocess.run(["convert", str(a),
                            "-channel", "A", "-morphology", "Erode", "Disk:1", "+channel",
                            "-trim", "+repage",
                            "-bordercolor", "none", "-border", "1x1", str(b)],
                           check=True, capture_output=True)
            return Image.open(b).convert("RGBA")
    import cv2
    arr = np.asarray(img).copy()
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    arr[..., 3] = cv2.erode(arr[..., 3], k)
    nz = cv2.findNonZero((arr[..., 3] > 0).astype(np.uint8))
    if nz is not None:
        x, y, w, h = cv2.boundingRect(nz)
        arr = arr[y:y + h, x:x + w]
    return Image.fromarray(arr)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="inp", required=True, help="Mockup-PNG")
    ap.add_argument("--prompts", default="",
                    help='Prompt-Liste im GroundingDINO-Format: "pine tree. stone house. rock."')
    ap.add_argument("--out", required=True, help="Sichtungs-Ordner (NIE assets/source/)")
    ap.add_argument("--no-upscale", action="store_true")
    args = ap.parse_args()

    out_dir = Path(args.out)
    if "assets/source" in str(out_dir.resolve()):
        raise SystemExit("VERBOT: Ausgabe nach assets/source/ (Brief-Rahmen).")
    out_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(args.inp).convert("RGB")
    _log(f"Eingabe {args.inp} ({img.width}x{img.height})")

    if args.no_upscale:
        up, tag1 = img, "kein Upscale (--no-upscale)"
    else:
        up, tag1 = upscale(img)
    _log(f"Stufe 1: {tag1} -> {up.width}x{up.height}")

    prompts = [p.strip() for p in args.prompts.split(".") if p.strip()]
    objects, tag2 = segment(up, prompts)
    _log(f"Stufe 2: {tag2} -> {len(objects)} Kandidaten")

    kept, skipped = 0, 0
    report = []
    for o in objects:
        crop = postprocess(o["img"])
        # E1-Grenze: Quellgroesse > 150 px im Mockup -> WARN (Hero-Kandidat)
        warn = " GRENZE:>150px-Quelle (Hero? nachgenerieren!)" if o["src_px"] > 150 else ""
        name = f"{o['name']}.png"
        crop.save(out_dir / name)
        report.append(f"  {name:24} bbox={o['bbox']} quelle~{o['src_px']}px{warn}")
        kept += 1
    for line in report:
        print(line)
    _log(f"fertig: {kept} PNGs in {out_dir} (Sichtung durch Mensch ist Pflicht)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
