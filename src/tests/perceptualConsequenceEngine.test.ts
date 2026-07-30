import { describe, expect, test } from 'vitest';
import { PerceptualConsequenceEngine } from '../services/finishing/perceptualConsequenceEngine';
import type { APLSignalMetrics } from '../echo-sound-lab/apl/signal-intelligence';
import type { SpectralProfile } from '../services/dsp/SpectralAnalyzer';

describe('PerceptualConsequenceEngine', () => {
  test('maps spectral and dynamic data to device-specific listener risks', () => {
    const metrics: APLSignalMetrics = {
      loudnessLUFS: -13.5,
      loudnessRange: 4.2,
      truePeakDB: -0.9,
      peakLevel: 0.92,
      crestFactor: 9.4,
      spectralCentroid: 4150,
      spectralSpread: 0,
      clippingDetected: false,
      dcOffsetDetected: false,
      silenceDetected: false,
      duration: 180000,
      sampleRate: 48000,
      bitDepth: 24,
    };

    const spectralProfile: SpectralProfile = {
      peakLevel: 0.92,
      truePeakDB: -0.9,
      clippingDetected: false,
      clippingEvents: 0,
      dcOffset: 0,
      dcOffsetDetected: false,
      spectralCentroid: 4150,
      peakFrequency: 2400,
      lowEndEnergy: 0.28,
      hasLowEndRumble: false,
      loudnessLUFS: -13.5,
      crestFactor: 9.4,
      silenceDetected: false,
      sampleRate: 48000,
      duration: 180000,
    };

    const analysis = PerceptualConsequenceEngine.analyze({
      metrics,
      spectralProfile,
      arrangement: {
        sections: [
          { name: 'verse', startTime: 0, endTime: 32, energy: 0.48, density: 0.62, rmsDb: -18, peakDb: -1.2, dynamics: 4.8 },
          { name: 'chorus', startTime: 32, endTime: 64, energy: 0.88, density: 0.8, rmsDb: -12.5, peakDb: -0.7, dynamics: 5.5 },
        ],
        energyCurve: [0.45, 0.52, 0.78, 0.9],
        dynamicRange: 8.5,
        loudestSection: 'chorus',
        quietestSection: 'verse',
        suggestedFocus: ['preserve vocal intelligibility'],
        overallFlow: 'dynamic',
      } as any,
      lowEnd: {
        shouldApply: true,
        verdict: 'needs_translation_work',
        translationValidation: {
          targets: [
            { device: 'iphone', score: 0.55 },
            { device: 'car', score: 0.42 },
            { device: 'earbuds', score: 0.47 },
            { device: 'club', score: 0.51 },
          ],
        },
      } as any,
      phaseCMastering: {
        shouldApply: true,
        verdict: 'needs_polish',
        finalTranslation: {
          targets: [
            { device: 'iphone', score: 0.61 },
            { device: 'car', score: 0.46 },
            { device: 'earbuds', score: 0.5 },
            { device: 'club', score: 0.53 },
          ],
          verdict: 'needs_translation_work',
        },
      } as any,
      vocalProfile: {
        transientSharpness: 0.72,
        breathiness: 0.34,
      } as any,
      sessionNarrative: {
        overallArc: 'building',
      } as any,
    });

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.analysisFingerprint).toHaveLength(8);
    expect(analysis.targets).toHaveLength(4);
    expect(analysis.targets.map((target) => target.system)).toEqual(['iphone', 'car', 'earbuds', 'club']);
    expect(analysis.targets.some((target) => target.riskType === 'fatigue' || target.riskType === 'impact_loss')).toBe(true);
    expect(analysis.summary).toContain('iphone');
    expect(analysis.riskNotes.length).toBeGreaterThan(0);
  });
});
