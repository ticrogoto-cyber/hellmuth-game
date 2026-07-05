#!/usr/bin/env python3
"""W3 - BPM-Cross-Check (aubio vs. librosa vs. essentia).

Baut einen Klick-Track mit BEKANNTEM Tempo (120 BPM, Klick alle 0,5 s) und laesst
drei unabhaengige Engines das Tempo schaetzen. Der bekannte Click-Track ist die
Gegenprobe gegen den Kritiker ("aubio gibt eine Zahl aus, die nicht stimmt"):
drei Engines auf demselben 120-BPM-Signal kreuzbestaetigen.

Solutions-Referenz (docs/CONTAINER-WERKZEUGE-2.md, C2 Welle 3):
  aubio 120,4  ·  librosa 120,2  ·  essentia 119,3   (alle drei konsistent)
"""
from __future__ import annotations
import os
import json
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROOF = os.path.join(ROOT, "proof", "audio")
SR = 44100
BPM_BEKANNT = 120.0
DUR = 20.0


def aubio_bpm(sig):
    import aubio
    win_s, hop_s = 1024, 512
    o = aubio.tempo("default", win_s, hop_s, SR)
    werte = []
    i = 0
    x = sig.astype(np.float32)
    while i + hop_s <= len(x):
        if o(x[i:i + hop_s]):
            b = o.get_bpm()
            if b > 0:
                werte.append(float(b))
        i += hop_s
    return float(np.median(werte)) if werte else float(o.get_bpm())


def librosa_bpm(sig):
    import librosa
    tempo, _ = librosa.beat.beat_track(y=sig.astype(np.float32), sr=SR)
    return float(np.atleast_1d(tempo)[0])


def essentia_bpm(sig):
    import essentia.standard as es
    bpm, _, _, _, _ = es.RhythmExtractor2013(method="multifeature")(sig.astype(np.float32))
    return float(bpm)


def main():
    os.makedirs(PROOF, exist_ok=True)
    import librosa
    import soundfile as sf

    times = np.arange(0.0, DUR, 60.0 / BPM_BEKANNT)   # 0,5 s -> 120 BPM
    sig = librosa.clicks(times=times, sr=SR, click_duration=0.03, length=int(DUR * SR))
    # Click-Track ist trivial regenerierbar -> nach /tmp, nicht ins Repo (3,5 MB).
    sf.write("/tmp/bpm_clicktrack_120.wav", sig.astype(np.float32), SR)

    werte, fehler = {}, {}
    for name, fn, ref in [
        ("aubio", aubio_bpm, 120.4),
        ("librosa", librosa_bpm, 120.2),
        ("essentia", essentia_bpm, 119.3),
    ]:
        try:
            werte[name] = round(fn(sig), 1)
        except Exception as e:  # noqa: BLE001
            fehler[name] = f"{type(e).__name__}: {e}"

    res = {
        "bekannt_bpm": BPM_BEKANNT, "klicks": len(times),
        "gemessen": werte,
        "solutions": {"aubio": 120.4, "librosa": 120.2, "essentia": 119.3},
        "abweichung_vom_bekannten_pct": {
            k: round(abs(v - BPM_BEKANNT) / BPM_BEKANNT * 100, 2) for k, v in werte.items()
        },
        "fehler": fehler,
        "wav": "/tmp/bpm_clicktrack_120.wav (regenerierbar, nicht committet)",
    }
    print(json.dumps(res, indent=2))
    with open(os.path.join(PROOF, "bpm_w3.json"), "w") as fh:
        json.dump(res, fh, indent=2)


if __name__ == "__main__":
    main()
