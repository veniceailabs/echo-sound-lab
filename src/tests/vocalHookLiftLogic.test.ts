import { describe, expect, test } from 'vitest';
import { VocalIntakeConditioningService, type VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';
import { VocalPresenceAirTuning } from '../services/vocal/presenceAirTuning';
import { VocalDelayAutomationLogic } from '../services/vocal/delayAutomationLogic';
import { VocalHookLiftLogic } from '../services/vocal/hookLiftLogic';
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

describe('VocalHookLiftLogic', () => {
  test('builds a bigger hook than verse when the arrangement energy clearly rises', () => {
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
    const analysis = VocalHookLiftLogic.analyze(profile, compression, presenceAir, delay, arrangement);

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.hookSectionHint.toLowerCase()).toMatch(/chorus|verse|drop|hook|pre-chorus/);
    expect(analysis.amountOfLift).toBeGreaterThan(0.2);
    expect(analysis.verseVsHookContrast.contrastScore).toBeGreaterThan(0.15);
    expect(analysis.tactics.map((tactic) => tactic.tactic)).toContain('presence');
    expect(analysis.tactics.map((tactic) => tactic.tactic)).toContain('widen');
  });

  test('keeps the lift restrained when the hook is already dense and the delay layer is doing enough work', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: sampleRate * 16 }, (_, index) => {
      const t = index / sampleRate;
      const verse = index < sampleRate * 8 ? 0.45 : 0.75;
      const voice = Math.sin(2 * Math.PI * 140 * t) * verse;
      const transient = Math.sin(2 * Math.PI * 220 * t) * (index < sampleRate * 8 ? 0.04 : 0.08);
      const air = Math.sin(2 * Math.PI * 11200 * t) * (index < sampleRate * 8 ? 0.03 : 0.06);
      return voice + transient + air;
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
    const analysis = VocalHookLiftLogic.analyze(profile, compression, presenceAir, delay, arrangement);

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.amountOfLift).toBeLessThan(0.75);
    const widthTactic = analysis.tactics.find((tactic) => tactic.tactic === 'widen');
    expect(widthTactic?.setting[0].value).toBeLessThanOrEqual(1.18);
    expect(widthTactic?.riskNotes.join(' ').toLowerCase()).toContain('phasey');
    expect(analysis.interactionNotes.join(' ')).toContain('Verse section hint');
  });
});
