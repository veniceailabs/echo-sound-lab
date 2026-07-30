import { describe, expect, it } from 'vitest';
import { analyzeEliteMixingAdvisor } from '../services/finishing/eliteMixingAdvisor';

describe('analyzeEliteMixingAdvisor', () => {
  it('builds an elite-behavior summary from existing release signals', () => {
    const result = analyzeEliteMixingAdvisor({
      analysisResult: {
        success: true,
        proposals: [],
        intakeConditioning: {
          report: {
            gainStaging: {
              peakLevelDb: -3.1,
              headroomDb: 6.4,
              clipping: false,
              clippingSamples: 0,
              clippingRepair: false,
              gainAppliedDb: 0,
            },
            noiseSources: {
              noiseFloorDb: -72,
              hum50Hz: false,
              hum60Hz: false,
              clicks: 0,
              breathiness: false,
            },
            dynamics: {
              consistencyScore: 88,
              levelVariationDb: 3.2,
              needsDynamicNormalization: false,
            },
            micProximity: {
              proximityEffect: 0.18,
              compensationNeeded: false,
              suggestedEQ: { freq: 180, gain: -1.5, q: 1.1 },
            },
            actions: [],
            verdict: 'ready',
            recommendedNextStep: 'Proceed to Vocal Profiler',
          },
          conditionedBuffer: null as any,
        },
        guardrailAnalysis: { score: 82 } as any,
        lowEndAnalysis: { verdict: 'tight' } as any,
      } as any,
      originalMetrics: { crestFactor: 10.2, lufs: { truePeak: -1.4 } } as any,
      processedMetrics: { crestFactor: 9.4, lufs: { truePeak: -1.2 } } as any,
      currentConfig: {
        motionReverb: { mix: 0.14, decay: 1.8, preDelay: 0.024, motion: { bpm: 124, depth: 0.38 } },
        delay: { time: 0.32, feedback: 0.24, mix: 0.11 },
        transientShaper: { attack: 0.2, sustain: 0.12, mix: 0.3 },
        stereoImager: { lowWidth: 0.72, midWidth: 0.88, highWidth: 0.94, crossovers: [120, 4200] },
      } as any,
      referenceTrack: { name: 'Reference', metrics: null } as any,
      referenceDelta: {
        matchScore: 88,
        loudness: { delta: -0.7 },
      } as any,
      finishLoop: {
        finishScore: 8.6,
        translationAuthority: { verdict: 'translation_ready' },
        summary: 'Release-safe.',
      } as any,
      sessionFinish: {
        verdict: 'ready',
        authorityScore: 91,
        summary: 'Session ready.',
      } as any,
      snapshotABActive: true,
    });

    expect(result.layers).toHaveLength(4);
    expect(result.layers[0].title).toBe('Undeniable A/B');
    expect(result.layers[1].title).toBe('Source & Monitoring Discipline');
    expect(result.layers[2].title).toBe('Taste-Level Automation & Depth');
    expect(result.layers[3].title).toBe('Pitch Proof');
    expect(result.pitchLine).toContain('live');
    expect(result.overlapNotes).toHaveLength(3);
  });
});
