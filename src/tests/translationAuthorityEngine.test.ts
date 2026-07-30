import { describe, expect, test } from 'vitest';
import { analyzeTranslationAuthority } from '../services/finishing/translationAuthorityEngine';

const readyPhaseCMastering: any = {
  verdict: 'ready',
  shouldApply: false,
  overallConfidence: 0.91,
  rationale: 'Release-safe finish',
  riskNotes: [],
  interactionNotes: [],
  finalTranslation: {
    verdict: 'translation_ready',
    shouldApply: false,
    overallConfidence: 0.93,
    targets: [
      { device: 'mono', score: 0.9, risk: 'good', recommendation: 'Mono is stable.' },
      { device: 'phone', score: 0.88, risk: 'good', recommendation: 'Phone is stable.' },
      { device: 'car', score: 0.91, risk: 'good', recommendation: 'Car is stable.' },
      { device: 'airpods', score: 0.86, risk: 'good', recommendation: 'AirPods are stable.' },
    ],
    rationale: 'Translation ready',
    riskNotes: [],
    interactionNotes: [],
  },
};

const readyLowEnd: any = {
  verdict: 'tight',
  shouldApply: false,
  overallConfidence: 0.89,
  riskNotes: [],
  interactionNotes: [],
  translationValidation: {
    verdict: 'translation_ready',
    shouldApply: false,
    overallConfidence: 0.91,
    targets: [
      { device: 'mono', score: 0.88, risk: 'stable', recommendation: 'Mono is stable.' },
      { device: 'phone', score: 0.87, risk: 'stable', recommendation: 'Phone is stable.' },
      { device: 'car', score: 0.9, risk: 'stable', recommendation: 'Car is stable.' },
      { device: 'airpods', score: 0.86, risk: 'stable', recommendation: 'AirPods are stable.' },
    ],
    rationale: 'Low end is stable',
    riskNotes: [],
    interactionNotes: [],
  },
};

describe('TranslationAuthorityEngine', () => {
  test('passes when all major playback targets are stable', () => {
    const result = analyzeTranslationAuthority({
      phaseCMastering: readyPhaseCMastering,
      lowEnd: readyLowEnd,
    });

    expect(result.analysisFingerprint).toHaveLength(8);
    expect(result.verdict).toBe('pass');
    expect(result.targets.every((target) => target.verdict === 'pass')).toBe(true);
    expect(result.finishScore).toBeGreaterThan(0);
    expect(result.blockers.length).toBe(0);
  });

  test('fails when translation is unstable', () => {
    const result = analyzeTranslationAuthority({
      phaseCMastering: {
        ...readyPhaseCMastering,
        finalTranslation: {
          ...readyPhaseCMastering.finalTranslation,
          targets: [
            { device: 'mono', score: 0.41, risk: 'weak', recommendation: 'Fix mono.' },
            { device: 'phone', score: 0.52, risk: 'weak', recommendation: 'Fix phone.' },
            { device: 'car', score: 0.38, risk: 'weak', recommendation: 'Fix car.' },
            { device: 'airpods', score: 0.44, risk: 'weak', recommendation: 'Fix airpods.' },
          ],
          verdict: 'needs_translation_work',
          shouldApply: true,
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
            score: 0.42,
          })),
        },
      },
    });

    expect(result.verdict).toBe('fail');
    expect(result.shouldApply).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.targets.some((target) => target.verdict === 'fail')).toBe(true);
  });
});
