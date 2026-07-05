#!/usr/bin/env python3
"""
hud_template_measure.py — Neuvermessung der verbindlichen HUD-Vorlagen
(docs/hud-zustand-1.png / -2.png, 8000x4500, Faktor 4.1667 auf 1920x1080).

Farbcode der Vorlagen: Grau(127)=Panelgrund, Rot(255,127,127)=Ornament,
Gelb(191,191,63)=Bild, Tuerkis(63,191,191)=Icon, Hellgrau(191)=Text,
Weiss(255)=Spielfeld.

Ausgabe: JSON je Zustand mit allen Zonen (Klasse, x,y,w,h in Zielpixeln auf
1920x1080) nach docs/hud-zonen-<n>.json + Konsolenprotokoll. Die Vorlage ist
die Masswahrheit; hud-spec.md wird gegen diese Messung korrigiert.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..")
SCALE = 1920 / 8000  # = 1/4.16667

CLASSES = {
    "panel": (127, 127, 127),
    "ornament": (255, 127, 127),
    "bild": (191, 191, 63),
    "icon": (63, 191, 191),
    "text": (191, 191, 191),
    "slot": (127, 127, 255),  # VIOLETT: Ornament-Slots (#1-#4), Spec v2 §4/§5
    "feld": (255, 255, 255),
}


def classify(arr: np.ndarray) -> dict:
    """Pixel -> Klassenmasken per minimaler Farbdistanz."""
    h, w, _ = arr.shape
    refs = np.array(list(CLASSES.values()), dtype=np.float32)
    flat = arr.reshape(-1, 3).astype(np.float32)
    d = np.linalg.norm(flat[:, None, :] - refs[None, :, :], axis=2)
    idx = d.argmin(axis=1).reshape(h, w)
    return {name: idx == i for i, name in enumerate(CLASSES)}


def components(mask: np.ndarray, min_px: int = 200):
    lbl, n = ndimage.label(mask)
    out = []
    for sl in ndimage.find_objects(lbl):
        if sl is None:
            continue
        ys, xs = sl
        area = int(mask[sl].sum())
        if area < min_px:
            continue
        out.append((xs.start, ys.start, xs.stop - xs.start, ys.stop - ys.start, area))
    return out


def measure(path: str):
    im = Image.open(path).convert("RGB")
    arr = np.asarray(im)
    masks = classify(arr)
    zones = []
    for cls in ("panel", "bild", "icon", "text", "slot"):
        for (x, y, w, h, area) in components(masks[cls]):
            # Fuellgrad gegen Loecher/zusammengeklebte Zonen pruefen
            fill = area / (w * h)
            # Rechteck-Klassen sind solide Flaechen; gestreute Antialias-Kanten
            # (niedriger Fuellgrad) sind Messartefakte -> verwerfen. Slots duerfen
            # geformt (Dreieck/organisch) sein und bleiben erhalten.
            # Einheitenkarte hat durch eingebettete Inhalte (Portraet, Icons,
            # Befehlsraster) nur ~0.45 Fuellgrad -> Schwelle 0.30 haelt sie,
            # verwirft aber gestreute Antialias-Artefakte (Fuellgrad ~0.15).
            if cls != "slot" and fill < 0.30:
                continue
            zones.append({
                "cls": cls,
                "x": round(x * SCALE, 1), "y": round(y * SCALE, 1),
                "w": round(w * SCALE, 1), "h": round(h * SCALE, 1),
                "fill": round(fill, 3),
            })
    zones.sort(key=lambda z: (z["cls"], z["y"], z["x"]))
    return zones, masks


def main():
    for n in (1, 2):
        path = os.path.join(ROOT, f"docs/hud-zustand-{n}.png")
        zones, masks = measure(path)
        out = os.path.join(ROOT, f"docs/hud-zonen-{n}.json")
        with open(out, "w") as f:
            json.dump(zones, f, indent=1)
        print(f"== Zustand {n}: {len(zones)} Zonen -> {out}")
        for z in zones:
            print(f"  {z['cls']:6} x={z['x']:7} y={z['y']:7} w={z['w']:7} h={z['h']:7} fill={z['fill']}")
        # Ornament-Maske als Referenzbild (1920x1080) fuer das Gate sichern
        red = (masks["ornament"] * 255).astype(np.uint8)
        Image.fromarray(red).resize((1920, 1080), Image.NEAREST).save(
            os.path.join(ROOT, f"docs/hud-ornamentmaske-{n}.png"))
        # Slot-Maske (VIOLETT) als Grenz-Referenz fuer die V2-Slot-Gesetze.
        vio = (masks["slot"] * 255).astype(np.uint8)
        Image.fromarray(vio).resize((1920, 1080), Image.NEAREST).save(
            os.path.join(ROOT, f"docs/hud-slotmaske-{n}.png"))


if __name__ == "__main__":
    sys.exit(main())
