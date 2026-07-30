import { afterEach, describe, expect, test, vi } from 'vitest';
import { APLAnalysisService } from '../services/APLAnalysisService';
import { SpectralAnalyzer } from '../services/dsp/SpectralAnalyzer';
import {
  VocalIntakeConditioningService,
  type VocalIntakeBufferLike,
} from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';

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

function maxAbs(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  }
  return peak;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VocalIntakeConditioningService', () => {
  test('repairs clipped samples and normalizes the intake view without mutating the source buffer', () => {
    const original = createBuffer([
      [0.05, 0.18, 0.92, 1, 1, 0.74, 0.22, -0.12, 0.04],
    ]);
    const sourceSnapshot = Array.from(original.getChannelData(0));

    const result = VocalIntakeConditioningService.condition(original);
    const conditioned = result.conditionedBuffer.getChannelData(0);

    expect(Array.from(original.getChannelData(0))).toEqual(sourceSnapshot);
    expect(result.report.gainStaging.clipping).toBe(true);
    expect(result.report.gainStaging.clippingRepair).toBe(true);
    expect(result.report.gainStaging.clippingSamples).toBeGreaterThan(0);
    expect(result.report.actions.map((action) => action.action)).toContain('clip_repair');
    expect(result.report.actions.map((action) => action.action)).toContain('gain_normalize');
    expect(maxAbs(conditioned)).toBeCloseTo(Math.pow(10, -3 / 20), 3);
    expect(result.report.verdict).toBe('needs_conditioning');
    expect(result.report.recommendedNextStep).toContain('clip repair');
  });

  test('detects proximity-heavy intake and recommends low-mid correction', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      return (Math.sin(2 * Math.PI * 180 * t) * 0.85) + (Math.sin(2 * Math.PI * 55 * t) * 0.08);
    });

    const result = VocalIntakeConditioningService.condition(createBuffer([samples], sampleRate));

    expect(result.report.micProximity.proximityEffect).toBeGreaterThan(0.45);
    expect(result.report.micProximity.compensationNeeded).toBe(true);
    expect(result.report.micProximity.suggestedEQ.gain).toBeLessThan(0);
    expect(result.report.actions.map((action) => action.action)).toContain('proximity_correct');
  });
});

describe('VocalProfiler', () => {
  test('extracts a stable vocal profile from the conditioned view and report context', () => {
    const sampleRate = 48000;
    const samples = Array.from({ length: 4096 }, (_, index) => {
      const t = index / sampleRate;
      return (
        Math.sin(2 * Math.PI * 140 * t) * 0.7 +
        Math.sin(2 * Math.PI * 700 * t) * 0.18 +
        Math.sin(2 * Math.PI * 1300 * t) * 0.12 +
        Math.sin(2 * Math.PI * 2500 * t) * 0.08
      );
    });

    const buffer = createBuffer([samples], sampleRate);
    const conditioning = VocalIntakeConditioningService.condition(buffer);
    const profile = VocalProfiler.profile(buffer, conditioning.report);

    expect(profile.fundamentalRange.medianHz).toBeGreaterThan(120);
    expect(profile.fundamentalRange.medianHz).toBeLessThan(170);
    expect(profile.formants.f1).toBeGreaterThanOrEqual(180);
    expect(profile.formants.f2).toBeGreaterThan(profile.formants.f1);
    expect(profile.voiceType).toBe('tenor');
    expect(profile.voiceTypeConfidence).toBeGreaterThan(0.6);
    expect(profile.conditioning.nextStep).toBe(conditioning.report.recommendedNextStep);
  });
});

describe('APLAnalysisService intake integration', () => {
  test('uses the conditioned buffer for spectral analysis before proposal generation', async () => {
    const sampleRate = 48000;
    const source = createBuffer([
      [0.02, 0.12, 0.98, 1, 1, 0.84, 0.14, -0.08, 0.03],
    ], sampleRate);
    const decodeCalls: ArrayBuffer[] = [];
    const fakeContext = class {
      state = 'running';
      currentTime = 0;
      destination = { connect() {}, disconnect() {} } as any;

      async decodeAudioData(audioData: ArrayBuffer): Promise<VocalIntakeBufferLike> {
        decodeCalls.push(audioData);
        return source;
      }
    };

    vi.stubGlobal('window', { AudioContext: fakeContext } as any);

    const spectralSpy = vi.spyOn(SpectralAnalyzer, 'analyze').mockImplementation((buffer) => {
      const peak = maxAbs(buffer.getChannelData(0));
      expect(peak).toBeCloseTo(Math.pow(10, -3 / 20), 3);
      return {
        peakLevel: peak,
        truePeakDB: 20 * Math.log10(Math.max(peak, 0.00001)),
        clippingDetected: false,
        clippingEvents: 0,
        dcOffset: 0,
        dcOffsetDetected: false,
        spectralCentroid: 180,
        peakFrequency: 180,
        lowEndEnergy: 0.18,
        hasLowEndRumble: false,
        loudnessLUFS: -17,
        crestFactor: 6,
        silenceDetected: false,
        sampleRate: buffer.sampleRate,
        duration: (buffer.length / buffer.sampleRate) * 1000,
      };
    });

    const file = {
      name: 'real-vocal.wav',
      size: source.length * 2,
      lastModified: 1700000000000,
      arrayBuffer: async () => new ArrayBuffer(16),
    } as File;

    const result = await APLAnalysisService.analyzeFile({ file, trackName: 'Real Vocal' });

    expect(decodeCalls).toHaveLength(1);
    expect(spectralSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.intakeConditioning?.gainStaging.clipping).toBe(true);
    expect(result.intakeConditioning?.gainStaging.gainAppliedDb).toBeLessThan(0);
    expect(result.intakeConditioning?.recommendedNextStep).toContain('clip repair');
    expect(result.vocalProfile?.conditioning.verdict).toBe(result.intakeConditioning?.verdict);
    expect(result.vocalProfile?.voiceTypeConfidence).toBeGreaterThan(0);
    expect(result.deEssingAnalysis).toBeDefined();
    expect(result.deEssingAnalysis?.zones).toBeDefined();
    expect(result.compressionStack).toBeDefined();
    expect(result.compressionStack?.primaryStack.length).toBeGreaterThan(0);
    expect(result.presenceAirAnalysis).toBeDefined();
    expect(result.presenceAirAnalysis?.presenceTargets.length).toBeGreaterThanOrEqual(0);
    expect(result.delayAutomationAnalysis).toBeDefined();
    expect(
      result.delayAutomationAnalysis?.shouldApply === true ||
      result.delayAutomationAnalysis?.shouldApply === false
    ).toBe(true);
    expect(result.arrangementAnalysis).toBeDefined();
    expect(result.hookLiftAnalysis).toBeDefined();
    expect(result.hookLiftAnalysis?.verseSectionHint).toBeTruthy();
    expect(result.hookLiftAnalysis?.hookSectionHint).toBeTruthy();
    expect(result.adLibPlacementAnalysis).toBeDefined();
    expect(result.adLibPlacementAnalysis?.primaryRecommendation?.role).toMatch(/supportive|punctuation|response/);
    expect(result.guardrailAnalysis).toBeDefined();
    expect(result.guardrailAnalysis?.checks.length).toBeGreaterThan(0);
    expect(result.guardrailAnalysis?.score).toBeGreaterThanOrEqual(0);
    expect(result.guardrailAnalysis?.score).toBeLessThanOrEqual(100);
    expect(result.vocalIntentAnalysis).toBeDefined();
    expect(result.vocalIntentAnalysis?.intent).toMatch(/intimate|aggressive|melodic|conversational|whispered|belted/);
    expect(result.contextAwarenessAnalysis).toBeDefined();
    expect(result.contextAwarenessAnalysis?.densityClass).toMatch(/sparse|moderate|dense|wall_of_sound/);
    expect(result.lowEndAnalysis).toBeDefined();
    expect(result.lowEndAnalysis?.kickBassControl).toBeDefined();
    expect(result.lowEndAnalysis?.translationValidation.targets.length).toBeGreaterThan(0);
    expect(result.phaseCMasteringAnalysis).toBeDefined();
    expect(result.phaseCMasteringAnalysis?.busGlue).toBeDefined();
    expect(result.phaseCMasteringAnalysis?.finalTranslation.targets.length).toBe(4);
  });
});
