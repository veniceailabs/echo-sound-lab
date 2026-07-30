import { describe, expect, test } from 'vitest';
import {
  applyGainToBuffer,
  calculateBufferPeakDbfs,
} from '../services/audioSafety';
import { mixAnalysisService } from '../services/mixAnalysis';

function makeBuffer(channels: number[][]): Pick<AudioBuffer, 'numberOfChannels' | 'getChannelData' | 'duration'> {
  const data = channels.map(channel => Float32Array.from(channel));
  return {
    numberOfChannels: data.length,
    duration: 1,
    getChannelData(channel: number) {
      return data[channel];
    },
  };
}

describe('audio engine safety helpers', () => {
  test('detects peak across all channels instead of only channel 0', () => {
    const buffer = makeBuffer([
      [0.1, -0.1, 0.05],
      [0.75, -0.2, 0.3],
    ]);

    const peakDbfs = calculateBufferPeakDbfs(buffer);
    expect(peakDbfs).toBeCloseTo(20 * Math.log10(0.75), 6);
  });

  test('applies uniform gain reduction across all channels', () => {
    const buffer = makeBuffer([
      [1, -0.5, 0.25],
      [0.8, -0.4, 0.2],
    ]);

    const clamped = applyGainToBuffer(buffer, 0.5);
    expect(clamped).toBe(0);
    expect(Array.from(buffer.getChannelData(0))).toEqual([0.5, -0.25, 0.125]);
    expect(buffer.getChannelData(1)[0]).toBeCloseTo(0.4, 6);
    expect(buffer.getChannelData(1)[1]).toBeCloseTo(-0.2, 6);
    expect(buffer.getChannelData(1)[2]).toBeCloseTo(0.1, 6);
  });

  test('static metrics observe stereo peak energy', () => {
    const buffer = makeBuffer([
      [0.05, 0.05, 0.05],
      [0.9, -0.1, 0.2],
    ]);

    const metrics = mixAnalysisService.analyzeStaticMetrics(buffer as AudioBuffer);
    expect(metrics.peak).toBeCloseTo(20 * Math.log10(0.9), 6);
    expect(metrics.rms).toBeLessThan(0);
  });
});
