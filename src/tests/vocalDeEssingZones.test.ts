import { describe, expect, test } from 'vitest';
import { VocalIntakeConditioningService, type VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';

function createBuffer(channels: number[][], sampleRate = 48000): VocalIntakeBufferLike {
  const channelData = channels.map((values) => Float32Array.from(values));
  const length = channelData[0]?.length ?? 0;

  return {
    duration: length / sampleRate,
    length,
    sampleRate,
    numberOfChannels: channelData.length,
    getChannelData(channel: number): Float32Array {
      return channelData[channel] ?? channelData[0] ?? new Float32Array(length);
    },
  };
}

describe('VocalDeEssingZoneDetector', () => {
  test('detects a concentrated sibilant band and recommends dynamic de-essing', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 140 * t) * 0.62;
      const sibilance = Math.sin(2 * Math.PI * 7600 * t) * 0.24;
      return voice + sibilance;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const analysis = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.zones.length).toBeGreaterThan(0);
    expect(analysis.overallConfidence).toBeGreaterThan(0.35);

    const zone = analysis.zones[0];
    expect(zone.frequencyStart).toBeLessThan(zone.frequencyEnd);
    expect(zone.consonants).toContain('s');
    expect(zone.recommendation.eqType).toBe('dynamic');
    expect(zone.confidence).toBeGreaterThan(0.35);
  });

  test('does not over-deess an airy vocal without concentrated sibilance', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 140 * t) * 0.64;
      const air = Math.sin(2 * Math.PI * 11000 * t) * 0.18;
      return voice + air;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const analysis = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );

    expect(analysis.shouldApply).toBe(false);
    expect(analysis.zones).toHaveLength(0);
    expect(analysis.skipReason).toContain('airy brightness');
  });
});
