"""
ESL ML Pipeline — Step 1: Feature Extraction
Extracts 50+ audio features from a directory of labeled mixes.

Usage:
    python feature_extractor.py --input /path/to/mixes --output features.csv

Expected directory structure:
    mixes/
        hip-hop/
            track001.wav
            track002.mp3
            ...
        pop/
        rnb/
        jazz/
        classical/
        trap/
"""

import os
import sys
import argparse
import numpy as np
import pandas as pd
import librosa
import pyloudnorm as pyln
import soundfile as sf
from pathlib import Path

GENRE_LABELS = ['hip-hop', 'pop', 'rnb', 'jazz', 'classical', 'trap', 'r-and-b', 'bedroom-pop']


def measure_lufs(y: np.ndarray, sr: int) -> dict:
    """Measure integrated, short-term, and momentary LUFS."""
    meter = pyln.Meter(sr)
    try:
        integrated = meter.integrated_loudness(y.T if y.ndim > 1 else y[:, None])
    except Exception:
        integrated = -99.0
    return {'lufs_integrated': float(integrated)}


def measure_spectral(y_mono: np.ndarray, sr: int) -> dict:
    """5-band spectral balance + centroid + rolloff."""
    S = np.abs(librosa.stft(y_mono))
    freqs = librosa.fft_frequencies(sr=sr)

    def band_energy(lo, hi):
        mask = (freqs >= lo) & (freqs < hi)
        return float(np.mean(S[mask]) if mask.any() else 0.0)

    total = band_energy(20, sr / 2) + 1e-10
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y_mono, sr=sr)))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y_mono, sr=sr, roll_percent=0.85)))
    bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=y_mono, sr=sr)))
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y_mono)))

    return {
        'spectral_sub': band_energy(20, 80) / total,
        'spectral_bass': band_energy(80, 250) / total,
        'spectral_low_mid': band_energy(250, 800) / total,
        'spectral_mid': band_energy(800, 3000) / total,
        'spectral_high_mid': band_energy(3000, 6000) / total,
        'spectral_high': band_energy(6000, sr / 2) / total,
        'spectral_centroid': centroid,
        'spectral_rolloff': rolloff,
        'spectral_bandwidth': bandwidth,
        'spectral_flatness': flatness,
    }


def measure_dynamics(y_mono: np.ndarray, sr: int) -> dict:
    """RMS, peak, crest factor, dynamic range."""
    rms = float(np.sqrt(np.mean(y_mono ** 2)))
    peak = float(np.max(np.abs(y_mono)))
    rms_db = 20 * np.log10(max(rms, 1e-10))
    peak_db = 20 * np.log10(max(peak, 1e-10))
    crest_factor = peak_db - rms_db

    # Transient count (zero-crossing rate bursts)
    zcr = librosa.feature.zero_crossing_rate(y_mono)[0]
    onset_env = librosa.onset.onset_strength(y=y_mono, sr=sr)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)

    return {
        'rms_db': rms_db,
        'peak_db': peak_db,
        'crest_factor': float(crest_factor),
        'transient_count': len(onsets),
        'transient_density': len(onsets) / (len(y_mono) / sr),
    }


def measure_stereo(y: np.ndarray) -> dict:
    """Stereo width, phase coherence, imbalance."""
    if y.ndim < 2 or y.shape[0] < 2:
        return {'stereo_width': 0.0, 'phase_coherence': 100.0, 'stereo_imbalance': 0.0}

    L, R = y[0], y[1]
    mid = (L + R) / 2
    side = (L - R) / 2

    mid_rms = np.sqrt(np.mean(mid ** 2)) + 1e-10
    side_rms = np.sqrt(np.mean(side ** 2)) + 1e-10
    width = float(side_rms / mid_rms * 100)

    # Phase coherence: correlation between L and R
    if np.std(L) > 0 and np.std(R) > 0:
        coherence = float(np.corrcoef(L, R)[0, 1] * 100)
    else:
        coherence = 100.0

    l_rms = 20 * np.log10(np.sqrt(np.mean(L ** 2)) + 1e-10)
    r_rms = 20 * np.log10(np.sqrt(np.mean(R ** 2)) + 1e-10)
    imbalance = float(abs(l_rms - r_rms))

    return {
        'stereo_width': max(0.0, min(width, 150.0)),
        'phase_coherence': max(0.0, min(coherence, 100.0)),
        'stereo_imbalance': imbalance,
    }


def extract_features(filepath: str, genre_label: str) -> dict | None:
    """Extract all features from a single audio file."""
    try:
        y, sr = librosa.load(filepath, sr=44100, mono=False, duration=180)
        if y.ndim == 1:
            y_mono = y
            y_stereo = np.stack([y, y])
        else:
            y_stereo = y
            y_mono = np.mean(y, axis=0)

        features = {'filename': os.path.basename(filepath), 'genre': genre_label}
        features.update(measure_lufs(y_stereo, sr))
        features.update(measure_spectral(y_mono, sr))
        features.update(measure_dynamics(y_mono, sr))
        features.update(measure_stereo(y_stereo))

        print(f"  ✓ {os.path.basename(filepath)} [{genre_label}] LUFS={features['lufs_integrated']:.1f}")
        return features

    except Exception as e:
        print(f"  ✗ {os.path.basename(filepath)}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description='Extract audio features for ESL ML training')
    parser.add_argument('--input', required=True, help='Directory containing genre subfolders with audio files')
    parser.add_argument('--output', default='features.csv', help='Output CSV path (default: features.csv)')
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} does not exist")
        sys.exit(1)

    rows = []
    audio_extensions = {'.wav', '.mp3', '.aiff', '.flac', '.m4a'}

    # Walk genre subdirectories
    for genre_dir in sorted(input_path.iterdir()):
        if not genre_dir.is_dir():
            continue
        genre_label = genre_dir.name.lower().replace(' ', '-')
        files = [f for f in genre_dir.iterdir() if f.suffix.lower() in audio_extensions]
        print(f"\n[{genre_label}] {len(files)} files")
        for f in sorted(files):
            row = extract_features(str(f), genre_label)
            if row:
                rows.append(row)

    if not rows:
        print("No features extracted. Check your input directory structure.")
        sys.exit(1)

    df = pd.DataFrame(rows)
    df.to_csv(args.output, index=False)
    print(f"\n✅ Extracted {len(rows)} tracks → {args.output}")
    print(f"   Columns: {list(df.columns)}")
    print(f"   Genre distribution:\n{df['genre'].value_counts().to_string()}")


if __name__ == '__main__':
    main()
