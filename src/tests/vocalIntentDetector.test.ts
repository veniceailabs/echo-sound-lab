import { describe, expect, test } from 'vitest';
import type { VocalIntentAnalysis } from '../services/vocal/vocalIntentDetector';
import type { VocalProfile } from '../services/vocal/vocalProfiler';
import type { VocalIntakeConditioningReport } from '../services/vocal/intakeConditioning';
import type { CompressionStackAnalysis } from '../services/vocal/compressionStackLogic';
import type { PresenceAirAnalysis } from '../services/vocal/presenceAirTuning';
import type { DelayAutomationAnalysis } from '../services/vocal/delayAutomationLogic';
import { VocalIntentDetector } from '../services/vocal/vocalIntentDetector';

function buildConditioning(): VocalIntakeConditioningReport {
  return {
    gainStaging: {
      peakLevelDb: -4.2,
      headroomDb: 1.1,
      clipping: false,
      clippingSamples: 0,
      clippingRepair: false,
      gainAppliedDb: -1.0,
    },
    noiseSources: {
      noiseFloorDb: -58,
      hum50Hz: false,
      hum60Hz: false,
      clicks: 0,
      breathiness: 0.12,
    },
    dynamics: {
      consistencyScore: 82,
      levelVariationDb: 4.1,
      needsDynamicNormalization: false,
    },
    micProximity: {
      proximityEffect: 0.14,
      compensationNeeded: false,
      suggestedEQ: { freq: 180, gain: -1.2, q: 0.7 },
    },
    actions: [],
    verdict: 'ready',
    recommendedNextStep: 'profile ready',
  };
}

function buildAggressiveChain(): {
  profile: VocalProfile;
  conditioning: VocalIntakeConditioningReport;
  compression: CompressionStackAnalysis;
  presenceAir: PresenceAirAnalysis;
  delay: DelayAutomationAnalysis;
} {
  return {
    profile: {
      fundamentalRange: { minHz: 108, maxHz: 152, medianHz: 128 },
      formants: { f1: 500, f2: 1700, f3: 2800 },
      dynamicRangeDb: 10.2,
      peakLevelDb: -3.7,
      rmsLevelDb: -14.6,
      transientSharpness: 0.82,
      breathiness: 0.18,
      nasality: 0.12,
      warmth: 0.24,
      tightness: 0.33,
      voiceType: 'tenor',
      voiceTypeConfidence: 0.72,
      conditioning: {
        clippingRepaired: false,
        normalizedGainDb: -1,
        humPresent: false,
        clickCount: 0,
        proximityEffect: 0.14,
        verdict: 'ready',
        nextStep: 'ready',
      },
    },
    conditioning: buildConditioning(),
    compression: {
      strategy: 'two_stage',
      primaryStack: [
        { name: 'Peak catcher', goal: 'transient_control', ratio: 4.4, thresholdDb: -22, attackMs: 1.8, releaseMs: 55, makeupDb: 0, mix: 1, description: 'fast' },
        { name: 'Glue stage', goal: 'glue', ratio: 2.3, thresholdDb: -24, attackMs: 28, releaseMs: 100, makeupDb: 1.1, mix: 1, description: 'glue' },
      ],
      alternateStacks: [],
      rationale: 'aggressive chain',
      tradeoffs: [],
      riskNotes: [],
      ordering: { deEssingPlacement: 'before', rationale: 'sibilance first' },
      confidence: 0.84,
    },
    presenceAir: {
      shouldApply: true,
      overallConfidence: 0.72,
      presenceTargets: [
        { band: 'presence', targetFrequencyHz: 3400, frequencyStartHz: 2500, frequencyEndHz: 4300, gainDb: 1.8, q: 0.7, confidence: 0.68, goal: 'cut_through', rationale: 'push', warning: 'sharp' },
      ],
      airTargets: [
        { band: 'air', targetFrequencyHz: 12200, frequencyStartHz: 10000, frequencyEndHz: 14500, gainDb: 0.7, q: 0.55, confidence: 0.62, goal: 'openness', rationale: 'subtle air' },
      ],
      rationale: 'forward vocal',
      interactionNotes: ['some upper-band detail'],
      riskNotes: ['keep broad'],
      warnings: ['presence is already active'],
    },
    delay: {
      shouldApply: true,
      overallConfidence: 0.68,
      primaryRecommendation: {
        useCase: 'hook_excitement',
        triggerHint: 'hook tail',
        triggerLocationHint: 'chorus end',
        delayType: 'quarter',
        tempoDivision: 'quarter-note throw',
        timeMs: 312,
        feedback: 0.18,
        wetLevel: 0.16,
        stereoSpread: 0.42,
        confidence: 0.71,
        rationale: 'throw',
        riskNotes: ['keep sparse'],
        interactionNotes: ['movement'],
      },
      alternateRecommendations: [],
      rationale: 'movement',
      riskNotes: ['avoid clutter'],
      interactionNotes: ['delay is modest'],
    },
  };
}

function buildIntimateChain(): ReturnType<typeof buildAggressiveChain> {
  const chain = buildAggressiveChain();
  chain.profile = {
    ...chain.profile,
    dynamicRangeDb: 5.3,
    transientSharpness: 0.24,
    breathiness: 0.68,
    warmth: 0.62,
    tightness: 0.71,
    voiceTypeConfidence: 0.86,
    fundamentalRange: { minHz: 110, maxHz: 138, medianHz: 124 },
  };
  chain.compression = {
    ...chain.compression,
    strategy: 'single_stage',
    primaryStack: [
      { name: 'Gentle control', goal: 'transient_control', ratio: 2.1, thresholdDb: -18, attackMs: 7, releaseMs: 160, makeupDb: 1.4, mix: 1, description: 'gentle' },
    ],
    ordering: { deEssingPlacement: 'after', rationale: 'keep it natural' },
  };
  chain.presenceAir = {
    ...chain.presenceAir,
    presenceTargets: [
      { band: 'presence', targetFrequencyHz: 3100, frequencyStartHz: 2200, frequencyEndHz: 4000, gainDb: 1.1, q: 0.7, confidence: 0.54, goal: 'intelligibility', rationale: 'subtle' },
    ],
    airTargets: [
      { band: 'air', targetFrequencyHz: 11800, frequencyStartHz: 9700, frequencyEndHz: 14200, gainDb: 0.9, q: 0.55, confidence: 0.52, goal: 'openness', rationale: 'light air' },
    ],
    overallConfidence: 0.54,
    warnings: [],
  };
  chain.delay = {
    ...chain.delay,
    shouldApply: false,
    primaryRecommendation: undefined,
    alternateRecommendations: [],
    rationale: 'keep dry',
    riskNotes: ['leave it close'],
    interactionNotes: ['dry'],
    skipReason: 'keep the vocal dry',
  };
  return chain;
}

describe('VocalIntentDetector', () => {
  test('classifies an aggressive vocal and returns intent-aware mix guidance', () => {
    const chain = buildAggressiveChain();
    const analysis = VocalIntentDetector.analyze(
      chain.profile,
      chain.conditioning,
      chain.compression,
      chain.presenceAir,
      chain.delay
    ) as VocalIntentAnalysis;

    expect(analysis.intent).toBe('aggressive');
    expect(analysis.confidence).toBeGreaterThan(0.45);
    expect(analysis.indicators.aggression).toBeGreaterThan(analysis.indicators.breathing);
    expect(analysis.compressionImpact.recommended_style).toBe('aggressive');
    expect(analysis.compressionImpact.recommended_ratio).toBeGreaterThan(3);
    expect(analysis.saturationImpact.recommended_drive).toBeGreaterThan(1.4);
    expect(analysis.presenceImpact.needs_presence_boost).toBe(true);
  });

  test('classifies an intimate vocal and keeps the processing restrained', () => {
    const chain = buildIntimateChain();
    const analysis = VocalIntentDetector.analyze(
      chain.profile,
      chain.conditioning,
      chain.compression,
      chain.presenceAir,
      chain.delay
    );

    expect(analysis.intent).toBe('intimate');
    expect(analysis.confidence).toBeGreaterThan(0.45);
    expect(analysis.compressionImpact.recommended_style).toBe('transparent');
    expect(analysis.saturationImpact.recommended_drive).toBeLessThan(1.2);
    expect(analysis.presenceImpact.needs_presence_boost).toBe(false);
    expect(analysis.riskNotes.join(' ')).toContain('close');
  });
});
