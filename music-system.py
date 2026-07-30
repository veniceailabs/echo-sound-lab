#!/usr/bin/env python3
"""
Echo Local AI Music Engine (Hybrid Procedural)

Inputs:
  --voice         Path to user vocal input
  --input_audio   Path to an existing rendered song to extend
  --start_time    Extension anchor in seconds (defaults to end of input audio)
  --style         Genre style (Trap, Synthwave, Rock, Ambient)
  --tempo         Target BPM (default 120)
  --lyrics        Lyrics text with tags like [Verse] [Chorus]
  --voice_id      Local TTS voice identifier/persona
  --instrumental  Boolean flag to mute generated vocals
  --output        Output song path (wav)
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid


def emit(payload):
    print(json.dumps(payload), flush=True)


def check_deps():
    missing = []
    for name in ('numpy', 'librosa', 'soundfile', 'pyttsx3', 'scipy'):
        try:
            __import__(name)
        except Exception:
            missing.append(name)
    return missing


def normalize(x, peak=0.98):
    import numpy as np

    m = float(np.max(np.abs(x))) if x.size else 0.0
    if m < 1e-9:
        return x
    return (x / m) * peak


def to_stereo(x):
    import numpy as np

    if x.ndim == 2:
        return x
    return np.stack([x, x], axis=1)


def oversampled_saturation(signal, drive=1.2, mix=1.0, oversample=4):
    import numpy as np
    from scipy.signal import resample_poly

    if signal.size == 0:
        return signal
    os_factor = int(max(1, oversample))
    if os_factor == 1:
        wet = np.tanh(signal * drive)
        return (signal * (1.0 - mix)) + (wet * mix)

    up = resample_poly(signal, os_factor, 1)
    wet_up = np.tanh(up * drive)
    wet = resample_poly(wet_up, 1, os_factor)
    wet = wet[:signal.shape[0]]
    return (signal * (1.0 - mix)) + (wet * mix)


def estimate_subsample_offset(reference_tail, candidate_head, search=128):
    import numpy as np

    if reference_tail.size < 32 or candidate_head.size < 32:
        return 0.0

    ref = reference_tail - np.mean(reference_tail)
    cand = candidate_head - np.mean(candidate_head)
    lags = np.arange(-int(search), int(search) + 1)
    corr = np.zeros(lags.size, dtype=np.float64)
    for i, lag in enumerate(lags):
        if lag >= 0:
            a = ref[lag:]
            b = cand[:a.shape[0]]
        else:
            b = cand[-lag:]
            a = ref[:b.shape[0]]
        if a.size > 8 and b.size == a.size:
            corr[i] = float(np.dot(a, b))
    best = int(np.argmax(corr))
    lag = float(lags[best])

    # Sub-sample refinement via parabolic interpolation.
    if 0 < best < (corr.size - 1):
        y0, y1, y2 = corr[best - 1], corr[best], corr[best + 1]
        denom = (y0 - 2.0 * y1 + y2)
        if abs(denom) > 1e-12:
            lag += 0.5 * (y0 - y2) / denom
    return lag


def apply_fractional_shift(signal, shift_samples):
    import numpy as np

    if signal.size == 0 or abs(shift_samples) < 1e-6:
        return signal
    idx = np.arange(signal.shape[0], dtype=np.float64) - float(shift_samples)
    return np.interp(
        idx,
        np.arange(signal.shape[0], dtype=np.float64),
        signal.astype(np.float64),
        left=0.0,
        right=0.0
    )


def enforce_true_peak_ceiling(signal, ceiling_db=-0.1, oversample=4):
    import numpy as np
    from scipy.signal import resample_poly

    if signal.size == 0:
        return signal

    ceiling_lin = 10.0 ** (float(ceiling_db) / 20.0)
    os_factor = int(max(1, oversample))

    if signal.ndim == 1:
        up = resample_poly(signal, os_factor, 1) if os_factor > 1 else signal
        peak = float(np.max(np.abs(up))) if up.size else 0.0
        if peak <= ceiling_lin + 1e-12:
            return signal
        gain = ceiling_lin / max(peak, 1e-12)
        return signal * gain

    peak = 0.0
    for ch in range(signal.shape[1]):
        src = signal[:, ch]
        up = resample_poly(src, os_factor, 1) if os_factor > 1 else src
        peak = max(peak, float(np.max(np.abs(up))) if up.size else 0.0)
    if peak <= ceiling_lin + 1e-12:
        return signal
    gain = ceiling_lin / max(peak, 1e-12)
    return signal * gain


def midi_to_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def estimate_key(y, sr):
    import numpy as np
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    energy = np.mean(chroma, axis=1)
    key_index = int(np.argmax(energy))
    keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return keys[key_index], key_index


def estimate_tempo(y, sr, fallback=120.0):
    import numpy as np
    import librosa

    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if tempo.size else float(fallback)
        else:
            tempo = float(tempo)
        if tempo <= 0 or not (60.0 <= tempo <= 220.0):
            return float(fallback)
        return tempo
    except Exception:
        return float(fallback)


def crossfade_concat(left, right, fade_samples):
    import numpy as np

    if left.size == 0:
        return right
    if right.size == 0:
        return left

    fade = int(max(0, fade_samples))
    fade = min(fade, left.shape[0], right.shape[0])
    if fade <= 0:
        return np.concatenate([left, right], axis=0)

    curve = np.linspace(0.0, 1.0, fade, dtype=np.float64)
    if left.ndim == 2:
        curve = curve[:, None]
    stitched = (left[-fade:] * (1.0 - curve)) + (right[:fade] * curve)
    return np.concatenate([left[:-fade], stitched, right[fade:]], axis=0)


def smart_comp_takes(take_paths, sr=44100, segment_ms=420):
    import numpy as np
    import librosa

    valid = []
    for p in (take_paths or []):
        try:
            if p and os.path.exists(p):
                y, _ = librosa.load(p, sr=sr, mono=True)
                if y.size > 0:
                    valid.append(y.astype(np.float64))
        except Exception:
            continue

    if not valid:
        return np.zeros(1, dtype=np.float64), {"segments": 0, "takes": 0}
    if len(valid) == 1:
        return valid[0], {"segments": 1, "takes": 1}

    max_len = max(v.shape[0] for v in valid)
    aligned = []
    for v in valid:
        if v.shape[0] < max_len:
            pad = np.zeros(max_len - v.shape[0], dtype=np.float64)
            aligned.append(np.concatenate([v, pad]))
        else:
            aligned.append(v[:max_len])

    seg_len = max(int((float(segment_ms) / 1000.0) * sr), 512)
    fade_len = max(int(0.02 * sr), 64)
    out = np.zeros(max_len, dtype=np.float64)
    prev_take = None
    segments = 0

    for start in range(0, max_len, seg_len):
        end = min(max_len, start + seg_len)
        best_idx = 0
        best_score = -1e12
        for idx, t in enumerate(aligned):
            chunk = t[start:end]
            if chunk.size == 0:
                continue
            rms = float(np.sqrt(np.mean(chunk * chunk) + 1e-9))
            trans = float(np.mean(np.abs(np.diff(chunk)))) if chunk.size > 1 else 0.0
            score = (rms * 0.75) + (trans * 0.25)
            if score > best_score:
                best_score = score
                best_idx = idx
        current = aligned[best_idx][start:end].astype(np.float64, copy=False)
        if prev_take is not None and best_idx != prev_take and start > 0:
            tail_len = min(seg_len, start)
            head_len = min(seg_len, current.shape[0])
            reference_tail = out[start - tail_len:start]
            candidate_head = current[:head_len]
            shift = estimate_subsample_offset(reference_tail, candidate_head, search=min(256, tail_len // 2))
            current = apply_fractional_shift(current, shift)
            f = min(fade_len, end - start, start)
            if f > 0:
                curve = np.linspace(0.0, 1.0, f, dtype=np.float64)
                out[start - f:start] = (out[start - f:start] * (1.0 - curve)) + (current[:f] * curve)
                out[start:end] = current
            else:
                out[start:end] = current
        else:
            out[start:end] = current
        prev_take = best_idx
        segments += 1

    return normalize(out.astype(np.float64, copy=False), peak=0.95), {"segments": segments, "takes": len(valid)}


def _nearest_scale_midi(midi_value, key_index, scale):
    import numpy as np

    scale_map = {
        'major': [0, 2, 4, 5, 7, 9, 11],
        'minor': [0, 2, 3, 5, 7, 8, 10],
        'chromatic': list(range(12)),
    }
    degrees = scale_map.get((scale or 'chromatic').lower(), scale_map['chromatic'])
    octave = int(np.floor(midi_value / 12.0))
    candidates = []
    for o in range(octave - 1, octave + 2):
        for d in degrees:
            candidates.append(o * 12 + key_index + d)
    return min(candidates, key=lambda v: abs(v - midi_value))


def apply_honest_tuner(signal, sr, key='C', scale='chromatic', strength=18):
    import numpy as np
    import librosa

    if signal.size < 2048:
        return signal

    key_to_index = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    key_index = key_to_index.get((key or 'C').upper(), 0)

    seg_len = int(0.35 * sr)
    tuned = np.copy(signal).astype(np.float64)
    amount = float(max(0.0, min(100.0, strength))) / 100.0
    if amount <= 0.0:
        return tuned

    for start in range(0, signal.size, seg_len):
        end = min(signal.size, start + seg_len)
        seg = signal[start:end]
        if seg.size < 512:
            continue
        try:
            f0 = librosa.yin(seg, fmin=70, fmax=700, sr=sr)
            median_f0 = float(np.nanmedian(f0)) if f0.size else 0.0
            if not np.isfinite(median_f0) or median_f0 <= 0.0:
                continue
            midi = 69 + 12 * np.log2(median_f0 / 440.0)
            target_midi = _nearest_scale_midi(midi, key_index, scale)
            shift_steps = float(target_midi - midi)
            if abs(shift_steps) < 0.07:
                continue
            shifted = librosa.effects.pitch_shift(seg, sr=sr, n_steps=shift_steps)
            if shifted.shape[0] != seg.shape[0]:
                shifted = librosa.util.fix_length(shifted, size=seg.shape[0])
            tuned[start:end] = ((1.0 - amount) * seg) + (amount * shifted.astype(np.float64))
        except Exception:
            continue

    return normalize(tuned, peak=0.95)


def apply_vocal_texture(vocal, sr, texture='none'):
    import numpy as np
    from scipy.signal import butter, lfilter

    mode = (texture or 'none').lower()
    if mode in {'none', 'off', 'neutral'}:
        return vocal

    out = np.copy(vocal).astype(np.float64)

    if mode == 'gospel_choir':
        out = simple_reverb(out, sr, wet=0.24)
        delay = int(0.018 * sr)
        if delay < out.shape[0]:
            doubled = np.zeros_like(out)
            doubled[delay:] = out[:-delay]
            out = (out * 0.82) + (doubled * 0.55)
    elif mode == 'rn_b_silk':
        out = compressor(out, threshold_db=-22.0, ratio=2.3, makeup_db=2.0)
        out = simple_reverb(out, sr, wet=0.14)
        nyq = sr * 0.5
        b, a = butter(1, min(0.95, 6500.0 / nyq), btype='low')
        out = lfilter(b, a, out).astype(np.float64)
    elif mode == 'gritty_soul':
        out = oversampled_saturation(out, drive=1.35, mix=1.0, oversample=4) * 0.88
        out = compressor(out, threshold_db=-20.0, ratio=2.9, makeup_db=1.5)
        nyq = sr * 0.5
        lo = max(60.0 / nyq, 0.0005)
        hi = min(3900.0 / nyq, 0.98)
        if lo < hi:
            b, a = butter(2, [lo, hi], btype='band')
            out = lfilter(b, a, out).astype(np.float64)

    return normalize(out, peak=0.93)


def inject_forensic_metadata(path, title, artist, copyright_text, signature, engine_ver):
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        emit({'status': 'progress', 'percent': 96, 'message': f'ffmpeg not found; skipping metadata for {os.path.basename(path)}'})
        return

    temp_out = f"{path}.meta_tmp{os.path.splitext(path)[1]}"
    forensic_comment = f"ESL-Signature:{signature}"
    cmd = [
        ffmpeg_bin,
        '-y',
        '-i', path,
        '-map_metadata', '-1',
        '-metadata', f'title={title}',
        '-metadata', f'artist={artist}',
        '-metadata', f'copyright={copyright_text}',
        '-metadata', f'X-Echo-Signature={signature}',
        '-metadata', f'X-Echo-Engine-Ver={engine_ver}',
        '-metadata', f'comment={forensic_comment}',
        '-c', 'copy',
        temp_out,
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.replace(temp_out, path)
    except Exception:
        try:
            if os.path.exists(temp_out):
                os.unlink(temp_out)
        except Exception:
            pass


def parse_lyrics_sections(lyrics):
    text = (lyrics or '').strip()
    if not text:
        return [
            {'tag': 'Intro', 'text': 'Echoes rise in the room'},
            {'tag': 'Verse', 'text': 'Echo rises through the night'},
            {'tag': 'Chorus', 'text': 'We go higher and the city sings'},
            {'tag': 'Outro', 'text': 'Hold the light and let it fade'},
        ]

    pattern = re.compile(r'\[(intro|verse|chorus|bridge|outro)\]', re.IGNORECASE)
    parts = pattern.split(text)

    sections = []
    current_tag = 'Verse'
    for idx, part in enumerate(parts):
        if idx % 2 == 1:
            current_tag = part.capitalize()
            continue
        body = part.strip()
        if body:
            sections.append({'tag': current_tag, 'text': body})

    if not sections:
        sections = [{'tag': 'Verse', 'text': text}]

    return sections


def count_syllables(word):
    w = re.sub(r'[^a-z]', '', word.lower())
    if not w:
        return 0
    vowels = re.findall(r'[aeiouy]+', w)
    count = len(vowels)
    if w.endswith('e') and count > 1:
        count -= 1
    return max(1, count)


def section_syllables(text):
    words = re.findall(r"[A-Za-z']+", text)
    return max(1, sum(count_syllables(w) for w in words))


def build_structure(sections, tempo):
    structure = []
    beat_sec = 60.0 / tempo
    for sec in sections:
        tag = sec['tag'].lower()
        syl = section_syllables(sec['text'])
        bars = max(2, int(round(syl / 8)))
        duration = bars * 4 * beat_sec
        if tag == 'intro':
            bars = max(2, min(4, bars))
            duration = bars * 4 * beat_sec
        elif tag == 'outro':
            bars = max(2, min(6, bars))
            duration = bars * 4 * beat_sec

        is_chorus = tag == 'chorus'
        is_verse = tag == 'verse'
        is_intro = tag == 'intro'
        is_outro = tag == 'outro'
        structure.append({
            'tag': sec['tag'],
            'text': sec['text'],
            'syllables': syl,
            'duration': duration,
            'energy': (
                1.0 if is_chorus
                else 0.75 if tag == 'bridge'
                else 0.58 if is_verse
                else 0.45 if is_outro
                else 0.35 if is_intro
                else 0.55
            ),
            'wide_vocals': is_chorus,
            'sparse_drums': not is_chorus,
            'half_time': is_verse or is_intro,
            'lowpass_hz': 7600 if is_verse else (6200 if is_intro else None),
            'max_weight': is_chorus,
            'fade_out': is_outro,
        })
    return structure


def make_kick(sr, duration=0.18):
    import numpy as np

    n = int(sr * duration)
    t = np.arange(n) / sr
    freq = 120 * np.exp(-22 * t) + 36
    env = np.exp(-18 * t)
    return np.sin(2 * np.pi * freq * t) * env


def make_snare(sr, duration=0.12):
    import numpy as np

    n = int(sr * duration)
    t = np.arange(n) / sr
    noise = np.random.default_rng(123).uniform(-1, 1, n)
    env = np.exp(-25 * t)
    tone = 0.24 * np.sin(2 * np.pi * 220 * t) * np.exp(-20 * t)
    return noise * env * 0.65 + tone


def make_hat(sr, duration=0.05):
    import numpy as np

    n = int(sr * duration)
    t = np.arange(n) / sr
    noise = np.random.default_rng(456).uniform(-1, 1, n)
    env = np.exp(-70 * t)
    return noise * env * 0.3


def generate_drums_for_section(length, sr, tempo, style, sparse=False, energy=1.0, half_time=False):
    import numpy as np

    out = np.zeros(length, dtype=np.float64)
    beat_samples = int((60.0 / tempo) * sr)
    pattern_beat = beat_samples * 2 if half_time else beat_samples
    bar_samples = pattern_beat * 4

    kick = make_kick(sr)
    snare = make_snare(sr)
    hat = make_hat(sr)

    style_l = style.lower()

    for start in range(0, length, bar_samples):
        # Kick pattern
        kick_offsets = [0, pattern_beat * 2] if sparse else [0, int(pattern_beat * 1.5), pattern_beat * 2, int(pattern_beat * 3.25)]
        for offset in kick_offsets:
            idx = start + int(offset)
            if idx + len(kick) < length:
                out[idx:idx + len(kick)] += kick * (0.85 * energy if style_l == 'trap' else 0.65 * energy)

        # Snare backbeat
        snare_offsets = [pattern_beat * 2] if sparse else [pattern_beat, pattern_beat * 3]
        for offset in snare_offsets:
            idx = start + int(offset)
            if idx + len(snare) < length:
                out[idx:idx + len(snare)] += snare * (0.5 * energy)

    # Hats
    hat_step = pattern_beat if sparse else max(1, pattern_beat // (2 if style_l in {'trap', 'synthwave'} else 1))
    for idx in range(0, length, hat_step):
        if idx + len(hat) < length:
            out[idx:idx + len(hat)] += hat * (0.5 * energy)

    return out


def generate_bass_and_pads_for_section(length, sr, tempo, key_index, style, energy=1.0, max_weight=False):
    import numpy as np

    beat_samples = int((60.0 / tempo) * sr)
    root = 36 + key_index
    chord_template = [0, 3, 7] if style.lower() in {'trap', 'ambient'} else [0, 4, 7]

    bass = np.zeros(length, dtype=np.float64)
    pads = np.zeros(length, dtype=np.float64)

    progression = [0, 5, 3, 7]

    for step, start in enumerate(range(0, length, beat_samples * 4)):
        degree = progression[step % len(progression)]
        root_note = root + degree

        for b in range(4):
            st = start + b * beat_samples
            en = min(length, st + beat_samples)
            if en <= st:
                continue
            tt = np.arange(en - st) / sr
            f = midi_to_hz(root_note + (12 if b == 3 and style.lower() == 'trap' else 0))
            env = np.exp(-4.2 * tt)
            bass[st:en] += (0.28 * energy) * np.sin(2 * np.pi * f * tt) * env

        en_bar = min(length, start + beat_samples * 4)
        tt_bar = np.arange(en_bar - start) / sr
        pad = np.zeros_like(tt_bar)
        for interval in chord_template:
            pad += np.sin(2 * np.pi * midi_to_hz(root_note + 24 + interval) * tt_bar)
        pad /= max(1, len(chord_template))
        env = np.minimum(1.0, tt_bar / 0.35) * np.exp(-0.45 * tt_bar)
        pads[start:en_bar] += (0.13 * energy) * pad * env

    if style.lower() == 'ambient':
        pads *= 1.6
        bass *= 0.7
    if style.lower() == 'synthwave':
        pads *= 1.3

    if max_weight:
        # Chorus "Legendary Weight": oversampled nonlinear density to reduce aliasing.
        bass = oversampled_saturation(bass, drive=1.35, mix=1.0, oversample=4) * 0.9
        pads = oversampled_saturation(pads, drive=1.2, mix=1.0, oversample=4) * 0.88

    return bass, pads


def apply_lowpass(signal, sr, cutoff_hz):
    from scipy.signal import butter, lfilter

    if cutoff_hz is None:
        return signal
    nyquist = sr * 0.5
    safe_cutoff = max(80.0, min(float(cutoff_hz), nyquist - 120.0))
    b, a = butter(2, safe_cutoff / nyquist, btype='low')
    return lfilter(b, a, signal).astype(signal.dtype, copy=False)


def compressor(x, threshold_db=-20.0, ratio=3.0, makeup_db=2.5):
    import numpy as np

    x = x.astype(np.float64, copy=True)
    eps = 1e-8
    db = 20 * np.log10(np.abs(x) + eps)
    over = np.maximum(0.0, db - threshold_db)
    gain_reduction = over - (over / ratio)
    gain = 10 ** (-(gain_reduction - makeup_db) / 20.0)
    return x * gain


def simple_reverb(x, sr, wet=0.14):
    import numpy as np

    taps = [(0.024, 0.28), (0.041, 0.2), (0.067, 0.15), (0.093, 0.1)]
    wet_sig = np.zeros_like(x)
    for d_sec, g in taps:
        d = int(d_sec * sr)
        if 0 < d < x.shape[0]:
            wet_sig[d:] += x[:-d] * g
    return x * (1.0 - wet) + wet_sig * wet


def pick_tts_voice(engine, requested_voice_id):
    voices = engine.getProperty('voices')
    if not voices:
        return None

    if requested_voice_id:
        req = requested_voice_id.lower()
        for v in voices:
            if req in (v.id or '').lower() or req in (getattr(v, 'name', '') or '').lower():
                return v.id

    # default deterministic pick
    return voices[0].id


def render_tts_to_wav(lyrics, voice_id, out_path):
    import pyttsx3

    engine = pyttsx3.init()
    chosen = pick_tts_voice(engine, voice_id)
    if chosen:
        engine.setProperty('voice', chosen)
    engine.setProperty('rate', 152)
    engine.setProperty('volume', 1.0)

    plain = re.sub(r'\[(intro|verse|chorus|bridge|outro)\]', ' ', lyrics or '', flags=re.IGNORECASE)
    plain = re.sub(r'\s+', ' ', plain).strip() or 'Echo Sound Lab local engine'

    engine.save_to_file(plain, out_path)
    engine.runAndWait()


def create_robot_vocal(tts_audio, sr, key_index, structure, total_length):
    import numpy as np
    import librosa
    from scipy.signal import butter, lfilter

    # Pitch toward key root vicinity
    target_midi = 60 + key_index
    detected_f0 = librosa.yin(tts_audio, fmin=60, fmax=600, sr=sr)
    median_f0 = float(np.nanmedian(detected_f0)) if detected_f0.size else 220.0
    if not np.isfinite(median_f0) or median_f0 <= 0:
        median_f0 = 220.0
    current_midi = 69 + 12 * np.log2(median_f0 / 440.0)
    shift = target_midi - current_midi
    shifted = librosa.effects.pitch_shift(tts_audio, sr=sr, n_steps=shift)

    # Fit to target length
    vocal = np.zeros(total_length, dtype=np.float64)
    copy_len = min(total_length, shifted.shape[0])
    vocal[:copy_len] = shifted[:copy_len]

    # Envelope from TTS amplitude
    env = np.abs(vocal)
    if env.size:
        win = max(128, int(sr * 0.01))
        kernel = np.ones(win, dtype=np.float64) / win
        env = np.convolve(env, kernel, mode='same')
        env = env / (np.max(env) + 1e-8)

    # Melody rhythm: 1 syllable = 1 note
    melody = np.zeros(total_length, dtype=np.float64)
    pos = 0
    scale = [0, 2, 3, 5, 7, 10]
    for sec_idx, sec in enumerate(structure):
        sec_len = int(sec['duration'] * sr)
        if sec_len <= 0:
            continue
        syl = max(1, sec['syllables'])
        note_len = max(1, sec_len // syl)
        for n in range(syl):
            st = pos + n * note_len
            en = min(pos + (n + 1) * note_len, pos + sec_len, total_length)
            if en <= st:
                continue
            tt = np.arange(en - st) / sr
            midi = 60 + (sec_idx % 2) * 2 + scale[(n + sec_idx) % len(scale)]
            hz = midi_to_hz(midi)
            note = np.sin(2 * np.pi * hz * tt)
            gate = np.exp(-3.8 * tt)
            melody[st:en] += note * gate * (0.25 if sec['tag'].lower() == 'chorus' else 0.18)
        pos += sec_len

    # simple vocoder-ish modulation
    robot = melody * (0.35 + 0.65 * env)
    blended = 0.55 * vocal + 0.75 * robot

    # band-pass for synthetic vocal tone
    b, a = butter(2, [250 / (sr * 0.5), 3200 / (sr * 0.5)], btype='band')
    voiced = lfilter(b, a, blended).astype(np.float64)
    return normalize(voiced, peak=0.9)


def apply_section_vocal_spatial(vocal_mono, sr, structure):
    import numpy as np

    left = np.copy(vocal_mono)
    right = np.copy(vocal_mono)

    pos = 0
    for sec in structure:
        sec_len = int(sec['duration'] * sr)
        st = pos
        en = min(len(vocal_mono), pos + sec_len)
        if en <= st:
            pos += sec_len
            continue

        if sec['wide_vocals']:
            # chorus: widened doubling
            delay = int(0.012 * sr)
            right_seg = right[st:en]
            if delay < right_seg.shape[0]:
                right[st + delay:en] += right_seg[:-delay] * 0.45
            left[st:en] *= 0.95
            right[st:en] *= 1.05
        else:
            # verse: dry center-ish
            left[st:en] *= 0.92
            right[st:en] *= 0.92

        pos += sec_len

    out = np.stack([left, right], axis=1)
    return normalize(out, peak=0.92)


def main():
    missing = check_deps()
    if missing:
        emit({'status': 'error', 'message': 'Missing dependencies', 'details': missing})
        return 1

    import numpy as np
    import librosa
    import soundfile as sf

    parser = argparse.ArgumentParser(description='Echo local hybrid music engine')
    parser.add_argument('--voice', help='Path to vocal input')
    parser.add_argument('--input_audio', default='', help='Path to existing song for extension')
    parser.add_argument('--start_time', type=float, default=-1.0, help='Time anchor (sec) to start extension from')
    parser.add_argument('--style', required=True, help='Style: Trap/Synthwave/Rock/Ambient')
    parser.add_argument('--tempo', type=float, default=120.0, help='Target BPM')
    parser.add_argument('--lyrics', default='', help='Lyrics text with [Verse]/[Chorus] tags')
    parser.add_argument('--voice_id', default='', help='Local TTS voice id/persona')
    parser.add_argument('--instrumental', action='store_true', help='Mute generated vocals')
    parser.add_argument('--vocal_texture', default='none', help='none|gospel_choir|rn_b_silk|gritty_soul')
    parser.add_argument('--enable_honest_tuner', action='store_true', help='Enable gentle key/scale aware vocal correction')
    parser.add_argument('--tuner_key', default='C', help='Pitch correction key (C..B)')
    parser.add_argument('--tuner_scale', default='chromatic', help='major|minor|chromatic')
    parser.add_argument('--tuner_strength', type=float, default=18.0, help='0-100 correction blend amount')
    parser.add_argument('--enable_smart_comping', action='store_true', help='Build a comp from uploaded vocal takes')
    parser.add_argument('--comping_segment_ms', type=float, default=420.0, help='Segment length for comping decisions')
    parser.add_argument('--take', action='append', default=[], help='Additional vocal take path (repeatable)')
    parser.add_argument('--license_tier', default='Standard', help='License tier for forensic metadata')
    parser.add_argument('--username', default='Echo Sound Lab User', help='Creator name for metadata')
    parser.add_argument('--output', required=True, help='Output song path')
    args = parser.parse_args()

    if not args.voice and not args.input_audio:
        emit({'status': 'error', 'message': 'Provide --voice or --input_audio'})
        return 1
    if args.voice and not os.path.exists(args.voice):
        emit({'status': 'error', 'message': f'Voice file not found: {args.voice}'})
        return 1
    for take_path in args.take or []:
        if take_path and not os.path.exists(take_path):
            emit({'status': 'error', 'message': f'Comp take file not found: {take_path}'})
            return 1
    if args.input_audio and not os.path.exists(args.input_audio):
        emit({'status': 'error', 'message': f'Input audio not found: {args.input_audio}'})
        return 1

    out_dir = os.path.dirname(args.output) or '.'
    os.makedirs(out_dir, exist_ok=True)

    emit({'status': 'progress', 'percent': 6, 'message': 'Loading input audio...'})
    user_voice = np.zeros(1, dtype=np.float64)
    comping_info = {"segments": 0, "takes": 0}
    sr = 44100
    if args.enable_smart_comping and (args.take or args.voice):
        emit({'status': 'progress', 'percent': 10, 'message': 'Smart Comping: selecting best phrases across takes...'})
        take_list = list(args.take or [])
        if args.voice:
            take_list = [args.voice] + take_list
        user_voice, comping_info = smart_comp_takes(take_list, sr=44100, segment_ms=float(args.comping_segment_ms))
        if user_voice.size == 0:
            emit({'status': 'error', 'message': 'Smart comping failed: no valid takes'})
            return 1
    elif args.voice:
        user_voice, sr = librosa.load(args.voice, sr=44100, mono=True)
        user_voice = user_voice.astype(np.float64, copy=False)
        if user_voice.size == 0:
            emit({'status': 'error', 'message': 'Voice input is empty'})
            return 1

    base_audio = None
    if args.input_audio:
        base_audio, sr = librosa.load(args.input_audio, sr=44100, mono=True)
        base_audio = base_audio.astype(np.float64, copy=False)
        if base_audio.size == 0:
            emit({'status': 'error', 'message': 'Input audio is empty'})
            return 1

    analysis_signal = base_audio if base_audio is not None else user_voice
    emit({'status': 'progress', 'percent': 14, 'message': 'Detecting key and tempo...'})
    key_name, key_index = estimate_key(analysis_signal, sr)
    detected_tempo = estimate_tempo(analysis_signal, sr, fallback=float(args.tempo))
    target_tempo = detected_tempo if base_audio is not None else float(args.tempo)

    sections = parse_lyrics_sections(args.lyrics)
    structure = build_structure(sections, target_tempo)
    total_duration = max(12.0, sum(sec['duration'] for sec in structure))
    extension_length = int(total_duration * sr)

    extension_anchor = 0
    seed_tail = np.zeros(0, dtype=np.float64)
    base_keep = np.zeros(0, dtype=np.float64)
    if base_audio is not None:
        anchor_sec = args.start_time if args.start_time >= 0 else (len(base_audio) / sr)
        extension_anchor = int(max(0, min(anchor_sec * sr, len(base_audio))))
        base_keep = base_audio[:extension_anchor]
        seed_start = max(0, extension_anchor - int(5.0 * sr))
        seed_tail = base_audio[seed_start:extension_anchor]

    total_length = extension_length

    emit({'status': 'progress', 'percent': 24, 'message': f'Building dynamic structure with {len(structure)} sections...'})
    instrumental = np.zeros(total_length, dtype=np.float64)

    pos = 0
    for sec in structure:
        sec_len = int(sec['duration'] * sr)
        end = min(total_length, pos + sec_len)
        if end <= pos:
            continue

        section_len = end - pos
        drums = generate_drums_for_section(
            section_len,
            sr,
            target_tempo,
            args.style,
            sparse=sec['sparse_drums'],
            energy=sec['energy'],
            half_time=sec.get('half_time', False),
        )
        bass, pads = generate_bass_and_pads_for_section(
            section_len,
            sr,
            target_tempo,
            key_index,
            args.style,
            energy=sec['energy'],
            max_weight=sec.get('max_weight', False),
        )

        section_mix = drums + bass + pads
        section_mix = apply_lowpass(section_mix, sr, sec.get('lowpass_hz'))
        if sec.get('fade_out'):
            section_mix *= np.linspace(1.0, 0.0, section_len, dtype=np.float64)

        instrumental[pos:end] += section_mix
        pos = end

    if seed_tail.size:
        seed_copy = min(seed_tail.size, instrumental.size)
        instrumental[:seed_copy] = (instrumental[:seed_copy] * 0.82) + (seed_tail[:seed_copy] * 0.18)
    instrumental = normalize(instrumental, peak=0.9)

    # Process user voice for blend
    voice_aligned = np.zeros(total_length, dtype=np.float64)
    voice_copy_len = min(total_length, user_voice.shape[0]) if user_voice.size else 0
    if voice_copy_len:
        voice_aligned[:voice_copy_len] = user_voice[:voice_copy_len]
    user_vocal_chain = compressor(voice_aligned, threshold_db=-19.5, ratio=3.1, makeup_db=2.5)
    if args.enable_honest_tuner and not args.instrumental:
        emit({'status': 'progress', 'percent': 40, 'message': f'Honest Tuner: gentle {args.tuner_scale} correction in {args.tuner_key}...'})
        user_vocal_chain = apply_honest_tuner(
            user_vocal_chain,
            sr=sr,
            key=args.tuner_key,
            scale=args.tuner_scale,
            strength=args.tuner_strength,
        )
    user_vocal_chain = simple_reverb(user_vocal_chain, sr, wet=0.12)

    tts_vocal = np.zeros(total_length, dtype=np.float64)

    if not args.instrumental:
        emit({'status': 'progress', 'percent': 46, 'message': 'Rendering local TTS vocal persona...'})
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tts_tmp:
            tts_path = tts_tmp.name
        try:
            render_tts_to_wav(args.lyrics, args.voice_id, tts_path)
            tts_audio, _ = librosa.load(tts_path, sr=sr, mono=True)
            tts_audio = tts_audio.astype(np.float64, copy=False)
        finally:
            try:
                os.unlink(tts_path)
            except Exception:
                pass

        emit({'status': 'progress', 'percent': 58, 'message': 'Applying robotic pitch/vocode transform...'})
        tts_vocal = create_robot_vocal(tts_audio, sr, key_index, structure, total_length)

    emit({'status': 'progress', 'percent': 72, 'message': 'Applying section dynamics ([Verse]/[Chorus])...'})
    blended_vocal = normalize((0.7 * user_vocal_chain) + (0.8 * tts_vocal), peak=0.92) if not args.instrumental else np.zeros(total_length, dtype=np.float64)
    if not args.instrumental and args.vocal_texture and args.vocal_texture.lower() != 'none':
        emit({'status': 'progress', 'percent': 76, 'message': f'Applying vocal texture: {args.vocal_texture}...'})
        blended_vocal = apply_vocal_texture(blended_vocal, sr, texture=args.vocal_texture)
    vocal_stereo = apply_section_vocal_spatial(blended_vocal, sr, structure) if not args.instrumental else to_stereo(np.zeros(total_length, dtype=np.float64))

    emit({'status': 'progress', 'percent': 84, 'message': 'Final mixdown...'})
    inst_stereo = to_stereo(instrumental)
    extension_song = inst_stereo * 0.86 + vocal_stereo * (0.92 if not args.instrumental else 0.0)
    extension_song = normalize(extension_song, peak=0.98)

    if base_keep.size:
        base_keep_stereo = to_stereo(base_keep.astype(np.float64))
        base_vocals_stereo = to_stereo(np.zeros_like(base_keep, dtype=np.float64))
        base_inst_stereo = base_keep_stereo
        crossfade_samples = int(0.05 * sr)  # 50ms click-safe stitch

        song_stereo = crossfade_concat(base_keep_stereo, extension_song, crossfade_samples)
        vocal_stereo = crossfade_concat(base_vocals_stereo, vocal_stereo, crossfade_samples)
        inst_stereo = crossfade_concat(base_inst_stereo, inst_stereo, crossfade_samples)
        song_stereo = normalize(song_stereo, peak=0.98)
    else:
        song_stereo = extension_song

    emit({'status': 'progress', 'percent': 90, 'message': 'Applying HD true-peak ceiling (-0.1 dBTP)...'})
    song_stereo = enforce_true_peak_ceiling(song_stereo, ceiling_db=-0.1, oversample=4)
    vocal_stereo = enforce_true_peak_ceiling(vocal_stereo, ceiling_db=-0.1, oversample=4)
    inst_stereo = enforce_true_peak_ceiling(inst_stereo, ceiling_db=-0.1, oversample=4)

    base, ext = os.path.splitext(args.output)
    if not ext:
        args.output = f'{args.output}.wav'
        base, _ = os.path.splitext(args.output)

    vocals_path = f'{base}_vocals.wav'
    instrumental_path = f'{base}_instrumental.wav'

    emit({'status': 'progress', 'percent': 94, 'message': 'Writing local stems and master...'})
    sf.write(vocals_path, vocal_stereo, sr, subtype='PCM_16')
    sf.write(instrumental_path, inst_stereo, sr, subtype='PCM_16')
    sf.write(args.output, song_stereo, sr, subtype='PCM_16')

    creator = 'Echo Sound Lab User'
    signature_seed = f"{args.output}|{args.style}|{target_tempo}|{extension_anchor}|{time.time_ns()}|{uuid.uuid4()}"
    signature = hashlib.sha256(signature_seed.encode('utf-8')).hexdigest()[:16]
    copy_text = "Created with Echo Sound Lab (Defender Edition)"
    title_text = os.path.splitext(os.path.basename(args.output))[0]
    for out_path in (args.output, vocals_path, instrumental_path):
        inject_forensic_metadata(
            out_path,
            title=title_text,
            artist=creator,
            copyright_text=copy_text,
            signature=signature,
            engine_ver='v2.5-Local',
        )

    emit({
        'status': 'complete',
        'path': args.output,
        'vocals_path': vocals_path,
        'instrumental_path': instrumental_path,
        'key': key_name,
        'tempo': float(target_tempo),
        'style': args.style,
        'sections': [s['tag'] for s in structure],
        'extended': bool(base_audio is not None),
        'extension_anchor_sec': float(extension_anchor / sr) if base_audio is not None else 0.0,
        'smart_comping': bool(args.enable_smart_comping),
        'comping_takes': int(comping_info.get("takes", 0)),
        'honest_tuner': bool(args.enable_honest_tuner),
        'vocal_texture': args.vocal_texture,
    })
    return 0


if __name__ == '__main__':
    sys.exit(main())
