#!/usr/bin/env python3
"""
build_hud_assets.py — Paket A, Teil 2+3: das saubere Asset-Substrat.

Liest das dateinamen-keyed Manifest src/data/hud_assets.json und erzeugt pro
Eintrag ein spielfertiges PNG nach public/<out>:

  pipeline "raw"    -> NUR freistellen + trim. Behaelt eingebackene Farbe+Licht.
  pipeline "master" -> achromatischer Graustufen-Master (R=G=B, Median ~162).
                       KEIN relight/palette/desat/grain/present. Die Fraktions-
                       farbe kommt zur Laufzeit per luminanzerhaltender Toenung
                       (CSS mix-blend-mode:color / SVG feBlend luminosity).

Auflösung (der Ordner luegt, der Dateiname nicht):
  - `source` (Basename) wird ueber die DISJUNKTEN Quellordner orn/ + violett/
    gesucht. Derselbe Name in BEIDEN -> harter Build-Fehler (Kollision).
  - `freigestellt/` ist nur der vorab-gecuttete Cache (kein Suchordner): liegt
    dort eine fertige Fassung, wird sie als bereits-freigestellt genommen.
  - Fehlt eine `optional`-Quelle -> sauberer Skip, KEIN Crash. Fehlt eine
    PFLICHT-Quelle -> Build-Fehler.

Lauf:  python3 tools/build_hud_assets.py
Test:  python3 tools/build_hud_assets.py --selftest
"""
import json
import os
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
MANIFEST = os.path.join(ROOT, "src/data/hud_assets.json")
SRC_DIRS = [os.path.join(ROOT, "assets/source/ui/orn"),
            os.path.join(ROOT, "assets/source/ui/violett")]
CACHE_DIR = os.path.join(ROOT, "assets/source/ui/freigestellt")
OUT_ROOT = os.path.join(ROOT, "public")
MASTER_MEDIAN = 150.0   # Ziel-Tonlage des Graustufen-Masters (Spec: ~150-175)
MASTER_SPREAD = 200.0   # Ziel-Robustspanne p2..p98 -> einheitliche Relieftiefe.
                        # p98 landet bei ~250 (unter dem Knie) -> die zentralen
                        # 96 % bilden LINEAR ab, nur die Extremschwaenze falten.


class BuildError(RuntimeError):
    pass


# ---------------------------------------------------------------- Freistellen
def _bg_color(rgb):
    b = 6
    border = np.concatenate([
        rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3),
        rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3)])
    return np.median(border, axis=0)


def freistellen(rgb, dlo=18.0, dhi=60.0, sat_bg=26):
    """Hysterese-Matting auf flach-neutralem Grund (Saat vom Rand). Nur Cut, KEINE
    Farbkette. Rueckgabe alpha[0..255]. (Kompakt aus process_ui_v2 portiert.)"""
    h, w = rgb.shape[:2]
    bg = _bg_color(rgb)
    d = np.abs(rgb.astype(np.float32) - bg).max(axis=2)
    sat = rgb.max(2).astype(np.float32) - rgb.min(2).astype(np.float32)
    strong = (d <= dlo) & (sat <= sat_bg)
    weak = (d <= dhi) & (sat <= sat_bg)
    border = np.zeros((h, w), bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    bg_region = ndimage.binary_propagation(strong & border, mask=weak)
    a_soft = np.clip((d - dlo) / (dhi - dlo), 0.0, 1.0)
    alpha = np.where(bg_region, a_soft, 1.0).astype(np.float32)
    return alpha * 255.0


def trim(rgba):
    a = rgba[..., 3]
    ys, xs = np.where(a > 12)
    if len(xs) == 0:
        return rgba
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def load_cut(stem, src_path):
    """Bereits-gecuttete Cache-Fassung (freigestellt/) bevorzugen, sonst raw
    freistellen. Rueckgabe RGBA uint8 (getrimmt)."""
    cache = os.path.join(CACHE_DIR, stem + ".png")
    if os.path.exists(cache):
        rgba = np.asarray(Image.open(cache).convert("RGBA")).astype(np.uint8)
    else:
        rgb = np.asarray(Image.open(src_path).convert("RGB")).astype(np.float32)
        alpha = freistellen(rgb)
        rgba = np.dstack([rgb, alpha]).astype(np.uint8)
    return trim(rgba)


# ---------------------------------------------------------------- Master
def to_master(rgba, target_median=MASTER_MEDIAN, target_spread=MASTER_SPREAD):
    """Achromatischer Graustufen-Master: R=G=B=Luma, per RAEUMLICH UNIFORMER
    Tonwert-Normalisierung — Median auf die Mittellage, robuste Spanne p2..p98 auf
    eine EINHEITLICHE Relieftiefe skaliert. Das ist ein globales Auto-Level (eine
    Gerade fuer alle Pixel), KEIN raeumlicher Relight-Gradient und keine Patina
    -> die Reliefordnung bleibt erhalten, beide Fraktionen erhalten gleiche Tiefe.
    Weiche Knie an beiden Enden statt harter 0/255-Waende. Alpha unveraendert."""
    rgb = rgba[..., :3].astype(np.float32)
    a = rgba[..., 3]
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    op = a > 12
    if op.sum() >= 10:
        med = float(np.median(lum[op]))
        p2, p98 = np.percentile(lum[op], [2, 98])
        gain = float(np.clip(target_spread / max(p98 - p2, 1.0), 0.5, 4.0))
        lum = (lum - med) * gain + target_median
        for edge, k, hi in ((252.0, 0.30, True), (4.0, 0.30, False)):  # nur Extremschwaenze
            band = lum > edge if hi else lum < edge
            lum[band] = edge + (lum[band] - edge) * k
    g = np.clip(lum, 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, a]).astype(np.uint8)


def luma_std(rgba):
    """Relief-Mass: Std der Luma ueber der opaken Region."""
    rgb = rgba[..., :3].astype(np.float32)
    op = rgba[..., 3] > 12
    if op.sum() < 10:
        return 0.0
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    return float(np.std(lum[op]))


# ---------------------------------------------------------------- Resolver
def resolve(stem, src_dirs=SRC_DIRS):
    """Basename ueber die disjunkten Quellordner. Treffer in >1 -> Kollision."""
    hits = [d for d in src_dirs if os.path.exists(os.path.join(d, stem + ".png"))]
    if len(hits) > 1:
        rels = [os.path.relpath(d, ROOT) for d in hits]
        raise BuildError(f"NAMENSKOLLISION: '{stem}' liegt in {rels} — Build abgebrochen.")
    return os.path.join(hits[0], stem + ".png") if hits else None


def process_entry(e, src_dirs=SRC_DIRS, out_root=OUT_ROOT):
    stem = e["source"]
    src = resolve(stem, src_dirs)
    if src is None:
        if e.get("optional"):
            return ("skip", e["out"], None)
        raise BuildError(f"PFLICHT-QUELLE FEHLT: '{stem}' (slot {e['slot']}/{e['faction']}).")
    cut = load_cut(stem, src)
    out = to_master(cut) if e["pipeline"] == "master" else cut
    dst = os.path.join(out_root, e["out"])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.fromarray(out, "RGBA").save(dst)
    return ("master" if e["pipeline"] == "master" else "raw", e["out"], luma_std(out))


def load_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def assert_raw_law(manifest):
    always_raw = {"corner", "topleft", "sigil", "hero", "eye"}
    bad = [e for e in manifest if e["slot"] in always_raw and e["pipeline"] != "master" and e["pipeline"] != "raw"]
    bad += [e for e in manifest if e["slot"] in always_raw and e["pipeline"] == "master"]
    if bad:
        names = [f"{e['faction']}/{e['slot']}/{e['source']}" for e in bad]
        raise BuildError(f"RAW-GESETZ VERLETZT (Immer-raw-Slot im master-Pfad): {names}")


def run():
    manifest = load_manifest()
    assert_raw_law(manifest)
    built = skipped = 0
    for e in manifest:
        kind, out, std = process_entry(e)
        if kind == "skip":
            print(f"  skip (optional fehlt): {out}")
            skipped += 1
        else:
            print(f"  {kind:6s} LumaStd={std:5.1f}  -> {out}")
            built += 1
    print(f"\nbuild_hud_assets: {built} gebaut, {skipped} optional uebersprungen.")


# ---------------------------------------------------------------- Selbsttest
def _write_dummy(path, color):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new("RGBA", (40, 40), color).save(path)


def selftest():
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        a = os.path.join(tmp, "orn")
        b = os.path.join(tmp, "violett")
        os.makedirs(a); os.makedirs(b)

        # (3) Namenskollision -> harter Abbruch.
        _write_dummy(os.path.join(a, "dup.png"), (10, 20, 30, 255))
        _write_dummy(os.path.join(b, "dup.png"), (40, 50, 60, 255))
        try:
            resolve("dup", [a, b])
            print("FAIL  Kollision wurde NICHT erkannt"); ok = False
        except BuildError as ex:
            print(f"PASS  Kollision bricht ab: {ex}")

        # (2) Ordner-unabhaengige Aufloesung -> bit-identisch nach Verschieben.
        os.remove(os.path.join(b, "dup.png"))
        rng = np.random.default_rng(7)
        arr = np.dstack([rng.integers(0, 255, (50, 80, 3), dtype=np.uint8),
                         np.full((50, 80), 255, np.uint8)])
        Image.fromarray(arr, "RGBA").save(os.path.join(a, "movable.png"))
        e = {"slot": "strip_h", "faction": "moderat", "source": "movable",
             "pipeline": "master", "out": "m1.png"}
        out1 = os.path.join(tmp, "o1"); out2 = os.path.join(tmp, "o2")
        # CACHE_DIR existiert hier nicht -> load_cut nimmt den raw-Pfad (freistellen).
        process_entry(e, [a, b], out1)
        os.rename(os.path.join(a, "movable.png"), os.path.join(b, "movable.png"))
        process_entry(e, [a, b], out2)
        m1 = Image.open(os.path.join(out1, "m1.png")).tobytes()
        m2 = Image.open(os.path.join(out2, "m1.png")).tobytes()
        if m1 == m2:
            print("PASS  Aufloesung ordner-unabhaengig: Master bit-identisch nach Verschieben")
        else:
            print("FAIL  Master unterscheidet sich je nach Ordner"); ok = False

        # (4) Fehlendes optional-Asset -> kein Crash, sauberer Skip.
        miss = {"slot": "backdrop", "faction": "moderat", "source": "gibt_es_nicht",
                "pipeline": "master", "out": "x.png", "optional": True}
        try:
            kind, _, _ = process_entry(miss, [a, b], out1)
            print("PASS  Fehlendes optional-Asset: " + ("sauberer Skip" if kind == "skip" else f"unerwartet {kind}"))
            ok = ok and kind == "skip"
        except Exception as ex:  # noqa: BLE001
            print(f"FAIL  Fehlendes optional crasht: {ex}"); ok = False

        # (4b) Fehlende PFLICHT-Quelle -> harter Fehler.
        req = dict(miss); req.pop("optional")
        try:
            process_entry(req, [a, b], out1)
            print("FAIL  Fehlende Pflicht-Quelle blieb still"); ok = False
        except BuildError:
            print("PASS  Fehlende Pflicht-Quelle bricht ab")

    print("\nSELFTEST:", "ALLE GRUEN" if ok else "ROT")
    return ok


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)
    run()
