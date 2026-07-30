#!/usr/bin/env python3
"""
Echo Sound Lab — Reference Matching Engine (Phase 6)
Analyze a reference track (e.g., Drake song) and match your mix to it

How it works:
1. User uploads their song + reference track
2. System analyzes reference audio
3. Extracts frequency characteristics
4. Applies those characteristics to user's song
5. Result: "Sounds like it could be on Drake's album"
"""

import numpy as np
import librosa
from scipy import signal
from typing import Dict, Tuple
import json

class ReferenceAnalyzer:
    """Analyze reference track characteristics"""

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def analyze_reference(self, audio: np.ndarray) -> Dict:
        """Extract reference track characteristics"""

        analysis = {}

        # 1. Overall loudness
        rms = np.sqrt(np.mean(audio ** 2))
        loudness_db = 20 * np.log10(rms + 1e-10)
        analysis['loudness'] = float(loudness_db)

        # 2. Frequency balance (energy in each band)
        analysis['frequency_balance'] = self._analyze_frequency_balance(audio)

        # 3. Dynamic range
        analysis['dynamic_range'] = self._analyze_dynamics(audio)

        # 4. Spectral characteristics
        analysis['spectral_shape'] = self._analyze_spectral_shape(audio)

        # 5. Compression character
        analysis['compression_character'] = self._analyze_compression(audio)

        # 6. Saturation/harmonic content
        analysis['harmonic_content'] = self._analyze_harmonics(audio)

        # 7. Stereo width (if stereo)
        if len(audio.shape) > 1:
            analysis['stereo_width'] = self._analyze_stereo_width(audio)

        return analysis

    def _analyze_frequency_balance(self, audio: np.ndarray) -> Dict:
        """Analyze energy distribution across frequency bands"""

        D = librosa.stft(audio)
        S = np.abs(D) ** 2
        freqs = librosa.fft_frequencies(sr=self.sr)

        bands = {
            'sub_bass': (20, 60),
            'bass': (60, 250),
            'low_mid': (250, 500),
            'mid': (500, 2000),
            'upper_mid': (2000, 4000),
            'presence': (4000, 8000),
            'brilliance': (8000, 20000),
        }

        balance = {}
        total_energy = np.sum(S)

        for band_name, (low, high) in bands.items():
            mask = (freqs >= low) & (freqs <= high)
            band_energy = np.sum(S[mask, :]) / total_energy
            balance[band_name] = float(band_energy)

        return balance

    def _analyze_dynamics(self, audio: np.ndarray) -> Dict:
        """Analyze dynamic range"""

        rms = librosa.feature.rms(y=audio)[0]
        peak = np.max(np.abs(audio))
        rms_mean = np.mean(rms)

        crest_factor = peak / (rms_mean + 1e-10)
        dynamic_range = 20 * np.log10(peak / (np.min(rms) + 1e-10))

        return {
            'crest_factor': float(crest_factor),
            'dynamic_range_db': float(dynamic_range),
            'rms_std': float(np.std(rms)),
        }

    def _analyze_spectral_shape(self, audio: np.ndarray) -> Dict:
        """Analyze spectral shape (which frequencies are boosted/cut)"""

        D = librosa.stft(audio)
        S = np.abs(D) ** 2
        mag = np.sqrt(np.mean(S, axis=1))
        mag_db = 20 * np.log10(mag + 1e-10)

        # Normalize to 0dB reference
        mag_db = mag_db - np.mean(mag_db)

        freqs = librosa.fft_frequencies(sr=self.sr)

        # Find peaks
        peaks = []
        for i in range(1, len(mag_db) - 1):
            if mag_db[i] > mag_db[i-1] and mag_db[i] > mag_db[i+1] and mag_db[i] > 2:  # 2dB peak
                peaks.append({'freq': float(freqs[i]), 'db': float(mag_db[i])})

        # Find dips
        dips = []
        for i in range(1, len(mag_db) - 1):
            if mag_db[i] < mag_db[i-1] and mag_db[i] < mag_db[i+1] and mag_db[i] < -1:  # -1dB dip
                dips.append({'freq': float(freqs[i]), 'db': float(mag_db[i])})

        return {
            'peaks': peaks[:3],  # Top 3 peaks
            'dips': dips[:3],    # Top 3 dips
        }

    def _analyze_compression(self, audio: np.ndarray) -> Dict:
        """Estimate compression character"""

        rms_envelope = librosa.feature.rms(y=audio)[0]
        rms_norm = rms_envelope / np.max(rms_envelope)

        # Compression ratio estimation (rough)
        # Highly compressed = low dynamic variance
        envelope_std = np.std(rms_norm)

        if envelope_std < 0.1:
            estimated_ratio = 8.0
        elif envelope_std < 0.15:
            estimated_ratio = 4.0
        elif envelope_std < 0.25:
            estimated_ratio = 2.0
        else:
            estimated_ratio = 1.5

        return {
            'estimated_ratio': float(estimated_ratio),
            'envelope_std': float(envelope_std),
            'is_heavily_compressed': envelope_std < 0.15,
        }

    def _analyze_harmonics(self, audio: np.ndarray) -> Dict:
        """Analyze harmonic content (saturation)"""

        # THD estimation
        D = librosa.stft(audio)
        S = np.abs(D) ** 2

        # Fundamental - use middle of audio or last frame if less than 100 frames
        mid_frame = min(100, S.shape[1] - 1)
        if mid_frame < 0:
            mid_frame = 0
        fundamental_idx = np.argmax(S[:, mid_frame])

        # Harmonics
        harmonic_energy = np.sum(S[fundamental_idx:fundamental_idx*3, :])
        total_energy = np.sum(S)

        harmonic_ratio = harmonic_energy / (total_energy + 1e-10)

        return {
            'harmonic_ratio': float(harmonic_ratio),
            'has_saturation': harmonic_ratio > 0.1,
            'saturation_amount': float(np.clip(harmonic_ratio / 0.2, 0, 1)),
        }

    def _analyze_stereo_width(self, audio: np.ndarray) -> Dict:
        """Analyze stereo width"""
        # Requires stereo input
        if audio.shape[0] != 2:
            return {'width': 'mono'}

        left = audio[0]
        right = audio[1]

        # Correlation (stereo width measure)
        correlation = np.corrcoef(left, right)[0, 1]

        if correlation > 0.8:
            width = 'mono'
        elif correlation > 0.5:
            width = 'narrow'
        elif correlation > -0.2:
            width = 'wide'
        else:
            width = 'very_wide'

        return {'width': width, 'correlation': float(correlation)}


class ReferenceMatchingEngine:
    """Match mix to reference track"""

    def __init__(self, sr: int = 44100):
        self.sr = sr
        self.analyzer = ReferenceAnalyzer(sr)

    def match_to_reference(
        self,
        user_audio: np.ndarray,
        reference_audio: np.ndarray,
        intensity: float = 0.8
    ) -> Tuple[np.ndarray, Dict]:
        """
        Match user audio to reference track characteristics

        Args:
            user_audio: User's mix
            reference_audio: Reference track (e.g., Drake song)
            intensity: How much to match (0-1)

        Returns:
            (Matched audio, Analysis)
        """

        # Analyze reference
        ref_analysis = self.analyzer.analyze_reference(reference_audio)

        # Analyze user audio
        user_analysis = self.analyzer.analyze_reference(user_audio)

        # Generate matching EQ
        output = user_audio.copy()

        # Match frequency balance
        output = self._match_frequency_balance(
            output,
            user_analysis['frequency_balance'],
            ref_analysis['frequency_balance'],
            intensity
        )

        # Match loudness
        output = self._match_loudness(
            output,
            user_analysis['loudness'],
            ref_analysis['loudness'],
            intensity * 0.5  # Subtle
        )

        # Match compression character
        if ref_analysis['compression_character']['is_heavily_compressed']:
            output = self._apply_compression(output, intensity)

        # Match saturation
        if ref_analysis['harmonic_content']['has_saturation']:
            output = self._apply_saturation(
                output,
                ref_analysis['harmonic_content']['saturation_amount'] * intensity
            )

        return output, {
            'reference': ref_analysis,
            'user_original': user_analysis,
            'matching_intensity': intensity,
        }

    def _match_frequency_balance(
        self,
        audio: np.ndarray,
        user_balance: Dict,
        ref_balance: Dict,
        intensity: float
    ) -> np.ndarray:
        """EQ to match reference frequency balance"""

        output = audio.copy()

        # Calculate gains needed for each band
        gains = {}
        for band in user_balance.keys():
            user_energy = user_balance[band]
            ref_energy = ref_balance[band]
            ratio = ref_energy / (user_energy + 1e-10)
            gain_db = 20 * np.log10(ratio) * intensity
            gains[band] = gain_db

        # Apply EQ
        band_freqs = {
            'sub_bass': 40,
            'bass': 100,
            'low_mid': 300,
            'mid': 1000,
            'upper_mid': 2500,
            'presence': 5000,
            'brilliance': 12000,
        }

        for band, freq in band_freqs.items():
            if abs(gains[band]) > 0.1:  # Only if significant
                output = self._apply_eq_boost(output, freq, gains[band])

        return output

    def _match_loudness(
        self,
        audio: np.ndarray,
        current_loudness: float,
        target_loudness: float,
        intensity: float
    ) -> np.ndarray:
        """Match loudness levels"""

        loudness_diff = target_loudness - current_loudness
        loudness_adjustment = loudness_diff * intensity
        gain_linear = 10 ** (loudness_adjustment / 20)

        return audio * gain_linear

    def _apply_compression(self, audio: np.ndarray, intensity: float) -> np.ndarray:
        """Apply compression to match reference character"""

        # Simple compressor
        ratio = 2.0 + intensity * 2.0  # 2:1 to 4:1
        threshold = -20

        for i in range(len(audio)):
            level_db = 20 * np.log10(np.abs(audio[i]) + 1e-10)

            if level_db > threshold:
                gain_reduction = (level_db - threshold) * (1 - 1/ratio)
                gain_linear = 10 ** (-gain_reduction / 20)
                audio[i] *= gain_linear

        return audio

    def _apply_saturation(self, audio: np.ndarray, amount: float) -> np.ndarray:
        """Apply gentle saturation"""

        # Soft clipping saturation
        return np.tanh(audio * (1 + amount * 5)) / np.tanh(1 + amount * 5)

    def _apply_eq_boost(self, audio: np.ndarray, freq: float, gain_db: float) -> np.ndarray:
        """Apply parametric EQ boost at frequency"""

        w0 = 2 * np.pi * freq / self.sr
        q = 1.0
        alpha = np.sin(w0) / (2 * q)
        gain_linear = 10 ** (gain_db / 20)

        b = [1 + alpha * gain_linear, -2 * np.cos(w0), 1 - alpha * gain_linear]
        a = [1 + alpha / gain_linear, -2 * np.cos(w0), 1 - alpha / gain_linear]

        return signal.lfilter(b, a, audio)


# Example usage
if __name__ == "__main__":
    from hardware_emulation import CompleteMasteringChainEmulation

    sr = 44100

    # Simulate reference (Drake-like)
    t = np.linspace(0, 3, int(sr * 3))
    reference = (
        0.4 * np.sin(2 * np.pi * 60 * t) +
        0.2 * np.sin(2 * np.pi * 1000 * t) +
        0.2 * np.sin(2 * np.pi * 5000 * t)
    )
    reference = reference / np.max(np.abs(reference)) * 0.9

    # Simulate user audio (less balanced)
    user = (
        0.1 * np.sin(2 * np.pi * 60 * t) +
        0.3 * np.sin(2 * np.pi * 1000 * t) +
        0.1 * np.sin(2 * np.pi * 5000 * t)
    )
    user = user / np.max(np.abs(user)) * 0.9

    # Analyze and match
    analyzer = ReferenceAnalyzer(sr)
    ref_analysis = analyzer.analyze_reference(reference)

    matcher = ReferenceMatchingEngine(sr)
    matched, analysis = matcher.match_to_reference(user, reference, intensity=0.9)

    # Apply hardware chain
    hw = CompleteMasteringChainEmulation(sr)
    final = hw.process(matched, chain_style='professional')

    print("✓ Reference Matching Engine ready")
    print(f"  - Reference analysis: {list(ref_analysis.keys())}")
    print(f"  - Matching complete")
    print(f"  - Output: {final.shape}")
