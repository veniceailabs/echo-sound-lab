import { describe, expect, test } from 'vitest';
import { VocalIntakeConditioningService, type VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';
import { VocalPresenceAirTuning } from '../services/vocal/presenceAirTuning';
import { VocalDelayAutomationLogic } from '../services/vocal/delayAutomationLogic';

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

describe('VocalDelayAutomationLogic', () => {
  test('recommends a hook throw for an energetic vocal that already has movement', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 140 * t) * 0.62;
      const transient = Math.sin(2 * Math.PI * 220 * t) * 0.12;
      const sibilance = Math.sin(2 * Math.PI * 7600 * t) * 0.24;
      const air = Math.sin(2 * Math.PI * 11000 * t) * 0.08;
      return voice + transient + sibilance + air;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const compression = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);
    const presenceAir = VocalPresenceAirTuning.analyze(profile, conditioning.report, deEssing, compression);
    const analysis = VocalDelayAutomationLogic.analyze(profile, compression, presenceAir);

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.primaryRecommendation?.useCase).toBe('hook_excitement');
    expect(analysis.primaryRecommendation?.triggerLocationHint).toContain('hook');
    expect(analysis.primaryRecommendation?.delayType).toMatch(/quarter|dotted_eighth/);
    expect(analysis.primaryRecommendation?.wetLevel).toBeGreaterThan(0.12);
    expect(analysis.primaryRecommendation?.feedback).toBeLessThan(0.3);
    expect(analysis.alternateRecommendations.length).toBeGreaterThan(0);
  });

  test('suggests ad-lib support when the vocal has breath and space but still needs movement', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 128 * t) * 0.26;
      const breath = Math.sin(2 * Math.PI * 9800 * t) * 0.5;
      const tail = Math.sin(2 * Math.PI * 11200 * t) * 0.26;
      return voice + breath + tail;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const compression = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);
    const presenceAir = VocalPresenceAirTuning.analyze(profile, conditioning.report, deEssing, compression);
    const analysis = VocalDelayAutomationLogic.analyze(profile, compression, presenceAir);

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.primaryRecommendation?.useCase).toBe('ad_lib_support');
    expect(analysis.primaryRecommendation?.triggerHint).toContain('ad-lib');
    expect(analysis.primaryRecommendation?.delayType).toMatch(/slapback|eighth/);
    expect(analysis.primaryRecommendation?.stereoSpread).toBeGreaterThan(0.35);
    expect(analysis.riskNotes.join(' ')).toContain('overlapping throws');
  });

  test('keeps an intimate vocal dry when delay would reduce the emotional center', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 185 * t) * 0.45;
      const warmth = Math.sin(2 * Math.PI * 95 * t) * 0.05;
      return voice + warmth;
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const compression = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);
    const presenceAir = VocalPresenceAirTuning.analyze(profile, conditioning.report, deEssing, compression);
    const analysis = VocalDelayAutomationLogic.analyze(profile, compression, presenceAir);

    expect(analysis.shouldApply).toBe(false);
    expect(analysis.primaryRecommendation).toBeUndefined();
    expect(analysis.skipReason?.toLowerCase()).toContain('keep the vocal dry');
  });
});
