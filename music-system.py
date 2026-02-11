#!/usr/bin/env python3
"""
Local AI Music Engine (Deterministic)

Args:
  --voice   Path to user vocal (WAV/AIFF/etc)
  --style   Genre style (Trap, Synthwave, Rock, Ambient)
  --tempo   BPM (default 120)
  --output  Output song path (WAV)

Outputs JSON progress events to stdout.
"""

import argparse
import json
import os
import shutil
import sys


def emit(payload):
    print(json.dumps(payload), flush=True)


def check_deps():
    missing = []
    try:
        import numpy  # noqa: F401
    except Exception:
        missing.append('numpy')
    try:
        import librosa  # noqa: F401
    except Exception:
        missing.append('librosa')
    try:
        import soundfile  # noqa: F401
    except Exception:
        missing.append('soundfile')
    return missing


def estimate_key(y, sr):
    import numpy as np
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    energy = np.mean(chroma, axis=1)
    key_index = int(np.argmax(energy))
    keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return keys[key_index], key_index


def normalize(x, peak=0.98):
    import numpy as np

    m = float(np.max(np.abs(x))) if x.size else 0.0
    if m < 1e-9:
        return x
    return (x / m) * peak


def make_kick(sample_rate, duration=0.18):
    import numpy as np

    n = int(sample_rate * duration)
    t = np.arange(n) / sample_rate
    freq = 120 * np.exp(-22 * t) + 38
    env = np.exp(-18 * t)
    return np.sin(2 * np.pi * freq * t) * env


def make_snare(sample_rate, duration=0.12):
    import numpy as np

    n = int(sample_rate * duration)
    t = np.arange(n) / sample_rate
    noise = np.random.default_rng(7).uniform(-1, 1, n)
    env = np.exp(-26 * t)
    tone = 0.2 * np.sin(2 * np.pi * 220 * t) * np.exp(-20 * t)
    return (noise * env * 0.65) + tone


def make_hat(sample_rate, duration=0.05):
    import numpy as np

    n = int(sample_rate * duration)
    t = np.arange(n) / sample_rate
    noise = np.random.default_rng(11).uniform(-1, 1, n)
    env = np.exp(-65 * t)
    return noise * env * 0.3


def sequence_drums(length, sr, tempo, style):
    import numpy as np

    out = np.zeros(length, dtype=np.float32)
    beat_samples = int((60.0 / tempo) * sr)
    bar_samples = beat_samples * 4

    kick = make_kick(sr)
    snare = make_snare(sr)
    hat = make_hat(sr)

    style_l = style.lower()
    hat_every = beat_samples // (2 if style_l in {'trap', 'synthwave'} else 1)

    for start in range(0, length, bar_samples):
        # kicks
        for offset in [0, beat_samples * 2]:
            idx = start + offset
            if idx + len(kick) < length:
                out[idx:idx + len(kick)] += kick * (0.95 if style_l == 'trap' else 0.8)

        # snare on 2 and 4
        for offset in [beat_samples, beat_samples * 3]:
            idx = start + offset
            if idx + len(snare) < length:
                out[idx:idx + len(snare)] += snare * (0.7 if style_l == 'rock' else 0.55)

    for idx in range(0, length, max(1, hat_every)):
        if idx + len(hat) < length:
            out[idx:idx + len(hat)] += hat

    return out


def midi_to_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def sequence_bass_and_pads(length, sr, tempo, key_index, style):
    import numpy as np

    t = np.arange(length) / sr
    beat = 60.0 / tempo
    beat_samples = int(beat * sr)

    root = 36 + key_index  # bass octave
    chord_template = [0, 3, 7] if style.lower() in {'trap', 'ambient'} else [0, 4, 7]

    bass = np.zeros(length, dtype=np.float32)
    pads = np.zeros(length, dtype=np.float32)

    progression = [0, 5, 3, 7]

    for step, start in enumerate(range(0, length, beat_samples * 4)):
        degree = progression[step % len(progression)]
        root_note = root + degree

        # bass notes every beat
        for b in range(4):
            st = start + b * beat_samples
            en = min(length, st + beat_samples)
            if en <= st:
                continue
            tt = np.arange(en - st) / sr
            f = midi_to_hz(root_note + (12 if b == 3 and style.lower() == 'trap' else 0))
            env = np.exp(-4.5 * tt)
            bass[st:en] += 0.35 * np.sin(2 * np.pi * f * tt) * env

        # pad chord for whole bar
        en_bar = min(length, start + beat_samples * 4)
        tt_bar = np.arange(en_bar - start) / sr
        pad = np.zeros_like(tt_bar)
        for interval in chord_template:
            f = midi_to_hz(root_note + 24 + interval)
            pad += np.sin(2 * np.pi * f * tt_bar)
        pad /= max(1, len(chord_template))
        # simple slow attack/release envelope
        env = np.minimum(1.0, tt_bar / 0.35) * np.exp(-0.5 * tt_bar)
        pads[start:en_bar] += 0.18 * pad * env

    # style coloration
    if style.lower() == 'synthwave':
        pads *= 1.35
    if style.lower() == 'ambient':
        pads *= 1.6
        bass *= 0.7

    return bass, pads


def compressor(x, threshold_db=-18.0, ratio=3.0, makeup_db=3.0):
    import numpy as np

    x = x.astype(np.float32, copy=True)
    eps = 1e-8
    mag = np.abs(x) + eps
    db = 20 * np.log10(mag)
    over = np.maximum(0.0, db - threshold_db)
    gain_reduction_db = over - (over / ratio)
    gain = 10 ** (-(gain_reduction_db - makeup_db) / 20.0)
    return x * gain


def simple_reverb(x, sr, wet=0.18):
    import numpy as np

    taps = [
        (0.027, 0.28),
        (0.041, 0.22),
        (0.063, 0.17),
        (0.089, 0.12),
    ]
    wet_sig = np.zeros_like(x)
    for delay_sec, gain in taps:
        d = int(delay_sec * sr)
        if d <= 0 or d >= x.shape[0]:
            continue
        wet_sig[d:] += x[:-d] * gain
    return (x * (1.0 - wet)) + (wet_sig * wet)


def to_stereo(x):
    import numpy as np

    if x.ndim == 2:
        return x
    return np.stack([x, x], axis=1)


def main():
    missing = check_deps()
    if missing:
        emit({'status': 'error', 'message': 'Missing dependencies', 'details': missing})
        return 1

    import numpy as np
    import librosa
    import soundfile as sf

    parser = argparse.ArgumentParser(description='Local deterministic music engine')
    parser.add_argument('--voice', required=True, help='Path to user vocal input')
    parser.add_argument('--style', required=True, help='Style: Trap/Synthwave/Rock/Ambient')
    parser.add_argument('--tempo', type=float, default=120.0, help='Target BPM')
    parser.add_argument('--output', required=True, help='Output song path')
    args = parser.parse_args()

    if not os.path.exists(args.voice):
        emit({'status': 'error', 'message': f'Voice file not found: {args.voice}'})
        return 1

    out_dir = os.path.dirname(args.output) or '.'
    os.makedirs(out_dir, exist_ok=True)

    emit({'status': 'progress', 'percent': 6, 'message': 'Loading voice input...'})
    voice, sr = librosa.load(args.voice, sr=44100, mono=True)

    if voice.size == 0:
        emit({'status': 'error', 'message': 'Voice input is empty'})
        return 1

    emit({'status': 'progress', 'percent': 15, 'message': 'Detecting key from vocal...'} )
    key_name, key_index = estimate_key(voice, sr)

    # Build a target duration around vocal duration
    target_duration = max(16.0, min(60.0, float(len(voice) / sr) + 6.0))
    length = int(target_duration * sr)

    # Fit voice to target by zero-padding
    voice_aligned = np.zeros(length, dtype=np.float32)
    copy_len = min(length, len(voice))
    voice_aligned[:copy_len] = voice[:copy_len]

    emit({'status': 'progress', 'percent': 28, 'message': f'Generating {args.style} rhythm bed @ {args.tempo:.0f} BPM...'})
    drums = sequence_drums(length, sr, float(args.tempo), args.style)

    emit({'status': 'progress', 'percent': 42, 'message': f'Generating harmonic bed in key {key_name}...'})
    bass, pads = sequence_bass_and_pads(length, sr, float(args.tempo), key_index, args.style)
    instrumental = normalize(drums + bass + pads, peak=0.9)

    emit({'status': 'progress', 'percent': 58, 'message': 'Applying vocal chain (compressor + reverb)...'})
    vocal_proc = compressor(voice_aligned, threshold_db=-20.0, ratio=3.2, makeup_db=3.0)
    vocal_proc = simple_reverb(vocal_proc, sr, wet=0.16)
    vocal_proc = normalize(vocal_proc, peak=0.92)

    emit({'status': 'progress', 'percent': 75, 'message': 'Mixing voice with generated arrangement...'})
    song = normalize((instrumental * 0.82) + (vocal_proc * 0.95), peak=0.98)

    # Export stems + mix
    base, ext = os.path.splitext(args.output)
    if not ext:
        args.output = f'{args.output}.wav'
        base, ext = os.path.splitext(args.output)

    vocals_path = f'{base}_vocals.wav'
    instrumental_path = f'{base}_instrumental.wav'

    emit({'status': 'progress', 'percent': 88, 'message': 'Writing stems and final mix...'})
    sf.write(vocals_path, to_stereo(vocal_proc), sr, subtype='PCM_16')
    sf.write(instrumental_path, to_stereo(instrumental), sr, subtype='PCM_16')
    sf.write(args.output, to_stereo(song), sr, subtype='PCM_16')

    emit({
        'status': 'complete',
        'path': args.output,
        'vocals_path': vocals_path,
        'instrumental_path': instrumental_path,
        'key': key_name,
        'tempo': float(args.tempo),
        'style': args.style,
    })
    return 0


if __name__ == '__main__':
    sys.exit(main())
