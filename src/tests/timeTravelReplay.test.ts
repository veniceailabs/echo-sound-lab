import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';

const BASE_STATE: ReplayState = {
  sessionId: 'session-time-travel-1',
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
      sourceId: 'clip-1',
      startTimeSec: 0,
      offsetSec: 0,
      durationSec: 12,
      gainDb: 0,
    },
  ],
  automation: [],
};

function proposalFactory(
  proposalId: string,
  actionType: APLProposal['action']['type'],
  parameters: Record<string, unknown>,
  trackId = 'track-main'
): APLProposal {
  return {
    proposalId,
    trackId,
    trackName: trackId === 'track-main' ? 'Main' : trackId,
    action: {
      type: actionType,
      description: `${actionType} action`,
      parameters,
    },
    evidence: {
      metric: 'time-travel',
      currentValue: 1,
      targetValue: 1,
      rationale: 'history scrubber replay test',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('Time Travel Replay', () => {
  test('scrub index replay matches originally recorded state hash at each point', async () => {
    const proposals: APLProposal[] = [
      proposalFactory('p1', 'ADD_TRACK', { trackId: 'track-vocals', trackName: 'Vocals', trackType: 'audio' }, 'track-vocals'),
      proposalFactory('p2', 'MOVE_REGION', { regionId: 'region-1', targetTrackId: 'track-main', startTimeSec: 4 }),
      proposalFactory('p3', 'SPLIT_REGION', { regionId: 'region-1', splitTimeSec: 9 }),
      proposalFactory('p4', 'SET_AUTOMATION_POINT', { trackId: 'track-main', parameter: 'volumeDb', timeSec: 3.5, value: -4.5 }),
    ];

    const baseReplay = await runDeterministicReplay(BASE_STATE, []);
    const recordedHashes: string[] = [baseReplay.outputStateHash];
    let rollingState = baseReplay.outputState;

    for (const proposal of proposals) {
      const stepReplay = await runDeterministicReplay(rollingState, [proposal]);
      rollingState = stepReplay.outputState;
      recordedHashes.push(stepReplay.outputStateHash);
    }

    for (let index = 0; index <= proposals.length; index++) {
      const replayAtIndex = await runDeterministicReplay(BASE_STATE, proposals.slice(0, index));
      expect(replayAtIndex.outputStateHash).toBe(recordedHashes[index]);
    }
  });
});
