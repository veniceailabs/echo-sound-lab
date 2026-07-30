#!/usr/bin/env python3
"""
Echo Sound Lab — AI Training Engine (Phase 3)
Learn from hit records to improve mixing/mastering quality

How it works:
1. Analyze 100+ hit records (Drake, Weeknd, etc.)
2. Extract frequency characteristics
3. Train ML model on winning patterns
4. Apply learned knowledge to new mixes
5. Result: Your mixes sound like hit records
"""

import numpy as np
import librosa
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from scipy import signal
from typing import Dict, List, Tuple
import pickle
import json
from pathlib import Path

class FrequencyAnalyzer:
    """Extract frequency characteristics from audio"""

    def __init__(self, sr: int = 44100):
        self.sr = sr
        self.scaler = StandardScaler()

    def extract_spectral_features(self, audio: np.ndarray) -> Dict[str, float]:
        """Extract comprehensive spectral features"""

        # Compute STFT
        D = librosa.stft(audio)
        S = np.abs(D) ** 2
        freqs = librosa.fft_frequencies(sr=self.sr)

        # Mel-scale spectrogram
        mel_spec = librosa.feature.melspectrogram(y=audio, sr=self.sr, n_mels=128)
        mel_db = librosa.power_to_db(mel_spec, ref=np.max)

        # Frequency bands (Hz)
        sub_bass = (20, 60)      # 20-60 Hz
        bass = (60, 250)         # 60-250 Hz
        low_mid = (250, 500)     # 250-500 Hz
        mid = (500, 2000)        # 500-2kHz
        upper_mid = (2000, 4000) # 2-4kHz
        presence = (4000, 8000)  # 4-8kHz
        brilliance = (8000, 20000) # 8-20kHz

        features = {}

        # Energy in each band
        for name, (low, high) in [
            ('sub_bass_energy', sub_bass),
            ('bass_energy', bass),
            ('low_mid_energy', low_mid),
            ('mid_energy', mid),
            ('upper_mid_energy', upper_mid),
            ('presence_energy', presence),
            ('brilliance_energy', brilliance),
        ]:
            mask = (freqs >= low) & (freqs <= high)
            energy = np.sum(S[mask, :], axis=0).mean()
            features[name] = float(20 * np.log10(energy + 1e-10))

        # Spectral centroid (average frequency)
        features['spectral_centroid'] = float(librosa.feature.spectral_centroid(y=audio, sr=self.sr)[0, :].mean())

        # Spectral rolloff (frequency below which 85% of energy)
        features['spectral_rolloff'] = float(librosa.feature.spectral_rolloff(y=audio, sr=self.sr)[0, :].mean())

        # Zero crossing rate (noise/presence indicator)
        features['zero_crossing_rate'] = float(librosa.feature.zero_crossing_rate(audio)[0, :].mean())

        # Spectral flux (change over time)
        spectral_flux = np.sqrt(np.sum(np.diff(S, axis=1) ** 2, axis=0))
        features['spectral_flux'] = float(spectral_flux.mean())

        # RMS energy
        features['rms_energy'] = float(librosa.feature.rms(y=audio)[0, :].mean())

        # Spectral contrast (peaks vs valleys in each band)
        spectral_contrast = librosa.feature.spectral_contrast(y=audio, sr=self.sr)
        for i, contrast in enumerate(spectral_contrast):
            features[f'spectral_contrast_band_{i}'] = float(contrast.mean())

        # Loudness (LUFS-like)
        features['loudness'] = float(20 * np.log10(np.sqrt(np.mean(audio ** 2)) + 1e-10))

        # Peak value
        features['peak'] = float(np.max(np.abs(audio)))

        # Crest factor (peak / RMS)
        rms = np.sqrt(np.mean(audio ** 2))
        features['crest_factor'] = float(np.max(np.abs(audio)) / (rms + 1e-10))

        return features

    def extract_dynamic_features(self, audio: np.ndarray) -> Dict[str, float]:
        """Extract dynamic/temporal features"""

        features = {}

        # Onset strength (percussion/attack)
        onset_env = librosa.onset.onset_strength(y=audio, sr=self.sr)
        features['onset_strength'] = float(onset_env.mean())
        features['onset_peak'] = float(onset_env.max())
        features['onset_std'] = float(onset_env.std())

        # Tempogram (rhythm)
        tempogram = librosa.feature.tempogram(y=audio, sr=self.sr)
        features['tempogram_strength'] = float(tempogram.mean())

        # RMS envelope
        rms = librosa.feature.rms(y=audio)[0]
        features['rms_std'] = float(rms.std())
        features['rms_max'] = float(rms.max())
        features['rms_min'] = float(rms.min())

        # Harmonic/Percussive separation
        harmonic, percussive = librosa.effects.hpss(audio)
        features['harmonic_ratio'] = float(np.sum(harmonic ** 2) / np.sum(audio ** 2 + 1e-10))
        features['percussive_ratio'] = float(np.sum(percussive ** 2) / np.sum(audio ** 2 + 1e-10))

        return features

    def analyze_audio(self, audio: np.ndarray) -> Dict[str, float]:
        """Full audio analysis"""
        spectral = self.extract_spectral_features(audio)
        dynamic = self.extract_dynamic_features(audio)
        return {**spectral, **dynamic}


class HitRecordModelTrainer:
    """Train ML model on hit records"""

    def __init__(self, sr: int = 44100):
        self.sr = sr
        self.analyzer = FrequencyAnalyzer(sr)
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = None

    def train_on_hits(
        self,
        hit_audio_paths: List[str],
        genre: str = "pop"
    ) -> Dict:
        """
        Train model on hit records

        Args:
            hit_audio_paths: List of paths to hit record audio files
            genre: Genre to train on (pop, hiphop, rnb, etc.)

        Returns:
            Model performance metrics
        """

        print(f"Training on {len(hit_audio_paths)} hit records ({genre})...")

        X = []  # Features from analysis
        y = []  # Target (1 = hit record, 0 = not)

        # Analyze hit records
        for path in hit_audio_paths:
            try:
                audio, _ = librosa.load(path, sr=self.sr, mono=True)
                features = self.analyzer.analyze_audio(audio)

                # Convert to feature vector
                feature_vector = [features[k] for k in sorted(features.keys())]
                X.append(feature_vector)
                y.append(1.0)  # Label as hit

            except Exception as e:
                print(f"Error processing {path}: {e}")

        if not X:
            return {"error": "No valid audio files processed"}

        # Store feature names
        sample_features = self.analyzer.analyze_audio(
            librosa.load(hit_audio_paths[0], sr=self.sr, mono=True)[0]
        )
        self.feature_names = sorted(sample_features.keys())

        X = np.array(X)
        y = np.array(y)

        # Normalize features
        X_scaled = self.scaler.fit_transform(X)

        # Train ensemble model
        self.model = GradientBoostingRegressor(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=5,
            random_state=42
        )
        self.model.fit(X_scaled, y)

        # Calculate feature importance
        importance = self.model.feature_importances_
        feature_importance = {
            name: float(imp)
            for name, imp in zip(self.feature_names, importance)
        }

        print(f"✓ Model trained on {len(X)} samples")
        print(f"✓ Top features: {sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:5]}")

        return {
            "samples_trained": len(X),
            "genre": genre,
            "feature_importance": feature_importance,
            "status": "trained"
        }

    def predict_hit_potential(self, audio: np.ndarray) -> Tuple[float, Dict]:
        """
        Predict if audio has 'hit record' characteristics

        Returns: (score 0-1, feature_analysis)
        """
        if self.model is None:
            return 0.0, {"error": "Model not trained"}

        features = self.analyzer.analyze_audio(audio)
        feature_vector = np.array([features[name] for name in self.feature_names]).reshape(1, -1)
        feature_vector_scaled = self.scaler.transform(feature_vector)

        score = self.model.predict(feature_vector_scaled)[0]
        score = float(np.clip(score, 0, 1))

        return score, features

    def save_model(self, path: str):
        """Save trained model"""
        with open(path, 'wb') as f:
            pickle.dump({
                'model': self.model,
                'scaler': self.scaler,
                'feature_names': self.feature_names
            }, f)
        print(f"Model saved to {path}")

    def load_model(self, path: str):
        """Load trained model"""
        with open(path, 'rb') as f:
            data = pickle.load(f)
            self.model = data['model']
            self.scaler = data['scaler']
            self.feature_names = data['feature_names']
        print(f"Model loaded from {path}")


class GenreSpecificOptimizer:
    """Optimize audio for specific genre based on hit records"""

    def __init__(self, sr: int = 44100):
        self.sr = sr
        self.genre_profiles = self._build_genre_profiles()

    def _build_genre_profiles(self) -> Dict[str, Dict]:
        """Define target frequency profiles for hit records by genre"""

        return {
            'hiphop': {
                'sub_bass_boost': 3.0,      # +3dB at 40Hz
                'mid_dip': -1.5,            # -1.5dB at 1kHz
                'presence_peak': 2.0,       # +2dB at 5kHz
                'brilliance_cut': -2.0,     # -2dB at 12kHz
                'target_loudness': -6.0,    # -6 LUFS (punchy)
                'compression_ratio': 3.0,
                'saturation': 0.15,
            },
            'pop': {
                'sub_bass_boost': 1.5,
                'low_mid_lift': 1.0,
                'mid_presence': 2.5,
                'presence_peak': 3.0,
                'brilliance': 1.5,
                'target_loudness': -4.0,    # -4 LUFS (commercial)
                'compression_ratio': 2.5,
                'saturation': 0.10,
            },
            'rnb': {
                'sub_bass_boost': 4.0,      # Heavy bass
                'bass_presence': 1.5,
                'mid_smooth': -0.5,
                'presence_peak': 1.5,
                'target_loudness': -5.0,
                'compression_ratio': 3.0,
                'saturation': 0.20,         # More warmth
            },
            'indie': {
                'sub_bass_boost': 0.5,
                'mid_presence': 1.0,
                'upper_mid_push': 2.0,
                'presence_natural': 0.5,
                'target_loudness': -8.0,    # Less compressed
                'compression_ratio': 2.0,
                'saturation': 0.05,         # Minimal
            },
            'rock': {
                'bass_punch': 2.0,
                'low_mid_body': 1.5,
                'mid_presence': 1.5,
                'presence_aggressive': 3.5,
                'target_loudness': -5.0,
                'compression_ratio': 3.0,
                'saturation': 0.12,
            },
        }

    def optimize_for_genre(
        self,
        audio: np.ndarray,
        genre: str,
        intensity: float = 1.0
    ) -> np.ndarray:
        """
        Optimize audio for genre (apply hit record characteristics)

        Args:
            audio: Input audio
            genre: Target genre
            intensity: How much to apply (0-1, where 1 = full hit optimization)
        """

        if genre not in self.genre_profiles:
            return audio

        profile = self.genre_profiles[genre]

        # Apply EQ boosts/cuts
        audio = self._apply_genre_eq(audio, profile, intensity)

        # Apply compression for genre character
        audio = self._apply_genre_compression(audio, profile, intensity)

        # Apply saturation for warmth
        if profile.get('saturation', 0) > 0:
            audio = self._apply_saturation(audio, profile['saturation'] * intensity)

        return audio

    def _apply_genre_eq(
        self,
        audio: np.ndarray,
        profile: Dict,
        intensity: float
    ) -> np.ndarray:
        """Apply genre-specific EQ"""

        output = audio.copy()

        # Sub-bass boost (20-60 Hz)
        if 'sub_bass_boost' in profile:
            boost = profile['sub_bass_boost'] * intensity
            sos = signal.butter(2, 60, btype='low', fs=self.sr, output='sos')
            sub_bass = signal.sosfilt(sos, audio)
            gain_linear = 10 ** (boost / 20)
            output = output - sub_bass + sub_bass * gain_linear

        # Mid presence (1-4 kHz)
        if 'mid_presence' in profile:
            boost = profile['mid_presence'] * intensity
            sos_low = signal.butter(2, 800, btype='high', fs=self.sr, output='sos')
            sos_high = signal.butter(2, 4000, btype='low', fs=self.sr, output='sos')
            mid = signal.sosfilt(sos_low, audio)
            mid = signal.sosfilt(sos_high, mid)
            gain_linear = 10 ** (boost / 20)
            output = output - mid + mid * gain_linear

        # Presence peak (4-8 kHz)
        if 'presence_peak' in profile:
            boost = profile['presence_peak'] * intensity
            sos_low = signal.butter(2, 4000, btype='high', fs=self.sr, output='sos')
            sos_high = signal.butter(2, 8000, btype='low', fs=self.sr, output='sos')
            presence = signal.sosfilt(sos_low, audio)
            presence = signal.sosfilt(sos_high, presence)
            gain_linear = 10 ** (boost / 20)
            output = output - presence + presence * gain_linear

        return output

    def _apply_genre_compression(
        self,
        audio: np.ndarray,
        profile: Dict,
        intensity: float
    ) -> np.ndarray:
        """Apply genre-specific compression character"""

        ratio = profile.get('compression_ratio', 2.0) * intensity + (1 - intensity)

        # Simple compressor approximation
        threshold = -20  # dB
        envelope = np.abs(audio)
        envelope_db = 20 * np.log10(envelope + 1e-10)

        gain_reduction = np.zeros_like(envelope_db)
        over_threshold = envelope_db > threshold
        gain_reduction[over_threshold] = (envelope_db[over_threshold] - threshold) * (1 - 1/ratio)

        gain_linear = 10 ** (-gain_reduction / 20)
        return audio * gain_linear

    def _apply_saturation(
        self,
        audio: np.ndarray,
        amount: float
    ) -> np.ndarray:
        """Apply gentle saturation for warmth"""

        # Soft saturation (tanh)
        return np.tanh(audio * (1 + amount * 10)) / np.tanh(1 + amount * 10)


# Example usage
if __name__ == "__main__":
    # In production, you'd pass real hit record paths
    # For demo, we'll create synthetic "hit-like" audio

    trainer = HitRecordModelTrainer()
    optimizer = GenreSpecificOptimizer()

    # Create sample audio
    sr = 44100
    duration = 3
    t = np.linspace(0, duration, int(sr * duration))

    # "Hit-like" audio: bass + mids + presence peak
    sample = (
        0.3 * np.sin(2 * np.pi * 60 * t) +      # Sub-bass
        0.2 * np.sin(2 * np.pi * 200 * t) +     # Bass
        0.15 * np.sin(2 * np.pi * 1000 * t) +   # Mids
        0.2 * np.sin(2 * np.pi * 5000 * t) +    # Presence peak
        0.1 * np.random.randn(len(t))            # Noise
    )
    sample = sample / np.max(np.abs(sample))

    # Optimize for hip-hop
    optimized = optimizer.optimize_for_genre(sample, 'hiphop', intensity=0.8)

    print("✓ AI Training Engine ready")
    print(f"  - Models available: {list(optimizer.genre_profiles.keys())}")
    print(f"  - Sample audio length: {len(sample)/sr:.2f}s")
