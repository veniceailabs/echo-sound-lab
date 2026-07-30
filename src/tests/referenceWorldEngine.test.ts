import { describe, expect, test } from 'vitest';
import {
  analyzeReferenceWorld,
  REFERENCE_WORLD_PROFILES,
  resolveReferenceWorldPitchPreset,
} from '../services/finishing/referenceWorldEngine';

describe('ReferenceWorldEngine', () => {
  test('exposes benchmark worlds and stable pitch presets', () => {
    expect(REFERENCE_WORLD_PROFILES.length).toBeGreaterThanOrEqual(4);
    const preset = resolveReferenceWorldPitchPreset('lyrical_clarity');
    expect(preset.enabled).toBe(true);
    expect(preset.formantPreserve).toBe(true);
  });

  test('scores a mixed context and returns a best-fit world', () => {
    const result = analyzeReferenceWorld({
      phaseCMastering: {
        shouldApply: false,
        overallConfidence: 0.88,
        busGlue: { shouldApply: false, overallConfidence: 0.9, glueAmount: 0.15, character: 'neutral', rationale: '', riskNotes: [], interactionNotes: [] },
        loudnessControl: { shouldApply: false, overallConfidence: 0.86, currentLUFS: -14, targetLUFS: -14, targetTruePeakDb: -1, expectedGainDb: 0, dynamicRangeTargetDb: 8, headroomDb: 1, headroomScore: 0.9, streamingAlignment: { spotify: true, appleMusic: true, youtube: true, tidal: true }, rationale: '', riskNotes: [], interactionNotes: [] },
        topEndPolish: { shouldApply: false, overallConfidence: 0.9, shelfFrequencyHz: 10000, gainDb: 0.2, q: 0.56, character: 'neutral', airWindowHz: { startHz: 10000, endHz: 16000 }, harshnessRisk: 0.2, rationale: '', riskNotes: [], interactionNotes: [] },
        referenceMastering: { shouldApply: false, overallConfidence: 0.9, referenceAnchor: 'balanced_release', targetLUFS: -14, targetTruePeakDb: -1, targetDynamicRangeDb: 8, targetLowBalance: { min: 0.22, max: 0.33, ideal: 0.28 }, targetMidBalance: { min: 0.3, max: 0.46, ideal: 0.38 }, targetHighBalance: { min: 0.16, max: 0.28, ideal: 0.22 }, rationale: '', riskNotes: [], interactionNotes: [] },
        finalTranslation: { shouldApply: false, overallConfidence: 0.92, targets: [
          { device: 'mono', score: 0.91, verdict: 'pass', blocker: '', recommendation: '' },
          { device: 'phone', score: 0.89, verdict: 'pass', blocker: '', recommendation: '' },
          { device: 'car', score: 0.92, verdict: 'pass', blocker: '', recommendation: '' },
          { device: 'airpods', score: 0.87, verdict: 'pass', blocker: '', recommendation: '' },
        ], verdict: 'translation_ready', rationale: '', riskNotes: [], interactionNotes: [] },
        verdict: 'ready',
        rationale: '',
        riskNotes: [],
        interactionNotes: [],
      } as any,
      lowEnd: {
        shouldApply: false,
        overallConfidence: 0.9,
        kickBassControl: { shouldApply: false, overallConfidence: 0.9, lowBandPowerDb: -22, midLowPowerDb: -26, highPassPowerDb: -44, lowToMidRatio: 1.1, lowToHighRatio: 1.2, maskingScore: 0.2, pocketScore: 0.88, dominantFocus: 'shared', focusBands: [], recommendation: '', riskNotes: [], interactionNotes: [] },
        note808Consistency: { shouldApply: false, overallConfidence: 0.88, dominantFundamentalHz: 55, dominantNote: 'A', noteVarianceHz: 1.2, stabilityScore: 0.92, activeWindowRatio: 0.92, windowNotes: [], recommendation: '', riskNotes: [], interactionNotes: [] },
        stereoLowMono: { shouldApply: false, overallConfidence: 0.9, lowBandCorrelation: 0.94, lowBandBalance: 0.9, monoBelow120Score: 0.95, crossoverHz: 120, widthReduction: 0, shouldCollapseToMono: false, recommendation: '', riskNotes: [], interactionNotes: [] },
        drumPocket: { shouldApply: false, overallConfidence: 0.91, transientWeightScore: 0.88, pocketScore: 0.9, rhythmicConsistency: 0.9, pocketClass: 'tight', windows: [], recommendation: '', riskNotes: [], interactionNotes: [] },
        translationValidation: {
          shouldApply: false,
          overallConfidence: 0.91,
          targets: [
            { device: 'mono', score: 0.9, risk: 'stable', recommendation: '' },
            { device: 'phone', score: 0.9, risk: 'stable', recommendation: '' },
            { device: 'car', score: 0.91, risk: 'stable', recommendation: '' },
            { device: 'airpods', score: 0.89, risk: 'stable', recommendation: '' },
          ],
          verdict: 'translation_ready',
          rationale: '',
          riskNotes: [],
          interactionNotes: [],
        },
        verdict: 'stable',
        rationale: '',
        riskNotes: [],
        interactionNotes: [],
      } as any,
      vocalIntent: {
        intent: 'melodic',
        confidence: 0.86,
        indicators: { proximity: 0.5, dynamicsIntensity: 0.52, breathing: 0.44, aggression: 0.3, melodicFocus: 0.84 },
        compressionImpact: { recommended_ratio: 2.2, recommended_style: 'musical', reasoning: '' },
        saturationImpact: { recommended_drive: 1, reasoning: '' },
        presenceImpact: { needs_presence_boost: false, reason: '' },
      } as any,
      referenceDelta: {
        shouldApply: false,
        analysisFingerprint: 'abcdef12',
        matchScore: 88,
        loudness: { current: -14, reference: -14, delta: 0, severity: 'low' },
        dynamics: { crestFactorCurrent: 7.6, crestFactorReference: 7.4, delta: 0.2, severity: 'low' },
        tonal: {
          low: 0,
          lowMid: 0,
          mid: 0,
          highMid: 0,
          high: 0,
          current: { low: 0.25, lowMid: 0.25, mid: 0.25, highMid: 0.15, high: 0.1 },
          reference: { low: 0.24, lowMid: 0.25, mid: 0.26, highMid: 0.15, high: 0.1 },
        },
        stereo: {
          low: 0,
          mid: 0,
          high: 0,
          current: { low: 0.45, mid: 0.5, high: 0.55 },
          reference: { low: 0.45, mid: 0.5, high: 0.55 },
        },
        summary: '',
        recommendations: [],
        riskNotes: [],
        interactionNotes: [],
      } as any,
    });

    expect(result.bestProfile).toBeDefined();
    expect(result.profileScores.length).toBeGreaterThanOrEqual(4);
    expect(result.recommendedPitchPreset.enabled).toBe(true);
    expect(result.profileScores[0].score).toBeGreaterThan(70);
  });
});

