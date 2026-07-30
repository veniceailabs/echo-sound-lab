import { describe, expect, test } from 'vitest';
import { buildAPLPerceptualField } from '../services/aplPerceptualField';

const denseField = buildAPLPerceptualField({
  arrangement: {
    sections: [
      { name: 'verse', startTime: 0, endTime: 8, energy: 0.72, density: 0.84, rmsDb: -12.8, peakDb: -3.7, dynamics: 1.6 },
      { name: 'chorus', startTime: 8, endTime: 16, energy: 0.9, density: 0.92, rmsDb: -10.9, peakDb: -2.4, dynamics: 1.4 },
    ],
    energyCurve: [0.72, 0.78, 0.9],
    dynamicRange: 5.4,
    loudestSection: 'chorus',
    quietestSection: 'verse',
    suggestedFocus: ['more lift'],
    overallFlow: 'dynamic',
  },
  vocalIntent: {
    intent: 'aggressive',
    confidence: 0.92,
    indicators: { proximity: 0.35, dynamicsIntensity: 0.82, breathing: 0.18, aggression: 0.9, melodicFocus: 0.42, warmth: 0.28 },
    compressionImpact: { recommended_ratio: 4.2, recommended_style: 'aggressive', reasoning: 'dense vocal' },
    saturationImpact: { recommended_drive: 0.7, reasoning: 'drive' },
    presenceImpact: { needs_presence_boost: true, reason: 'cut through' },
    rationale: 'aggressive lead',
    riskNotes: ['keep control'],
    interactionNotes: ['hot vocal'],
  },
  contextAwareness: {
    shouldApply: true,
    overallConfidence: 0.82,
    densityScore: 0.81,
    densityClass: 'wall_of_sound',
    frequencyMasking: { lowEnd: 0.64, midRange: 0.74, highEnd: 0.48 },
    availableSpaceBands: [],
    suggestedVocalRange: { minHz: 110, maxHz: 280 },
    compressionAdjustment: { direction: 'tighten', amount: 0.22, rationale: 'tighten' },
    presenceAdjustment: { direction: 'increase', amount: 0.24, rationale: 'increase presence' },
    delayAdjustment: { direction: 'reduce', amount: 0.18, rationale: 'reduce delay clutter' },
    hookLiftAdjustment: { direction: 'increase', amount: 0.2, rationale: 'lift hook' },
    adLibAdjustment: { direction: 'deepen', amount: 0.16, rationale: 'push adlibs back' },
    saturationAdjustment: { direction: 'reduce', amount: 0.12, rationale: 'reduce saturation' },
    verdict: 'dense but manageable',
    rationale: 'dense context',
    riskNotes: ['crowded midrange'],
    interactionNotes: ['reduce motion'],
  },
  hookLift: {
    shouldApply: true,
    overallConfidence: 0.7,
    verseSectionHint: 'verse',
    hookSectionHint: 'chorus',
    amountOfLift: 0.28,
    verseVsHookContrast: {
      verseEnergy: 0.52,
      hookEnergy: 0.82,
      contrastScore: 0.3,
      emotionalLift: 'hook rises',
    },
    tactics: [],
    rationale: 'hook lift',
    riskNotes: ['moderate'],
    interactionNotes: [],
  },
  adLibPlacement: {
    shouldApply: true,
    overallConfidence: 0.68,
    primaryRecommendation: {
      role: 'supportive',
      triggerHint: 'hook garnish',
      triggerLocationHint: 'behind lead',
      depthShiftDb: -7.5,
      panPosition: 0.3,
      stereoWidth: 0.52,
      delayOffsetMs: 18,
      highPassHz: 240,
      saturationDb: 0.6,
      reverbMix: 0.11,
      confidence: 0.7,
      rationale: 'supportive',
      riskNotes: [],
      interactionNotes: [],
    },
    alternateRecommendations: [],
    rationale: 'supportive',
    riskNotes: [],
    interactionNotes: [],
  },
  delayAutomation: {
    shouldApply: true,
    overallConfidence: 0.7,
    primaryRecommendation: {
      useCase: 'emphasis',
      triggerHint: 'hook tail',
      triggerLocationHint: 'hook tail',
      delayType: 'dotted_eighth',
      tempoDivision: 'dotted-eighth throw',
      timeMs: 240,
      feedback: 0.16,
      wetLevel: 0.14,
      stereoSpread: 0.32,
      confidence: 0.7,
      rationale: 'throw',
      riskNotes: [],
      interactionNotes: [],
    },
    alternateRecommendations: [],
    rationale: 'throw',
    riskNotes: [],
    interactionNotes: [],
  },
  guardrails: {
    score: 76,
    verdict: 'watch',
    riskNotes: ['midrange busy'],
    interactionNotes: [],
    rationale: 'acceptable risk',
  } as any,
});

const sparseField = buildAPLPerceptualField({
  arrangement: {
    sections: [
      { name: 'verse', startTime: 0, endTime: 8, energy: 0.32, density: 0.28, rmsDb: -20.8, peakDb: -8.1, dynamics: 4.2 },
      { name: 'chorus', startTime: 8, endTime: 16, energy: 0.52, density: 0.34, rmsDb: -18.6, peakDb: -6.2, dynamics: 3.7 },
    ],
    energyCurve: [0.32, 0.36, 0.52],
    dynamicRange: 9.8,
    loudestSection: 'chorus',
    quietestSection: 'verse',
    suggestedFocus: ['more air'],
    overallFlow: 'building',
  },
  vocalIntent: {
    intent: 'intimate',
    confidence: 0.88,
    indicators: { proximity: 0.72, dynamicsIntensity: 0.28, breathing: 0.66, aggression: 0.12, melodicFocus: 0.74, warmth: 0.64 },
    compressionImpact: { recommended_ratio: 2.0, recommended_style: 'transparent', reasoning: 'gentle' },
    saturationImpact: { recommended_drive: 0.45, reasoning: 'warmth' },
    presenceImpact: { needs_presence_boost: false, reason: 'natural' },
    rationale: 'intimate lead',
    riskNotes: [],
    interactionNotes: [],
  },
  contextAwareness: {
    shouldApply: true,
    overallConfidence: 0.77,
    densityScore: 0.3,
    densityClass: 'sparse',
    frequencyMasking: { lowEnd: 0.24, midRange: 0.28, highEnd: 0.18 },
    availableSpaceBands: [],
    suggestedVocalRange: { minHz: 110, maxHz: 280 },
    compressionAdjustment: { direction: 'loosen', amount: 0.1, rationale: 'looser' },
    presenceAdjustment: { direction: 'reduce', amount: 0.08, rationale: 'reduce presence' },
    delayAdjustment: { direction: 'increase', amount: 0.12, rationale: 'more delay' },
    hookLiftAdjustment: { direction: 'reduce', amount: 0.06, rationale: 'less lift' },
    adLibAdjustment: { direction: 'bring_forward', amount: 0.08, rationale: 'bring adlibs forward' },
    saturationAdjustment: { direction: 'increase', amount: 0.08, rationale: 'more color' },
    verdict: 'open and sparse',
    rationale: 'open context',
    riskNotes: [],
    interactionNotes: [],
  },
  hookLift: {
    shouldApply: false,
    overallConfidence: 0.48,
    verseSectionHint: 'verse',
    hookSectionHint: 'chorus',
    amountOfLift: 0.1,
    verseVsHookContrast: {
      verseEnergy: 0.28,
      hookEnergy: 0.52,
      contrastScore: 0.24,
      emotionalLift: 'subtle',
    },
    tactics: [],
    rationale: 'subtle',
    riskNotes: [],
    interactionNotes: [],
  },
  adLibPlacement: {
    shouldApply: false,
    overallConfidence: 0.41,
    primaryRecommendation: undefined,
    alternateRecommendations: [],
    rationale: 'not needed',
    riskNotes: [],
    interactionNotes: [],
  },
  delayAutomation: {
    shouldApply: false,
    overallConfidence: 0.42,
    alternateRecommendations: [],
    rationale: 'not needed',
    riskNotes: [],
    interactionNotes: [],
    primaryRecommendation: undefined,
  },
  guardrails: {
    score: 91,
    verdict: 'good',
    riskNotes: [],
    interactionNotes: [],
    rationale: 'safe',
  } as any,
});

describe('APL perceptual field', () => {
  test('compresses dense aggression into a higher density, lower dynamic target field', () => {
    expect(denseField.density).toBeGreaterThan(0.7);
    expect(denseField.punch).toBeGreaterThan(0.6);
    expect(denseField.restraint).toBeLessThan(0.7);
    expect(denseField.targetDynamicRange).toBeLessThan(6.5);
    expect(denseField.targetLufs).toBeGreaterThan(-13.4);
  });

  test('opens sparse intimate material into a clearer, less aggressive field', () => {
    expect(sparseField.clarity).toBeGreaterThan(denseField.clarity);
    expect(sparseField.width).toBeGreaterThan(denseField.width);
    expect(sparseField.depth).toBeGreaterThan(denseField.depth);
    expect(sparseField.targetDynamicRange).toBeGreaterThan(denseField.targetDynamicRange);
    expect(sparseField.peakCeilingDb).toBeLessThanOrEqual(-0.3);
  });
});
