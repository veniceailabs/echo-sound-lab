import { describe, expect, test } from 'vitest';
import { analyzeArrangement, type ArrangementAnalysis } from '../services/arrangementAnalyzer';
import { SpectralAnalyzer, type SpectralProfile } from '../services/dsp/SpectralAnalyzer';
import {
  VocalIntakeConditioningService,
  type VocalIntakeBufferLike,
} from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';
import { VocalPresenceAirTuning } from '../services/vocal/presenceAirTuning';
import { VocalDelayAutomationLogic } from '../services/vocal/delayAutomationLogic';
import { VocalIntentDetector } from '../services/vocal/vocalIntentDetector';
import { LowEndDiscipline } from '../services/lowend/lowEndDiscipline';
import { PhaseCMastering } from '../services/master/phaseCMastering';
import type { APLSignalMetrics } from '../echo-sound-lab/apl/signal-intelligence';

function createBuffer(
  durationSec: number,
  sampleRate: number,
  generator: (timeSec: number) => [number, number]
): VocalIntakeBufferLike {
  const length = Math.floor(durationSec * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const timeSec = index / sampleRate;
    const [l, r] = generator(timeSec);
    left[index] = l;
    right[index] = r;
  }

  return {
    duration: durationSec,
    length,
    sampleRate,
    numberOfChannels: 2,
    getChannelData(channel: number): Float32Array {
      return channel === 1 ? right : left;
    },
  };
}

function buildMetrics(profile: SpectralProfile): APLSignalMetrics {
  return {
    loudnessLUFS: profile.loudnessLUFS,
    loudnessRange: 0,
    truePeakDB: profile.truePeakDB,
    peakLevel: profile.peakLevel,
    crestFactor: profile.crestFactor,
    spectralCentroid: profile.spectralCentroid,
    spectralSpread: 0,
    clippingDetected: profile.clippingDetected,
    dcOffsetDetected: profile.dcOffsetDetected,
    silenceDetected: profile.silenceDetected,
    duration: profile.duration,
    sampleRate: profile.sampleRate,
    bitDepth: 24,
  };
}

function buildArrangement(buffer: VocalIntakeBufferLike): ArrangementAnalysis {
  return analyzeArrangement(buffer as unknown as AudioBuffer);
}

describe('PhaseCMastering', () => {
  test('produces a coherent finishing plan from the vocal and low-end analysis chain', () => {
    const sampleRate = 48000;
    const buffer = createBuffer(16, sampleRate, (timeSec) => {
      const verse = timeSec < 8 ? 0.44 : 0.65;
      const lowEnd = Math.sin(2 * Math.PI * 54 * timeSec) * 0.14;
      const body = Math.sin(2 * Math.PI * 150 * timeSec) * 0.28;
      const presence = Math.sin(2 * Math.PI * 2400 * timeSec) * 0.08;
      const air = Math.sin(2 * Math.PI * 9800 * timeSec) * 0.04;
      const left = verse * (lowEnd + body + presence + air);
      const right = verse * (lowEnd * 0.96 + body * 0.92 + presence * 1.04 + air * 1.02);
      return [left, right];
    });

    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
    const deEssing = VocalDeEssingZoneDetector.analyze(
      conditioning.conditionedBuffer,
      profile,
      conditioning.report
    );
    const compressionStack = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);
    const presenceAir = VocalPresenceAirTuning.analyze(
      profile,
      conditioning.report,
      deEssing,
      compressionStack
    );
    const delayAutomation = VocalDelayAutomationLogic.analyze(profile, compressionStack, presenceAir);
    const vocalIntent = VocalIntentDetector.analyze(
      profile,
      conditioning.report,
      compressionStack,
      presenceAir,
      delayAutomation
    );
    const arrangement = buildArrangement(conditioning.conditionedBuffer);
    const lowEnd = LowEndDiscipline.analyze(conditioning.conditionedBuffer, arrangement);
    const spectralProfile = SpectralAnalyzer.analyze(conditioning.conditionedBuffer);
    const metrics = buildMetrics(spectralProfile);

    const analysis = PhaseCMastering.analyze(
      metrics,
      spectralProfile,
      arrangement,
      lowEnd,
      profile,
      vocalIntent
    );

    expect(analysis.busGlue).toBeDefined();
    expect(analysis.loudnessControl).toBeDefined();
    expect(analysis.topEndPolish).toBeDefined();
    expect(analysis.referenceMastering).toBeDefined();
    expect(analysis.finalTranslation.targets).toHaveLength(4);
    expect(analysis.overallConfidence).toBeGreaterThan(0);
    expect(analysis.riskNotes.length).toBeGreaterThan(0);
    expect(analysis.interactionNotes.length).toBeGreaterThan(0);
    expect(analysis.busGlue.character).toMatch(/neutral|warm|presence/);
    expect(analysis.loudnessControl.targetLUFS).toBeLessThan(-12);
    expect(analysis.finalTranslation.verdict).toMatch(/translation_ready|needs_translation_work|mixed/);
  });
});
