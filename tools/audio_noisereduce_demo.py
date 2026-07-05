#!/usr/bin/env python3
"""W2 - Rauschunterdrueckung (noisereduce), SNR vorher/nachher.

440-Hz-Sinus + Breitbandrauschen -> reduce_noise(stationary=True). Misst die
SNR-Verbesserung (Referenz-Methode gegen das saubere Signal UND Band-Methode:
Signalband um 440 Hz vs. Rauschband). Belegt gegen den Kritiker, dass das Signal
ERHALTEN bleibt (440-Hz-Peak dominiert nach der Reduktion; hohe Korrelation mit
dem Clean-Signal), nicht mitgeloescht wird.

Solutions-Referenz (docs/CONTAINER-WERKZEUGE-2.md, C2 Welle 3):
  SNR-Verbesserung 96,4x  (Rauschband 0,2 % erhalten, Signalband 22 %)
"""
from __future__ import annotations
import os
import json
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROOF = os.path.join(ROOT, "proof", "audio")
SR = 44100
F0 = 440.0
DUR = 3.0


def bandenergie(x, lo, hi):
    n = 1 << 16
    X = np.abs(np.fft.rfft(x, n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    m = (f >= lo) & (f < hi)
    return float(np.sum(X[m] ** 2))


def main():
    os.makedirs(PROOF, exist_ok=True)
    import noisereduce as nr
    import soundfile as sf

    rng = np.random.default_rng(11)
    t = np.arange(int(DUR * SR)) / SR
    clean = 0.5 * np.sin(2 * np.pi * F0 * t)
    noise_amp = 0.25                            # Input-SNR ~ +6 dB
    noise = noise_amp * rng.standard_normal(len(t))
    noisy = clean + noise

    # Rauschprofil aus einem separaten Noise-only-Clip (textbuch-korrekte Nutzung):
    # so subtrahiert die stationaere Reduktion das RAUSCHEN, nicht den 440-Hz-Ton.
    # (Ein konstanter Sinus IST stationaer -> ohne Referenz frisst die Reduktion
    # ihn als vermeintliches Rauschen; das waere der Kritiker-Befund.)
    noise_only = (noise_amp * rng.standard_normal(SR)).astype(np.float32)
    denoised = nr.reduce_noise(y=noisy.astype(np.float32), y_noise=noise_only,
                               sr=SR, stationary=True)
    denoised = np.asarray(denoised, dtype=np.float64)
    n = min(len(denoised), len(clean))
    clean, noisy, denoised = clean[:n], noisy[:n], denoised[:n]

    # Referenz-Methode: SNR = Signalenergie / Residualenergie gegen Clean.
    res_in = noisy - clean
    res_out = denoised - clean
    snr_in = np.sum(clean ** 2) / (np.sum(res_in ** 2) + 1e-20)
    snr_out = np.sum(clean ** 2) / (np.sum(res_out ** 2) + 1e-20)
    verb_ref = snr_out / snr_in

    # Band-Methode: Signalband 435-445 Hz vs. Rauschband 2-20 kHz.
    sig_in = bandenergie(noisy, 435, 445); sig_out = bandenergie(denoised, 435, 445)
    noi_in = bandenergie(noisy, 2000, 20000); noi_out = bandenergie(denoised, 2000, 20000)
    snr_band_in = sig_in / (noi_in + 1e-20)
    snr_band_out = sig_out / (noi_out + 1e-20)
    verb_band = snr_band_out / (snr_band_in + 1e-20)
    sig_erhalt = sig_out / (sig_in + 1e-20)     # ~0,22 erwartet
    noi_erhalt = noi_out / (noi_in + 1e-20)     # ~0,002 erwartet

    # Kritiker-Gegenprobe: Korrelation denoised<->clean hoch, <->noise niedrig.
    def korr(a, b):
        a = a - a.mean(); b = b - b.mean()
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-20))
    k_clean = korr(denoised, clean)
    k_noise = korr(denoised, noise[:n])

    sf.write(os.path.join(PROOF, "noisereduce_noisy.wav"), noisy.astype(np.float32), SR)
    sf.write(os.path.join(PROOF, "noisereduce_denoised.wav"), denoised.astype(np.float32), SR)

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        nf = 1 << 15
        f = np.fft.rfftfreq(nf, 1.0 / SR)
        def spec(x):
            return 20 * np.log10(np.abs(np.fft.rfft(x * np.hanning(len(x)), nf)) + 1e-9)
        plt.figure(figsize=(8, 4))
        plt.semilogx(f[1:], spec(noisy)[1:], label="verrauscht", alpha=0.7)
        plt.semilogx(f[1:], spec(denoised)[1:], label="entrauscht", alpha=0.9)
        plt.axvline(F0, color="k", ls="--", lw=0.8, label="440 Hz")
        plt.xlim(50, SR / 2); plt.xlabel("Hz"); plt.ylabel("dB")
        plt.title("noisereduce: Vorher/Nachher-Spektrum (Signal erhalten, Rauschen weg)")
        plt.legend(); plt.grid(True, which="both", alpha=0.3); plt.tight_layout()
        plt.savefig(os.path.join(PROOF, "noisereduce_spectrum.png"), dpi=110)
        plot_ok = True
    except Exception as e:  # noqa: BLE001
        plot_ok = False
        print(f"[warn] Plot uebersprungen: {e}")

    res = {
        "snr_in_dB": round(10 * np.log10(snr_in), 2),
        "snr_out_dB": round(10 * np.log10(snr_out), 2),
        "verbesserung_referenz_x": round(float(verb_ref), 1),
        "verbesserung_band_x": round(float(verb_band), 1),
        "signalband_erhalt_pct": round(sig_erhalt * 100, 1),
        "rauschband_erhalt_pct": round(noi_erhalt * 100, 2),
        "solutions_verbesserung_x": 96.4,
        "solutions_signalband_pct": 22.0,
        "solutions_rauschband_pct": 0.2,
        "korr_denoised_clean": round(k_clean, 3),
        "korr_denoised_noise": round(k_noise, 3),
        "spectrum_png": plot_ok,
    }
    print(json.dumps(res, indent=2))
    with open(os.path.join(PROOF, "noisereduce_w2.json"), "w") as fh:
        json.dump(res, fh, indent=2)


if __name__ == "__main__":
    main()
