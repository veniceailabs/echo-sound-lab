/**
 * AestheticClassifierService — Phase 2A
 * Genre scoring via weighted distance from audio metrics to genre profile targets
 */

import { AudioMetrics, ProcessingConfig, EQSettings } from '../types';
import { GENRE_PROFILES, GenreProfile } from './genreProfiles';

export interface GenreScore {
  genreId: string;
  genreName: string;
  confidence: number; // 0–1
  distance: number;   // lower = closer match
}

export interface ParametricRecommendation {
  eqMoves: Array<{
    frequency: number;
    gain: number;
    q: number;
    type: string;
    rationale: string;
  }>;
  compression: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    rationale: string;
  };
  confidence: number;
  advisory: boolean; // true when confidence < 0.4
}

export interface AestheticClassification {
  topGenres: GenreScore[];
  primaryGenre: GenreScore;
  recommendation: ParametricRecommendation;
  analysisContext: string;
}

/** Softmax over raw distances → confidences */
function softmax(distances: number[]): number[] {
  // Invert: lower distance = higher score
  const maxD = Math.max(...distances);
  const scores = distances.map(d => Math.exp(-(d / (maxD + 0.001)) * 3));
  const sum = scores.reduce((a, b) => a + b, 0);
  return scores.map(s => s / (sum + 1e-10));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute weighted distance between metrics and a genre profile.
 * Lower = better match.
 */
function computeDistance(metrics: AudioMetrics, profile: GenreProfile): number {
  const lufs = metrics.lufs?.integrated ?? -14;
  const stereoWidth = metrics.advancedMetrics?.stereoWidth ?? 60;
  const phaseCoherence = metrics.advancedMetrics?.phaseCoherence ?? 80;
  const crest = metrics.crestFactor ?? 10;
  const sb = metrics.spectralBalance;

  // LUFS distance (weight 0.30)
  const lufsD = Math.abs(lufs - profile.targets.lufsIntegrated.ideal);

  // Spectral centroid distance (weight 0.25) — approximate via spectral balance
  let spectralD = 0;
  if (sb) {
    const isHigh = profile.targets.highEnd.brightness === 'bright';
    const isDark = profile.targets.highEnd.brightness === 'dark';
    const targetHighRatio = isHigh ? 0.15 : isDark ? 0.06 : 0.10;
    spectralD = Math.abs(sb.high - targetHighRatio) * 40;
  }

  // Dynamic range distance (weight 0.20)
  const dynIdeal = (profile.targets.dynamics.min + profile.targets.dynamics.max) / 2;
  const dynD = Math.abs(crest - dynIdeal);

  // Stereo width distance (weight 0.15)
  const widthIdeal = (profile.targets.stereoWidth.narrow + profile.targets.stereoWidth.wide) / 2;
  const widthD = Math.abs(stereoWidth - widthIdeal) / 10;

  // Phase coherence distance (weight 0.10)
  const phaseTarget = profile.targets.stereoWidth.narrow > 60 ? 85 : 70;
  const phaseD = Math.abs(phaseCoherence - phaseTarget) / 10;

  return (
    lufsD * 0.30 +
    spectralD * 0.25 +
    dynD * 0.20 +
    widthD * 0.15 +
    phaseD * 0.10
  );
}

/**
 * Build parametric EQ + compression recommendations from the top genre profile
 */
function buildRecommendation(
  metrics: AudioMetrics,
  profile: GenreProfile,
  confidence: number
): ParametricRecommendation {
  const lufs = metrics.lufs?.integrated ?? -14;
  const sb = metrics.spectralBalance;
  const advisory = confidence < 0.4;

  const eqMoves: ParametricRecommendation['eqMoves'] = [];

  if (sb) {
    // Sub / low-end
    const targetLowEmphasis = profile.targets.lowEnd.emphasis;
    const expectedLow = targetLowEmphasis === 'heavy' ? 0.18 : targetLowEmphasis === 'light' ? 0.10 : 0.14;
    const lowDelta = round1((expectedLow - sb.low) * 24);
    if (Math.abs(lowDelta) > 0.5) {
      eqMoves.push({
        frequency: profile.targets.lowEnd.subFreq,
        gain: clamp(lowDelta, -6, 6),
        q: 0.7,
        type: 'lowshelf',
        rationale: `${profile.name} targets ${targetLowEmphasis} low-end at ${profile.targets.lowEnd.subFreq}Hz`,
      });
    }

    // Presence
    const targetBright = profile.targets.highEnd.brightness;
    const expectedHighMid = targetBright === 'bright' ? 0.16 : targetBright === 'dark' ? 0.10 : 0.13;
    const presenceDelta = round1((expectedHighMid - sb.highMid) * 20);
    if (Math.abs(presenceDelta) > 0.5) {
      eqMoves.push({
        frequency: 4000,
        gain: clamp(presenceDelta, -4, 4),
        q: 1.4,
        type: 'peaking',
        rationale: `${profile.name} presence character`,
      });
    }

    // Air
    const expectedHigh = targetBright === 'bright' ? 0.14 : targetBright === 'dark' ? 0.06 : 0.10;
    const airDelta = round1((expectedHigh - sb.high) * 20);
    if (Math.abs(airDelta) > 0.5) {
      eqMoves.push({
        frequency: profile.targets.highEnd.airFreq,
        gain: clamp(airDelta, -4, 4),
        q: 0.7,
        type: 'highshelf',
        rationale: `${profile.name} air shelf target`,
      });
    }
  }

  // Compression
  const dynIdeal = (profile.targets.dynamics.min + profile.targets.dynamics.max) / 2;
  const currentDyn = metrics.crestFactor ?? 10;
  const needsCompression = currentDyn > dynIdeal + 2;

  const threshold = round1(clamp(lufs - 4, -32, -8));
  const ratio = needsCompression
    ? round1(clamp(1 + (currentDyn - dynIdeal) * 0.4, 1.5, 8))
    : 1.5;

  return {
    eqMoves,
    compression: {
      threshold,
      ratio,
      attack: round1(clamp(10 - confidence * 5, 2, 20)),
      release: round1(clamp(100 + confidence * 50, 60, 250)),
      rationale: `${profile.name}: target dynamics ${dynIdeal.toFixed(1)}dB range`,
    },
    confidence: round1(confidence * 100) / 100,
    advisory,
  };
}

export class AestheticClassifierService {
  /**
   * Classify audio aesthetics and return genre match + parametric recommendations
   */
  async classify(buffer: AudioBuffer, metrics: AudioMetrics): Promise<AestheticClassification> {
    // Compute distance for each genre profile
    const scored = GENRE_PROFILES.map(profile => ({
      profile,
      distance: computeDistance(metrics, profile),
    }));

    // Sort by distance ascending
    scored.sort((a, b) => a.distance - b.distance);

    // Softmax over top genres
    const top3 = scored.slice(0, 3);
    const confidences = softmax(top3.map(s => s.distance));

    const topGenres: GenreScore[] = top3.map((s, i) => ({
      genreId: s.profile.id,
      genreName: s.profile.name,
      confidence: round1(confidences[i] * 100) / 100,
      distance: round1(s.distance * 10) / 10,
    }));

    const primaryGenre = topGenres[0];
    const primaryProfile = top3[0].profile;

    const recommendation = buildRecommendation(metrics, primaryProfile, primaryGenre.confidence);

    return {
      topGenres,
      primaryGenre,
      recommendation,
      analysisContext: primaryProfile.analysisContext,
    };
  }
}

export const aestheticClassifier = new AestheticClassifierService();
export default aestheticClassifier;
