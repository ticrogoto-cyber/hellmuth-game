#!/usr/bin/env python3
# baseline_gate.py — Anti-Self-Green P1a/P2 (HUD-KRISENSTAB.md §13).
#
# Die Drift-Baseline (proof/baseline/*.png) ist der Soll-Anker, NICHT der jeweils
# aktuelle Code-Stand. Sie gilt nur, soweit ein menschlich gesetztes Hash-Manifest
# proof/baseline/APPROVED.sha256 jeden Baseline-PNG-Hash deckt:
#   * Aendert sich ein Baseline-PNG ohne Neu-Segnung -> ROT (P1a; das verhindert
#     das stille cp / Selbst-Segnen, das der Drift unsichtbar macht).
#   * Fehlt/leer ist die Baseline -> ROT (P2; KEIN Auto-Seed, kein stilles Gruen).
#   * Fehlt das Manifest noch (vor der ersten menschlichen Abnahme), bleibt der
#     Hash-Abgleich inaktiv und meldet eine Warnung statt rot — die Segnung ist
#     Ticros separater Akt (tools/segnen.sh), nicht der einer Code-Instanz.
#
#   python3 tools/baseline_gate.py     # Exit 1 bei Verstoss

import hashlib
import os
import sys

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "proof", "baseline")
MAN = os.path.join(BASE, "APPROVED.sha256")
PNGS = ("moderat_default.png", "hellmuth_default.png")


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    errs, warns = [], []

    # P2 — Baseline muss da und nicht leer sein (kein Auto-Seed).
    present = [p for p in PNGS
               if os.path.exists(os.path.join(BASE, p))
               and os.path.getsize(os.path.join(BASE, p)) > 0]
    missing = [p for p in PNGS if p not in present]
    if missing:
        errs.append(f"Baseline fehlt/leer: {missing} — kein Auto-Seed, keine Selbst-Segnung (P2)")

    # P1a — Hash-Manifest gegen die echten PNGs.
    if os.path.exists(MAN):
        man = {}
        for line in open(MAN, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 2:
                man[os.path.basename(parts[1])] = parts[0].lower()
        for p in present:
            actual = sha256(os.path.join(BASE, p))
            if p not in man:
                errs.append(f"{p}: nicht im Manifest (ungesegneter Baseline-PNG)")
            elif man[p] != actual:
                errs.append(f"{p}: Hash weicht vom Manifest ab — PNG geaendert ohne Neu-Segnung (P1a)")
        for p in man:
            if p not in present:
                errs.append(f"Manifest nennt {p}, in der Baseline aber nicht vorhanden")
    else:
        warns.append("APPROVED.sha256 fehlt — Baseline noch nicht menschlich gesegnet "
                     "(nach Abnahme: tools/segnen.sh). Hash-Abgleich inaktiv.")

    print("== Baseline-Gate (P1a Hash-Manifest / P2 Auto-Seed-Sperre) ==")
    for w in warns:
        print(f"  ~ {w}")
    if errs:
        print(f"  ROT — {len(errs)} Verstoss(e):")
        for e in errs:
            print(f"    - {e}")
        return 1
    tail = "Manifest deckt alle PNGs." if os.path.exists(MAN) else "Manifest folgt nach Segnung."
    print(f"  GRUEN — Baseline vorhanden; {tail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
