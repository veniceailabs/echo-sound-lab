import { describe, expect, test } from 'vitest';
import { qualityAssurance } from '../services/qualityAssurance';
import type { AudioMetrics } from '../types';

function makeMetrics(overrides: Partial<AudioMetrics> = {}): AudioMetrics {
  return {
    rms: -18,
    peak: -1.2,
    crestFactor: 7,
    spectralCentroid: 2200,
    spectralRolloff: 8200,
    duration: 180,
    lufs: {
      integrated: -14,
      shortTerm: -13,
      momentary: -12,
      loudnessRange: 8,
      truePeak: -1,
    },
    advancedMetrics: {
      monoCompatibility: 88,
      phaseCoherence: 86,
      stereoWidth: 72,
      stereoImbalance: 0.4,
    },
    ...overrides,
  };
}

describe('QualityAssurance', () => {
  test('flags phase-related artifacts from diagnostic metrics', () => {
    const artifacts = qualityAssurance.detectArtifacts(
      makeMetrics({
        advancedMetrics: {
          monoCompatibility: 38,
          phaseCoherence: 31,
          stereoWidth: 92,
          stereoImbalance: 4.1,
        },
      })
    );

    expect(artifacts.some((item) => item.includes('mono-compatibility'))).toBe(true);
    expect(artifacts.some((item) => item.includes('Phase coherence'))).toBe(true);
    expect(artifacts.some((item) => item.includes('Stereo imbalance'))).toBe(true);
    expect(artifacts.some((item) => item.includes('mono compatibility'))).toBe(true);
  });

  test('keeps well-behaved stereo material clean', () => {
    const artifacts = qualityAssurance.detectArtifacts(makeMetrics());
    expect(artifacts).toEqual([]);
  });
});
