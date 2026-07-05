#!/usr/bin/env python3
"""Stellt ALLE Quell-UI-Assets frei (RGBA mit echter Alpha-Matte).

Primaerpfad (Welle-1-Hebel H1): rembg + u2net-ONNX, KI-Salienz. Modellgewicht
laedt rembg beim Erststart von github.com/danielgatis/rembg/releases/.../u2net.onnx
(GitHub-Release, kein Hugging Face). Welle-1-Messung gegen Ticros Handfreistellung:
IoU 96,5 %, mittlere Alpha-Diff 5/255. ~3 s/Bild CPU.

Refine-Hook (Welle-2-Hebel, CONTAINER-WERKZEUGE-2.md A): `pymatting` als
Closed-Form-/KNN-Matting-Schicht NACH rembg. Welle-2-Messung an rembg-Ausgabe:
**Bimodal-Score 0,780 -> 0,790** (weniger Halo, ~1,1 s/Bild CPU). Optional via
`--no-pymatting`. Bimodal-Score = Pixel-Anteil mit alpha<16 ODER alpha>240
(saubere Matte ist bimodal); Score 1,0 waere perfekt, jeder Halo-Pixel
zieht den Score runter. Score wird pro Asset vor und nach Refine gemeldet.

Fallback-Pfad (--legacy): der alte Rand-Flood-Fill aus process_ui_v2 (freistellen
+ stab_pockets). Funktioniert per Docstring NUR bei einheitlich grauem Hintergrund,
bricht bei randberuehrenden Objekten. Bleibt fuer Reproduzierbarkeit alter Staende.

Aufruf:
  python3 tools/freistellen_all.py                # rembg + pymatting (Default)
  python3 tools/freistellen_all.py --no-pymatting # nur rembg, ohne Refine
  python3 tools/freistellen_all.py --legacy       # Rand-Flood-Fill (alt)
  python3 tools/freistellen_all.py --rembg-model u2netp  # leichteres Modell
  python3 tools/freistellen_all.py --in assets/source/ui/orn --out /tmp/raw

Cache:  U2NET_HOME=hellmuth/tools/models/u2net (persistent ueber Laeufe).
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent          # hellmuth/
SRC_DEFAULT = ROOT / "assets/source/ui"
OUT_DEFAULT = SRC_DEFAULT / "freigestellt"
SUBS_DEFAULT = ("orn", "violett")
MODEL_CACHE = ROOT / "tools" / "models" / "u2net"


def _set_u2net_home() -> None:
    """Persistenter Modell-Cache; verhindert Re-Download zwischen Laeufen."""
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("U2NET_HOME", str(MODEL_CACHE))


def _legacy_pipeline(rgb: np.ndarray):
    """Alter Rand-Flood-Fill aus process_ui_v2 (--legacy)."""
    from process_ui_v2 import freistellen, stab_pockets, save  # noqa: WPS433
    alpha, bg, rgb = freistellen(rgb)
    alpha = stab_pockets(rgb, alpha, bg)
    return rgb, alpha, save


def _save_rgba(rgba: Image.Image, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dst)


def _rembg_session(model: str):
    """Lazy-Import: bei fehlendem rembg klare Fehlermeldung mit Hinweis auf
    werkzeuge_check --install (Werkzeug-Bekanntmachung, KONVENTIONEN.md)."""
    try:
        from rembg import new_session  # noqa: WPS433
    except ImportError as exc:
        raise SystemExit(
            "rembg fehlt. Installation:  python3 tools/werkzeuge_check.py --install\n"
            "Alternativ:  pip install rembg onnxruntime\n"
            "Oder Reproduktion alter Staende:  --legacy\n"
            f"(Original-Fehler: {exc})"
        ) from exc
    return new_session(model)


def _bimodal_score(alpha: np.ndarray) -> float:
    """Pixel-Anteil in [0..15] oder [240..255]. Saubere Matte ist bimodal
    (entweder fest Vordergrund oder fest Hintergrund), Halo druekt den Score."""
    extremes = ((alpha < 16) | (alpha > 240)).sum()
    return float(extremes) / float(alpha.size)


def _pymatting_refine(rgba: np.ndarray) -> tuple[np.ndarray, str]:
    """Verfeinert das rembg-Alpha via Closed-Form-Matting. Trimap-Heuristik:
    erodiertes Vordergrund (alpha>=240) = sicher FG, dilatiertes Hintergrund
    (alpha<=15) = sicher BG, dazwischen = unknown. Liefert (refined_rgba, tag)
    oder (rgba, 'skipped:<grund>') bei fehlendem pymatting."""
    try:
        from pymatting import estimate_alpha_cf  # noqa: WPS433
    except ImportError:
        return rgba, "skipped:pymatting-fehlt"
    try:
        import cv2  # noqa: WPS433
    except ImportError:
        return rgba, "skipped:cv2-fehlt"
    rgb = rgba[:, :, :3].astype(np.float64) / 255.0
    alpha = rgba[:, :, 3]
    trimap = np.full(alpha.shape, 0.5, dtype=np.float64)
    fg = (alpha >= 240).astype(np.uint8)
    bg = (alpha <= 15).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    fg = cv2.erode(fg, k3, iterations=2)
    bg = cv2.erode(bg, k3, iterations=2)
    trimap[fg.astype(bool)] = 1.0
    trimap[bg.astype(bool)] = 0.0
    # Robustheit: nach der Erosion kann die FG-Maske leer werden (sehr duenne
    # Ornamente). pymatting.trimap_split bricht dann mit ValueError ab. In dem
    # Fall ueberspringen wir den Refine und behalten das rembg-Alpha -- besser
    # ein nicht-refinetes Ergebnis als ein Pipeline-Halt mitten im Batch.
    if not (trimap >= 0.9).any() or not (trimap <= 0.1).any():
        return rgba, "skipped:trimap-leer-nach-erosion"
    refined = estimate_alpha_cf(rgb, trimap)
    refined_u8 = np.clip(refined * 255.0, 0, 255).astype(np.uint8)
    out = rgba.copy()
    out[:, :, 3] = refined_u8
    return out, "pymatting:cf"


def _rembg_one(src: Path, dst: Path, session, do_refine: bool) -> tuple[int, int, str]:
    """Liefert (opak-Pixel, total-Pixel, refine-Tag).
    Refine-Tag enthaelt Bimodal-Score vor/nach (oder Skip-Grund)."""
    from rembg import remove  # noqa: WPS433
    img = Image.open(src).convert("RGBA")
    out = remove(img, session=session)
    rgba = np.asarray(out)
    score_pre = _bimodal_score(rgba[:, :, 3])
    refine_tag = f"bm={score_pre:.3f}"
    if do_refine:
        rgba_ref, tag = _pymatting_refine(rgba)
        score_post = _bimodal_score(rgba_ref[:, :, 3])
        if tag.startswith("skipped"):
            refine_tag = f"bm={score_pre:.3f} {tag}"
        else:
            refine_tag = f"bm={score_pre:.3f}->{score_post:.3f} {tag}"
            rgba = rgba_ref
            out = Image.fromarray(rgba, "RGBA")
    _save_rgba(out, dst)
    return int((rgba[:, :, 3] > 12).sum()), int(rgba[:, :, 3].size), refine_tag


def _legacy_one(src: Path, dst: Path) -> tuple[int, int]:
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    rgb_norm, alpha, save = _legacy_pipeline(rgb)
    save(rgb_norm, alpha, str(dst))
    return int((alpha > 12).sum()), int(alpha.size)


def run(in_root: Path, out_root: Path, subs: tuple[str, ...], legacy: bool,
        model: str, refine: bool) -> int:
    session = None
    if not legacy:
        _set_u2net_home()
        session = _rembg_session(model)
    out_root.mkdir(parents=True, exist_ok=True)
    n = 0
    for sub in subs:
        sub_in = in_root / sub if (in_root / sub).is_dir() else in_root
        for p in sorted(glob.glob(str(sub_in / "*.png"))):
            src = Path(p)
            dst = out_root / src.name
            if legacy:
                opak, total = _legacy_one(src, dst)
                tag = "legacy"
            else:
                opak, total, tag = _rembg_one(src, dst, session, refine)
                tag = f"rembg/{model} {tag}"
            print(f"{sub:8} {src.name:34} {100 * opak / total:5.1f}% opak  [{tag}]")
            n += 1
    print(f"-> {n} Assets freigestellt nach {out_root}")
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="inp", default=str(SRC_DEFAULT))
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--legacy", action="store_true",
                    help="Rand-Flood-Fill (alte process_ui_v2-Pipeline) statt rembg.")
    ap.add_argument("--rembg-model", default="u2net",
                    help="rembg-Modellname (u2net, u2netp, …). Welle 1 hat u2net gemessen.")
    ap.add_argument("--no-pymatting", action="store_true",
                    help="pymatting-Refine nach rembg ausschalten (Default: an). "
                         "Welle-2-Mess: Bimodal-Score 0,780->0,790, ~1,1 s/Bild.")
    ap.add_argument("--subs", nargs="*", default=list(SUBS_DEFAULT),
                    help="Unterordner unter --in (Default: orn, violett).")
    args = ap.parse_args()
    refine = not args.no_pymatting and not args.legacy
    n = run(Path(args.inp), Path(args.out), tuple(args.subs), args.legacy,
            args.rembg_model, refine)
    return 0 if n > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
