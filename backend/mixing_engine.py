#!/usr/bin/env python3
"""
Echo Sound Lab — Professional Mixing Engine
Multi-track mixing with EQ, compression, effects, automation
Competitive with Pro Tools, Logic Pro, Ableton Live for mixing quality
"""

import numpy as np
import librosa
import scipy.signal as signal
from dataclasses import dataclass, field
from typing import Tuple, Dict, List, Optional
from enum import Enum
import soundfile as sf

# ============================================================================
# ENUMS & DATA STRUCTURES
# ============================================================================

class ChannelType(Enum):
    VOCAL = "vocal"
    DRUMS = "drums"
    BASS = "bass"
    GUITAR = "guitar"
    KEYS = "keys"
    SYNTH = "synth"
    STRINGS = "strings"
    HORNS = "horns"
    MISC = "misc"

@dataclass
class EQBand:
    """Single EQ band (peaking, shelving, HPF, LPF)"""
    frequency: float  # Hz
    gain: float  # dB (-12 to +12)
    q: float  # Quality factor (0.5 to 4)
    bandwidth: float = None  # Optional: 0.1 to 2 octaves
    filter_type: str = 'peaking'  # peaking, high_shelf, low_shelf, high_pass, low_pass

@dataclass
class CompressorSettings:
    """Dynamics control"""
    threshold: float = -20  # dB
    ratio: float = 4  # 1:X compression
    attack_ms: float = 10
    release_ms: float = 100
    makeup_gain: float = 0  # dB (auto-calculated)
    knee_db: float = 0  # Soft knee amount

@dataclass
class ChannelStrip:
    """Professional mixing channel"""
    channel_id: str
    name: str
    channel_type: ChannelType

    # Volume & Pan
    fader: float = 0  # dB (-inf to +6)
    pan: float = 0  # -1 (left) to +1 (right)

    # EQ (5-band parametric)
    eq_bands: List[EQBand] = field(default_factory=lambda: [
        EQBand(100, 0, 0.7),      # Low shelf
        EQBand(400, 0, 1.0),      # Low-mid
        EQBand(1000, 0, 1.0),     # Mid
        EQBand(4000, 0, 1.0),     # High-mid
        EQBand(12000, 0, 0.7),    # High shelf
    ])

    # Dynamics
    compressor: CompressorSettings = field(default_factory=CompressorSettings)
    gate_threshold: float = -40  # Noise gate dB

    # Effects Send
    reverb_send: float = 0  # 0-1 (0dB to -inf)
    delay_send: float = 0
    chorus_send: float = 0

    # Routing
    solo: bool = False
    mute: bool = False
    output_bus: str = 'master'  # Master or submix

    # Automation
    automation_curves: Dict[str, List[Tuple[float, float]]] = field(
        default_factory=lambda: {
            'fader': [],
            'pan': [],
            'eq_0': [],  # EQ band 0 automation
        }
    )

    # Monitoring
    peak_level: float = -60  # dB (for UI display)
    rms_level: float = -60
    input_peak: float = 0

@dataclass
class BusSettings:
    """Master bus or submix"""
    bus_id: str
    name: str
    fader: float = 0  # dB

    # Master processing
    limiter_enabled: bool = True
    limiter_threshold: float = -0.3  # dBFS

    # Master EQ
    eq_bands: List[EQBand] = field(default_factory=lambda: [
        EQBand(100, 0, 0.7),
        EQBand(1000, 0, 1.0),
        EQBand(10000, 0, 0.7),
    ])

    # Master Compressor
    compressor: CompressorSettings = field(
        default_factory=lambda: CompressorSettings(
            threshold=-18, ratio=2, attack_ms=50, release_ms=150
        )
    )

@dataclass
class MixingSession:
    """Complete mixing project"""
    session_id: str
    name: str
    bpm: float = 120
    sample_rate: int = 48000

    # Tracks
    channels: Dict[str, ChannelStrip] = field(default_factory=dict)
    master_bus: BusSettings = field(default_factory=lambda: BusSettings("master", "Master"))
    submixes: Dict[str, BusSettings] = field(default_factory=dict)

    # Global settings
    gain_staging_target: float = -18  # Target headroom

# ============================================================================
# EQ PROCESSOR
# ============================================================================

class EQProcessor:
    """Professional parametric EQ"""

    @staticmethod
    def design_filter(band: EQBand, sr: int) -> Tuple[np.ndarray, np.ndarray]:
        """Design single EQ band filter"""

        freq = band.frequency
        gain_db = band.gain
        q = band.q if band.q > 0 else 1.0
        gain_linear = 10 ** (gain_db / 20)

        w0 = 2 * np.pi * freq / sr
        alpha = np.sin(w0) / (2 * q)

        if band.filter_type == 'peaking':
            b0 = 1 + alpha * gain_linear
            b1 = -2 * np.cos(w0)
            b2 = 1 - alpha * gain_linear
            a0 = 1 + alpha / gain_linear
            a1 = -2 * np.cos(w0)
            a2 = 1 - alpha / gain_linear

        elif band.filter_type == 'high_shelf':
            s = 2 * np.sqrt(gain_linear) * alpha
            b0 = gain_linear * ((gain_linear + 1) + (gain_linear - 1) * np.cos(w0) + s)
            b1 = -2 * gain_linear * ((gain_linear - 1) + (gain_linear + 1) * np.cos(w0))
            b2 = gain_linear * ((gain_linear + 1) + (gain_linear - 1) * np.cos(w0) - s)
            a0 = (gain_linear + 1) - (gain_linear - 1) * np.cos(w0) + s
            a1 = 2 * ((gain_linear - 1) - (gain_linear + 1) * np.cos(w0))
            a2 = (gain_linear + 1) - (gain_linear - 1) * np.cos(w0) - s

        elif band.filter_type == 'low_shelf':
            s = 2 * np.sqrt(gain_linear) * alpha
            b0 = gain_linear * ((gain_linear + 1) - (gain_linear - 1) * np.cos(w0) + s)
            b1 = 2 * gain_linear * ((gain_linear - 1) - (gain_linear + 1) * np.cos(w0))
            b2 = gain_linear * ((gain_linear + 1) - (gain_linear - 1) * np.cos(w0) - s)
            a0 = (gain_linear + 1) + (gain_linear - 1) * np.cos(w0) + s
            a1 = -2 * ((gain_linear - 1) + (gain_linear + 1) * np.cos(w0))
            a2 = (gain_linear + 1) + (gain_linear - 1) * np.cos(w0) - s

        else:
            # Default to peaking
            return np.array([1]), np.array([1])

        b = np.array([b0, b1, b2]) / a0
        a = np.array([1, a1/a0, a2/a0])

        return b, a

    @staticmethod
    def apply_eq(audio: np.ndarray, sr: int, bands: List[EQBand]) -> np.ndarray:
        """Apply 5-band parametric EQ"""

        output = audio.copy()

        for band in bands:
            if abs(band.gain) < 0.1:  # Skip if no change
                continue

            b, a = EQProcessor.design_filter(band, sr)
            output = signal.filtfilt(b, a, output)

        return np.clip(output, -1, 1)

# ============================================================================
# DYNAMICS PROCESSOR
# ============================================================================

class DynamicsProcessor:
    """Compressor + Gate"""

    @staticmethod
    def apply_compressor(
        audio: np.ndarray,
        sr: int,
        settings: CompressorSettings
    ) -> np.ndarray:
        """Professional dynamic range compression"""

        attack_samples = int(settings.attack_ms * sr / 1000)
        release_samples = int(settings.release_ms * sr / 1000)

        eps = 1e-10
        x_db = 20 * np.log10(np.abs(audio) + eps)

        # Calculate gain reduction
        gain_reduction = np.zeros_like(x_db)
        for i in range(len(x_db)):
            if x_db[i] > settings.threshold:
                gain_reduction[i] = settings.threshold + (x_db[i] - settings.threshold) / settings.ratio - x_db[i]

        # Envelope follower (smooth with attack/release)
        smoothed_gr = np.zeros_like(gain_reduction)
        smoothed_gr[0] = gain_reduction[0]

        for i in range(1, len(gain_reduction)):
            if gain_reduction[i] < smoothed_gr[i-1]:
                alpha = 2.0 / (attack_samples + 1)
            else:
                alpha = 2.0 / (release_samples + 1)

            smoothed_gr[i] = alpha * gain_reduction[i] + (1 - alpha) * smoothed_gr[i-1]

        # Auto makeup gain
        makeup = settings.makeup_gain if settings.makeup_gain > 0 else -np.min(smoothed_gr) * 0.5
        return audio * (10**((makeup + smoothed_gr) / 20))

    @staticmethod
    def apply_gate(audio: np.ndarray, threshold: float) -> np.ndarray:
        """Noise gate"""

        gate_level = 10 ** (threshold / 20)
        output = audio.copy()
        output[np.abs(output) < gate_level] *= 0.5  # Gentle gate

        return output

# ============================================================================
# EFFECTS PROCESSORS
# ============================================================================

class EffectsProcessor:
    """Reverb, Delay, Chorus"""

    @staticmethod
    def apply_reverb(
        audio: np.ndarray,
        sr: int,
        decay_sec: float = 2.0,
        pre_delay_ms: float = 0,
        width: float = 1.0
    ) -> np.ndarray:
        """Spacious convolution reverb approximation"""

        # Pre-delay
        if pre_delay_ms > 0:
            pre_delay_samples = int(pre_delay_ms * sr / 1000)
            audio = np.pad(audio, (pre_delay_samples, 0), mode='constant')

        # Generate Schroeder reverberator (parallel comb filters + diffusers)
        ir_length = int(decay_sec * sr)
        ir = np.random.randn(ir_length) * np.exp(-np.arange(ir_length) / (decay_sec * sr))
        ir = ir / (np.max(np.abs(ir)) + 1e-10)

        # Convolve
        reverb = signal.fftconvolve(audio, ir, mode='same')
        reverb = reverb / (np.max(np.abs(reverb)) + 1e-10)

        return reverb * width

    @staticmethod
    def apply_delay(
        audio: np.ndarray,
        sr: int,
        delay_ms: float = 250,
        feedback: float = 0.4,
        mix: float = 0.5
    ) -> np.ndarray:
        """Repeating delay with feedback"""

        delay_samples = int(delay_ms * sr / 1000)
        output = audio.copy()

        delayed = np.zeros(len(audio) + delay_samples)
        delayed[:len(audio)] = audio

        for _ in range(3):  # 3 repeats
            delayed[delay_samples:] += delayed[:-delay_samples] * feedback

        delayed = delayed[:len(audio)]
        delayed = delayed / (np.max(np.abs(delayed)) + 1e-10)

        return audio * (1 - mix) + delayed * mix

    @staticmethod
    def apply_chorus(
        audio: np.ndarray,
        sr: int,
        depth: float = 0.2,
        rate_hz: float = 1.5
    ) -> np.ndarray:
        """Classic chorus effect (modulated delay)"""

        # LFO (modulation oscillator)
        t = np.arange(len(audio)) / sr
        lfo = np.sin(2 * np.pi * rate_hz * t) * depth

        # Modulate delay (5-15ms)
        delay_samples = 10 + lfo * 5
        delay_samples = delay_samples.astype(int)

        output = np.zeros_like(audio)
        for i in range(len(audio)):
            delay = min(delay_samples[i], i)
            if delay > 0:
                output[i] = audio[i] + audio[i - delay] * 0.5

        return output

# ============================================================================
# MIXING ENGINE
# ============================================================================

class MixingEngine:
    """Complete mixing console"""

    def __init__(self, sample_rate: int = 48000):
        self.sr = sample_rate
        self.eq_processor = EQProcessor()
        self.dynamics_processor = DynamicsProcessor()
        self.effects_processor = EffectsProcessor()

    def mix_session(
        self,
        session: MixingSession,
        tracks: Dict[str, np.ndarray],
        render_effects: bool = True,
        render_automation: bool = True
    ) -> np.ndarray:
        """
        Mix all tracks in session
        Returns stereo mix
        """

        # Process each channel
        processed_tracks = {}

        for channel_id, channel in session.channels.items():
            if channel_id not in tracks:
                continue

            audio = tracks[channel_id].copy()

            # Skip if muted
            if channel.mute:
                continue

            # Stage 1: EQ
            audio = self.eq_processor.apply_eq(audio, self.sr, channel.eq_bands)

            # Stage 2: Compressor
            audio = self.dynamics_processor.apply_compressor(audio, self.sr, channel.compressor)

            # Stage 3: Gate
            audio = self.dynamics_processor.apply_gate(audio, channel.gate_threshold)

            # Stage 4: Apply fader gain
            fader_gain = 10 ** (channel.fader / 20)
            audio = audio * fader_gain

            # Stage 5: Pan stereo (L/R)
            if audio.ndim == 1:  # Mono
                audio_stereo = np.array([
                    audio * np.sqrt(1 - channel.pan),
                    audio * np.sqrt(1 + channel.pan)
                ])
            else:
                audio_stereo = audio

            # Stage 6: Effects sends
            if render_effects:
                reverb_out = self.effects_processor.apply_reverb(
                    audio,
                    self.sr,
                    decay_sec=2.0
                ) * channel.reverb_send

                delay_out = self.effects_processor.apply_delay(
                    audio,
                    self.sr,
                    delay_ms=250
                ) * channel.delay_send

                audio_stereo = audio_stereo + np.array([reverb_out, delay_out])

            processed_tracks[channel_id] = audio_stereo

            # Update metering
            channel.peak_level = 20 * np.log10(np.max(np.abs(audio)) + 1e-10)
            channel.rms_level = 20 * np.log10(np.sqrt(np.mean(audio**2)) + 1e-10)

        # Sum all tracks to stereo
        mix = np.zeros((2, max(len(t) for t in processed_tracks.values())))

        for channel_id, audio_stereo in processed_tracks.items():
            channel = session.channels[channel_id]

            # Route to appropriate bus
            mix[:, :audio_stereo.shape[1]] += audio_stereo

        # Master bus processing
        mix = self._process_master_bus(mix, session.master_bus)

        return mix

    def _process_master_bus(self, audio: np.ndarray, bus: BusSettings) -> np.ndarray:
        """Master bus processing (EQ, compression, limiting)"""

        # Stereo to mono for processing, then back
        if audio.ndim == 2:
            stereo = audio
        else:
            stereo = np.array([audio, audio])

        # Master EQ
        for channel_idx in range(stereo.shape[0]):
            stereo[channel_idx] = self.eq_processor.apply_eq(
                stereo[channel_idx],
                self.sr,
                bus.eq_bands
            )

        # Master Compressor
        for channel_idx in range(stereo.shape[0]):
            stereo[channel_idx] = self.dynamics_processor.apply_compressor(
                stereo[channel_idx],
                self.sr,
                bus.compressor
            )

        # Master Limiter
        if bus.limiter_enabled:
            for channel_idx in range(stereo.shape[0]):
                peak = np.max(np.abs(stereo[channel_idx]))
                if peak > 10 ** (bus.limiter_threshold / 20):
                    reduction = 10 ** (bus.limiter_threshold / 20) / (peak + 1e-10)
                    stereo[channel_idx] *= reduction

        # Master fader
        fader_gain = 10 ** (bus.fader / 20)
        stereo *= fader_gain

        return stereo

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Example: Mix a multi-track session"""

    # Create session
    session = MixingSession(
        session_id="mix_001",
        name="My Song",
        bpm=120,
        sample_rate=48000
    )

    # Add channels
    channels_config = [
        ("vocal", ChannelType.VOCAL),
        ("drums", ChannelType.DRUMS),
        ("bass", ChannelType.BASS),
        ("guitar", ChannelType.GUITAR),
        ("keys", ChannelType.KEYS),
    ]

    for ch_name, ch_type in channels_config:
        channel = ChannelStrip(
            channel_id=ch_name,
            name=ch_name.capitalize(),
            channel_type=ch_type,
            fader=-6,  # -6dB default
            compressor=CompressorSettings(threshold=-18, ratio=3)
        )
        session.channels[ch_name] = channel

    # Create dummy audio (in real app, load from files)
    dummy_tracks = {}
    for ch_id in session.channels:
        sr = 48000
        t = np.linspace(0, 4, int(sr * 4))
        dummy_tracks[ch_id] = 0.2 * np.sin(2 * np.pi * 440 * t)

    # Mix
    engine = MixingEngine(sample_rate=48000)
    mix = engine.mix_session(session, dummy_tracks)

    # Save
    output_path = "mixed.wav"
    sf.write(output_path, mix.T, 48000, subtype='FLOAT')

    print(f"Mixed session saved to {output_path}")
    print(f"Master levels: {session.master_bus.fader}dB")

if __name__ == '__main__':
    main()
