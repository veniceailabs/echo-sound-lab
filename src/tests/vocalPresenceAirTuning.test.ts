import { describe, expect, test } from 'vitest';
import { VocalIntakeConditioningService, type VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';
import { VocalPresenceAirTuning } from '../services/vocal/presenceAirTuning';

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

describe('VocalPresenceAirTuning', () => {
  test('keeps presence and air restrained when compression and de-essing already expose the top end', () => {
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
    const analysis = VocalPresenceAirTuning.analyze(profile, conditioning.report, deEssing, compression);

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.presenceTargets).toHaveLength(1);
    expect(analysis.airTargets).toHaveLength(1);
    expect(analysis.presenceTargets[0].gainDb).toBeLessThan(2.5);
    expect(analysis.airTargets[0].gainDb).toBeLessThan(2.5);
    expect(analysis.interactionNotes.join(' ')).toContain('compression');
    expect(analysis.riskNotes.length).toBeGreaterThan(0);
  });

  test('adds clarity to a duller vocal without becoming a generic brightness boost', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      const body = Math.sin(2 * Math.PI * 95 * t) * 0.7;
      const presence = Math.sin(2 * Math.PI * 2600 * t) * 0.08;
      return body + presence;
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
    const analysis = VocalPresenceAirTuning.analyze(profile, conditioning.report, deEssing, compression);

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.presenceTargets[0].gainDb).toBeGreaterThan(0.5);
    expect(analysis.airTargets[0].gainDb).toBeGreaterThanOrEqual(0.4);
    expect(analysis.presenceTargets[0].goal).toMatch(/intelligibility|cut_through|polish/);
    expect(analysis.riskNotes.join(' ')).toContain('Use broad curves');
  });
});
