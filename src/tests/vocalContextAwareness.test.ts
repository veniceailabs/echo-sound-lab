import { describe, expect, test } from 'vitest';
import type { ArrangementAnalysis } from '../services/arrangementAnalyzer';
import type { CompressionStackAnalysis } from '../services/vocal/compressionStackLogic';
import type { DelayAutomationAnalysis } from '../services/vocal/delayAutomationLogic';
import type { HookLiftAnalysis } from '../services/vocal/hookLiftLogic';
import type { PresenceAirAnalysis } from '../services/vocal/presenceAirTuning';
import type { VocalContextAwarenessAnalysis } from '../services/vocal/contextAwareness';
import type { VocalIntentAnalysis } from '../services/vocal/vocalIntentDetector';
import type { AdLibPlacementAnalysis } from '../services/vocal/adlibPlacement';
import type { VocalProfile } from '../services/vocal/vocalProfiler';
import { VocalContextAwareness } from '../services/vocal/contextAwareness';

function buildProfile(): VocalProfile {
  return {
    fundamentalRange: { minHz: 118, maxHz: 214, medianHz: 152 },
    formants: { f1: 470, f2: 1820, f3: 2960 },
    dynamicRangeDb: 8.7,
    peakLevelDb: -4.4,
    rmsLevelDb: -15.1,
    transientSharpness: 0.39,
    breathiness: 0.24,
    nasality: 0.21,
    warmth: 0.53,
    tightness: 0.61,
    voiceType: 'tenor',
    voiceTypeConfidence: 0.82,
    conditioning: {
      clippingRepaired: false,
      normalizedGainDb: -1.1,
      humPresent: false,
      clickCount: 0,
      proximityEffect: 0.17,
      verdict: 'ready',
      nextStep: 'profile ready',
    },
  };
}

function buildCompression(): CompressionStackAnalysis {
  return {
    strategy: 'two_stage',
    primaryStack: [
      { name: 'Peak catcher', goal: 'transient_control', ratio: 3.9, thresholdDb: -20, attackMs: 2, releaseMs: 55, makeupDb: 0, mix: 1, description: 'fast' },
      { name: 'Glue stage', goal: 'glue', ratio: 2.0, thresholdDb: -23, attackMs: 28, releaseMs: 105, makeupDb: 1.2, mix: 1, description: 'glue' },
    ],
    alternateStacks: [],
    rationale: 'balanced',
    tradeoffs: [],
    riskNotes: [],
    ordering: { deEssingPlacement: 'between', rationale: 'balanced' },
    confidence: 0.72,
  };
}

function buildPresenceAir(): PresenceAirAnalysis {
  return {
    shouldApply: true,
    overallConfidence: 0.7,
    presenceTargets: [
      { band: 'presence', targetFrequencyHz: 3300, frequencyStartHz: 2400, frequencyEndHz: 4200, gainDb: 1.0, q: 0.7, confidence: 0.62, goal: 'intelligibility', rationale: 'clear', warning: undefined },
    ],
    airTargets: [
      { band: 'air', targetFrequencyHz: 12100, frequencyStartHz: 9900, frequencyEndHz: 14300, gainDb: 0.7, q: 0.55, confidence: 0.6, goal: 'openness', rationale: 'air', warning: undefined },
    ],
    rationale: 'balanced',
    interactionNotes: [],
    riskNotes: [],
    warnings: [],
  };
}

function buildDelay(): DelayAutomationAnalysis {
  return {
    shouldApply: true,
    overallConfidence: 0.64,
    primaryRecommendation: {
      useCase: 'hook_excitement',
      triggerHint: 'hook tail',
      triggerLocationHint: 'chorus end',
      delayType: 'quarter',
      tempoDivision: 'quarter-note throw',
      timeMs: 310,
      feedback: 0.14,
      wetLevel: 0.16,
      stereoSpread: 0.36,
      confidence: 0.68,
      rationale: 'throw',
      riskNotes: ['keep sparse'],
      interactionNotes: ['movement'],
    },
    alternateRecommendations: [],
    rationale: 'movement',
    riskNotes: [],
    interactionNotes: [],
  };
}

function buildIntent(): VocalIntentAnalysis {
  return {
    intent: 'melodic',
    confidence: 0.72,
    indicators: {
      proximity: 0.38,
      dynamicsIntensity: 0.48,
      breathing: 0.28,
      aggression: 0.34,
      melodicFocus: 0.71,
      warmth: 0.53,
    },
    compressionImpact: {
      recommended_ratio: 2.6,
      recommended_style: 'musical',
      reasoning: 'musical line',
    },
    saturationImpact: {
      recommended_drive: 1.3,
      reasoning: 'gentle color',
    },
    presenceImpact: {
      needs_presence_boost: true,
      reason: 'needs clarity',
    },
    rationale: 'melodic line',
    riskNotes: [],
    interactionNotes: [],
  };
}

function buildHookLift(): HookLiftAnalysis {
  return {
    shouldApply: true,
    overallConfidence: 0.69,
    verseSectionHint: 'verse',
    hookSectionHint: 'chorus',
    amountOfLift: 0.28,
    verseVsHookContrast: {
      verseEnergy: 0.4,
      hookEnergy: 0.66,
      contrastScore: 0.26,
      emotionalLift: 'hook rises',
    },
    tactics: [
      {
        tactic: 'widen',
        amountOfLift: 0.11,
        setting: [
          { tactic: 'widen', parameter: 'hook_stereo_width', value: 1.08, unit: 'width' },
        ],
        rationale: 'modest width',
        riskNotes: ['avoid phase'],
      },
    ],
    rationale: 'hook lift',
    riskNotes: [],
    interactionNotes: [],
  };
}

function buildAdLibPlacement(): AdLibPlacementAnalysis {
  return {
    shouldApply: true,
    overallConfidence: 0.66,
    primaryRecommendation: {
      role: 'supportive',
      triggerHint: 'hook garnish',
      triggerLocationHint: 'behind the lead',
      depthShiftDb: -7.8,
      panPosition: 0.32,
      stereoWidth: 0.54,
      delayOffsetMs: 20,
      highPassHz: 215,
      saturationDb: 0.7,
      reverbMix: 0.13,
      confidence: 0.71,
      rationale: 'support',
      riskNotes: [],
      interactionNotes: [],
    },
    alternateRecommendations: [],
    rationale: 'support',
    riskNotes: [],
    interactionNotes: [],
  };
}

describe('VocalContextAwareness', () => {
  test('tightens recommendations for a dense arrangement', () => {
    const analysis = VocalContextAwareness.analyze(
      buildProfile(),
      buildCompression(),
      buildPresenceAir(),
      buildDelay(),
      {
        sections: [
          { name: 'verse', startTime: 0, endTime: 8, energy: 0.95, density: 0.96, rmsDb: -14.3, peakDb: -5.2, dynamics: 1.7 },
          { name: 'chorus', startTime: 8, endTime: 16, energy: 0.98, density: 0.97, rmsDb: -11.5, peakDb: -3.2, dynamics: 1.4 },
        ],
        energyCurve: [0.5, 0.66, 0.83],
        dynamicRange: 5.8,
        loudestSection: 'chorus',
        quietestSection: 'verse',
        suggestedFocus: ['keep vocal focused'],
        overallFlow: 'flat',
      },
      buildIntent(),
      buildHookLift(),
      buildAdLibPlacement()
    ) as VocalContextAwarenessAnalysis;

    expect(analysis.densityClass).toBe('wall_of_sound');
    expect(analysis.compressionAdjustment.direction).toBe('tighten');
    expect(analysis.presenceAdjustment.direction).toBe('increase');
    expect(analysis.delayAdjustment.direction).toBe('reduce');
    expect(analysis.hookLiftAdjustment.direction).toBe('increase');
    expect(analysis.adLibAdjustment.direction).toBe('deepen');
    expect(analysis.availableSpaceBands.length).toBeGreaterThan(0);
    expect(analysis.shouldApply).toBe(true);
  });

  test('opens up recommendations for a sparse arrangement', () => {
    const analysis = VocalContextAwareness.analyze(
      buildProfile(),
      buildCompression(),
      buildPresenceAir(),
      buildDelay(),
      {
        sections: [
          { name: 'verse', startTime: 0, endTime: 8, energy: 0.28, density: 0.24, rmsDb: -19.2, peakDb: -9.1, dynamics: 2.4 },
          { name: 'chorus', startTime: 8, endTime: 16, energy: 0.41, density: 0.34, rmsDb: -17.8, peakDb: -8.3, dynamics: 2.0 },
        ],
        energyCurve: [0.28, 0.34, 0.41],
        dynamicRange: 9.4,
        loudestSection: 'chorus',
        quietestSection: 'verse',
        suggestedFocus: ['let vocal breathe'],
        overallFlow: 'building',
      },
      buildIntent(),
      buildHookLift(),
      buildAdLibPlacement()
    );

    expect(analysis.densityClass).toBe('sparse');
    expect(analysis.compressionAdjustment.direction).toBe('loosen');
    expect(analysis.presenceAdjustment.direction).toBe('reduce');
    expect(analysis.delayAdjustment.direction).toBe('increase');
    expect(analysis.hookLiftAdjustment.direction).toBe('reduce');
    expect(analysis.adLibAdjustment.direction).toBe('bring_forward');
    expect(analysis.availableSpaceBands[0].confidence).toBeGreaterThan(0.2);
    expect(analysis.verdict.toLowerCase()).toContain('open');
  });
});
