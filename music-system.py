#!/usr/bin/env python3
"""
Echo Local AI Music Engine (Hybrid Procedural)

Inputs:
  --voice         Path to user vocal input
  --style         Genre style (Trap, Synthwave, Rock, Ambient)
  --tempo         Target BPM (default 120)
  --lyrics        Lyrics text with tags like [Verse] [Chorus]
  --voice_id      Local TTS voice identifier/persona
  --instrumental  Boolean flag to mute generated vocals
  --output        Output song path (wav)
"""

import argparse
import json
import os
import re
import shutil
import sys
import tempfile


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

    out = np.zeros(length, dtype=np.float32)
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

    bass = np.zeros(length, dtype=np.float32)
    pads = np.zeros(length, dtype=np.float32)

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
        # Chorus "Legendary Weight": subtle harmonic density.
        bass = np.tanh(bass * 1.35) * 0.9
        pads = np.tanh(pads * 1.2) * 0.88

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

    x = x.astype(np.float32, copy=True)
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
    vocal = np.zeros(total_length, dtype=np.float32)
    copy_len = min(total_length, shifted.shape[0])
    vocal[:copy_len] = shifted[:copy_len]

    # Envelope from TTS amplitude
    env = np.abs(vocal)
    if env.size:
        win = max(128, int(sr * 0.01))
        kernel = np.ones(win, dtype=np.float32) / win
        env = np.convolve(env, kernel, mode='same')
        env = env / (np.max(env) + 1e-8)

    # Melody rhythm: 1 syllable = 1 note
    melody = np.zeros(total_length, dtype=np.float32)
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
    voiced = lfilter(b, a, blended).astype(np.float32)
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
    parser.add_argument('--voice', required=True, help='Path to vocal input')
    parser.add_argument('--style', required=True, help='Style: Trap/Synthwave/Rock/Ambient')
    parser.add_argument('--tempo', type=float, default=120.0, help='Target BPM')
    parser.add_argument('--lyrics', default='', help='Lyrics text with [Verse]/[Chorus] tags')
    parser.add_argument('--voice_id', default='', help='Local TTS voice id/persona')
    parser.add_argument('--instrumental', action='store_true', help='Mute generated vocals')
    parser.add_argument('--output', required=True, help='Output song path')
    args = parser.parse_args()

    if not os.path.exists(args.voice):
        emit({'status': 'error', 'message': f'Voice file not found: {args.voice}'})
        return 1

    out_dir = os.path.dirname(args.output) or '.'
    os.makedirs(out_dir, exist_ok=True)

    emit({'status': 'progress', 'percent': 6, 'message': 'Loading vocal input...'})
    user_voice, sr = librosa.load(args.voice, sr=44100, mono=True)
    if user_voice.size == 0:
        emit({'status': 'error', 'message': 'Voice input is empty'})
        return 1

    emit({'status': 'progress', 'percent': 14, 'message': 'Detecting key center from vocal...'})
    key_name, key_index = estimate_key(user_voice, sr)

    sections = parse_lyrics_sections(args.lyrics)
    structure = build_structure(sections, float(args.tempo))
    total_duration = max(12.0, sum(sec['duration'] for sec in structure))
    total_length = int(total_duration * sr)

    emit({'status': 'progress', 'percent': 24, 'message': f'Building dynamic structure with {len(structure)} sections...'})
    instrumental = np.zeros(total_length, dtype=np.float32)

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
            float(args.tempo),
            args.style,
            sparse=sec['sparse_drums'],
            energy=sec['energy'],
            half_time=sec.get('half_time', False),
        )
        bass, pads = generate_bass_and_pads_for_section(
            section_len,
            sr,
            float(args.tempo),
            key_index,
            args.style,
            energy=sec['energy'],
            max_weight=sec.get('max_weight', False),
        )

        section_mix = drums + bass + pads
        section_mix = apply_lowpass(section_mix, sr, sec.get('lowpass_hz'))
        if sec.get('fade_out'):
            section_mix *= np.linspace(1.0, 0.0, section_len, dtype=np.float32)

        instrumental[pos:end] += section_mix
        pos = end

    instrumental = normalize(instrumental, peak=0.9)

    # Process user voice for blend
    voice_aligned = np.zeros(total_length, dtype=np.float32)
    voice_copy_len = min(total_length, user_voice.shape[0])
    voice_aligned[:voice_copy_len] = user_voice[:voice_copy_len]
    user_vocal_chain = compressor(voice_aligned, threshold_db=-19.5, ratio=3.1, makeup_db=2.5)
    user_vocal_chain = simple_reverb(user_vocal_chain, sr, wet=0.12)

    tts_vocal = np.zeros(total_length, dtype=np.float32)

    if not args.instrumental:
        emit({'status': 'progress', 'percent': 46, 'message': 'Rendering local TTS vocal persona...'})
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tts_tmp:
            tts_path = tts_tmp.name
        try:
            render_tts_to_wav(args.lyrics, args.voice_id, tts_path)
            tts_audio, _ = librosa.load(tts_path, sr=sr, mono=True)
        finally:
            try:
                os.unlink(tts_path)
            except Exception:
                pass

        emit({'status': 'progress', 'percent': 58, 'message': 'Applying robotic pitch/vocode transform...'})
        tts_vocal = create_robot_vocal(tts_audio, sr, key_index, structure, total_length)

    emit({'status': 'progress', 'percent': 72, 'message': 'Applying section dynamics ([Verse]/[Chorus])...'})
    blended_vocal = normalize((0.7 * user_vocal_chain) + (0.8 * tts_vocal), peak=0.92) if not args.instrumental else np.zeros(total_length, dtype=np.float32)
    vocal_stereo = apply_section_vocal_spatial(blended_vocal, sr, structure) if not args.instrumental else to_stereo(np.zeros(total_length, dtype=np.float32))

    emit({'status': 'progress', 'percent': 84, 'message': 'Final mixdown...'})
    inst_stereo = to_stereo(instrumental)
    song_stereo = inst_stereo * 0.86 + vocal_stereo * (0.92 if not args.instrumental else 0.0)
    song_stereo = normalize(song_stereo, peak=0.98)

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

    emit({
        'status': 'complete',
        'path': args.output,
        'vocals_path': vocals_path,
        'instrumental_path': instrumental_path,
        'key': key_name,
        'tempo': float(args.tempo),
        'style': args.style,
        'sections': [s['tag'] for s in structure],
    })
    return 0


if __name__ == '__main__':
    sys.exit(main())
