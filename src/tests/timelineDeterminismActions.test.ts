import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';

const BASE_TIMELINE_STATE: ReplayState = {
  sessionId: 'session-timeline-1',
  workspaceId: 'workspace-main',
  tracks: [
    {
      trackId: 'track-main',
      trackName: 'Main',
      kind: 'audio',
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      appliedProposalIds: [],
      trackStateHash: '',
    },
  ],
  regions: [
    {
      regionId: 'region-1',
      trackId: 'track-main',
      sourceId: 'clip-a',
      startTimeSec: 0,
      offsetSec: 0,
      durationSec: 8,
    },
  ],
  automation: [],
  metadata: {
    sampleRate: 44100,
  },
};

function proposalFactory(
  proposalId: string,
  type: APLProposal['action']['type'] | 'ADD_TRACK' | 'MOVE_REGION' | 'SPLIT_REGION' | 'SET_AUTOMATION_POINT',
  parameters: Record<string, unknown>
): APLProposal {
  return {
    proposalId,
    trackId: String(parameters.trackId ?? 'track-main'),
    trackName: 'Main',
    action: {
      type: type as APLProposal['action']['type'],
      description: `${type} action`,
      parameters,
    },
    evidence: {
      metric: 'timeline-test',
      currentValue: 1,
      targetValue: 1,
      rationale: 'timeline deterministic test',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('Timeline Determinism Actions', () => {
  test('ADD_TRACK deterministically updates output hash and creates a track', async () => {
    const noActionRun = await runDeterministicReplay(BASE_TIMELINE_STATE, []);
    const addTrackRun = await runDeterministicReplay(BASE_TIMELINE_STATE, [
      proposalFactory('p-add-track', 'ADD_TRACK', {
        trackId: 'track-vocals',
        trackName: 'Vocals',
        trackType: 'audio',
      }),
    ]);

    expect(addTrackRun.outputStateHash).not.toBe(noActionRun.outputStateHash);
    const hasVocals = addTrackRun.outputState.tracks.some((track) => track.trackId === 'track-vocals');
    expect(hasVocals).toBe(true);
  });

  test('MOVE_REGION + SPLIT_REGION deterministically mutates timeline regions', async () => {
    const proposals: APLProposal[] = [
      proposalFactory('p-move', 'MOVE_REGION', {
        regionId: 'region-1',
        targetTrackId: 'track-main',
        startTimeSec: 12,
      }),
      proposalFactory('p-split', 'SPLIT_REGION', {
        regionId: 'region-1',
        splitTimeSec: 15,
      }),
    ];

    const runA = await runDeterministicReplay(BASE_TIMELINE_STATE, proposals);
    const runB = await runDeterministicReplay(BASE_TIMELINE_STATE, proposals, {
      seed: 999,
      clockStartMs: 1234,
    });

    expect(runA.outputStateHash).toBe(runB.outputStateHash);
    const splitRegions = runA.outputState.regions.filter((region) => String(region.regionId).startsWith('region-1'));
    expect(splitRegions.length).toBe(2);
  });

  test('SET_AUTOMATION_POINT is deterministic across key ordering', async () => {
    const sequenceA: APLProposal[] = [
      proposalFactory('p-auto', 'SET_AUTOMATION_POINT', {
        trackId: 'track-main',
        parameter: 'volumeDb',
        timeSec: 3.5,
        value: -6,
      }),
    ];
    const sequenceB: APLProposal[] = [
      proposalFactory('p-auto', 'SET_AUTOMATION_POINT', {
        value: -6,
        timeSec: 3.5,
        parameter: 'volumeDb',
        trackId: 'track-main',
      }),
    ];

    const runA = await runDeterministicReplay(BASE_TIMELINE_STATE, sequenceA);
    const runB = await runDeterministicReplay(BASE_TIMELINE_STATE, sequenceB);

    expect(runA.aplSequenceHash).toBe(runB.aplSequenceHash);
    expect(runA.outputStateHash).toBe(runB.outputStateHash);
    expect(runA.outputState.automation.length).toBeGreaterThan(0);
  });
});
