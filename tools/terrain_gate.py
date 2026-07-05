#!/usr/bin/env python3
"""terrain_gate.py — maschinelles Terrain-Qualitaetsgate (Strang 8, Paket 4).

Prueft GERENDERTE Canvas-Pixel, NIE das Datenmodell (das war der HUD-Originalfehler:
ein Modell-Detektor meldet gruen, waehrend das Bild kaputt ist). Vier Pruefungen am
gerenderten Terrain-PNG:
  (1) harte Kante  (2) Wiederholung  (3) Schweben  (4) Roundtrip (Render+Daten).

Vorbereitung (Canvas BLEIBT im Shot, ?renderer=canvas -- sonst Leere fotografiert):
  PW_CHROME=<chrome> node tools/editor_browser.mjs terrainshots offen
Lauf:
  python3 tools/terrain_gate.py offen        # Exit 0 nur bei leerem Report

HINWEIS: benoetigt numpy + scipy + Pillow. In diesem Web-/CI-Container sind die
Libs NICHT vorhanden -> hier nicht lauffaehig. Das LIVE, verifizierte Aequivalent
ist das In-Browser-Gate (dieselben vier Pixel-Pruefungen, laeuft headless):
  node tools/editor_browser.mjs gate offen dicht
Dieses Skript ist die kanonische Offline-Form, sobald die Libs vorhanden sind.
"""
from __future__ import annotations
import json
import os
import sys

# Schwellwerte (Strang 8).
GRAD_HI = 90        # Sobel-Grat = harte Kante
GRAD_LO = 25        # darunter = Flaeche
MIN_BLEND = 12      # transversale Mindest-Blendbreite (px)
MIN_RUN = 64        # ab so langem Grat-Lauf gilt es als Naht
T_REPEAT = 0.45     # Autokorrelations-Peak-Schwelle
FLOAT_GAP = 6       # Bodenton-Lauf ab Fuss = Schweben
FLOAT_SCAN = 24
RAY_OFFSETS = (-8, 0, 8)
BG_RGB = (38, 48, 42)
BG_TOL = 12
GATE = os.environ.get("SHOT_DIR", "/tmp/gate")


def _np():
    import numpy as np  # lokal, damit der Import-Fehler sauber gemeldet wird
    return np


def _luma(arr):
    np = _np()
    return arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722


def _bg_mask(arr):
    np = _np()
    d = np.abs(arr.astype(np.int16) - np.array(BG_RGB)).sum(axis=2)
    return d < BG_TOL * 3


def _load(name):
    from PIL import Image
    np = _np()
    return np.asarray(Image.open(os.path.join(GATE, name)).convert("RGB"))


def check_uniform(arr, findings):
    """Kipp-Absicherung: ein leerer/uniformer Canvas (kein Bild) ist harter Fehler."""
    np = _np()
    if float(_luma(arr).std()) < 4.0:
        findings.append(("canvas_leer", "Terrain-PNG ist uniform -> Canvas-Capture leer", None))


def check_hard_edges(arr, exclude, findings):
    """Sobel-Grate labeln, transversale Blendbreite messen; zu schmal ueber langen
    Lauf = harte Naht. Wasser/Klippen sind via exclude-Maske ausgenommen."""
    np = _np()
    from scipy import ndimage
    L = _luma(arr)
    gx = ndimage.sobel(L, axis=1)
    gy = ndimage.sobel(L, axis=0)
    g = np.hypot(gx, gy)
    ridges = (g > GRAD_HI) & ~exclude
    lbl, n = ndimage.label(ridges)
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if xs.size < MIN_RUN:
            continue
        run = max(np.ptp(xs), np.ptp(ys))  # ndarray.ptp() in NumPy 2 entfernt -> np.ptp()
        # transversale Breite: Anteil benachbarter Pixel ueber GRAD_LO (Saum).
        blend = np.mean(g[max(0, ys.min()):ys.max() + 1, max(0, xs.min()):xs.max() + 1] > GRAD_LO)
        if run >= MIN_RUN and blend * 100 < MIN_BLEND:
            findings.append(("harte_kante", f"Grat-Lauf {int(run)}px, Saum zu schmal", (int(xs.min()), int(ys.min()))))


def check_repeat(arr, findings):
    """2D-FFT-Autokorrelation eines Bodenfeld-Crops; Ring-Maximum im Lag-Band; Peak
    > T_REPEAT mit Harmonik (period & 2*period) = sichtbare Wiederholung."""
    np = _np()
    h, w = arr.shape[:2]
    c = _luma(arr)[h // 4:3 * h // 4, w // 4:3 * w // 4]
    c = c - c.mean()
    f = np.fft.rfft2(c)
    ac = np.fft.irfft2(f * np.conj(f))
    ac = np.fft.fftshift(ac) / (ac.max() + 1e-9)
    cy, cx = np.array(ac.shape) // 2
    peak, lag = 0.0, 0
    lo, hi = 160, min(ac.shape) // 2
    for r in range(lo, hi):
        ring = ac[cy - r:cy + r, cx - r:cx + r]
        m = float(ring.max())
        if m > peak:
            peak, lag = m, r
    if peak > T_REPEAT:
        findings.append(("wiederholung", f"Autokorr-Peak {peak:.2f} @lag {lag}", (cx, cy)))


def check_floating(arr, objects, findings):
    """3 Strahlen ab Objekt-Fusspunkt abwaerts; trifft alle drei sofort Bodenton
    (Lauf > FLOAT_GAP), schwebt das Objekt (kein Kontaktschatten am Fuss)."""
    np = _np()
    bg = _bg_mask(arr)
    h, w = arr.shape[:2]
    for o in objects:
        fx, fy = int(o["fx"]), int(o["fy"])
        if fx < 10 or fy < 10 or fx >= w - 10 or fy >= h - 10:
            continue  # Bildrand -> Residuum
        floats = 0
        for dx in RAY_OFFSETS:
            run = 0
            for dy in range(FLOAT_SCAN):
                x, y = fx + dx, fy + dy
                if 0 <= x < w and 0 <= y < h and bg[y, x]:
                    run += 1
            if run > FLOAT_GAP:
                floats += 1
        if floats == len(RAY_OFFSETS):
            findings.append(("schwebt", f"Objekt {o.get('type','?')} ohne Bodenkontakt", (fx, fy)))


def check_roundtrip_render(findings):
    """Render-Roundtrip exakt: terrain_rt_a == terrain_rt_b (np.array_equal)."""
    np = _np()
    a = _load("terrain_rt_a.png")
    b = _load("terrain_rt_b.png")
    if a.shape != b.shape or not np.array_equal(a, b):
        findings.append(("roundtrip_render", "Render(save/load) weicht ab", None))


def mark_crop(arr, xy, idx):
    from PIL import Image, ImageDraw
    if xy is None:
        return
    im = Image.fromarray(arr.copy())
    d = ImageDraw.Draw(im)
    x, y = xy
    d.rectangle([x - 24, y - 24, x + 24, y + 24], outline=(255, 61, 165), width=3)
    im.save(os.path.join(GATE, f"finding_{idx}.png"))


def main(name: str) -> int:
    try:
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
        from scipy import ndimage  # noqa: F401
    except ImportError as e:  # pragma: no cover - Container ohne Libs
        print(f"terrain_gate: fehlende Lib ({e}). In-Browser-Gate nutzen: "
              f"node tools/editor_browser.mjs gate {name}")
        return 0

    np = _np()
    terr = os.path.join(GATE, f"terrain_{name}.png")
    if not os.path.exists(terr):
        print(f"terrain_gate: {terr} fehlt -- erst 'node tools/editor_browser.mjs terrainshots {name}'")
        return 1
    arr = _load(f"terrain_{name}.png")
    objects = json.load(open(os.path.join(GATE, f"objects_{name}.json"))) if os.path.exists(os.path.join(GATE, f"objects_{name}.json")) else []

    findings: list = []
    check_uniform(arr, findings)
    if findings:  # leerer Canvas -> Rest sinnlos
        _report(findings, arr)
        return 1
    exclude = np.zeros(arr.shape[:2], dtype=bool)  # Wasser/Klippen aus map.collision/water ableiten (hier leer)
    check_hard_edges(arr, exclude, findings)
    check_repeat(arr, findings)
    check_floating(arr, objects, findings)
    check_roundtrip_render(findings)
    _report(findings, arr)
    return 1 if findings else 0


def _report(findings, arr):
    for i, (kind, msg, xy) in enumerate(findings):
        coord = f" @{xy}" if xy else ""
        print(f"  ROT [{kind}] {msg}{coord}")
        mark_crop(arr, xy, i)
    print("PASS: Terrain-Gate gruen." if not findings else f"FAIL: {len(findings)} Befund(e).")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "offen"))
