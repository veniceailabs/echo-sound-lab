import { describe, expect, test } from 'vitest';
import { analyzeRecordingIntake } from '../services/recordingIntakeService';

function createTestBuffer(length = 48000 * 10, sampleRate = 48000): AudioBuffer {
  const data = new Float32Array(length);
  for (let i = 0; i < data.length; i += 1) {
    const t = i / sampleRate;
    data[i] = Math.sin(2 * Math.PI * 220 * t) * 0.12;
  }
  return {
    duration: length / sampleRate,
    length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as AudioBuffer;
}

describe('RecordingIntakeService', () => {
  test('analyzes a recorded vocal take and suggests a benchmark lane', () => {
    const result = analyzeRecordingIntake(createTestBuffer());

    expect(result.durationSec).toBeGreaterThan(0);
    expect(result.recommendedPitchPreset.enabled).toBe(true);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(['ready', 'borderline', 're-record']).toContain(result.verdict);
  });
});
