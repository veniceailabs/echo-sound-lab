import { describe, expect, test } from 'vitest';
import { CohesionEngine } from '../services/cohesionEngine';
import { CohesionTrackReport } from '../types';

const tracks: CohesionTrackReport[] = [
  {
    id: 't1',
    trackName: 'Intro',
    lufs: -13.8,
    tonalCentroid: [0.34, 0.36, 0.30],
    harmonicWeight: 0.62,
    stereoWidth: 0.48,
    transientDensity: 0.52,
    humanIntentIndex: 82,
  },
  {
    id: 't2',
    trackName: 'Finale',
    lufs: -12.9,
    tonalCentroid: [0.36, 0.34, 0.30],
    harmonicWeight: 0.68,
    stereoWidth: 0.55,
    transientDensity: 0.58,
    humanIntentIndex: 86,
  },
];

describe('CohesionEngine', () => {
  test('generates an album profile from reports', () => {
    const profile = CohesionEngine.generateProfile(tracks, { name: 'EP DNA' });
    expect(profile.name).toBe('EP DNA');
    expect(profile.tracks).toEqual(['t1', 't2']);
    expect(profile.targetLoudness).toBeCloseTo(-13.35, 2);
  });

  test('returns a bounded vibe match score', () => {
    const profile = CohesionEngine.generateProfile(tracks);
    const score = CohesionEngine.calculateTrackVibeMatch(tracks[0], profile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

