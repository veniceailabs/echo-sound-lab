#!/usr/bin/env python3
"""
Echo Sound Lab — Subjective Analysis Engine (Phase 4)
Detect and fix common audio quality issues like a pro engineer

Detects:
- Mud (too much 200-500 Hz)
- Harsh highs (excessive 3-8 kHz)
- Thin bass (insufficient low end)
- Energy dips (frequency holes)
- Lack of clarity (missing presence peak)
"""

import numpy as np
import librosa
from scipy import signal
from typing import Dict, List, Tuple

class SubjectiveAnalyzer:
    """Analyze audio like a subjective engineer"""

    def __init__(self, sr: int = 44100):
        self.sr = sr

    def detect_issues(self, audio: np.ndarray) -> Dict[str, any]:
        """Comprehensive audio quality analysis"""

        issues = {}

        # 1. Mud detection (200-500 Hz build-up)
        issues['mud'] = self._detect_mud(audio)

        # 2. Harsh highs (3-8 kHz excess)
        issues['harshness'] = self._detect_harshness(audio)

        # 3. Thin bass (lack of sub-bass energy)
        issues['thin_bass'] = self._detect_thin_bass(audio)

        # 4. Energy dips (holes in frequency response)
        issues['energy_dips'] = self._detect_energy_dips(audio)

        # 5. Lack of presence (missing 4-6 kHz)
        issues['lack_of_presence'] = self._detect_lack_of_presence(audio)

        # 6. Lack of clarity (muddy mids)
        issues['lack_of_clarity'] = self._detect_lack_of_clarity(audio)

        # 7. Sibilance (excessive high frequencies from vocals/cymbals)
        issues['sibilance'] = self._detect_sibilance(audio)

        # 8. Pumping/breathing (dynamic envelope issues)
        issues['pumping'] = self._detect_pumping(audio)

        # Priority score (what needs fixing first)
        issues['priority'] = self._calculate_priority(issues)

        return issues

    def _detect_mud(self, audio: np.ndarray) -> Dict:
        """Detect excessive low-mid buildup (200-500 Hz)"""

        # Extract 200-500 Hz band
        sos_low = signal.butter(2, 200, btype='high', fs=self.sr, output='sos')
        sos_high = signal.butter(2, 500, btype='low', fs=self.sr, output='sos')
        mud_band = signal.sosfilt(sos_low, audio)
        mud_band = signal.sosfilt(sos_high, mud_band)

        # Energy in this band
        mud_energy = np.sqrt(np.mean(mud_band ** 2))

        # Compare to overall energy
        overall_energy = np.sqrt(np.mean(audio ** 2))
        mud_ratio = mud_energy / (overall_energy + 1e-10)

        severity = float(np.clip((mud_ratio - 0.1) / 0.15, 0, 1))  # 0-1

        return {
            'severity': severity,
            'recommendation': f"Cut 1-3dB around 250-400Hz to reduce mud" if severity > 0.4 else "Mud levels normal",
            'affected_band': '200-500 Hz',
            'solution': 'surgical EQ cut at 250Hz with high Q'
        }

    def _detect_harshness(self, audio: np.ndarray) -> Dict:
        """Detect excessive presence/sibilance (3-8 kHz)"""

        sos_low = signal.butter(2, 3000, btype='high', fs=self.sr, output='sos')
        sos_high = signal.butter(2, 8000, btype='low', fs=self.sr, output='sos')
        harsh_band = signal.sosfilt(sos_low, audio)
        harsh_band = signal.sosfilt(sos_high, harsh_band)

        harsh_energy = np.sqrt(np.mean(harsh_band ** 2))
        overall_energy = np.sqrt(np.mean(audio ** 2))
        harsh_ratio = harsh_energy / (overall_energy + 1e-10)

        severity = float(np.clip((harsh_ratio - 0.12) / 0.15, 0, 1))

        return {
            'severity': severity,
            'recommendation': f"Cut 1-2dB around 5kHz to reduce harshness" if severity > 0.4 else "Presence balanced",
            'affected_band': '3-8 kHz',
            'solution': 'de-esser or gentle high-mid cut'
        }

    def _detect_thin_bass(self, audio: np.ndarray) -> Dict:
        """Detect insufficient low-end energy"""

        sos = signal.butter(2, 200, btype='low', fs=self.sr, output='sos')
        bass_band = signal.sosfilt(sos, audio)

        bass_energy = np.sqrt(np.mean(bass_band ** 2))
        overall_energy = np.sqrt(np.mean(audio ** 2))
        bass_ratio = bass_energy / (overall_energy + 1e-10)

        # Hit records typically have 8-15% energy in bass
        target_ratio = 0.10
        severity = float(np.clip((target_ratio - bass_ratio) / 0.08, 0, 1))

        return {
            'severity': severity,
            'recommendation': f"Boost 1-2dB around 60-100Hz to add bass weight" if severity > 0.4 else "Bass weight good",
            'affected_band': 'Sub-bass / Bass (20-200 Hz)',
            'solution': 'gentle bass boost or saturation for perceived fullness'
        }

    def _detect_energy_dips(self, audio: np.ndarray) -> Dict:
        """Detect frequency holes/dips"""

        D = librosa.stft(audio)
        S = np.abs(D) ** 2
        freqs = librosa.fft_frequencies(sr=self.sr)

        # Get average energy per frequency
        freq_energy = np.mean(S, axis=1)
        freq_energy_db = 10 * np.log10(freq_energy + 1e-10)

        # Smooth it
        smoothed = np.convolve(freq_energy_db, np.ones(10) / 10, mode='same')

        # Find dips (deviation below smooth curve)
        dips = smoothed - freq_energy_db
        dip_severity = np.max(dips) if len(dips) > 0 else 0

        # Normalize 0-1 (anything > 10dB is bad)
        severity = float(np.clip(dip_severity / 10, 0, 1))

        # Find where the dips are
        dip_frequencies = freqs[np.argsort(-dips)[:3]]  # Top 3 problem frequencies

        return {
            'severity': severity,
            'recommendation': f"Fill dips at {dip_frequencies}Hz with gentle EQ boost" if severity > 0.3 else "Frequency response smooth",
            'problem_frequencies': [float(f) for f in dip_frequencies],
            'solution': 'parametric EQ boosts at problem frequencies'
        }

    def _detect_lack_of_presence(self, audio: np.ndarray) -> Dict:
        """Detect missing presence peak (4-6 kHz)"""

        sos_low = signal.butter(2, 4000, btype='high', fs=self.sr, output='sos')
        sos_high = signal.butter(2, 6000, btype='low', fs=self.sr, output='sos')
        presence_band = signal.sosfilt(sos_low, audio)
        presence_band = signal.sosfilt(sos_high, presence_band)

        presence_energy = np.sqrt(np.mean(presence_band ** 2))
        overall_energy = np.sqrt(np.mean(audio ** 2))
        presence_ratio = presence_energy / (overall_energy + 1e-10)

        # Hit records have 8-12% in presence band
        target_ratio = 0.10
        severity = float(np.clip((target_ratio - presence_ratio) / 0.08, 0, 1))

        return {
            'severity': severity,
            'recommendation': f"Add 2-3dB presence peak at 5kHz for punch" if severity > 0.4 else "Presence peak present",
            'affected_band': '4-6 kHz (Presence)',
            'solution': 'boost 5kHz with moderate Q for clarity'
        }

    def _detect_lack_of_clarity(self, audio: np.ndarray) -> Dict:
        """Detect muddy/cloudy character"""

        # Low clarity = too much energy below 1kHz relative to above 4kHz
        sos_low = signal.butter(2, 1000, btype='low', fs=self.sr, output='sos')
        low_band = signal.sosfilt(sos_low, audio)
        low_energy = np.sqrt(np.mean(low_band ** 2))

        sos_high = signal.butter(2, 4000, btype='high', fs=self.sr, output='sos')
        high_band = signal.sosfilt(sos_high, audio)
        high_energy = np.sqrt(np.mean(high_band ** 2))

        clarity_ratio = high_energy / (low_energy + 1e-10)
        target_ratio = 0.7  # High frequencies should be ~70% of lows in clarity

        severity = float(np.clip((target_ratio - clarity_ratio) / 0.3, 0, 1))

        return {
            'severity': severity,
            'recommendation': f"Reduce lows or boost highs for clarity" if severity > 0.4 else "Clarity good",
            'low_to_high_ratio': float(low_energy / (high_energy + 1e-10)),
            'solution': 'high-pass filter around 80Hz or presence peak boost'
        }

    def _detect_sibilance(self, audio: np.ndarray) -> Dict:
        """Detect excessive sibilance from vocals or cymbals (6-12 kHz)"""

        sos_low = signal.butter(2, 6000, btype='high', fs=self.sr, output='sos')
        sos_high = signal.butter(2, 12000, btype='low', fs=self.sr, output='sos')
        sibilance_band = signal.sosfilt(sos_low, audio)
        sibilance_band = signal.sosfilt(sos_high, sibilance_band)

        sibi_energy = np.sqrt(np.mean(sibilance_band ** 2))
        overall_energy = np.sqrt(np.mean(audio ** 2))
        sibi_ratio = sibi_energy / (overall_energy + 1e-10)

        severity = float(np.clip((sibi_ratio - 0.05) / 0.08, 0, 1))

        return {
            'severity': severity,
            'recommendation': f"De-esser or gentle cut at 8kHz for sibilants" if severity > 0.4 else "Sibilance controlled",
            'affected_band': '6-12 kHz (Sibilance)',
            'solution': 'de-esser with 4-6kHz detection band'
        }

    def _detect_pumping(self, audio: np.ndarray) -> Dict:
        """Detect dynamic compression artifacts (pumping/breathing)"""

        # Analyze RMS envelope
        frame_length = 2048
        hop_length = 512
        rms = librosa.feature.rms(y=audio, frame_length=frame_length, hop_length=hop_length)[0]

        # Detect sudden drops (compression pumping)
        rms_diff = np.diff(rms)
        sudden_drops = np.sum(rms_diff < -0.05)  # Sudden RMS drops

        total_frames = len(rms)
        pumping_ratio = sudden_drops / (total_frames + 1e-10)

        severity = float(np.clip(pumping_ratio / 0.1, 0, 1))

        return {
            'severity': severity,
            'pumping_instances': int(sudden_drops),
            'recommendation': f"Increase compression attack time or reduce ratio" if severity > 0.3 else "Compression transparent",
            'solution': 'slower attack (20-50ms) or lower compression ratio'
        }

    def _calculate_priority(self, issues: Dict) -> List[Tuple[str, float]]:
        """
        Calculate which SIGNIFICANT issues to fix first (by impact)

        IMPORTANT: Only report issues with severity > 0.2
        Minor issues (< 0.2) are normal in real audio and don't need fixing
        """

        priority_order = [
            'mud',
            'thin_bass',
            'lack_of_presence',
            'harshness',
            'sibilance',
            'lack_of_clarity',
            'energy_dips',
            'pumping',
        ]

        scored = []
        for issue_name in priority_order:
            if issue_name in issues:
                severity = issues[issue_name].get('severity', 0)
                # ONLY include CRITICAL issues (severity > 0.75)
                # Below 0.75 = within acceptable range for processed audio
                # Professional mastering doesn't waste effort on minor issues
                if severity > 0.75:
                    scored.append((issue_name, severity))

        # Sort by severity (highest first)
        return sorted(scored, key=lambda x: x[1], reverse=True)


class AutoFixer:
    """Automatically fix detected audio issues"""

    def __init__(self, sr: int = 44100):
        self.sr = sr
        self.analyzer = SubjectiveAnalyzer(sr)

    def auto_fix(self, audio: np.ndarray, intensity: float = 0.8) -> Tuple[np.ndarray, Dict]:
        """
        Auto-fix audio quality issues

        Args:
            audio: Input audio
            intensity: How aggressively to fix (0-1)

        Returns:
            (Fixed audio, Issues detected)
        """

        issues = self.analyzer.detect_issues(audio)
        fixed = audio.copy()

        # Apply fixes in priority order
        for issue_name, severity in issues['priority']:
            if severity < 0.2:  # Skip minor issues
                continue

            if issue_name == 'mud':
                fixed = self._fix_mud(fixed, severity, intensity)
            elif issue_name == 'thin_bass':
                fixed = self._fix_thin_bass(fixed, severity, intensity)
            elif issue_name == 'lack_of_presence':
                fixed = self._fix_lack_of_presence(fixed, severity, intensity)
            elif issue_name == 'harshness':
                fixed = self._fix_harshness(fixed, severity, intensity)
            elif issue_name == 'sibilance':
                fixed = self._fix_sibilance(fixed, severity, intensity)
            elif issue_name == 'lack_of_clarity':
                fixed = self._fix_lack_of_clarity(fixed, severity, intensity)

        return fixed, issues

    def _fix_mud(self, audio: np.ndarray, severity: float, intensity: float) -> np.ndarray:
        """Cut muddiness (250 Hz region)"""
        cut_amount = severity * intensity * 2.0  # Up to 2dB
        q = 2.0  # Surgical Q

        # Design EQ filter
        freq = 250
        w0 = 2 * np.pi * freq / self.sr
        alpha = np.sin(w0) / (2 * q)

        b = [1 - alpha, -2 * np.cos(w0), 1 + alpha]  # Peaking EQ
        a = [1 + alpha, -2 * np.cos(w0), 1 - alpha]

        # Reduce gain
        gain_db = -cut_amount
        gain_linear = 10 ** (gain_db / 20)
        b = [coef * gain_linear for coef in b]

        return signal.lfilter(b, a, audio)

    def _fix_thin_bass(self, audio: np.ndarray, severity: float, intensity: float) -> np.ndarray:
        """Boost bass (60-100 Hz)"""
        boost_amount = severity * intensity * 2.0  # Up to 2dB

        freq = 80
        q = 0.7  # Wider Q for bass
        w0 = 2 * np.pi * freq / self.sr
        alpha = np.sin(w0) / (2 * q)

        # Peaking boost
        gain_db = boost_amount
        gain_linear = 10 ** (gain_db / 20)

        b = [(1 + alpha * gain_linear), -2 * np.cos(w0), (1 - alpha * gain_linear)]
        a = [1 + alpha / gain_linear, -2 * np.cos(w0), 1 - alpha / gain_linear]

        return signal.lfilter(b, a, audio)

    def _fix_lack_of_presence(self, audio: np.ndarray, severity: float, intensity: float) -> np.ndarray:
        """Boost presence (5 kHz)"""
        boost_amount = severity * intensity * 3.0  # Up to 3dB

        freq = 5000
        q = 1.5
        w0 = 2 * np.pi * freq / self.sr
        alpha = np.sin(w0) / (2 * q)

        gain_db = boost_amount
        gain_linear = 10 ** (gain_db / 20)

        b = [(1 + alpha * gain_linear), -2 * np.cos(w0), (1 - alpha * gain_linear)]
        a = [1 + alpha / gain_linear, -2 * np.cos(w0), 1 - alpha / gain_linear]

        return signal.lfilter(b, a, audio)

    def _fix_harshness(self, audio: np.ndarray, severity: float, intensity: float) -> np.ndarray:
        """Cut harshness (5-8 kHz region)"""
        cut_amount = severity * intensity * 1.5  # Up to 1.5dB

        freq = 6000
        q = 1.0
        w0 = 2 * np.pi * freq / self.sr
        alpha = np.sin(w0) / (2 * q)

        gain_db = -cut_amount
        gain_linear = 10 ** (gain_db / 20)

        b = [1 - alpha, -2 * np.cos(w0), 1 + alpha]
        a = [1 + alpha, -2 * np.cos(w0), 1 - alpha]
        b = [coef * gain_linear for coef in b]

        return signal.lfilter(b, a, audio)

    def _fix_sibilance(self, audio: np.ndarray, severity: float, intensity: float) -> np.ndarray:
        """De-esser (8-10 kHz reduction)"""
        cut_amount = severity * intensity * 1.5

        freq = 9000
        q = 2.0
        w0 = 2 * np.pi * freq / self.sr
        alpha = np.sin(w0) / (2 * q)

        gain_db = -cut_amount
        gain_linear = 10 ** (gain_db / 20)

        b = [1 - alpha, -2 * np.cos(w0), 1 + alpha]
        a = [1 + alpha, -2 * np.cos(w0), 1 - alpha]
        b = [coef * gain_linear for coef in b]

        return signal.lfilter(b, a, audio)

    def _fix_lack_of_clarity(self, audio: np.ndarray, severity: float, intensity: float) -> np.ndarray:
        """High-pass filter to add clarity"""
        cutoff = 60  # High-pass at 60 Hz

        sos = signal.butter(2, cutoff, btype='high', fs=self.sr, output='sos')
        return signal.sosfilt(sos, audio)
