#!/usr/bin/env python3
"""
Echo Sound Lab — AI Vocal Enhancement Engine
Professional vocal chain: De-esser → Compression → EQ → Effects
Learns from reference vocals to match professional tone
"""

import numpy as np
import librosa
import scipy.signal as signal
from scipy.fft import fft, fftfreq
from dataclasses import dataclass
from typing import Tuple, Dict, List
import soundfile as sf

# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class VocalAnalysis:
    """Vocal-specific analysis"""
    sibilance_level: float  # 0-100, how much sibilance
    nasality_level: float  # 0-100, nasal quality
    breathiness_level: float  # 0-100, breathiness
    presence_level: float  # 0-100, mid presence
    warmth_level: float  # 0-100, low-end warmth
    clarity_level: float  # 0-100, high-end clarity
    dynamic_range: float  # dB, dynamic range
    spectral_centroid: float  # Hz, brightness
    voice_gender: str  # 'male', 'female', 'unknown'
    voice_type: str  # 'lead', 'harmony', 'rap', 'spoken'

@dataclass
class VocalEnhancementParams:
    """Vocal processing parameters"""
    desesser_threshold: float  # -40 to 0 dB
    desesser_ratio: float  # 2-10 (compression ratio for sibilance)
    desesser_frequency: float  # 6000-9000 Hz (sibilance band)

    compression_threshold: float  # -20 to 0 dB
    compression_ratio: float  # 2-8
    compression_attack: float  # 5-50 ms
    compression_release: float  # 50-300 ms

    eq_presence_boost: float  # -6 to +6 dB
    eq_warmth_boost: float  # -6 to +6 dB
    eq_clarity_boost: float  # -6 to +6 dB
    eq_air_boost: float  # -3 to +6 dB

    saturation_amount: float  # 0-1 (analog warmth)
    reverb_amount: float  # 0-0.3 (space)
    reverb_decay: float  # 0.5-3 sec (room size)

    doubling_amount: float  # 0-0.5 (double tracking effect)
    doubling_delay_ms: float  # 20-40 ms

# ============================================================================
# VOCAL ANALYZER
# ============================================================================

class VocalAnalyzer:
    """Analyze vocal characteristics"""

    @staticmethod
    def analyze(audio: np.ndarray, sr: int) -> VocalAnalysis:
        """Full vocal analysis"""

        # Spectral analysis
        stft = librosa.stft(audio)
        magnitude = np.abs(stft)
        freqs = librosa.fft_frequencies(sr=sr)

        # Sibilance detection (6-9kHz)
        sibilance_band = magnitude[np.where((freqs >= 6000) & (freqs <= 9000))]
        sibilance_level = 100 * np.mean(sibilance_band) / np.max(magnitude)

        # Nasality (2-4kHz)
        nasal_band = magnitude[np.where((freqs >= 2000) & (freqs <= 4000))]
        nasality_level = 100 * np.mean(nasal_band) / np.max(magnitude)

        # Breathiness (high freq noise, 10-16kHz)
        breath_band = magnitude[np.where((freqs >= 10000) & (freqs <= 16000))]
        breathiness_level = 100 * np.mean(breath_band) / np.max(magnitude)

        # Presence (2-5kHz)
        presence_band = magnitude[np.where((freqs >= 2000) & (freqs <= 5000))]
        presence_level = 100 * np.mean(presence_band) / np.max(magnitude)

        # Warmth (low-end, 50-250Hz)
        warmth_band = magnitude[np.where((freqs >= 50) & (freqs <= 250))]
        warmth_level = 100 * np.mean(warmth_band) / np.max(magnitude)

        # Clarity (5-8kHz)
        clarity_band = magnitude[np.where((freqs >= 5000) & (freqs <= 8000))]
        clarity_level = 100 * np.mean(clarity_band) / np.max(magnitude)

        # Dynamic range
        rms_values = librosa.feature.rms(y=audio)[0]
        dynamic_range = 20 * np.log10(np.max(rms_values) / (np.min(rms_values) + 1e-10))

        # Spectral centroid
        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0][0]

        # Voice gender detection (simple: male = lower centroid)
        if spectral_centroid < 2000:
            voice_gender = 'male'
        elif spectral_centroid > 3000:
            voice_gender = 'female'
        else:
            voice_gender = 'unknown'

        # Voice type detection
        zcr = np.mean(librosa.feature.zero_crossing_rate(audio)[0])
        if zcr < 0.05:
            voice_type = 'lead'  # Sustained, smooth
        elif zcr > 0.1:
            voice_type = 'rap'  # Lots of articulation
        else:
            voice_type = 'harmony'

        return VocalAnalysis(
            sibilance_level=sibilance_level,
            nasality_level=nasality_level,
            breathiness_level=breathiness_level,
            presence_level=presence_level,
            warmth_level=warmth_level,
            clarity_level=clarity_level,
            dynamic_range=dynamic_range,
            spectral_centroid=spectral_centroid,
            voice_gender=voice_gender,
            voice_type=voice_type
        )

# ============================================================================
# VOCAL PROCESSING CHAIN
# ============================================================================

class VocalProcessor:
    """Professional vocal processing"""

    @staticmethod
    def apply_desesser(
        audio: np.ndarray,
        sr: int,
        threshold: float = -20,
        ratio: float = 6,
        freq_center: float = 7000
    ) -> np.ndarray:
        """Remove sibilance (s, sh, ch sounds)"""

        # Isolate sibilance band (6-9kHz)
        sos = signal.butter(2, [6000, 9000], 'band', fs=sr, output='sos')
        sibilance = signal.sosfilt(sos, audio)

        # Detect peaks in sibilance
        peak_indices = signal.find_peaks(np.abs(sibilance), height=10**(-abs(threshold)/20))[0]

        # Apply compression to sibilant peaks
        output = audio.copy()
        for idx in peak_indices:
            window = slice(max(0, idx-100), min(len(audio), idx+100))
            output[window] = signal.lfilter([0.8], [1, -0.2], output[window])

        return output

    @staticmethod
    def apply_vocal_compression(
        audio: np.ndarray,
        sr: int,
        threshold: float = -15,
        ratio: float = 3,
        attack_ms: float = 20,
        release_ms: float = 100
    ) -> np.ndarray:
        """Smooth and glue vocal"""

        attack_samples = int(attack_ms * sr / 1000)
        release_samples = int(release_ms * sr / 1000)

        eps = 1e-10
        x_db = 20 * np.log10(np.abs(audio) + eps)

        gain_reduction = np.zeros_like(x_db)
        for i in range(len(x_db)):
            if x_db[i] > threshold:
                gain_reduction[i] = threshold + (x_db[i] - threshold) / ratio - x_db[i]

        # Envelope follower
        smoothed_gr = np.zeros_like(gain_reduction)
        smoothed_gr[0] = gain_reduction[0]

        for i in range(1, len(gain_reduction)):
            if gain_reduction[i] < smoothed_gr[i-1]:
                alpha = 2.0 / (attack_samples + 1)
            else:
                alpha = 2.0 / (release_samples + 1)

            smoothed_gr[i] = alpha * gain_reduction[i] + (1 - alpha) * smoothed_gr[i-1]

        # Apply with makeup gain
        makeup_gain = 1.5  # +3.5dB makeup
        output = audio * makeup_gain * (10**(smoothed_gr / 20))

        return output

    @staticmethod
    def apply_vocal_eq(
        audio: np.ndarray,
        sr: int,
        presence_db: float = 2,
        warmth_db: float = 1.5,
        clarity_db: float = 3,
        air_db: float = 2
    ) -> np.ndarray:
        """Sculpt vocal tone"""

        output = audio.copy()

        # Warmth boost (100Hz, gentle bell)
        b, a = signal.butter(2, [80, 150], 'band', fs=sr)
        warmth_band = signal.filtfilt(b, a, audio)
        output = output + warmth_band * (10**(warmth_db/20) - 1)

        # Presence boost (2-4kHz)
        b, a = signal.butter(2, [1500, 4000], 'band', fs=sr)
        presence_band = signal.filtfilt(b, a, audio)
        output = output + presence_band * (10**(presence_db/20) - 1)

        # Clarity boost (4-8kHz)
        b, a = signal.butter(2, [4000, 8000], 'band', fs=sr)
        clarity_band = signal.filtfilt(b, a, audio)
        output = output + clarity_band * (10**(clarity_db/20) - 1)

        # Air / presence (10-15kHz)
        sos = signal.butter(2, 10000, 'high', fs=sr, output='sos')
        air_band = signal.sosfilt(sos, audio)
        output = output + air_band * (10**(air_db/20) - 1)

        return np.clip(output, -1, 1)

    @staticmethod
    def apply_doubling(audio: np.ndarray, delay_ms: float = 20, amount: float = 0.3) -> np.ndarray:
        """Double-tracking effect (slight pitch shift + delay)"""

        sr = 48000  # Assume 48kHz
        delay_samples = int(delay_ms * sr / 1000)

        # Create delayed copy with slight pitch shift
        delayed = np.pad(audio, (delay_samples, 0), mode='constant')[:len(audio)]

        # Apply slight pitch variation
        stretched = librosa.effects.time_stretch(delayed, rate=1.005)
        stretched = stretched[:len(audio)]  # Trim to length

        # Blend with original
        return audio + stretched * amount

    @staticmethod
    def apply_reverb(audio: np.ndarray, amount: float = 0.1, decay_sec: float = 1.5, sr: int = 48000) -> np.ndarray:
        """Simple reverb (convolver approximation)"""

        if amount < 0.01:
            return audio

        # Generate impulse response
        ir_length = int(decay_sec * sr)
        ir = np.random.randn(ir_length) * np.exp(-np.arange(ir_length) / (decay_sec * sr))
        ir = ir / np.max(np.abs(ir))  # Normalize

        # Convolve (simple reverb)
        reverb = signal.fftconvolve(audio, ir, mode='same')
        reverb = reverb / np.max(np.abs(reverb))  # Normalize

        # Blend with original
        return audio + reverb * amount

# ============================================================================
# VOCAL ENHANCEMENT ENGINE
# ============================================================================

class VocalEnhancementEngine:
    """Complete vocal processing suite"""

    VOICE_PROFILES = {
        'male_lead': {
            'desesser_threshold': -18,
            'desesser_ratio': 5,
            'desesser_frequency': 7500,
            'compression_threshold': -16,
            'compression_ratio': 3.5,
            'compression_attack': 20,
            'compression_release': 100,
            'eq_presence_boost': 2.5,
            'eq_warmth_boost': 2,
            'eq_clarity_boost': 2.5,
            'eq_air_boost': 1.5,
            'saturation_amount': 0.2,
            'reverb_amount': 0.15,
            'reverb_decay': 1.2,
            'doubling_amount': 0.2,
            'doubling_delay_ms': 25,
        },
        'female_lead': {
            'desesser_threshold': -20,
            'desesser_ratio': 6,
            'desesser_frequency': 8000,
            'compression_threshold': -14,
            'compression_ratio': 3,
            'compression_attack': 15,
            'compression_release': 80,
            'eq_presence_boost': 3,
            'eq_warmth_boost': 1,
            'eq_clarity_boost': 3.5,
            'eq_air_boost': 2.5,
            'saturation_amount': 0.15,
            'reverb_amount': 0.1,
            'reverb_decay': 1.0,
            'doubling_amount': 0.15,
            'doubling_delay_ms': 20,
        },
        'rap': {
            'desesser_threshold': -22,
            'desesser_ratio': 8,
            'desesser_frequency': 6500,
            'compression_threshold': -18,
            'compression_ratio': 4,
            'compression_attack': 10,
            'compression_release': 60,
            'eq_presence_boost': 4,
            'eq_warmth_boost': 2.5,
            'eq_clarity_boost': 4,
            'eq_air_boost': 2,
            'saturation_amount': 0.25,
            'reverb_amount': 0.05,
            'reverb_decay': 0.5,
            'doubling_amount': 0,
            'doubling_delay_ms': 0,
        },
        'harmony': {
            'desesser_threshold': -18,
            'desesser_ratio': 4,
            'desesser_frequency': 7000,
            'compression_threshold': -16,
            'compression_ratio': 2.5,
            'compression_attack': 30,
            'compression_release': 120,
            'eq_presence_boost': 1.5,
            'eq_warmth_boost': 2.5,
            'eq_clarity_boost': 2,
            'eq_air_boost': 1,
            'saturation_amount': 0.1,
            'reverb_amount': 0.25,
            'reverb_decay': 2.0,
            'doubling_amount': 0.3,
            'doubling_delay_ms': 30,
        },
    }

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self.analyzer = VocalAnalyzer()

    def enhance(
        self,
        vocal: np.ndarray,
        reference: np.ndarray = None,
        voice_type: str = 'lead',
        gender: str = 'unknown',
        intensity: str = 'balanced'
    ) -> Tuple[np.ndarray, VocalAnalysis]:
        """
        Enhance vocal with professional chain
        """

        # Analyze input vocal
        analysis = self.analyzer.analyze(vocal, self.sr)

        # Select profile based on voice characteristics
        profile_name = f"{gender}_{voice_type}" if gender != 'unknown' else voice_type
        if profile_name not in self.VOICE_PROFILES:
            profile_name = 'male_lead'

        params = self.VOICE_PROFILES[profile_name].copy()

        # Adjust for intensity
        if intensity == 'subtle':
            params = {k: v * 0.6 if isinstance(v, float) else v for k, v in params.items()}
        elif intensity == 'aggressive':
            params = {k: v * 1.4 if isinstance(v, float) else v for k, v in params.items()}

        # Learn from reference if provided
        if reference is not None:
            params = self._blend_with_reference(params, reference)

        # ========== VOCAL PROCESSING CHAIN ==========

        output = vocal.copy()

        # Stage 1: De-esser (remove sibilance)
        output = VocalProcessor.apply_desesser(
            output, self.sr,
            threshold=params['desesser_threshold'],
            ratio=params['desesser_ratio'],
            freq_center=params['desesser_frequency']
        )

        # Stage 2: Vocal compression (glue & presence)
        output = VocalProcessor.apply_vocal_compression(
            output, self.sr,
            threshold=params['compression_threshold'],
            ratio=params['compression_ratio'],
            attack_ms=params['compression_attack'],
            release_ms=params['compression_release']
        )

        # Stage 3: Vocal EQ (tone shaping)
        output = VocalProcessor.apply_vocal_eq(
            output, self.sr,
            presence_db=params['eq_presence_boost'],
            warmth_db=params['eq_warmth_boost'],
            clarity_db=params['eq_clarity_boost'],
            air_db=params['eq_air_boost']
        )

        # Stage 4: Saturation (analog warmth)
        output = SaturationProcessor.apply_saturation(
            output,
            params['saturation_amount'],
            'tape'
        )

        # Stage 5: Doubling (width)
        if params['doubling_amount'] > 0:
            output = VocalProcessor.apply_doubling(
                output,
                params['doubling_delay_ms'],
                params['doubling_amount']
            )

        # Stage 6: Reverb (space)
        if params['reverb_amount'] > 0:
            output = VocalProcessor.apply_reverb(
                output,
                params['reverb_amount'],
                params['reverb_decay'],
                self.sr
            )

        # Normalize output
        output = output / (np.max(np.abs(output)) + 1e-10) * 0.95

        return output, analysis

    def _blend_with_reference(self, params: Dict, reference: np.ndarray) -> Dict:
        """Learn from reference vocal"""

        ref_analysis = self.analyzer.analyze(reference, self.sr)

        # Adjust EQ based on reference characteristics
        if ref_analysis.sibilance_level > 60:
            params['desesser_ratio'] *= 1.2  # More aggressive de-esser

        if ref_analysis.presence_level > 70:
            params['eq_presence_boost'] *= 1.1

        if ref_analysis.warmth_level > 70:
            params['eq_warmth_boost'] *= 1.1

        return params

# ============================================================================
# SATURATION PROCESSOR (Shared with mastering)
# ============================================================================

class SaturationProcessor:
    @staticmethod
    def apply_saturation(audio: np.ndarray, amount: float, style: str = 'tape') -> np.ndarray:
        if amount < 0.01:
            return audio

        boosted = audio * (1 + 2 * amount)

        if style == 'tape':
            return np.tanh(boosted) * (1 - amount * 0.2)
        elif style == 'hard':
            return np.clip(boosted, -1, 1)
        else:
            return audio

# ============================================================================
# MAIN
# ============================================================================

def main():
    import sys
    import json

    if len(sys.argv) < 3:
        print("Usage: python3 vocal_enhancement_engine.py --vocal <input.wav> --output <output.wav> [--reference <ref.wav>]")
        sys.exit(1)

    vocal_path = None
    output_path = None
    reference_path = None
    voice_type = 'lead'
    gender = 'unknown'
    intensity = 'balanced'

    for i, arg in enumerate(sys.argv):
        if arg == '--vocal':
            vocal_path = sys.argv[i + 1]
        elif arg == '--output':
            output_path = sys.argv[i + 1]
        elif arg == '--reference':
            reference_path = sys.argv[i + 1]
        elif arg == '--voice-type':
            voice_type = sys.argv[i + 1]
        elif arg == '--gender':
            gender = sys.argv[i + 1]
        elif arg == '--intensity':
            intensity = sys.argv[i + 1]

    # Load vocal
    vocal, sr = librosa.load(vocal_path, sr=48000, mono=False)

    # Load reference if provided
    reference = None
    if reference_path:
        reference, _ = librosa.load(reference_path, sr=48000, mono=False)

    # Enhance
    engine = VocalEnhancementEngine(sr=48000)
    enhanced, analysis = engine.enhance(
        vocal,
        reference=reference,
        voice_type=voice_type,
        gender=gender,
        intensity=intensity
    )

    # Save
    sf.write(output_path, enhanced.T if enhanced.ndim > 1 else enhanced, 48000, subtype='FLOAT')

    # Report
    print(f"Enhanced vocal saved to {output_path}")
    print(f"Analysis: Sibilance={analysis.sibilance_level:.1f}%, Presence={analysis.presence_level:.1f}%")

if __name__ == '__main__':
    main()
