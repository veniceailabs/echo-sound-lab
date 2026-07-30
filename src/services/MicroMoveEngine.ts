/**
 * MicroMoveEngine — Phase 2C
 * Computes conservative / moderate / aggressive processing variants
 * for a given audio state and detected genre.
 */

import { AudioMetrics, ProcessingConfig, EQSettings } from '../types';
import { GENRE_PROFILES } from './genreProfiles';

export interface MicroMoveResult {
  conservative: ProcessingConfig;
  moderate: ProcessingConfig;
  aggressive: ProcessingConfig;
  confidence: number;
  genre: string;
}

/** Round a number to 0.1 precision */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Clamp a number to [min, max] */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Compute a ProcessingConfig delta fraction (0-1).
 * 0 = no change from current state, 1 = full target.
 */
function interpolateConfig(
  current: AudioMetrics,
  targetLUFS: number,
  targetDynamics: number,
  fraction: number
): ProcessingConfig {
  const currentLUFS = current.lufs?.integrated ?? -14;
  const currentCrest = current.crestFactor ?? 10;

  // LUFS delta → target gain
  const lufsGap = targetLUFS - currentLUFS;
  const gainDb = round1(lufsGap * fraction);

  // Dynamic range delta → compression ratio
  const dynamicsGap = targetDynamics - currentCrest;
  const ratioBase = 2;
  const ratioScale = Math.abs(dynamicsGap) * 0.15 * fraction;
  const ratio = round1(clamp(ratioBase + ratioScale, 1.1, 20));

  // Threshold from LUFS
  const threshold = round1(clamp(currentLUFS - 6 + (lufsGap * fraction * 0.5), -40, -6));

  // EQ moves from spectral balance
  const sb = current.spectralBalance;
  const eqBands: EQSettings = [];

  if (sb) {
    // Low end shaping
    const lowDelta = round1((0.15 - sb.low) * 30 * fraction);
    if (Math.abs(lowDelta) > 0.3) {
      eqBands.push({ frequency: 80, gain: clamp(lowDelta, -6, 6), type: 'lowshelf' });
    }

    // Low-mid boxiness control
    const lowMidDelta = round1((0.2 - sb.lowMid) * 20 * fraction);
    if (Math.abs(lowMidDelta) > 0.3) {
      eqBands.push({ frequency: 300, gain: clamp(lowMidDelta, -4, 4), type: 'peaking' });
    }

    // Presence / high-mid lift
    const highMidDelta = round1((0.18 - sb.highMid) * 20 * fraction);
    if (Math.abs(highMidDelta) > 0.3) {
      eqBands.push({ frequency: 3500, gain: clamp(highMidDelta, -4, 4), type: 'peaking' });
    }

    // High shelf air
    const highDelta = round1((0.12 - sb.high) * 20 * fraction);
    if (Math.abs(highDelta) > 0.3) {
      eqBands.push({ frequency: 10000, gain: clamp(highDelta, -4, 4), type: 'highshelf' });
    }
  }

  const config: ProcessingConfig = {};

  if (Math.abs(gainDb) > 0.1) {
    config.targetGainDb = gainDb;
  }

  if (fraction > 0.1) {
    config.compression = {
      threshold,
      ratio,
      attack: round1(clamp(20 - fraction * 10, 1, 40)),
      release: round1(clamp(150 - fraction * 30, 50, 300)),
      makeupGain: round1(Math.abs(threshold) * 0.2 * fraction),
      knee: 6,
    };
  }

  if (eqBands.length > 0) {
    config.eq = eqBands;
  }

  // Saturation increases with fraction
  const satAmount = round1(clamp(fraction * 12, 0, 25));
  if (satAmount > 1) {
    config.saturation = {
      type: 'tape',
      drive: satAmount,
      wet: round1(clamp(fraction * 0.5, 0, 1)),
      color: 0.3,
    };
  }

  // Limiter always at -1 dBTP
  config.limiter = {
    threshold: -1,
    attack: round1(0.001 + fraction * 0.003),
    release: 0.05,
    enabled: true,
  };

  return config;
}

/**
 * Compute a confidence score (0–1) for the genre match.
 * Based on distance between current metrics and genre profile targets.
 */
function computeConfidence(metrics: AudioMetrics, genreId: string): number {
  const profile = GENRE_PROFILES.find(p => p.id === genreId);
  if (!profile) return 0.5;

  const lufs = metrics.lufs?.integrated ?? -14;
  const targetLUFS = profile.targets.lufsIntegrated.ideal;
  const lufsDist = Math.abs(lufs - targetLUFS);

  const crest = metrics.crestFactor ?? 10;
  const targetDyn = (profile.targets.dynamics.min + profile.targets.dynamics.max) / 2;
  const dynDist = Math.abs(crest - targetDyn);

  // Normalize: LUFS distance 0-20dB → 0-1, dynamics 0-10 → 0-1
  const lufsScore = 1 - clamp(lufsDist / 20, 0, 1);
  const dynScore = 1 - clamp(dynDist / 10, 0, 1);

  // Average
  return round1((lufsScore * 0.6 + dynScore * 0.4) * 100) / 100;
}

/**
 * Main entry point.
 * @param metrics   Current AudioMetrics from analysis
 * @param genre     Detected genre ID (matches genreProfiles id)
 * @returns MicroMoveResult with three variant configs
 */
export function computeMicroMoves(
  metrics: AudioMetrics,
  genre: string
): MicroMoveResult {
  const profile = GENRE_PROFILES.find(p => p.id === genre) || GENRE_PROFILES[0];
  const targetLUFS = profile.targets.lufsIntegrated.ideal;
  const targetDynamics = (profile.targets.dynamics.min + profile.targets.dynamics.max) / 2;
  const confidence = computeConfidence(metrics, genre);

  return {
    conservative: interpolateConfig(metrics, targetLUFS, targetDynamics, 0.5),
    moderate: interpolateConfig(metrics, targetLUFS, targetDynamics, 0.75),
    aggressive: interpolateConfig(metrics, targetLUFS, targetDynamics, 1.0),
    confidence,
    genre: profile.id,
  };
}

export default computeMicroMoves;
