import { describe, expect, test } from 'vitest';
import { CohesionEngine } from '../services/cohesionEngine';
import { analyzeAlbumAuthority } from '../services/finishing/albumAuthorityEngine';
import type { CohesionTrackReport } from '../types';

const tracks: CohesionTrackReport[] = [
  {
    id: 'a',
    trackName: 'Intro',
    lufs: -14.2,
    tonalCentroid: [0.34, 0.35, 0.31],
    harmonicWeight: 0.64,
    stereoWidth: 0.46,
    transientDensity: 0.5,
    humanIntentIndex: 80,
  },
  {
    id: 'b',
    trackName: 'Closer',
    lufs: -13.4,
    tonalCentroid: [0.35, 0.34, 0.31],
    harmonicWeight: 0.67,
    stereoWidth: 0.53,
    transientDensity: 0.57,
    humanIntentIndex: 85,
  },
];

describe('AlbumAuthorityEngine', () => {
  test('summarizes cohort consistency and current-track vibe match', () => {
    const profile = CohesionEngine.generateProfile(tracks, { name: 'Album DNA' });
    const currentTrack = tracks[1];
    const result = analyzeAlbumAuthority({ profile, tracks, currentTrack });

    expect(result.analysisFingerprint).toHaveLength(8);
    expect(result.trackCount).toBe(2);
    expect(result.consistencyScore).toBeGreaterThan(0);
    expect(result.currentTrackVibeMatch).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
