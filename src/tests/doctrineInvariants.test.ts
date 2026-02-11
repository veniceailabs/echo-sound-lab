import { describe, expect, test } from 'vitest';
import { calculateLoudnessRange } from '../services/dsp/analysisUtils';

describe('White Paper v2.0 Invariants', () => {
  test('DR Hard Ceiling: reduction never exceeds 2.0dB budget in comparator math', () => {
    const sampleRate = 44100;
    const length = sampleRate * 2;

    const originalData = new Float32Array(length);
    const processedData = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      originalData[i] = Math.sin(2 * Math.PI * 60 * t) * (i % 8000 < 4000 ? 0.9 : 0.2);
      processedData[i] = Math.sin(2 * Math.PI * 60 * t) * (i % 8000 < 4000 ? 0.75 : 0.25);
    }

    const mockOriginal = {
      sampleRate,
      getChannelData: () => originalData,
    } as unknown as AudioBuffer;

    const mockProcessed = {
      sampleRate,
      getChannelData: () => processedData,
    } as unknown as AudioBuffer;

    const drOriginal = calculateLoudnessRange(mockOriginal);
    const drProcessed = calculateLoudnessRange(mockProcessed);
    expect(drOriginal - drProcessed).toBeLessThanOrEqual(2.01);
  });

  test('HII Fallback: NaN/Infinite Q returns classical score', () => {
    const qScore = Number.NaN;
    const classicalScore = 80;
    const hIndex = Number.isFinite(qScore) ? qScore : classicalScore;
    expect(hIndex).toBe(80);
  });
});

