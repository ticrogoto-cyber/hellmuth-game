#!/usr/bin/env python3
"""
process_ui_v2.py — Verarbeitungspass fuer die HUD-V2-Ornamente (Schichtarchitektur).

Pro ausgewaehltem Quell-Asset (assets/source/ui/{orn,violett}) erzeugt das Skript
ein spielfertiges PNG nach public/sprites/ui/hud/v2/{fac}/{role}/{var}.png:

  1. Freistellen: Flood-Fill vom Rand auf der neutralen Grundfarbe, weicher
     Schattensaum bleibt (Kontaktschatten kommt sonst per CSS).
  2. Eingeschlossene Grund-Taschen ausstechen: bg-farbige Inseln INNERHALB der
     Silhouette (Laub-/Filigran-Loecher, offene Radnaben) -> Alpha 0. Konservativ
     (enge Farbtoleranz), damit Stahl/Messing erhalten bleibt.
  3. MODERAT-Entgluehung (nur Nicht-Koenig): helle, gesaettigte Magenta-Flaechen
     werden in V und S gedaempft -> Magenta liest als stumpfe Blörre, nicht Glow.
  4. Drip-Beschnitt (nur MODERAT, geflaggt): schmale Magenta-Tendrils unterhalb der
     Haupt-Fusskante werden weggeschnitten (Tropfen verboten).
  5. Milde, einheitliche Entsaettigung (LUT-Ersatz) fuer Fraktionskohaerenz, mit
     Schutz hoher Saettigung am Koenig.
  6. Augen-Sonderfall: runder Iris-Ausschnitt aus moderat_eye (alles ausserhalb
     Alpha 0), Tendrils fallen automatisch weg.

Lauf: python3 tools/process_ui_v2.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets/source/ui")
OUT = os.path.join(ROOT, "public/sprites/ui/hud/v2")


# ---------------------------------------------------------------- Grundoperationen
def _bg_color(rgb):
    """Neutrale Grundfarbe aus dem 6px-Rand (Median)."""
    b = 6
    border = np.concatenate([
        rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3),
        rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3)])
    return np.median(border, axis=0)


def _bg_like(rgb, bg, tol):
    """Maske aller Pixel, die der Grundfarbe nahe sind (enge Toleranz) und flau."""
    d = np.abs(rgb.astype(np.float32) - bg).max(axis=2)
    mx = rgb.max(axis=2).astype(np.float32)
    mn = rgb.min(axis=2).astype(np.float32)
    sat = (mx - mn)
    return (d <= tol) & (sat <= 26)


def freistellen(rgb, dlo=18.0, dhi=60.0, sat_bg=26, despill=True, close_edge=True):
    """Hysterese-Matting auf flach-neutralem Grund: starke bg-Saat (d<=dlo) vom
    Rand durch schwache bg-Maske (d<=dhi) propagieren -> weiche AA-Rampe ohne
    grauen Saum/Fransen. Rueckgabe (alpha, bg, rgb_despilled). Kein Schatten mehr
    (Kontaktschatten kommt per CSS)."""
    h, w = rgb.shape[:2]
    bg = _bg_color(rgb)
    d = np.abs(rgb.astype(np.float32) - bg).max(axis=2)
    sat = rgb.max(2).astype(np.float32) - rgb.min(2).astype(np.float32)
    strong_bg = (d <= dlo) & (sat <= sat_bg)
    weak_bg = (d <= dhi) & (sat <= sat_bg)
    border = np.zeros((h, w), bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    bg_region = ndimage.binary_propagation(strong_bg & border, mask=weak_bg)
    a_soft = np.clip((d - dlo) / (dhi - dlo), 0.0, 1.0)
    alpha = np.where(bg_region, a_soft, 1.0).astype(np.float32)
    if close_edge:
        solid = alpha > 0.85
        fill = ndimage.binary_closing(solid, iterations=2) & ~solid & (d > dlo)
        alpha = np.where(fill, np.maximum(alpha, a_soft), alpha)
    out = rgb.astype(np.float32).copy()
    if despill:
        af = alpha[..., None]
        eps = 0.10
        unmixed = (out - (1.0 - af) * bg) / np.maximum(af, eps)
        out = np.where(af < 0.98, np.clip(unmixed, 0, 255), out)
    return alpha * 255.0, bg, out


def stab_pockets(rgb, alpha, bg, tol=22):
    """Eingeschlossene bg-Taschen ausstechen, aber KONSERVATIV: nur >=80px UND
    via near-Pixeln mit der bereits gekillten Aussenregion (alpha==0) verbindbar
    -> echte Materialfenster (gekapselt) bleiben stehen (Stahl/Messing-Schutz)."""
    near = _bg_like(rgb, bg, tol) & (alpha > 0)
    if not near.any():
        return alpha
    outside = ndimage.binary_dilation(alpha <= 0, iterations=1)
    reach = ndimage.binary_propagation(near & outside, mask=near)
    lbl, n = ndimage.label(near)
    for i in range(1, n + 1):
        comp = lbl == i
        if int(comp.sum()) >= 80 and bool((comp & reach).any()):
            alpha[comp] = 0.0
    return alpha


def _hsv(rgb):
    r, g, b = rgb[..., 0] / 255, rgb[..., 1] / 255, rgb[..., 2] / 255
    mx = np.max(rgb, 2) / 255.0
    mn = np.min(rgb, 2) / 255.0
    df = mx - mn + 1e-6
    h = np.zeros_like(mx)
    mask = mx == r
    h[mask] = (60 * ((g - b) / df) % 360)[mask]
    mask = mx == g
    h[mask] = (60 * ((b - r) / df) + 120)[mask]
    mask = mx == b
    h[mask] = (60 * ((r - g) / df) + 240)[mask]
    return h, df / (mx + 1e-6), mx


def deglow_magenta(rgb, alpha, strength=0.9, keep=None):
    """Magenta hart MATTIEREN: Saettigung stark Richtung Luma, Helligkeit gekappt
    -> kein nasser/glaenzender Glanz (Tropfen-/Wet-Look), nur stumpfe Blörre in
    den Rohren (§12). keep: Maske (z.B. Koenig-Auge), die leuchten bleibt."""
    h, s, v = _hsv(rgb)
    band = (((h >= 296) & (h <= 360)) | (h <= 12)) & (s > 0.25) & (v > 0.32) & (alpha > 0)
    if keep is not None:
        band = band & ~keep
    out = rgb.astype(np.float32).copy()
    lum = out.mean(axis=2, keepdims=True)
    pulled = lum + (out - lum) * (1 - strength)      # entsaettigen
    pulled = pulled * (1 - 0.40 * strength)          # global abdunkeln
    pulled = np.minimum(pulled, 140)                 # Specular-/Glanzkerne kappen
    out[band] = pulled[band]
    return np.clip(out, 0, 255)


def deglow_green(rgb, alpha, strength=0.7):
    """Helle gruene/weisse Eigenglanz-Flecken daempfen (z.B. Laternen-/Linsen-
    Leuchten im HELLMUTH-Eckteil), damit nur der Koenig-Orb gruen leuchtet (§9).
    Substanz-im-Glas (mittelhell, gesaettigt) bleibt weitgehend erhalten."""
    h, s, v = _hsv(rgb)
    glow = (h >= 55) & (h <= 170) & (v > 0.48) & (alpha > 0)
    bright = (v > 0.6) & (alpha > 0)  # gleissende weisse/gold/gruene Glanzkerne
    band = glow | bright
    out = rgb.astype(np.float32).copy()
    lum = out.mean(axis=2, keepdims=True)
    pulled = lum + (out - lum) * (1 - strength)
    pulled = np.minimum(pulled, 148)  # Helligkeit der Glanzkerne kappen (Flare/Linse)
    out[band] = pulled[band]
    return np.clip(out, 0, 255)


def dripcrop_magenta(rgb, alpha):
    """Schmale Magenta-Tendrils unter der Haupt-Fusskante kappen."""
    h, s, v = _hsv(rgb)
    mag = (((h >= 300) & (h <= 360)) | (h <= 8)) & (s > 0.4) & (alpha > 0)
    op = alpha > 0
    rows = op.sum(axis=1)
    if rows.max() < 1:
        return alpha
    wmax = rows.max()
    # Hauptfuss = unterste Zeile mit >=35% der Maximalbreite
    foot = np.where(rows >= 0.35 * wmax)[0]
    if len(foot) == 0:
        return alpha
    foot_y = foot.max()
    # unterhalb foot_y: schmale (magenta-getragene) Auslaeufer entfernen
    below = np.zeros_like(alpha, dtype=bool)
    below[foot_y + 1:, :] = True
    kill = below & (mag | (op & (rows[:, None] < 0.18 * wmax)))
    alpha[kill] = 0.0
    return alpha


def desat(rgb, alpha, sat=0.9, protect_hi=True):
    h, s, v = _hsv(rgb)
    out = rgb.astype(np.float32)
    lum = out.mean(axis=2, keepdims=True)
    d = lum + (out - lum) * sat
    if protect_hi:
        # hohe Saettigung (Substanz im Glas, Koenig-Kern) weniger entsaettigen
        p = np.clip((s - 0.45) / 0.3, 0, 1)[..., None]
        d = d + (out - d) * p
    return np.clip(d, 0, 255)


def feather_edges(alpha, frac=0.07, floor=0.0, sides=True, bottom=True):
    """Weiche Auslauf-Federung an ALLEN gewaehlten Kanten (nicht nur unten), damit
    ein beschnittenes Motiv an Seiten + Unterkante ins Ornament/die Leiste blendet
    statt als hart beschnittenes Rechteck aufzukleben (Kritiker: Pasted-Naht
    x1481/1532/1448). `frac` = Anteil der Bounding-Box je Seite; `floor` = Rest-
    Alpha an der aeussersten Kante."""
    op = alpha > 12
    ys, xs = np.where(op)
    if len(xs) < 20:
        return alpha
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    h, w = y1 - y0 + 1, x1 - x0 + 1
    f = alpha.astype(np.float32) / 255.0
    if bottom:
        n = max(2, int(h * frac))
        ramp = np.linspace(floor, 1.0, n)[:, None]
        f[y1 - n + 1:y1 + 1] *= ramp
    if sides:
        n = max(2, int(w * frac))
        rl = np.linspace(floor, 1.0, n)[None, :]
        f[:, x0:x0 + n] *= rl
        f[:, x1 - n + 1:x1 + 1] *= rl[:, ::-1]
        # Oberkante mitfedern, damit auch der Kopf nicht hart abschneidet.
        nt = max(2, int(h * frac))
        f[y0:y0 + nt] *= np.linspace(floor, 1.0, nt)[:, None]
    return f * 255.0


def feather_bottom(alpha, frac=0.10, floor=0.45):
    """Nur Unterkante federn (vertikale Beifuellmotive: Seiten bleiben als Saeule)."""
    return feather_edges(alpha, frac=frac, floor=floor, sides=False, bottom=True)


def _smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def feather_silhouette(alpha, frac=0.14, sides=True, bottom=True, top=True):
    """Distanztransform-Federung ueber die ECHTE Silhouette (nicht die Bbox):
    kein hartes Pasted-Rechteck mehr. sides+bottom+top -> ganze Kontur
    (Begleiter); nur bottom -> Fuss (vertikale Saeule)."""
    op = alpha > 12
    if op.sum() < 30:
        return alpha
    ys, xs = np.where(op)
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    N = max(3, int(round(min(bw, bh) * frac)))
    ramp = _smoothstep(ndimage.distance_transform_edt(op) / float(N))
    f = alpha.astype(np.float32) / 255.0
    if sides and bottom and top:
        return np.minimum(f, ramp) * 255.0
    out = f.copy()
    if bottom:
        y1 = ys.max()
        out[y1 - N + 1:y1 + 1] = np.minimum(out[y1 - N + 1:y1 + 1],
                                            np.minimum(f, ramp)[y1 - N + 1:y1 + 1])
    return out * 255.0


def despill(rgb, alpha, erode=1):
    """Materialfarbe aus dem Kern in den Restsaum bleeden + Alpha weich kappen,
    damit der Rand nicht bg-grau franst (Rand-Luma ~ Kern-Luma)."""
    op = alpha > 12
    inner = ndimage.binary_erosion(op, iterations=erode)
    idx = ndimage.distance_transform_edt(inner, return_distances=False, return_indices=True)
    bleed = rgb[tuple(idx)]
    rgb_out = np.where((op & ~inner)[..., None], bleed, rgb)
    a_out = np.where(inner, alpha, alpha * np.clip(_smoothstep(
        ndimage.distance_transform_edt(op) / 2.0), 0, 1))
    return rgb_out, a_out


def cap_flange(rgb, alpha, where="top", color=(150, 150, 158), grow=1.18):
    """Rohr-/Saeulenende mit sichtbarer Kappe (Ellipse in Materialfarbe) statt
    flacher full-width Alpha-Linie."""
    op = alpha > 12
    rows = op.sum(axis=1)
    if rows.max() < 1:
        return rgb, alpha
    wmax = rows.max()
    yy = (np.where(rows >= 0.85 * wmax)[0].min() if where == "top"
          else np.where(rows >= 0.85 * wmax)[0].max())
    xs = np.where(op[yy])[0]
    cw, cx = xs.max() - xs.min() + 1, (xs.min() + xs.max()) / 2
    fw, fh = cw * grow, max(10, cw * 0.32)
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255).astype(np.uint8),
                                    np.clip(alpha, 0, 255).astype(np.uint8)]), "RGBA")
    ImageDraw.Draw(im).ellipse([cx - fw / 2, yy - fh / 2, cx + fw / 2, yy + fh / 2],
                               fill=(*color, 255))
    arr = np.asarray(im).astype(np.float32)
    a2 = feather_silhouette(arr[..., 3], frac=0.10, sides=True, bottom=False, top=True)
    return arr[..., :3], a2


def steel_present(rgb, alpha, target=72.0, shadow_lift=24.0, hi_knee=150.0,
                  seam=0.5, vcap=128.0, edge_pct=82.0, dil=2):
    """MODERAT-Stahl aus dem Dunkel heben (G-ALL-2): Median-Gain auf Ziel-Luma
    (>=BG+25), additiver Schatten-Lift mit Soft-Knee oben, dann Magenta als matte
    FLAECHE (dilatierter Sobel-Ridge), V<=vcap gedeckelt -> kein Eigenleuchten."""
    op = alpha > 12
    if op.sum() < 30:
        return rgb
    w = np.array([0.299, 0.587, 0.114])
    out = rgb.astype(np.float32).copy()
    med = float(np.median((out @ w)[op]))
    gain = float(np.clip(target / max(med, 1.0), 1.0, 3.0))
    lifted = out * gain
    Ll = lifted @ w
    comp = hi_knee + np.maximum(Ll - hi_knee, 0) * 0.35
    lifted *= np.where(Ll > hi_knee, comp / np.maximum(Ll, 1e-3), 1.0)[..., None]
    Ln = np.clip((lifted @ w) / 255.0, 0, 1)
    add = ((1.0 - Ln) ** 1.6 * shadow_lift)[..., None]
    out = np.where(op[..., None], np.clip(lifted + add, 0, 255), out)
    lum2 = out @ w
    inner = ndimage.binary_erosion(op, iterations=2)
    edge = np.hypot(ndimage.sobel(lum2, axis=1), ndimage.sobel(lum2, axis=0))
    if inner.sum() > 0:
        ridge = inner & (edge > np.percentile(edge[inner], edge_pct))
        band = ndimage.binary_dilation(ridge, iterations=dil) & op & (lum2 < 150)
    else:
        band = np.zeros_like(op)
    mag = np.array([150.0, 60.0, 110.0])
    out[band] = out[band] * (1 - seam) + mag * seam
    if band.sum():
        v = out[band].max(axis=1, keepdims=True)
        out[band] = out[band] * np.minimum(1.0, vcap / np.maximum(v, 1e-3))
    return np.clip(out, 0, 255)


def corner_clean(rgb, alpha):
    """Eck-Ornament UEBER blankem Hintergrund luecken- und tropfenfrei machen:
    (1) Opening killt duenne Magenta-Tropfen/Tendrils, (2) groesste Komponente +
    Loecher fuellen -> solide Platte (kein Hintergrund scheint durch), (3) saubere
    gerade Diagonal-Hypotenuse statt gerissener Kante. Gemessen am gerenderten
    Bild: 0 eingeschlossene Hintergrund-Pixel an der Kante."""
    op = alpha > 12
    op = ndimage.binary_opening(op, iterations=4)         # Tropfen + Saegezahn-Rand weg
    lbl, n = ndimage.label(op)
    if n >= 1:
        sizes = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
        op = lbl == int(np.argmax(sizes) + 1)             # nur die Hauptplatte
    op = ndimage.binary_fill_holes(op)                    # innere Luecken zu
    ys, xs = np.where(op)
    # Perzentil-Extents (gegen Skew durch vereinzelte Tendrils) + Inset-Diagonale,
    # die INNERHALB des soliden Stahls liegt -> garantiert kein gerissener Rand.
    x0, x1 = np.percentile(xs, 1), np.percentile(xs, 99)
    y0, y1 = np.percentile(ys, 1), np.percentile(ys, 99)
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
    u = (xx - x0) / max(1, x1 - x0)
    v = (yy - y0) / max(1, y1 - y0)
    keep = op & ((u + v) <= 0.90)                         # saubere Diagonale (oben-links)
    keep = ndimage.binary_erosion(keep, iterations=1)     # 1px Saum gegen AA-Reste
    steel = np.median(rgb[(alpha > 12) & (rgb.max(2) - rgb.min(2) < 30)], axis=0)
    if not np.isfinite(steel).all():
        steel = np.array([62.0, 58.0, 60.0])
    out = rgb.copy()
    out[keep & ~(alpha > 12)] = steel                     # gefuellte Loecher = Stahl
    return out, np.where(keep, 255.0, 0.0)


def trim(rgb, alpha):
    ys, xs = np.where(alpha > 12)
    if len(xs) == 0:
        return rgb, alpha
    return (rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1],
            alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def save(rgb, alpha, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    a = np.clip(alpha, 0, 255).astype(np.uint8)
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), a])
    Image.fromarray(out, "RGBA").save(path)


def process(src_rel, out_rel, koenig=False, deglow=False, drip=False, pocket=True,
            delens=False, crop=None, feather=None, present=False, corner=False):
    rgb = np.asarray(Image.open(os.path.join(SRC, src_rel)).convert("RGB")).astype(np.float32)
    alpha, bg, rgb = freistellen(rgb)
    if pocket:
        alpha = stab_pockets(rgb, alpha, bg)
    if deglow:
        # Koenig (MODERAT-Maschine): zweiten Magenta-Akzent (Pumpzylinder)
        # entgluehen; das Auge leuchtet ueber die separate Iris (eigenes Asset).
        rgb = deglow_magenta(rgb, alpha)
    if delens:
        rgb = deglow_green(rgb, alpha)
    if corner:
        # Eck-Ornament ueber blankem Hintergrund: solide Platte + saubere Diagonale,
        # luecken- und tropfenfrei (am gerenderten Bild geprueft, nicht am DOM).
        rgb, alpha = corner_clean(rgb, alpha)
    if drip:
        alpha = dripcrop_magenta(rgb, alpha)
    if crop:  # auf EIN ikonisches Einzelmotiv beschneiden (L%,T%,R%,B%)
        H, W = alpha.shape
        l, t, r, b = crop
        m = np.zeros_like(alpha)
        m[int(t / 100 * H):int(b / 100 * H), int(l / 100 * W):int(r / 100 * W)] = 1
        alpha = alpha * m
    # Substanz im Glas / Akzente (hohe Saettigung) vor der Entsaettigung schuetzen,
    # damit gruene Phiolen lesbar bleiben (Kritiker: »zu dunkel«).
    rgb = desat(rgb, alpha, sat=0.92, protect_hi=True)
    if present:
        # MODERAT-Stahl aus dem Dunkel heben + matte Magenta-Emissionsnaht (G-ALL-2).
        rgb = steel_present(rgb, alpha)
    elif crop:
        # HELLMUTH-Begleiter heben Mitten/Schatten an (Gamma-Lift), damit das Motiv
        # auf der dunklen Leiste als Form liest statt dunkel-auf-dunkel zu versumpfen.
        rgb = 255.0 * np.power(np.clip(rgb, 0, 255) / 255.0, 0.78)
    if feather == "edges":
        rgb, alpha = despill(rgb, alpha)  # Restsaum mit Materialfarbe fuellen
        alpha = feather_silhouette(alpha, frac=0.14, sides=True, bottom=True, top=True)
    elif feather == "bottom":
        rgb, alpha = cap_flange(rgb, alpha, where="top",
                                color=(150, 150, 158) if present else (150, 140, 90))
        alpha = feather_silhouette(alpha, frac=0.10, sides=False, bottom=True, top=False)
    rgb, alpha = trim(rgb, alpha)
    save(rgb, alpha, os.path.join(OUT, out_rel))
    return alpha.shape[1], alpha.shape[0]


def cut_eye():
    """Runder Iris-Ausschnitt aus moderat_eye, eng auf die Iris (ohne Bezel/Drips)."""
    im = np.asarray(Image.open(os.path.join(SRC, "violett/moderat_eye.png")).convert("RGB")).astype(np.float32)
    H, W = im.shape[:2]
    s = (W / 2048 + H / 2048) / 2
    # Iris (pink) Schwerpunkt + Radius messen
    h, sat, v = _hsv(im)
    pink = (((h >= 300) & (h <= 360)) | (h <= 10)) & (sat > 0.45) & (v > 0.4)
    # groesste zusammenhaengende Pink-Komponente = die Iris (nicht die Streu-Drips)
    pink = ndimage.binary_closing(pink, iterations=3)
    lbl, n = ndimage.label(pink)
    sizes = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    iris = lbl == (int(sizes.argmax()) + 1)
    ys, xs = np.where(iris)
    cx, cy = xs.mean(), ys.mean()
    # Radius aus der Iris-Komponente (knapp ausserhalb der Pupille/Iris-Kante)
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    r = np.percentile(d, 99) * 1.02
    yy, xx = np.mgrid[0:H, 0:W]
    mask = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
    alpha = np.where(mask, 255.0, 0.0)
    rgb, alpha = trim(im, alpha)
    save(rgb, alpha, os.path.join(OUT, "moderat/eye/iris.png"))
    return int(cx), int(cy), int(r), (rgb.shape[1], rgb.shape[0])
