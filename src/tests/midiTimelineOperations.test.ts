import { describe, expect, test } from 'vitest';
import { runDeterministicReplay, type ReplayState } from '../services/deterministicReplayService';
import { buildTimelineBranchDiffSummary } from '../services/timelineBranchDiffService';
import type { APLProposal } from '../echo-sound-lab/apl/proposal-engine';

function makeBaseState(): ReplayState {
  return {
    sessionId: 'session-midi',
    workspaceId: 'workspace-midi',
    tracks: [
      {
        trackId: 'keys',
        trackName: 'Keys',
        kind: 'midi',
        groupId: null,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        limiterThresholdDb: null,
        normalizedTargetLUFS: null,
        dcRemovalHz: null,
        outputBusId: null,
        sends: [],
        appliedProposalIds: [],
        trackStateHash: '',
        inserts: [],
      },
    ],
    regions: [],
    midiNotes: [],
    automation: [],
    trackGroups: [],
    markers: [],
    compLanes: [],
    metadata: {},
  };
}

function proposal(action: APLProposal['action']['type'], parameters: Record<string, unknown>): APLProposal {
  return {
    proposalId: `${action.toLowerCase()}-proposal`,
    trackId: 'keys',
    trackName: 'Keys',
    action: {
      type: action,
      description: action,
      parameters,
    },
    evidence: {
      metric: 'test',
      currentValue: 0,
      targetValue: 1,
      rationale: 'test',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('midi timeline operations', () => {
  test('adds, moves, and removes MIDI notes deterministically', async () => {
    const result = await runDeterministicReplay(makeBaseState(), [
      proposal('ADD_MIDI_NOTE', { trackId: 'keys', noteId: 'note-1', startTimeSec: 1.25, durationSec: 0.5, pitch: 60, velocity: 96, channel: 0 }),
      proposal('SET_MIDI_NOTE', { trackId: 'keys', noteId: 'note-1', startTimeSec: 1.5, durationSec: 0.75, pitch: 62, velocity: 110, channel: 1 }),
      proposal('ADD_MIDI_NOTE', { trackId: 'keys', noteId: 'note-2', startTimeSec: 0.5, durationSec: 1, pitch: 67, velocity: 90, channel: 0 }),
      proposal('REMOVE_MIDI_NOTE', { trackId: 'keys', noteId: 'note-2' }),
    ]);

    expect(result.outputState.midiNotes).toHaveLength(1);
    expect(result.outputState.midiNotes?.[0]).toMatchObject({
      noteId: 'note-1',
      trackId: 'keys',
      startTimeSec: 1.5,
      durationSec: 0.75,
      pitch: 62,
      velocity: 110,
      channel: 1,
    });

    const compare = buildTimelineBranchDiffSummary(makeBaseState(), result.outputState);
    expect(compare.changedTracks).toBe(1);
    expect(compare.addedMidiNotes + compare.removedMidiNotes + compare.changedMidiNotes).toBeGreaterThan(0);
  });
});
