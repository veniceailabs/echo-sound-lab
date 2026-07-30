#!/usr/bin/env python3
"""
Echo Sound Lab — Hardware Emulation Engine (Phase 5)
Emulate classic analog mastering gear characteristics

Emulates:
- SSL 4000E Compressor (summing glue)
- Neve 1073 EQ (presence peak)
- Manley Variable Mu (smooth saturation)
- Neve 1084 Limiter (protective brick wall)
"""

import numpy as np
from scipy import signal
from typing import Tuple

class SSLCompressorEmulation:
    """
    Emulate SSL 4000E compressor character
    Known for: Summing glue, aggressive character, thick sound
    """

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def process(
        self,
        audio: np.ndarray,
        threshold: float = -20,
        ratio: float = 4.0,
        attack: float = 30,  # milliseconds
        release: float = 300,
        makeup_gain: float = None
    ) -> np.ndarray:
        """
        SSL-style compression with character

        Args:
            threshold: Threshold in dB (-40 to 0)
            ratio: Compression ratio (1:1 to ∞:1)
            attack: Attack time in ms
            release: Release time in ms
            makeup_gain: Auto makeup gain if None
        """

        # SSL has a ~6dB soft knee
        knee_width = 6.0
        knee_half = knee_width / 2

        # Convert time parameters to samples
        attack_samples = int((attack / 1000) * self.sr)
        release_samples = int((release / 1000) * self.sr)

        output = np.zeros_like(audio)
        envelope = 0

        # Process with SSL character
        for i in range(len(audio)):
            # Detect level
            detect_level = abs(audio[i])
            detect_db = 20 * np.log10(detect_level + 1e-10)

            # Soft knee
            if detect_db < threshold - knee_half:
                gain_reduction = 0
            elif detect_db < threshold + knee_half:
                # Soft knee region
                x = detect_db - (threshold - knee_half)
                gain_reduction = (1 / ratio - 1) * (x ** 2) / (2 * knee_width)
            else:
                # Linear region
                gain_reduction = (1 / ratio - 1) * (detect_db - threshold)

            # Envelope follower (SSL specific: slow, ballistic response)
            if gain_reduction > envelope:
                envelope = envelope + (gain_reduction - envelope) * (1 / attack_samples)
            else:
                envelope = envelope + (gain_reduction - envelope) * (1 / release_samples)

            # Apply gain reduction with SSL coloration
            gain_linear = 10 ** (-envelope / 20)

            # SSL add subtle harmonic (compression character)
            harmonic_factor = 1 + (1 - gain_linear) * 0.05
            output[i] = audio[i] * gain_linear * harmonic_factor

        # Automatic makeup gain
        if makeup_gain is None:
            # Estimate makeup needed
            max_reduction = (1 / ratio - 1) * (np.max(np.abs(audio)) - threshold)
            makeup_gain = abs(max_reduction) * 0.8

        makeup_linear = 10 ** (makeup_gain / 20)
        output = output * makeup_linear

        return output


class NeveEQEmulation:
    """
    Emulate Neve 1073 EQ character
    Known for: Smooth, musical presence peak, silky highs
    """

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def process(
        self,
        audio: np.ndarray,
        low_shelf_boost: float = 0,      # ±dB at 100 Hz
        low_mid_gain: float = 0,          # ±dB at 400 Hz
        mid_peak_gain: float = 0,         # ±dB at 2 kHz (presence)
        high_mid_gain: float = 0,         # ±dB at 5 kHz
        high_shelf_gain: float = 0        # ±dB at 12 kHz
    ) -> np.ndarray:
        """Apply Neve-style EQ with musical curves"""

        output = audio.copy()

        # Neve EQ bands with specific Q values (musical)
        bands = [
            (100, 0.5, low_shelf_boost, 'shelf'),
            (400, 1.0, low_mid_gain, 'peak'),
            (2000, 1.2, mid_peak_gain, 'peak'),   # Neve is famous for this
            (5000, 1.0, high_mid_gain, 'peak'),
            (12000, 0.5, high_shelf_gain, 'shelf'),
        ]

        for freq, q, gain_db, filter_type in bands:
            if gain_db == 0:
                continue

            if filter_type == 'peak':
                output = self._peaking_filter(output, freq, q, gain_db)
            else:
                output = self._shelf_filter(output, freq, gain_db, filter_type)

        return output

    def _peaking_filter(self, audio: np.ndarray, freq: float, q: float, gain_db: float) -> np.ndarray:
        """Neve peaking EQ section"""
        w0 = 2 * np.pi * freq / self.sr
        alpha = np.sin(w0) / (2 * q)
        gain_linear = 10 ** (gain_db / 20)

        # Peaking EQ
        b = [1 + alpha * gain_linear, -2 * np.cos(w0), 1 - alpha * gain_linear]
        a = [1 + alpha / gain_linear, -2 * np.cos(w0), 1 - alpha / gain_linear]

        return signal.lfilter(b, a, audio)

    def _shelf_filter(self, audio: np.ndarray, freq: float, gain_db: float, filter_type: str) -> np.ndarray:
        """Neve shelving EQ"""
        nyquist = self.sr / 2
        normalized_freq = freq / nyquist

        if filter_type == 'shelf':
            sos = signal.butter(1, normalized_freq, btype='low' if freq < 1000 else 'high', output='sos')
        else:
            sos = signal.butter(1, normalized_freq, btype='high', output='sos')

        # Apply gain
        gain_linear = 10 ** (gain_db / 20)
        return signal.sosfilt(sos, audio) * gain_linear


class ManleyVariableMuEmulation:
    """
    Emulate Manley Variable Mu compressor
    Known for: Smooth, musical compression, transparent character
    Used on millions of hit records
    """

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def process(
        self,
        audio: np.ndarray,
        threshold: float = -20,
        ratio: float = 3.0,
        attack: float = 10,     # milliseconds
        release: float = 60,    # milliseconds
        output_gain: float = 0  # dB
    ) -> np.ndarray:
        """
        Manley Variable Mu compression
        Characteristics: Smooth knee, musical response, tape-like
        """

        # Manley has variable mu (smooth exponential knee)
        attack_samples = max(1, int((attack / 1000) * self.sr))
        release_samples = max(1, int((release / 1000) * self.sr))

        output = np.zeros_like(audio)
        envelope = 0
        min_gain = 1.0 / ratio  # Maximum compression

        for i in range(len(audio)):
            # Soft knee (Manley specific: very smooth exponential)
            level = np.abs(audio[i])
            level_db = 20 * np.log10(level + 1e-10)

            # Exponential knee curve (smoother than linear)
            if level_db < threshold:
                gain_reduction_db = 0
            else:
                over_threshold = level_db - threshold
                # Exponential compression (Manley characteristic)
                gain_reduction_db = over_threshold * (1 - 1/ratio) * np.exp(-over_threshold / 10)

            gain_reduction = 10 ** (-gain_reduction_db / 20)

            # Envelope follower
            if gain_reduction < envelope:
                envelope = envelope - (envelope - gain_reduction) / attack_samples
            else:
                envelope = envelope - (envelope - gain_reduction) / release_samples

            # Apply gain with Manley smoothness
            output[i] = audio[i] * envelope

        # Output gain
        output_linear = 10 ** (output_gain / 20)
        return output * output_linear


class NeveMultibandLimiter:
    """
    Emulate Neve 1084 limiter (mastering chain)
    Known for: Transparent protection, musical limiting, brick wall at extreme settings
    """

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def process(
        self,
        audio: np.ndarray,
        threshold: float = -1,   # dB (typically -1 to -6 for mastering)
        release: float = 50      # milliseconds
    ) -> np.ndarray:
        """
        Neve-style limiter with musical release
        """

        release_samples = max(1, int((release / 1000) * self.sr))
        output = np.zeros_like(audio)
        envelope = 0

        for i in range(len(audio)):
            level = np.abs(audio[i])
            level_db = 20 * np.log10(level + 1e-10)

            if level_db > threshold:
                # Hard limiting above threshold
                target_level = 10 ** (threshold / 20)
                gain_reduction = target_level / (level + 1e-10)
            else:
                gain_reduction = 1.0

            # Very fast attack (brick wall behavior)
            if gain_reduction < envelope:
                envelope = gain_reduction  # Immediate response
            else:
                envelope = envelope + (gain_reduction - envelope) / release_samples

            # Apply limiter
            output[i] = audio[i] * envelope

        return output


class CompleteMasteringChainEmulation:
    """Combine all emulations into a complete mastering chain"""

    def __init__(self, sr: int = 44100):
        self.sr = sr
        self.neve_eq = NeveEQEmulation(sr)
        self.ssl_comp = SSLCompressorEmulation(sr)
        self.manley_comp = ManleyVariableMuEmulation(sr)
        self.neve_limiter = NeveMultibandLimiter(sr)

    def process(
        self,
        audio: np.ndarray,
        chain_style: str = 'professional'  # 'modern', 'vintage', 'professional'
    ) -> np.ndarray:
        """
        Complete mastering chain emulation

        Professional chain:
        1. Neve EQ (surgical correction)
        2. SSL Compressor (glue)
        3. Manley Compressor (smoothness)
        4. Neve Limiter (protection)
        """

        output = audio.copy()

        if chain_style == 'professional':
            # Stage 1: Neve EQ (corrective)
            output = self.neve_eq.process(
                output,
                low_shelf_boost=0.5,
                high_mid_gain=1.0,        # Presence peak
                high_shelf_gain=0.5
            )

            # Stage 2: SSL Compressor (glue)
            output = self.ssl_comp.process(
                output,
                threshold=-18,
                ratio=2.0,
                attack=20,
                release=120
            )

            # Stage 3: Manley Compressor (transparency)
            output = self.manley_comp.process(
                output,
                threshold=-15,
                ratio=1.5,
                attack=5,
                release=50,
                output_gain=2
            )

            # Stage 4: Neve Limiter (brick wall protection)
            output = self.neve_limiter.process(
                output,
                threshold=-1.0,
                release=50
            )

        elif chain_style == 'vintage':
            # More aggressive, colored chain
            output = self.ssl_comp.process(output, threshold=-20, ratio=4.0)
            output = self.manley_comp.process(output, threshold=-12, ratio=2.5)
            output = self.neve_limiter.process(output, threshold=-0.5)

        elif chain_style == 'modern':
            # Transparent, minimal chain
            output = self.manley_comp.process(output, threshold=-20, ratio=1.5, attack=2)
            output = self.neve_limiter.process(output, threshold=-2.0)

        return output
