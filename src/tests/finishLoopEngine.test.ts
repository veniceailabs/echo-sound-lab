import { describe, expect, test } from 'vitest';
import { analyzeFinishLoop } from '../services/finishing/finishLoopEngine';

const readyPhaseCMastering: any = {
  verdict: 'ready',
  shouldApply: false,
  overallConfidence: 0.92,
  rationale: 'Ready',
  riskNotes: [],
  interactionNotes: [],
  finalTranslation: {
    verdict: 'translation_ready',
    shouldApply: false,
    overallConfidence: 0.93,
    targets: [
      { device: 'mono', score: 0.91, risk: 'good', recommendation: 'Mono is stable.' },
      { device: 'phone', score: 0.89, risk: 'good', recommendation: 'Phone is stable.' },
      { device: 'car', score: 0.9, risk: 'good', recommendation: 'Car is stable.' },
      { device: 'airpods', score: 0.88, risk: 'good', recommendation: 'AirPods are stable.' },
    ],
    rationale: 'Translation ready',
    riskNotes: [],
    interactionNotes: [],
  },
};

const readyLowEnd: any = {
  verdict: 'tight',
  shouldApply: false,
  overallConfidence: 0.9,
  riskNotes: [],
  interactionNotes: [],
  translationValidation: {
    verdict: 'translation_ready',
    shouldApply: false,
    overallConfidence: 0.91,
    targets: [
      { device: 'mono', score: 0.9, risk: 'stable', recommendation: 'Mono is stable.' },
      { device: 'phone', score: 0.88, risk: 'stable', recommendation: 'Phone is stable.' },
      { device: 'car', score: 0.91, risk: 'stable', recommendation: 'Car is stable.' },
      { device: 'airpods', score: 0.87, risk: 'stable', recommendation: 'AirPods are stable.' },
    ],
    rationale: 'Low end is stable',
    riskNotes: [],
    interactionNotes: [],
  },
};

const readySessionFinish: any = {
  shouldApply: false,
  analysisFingerprint: '12345678',
  verdict: 'ready',
  authorityScore: 91,
  summary: 'Release-safe.',
  priorities: ['Reference match: 90%'],
  warnings: [],
  recommendations: ['Keep it as-is.'],
};

const readyAlbum: any = {
  shouldApply: false,
  analysisFingerprint: '87654321',
  verdict: 'album_ready',
  trackCount: 3,
  consistencyScore: 88,
  loudnessSpread: 0.4,
  tonalSpread: 0.03,
  transientSpread: 0.04,
  currentTrackVibeMatch: 90,
  sequenceNotes: [],
  recommendations: ['Album cohesion is stable enough to trust the current batch direction.'],
  riskNotes: [],
};

const readyReference: any = {
  shouldApply: false,
  analysisFingerprint: 'abcdef12',
  matchScore: 91,
  loudness: { current: -14, reference: -14, delta: 0, severity: 'low' },
  dynamics: { crestFactorCurrent: 7.5, crestFactorReference: 7.4, delta: 0.1, severity: 'low' },
  tonal: {
    low: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    high: 0,
    current: { low: 0.25, lowMid: 0.25, mid: 0.25, highMid: 0.15, high: 0.1 },
    reference: { low: 0.25, lowMid: 0.25, mid: 0.25, highMid: 0.15, high: 0.1 },
  },
  stereo: {
    low: 0,
    mid: 0,
    high: 0,
    current: { low: 0.45, mid: 0.5, high: 0.55 },
    reference: { low: 0.45, mid: 0.5, high: 0.55 },
  },
  summary: 'Close to reference.',
  recommendations: ['Reference alignment is close enough to trust the current finish path.'],
  riskNotes: [],
  interactionNotes: [],
};

const readyNarrative: any = {
  shouldApply: false,
  analysisFingerprint: 'ff00aa11',
  overallArc: 'building',
  hierarchy: { anchors: 1, supports: 2, transitions: 1, totalSections: 4 },
  continuity: { tonal: 0.9, energy: 0.92, pacing: 0.88 },
  decisions: [],
  rationale: 'Arc is coherent.',
  riskNotes: [],
  interactionNotes: [],
};

const readyConsequence: any = {
  shouldApply: false,
  overallConfidence: 0.91,
  analysisFingerprint: 'aa11bb22',
  targets: [
    { system: 'iphone', riskType: 'fatigue', severity: 'low', confidence: 0.9, listenerImpact: 'good', recommendation: 'fine', evidence: [], secondaryRiskTypes: [] },
    { system: 'car', riskType: 'impact_loss', severity: 'low', confidence: 0.9, listenerImpact: 'good', recommendation: 'fine', evidence: [], secondaryRiskTypes: [] },
    { system: 'earbuds', riskType: 'fatigue', severity: 'low', confidence: 0.9, listenerImpact: 'good', recommendation: 'fine', evidence: [], secondaryRiskTypes: [] },
    { system: 'club', riskType: 'impact_loss', severity: 'low', confidence: 0.9, listenerImpact: 'good', recommendation: 'fine', evidence: [], secondaryRiskTypes: [] },
  ],
  summary: 'No major consequences.',
  riskNotes: [],
  interactionNotes: [],
};

const readyIntent: any = {
  intent: 'melodic',
  confidence: 0.9,
  indicators: {
    proximity: 0.5,
    dynamicsIntensity: 0.5,
    breathing: 0.4,
    aggression: 0.3,
    melodicFocus: 0.8,
  },
  compressionImpact: { recommended_ratio: 2, recommended_style: 'musical', reasoning: 'Clean.' },
  saturationImpact: { recommended_drive: 1, reasoning: 'Clean.' },
  presenceImpact: { needs_presence_boost: false, reason: 'Clean.' },
};

describe('FinishLoopEngine', () => {
  test('locks when translation, reference, and album signals are stable', () => {
    const result = analyzeFinishLoop({
      sessionNarrative: readyNarrative,
      consequence: readyConsequence,
      album: readyAlbum,
      referenceDelta: readyReference,
      phaseCMastering: readyPhaseCMastering,
      lowEnd: readyLowEnd,
      vocalIntent: readyIntent,
      sessionFinish: readySessionFinish,
    });

    expect(result.analysisFingerprint).toHaveLength(8);
    expect(result.verdict).toBe('PASS');
    expect(result.finishScore).toBeGreaterThan(8);
    expect(result.translationAuthority.verdict).toBe('pass');
    expect(result.blockers.length).toBe(0);
    expect(result.iterationsSuggested).toBe(0);
  });

  test('blocks when translation or consequence signals are still unstable', () => {
    const result = analyzeFinishLoop({
      sessionNarrative: readyNarrative,
      consequence: {
        ...readyConsequence,
        targets: readyConsequence.targets.map((target: any) => ({
          ...target,
          severity: 'critical',
        })),
      },
      album: {
        ...readyAlbum,
        consistencyScore: 64,
        shouldApply: true,
        verdict: 'needs_consistency',
      },
      referenceDelta: {
        ...readyReference,
        matchScore: 68,
        shouldApply: true,
        loudness: { ...readyReference.loudness, severity: 'high' },
      },
      phaseCMastering: {
        ...readyPhaseCMastering,
        finalTranslation: {
          ...readyPhaseCMastering.finalTranslation,
          verdict: 'needs_translation_work',
          shouldApply: true,
          targets: readyPhaseCMastering.finalTranslation.targets.map((target: any) => ({
            ...target,
            score: 0.46,
          })),
        },
      },
      lowEnd: {
        ...readyLowEnd,
        verdict: 'needs_translation',
        shouldApply: true,
        translationValidation: {
          ...readyLowEnd.translationValidation,
          verdict: 'needs_translation_work',
          shouldApply: true,
          targets: readyLowEnd.translationValidation.targets.map((target: any) => ({
            ...target,
            score: 0.44,
          })),
        },
      },
      vocalIntent: readyIntent,
      sessionFinish: {
        ...readySessionFinish,
        verdict: 'needs_attention',
        shouldApply: true,
      },
    });

    expect(result.verdict).toBe('FAIL');
    expect(result.shouldApply).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.translationAuthority.verdict).toBe('fail');
    expect(result.iterationsSuggested).toBeGreaterThanOrEqual(2);
  });
});
