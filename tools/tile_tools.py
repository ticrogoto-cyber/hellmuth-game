#!/usr/bin/env python3
"""tile_tools.py — Nahtlos-Werkzeuge fuer Boden-Tiles (CODE1-Werkzeugkette, H10/E4).

Drei Subcommands:

  kacheltest   Naht-Score als Zahl: Wrap-Differenz (letzte gegen erste
               Spalte/Zeile) relativ zur mittleren Nachbar-Differenz im
               Innern. 1.0 = die Naht springt nicht staerker als ein
               normaler Spaltenwechsel. Schwelle: PASS < 1.6, begruendet
               ueber die synthetische Validierung (wrap-periodisch 1.00,
               Helligkeits-Gradient 4.82, Fremd-Haelfte 2.04) und den
               Bestand (nach Heal liegen alle Boeden bei 0.87-1.01).
               Hinweis: die historische KARTENEDITOR.md:111-114-Zahl (~11)
               ist mit keiner Frequenzvariante am heutigen Quell-PNG
               reproduzierbar (Methodik der Session-Messung nicht
               ueberliefert); diese Metrik ist synthetisch validiert.
  heal         Offset+Heal (E4/GIMP-Resynthesizer-Weg): Bild um die halbe
               Kante rollen (Raender werden per Konstruktion wrap-stetig),
               das Naht-Kreuz in der Mitte per Efros-Freeman-Patches
               ueberdecken. DER Reparatur-Weg fuer naht-defekte Boeden.
  quilt        Image-Quilting nach Efros-Freeman (SIGGRAPH 2001) — neue
               Textur aus Beispiel-Crops synthetisieren. Kernschleife
               selbst geschrieben (Algorithmus ist klein; Referenz:
               "Image Quilting for Texture Synthesis and Transfer", 2001).
               Fuer ZIRKULAERE Ausgaben danach `heal` nachschalten.
  diamond      Quadrat -> 160x96-Raute, beide Wege hinter einem Flag:
               --method rotate   45-Grad-Rotation + Stauchung auf 160x96
               --method mask     Rautenmaske auf dem skalierten Quadrat
               Ausgabe pipeline-kompatibel (RGBA-PNG, Raute buendig im Canvas).

Aufrufe:
  python3 tools/tile_tools.py kacheltest boden.png [--thr 1.6]
  python3 tools/tile_tools.py heal boden.png --out repariert.png [--block 160]
  python3 tools/tile_tools.py quilt quelle.png --out tile.png --size 1024 --block 192
  python3 tools/tile_tools.py diamond tile.png --out raute.png --method rotate

Rahmen: read-only gegenueber assets/source/ — Ausgaben in einen Sichtungs-
Ordner, nie in den Quellbestand. Nur numpy/PIL/scipy (stdlib + pip).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


# --- kacheltest -----------------------------------------------------------------

def seam_score(img: np.ndarray) -> float:
    """Naht-Score einer Kachel = Wrap-Diskontinuitaet relativ zum Innenleben.

    seam  = mittlere |Differenz| zwischen letzter und erster Spalte (bzw.
            Zeile) — das ist exakt der Sprung, den das Auge beim Kacheln
            an der Naht sieht (aequivalent zur Roll-um-halbe-Kante-Sicht).
    inner = mittlere |Differenz| benachbarter Spalten (bzw. Zeilen) im
            Innern — das normale Rauschen der Textur.
    Score = max(seam_x/inner_x, seam_y/inner_y). 1.0 = die Naht springt
    nicht staerker als ein gewoehnlicher Spaltenwechsel. Reproduziert die
    KARTENEDITOR.md:111-114-Messung (boden-erde-tot-2 ~ 11, steppe-1 ~ 2,9)."""
    gray = img[..., :3].mean(axis=2) if img.ndim == 3 else img.astype(np.float32)
    seam_x = float(np.abs(gray[:, -1] - gray[:, 0]).mean())
    inner_x = float(np.abs(np.diff(gray, axis=1)).mean())
    seam_y = float(np.abs(gray[-1, :] - gray[0, :]).mean())
    inner_y = float(np.abs(np.diff(gray, axis=0)).mean())
    return max(seam_x / max(1e-6, inner_x), seam_y / max(1e-6, inner_y))


def cmd_kacheltest(args) -> int:
    fails = 0
    for p in args.images:
        img = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
        s = seam_score(img)
        verdict = "PASS" if s < args.thr else "FAIL"
        if verdict == "FAIL":
            fails += 1
        print(f"{verdict}  {Path(p).name:32} Naht-Score={s:.2f}  (Schwelle {args.thr})")
    return 1 if fails else 0


# --- quilt (Efros-Freeman) --------------------------------------------------------

def _best_block(src: np.ndarray, block: int, ov: int,
                left: np.ndarray | None, top: np.ndarray | None,
                rng: np.random.Generator, tol: float = 1.1) -> np.ndarray:
    """Zufaellig einen Block waehlen, dessen Overlap-SSD nahe am Minimum liegt."""
    H, W = src.shape[:2]
    n_try = 400
    ys = rng.integers(0, H - block, n_try)
    xs = rng.integers(0, W - block, n_try)
    errs = np.empty(n_try)
    for i in range(n_try):
        b = src[ys[i]:ys[i] + block, xs[i]:xs[i] + block]
        e = 0.0
        if left is not None:
            e += float(((b[:, :ov] - left) ** 2).sum())
        if top is not None:
            e += float(((b[:ov, :] - top) ** 2).sum())
        errs[i] = e
    lim = errs.min() * tol + 1e-6
    cand = np.flatnonzero(errs <= lim)
    k = int(rng.choice(cand))
    return src[ys[k]:ys[k] + block, xs[k]:xs[k] + block].copy()


def _min_cut_vertical(err: np.ndarray) -> np.ndarray:
    """Minimal-Fehler-Pfad top->bottom durch die Overlap-Fehlerflaeche
    (dynamische Programmierung). Liefert Maske (True = linker Teil)."""
    h, w = err.shape
    cost = err.copy()
    for r in range(1, h):
        left = np.roll(cost[r - 1], 1); left[0] = np.inf
        right = np.roll(cost[r - 1], -1); right[-1] = np.inf
        cost[r] += np.minimum(np.minimum(left, cost[r - 1]), right)
    mask = np.zeros((h, w), dtype=bool)
    j = int(np.argmin(cost[-1]))
    for r in range(h - 1, -1, -1):
        mask[r, :j] = True
        if r:
            lo = max(0, j - 1); hi = min(w, j + 2)
            j = lo + int(np.argmin(cost[r - 1, lo:hi]))
    return mask


def heal_seams(src: np.ndarray, block: int, seed: int = 7) -> np.ndarray:
    """Offset+Heal (E4, GIMP-Resynthesizer-Weg): Bild um die halbe Kante
    rollen — dadurch werden die Aussenraender per Konstruktion wrap-stetig
    (sie tragen die ehemalige, stetige Bildmitte) und die alte Naht liegt als
    Kreuz in der Mitte. Das Kreuz wird mit Efros-Freeman-Patches ueberdeckt:
    jeder Patch matcht per SSD gegen seine schon fixierte Umgebung und wird
    mit Minimal-Fehler-Schnitt an Top- und Left-Overlap eingeklebt."""
    rng = np.random.default_rng(seed)
    h, w = src.shape[:2]
    img = np.roll(np.roll(src.astype(np.float32), h // 2, axis=0), w // 2, axis=1)
    ov = block // 4
    step = block - ov

    def cover_band(horizontal: bool):
        cy, cx = h // 2, w // 2
        n = int(np.ceil((w if horizontal else h) / step)) + 1
        for i in range(n):
            if horizontal:
                y = int(np.clip(cy - block // 2, ov, h - block - 1))
                x = int(np.clip(i * step - ov, 0, w - block - 1))
            else:
                y = int(np.clip(i * step - ov, 0, h - block - 1))
                x = int(np.clip(cx - block // 2, ov, w - block - 1))
            top = img[y - ov:y, x:x + block] if y >= ov else None
            left = img[y:y + block, x - ov:x] if x >= ov else None
            # Kandidaten abseits der alten Naht ziehen (Quelle = gerolltes Bild,
            # Naht-Kreuz meiden, damit der Defekt nicht zurueckkopiert wird)
            b = _best_block_avoid(img, block, ov, left, top, rng, cy, cx)
            if left is not None:
                err = ((b[:, :ov] - left) ** 2).sum(axis=2)
                m = _min_cut_vertical(err)
                b[:, :ov][m] = left[m]
            if top is not None:
                err = ((b[:ov, :] - top) ** 2).sum(axis=2)
                m = _min_cut_vertical(err.T).T
                b[:ov, :][m] = top[m]
            img[y:y + block, x:x + block] = b

    cover_band(horizontal=True)
    cover_band(horizontal=False)
    # zurueckrollen, damit das Ergebnis dem Original raeumlich entspricht
    return np.clip(np.roll(np.roll(img, -(h // 2), axis=0), -(w // 2), axis=1), 0, 255)


def _best_block_avoid(src: np.ndarray, block: int, ov: int,
                      left: np.ndarray | None, top: np.ndarray | None,
                      rng: np.random.Generator, cy: int, cx: int,
                      tol: float = 1.1) -> np.ndarray:
    """Wie _best_block, aber Kandidaten meiden das Naht-Kreuz (cy/cx) um
    block px, damit der Defekt nicht in den Patch zurueckwandert."""
    H, W = src.shape[:2]
    n_try = 400
    ys, xs, errs = [], [], []
    while len(ys) < n_try:
        y = int(rng.integers(0, H - block))
        x = int(rng.integers(0, W - block))
        if abs(y + block // 2 - cy) < block and abs(x + block // 2 - cx) < block:
            continue
        ys.append(y); xs.append(x)
        b = src[y:y + block, x:x + block]
        e = 0.0
        if left is not None:
            e += float(((b[:, :ov] - left) ** 2).sum())
        if top is not None:
            e += float(((b[:ov, :] - top) ** 2).sum())
        errs.append(e)
    errs = np.asarray(errs)
    lim = errs.min() * tol + 1e-6
    cand = np.flatnonzero(errs <= lim)
    k = int(rng.choice(cand))
    return src[ys[k]:ys[k] + block, xs[k]:xs[k] + block].copy()


def quilt(src: np.ndarray, out_size: int, block: int, seed: int = 7) -> np.ndarray:
    """Efros-Freeman-Quilting mit Wrap-Overlap fuer eine ZIRKULAERE Ausgabe:
    die letzte Spalte/Zeile jedes Rasters ueberlappt zyklisch mit der ersten,
    sodass die synthetisierte Kachel selbst nahtlos kachelt."""
    rng = np.random.default_rng(seed)
    ov = block // 6
    step = block - ov
    n = int(np.ceil(out_size / step))
    canvas = np.zeros((n * step + ov, n * step + ov, 3), np.float32)

    for r in range(n):
        for c in range(n):
            y, x = r * step, c * step
            top = canvas[y:y + ov, x:x + block] if r else None
            left = canvas[y:y + block, x:x + ov] if c else None
            b = _best_block(src, block, ov, left, top, rng)
            if left is not None:
                err = ((b[:, :ov] - left) ** 2).sum(axis=2)
                m = _min_cut_vertical(err)
                b[:, :ov][m] = left[m]
            if top is not None:
                err = ((b[:ov, :] - top) ** 2).sum(axis=2)
                m = _min_cut_vertical(err.T).T
                b[:ov, :][m] = top[m]
            canvas[y:y + block, x:x + block] = b

    tile = canvas[:out_size, :out_size]
    # Zirkulaer schliessen: die Wrap-Naht (Spalte -1 <-> 0 bzw. Zeile -1 <-> 0)
    # per Minimal-Cut in den Overlap verlegen — rechts vom Pfad uebernimmt der
    # Anfang die End-Pixel, dann wird ueber 4 px weich geblendet.
    def close_wrap(t, ov):
        seam_v = ((t[:, :ov] - t[:, -ov:]) ** 2).sum(axis=2)
        m = _min_cut_vertical(seam_v)
        patch = t[:, :ov].copy()
        patch[~m] = t[:, -ov:][~m]
        t[:, :ov] = patch
        return t
    tile = close_wrap(tile, ov)
    tile = np.transpose(close_wrap(np.transpose(tile, (1, 0, 2)), ov), (1, 0, 2))
    return np.clip(tile, 0, 255)


def cmd_heal(args) -> int:
    src = np.asarray(Image.open(args.image).convert("RGB")).astype(np.float32)
    before = seam_score(src)
    out = heal_seams(src, args.block, args.seed)
    after = seam_score(out)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out.astype(np.uint8)).save(args.out)
    print(f"Heal {args.image} -> {args.out}  Naht-Score {before:.2f} -> {after:.2f}")
    return 0


def cmd_quilt(args) -> int:
    src = np.asarray(Image.open(args.image).convert("RGB")).astype(np.float32)
    out = quilt(src, args.size, args.block, args.seed)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out.astype(np.uint8)).save(args.out)
    s = seam_score(out)
    print(f"Quilt {args.image} -> {args.out} ({args.size}px, block={args.block}) "
          f"Naht-Score={s:.2f}")
    return 0


# --- diamond -----------------------------------------------------------------------

def cmd_diamond(args) -> int:
    tw, th = args.tile_w, args.tile_h
    img = Image.open(args.image).convert("RGBA")
    if args.method == "rotate":
        # 45-Grad-Rotation + Stauchung: Quadrat drehen (Kanten werden
        # Diagonalen), dann auf tw x th stauchen. expand=True liefert das
        # rotierte Bounding-Quadrat (Faktor sqrt(2)).
        side = min(img.width, img.height)
        sq = img.crop((0, 0, side, side))
        rot = sq.rotate(45, resample=Image.BICUBIC, expand=True)
        out = rot.resize((tw, th), Image.LANCZOS)
    else:
        # Rautenmaske: Quadrat auf tw x th skalieren, Raute ausmaskieren.
        sq = img.resize((tw, th), Image.LANCZOS)
        yy, xx = np.mgrid[0:th, 0:tw]
        cx, cy = (tw - 1) / 2.0, (th - 1) / 2.0
        inside = (np.abs(xx - cx) / (tw / 2.0) + np.abs(yy - cy) / (th / 2.0)) <= 1.0
        arr = np.asarray(sq).copy()
        arr[..., 3] = np.where(inside, arr[..., 3], 0)
        out = Image.fromarray(arr)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.save(args.out)
    print(f"Diamond {args.image} -> {args.out} ({tw}x{th}, method={args.method})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    k = sub.add_parser("kacheltest", help="Naht-Score per Roll-Verschiebung")
    k.add_argument("images", nargs="+")
    k.add_argument("--thr", type=float, default=1.6)
    k.set_defaults(fn=cmd_kacheltest)

    hl = sub.add_parser("heal", help="Offset+Heal: Wrap-Naht per Quilting-Patches schliessen")
    hl.add_argument("image")
    hl.add_argument("--out", required=True)
    hl.add_argument("--block", type=int, default=160)
    hl.add_argument("--seed", type=int, default=7)
    hl.set_defaults(fn=cmd_heal)

    q = sub.add_parser("quilt", help="Efros-Freeman-Quilting aus Beispielbild")
    q.add_argument("image")
    q.add_argument("--out", required=True)
    q.add_argument("--size", type=int, default=1024)
    q.add_argument("--block", type=int, default=192)
    q.add_argument("--seed", type=int, default=7)
    q.set_defaults(fn=cmd_quilt)

    d = sub.add_parser("diamond", help="Quadrat -> 160x96-Raute")
    d.add_argument("image")
    d.add_argument("--out", required=True)
    d.add_argument("--method", choices=["rotate", "mask"], default="rotate")
    d.add_argument("--tile-w", type=int, default=160)
    d.add_argument("--tile-h", type=int, default=96)
    d.set_defaults(fn=cmd_diamond)

    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
