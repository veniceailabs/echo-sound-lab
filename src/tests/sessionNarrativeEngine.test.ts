import { describe, expect, test } from 'vitest';
import { analyzeArrangement, type ArrangementAnalysis } from '../services/arrangementAnalyzer';
import { SessionNarrativeEngine } from '../services/finishing/sessionNarrativeEngine';

function createBuffer(durationSec: number, sampleRate: number, generator: (timeSec: number) => number): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = generator(index / sampleRate);
  }

  return {
    duration: durationSec,
    length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData(): Float32Array {
      return samples;
    },
  } as unknown as AudioBuffer;
}

describe('SessionNarrativeEngine', () => {
  test('produces a deterministic arc and balance decisions from section flow', () => {
    const buffer = createBuffer(18, 48000, (timeSec) => {
      if (timeSec < 5) return Math.sin(2 * Math.PI * 120 * timeSec) * 0.16;
      if (timeSec < 11) return Math.sin(2 * Math.PI * 160 * timeSec) * 0.42;
      return Math.sin(2 * Math.PI * 220 * timeSec) * 0.74;
    });

    const arrangement = analyzeArrangement(buffer);

    const analysis = SessionNarrativeEngine.analyze({
      arrangement,
      sessionId: 'session_apex_001',
      trackName: 'War Map',
      lowEnd: {
        shouldApply: true,
        overallConfidence: 0.84,
      } as any,
      phaseCMastering: {
        shouldApply: true,
        finalTranslation: { targets: new Array(4).fill({}) },
      } as any,
      vocalIntent: {
        intent: 'aggressive',
      } as any,
      narrativePriorityBias: 0.72,
    });

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.analysisFingerprint).toHaveLength(8);
    expect(analysis.overallArc).toMatch(/opening|building|release|plateau|declining|cyclical/);
    expect(analysis.hierarchy.totalSections).toBeGreaterThan(0);
    expect(analysis.decisions.length).toBeGreaterThan(0);
    expect(analysis.decisions.some((decision) => decision.action === 'lift' || decision.action === 'transition_shape')).toBe(true);
    expect(analysis.riskNotes.length).toBeGreaterThanOrEqual(0);

    const repeated = SessionNarrativeEngine.analyze({
      arrangement,
      sessionId: 'session_apex_001',
      trackName: 'War Map',
      lowEnd: {
        shouldApply: true,
        overallConfidence: 0.84,
      } as any,
      phaseCMastering: {
        shouldApply: true,
        finalTranslation: { targets: new Array(4).fill({}) },
      } as any,
      vocalIntent: {
        intent: 'aggressive',
      } as any,
      narrativePriorityBias: 0.72,
    });

    expect(repeated.analysisFingerprint).toBe(analysis.analysisFingerprint);
  });
});
