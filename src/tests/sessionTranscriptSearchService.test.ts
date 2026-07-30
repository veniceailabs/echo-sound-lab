import { describe, expect, test } from 'vitest';
import type { ReplayState } from '../services/deterministicReplayService';
import {
  buildSessionTranscriptSearchIndex,
  buildWordSpotMarkers,
  searchSessionTranscriptIndex,
  type TranscriptSegment,
} from '../services/sessionTranscriptSearchService';

function makeTimeline(): ReplayState {
  return {
    sessionId: 'session-transcript',
    workspaceId: 'workspace-transcript',
    tracks: [],
    regions: [
      {
        regionId: 'lead-vocal-hook',
        trackId: 'vox',
        sourceId: 'lead-vocal.wav',
        startTimeSec: 32,
        offsetSec: 0,
        durationSec: 12,
      },
    ],
    automation: [],
    markers: [{ id: 'hook', timeSec: 32, label: 'Hook', color: '#fff', note: 'Big chorus lift' }],
    metadata: {},
  } as ReplayState;
}

const transcript: TranscriptSegment[] = [
  {
    segmentId: 'seg-1',
    startSec: 31.8,
    endSec: 35.2,
    speakerId: 'artist',
    text: 'I need the hook to feel bigger when the chorus hits',
    words: [
      { word: 'hook', startSec: 32.1, endSec: 32.4, confidence: 0.97, speakerId: 'artist' },
      { word: 'chorus', startSec: 34.4, endSec: 34.8, confidence: 0.93, speakerId: 'artist' },
    ],
  },
  {
    segmentId: 'seg-2',
    startSec: 64,
    endSec: 67,
    speakerId: 'engineer',
    text: 'The bridge needs less low mid buildup',
  },
];

describe('sessionTranscriptSearchService', () => {
  test('indexes transcripts, markers, and regions for timeline search', () => {
    const index = buildSessionTranscriptSearchIndex(makeTimeline(), transcript);
    const hits = searchSessionTranscriptIndex(index, 'chorus hook', { limit: 3 });

    expect(index.entries.length).toBeGreaterThanOrEqual(4);
    expect(index.speakers).toEqual(['artist', 'engineer']);
    expect(hits[0]?.entry.kind).toBe('transcript');
    expect(hits[0]?.jumpToSec).toBeCloseTo(31.8);
    expect(hits[0]?.matchedTerms).toEqual(['chorus', 'hook']);
  });

  test('creates word spot markers from transcript terms', () => {
    const markers = buildWordSpotMarkers(transcript, 'hook');

    expect(markers).toHaveLength(1);
    expect(markers[0].timeSec).toBeCloseTo(32.1);
    expect(markers[0].label).toContain('hook');
  });
});
