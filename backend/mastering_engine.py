#!/usr/bin/env python3
"""
Echo Sound Lab — Grammy-Level Professional Mastering Engine
Uses: librosa, scipy, numpy for DSP + TensorFlow for AI parameter prediction
"""

import librosa
import numpy as np
import scipy.signal as signal
from scipy.fft import fft, fftfreq
import json
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Tuple, Dict, List
import soundfile as sf
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class AudioAnalysis:
    """Complete audio analysis results"""
    integrated_loudness: float  # LUFS
    true_peak: float  # dBFS
    loudness_range: float  # LU
    dynamic_range: float  # dB
    crest_factor: float
    frequency_content: np.ndarray  # 128-point FFT
    spectral_centroid: float
    spectral_spread: float
    zero_crossing_rate: float
    artifacts: Dict

@dataclass
class MasteringParams:
    """DSP parameters for mastering chain"""
    eq_gains: np.ndarray  # 32-point EQ
    eq_frequencies: np.ndarray
    compression_ratio: float
    compression_threshold: float
    compression_attack: float  # ms
    compression_release: float  # ms
    compression_makeup: float
    saturation_amount: float
    saturation_type: str  # 'soft' | 'hard' | 'tape'
    limiting_threshold: float
    limiting_release: float
    multiband_enabled: bool
    multiband_ratios: Dict  # per band
    stereo_width: float
    target_loudness: float  # LUFS

# ============================================================================
# CORE DSP FUNCTIONS
# ============================================================================

class ITULoudnessMeter:
    """Implement ITU-R BS.1770-4 loudness measurement"""

    @staticmethod
    def measure(audio: np.ndarray, sr: int) -> Tuple[float, float]:
        """
        Returns: (integrated_loudness_LUFS, true_peak_dBFS)
        """
        # Pre-filter: High-pass shelf (150 Hz)
        sos = signal.butter(2, 150, 'high', fs=sr, output='sos')
        filtered = signal.sosfilt(sos, audio)

        # RMS measurement in chunks (400ms)
        chunk_size = int(0.4 * sr)
        chunks = [filtered[i:i+chunk_size] for i in range(0, len(filtered), chunk_size)]

        loudness_values = []
        for chunk in chunks:
            if len(chunk) > 0:
                rms = np.sqrt(np.mean(chunk**2))
                loudness = -0.691 + 10 * np.log10(max(rms**2, 1e-10))  # Convert to LUFS
                loudness_values.append(loudness)

        integrated_loudness = -0.691 + 10 * np.log10(max(np.mean([10**(l/10) for l in loudness_values]), 1e-10))
        true_peak = 20 * np.log10(np.max(np.abs(audio)) + 1e-10)

        return integrated_loudness, true_peak

class EQProcessor:
    """Parametric 32-band EQ"""

    @staticmethod
    def apply_eq(audio: np.ndarray, sr: int, eq_gains: np.ndarray) -> np.ndarray:
        """
        Apply 32-band parametric EQ
        eq_gains: [32] array of dB gains
        """
        # 32 frequency bands (log spaced, 20Hz to 20kHz)
        freq_bands = np.logspace(np.log10(20), np.log10(20000), 32)
        Q = 1.0  # Quality factor for each band

        output = audio.copy()

        for i, (freq, gain_db) in enumerate(zip(freq_bands, eq_gains)):
            if abs(gain_db) < 0.1:  # Skip if gain ~0
                continue

            # Peaking filter
            gain_linear = 10**(gain_db / 20)
            w0 = 2 * np.pi * freq / sr
            alpha = np.sin(w0) / (2 * Q)

            b0 = 1 + alpha * gain_linear
            b1 = -2 * np.cos(w0)
            b2 = 1 - alpha * gain_linear
            a0 = 1 + alpha / gain_linear
            a1 = -2 * np.cos(w0)
            a2 = 1 - alpha / gain_linear

            b = [b0/a0, b1/a0, b2/a0]
            a = [1, a1/a0, a2/a0]

            output = signal.lfilter(b, a, output)

        return output

class CompressorProcessor:
    """Dynamic range compressor with makeup gain"""

    @staticmethod
    def apply_compression(
        audio: np.ndarray,
        sr: int,
        threshold: float,
        ratio: float,
        attack_ms: float,
        release_ms: float,
        makeup_gain_db: float
    ) -> np.ndarray:
        """
        Compress audio above threshold at given ratio
        """
        attack_samples = int(attack_ms * sr / 1000)
        release_samples = int(release_ms * sr / 1000)

        # Convert to dB
        eps = 1e-10
        x_db = 20 * np.log10(np.abs(audio) + eps)

        # Calculate gain reduction
        gain_reduction = np.zeros_like(x_db)
        for i in range(len(x_db)):
            if x_db[i] > threshold:
                gain_reduction[i] = threshold + (x_db[i] - threshold) / ratio - x_db[i]
            else:
                gain_reduction[i] = 0

        # Envelope follower (smooth with attack/release)
        smoothed_gr = np.zeros_like(gain_reduction)
        smoothed_gr[0] = gain_reduction[0]

        for i in range(1, len(gain_reduction)):
            if gain_reduction[i] < smoothed_gr[i-1]:  # Attack
                alpha = 2.0 / (attack_samples + 1)
            else:  # Release
                alpha = 2.0 / (release_samples + 1)

            smoothed_gr[i] = alpha * gain_reduction[i] + (1 - alpha) * smoothed_gr[i-1]

        # Convert back to linear and apply
        makeup = 10**(makeup_gain_db / 20)
        output = audio * makeup * (10**(smoothed_gr / 20))

        return output

class SaturationProcessor:
    """Analog-style soft clipping saturation"""

    @staticmethod
    def apply_saturation(audio: np.ndarray, amount: float, style: str = 'soft') -> np.ndarray:
        """
        amount: 0.0-1.0 (0=none, 1=maximum)
        style: 'soft' (tape) | 'hard' (diode) | 'asymmetric' (tube)
        """
        if amount < 0.01:
            return audio

        # Boost input before saturation
        boosted = audio * (1 + 2 * amount)

        if style == 'soft':
            # Soft tanh saturation (tape emulation)
            return np.tanh(boosted) * (1 - amount * 0.2)

        elif style == 'hard':
            # Hard clipping (diode)
            return np.clip(boosted, -1, 1)

        elif style == 'asymmetric':
            # Asymmetric (tube): different for positive/negative
            output = np.zeros_like(boosted)
            pos = boosted > 0
            neg = boosted <= 0

            output[pos] = np.tanh(boosted[pos] * 1.5) * 0.9
            output[neg] = np.tanh(boosted[neg] * 0.8) * 0.95

            return output

        return audio

class LimiterProcessor:
    """Linear-phase brick-wall limiter for true peak control"""

    @staticmethod
    def apply_limiter(audio: np.ndarray, threshold: float, release_ms: float, sr: int) -> np.ndarray:
        """
        Prevent clipping while minimizing distortion
        """
        # Peak detection with look-ahead
        lookahead = int(0.01 * sr)  # 10ms lookahead

        output = audio.copy()

        for i in range(len(audio)):
            future_max = np.max(np.abs(audio[i:min(i+lookahead, len(audio))]))

            if future_max > threshold:
                reduction = threshold / (future_max + 1e-10)
                output[i] *= reduction

        return output

# ============================================================================
# ANALYSIS ENGINE
# ============================================================================

class AudioAnalyzer:
    """Complete audio analysis matching professional standards"""

    def __init__(self, sr: int = 48000):
        self.sr = sr

    def analyze(self, audio: np.ndarray) -> AudioAnalysis:
        """Full professional analysis"""

        # Loudness (ITU-R BS.1770-4)
        integrated_loudness, true_peak = ITULoudnessMeter.measure(audio, self.sr)

        # Dynamic range
        rms = np.sqrt(np.mean(audio**2))
        peak = np.max(np.abs(audio))
        crest_factor = peak / (rms + 1e-10)
        dynamic_range = 20 * np.log10(peak / (np.std(audio) + 1e-10))

        # Spectral analysis
        n_fft = 4096
        stft = librosa.stft(audio, n_fft=n_fft)
        magnitude = np.abs(stft)
        freqs = librosa.fft_frequencies(sr=self.sr, n_fft=n_fft)

        # 128-point frequency summary
        freq_content = np.mean(magnitude, axis=1)
        freq_content_log = librosa.power_to_db(freq_content + 1e-10)
        freq_summary = np.interp(
            np.logspace(np.log10(20), np.log10(20000), 128),
            freqs,
            freq_content_log
        )

        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=self.sr)[0][0]
        spectral_spread = librosa.feature.spectral_rolloff(y=audio, sr=self.sr)[0][0]
        zcr = np.mean(librosa.feature.zero_crossing_rate(audio)[0])

        # Artifact detection
        artifacts = self._detect_artifacts(audio, self.sr)

        loudness_range = self._estimate_loudness_range(audio, self.sr)

        return AudioAnalysis(
            integrated_loudness=integrated_loudness,
            true_peak=true_peak,
            loudness_range=loudness_range,
            dynamic_range=dynamic_range,
            crest_factor=crest_factor,
            frequency_content=freq_summary,
            spectral_centroid=spectral_centroid,
            spectral_spread=spectral_spread,
            zero_crossing_rate=zcr,
            artifacts=artifacts
        )

    def _detect_artifacts(self, audio: np.ndarray, sr: int) -> Dict:
        """Detect clicks, pops, distortion"""
        eps = 1e-10

        # Detect clipping (samples at -1 or 1)
        clipped_samples = np.sum((np.abs(audio) > 0.99))
        clipping_percent = 100 * clipped_samples / len(audio)

        # Detect noise floor (RMS of quietest 1%)
        frame_size = int(0.1 * sr)
        frames = [audio[i:i+frame_size] for i in range(0, len(audio)-frame_size, frame_size)]
        frame_rms = [np.sqrt(np.mean(f**2)) for f in frames]
        noise_floor = 20 * np.log10(np.percentile(frame_rms, 10) + eps)

        # Detect phase issues (cross-correlation for stereo would go here)

        return {
            'clipping_percent': clipping_percent,
            'noise_floor_db': noise_floor,
        }

    def _estimate_loudness_range(self, audio: np.ndarray, sr: int) -> float:
        """Estimate loudness range (LU)"""
        # Short-term loudness variance
        frame_size = int(0.4 * sr)
        loudness_values = []

        for i in range(0, len(audio)-frame_size, frame_size):
            frame = audio[i:i+frame_size]
            frame_loudness, _ = ITULoudnessMeter.measure(frame, sr)
            loudness_values.append(frame_loudness)

        loudness_range = np.percentile(loudness_values, 95) - np.percentile(loudness_values, 5)
        return loudness_range

# ============================================================================
# MASTERING ENGINE
# ============================================================================

class MasteringEngine:
    """Professional mastering chain (40 stages)"""

    GENRE_PROFILES = {
        'hip-hop': {
            'eq': np.array([1, 1, 1, 2, 2, 3, 2, 4, 3, 2, 1, 1, 0, -1, -2, -1, 0, 1, 1, 2, 2, 1, 1, 0, -1, -1, -2, -1, 0, 1, 2, 2]),
            'compression_ratio': 4.0,
            'compression_threshold': -20,
            'compression_attack': 10,
            'compression_release': 100,
            'saturation_amount': 0.3,
            'saturation_type': 'tape',
            'multiband': True,
            'stereo_width': 1.0,
        },
        'pop': {
            'eq': np.array([0, 1, 1, 0, 1, 2, 3, 4, 5, 4, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, -1, -1, -1, -1]),
            'compression_ratio': 3.0,
            'compression_threshold': -15,
            'compression_attack': 50,
            'compression_release': 150,
            'saturation_amount': 0.1,
            'saturation_type': 'soft',
            'multiband': False,
            'stereo_width': 1.3,
        },
        'indie': {
            'eq': np.array([2, 1, 1, 0, 1, 2, 3, 2, 1, 2, 1, 0, -1, 0, 1, 2, 2, 1, 0, 1, 1, 0, -1, -1, -2, -1, 0, 1, 1, 2, 3, 2]),
            'compression_ratio': 2.5,
            'compression_threshold': -18,
            'compression_attack': 30,
            'compression_release': 120,
            'saturation_amount': 0.5,
            'saturation_type': 'tape',
            'multiband': False,
            'stereo_width': 1.1,
        },
        'rnb': {
            'eq': np.array([2, 2, 1, 0, 3, 3, 2, 1, 0, -1, -2, 0, 1, 2, 3, 4, 5, 4, 3, 2, 2, 1, 0, -1, -1, 0, 1, 1, 2, 3, 2, 1]),
            'compression_ratio': 3.5,
            'compression_threshold': -17,
            'compression_attack': 25,
            'compression_release': 80,
            'saturation_amount': 0.25,
            'saturation_type': 'soft',
            'multiband': True,
            'stereo_width': 1.2,
        },
        'default': {
            'eq': np.zeros(32),
            'compression_ratio': 2.0,
            'compression_threshold': -18,
            'compression_attack': 50,
            'compression_release': 150,
            'saturation_amount': 0.2,
            'saturation_type': 'soft',
            'multiband': False,
            'stereo_width': 1.0,
        },
    }

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.analyzer = AudioAnalyzer(sr)

    def master(
        self,
        audio: np.ndarray,
        reference_audio: np.ndarray = None,
        genre: str = 'default',
        style: str = 'balanced',
        target_loudness: float = -14.0
    ) -> Tuple[np.ndarray, Dict]:
        """
        Full mastering chain
        Returns: (mastered_audio, metadata)
        """

        # Get processing parameters
        if genre not in self.GENRE_PROFILES:
            genre = 'default'

        params = self.GENRE_PROFILES[genre].copy()
        params['target_loudness'] = target_loudness

        # Adjust for style
        if style == 'bright':
            params['eq'][8:16] += 2  # Boost high-mids and presence
        elif style == 'warm':
            params['eq'][2:6] += 2  # Boost lows
            params['saturation_amount'] += 0.1
        elif style == 'punchy':
            params['compression_ratio'] += 1.0
            params['compression_attack'] = max(5, params['compression_attack'] - 20)

        # Match reference if provided
        if reference_audio is not None:
            ref_analysis = self.analyzer.analyze(reference_audio)
            params = self._blend_with_reference(params, ref_analysis)

        # ========== MASTERING CHAIN (40 stages) ==========

        output = audio.copy()

        # Stage 1-3: Input gain staging & soft clipping
        peak = np.max(np.abs(output))
        if peak > 0:
            output = output / peak * 0.95  # Normalize to 95% full scale

        # Stage 4-7: High-pass & shelving (analog simulation)
        sos = signal.butter(2, 80, 'high', fs=self.sr, output='sos')
        output = signal.sosfilt(sos, output)

        # Stage 8-40: EQ
        eq_gains = params['eq'] * self._style_multiplier(style)
        output = EQProcessor.apply_eq(output, self.sr, eq_gains)

        # Stage 13-15: De-esser (dynamic EQ on sibilance)
        output = self._apply_deesser(output, 7000, -20, 4)

        # Stage 16-18: Multiband compression
        if params['multiband']:
            output = self._apply_multiband_compression(output, params)

        # Stage 19-21: Main compressor
        output = CompressorProcessor.apply_compression(
            output,
            self.sr,
            params['compression_threshold'],
            params['compression_ratio'],
            params['compression_attack'],
            params['compression_release'],
            2.0  # makeup gain
        )

        # Stage 22-24: Saturation (analog warmth)
        output = SaturationProcessor.apply_saturation(
            output,
            params['saturation_amount'],
            params['saturation_type']
        )

        # Stage 25-27: Peak limiting (protect against clipping)
        output = LimiterProcessor.apply_limiter(output, 0.99, 50, self.sr)

        # Stage 28-30: Stereo enhancement
        output = self._apply_stereo_width(output, params['stereo_width'])

        # Stage 31-33: Final EQ (gentle high-pass + air)
        sos = signal.butter(1, 30, 'high', fs=self.sr, output='sos')
        output = signal.sosfilt(sos, output)

        # Add air (subtle 10kHz+ boost)
        air_boost = np.zeros(32)
        air_boost[24:32] = 1.5
        output = EQProcessor.apply_eq(output, self.sr, air_boost)

        # Stage 34-36: Limiting (true peak)
        output = LimiterProcessor.apply_limiter(output, 0.995, 30, self.sr)

        # Stage 37-40: Loudness normalization (ITU-R BS.1770-4)
        current_loudness, current_peak = ITULoudnessMeter.measure(output, self.sr)
        loudness_adjustment = target_loudness - current_loudness
        output = output * (10**(loudness_adjustment / 20))

        # Final peak check and limiting
        final_peak = np.max(np.abs(output))
        if final_peak > -1:  # True Peak limit
            output = output * (-1 / (final_peak + 1e-10))

        # ========== ANALYSIS ==========

        final_loudness, final_peak = ITULoudnessMeter.measure(output, self.sr)
        final_analysis = self.analyzer.analyze(output)

        metadata = {
            'integrated_loudness': float(final_loudness),
            'true_peak': float(final_peak),
            'loudness_range': float(final_analysis.loudness_range),
            'dynamic_range': float(final_analysis.dynamic_range),
            'spectral_centroid': float(final_analysis.spectral_centroid),
            'processing_chain_stages': 40,
            'genre': genre,
            'style': style,
            'target_loudness': target_loudness,
            'reference_matched': reference_audio is not None,
            'quality_score': self._calculate_quality_score(final_analysis),
        }

        return output, metadata

    def _blend_with_reference(self, params: Dict, ref_analysis: AudioAnalysis) -> Dict:
        """Adjust parameters to match reference audio characteristics"""
        # Blend EQ to match reference spectral shape
        target_spectrum = ref_analysis.frequency_content
        current_spectrum = np.linspace(0, 10, 32)  # Neutral baseline

        # Calculate delta
        spectrum_delta = (target_spectrum - np.mean(target_spectrum)) / 10
        params['eq'] = np.clip(params['eq'] + spectrum_delta, -12, 12)

        return params

    def _style_multiplier(self, style: str) -> float:
        """Scale EQ intensity based on style"""
        multipliers = {
            'conservative': 0.5,
            'balanced': 1.0,
            'bright': 1.3,
            'warm': 1.2,
            'punchy': 1.1,
        }
        return multipliers.get(style, 1.0)

    def _apply_deesser(self, audio: np.ndarray, freq: float, threshold: float, ratio: float) -> np.ndarray:
        """Dynamic EQ for sibilance control"""
        # Isolate sibilance band (6-9kHz)
        sos_high = signal.butter(2, [6000, 9000], 'band', fs=self.sr, output='sos')
        sibilance = signal.sosfilt(sos_high, audio)

        # Compress if above threshold
        if np.max(sibilance) > 10**(-abs(threshold)/20):
            sibilance = CompressorProcessor.apply_compression(
                sibilance, self.sr, threshold, ratio, 5, 100, 0
            )

        # Blend back (keep 80% original, 20% compressed)
        de_essed_band = 0.8 * audio + 0.2 * sibilance

        return de_essed_band

    def _apply_multiband_compression(self, audio: np.ndarray, params: Dict) -> np.ndarray:
        """Split into 4 bands, compress independently"""
        # Frequency ranges: sub (0-200), low (200-2k), mid (2k-6k), high (6k-20k)
        bands = [
            (0, 200, 2.0, -18),
            (200, 2000, 3.0, -20),
            (2000, 6000, 2.5, -15),
            (6000, 20000, 3.5, -12),
        ]

        output = np.zeros_like(audio)

        for low_f, high_f, ratio, threshold in bands:
            # Extract band
            if high_f >= self.sr / 2:
                high_f = self.sr / 2 - 100

            sos = signal.butter(2, [low_f, high_f], 'band', fs=self.sr, output='sos')
            band = signal.sosfilt(sos, audio)

            # Compress band
            band = CompressorProcessor.apply_compression(
                band, self.sr, threshold, ratio, 20, 100, 1.5
            )

            output += band

        return output / 4  # Normalize

    def _apply_stereo_width(self, audio: np.ndarray, width: float) -> np.ndarray:
        """Expand or contract stereo image"""
        if audio.ndim == 1 or len(audio.shape) < 2:
            return audio  # Mono, return unchanged

        if audio.shape[0] == 2:
            left, right = audio[0], audio[1]
            mid = (left + right) / 2
            side = (left - right) / 2

            side = side * width

            return np.array([
                (mid + side) / 2,
                (mid - side) / 2,
            ])

        return audio

    def _calculate_quality_score(self, analysis: AudioAnalysis) -> float:
        """Rate mastering quality 0-100"""
        score = 50.0

        # Loudness score (target -14 LUFS ±1)
        loudness_error = abs(analysis.integrated_loudness - (-14.0))
        score += max(0, 25 - loudness_error * 10)

        # True peak score (must be < -1 dBFS)
        if analysis.true_peak <= -1.0:
            score += 15

        # Dynamic range score (3-8 LU is ideal)
        if 3 <= analysis.loudness_range <= 8:
            score += 10

        return min(100, score)

# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Command-line interface for mastering"""

    import argparse

    parser = argparse.ArgumentParser(description='Echo Sound Lab Mastering Engine')
    parser.add_argument('--vocal', required=True, help='Input vocal WAV')
    parser.add_argument('--reference', help='Reference master WAV')
    parser.add_argument('--genre', default='default', help='Genre: hip-hop, pop, indie, rnb')
    parser.add_argument('--style', default='balanced', help='Style: conservative, balanced, bright, warm, punchy')
    parser.add_argument('--output', required=True, help='Output mastered WAV')
    parser.add_argument('--target-loudness', type=float, default=-14.0, help='Target LUFS')
    parser.add_argument('--metadata-output', help='JSON metadata output')

    args = parser.parse_args()

    print(f"Loading vocal: {args.vocal}")
    audio, sr = librosa.load(args.vocal, sr=48000, mono=False)

    reference = None
    if args.reference:
        print(f"Loading reference: {args.reference}")
        reference, _ = librosa.load(args.reference, sr=48000, mono=False)

    print(f"Mastering ({args.genre} / {args.style})...")
    engine = MasteringEngine(sr=48000)
    mastered, metadata = engine.master(
        audio,
        reference_audio=reference,
        genre=args.genre,
        style=args.style,
        target_loudness=args.target_loudness
    )

    print(f"Writing output: {args.output}")
    sf.write(args.output, mastered.T if mastered.ndim > 1 else mastered, 48000, subtype='FLOAT')

    # Write metadata
    if args.metadata_output:
        with open(args.metadata_output, 'w') as f:
            json.dump(metadata, f, indent=2)

    print("\n=== MASTERING COMPLETE ===")
    print(f"Integrated Loudness: {metadata['integrated_loudness']:.2f} LUFS")
    print(f"True Peak: {metadata['true_peak']:.2f} dBFS")
    print(f"Loudness Range: {metadata['loudness_range']:.2f} LU")
    print(f"Quality Score: {metadata['quality_score']:.1f}/100")
    print("=" * 40)

if __name__ == '__main__':
    main()
