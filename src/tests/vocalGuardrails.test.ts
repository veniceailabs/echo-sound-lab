import { describe, expect, test } from 'vitest';
import type { ArrangementAnalysis } from '../services/arrangementAnalyzer';
import type { AdLibPlacementAnalysis } from '../services/vocal/adlibPlacement';
import type { CompressionStackAnalysis } from '../services/vocal/compressionStackLogic';
import type { DeEssingAnalysis } from '../services/vocal/deEssingZones';
import type { DelayAutomationAnalysis } from '../services/vocal/delayAutomationLogic';
import type { HookLiftAnalysis } from '../services/vocal/hookLiftLogic';
import type { PresenceAirAnalysis } from '../services/vocal/presenceAirTuning';
import type { VocalGuardrailAnalysis } from '../services/vocal/guardrails';
import type { VocalProfile } from '../services/vocal/vocalProfiler';
import { VocalGuardrails } from '../services/vocal/guardrails';

function buildBalancedChain(): {
  profile: VocalProfile;
  deEssing: DeEssingAnalysis;
  compression: CompressionStackAnalysis;
  presenceAir: PresenceAirAnalysis;
  delay: DelayAutomationAnalysis;
  hookLift: HookLiftAnalysis;
  adLibPlacement: AdLibPlacementAnalysis;
  arrangement: ArrangementAnalysis;
} {
  return {
    profile: {
      fundamentalRange: { minHz: 115, maxHz: 205, medianHz: 148 },
      formants: { f1: 480, f2: 1850, f3: 2950 },
      dynamicRangeDb: 9.4,
      peakLevelDb: -4.1,
      rmsLevelDb: -14.8,
      transientSharpness: 0.34,
      breathiness: 0.28,
      nasality: 0.18,
      warmth: 0.56,
      tightness: 0.64,
      voiceType: 'tenor',
      voiceTypeConfidence: 0.83,
      conditioning: {
        clippingRepaired: false,
        normalizedGainDb: -1.2,
        humPresent: false,
        clickCount: 0,
        proximityEffect: 0.16,
        verdict: 'ready',
        nextStep: 'profile ready',
      },
    },
    deEssing: {
      shouldApply: true,
      overallConfidence: 0.58,
      zones: [
        {
          frequencyStart: 5700,
          frequencyEnd: 7100,
          intensity: 0.46,
          prominence: 0.42,
          consonants: ['s'],
          confidence: 0.56,
          rationale: 'Moderate concentrated sibilance',
          recommendation: {
            eqType: 'dynamic',
            frequency: 6400,
            gainReduction: 3.1,
            Q: 4,
            thresholdDb: -24,
            ratio: 3.4,
          },
        },
      ],
    },
    compression: {
      strategy: 'two_stage',
      primaryStack: [
        { name: 'Peak catcher', goal: 'transient_control', ratio: 3.8, thresholdDb: -19, attackMs: 2.5, releaseMs: 55, makeupDb: 0, mix: 1, description: 'Peak catcher' },
        { name: 'Glue stage', goal: 'glue', ratio: 1.9, thresholdDb: -23, attackMs: 32, releaseMs: 110, makeupDb: 1.3, mix: 1, description: 'Glue stage' },
      ],
      alternateStacks: [],
      rationale: 'Balanced compression',
      tradeoffs: ['some coloration'],
      riskNotes: ['keep attack moderate'],
      ordering: { deEssingPlacement: 'between', rationale: 'moderate sibilance benefits from a light de-ess between stages' },
      confidence: 0.72,
    },
    presenceAir: {
      shouldApply: true,
      overallConfidence: 0.71,
      presenceTargets: [
        { band: 'presence', targetFrequencyHz: 3300, frequencyStartHz: 2400, frequencyEndHz: 4200, gainDb: 1.1, q: 0.7, confidence: 0.64, goal: 'intelligibility', rationale: 'clear the lyric' },
      ],
      airTargets: [
        { band: 'air', targetFrequencyHz: 12000, frequencyStartHz: 9800, frequencyEndHz: 14400, gainDb: 0.8, q: 0.55, confidence: 0.61, goal: 'openness', rationale: 'light air lift' },
      ],
      rationale: 'Balanced top end',
      interactionNotes: ['compression leaves room for subtle polish'],
      riskNotes: ['use broad curves'],
      warnings: [],
    },
    delay: {
      shouldApply: true,
      overallConfidence: 0.64,
      primaryRecommendation: {
        useCase: 'emphasis',
        triggerHint: 'phrase ending',
        triggerLocationHint: 'hook tail',
        delayType: 'dotted_eighth',
        tempoDivision: 'dotted-eighth throw',
        timeMs: 248,
        feedback: 0.14,
        wetLevel: 0.16,
        stereoSpread: 0.34,
        confidence: 0.68,
        rationale: 'small punctuation throw',
        riskNotes: ['keep sparse'],
        interactionNotes: ['acts as punctuation'],
      },
      alternateRecommendations: [],
      rationale: 'Small delay support',
      riskNotes: ['avoid stacking'],
      interactionNotes: ['delay is modest'],
    },
    hookLift: {
      shouldApply: true,
      overallConfidence: 0.68,
      verseSectionHint: 'verse',
      hookSectionHint: 'chorus',
      amountOfLift: 0.31,
      verseVsHookContrast: {
        verseEnergy: 0.46,
        hookEnergy: 0.69,
        contrastScore: 0.29,
        emotionalLift: 'hook rises',
      },
      tactics: [
        {
          tactic: 'presence',
          amountOfLift: 0.14,
          setting: [
            { tactic: 'presence', parameter: 'hook_presence_gain_db', value: 1.1, unit: 'db' },
          ],
          rationale: 'slightly forward',
          riskNotes: ['keep broad'],
        },
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
      rationale: 'gentle lift',
      riskNotes: ['keep lift relative'],
      interactionNotes: ['verse/hook contrast is already clear'],
    },
    adLibPlacement: {
      shouldApply: true,
      overallConfidence: 0.67,
      primaryRecommendation: {
        role: 'supportive',
        triggerHint: 'hook garnish',
        triggerLocationHint: 'behind the lead',
        depthShiftDb: -8.1,
        panPosition: 0.42,
        stereoWidth: 0.56,
        delayOffsetMs: 22,
        highPassHz: 220,
        saturationDb: 0.8,
        reverbMix: 0.14,
        confidence: 0.72,
        rationale: 'support behind the lead',
        riskNotes: ['stay behind'],
        interactionNotes: ['works with the hook'],
      },
      alternateRecommendations: [],
      rationale: 'supportive ad-lib',
      riskNotes: ['do not compete'],
      interactionNotes: ['ad-lib support is moderate'],
    },
    arrangement: {
      sections: [
        { name: 'verse', startTime: 0, endTime: 8, energy: 0.46, density: 0.48, rmsDb: -16.1, peakDb: -6.2, dynamics: 2.1 },
        { name: 'chorus', startTime: 8, endTime: 16, energy: 0.69, density: 0.58, rmsDb: -13.7, peakDb: -4.1, dynamics: 1.8 },
      ],
      energyCurve: [0.46, 0.48, 0.53, 0.69],
      dynamicRange: 8.2,
      loudestSection: 'chorus',
      quietestSection: 'verse',
      suggestedFocus: ['hook needs polish'],
      overallFlow: 'dynamic',
    },
  };
}

function buildProblematicChain(): ReturnType<typeof buildBalancedChain> {
  const chain = buildBalancedChain();
  chain.profile = {
    ...chain.profile,
    dynamicRangeDb: 5.1,
    transientSharpness: 0.78,
    breathiness: 0.67,
    warmth: 0.18,
    tightness: 0.31,
  };
  chain.deEssing = {
    ...chain.deEssing,
    shouldApply: true,
    overallConfidence: 0.89,
    zones: [
      {
        frequencyStart: 5400,
        frequencyEnd: 9000,
        intensity: 0.84,
        prominence: 0.82,
        consonants: ['s', 'z'],
        confidence: 0.93,
        rationale: 'concentrated sibilance',
        recommendation: {
          eqType: 'static',
          frequency: 7200,
          gainReduction: 6.4,
          Q: 4.5,
          thresholdDb: -18,
          ratio: 7.2,
        },
      },
    ],
  };
  chain.compression = {
    ...chain.compression,
    strategy: 'two_stage',
    primaryStack: [
      { name: 'Peak catcher', goal: 'transient_control', ratio: 6.2, thresholdDb: -26, attackMs: 1.5, releaseMs: 45, makeupDb: 0, mix: 1, description: 'Aggressive' },
      { name: 'Glue stage', goal: 'glue', ratio: 3.0, thresholdDb: -28, attackMs: 28, releaseMs: 95, makeupDb: 2, mix: 1, description: 'Very dense' },
    ],
    ordering: { deEssingPlacement: 'before', rationale: 'sibilance should be controlled before heavy compression' },
    confidence: 0.88,
  };
  chain.presenceAir = {
    ...chain.presenceAir,
    overallConfidence: 0.9,
    presenceTargets: [
      { band: 'presence', targetFrequencyHz: 3400, frequencyStartHz: 2500, frequencyEndHz: 4300, gainDb: 2.2, q: 0.7, confidence: 0.87, goal: 'cut_through', rationale: 'push forward', warning: 'large presence boost' },
    ],
    airTargets: [
      { band: 'air', targetFrequencyHz: 12500, frequencyStartHz: 10100, frequencyEndHz: 14500, gainDb: 2.1, q: 0.55, confidence: 0.86, goal: 'luxury', rationale: 'bright air', warning: 'large air boost' },
    ],
    warnings: ['Presence boost is large enough to re-emphasize consonants; verify de-essing order.', 'Compression already adds top-end detail; keep the presence lift smooth and wide.'],
    riskNotes: ['use broad curves'],
    interactionNotes: ['compression is bright'],
  };
  chain.delay = {
    ...chain.delay,
    shouldApply: true,
    overallConfidence: 0.86,
    primaryRecommendation: {
      useCase: 'hook_excitement',
      triggerHint: 'hook tail',
      triggerLocationHint: 'chorus end',
      delayType: 'quarter',
      tempoDivision: 'quarter-note throw',
      timeMs: 322,
      feedback: 0.26,
      wetLevel: 0.26,
      stereoSpread: 0.58,
      confidence: 0.88,
      rationale: 'hook bloom',
      riskNotes: ['avoid overtaking lead'],
      interactionNotes: ['adds motion'],
    },
    alternateRecommendations: [],
    rationale: 'dense movement',
    riskNotes: ['keep the throw off the verse'],
    interactionNotes: ['delay is already prominent'],
  };
  chain.hookLift = {
    ...chain.hookLift,
    shouldApply: true,
    overallConfidence: 0.86,
    amountOfLift: 0.62,
    verseVsHookContrast: {
      verseEnergy: 0.43,
      hookEnergy: 0.8,
      contrastScore: 0.41,
      emotionalLift: 'hook needs a clear step-up',
    },
    tactics: [
      {
        tactic: 'presence',
        amountOfLift: 0.28,
        setting: [
          { tactic: 'presence', parameter: 'hook_presence_gain_db', value: 1.9, unit: 'db' },
        ],
        rationale: 'push forward',
        riskNotes: ['keep broad'],
      },
      {
        tactic: 'widen',
        amountOfLift: 0.24,
        setting: [
          { tactic: 'widen', parameter: 'hook_stereo_width', value: 1.19, unit: 'width' },
        ],
        rationale: 'wide chorus',
        riskNotes: ['phase risk'],
      },
    ],
    riskNotes: ['do not widen the low end'],
    interactionNotes: ['hook lift is substantial'],
  };
  chain.adLibPlacement = {
    ...chain.adLibPlacement,
    shouldApply: true,
    overallConfidence: 0.84,
    primaryRecommendation: {
      role: 'supportive',
      triggerHint: 'hook garnish',
      triggerLocationHint: 'behind the lead',
      depthShiftDb: -6.5,
      panPosition: 0.52,
      stereoWidth: 0.69,
      delayOffsetMs: 28,
      highPassHz: 190,
      saturationDb: 1.4,
      reverbMix: 0.23,
      confidence: 0.83,
      rationale: 'supportive layer',
      riskNotes: ['could crowd hook'],
      interactionNotes: ['wide support'],
    },
    alternateRecommendations: [],
    rationale: 'supportive ad-lib',
    riskNotes: ['avoid clutter'],
    interactionNotes: ['layer is fairly wide'],
  };
  chain.arrangement = {
    ...chain.arrangement,
    sections: [
      { name: 'verse', startTime: 0, endTime: 8, energy: 0.43, density: 0.7, rmsDb: -16.8, peakDb: -6.4, dynamics: 1.9 },
      { name: 'chorus', startTime: 8, endTime: 16, energy: 0.8, density: 0.84, rmsDb: -12.4, peakDb: -3.6, dynamics: 1.5 },
    ],
    dynamicRange: 5.6,
    loudestSection: 'chorus',
    quietestSection: 'verse',
    suggestedFocus: ['hook may be too dense'],
    overallFlow: 'flat',
  };
  return chain;
}

describe('VocalGuardrails', () => {
  test('flags combined failure modes when the vocal chain stacks brightness, width, delay, and compression', () => {
    const chain = buildProblematicChain();
    const analysis = VocalGuardrails.analyze(
      chain.profile,
      chain.deEssing,
      chain.compression,
      chain.presenceAir,
      chain.delay,
      chain.hookLift,
      chain.adLibPlacement,
      chain.arrangement
    ) as VocalGuardrailAnalysis;

    expect(analysis.shouldApply).toBe(true);
    expect(analysis.verdict).toBe('red');
    expect(analysis.errorCount).toBeGreaterThan(0);
    expect(analysis.checks.filter((check) => check.detected).map((check) => check.check)).toEqual(
      expect.arrayContaining([
        'hollow_bright_top',
        'brittle_top_end',
        'over_compression',
        'phasey_hook_widening',
        'ad_lib_clutter',
        'presence_zone_stacking',
      ])
    );
    expect(analysis.riskNotes.join(' ')).toContain('bright');
    expect(analysis.interactionNotes.join(' ')).toContain('compression weight');
  });

  test('stays green when the chain is balanced and nothing destructive is stacking', () => {
    const chain = buildBalancedChain();
    const analysis = VocalGuardrails.analyze(
      chain.profile,
      chain.deEssing,
      chain.compression,
      chain.presenceAir,
      chain.delay,
      chain.hookLift,
      chain.adLibPlacement,
      chain.arrangement
    );

    expect(analysis.shouldApply).toBe(false);
    expect(analysis.verdict).toBe('green');
    expect(analysis.warningCount).toBe(0);
    expect(analysis.errorCount).toBe(0);
    expect(analysis.checks.every((check) => !check.detected)).toBe(true);
    expect(analysis.skipReason).toContain('No combined failure mode');
  });
});
