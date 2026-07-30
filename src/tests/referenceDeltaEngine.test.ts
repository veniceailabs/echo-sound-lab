import { describe, expect, test } from 'vitest';
import { analyzeReferenceDelta } from '../services/finishing/referenceDeltaEngine';
import type { AudioMetrics, MixSignature } from '../types';

const referenceMetrics: AudioMetrics = {
  rms: -18,
  peak: -1.4,
  crestFactor: 9.2,
  spectralCentroid: 2200,
  spectralRolloff: 6800,
  duration: 180,
  spectralBalance: { low: 0.22, lowMid: 0.26, mid: 0.25, highMid: 0.15, high: 0.12 },
  lufs: { integrated: -13.8, shortTerm: -13.4, momentary: -12.9, loudnessRange: 5.8, truePeak: -1.1 },
};

const currentMetrics: AudioMetrics = {
  ...referenceMetrics,
  rms: -16.6,
  crestFactor: 7.4,
  spectralCentroid: 2450,
  lufs: { ...referenceMetrics.lufs!, integrated: -12.9, shortTerm: -12.5, momentary: -12.1, loudnessRange: 4.8, truePeak: -0.4 },
};

const signature = (tone: MixSignature['tonalBalance']): MixSignature => ({
  tonalBalance: tone,
  stereoWidth: { low: 0.4, mid: 0.52, high: 0.58 },
  dynamics: { rms: -16, peak: -0.8, crestFactor: 7.2 },
  character: { brightness: 0.5, warmth: 0.5 },
});

describe('ReferenceDeltaEngine', () => {
  test('produces a deterministic reference delta and recommendation set', () => {
    const result = analyzeReferenceDelta({
      currentMetrics,
      referenceMetrics,
      currentSignature: signature({ low: 0.24, lowMid: 0.24, mid: 0.24, highMid: 0.16, high: 0.12 }),
      referenceSignature: signature({ low: 0.22, lowMid: 0.26, mid: 0.25, highMid: 0.15, high: 0.12 }),
    });

    expect(result.analysisFingerprint).toHaveLength(8);
    expect(result.matchScore).toBeGreaterThanOrEqual(0);
    expect(result.matchScore).toBeLessThanOrEqual(100);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.loudness.delta).toBeGreaterThan(0);
  });
});
