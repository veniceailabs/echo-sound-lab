import { describe, expect, test } from 'vitest';
import { VocalIntakeConditioningService, type VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';

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

describe('VocalCompressionStackLogic', () => {
  test('prefers a two-stage stack for aggressive vocals with concentrated sibilance', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 140 * t) * 0.62;
      const transient = Math.sin(2 * Math.PI * 220 * t) * 0.12;
      const sibilance = Math.sin(2 * Math.PI * 7600 * t) * 0.24;
      return voice + transient + sibilance;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const analysis = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);

    expect(analysis.strategy).toBe('two_stage');
    expect(analysis.primaryStack).toHaveLength(2);
    expect(analysis.primaryStack[0].goal).toBe('transient_control');
    expect(analysis.primaryStack[1].goal).toBe('glue');
    expect(analysis.ordering.deEssingPlacement).toBe('before');
    expect(analysis.alternateStacks).toHaveLength(3);
    expect(analysis.riskNotes.length).toBeGreaterThan(0);
    expect(analysis.confidence).toBeGreaterThan(0.6);
  });

  test('preserves openness with a single-stage stack for intimate vocals', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 185 * t) * 0.45;
      const air = Math.sin(2 * Math.PI * 11000 * t) * 0.1;
      return voice + air;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const analysis = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);

    expect(analysis.strategy).toBe('single_stage');
    expect(analysis.primaryStack).toHaveLength(1);
    expect(analysis.primaryStack[0].ratio).toBeLessThan(2.5);
    expect(analysis.ordering.deEssingPlacement).toBe('not_needed');
    expect(analysis.tradeoffs.join(' ')).toContain('transparent');
  });

  test('uses a parallel stack when the vocal needs density without flattening', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 95 * t) * 0.68;
      const body = Math.sin(2 * Math.PI * 180 * t) * 0.22;
      return voice + body;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const analysis = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);

    expect(analysis.strategy).toBe('parallel');
    expect(analysis.primaryStack).toHaveLength(2);
    expect(analysis.primaryStack[0].mix).toBeLessThan(1);
    expect(analysis.primaryStack[1].goal).toBe('glue');
    expect(analysis.alternateStacks.some((alt) => alt.strategy === 'two_stage')).toBe(true);
  });
});
