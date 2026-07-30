import { describe, expect, test } from 'vitest';
import { analyzeSessionFinishAuthority } from '../services/finishing/sessionFinishAuthority';
import type { AlbumAuthorityAnalysis } from '../services/finishing/albumAuthorityEngine';
import type { PerceptualConsequenceAnalysis } from '../services/finishing/perceptualConsequenceEngine';
import type { ReferenceDeltaAnalysis } from '../services/finishing/referenceDeltaEngine';
import type { SessionNarrativeAnalysis } from '../services/finishing/sessionNarrativeEngine';

const narrative: SessionNarrativeAnalysis = {
  shouldApply: true,
  analysisFingerprint: 'abcd1234',
  overallArc: 'building',
  hierarchy: { anchors: 1, supports: 2, transitions: 1, totalSections: 4 },
  continuity: { tonal: 0.82, energy: 0.76, pacing: 0.71 },
  decisions: [],
  rationale: 'Building arc',
  riskNotes: [],
  interactionNotes: [],
};

const consequence: PerceptualConsequenceAnalysis = {
  shouldApply: true,
  overallConfidence: 0.76,
  analysisFingerprint: 'efgh5678',
  targets: [],
  summary: 'Car playback needs attention.',
  riskNotes: ['car is risky'],
  interactionNotes: [],
};

const album: AlbumAuthorityAnalysis = {
  shouldApply: false,
  analysisFingerprint: 'ijkl9012',
  verdict: 'album_ready',
  trackCount: 2,
  consistencyScore: 88,
  loudnessSpread: 0.8,
  tonalSpread: 0.04,
  transientSpread: 0.03,
  currentTrackVibeMatch: 87,
  sequenceNotes: [],
  recommendations: ['Album cohesion is stable enough to trust the current batch direction.'],
  riskNotes: [],
};

const referenceDelta: ReferenceDeltaAnalysis = {
  shouldApply: false,
  analysisFingerprint: 'mnop3456',
  matchScore: 86,
  loudness: { current: -12.9, reference: -13.8, delta: 0.9, severity: 'low' },
  dynamics: { crestFactorCurrent: 7.4, crestFactorReference: 8.0, delta: -0.6, severity: 'low' },
  tonal: {
    low: 0.01,
    lowMid: -0.02,
    mid: 0.00,
    highMid: 0.01,
    high: 0.00,
    current: { low: 0.24, lowMid: 0.24, mid: 0.25, highMid: 0.15, high: 0.12 },
    reference: { low: 0.23, lowMid: 0.26, mid: 0.25, highMid: 0.14, high: 0.12 },
  },
  stereo: {
    low: 0.01,
    mid: 0.00,
    high: 0.02,
    current: { low: 0.42, mid: 0.51, high: 0.56 },
    reference: { low: 0.41, mid: 0.51, high: 0.54 },
  },
  summary: 'The current mix is living in the same target world as the reference.',
  recommendations: ['Reference alignment is close enough to trust the current finish path.'],
  riskNotes: [],
  interactionNotes: [],
};

describe('SessionFinishAuthority', () => {
  test('combines narrative, consequence, album, and reference signals', () => {
    const result = analyzeSessionFinishAuthority({
      narrative,
      consequence,
      album,
      referenceDelta,
    });

    expect(result.analysisFingerprint).toHaveLength(8);
    expect(result.authorityScore).toBeGreaterThan(0);
    expect(result.priorities.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
