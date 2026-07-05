#!/usr/bin/env python3
"""
normalize_asset.py — Pflicht-Normalisierungspass fuer HELLMUTH-Assets.

Schickt jedes eingehende Sprite durch DIESELBE Behandlung, damit alle Assets
"aus einem Guss" wirken, egal aus welchem Generator sie stammen (OpenAI, KREA,
Blender). Siehe asset-spec.md.

Zwei Stufen:
  A) Freistellen (Hintergrundentfernung) je nach --mode:
       building  Standard. Einheitlich grauer Generierungshintergrund wird per
                 Rand-Flood-Fill entfernt. In der Kontaktschatten-Zone wird die
                 Luminanz zu Alpha umgesetzt, damit der weiche Schatten als
                 Halbtransparenz UEBERLEBT (Schatten ist Spec, keine
                 Verunreinigung). Fuer Gebaeude, Einheiten, Effekte.
       node      Ressourcen-Vorkommen und Ruinen: der mitgenerierte lokale
                 Bodenteller BLEIBT, kein hartes Ausschneiden. Grauer
                 Aussenhintergrund wird entfernt, der Teller bekommt einen
                 radialen Alpha-Fade ueber die aeusseren ~15 %, damit er weich
                 in jede Karte uebergeht.
       keep      Kein Freistellen (Asset bringt bereits Alpha mit, z. B.
                 render_unit-Frames). Nur Farb-Normalisierung.
     Bereits weitgehend transparente Eingaben ueberspringen das Freistellen
     automatisch (sicher fuer die Atlas-Pipeline).
  B) Farb-Normalisierung (immer): Entsaettigung, Tonkurve, Split-Tone.

Reserve-Schutz: stark gesaettigte Pixel (Magenta/Gold/Blut/Effekte) werden vor
der Entsaettigung geschuetzt, damit Fraktionsakzente knallig bleiben.

Nutzung:
  Einzeln:  python normalize_asset.py --in raw.png --out out.png [--width 512]
  Stapel:   python normalize_asset.py --in raw_dir/ --out out_dir/ --mode node
  Tuning:   --sat 0.85 --contrast 0.12 --split 0.06
  Freistellen-Tuning: --bg-tol 0.10 --chroma-tol 0.12 --shadow-floor 0.15
                      --shadow-strength 0.85 --fade 0.15
"""

import argparse
import os
from collections import deque

import numpy as np
from PIL import Image
from scipy import ndimage

DEFAULTS = dict(sat=0.86, contrast=0.12, lift=0.03, split=0.06, reserve=0.55)

# Vereinheitlichungs-Pass, Pixel-Anteil (Korn ist KEIN Asset-Schritt, sondern ein
# gemeinsamer Overlay-Layer ueber der Leiste). Hier nur die in die Assets
# gebackene Haelfte: Hue-Angleichung der Fraktionsakzente an den Kanon plus
# optionale Saettigungsskala (Mahlwerk-Sonderregel -10 %).
#   hue_target  Ziel-Hue in Grad (HELLMUTH Gold ~42, MODERAT Emblem-Magenta ~339)
#   hue_window  nur Pixel innerhalb +/- window um hue_target werden gezogen
#               (schuetzt HELLMUTH-Gruen und alles ausserhalb des Akzentbands)
#   hue_pull    Anteil 0..1, wie weit der Hue Richtung Ziel wandert
#   hue_sat_min nur Pixel ab dieser Saettigung (graue/dunkle Flaechen bleiben)
#   sat_scale   globaler Saettigungsfaktor (Mahlwerk 0.9)
HARMONIZE_DEFAULTS = dict(hue_target=0.0, hue_window=40.0, hue_pull=0.0,
                          hue_sat_min=0.22, sat_scale=1.0)

# Freistell-Parameter (getrennt von der Farbkurve; nach dem ersten Testlauf an
# einer echten KREA-Rohdatei, z. B. der Apotheke, feinjustieren).
CUTOUT_DEFAULTS = dict(
    bg_tol=0.10,          # Farbabstand zum geschaetzten Hintergrund -> Hintergrund
    chroma_tol=0.12,      # darunter gilt ein Pixel als unbunt (grau) -> Schattenkandidat
    shadow_floor=0.15,    # Luminanz, ab der ein dunkles Grau noch Schatten (nicht Objekt) ist
    shadow_strength=0.85, # max. Deckkraft des erhaltenen Schattens
    fade=0.15,            # node: radialer Alpha-Fade ueber die aeusseren 15 %
    hole_min=0.0004,      # eingeschlossene Grund-Tasche ab diesem Flaechenanteil -> Loch (Alpha 0)
    hole_grow=2,          # Dilatation (px) der Loch-Raender, frisst den Anti-Alias-Halo
    lab_t_in=8.0,         # lab-Keyer: Delta-E, unterhalb dessen ein Pixel voll Hintergrund ist
    lab_t_out=22.0,       # lab-Keyer: Delta-E, oberhalb dessen ein Pixel voll Objekt ist
)


def _srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def normalize_rgb(rgb: np.ndarray, p: dict) -> np.ndarray:
    """rgb: float HxWx3 in 0..1. Gibt normalisiertes RGB 0..1 zurueck."""
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    lum3 = lum[..., None]

    # Saettigung pro Pixel (max-min) -> stark gesaettigte Pixel schuetzen.
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    sat_px = (mx - mn)
    protect = np.clip((sat_px - p["reserve"]) / max(1e-3, 1 - p["reserve"]), 0, 1)[..., None]

    # 1) Entsaettigung (geschuetzte Pixel weniger)
    desat = lum3 + (rgb - lum3) * p["sat"]
    rgb = desat + (rgb - desat) * protect

    # 2) Tonkurve: sanftes S + Schatten-Lift
    x = np.clip(rgb, 0, 1)
    s = x + p["contrast"] * (x - 0.5) * (1 - np.abs(2 * x - 1))  # weiches S
    s = s + p["lift"] * (1 - s)                                  # Schatten leicht heben
    rgb = np.clip(s, 0, 1)

    # 3) Split-Tone: Schatten kuehler (mehr Blau), Lichter waermer (mehr Rot)
    shadow_w = np.clip(1 - lum, 0, 1)[..., None]
    light_w = np.clip(lum, 0, 1)[..., None]
    cool = np.array([-0.5, 0.0, 1.0]) * p["split"]
    warm = np.array([1.0, 0.3, -0.5]) * p["split"]
    rgb = rgb + shadow_w * cool * (1 - protect) + light_w * warm * (1 - protect)

    return np.clip(rgb, 0, 1)


# --- Vereinheitlichung: Hue-Angleichung ------------------------------------

def _rgb_to_hsv(rgb: np.ndarray):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); df = mx - mn
    dfs = np.where(df == 0, 1.0, df)
    h = np.where(mx == r, (g - b) / dfs,
         np.where(mx == g, 2.0 + (b - r) / dfs, 4.0 + (r - g) / dfs))
    h = (h / 6.0) % 1.0
    h = np.where(df == 0, 0.0, h)
    s = np.where(mx == 0, 0.0, df / np.where(mx == 0, 1.0, mx))
    return h, s, mx


def _hsv_to_rgb(h, s, v):
    i = np.floor(h * 6.0).astype(int)
    f = h * 6.0 - i
    p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    i = i % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1)


def harmonize_hue(rgb: np.ndarray, p: dict) -> np.ndarray:
    """Zieht die Fraktionsakzent-Hues innerhalb eines Fensters an den Kanon und
    skaliert optional die Saettigung. Alles ausserhalb des Fensters (z. B.
    HELLMUTH-Gruen) bleibt unberuehrt. rgb 0..1 -> rgb 0..1."""
    if p["hue_pull"] <= 0 and abs(p["sat_scale"] - 1.0) < 1e-3:
        return rgb
    h, s, v = _rgb_to_hsv(np.clip(rgb, 0, 1))
    deg = h * 360.0
    if p["hue_pull"] > 0:
        target = p["hue_target"] % 360.0
        d = ((target - deg + 180.0) % 360.0) - 180.0  # kuerzester Winkel
        in_band = (np.abs(d) <= p["hue_window"]) & (s >= p["hue_sat_min"])
        deg = np.where(in_band, deg + p["hue_pull"] * d, deg)
        h = (deg % 360.0) / 360.0
    if abs(p["sat_scale"] - 1.0) >= 1e-3:
        s = np.clip(s * p["sat_scale"], 0, 1)
    return np.clip(_hsv_to_rgb(h, s, v), 0, 1)


# --- Freistellen -----------------------------------------------------------

def _estimate_bg(rgb: np.ndarray, border: int = 6) -> np.ndarray:
    """Schaetzt die Hintergrundfarbe aus dem Randstreifen (Median)."""
    h, w, _ = rgb.shape
    b = min(border, h // 2, w // 2)
    ring = np.concatenate([
        rgb[:b, :, :].reshape(-1, 3),
        rgb[-b:, :, :].reshape(-1, 3),
        rgb[:, :b, :].reshape(-1, 3),
        rgb[:, -b:, :].reshape(-1, 3),
    ], axis=0)
    return np.median(ring, axis=0)


def _flood_from_border(seed: np.ndarray) -> np.ndarray:
    """BFS ueber das Seed-Mask, gestartet von allen Randpixeln (4er-Nachbarn).

    Liefert die mit dem Bildrand verbundene Region (ohne scipy)."""
    h, w = seed.shape
    visited = np.zeros((h, w), dtype=bool)
    dq: deque[tuple[int, int]] = deque()

    def push(r, c):
        if seed[r, c] and not visited[r, c]:
            visited[r, c] = True
            dq.append((r, c))

    for c in range(w):
        push(0, c)
        push(h - 1, c)
    for r in range(h):
        push(r, 0)
        push(r, w - 1)

    while dq:
        r, c = dq.popleft()
        if r > 0:
            push(r - 1, c)
        if r < h - 1:
            push(r + 1, c)
        if c > 0:
            push(r, c - 1)
        if c < w - 1:
            push(r, c + 1)
    return visited


def remove_background(rgb: np.ndarray, alpha: np.ndarray, c: dict):
    """Entfernt den einheitlichen Generierungshintergrund per Rand-Flood-Fill;
    erhaelt den weichen Kontaktschatten ueber Luminanz-zu-Alpha.

    rgb/alpha: float in 0..1. Gibt (rgb, alpha) zurueck."""
    bg = _estimate_bg(rgb)
    bg_lum = float(bg @ np.array([0.299, 0.587, 0.114]))
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)
    dist = np.abs(rgb - bg).max(axis=-1)

    seed_bg = dist < c["bg_tol"]
    # Schattenkandidat: unbunt, dunkler als der Hintergrund, aber nicht schwarz.
    seed_shadow = (
        (chroma < c["chroma_tol"])
        & (lum < bg_lum - 0.02)
        & (lum > c["shadow_floor"])
        & (~seed_bg)
    )
    region = _flood_from_border(seed_bg | seed_shadow)
    is_bg = region & seed_bg
    is_shadow = region & seed_shadow

    out_a = alpha.copy()
    out_a[is_bg] = 0.0

    # Schatten -> halbtransparent, neutral abgedunkelt (Grau-Tint raus).
    denom = max(1e-3, bg_lum - c["shadow_floor"])
    sh = np.clip((bg_lum - lum) / denom, 0.0, 1.0) * c["shadow_strength"]
    out_a[is_shadow] = sh[is_shadow]
    out_rgb = rgb.copy()
    neutral = np.clip(lum * 0.55, 0.0, 1.0)
    out_rgb[is_shadow] = neutral[is_shadow, None]

    # Eingeschlossene Grund-Taschen: grundfarbene Regionen, die NICHT mit dem
    # Bildrand verbunden sind (von Objektteilen umschlossen). Das ist Hintergrund,
    # der durch Luecken/hinter Glas baked ist -> Loch durchs Objekt (Alpha 0).
    # Nur Regionen ab `hole_min` Flaeche, damit Korn-/Screentone-Pixel im Objekt
    # nicht zu Swiss-Cheese werden. Loch-Raender werden gedehnt und fressen den
    # grauen Anti-Alias-Saum, damit kein Halo stehen bleibt.
    h, w = rgb.shape[:2]
    enclosed = seed_bg & (~region)
    if enclosed.any():
        lbl, n = ndimage.label(enclosed)
        if n:
            sizes = np.bincount(lbl.ravel())
            min_px = max(1.0, c["hole_min"] * h * w)
            keep = np.zeros(n + 1, dtype=bool)
            keep[1:] = sizes[1:] >= min_px
            big = keep[lbl]
            if c["hole_grow"] > 0:
                grown = ndimage.binary_dilation(big, iterations=int(c["hole_grow"]))
                near_bg = (dist < c["bg_tol"] * 1.8) & (chroma < c["chroma_tol"])
                big = big | (grown & near_bg)
            out_a[big] = 0.0
    return out_rgb, out_a


def remove_background_lab(rgb: np.ndarray, alpha: np.ndarray, c: dict):
    """Chroma-Distanz-Keying im CIELAB-Raum mit weicher Alpha-Rampe (E3-Befund,
    Default-Keyer seit CODE1-Werkzeugkette). Ersetzt die harte Flood-Fill-
    Zugehoerigkeit durch fraktionales Alpha an Anti-Aliasing-Kanten; die
    Topologie-Logik (nur rand-verbundener Hintergrund wird gekeyt, grosse
    eingeschlossene Grund-Taschen werden Loecher, Kontaktschatten ueberlebt
    als Halbtransparenz) ist aus remove_background uebernommen — genau die
    Schritte, die laut Paket-0-Messung am Flood-Fill haengen.

    Eskalation bei Grau-Kollision im Objekt: rembg mit birefnet-general
    (siehe tools/mine_mockup.py, E3-Entscheidungsbaum Pfad 2).

    rgb/alpha: float in 0..1. Gibt (rgb, alpha) zurueck."""
    import cv2

    bg = _estimate_bg(rgb)
    bg_lum = float(bg @ np.array([0.299, 0.587, 0.114]))
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)

    # Delta-E (CIE76) zur Rand-Median-Referenz. Referenz aus dem BILD statt
    # hartem #7F7F7F: GPT/KREA liefern den Grau-Ton nie pixelidentisch (E3).
    lab = cv2.cvtColor((np.clip(rgb, 0, 1) * 255).astype(np.uint8),
                       cv2.COLOR_RGB2Lab).astype(np.float32)
    ref = cv2.cvtColor(np.uint8([[np.clip(bg, 0, 1) * 255]]),
                       cv2.COLOR_RGB2Lab).astype(np.float32)[0, 0]
    d = np.linalg.norm(lab - ref, axis=2)
    # Weiche Rampe: 0 = sicher Hintergrund, 1 = sicher Objekt. Fraktionale
    # Werte an AA-Kanten sind der Zweck der Uebung (Teil-Alpha).
    objness = np.clip((d - c["lab_t_in"]) / max(1e-3, c["lab_t_out"] - c["lab_t_in"]), 0.0, 1.0)

    # Topologie wie im Flood-Keyer: BG-Kern (objness deutlich unter 1) vom
    # Rand fluten; nur rand-verbundene BG-Pixel und grosse eingeschlossene
    # Taschen werden gekeyt. Graue Partien IM Objekt (nicht rand-verbunden,
    # unter hole_min) bleiben opak.
    seed_bg = objness < 0.5
    seed_shadow = (
        (chroma < c["chroma_tol"])
        & (lum < bg_lum - 0.02)
        & (lum > c["shadow_floor"])
        & (~seed_bg)
    )
    region = _flood_from_border(seed_bg | seed_shadow)
    is_bg_region = region & seed_bg
    is_shadow = region & seed_shadow

    out_a = alpha.copy()
    # Weiches Keying nur in der rand-verbundenen BG-Region plus einem
    # 2-px-Saum darum (dort leben die AA-Kanten, die die Rampe aufloest).
    key_zone = ndimage.binary_dilation(is_bg_region, iterations=2)
    out_a = np.where(key_zone, np.minimum(out_a, objness), out_a)

    # Kontaktschatten wie gehabt: Luminanz -> Alpha, neutral abgedunkelt.
    denom = max(1e-3, bg_lum - c["shadow_floor"])
    sh = np.clip((bg_lum - lum) / denom, 0.0, 1.0) * c["shadow_strength"]
    out_a[is_shadow] = sh[is_shadow]
    out_rgb = rgb.copy()
    neutral = np.clip(lum * 0.55, 0.0, 1.0)
    out_rgb[is_shadow] = neutral[is_shadow, None]

    # Eingeschlossene Grund-Taschen (Loch durchs Objekt), Logik wie im
    # Flood-Keyer, aber mit weicher Rampe im Loch-Saum statt hartem Schnitt.
    h, w = rgb.shape[:2]
    enclosed = seed_bg & (~region)
    if enclosed.any():
        lbl, n = ndimage.label(enclosed)
        if n:
            sizes = np.bincount(lbl.ravel())
            min_px = max(1.0, c["hole_min"] * h * w)
            keep = np.zeros(n + 1, dtype=bool)
            keep[1:] = sizes[1:] >= min_px
            big = keep[lbl]
            if big.any():
                hole_zone = ndimage.binary_dilation(big, iterations=max(1, int(c["hole_grow"])))
                out_a = np.where(hole_zone, np.minimum(out_a, objness), out_a)
    return out_rgb, out_a


def radial_fade(alpha: np.ndarray, frac: float) -> np.ndarray:
    """Weicher radialer Alpha-Fade ueber die aeusseren `frac` (z. B. 0.15) des
    Bildradius. Fuer Node-Assets, damit der Bodenteller in die Karte uebergeht."""
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w]
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    extent = min(h, w) / 2.0
    r = np.sqrt(((yy - cy)) ** 2 + ((xx - cx)) ** 2) / max(1e-3, extent)
    start = 1.0 - frac
    t = np.clip((r - start) / max(1e-3, frac), 0.0, 1.0)
    mult = 1.0 - (t * t * (3 - 2 * t))  # smoothstep 1 -> 0
    return alpha * mult


def _mostly_transparent(alpha: np.ndarray, thresh: float = 0.02) -> bool:
    """True, wenn das Bild bereits nennenswert Transparenz mitbringt."""
    return float((alpha < 0.5).mean()) > thresh


def process(in_path: str, out_path: str, width: int | None, p: dict,
            mode: str, c: dict, hz: dict, keyer: str = "lab") -> None:
    img = Image.open(in_path).convert("RGBA")
    arr = np.asarray(img).astype(np.float32) / 255.0
    rgb, a = arr[..., :3], arr[..., 3]

    cut = "skip"
    if mode != "keep" and not _mostly_transparent(a):
        if keyer == "lab":
            rgb, a = remove_background_lab(rgb, a, c)
        else:
            rgb, a = remove_background(rgb, a, c)
        cut = f"{mode}/{keyer}"
        if mode == "node":
            a = radial_fade(a, c["fade"])
    elif mode != "keep":
        cut = "auto-skip (bereits transparent)"

    rgb = normalize_rgb(rgb, p)
    rgb = harmonize_hue(rgb, hz)
    out = np.concatenate([rgb, a[..., None]], axis=-1)
    res = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    if width and res.width != width:
        h = round(res.height * width / res.width)
        res = res.resize((width, h), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    res.save(out_path)
    print(f"normalized {os.path.basename(in_path)} -> {out_path} "
          f"[cut={cut}]" + (f" (w={width})" if width else ""))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--width", type=int, default=None, help="Ziel-Footprint-Breite in px")
    ap.add_argument("--mode", choices=["building", "node", "keep"], default="building",
                    help="building=Standard-Freistellen, node=Teller+Rand-Fade, keep=kein Freistellen")
    ap.add_argument("--keyer", choices=["lab", "flood"], default="lab",
                    help="lab=Chroma-Distanz CIELAB mit weicher Rampe (Default, E3); "
                         "flood=alter Exakt-Toleranz-Flood-Fill (Reproduktion alter Staende)")
    for k, v in DEFAULTS.items():
        ap.add_argument(f"--{k}", type=float, default=v)
    for k, v in CUTOUT_DEFAULTS.items():
        ap.add_argument(f"--{k.replace('_', '-')}", dest=k, type=float, default=v)
    for k, v in HARMONIZE_DEFAULTS.items():
        ap.add_argument(f"--{k.replace('_', '-')}", dest=k, type=float, default=v)
    args = ap.parse_args()
    p = {k: getattr(args, k) for k in DEFAULTS}
    c = {k: getattr(args, k) for k in CUTOUT_DEFAULTS}
    hz = {k: getattr(args, k) for k in HARMONIZE_DEFAULTS}

    if os.path.isdir(args.inp):
        os.makedirs(args.out, exist_ok=True)
        for f in sorted(os.listdir(args.inp)):
            if f.lower().endswith(".png"):
                process(os.path.join(args.inp, f), os.path.join(args.out, f),
                        args.width, p, args.mode, c, hz, args.keyer)
    else:
        process(args.inp, args.out, args.width, p, args.mode, c, hz, args.keyer)


if __name__ == "__main__":
    main()
