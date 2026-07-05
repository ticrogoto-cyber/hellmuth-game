#!/usr/bin/env python3
"""W1 - Binaurale HRTF (sofar + MIT-KEMAR-SOFA).

Faltet ein Mono-Quellsignal mit der KEMAR-HRIR bei Azimut 90 Grad (Quelle links)
und schreibt das Ergebnis als Stereo-WAV. Misst die L/R-Energie-Ratio (Schatten
am abgewandten Ohr) und belegt gegen den Kritiker, dass es echte, FREQUENZ-
ABHAENGIGE Faltung ist (nicht Hard-Pan): das L/R-Verhaeltnis steigt mit der
Frequenz (Kopfschatten daempft Hoehen am fernen Ohr staerker).

Solutions-Referenz (docs/CONTAINER-WERKZEUGE-2.md, C2 Welle 3):
  L=2,54  R=0,17  ->  L/R-Energie-Ratio 15,09x

Kein echtes Hellmuth-Sprach-Asset vorhanden (public/audio/de/ leer, vor
ElevenLabs-Lieferung). Quelle daher synthetisch: Klick (= Referenzsignal der
Messung, Faltung ergibt die HRIR) plus ein hoerbarer Breitband-Burst fuer das
WAV. Sobald ein echtes Voice-Asset vorliegt, ist es ein Einzeiler-Austausch.
"""
from __future__ import annotations
import os
import sys
import json
import urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROOF = os.path.join(ROOT, "proof", "audio")
SOFA_URL = "https://raw.githubusercontent.com/hoene/libmysofa/main/share/MIT_KEMAR_normal_pinna.sofa"
SOFA_CACHE = "/tmp/MIT_KEMAR_normal_pinna.sofa"
AZ_ZIEL, EL_ZIEL = 90.0, 0.0


def sofa_laden():
    import sofar as sf
    if not os.path.exists(SOFA_CACHE):
        urllib.request.urlretrieve(SOFA_URL, SOFA_CACHE)
    sofa = sf.read_sofa(SOFA_CACHE)
    ir = np.asarray(sofa.Data_IR)            # (M, R=2, N)
    pos = np.asarray(sofa.SourcePosition)    # (M, 3) [az, el, r] grad
    fs = int(np.asarray(sofa.Data_SamplingRate).ravel()[0])
    return ir, pos, fs


def naechste_quelle(pos):
    az = pos[:, 0] % 360.0
    el = pos[:, 1]
    d = np.abs(((az - AZ_ZIEL + 180) % 360) - 180) + np.abs(el - EL_ZIEL)
    return int(np.argmin(d))


def energie(x):
    return float(np.sum(np.asarray(x, dtype=np.float64) ** 2))


def bandratio(hl, hr, fs, lo, hi):
    n = 1 << 14
    Hl = np.abs(np.fft.rfft(hl, n)); Hr = np.abs(np.fft.rfft(hr, n))
    f = np.fft.rfftfreq(n, 1.0 / fs)
    m = (f >= lo) & (f < hi)
    el = float(np.sum(Hl[m] ** 2)); er = float(np.sum(Hr[m] ** 2)) + 1e-20
    return el / er


def main():
    os.makedirs(PROOF, exist_ok=True)
    ir, pos, fs = sofa_laden()
    idx = naechste_quelle(pos)
    az, el, _ = pos[idx]
    hl = ir[idx, 0, :].astype(np.float64)
    hr = ir[idx, 1, :].astype(np.float64)

    # Energie-Ratio aus der HRIR selbst (= Faltung eines Einheits-Klicks).
    eL, eR = energie(hl), energie(hr)
    ratio = eL / (eR + 1e-20)

    # Hoerbares WAV: 0,5 s Breitband-Burst (Voice-Platzhalter) durch beide HRIRs.
    rng = np.random.default_rng(5)
    src = rng.standard_normal(int(0.5 * fs))
    src *= np.hanning(len(src))
    L = np.convolve(src, hl); R = np.convolve(src, hr)
    peak = max(np.max(np.abs(L)), np.max(np.abs(R)), 1e-9)
    stereo = np.column_stack([L, R]) / peak * 0.97
    import soundfile as sf
    wav = os.path.join(PROOF, "hrtf_az90.wav")
    sf.write(wav, stereo.astype(np.float32), fs)
    eL_r, eR_r = energie(L), energie(R)

    # Kritiker-Gegenprobe: frequenzabhaengige Filterung (nicht Hard-Pan).
    r_lo = bandratio(hl, hr, fs, 100, 1000)
    r_hi = bandratio(hl, hr, fs, 4000, 16000)

    # Spektrum-Plot (L vs R) als Beleg.
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        n = 1 << 14
        f = np.fft.rfftfreq(n, 1.0 / fs)
        Hl = 20 * np.log10(np.abs(np.fft.rfft(hl, n)) + 1e-9)
        Hr = 20 * np.log10(np.abs(np.fft.rfft(hr, n)) + 1e-9)
        plt.figure(figsize=(8, 4))
        plt.semilogx(f[1:], Hl[1:], label="L (zugewandt)")
        plt.semilogx(f[1:], Hr[1:], label="R (abgewandt)")
        plt.xlim(100, fs / 2); plt.xlabel("Hz"); plt.ylabel("dB")
        plt.title(f"KEMAR HRIR az={az:.0f} el={el:.0f} - L/R freq-abhaengig")
        plt.legend(); plt.grid(True, which="both", alpha=0.3); plt.tight_layout()
        plt.savefig(os.path.join(PROOF, "hrtf_spectrum.png"), dpi=110)
        plot_ok = True
    except Exception as e:  # noqa: BLE001
        plot_ok = False
        print(f"[warn] Plot uebersprungen: {e}", file=sys.stderr)

    res = {
        "sofa": "MIT_KEMAR_normal_pinna.sofa", "fs": fs,
        "quelle_az": round(float(az), 1), "quelle_el": round(float(el), 1),
        "energie_L": round(eL, 4), "energie_R": round(eR, 4),
        "ratio_LR": round(ratio, 2), "ratio_render_LR": round(eL_r / (eR_r + 1e-20), 2),
        "solutions_ratio": 15.09,
        "bandratio_100_1000Hz": round(r_lo, 2),
        "bandratio_4000_16000Hz": round(r_hi, 2),
        "wav": "proof/audio/hrtf_az90.wav", "spectrum_png": plot_ok,
    }
    print(json.dumps(res, indent=2))
    with open(os.path.join(PROOF, "hrtf_w1.json"), "w") as fh:
        json.dump(res, fh, indent=2)


if __name__ == "__main__":
    main()
