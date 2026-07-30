import { describe, expect, test } from 'vitest';
import { VocalIntakeConditioningService, type VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';
import { VocalPresenceAirTuning } from '../services/vocal/presenceAirTuning';
import { VocalDelayAutomationLogic } from '../services/vocal/delayAutomationLogic';
import { VocalHookLiftLogic } from '../services/vocal/hookLiftLogic';
import { VocalAdLibPlacementLogic } from '../services/vocal/adlibPlacement';
import { analyzeArrangement } from '../services/arrangementAnalyzer';

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

describe('VocalAdLibPlacementLogic', () => {
  test('places supportive ad-libs behind a lifted hook without crowding the lead', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: sampleRate * 16 }, (_, index) => {
      const t = index / sampleRate;
      const verse = index < sampleRate * 8 ? 0.28 : 0.68;
      const voice = Math.sin(2 * Math.PI * 128 * t) * verse;
      const presence = Math.sin(2 * Math.PI * 2900 * t) * (index < sampleRate * 8 ? 0.05 : 0.09);
      const air = Math.sin(2 * Math.PI * 11000 * t) * (index < sampleRate * 8 ? 0.04 : 0.08);
      return voice + presence + air;
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
    const delay = VocalDelayAutomationLogic.analyze(profile, compression, presenceAir);
    const arrangement = analyzeArrangement(conditioning.conditionedBuffer as unknown as AudioBuffer);
    const hookLift = VocalHookLiftLogic.analyze(profile, compression, presenceAir, delay, arrangement);
    const analysis = VocalAdLibPlacementLogic.analyze(
      profile,
      compression,
      presenceAir,
      delay,
      hookLift,
      arrangement
    );

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.primaryRecommendation?.role).toBe('supportive');
    expect(analysis.primaryRecommendation?.depthShiftDb).toBeLessThan(-7);
    expect(analysis.primaryRecommendation?.stereoWidth).toBeGreaterThan(0.5);
    expect(analysis.primaryRecommendation?.reverbMix).toBeGreaterThan(0.1);
    expect(analysis.riskNotes.join(' ').toLowerCase()).toContain('lead');
  });

  test('keeps a punchy ad-lib tight when it is better used as punctuation', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: sampleRate * 8 }, (_, index) => {
      const t = index / sampleRate;
      const voice = Math.sin(2 * Math.PI * 185 * t) * 0.22;
      const transient = Math.sin(2 * Math.PI * 520 * t) * 0.48;
      const presence = Math.sin(2 * Math.PI * 3400 * t) * 0.04;
      return voice + transient + presence;
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
    const delay = VocalDelayAutomationLogic.analyze(profile, compression, presenceAir);
    const arrangement = analyzeArrangement(conditioning.conditionedBuffer as unknown as AudioBuffer);
    const hookLift = VocalHookLiftLogic.analyze(profile, compression, presenceAir, delay, arrangement);
    const analysis = VocalAdLibPlacementLogic.analyze(
      profile,
      compression,
      presenceAir,
      delay,
      hookLift,
      arrangement
    );

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.primaryRecommendation?.role).toBe('punctuation');
    expect(analysis.primaryRecommendation?.delayOffsetMs).toBeLessThanOrEqual(24);
    expect(analysis.primaryRecommendation?.panPosition).toBeGreaterThanOrEqual(-0.35);
    expect(analysis.primaryRecommendation?.panPosition).toBeLessThanOrEqual(0.35);
    expect(analysis.primaryRecommendation?.interactionNotes.join(' ').toLowerCase()).toContain('lead');
  });
});
