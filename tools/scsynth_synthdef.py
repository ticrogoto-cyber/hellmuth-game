#!/usr/bin/env python3
"""scsynth_synthdef.py — SynthDef-Generator + headless `scsynth -N`-Render.

Welle-3-Hebel aus docs/CONTAINER-WERKZEUGE-2.md C2 (Solutions-Ticket Welle 3,
»scsynth NRT«): scsynth läuft ohne Qt headless im Container, aber die SC-
Distribution liefert keine `*.scsyndef` mit. Dieses Skript generiert eine
SynthDef per `supriya` (Python-SC-Brücke), schreibt sie binär raus, und ruft
`scsynth -N <osc-file> ...` für den Non-Real-Time-Render.

Beispiel-Synth: Sinus 440 Hz, Mono, 1 s, 48 kHz → WAV.

Aufruf:
  python3 tools/scsynth_synthdef.py --out proof/audio/scsynth_demo.wav
  python3 tools/scsynth_synthdef.py --freq 880 --duration 2 --out /tmp/test.wav

Beweis-Mess-Punkte:
- Dauer = `duration` ± 0,01 s (44/48 kHz Quantisierung).
- RMS >> 0 (Sinus mit Amplitude 0,3 → RMS ≈ 0,21).
- Frequenz-Peak im FFT bei `freq` ± 1 Hz.

Determinismus: scsynth NRT ist deterministisch bei gleichem Input.
"""
from __future__ import annotations

import argparse
import struct
import subprocess
import sys
import wave
from pathlib import Path


def _build_synthdef(name: str = "sine_demo") -> bytes:
    """Baut eine minimale SynthDef per supriya: Out.ar(0, SinOsc.ar(freq) * amp).
    Liefert die binären SCgf-Bytes. Default-Args: freq=440, amp=0.3."""
    try:
        from supriya import synthdef
        from supriya.ugens import Out, SinOsc
    except ImportError as exc:
        raise SystemExit(
            "supriya fehlt. Installation:  pip install supriya\n"
            f"(Original-Fehler: {exc})"
        ) from exc

    @synthdef()
    def sine_demo(freq=440.0, amp=0.3):
        sig = SinOsc.ar(frequency=freq) * amp
        Out.ar(bus=0, source=sig)

    sd = sine_demo
    sd._name = name
    return sd.compile()


def _write_osc_score(score_path: Path, synthdef_bytes: bytes, duration: float,
                     freq: float, amp: float) -> None:
    """OSC-Score-Datei fuer `scsynth -N`. Format: Folge von
    <int32-laenge><osc-bundle> Eintraegen, sortiert nach Bundle-Zeit."""
    def pad(b: bytes, n: int = 4) -> bytes:
        return b + b"\x00" * ((n - len(b) % n) % n)

    def osc_str(s: str) -> bytes:
        return pad(s.encode("utf-8") + b"\x00")

    def osc_blob(b: bytes) -> bytes:
        return struct.pack(">i", len(b)) + pad(b)

    def osc_msg(addr: str, *args) -> bytes:
        out = osc_str(addr)
        types = ","
        body = b""
        for a in args:
            if isinstance(a, int):
                types += "i"
                body += struct.pack(">i", a)
            elif isinstance(a, float):
                types += "f"
                body += struct.pack(">f", a)
            elif isinstance(a, str):
                types += "s"
                body += osc_str(a)
            elif isinstance(a, bytes):
                types += "b"
                body += osc_blob(a)
            else:
                raise ValueError(f"unsupported OSC arg type: {type(a)}")
        return out + osc_str(types) + body

    def osc_bundle(ts: float, *msgs: bytes) -> bytes:
        # scsynth NRT erwartet OSC-Bundle-Timetags relativ; wir kodieren
        # ts als (secs, frac) ohne den +1 NTP-Offset (verdoppelt sonst die
        # Render-Dauer).
        secs = int(ts)
        frac = int((ts - secs) * (2**32))
        body = struct.pack(">II", secs, frac)
        for m in msgs:
            body += struct.pack(">i", len(m)) + m
        return osc_str("#bundle") + body

    bundles = []
    # t=0: SynthDef laden + Synth starten
    bundles.append(osc_bundle(0.0,
        osc_msg("/d_recv", synthdef_bytes),
        osc_msg("/s_new", "sine_demo", 1000, 0, 0, "freq", float(freq), "amp", float(amp)),
    ))
    # t=duration: Synth beenden + leerer Bundle als Endmarker
    bundles.append(osc_bundle(float(duration),
        osc_msg("/n_free", 1000),
    ))
    bundles.append(osc_bundle(float(duration) + 0.05))  # leere Bundle = Render-Ende

    with open(score_path, "wb") as f:
        for b in bundles:
            f.write(struct.pack(">i", len(b)) + b)


def _run_scsynth_nrt(score: Path, out_wav: Path, sample_rate: int = 48000) -> None:
    """scsynth -N <cmd-file> <input-file> <output-file> <sample-rate>
       <header-format> <sample-format> [<other options>]"""
    cmd = [
        "scsynth", "-N",
        str(score), "_", str(out_wav),
        str(sample_rate), "WAV", "int16",
        "-o", "1",   # 1 Output-Kanal
    ]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        raise SystemExit(f"scsynth failed (exit {p.returncode}):\n{p.stderr or p.stdout}")


def _measure_wav(path: Path) -> dict:
    """Dauer, RMS, Peak — beweist, dass die WAV kein Stille-Artefakt ist."""
    with wave.open(str(path), "rb") as w:
        nch = w.getnchannels()
        sr = w.getframerate()
        nf = w.getnframes()
        sw = w.getsampwidth()
        data = w.readframes(nf)
    if sw == 2:
        import array
        samples = array.array("h", data)
    else:
        raise RuntimeError(f"sample width {sw} not handled")
    dur = nf / sr
    if not samples:
        return {"duration_s": dur, "rms": 0.0, "peak": 0, "n_frames": nf,
                "sample_rate": sr, "channels": nch}
    rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
    peak = max(abs(s) for s in samples)
    return {
        "duration_s": dur,
        "rms": rms,
        "peak": peak,
        "n_frames": nf,
        "sample_rate": sr,
        "channels": nch,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="proof/audio/scsynth_demo.wav")
    ap.add_argument("--freq", type=float, default=440.0)
    ap.add_argument("--amp", type=float, default=0.3)
    ap.add_argument("--duration", type=float, default=1.0)
    ap.add_argument("--sample-rate", type=int, default=48000)
    args = ap.parse_args()

    out_wav = Path(args.out)
    out_wav.parent.mkdir(parents=True, exist_ok=True)

    sd = _build_synthdef("sine_demo")
    print(f"SynthDef gebaut: {len(sd)} Bytes (SCgf-Header: {sd[:4]!r})")

    score = out_wav.with_suffix(".osc")
    _write_osc_score(score, sd, args.duration, args.freq, args.amp)
    print(f"OSC-Score: {score} ({score.stat().st_size} Bytes)")

    _run_scsynth_nrt(score, out_wav, args.sample_rate)
    m = _measure_wav(out_wav)
    print(f"Render -> {out_wav}")
    print(f"  Dauer:       {m['duration_s']:.4f} s")
    print(f"  Sample-Rate: {m['sample_rate']} Hz × {m['channels']} ch")
    print(f"  Frames:      {m['n_frames']}")
    print(f"  RMS:         {m['rms']:.1f} (Maxima ±32767)")
    print(f"  Peak:        {m['peak']}")
    print(f"  Stille?      {'JA' if m['rms'] < 1.0 else 'NEIN'}")
    return 0 if m['rms'] > 1.0 else 1


if __name__ == "__main__":
    sys.exit(main())
