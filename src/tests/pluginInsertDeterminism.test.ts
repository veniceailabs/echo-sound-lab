import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';

const BASE_STATE: ReplayState = {
  sessionId: 'session-plugin-insert-1',
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
  regions: [],
  automation: [],
};

function proposalFactory(
  proposalId: string,
  actionType: APLProposal['action']['type'],
  parameters: Record<string, unknown>
): APLProposal {
  return {
    proposalId,
    trackId: String(parameters.trackId || 'track-main'),
    trackName: String(parameters.trackName || 'Main'),
    action: {
      type: actionType,
      description: `${actionType} action`,
      parameters,
    },
    evidence: {
      metric: 'plugin-insert-test',
      currentValue: 1,
      targetValue: 1,
      rationale: 'plugin insert determinism',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('Plugin Insert Determinism', () => {
  test('ADD_PLUGIN + SET_PLUGIN_PARAM produces deterministic hash regardless of key order', async () => {
    const sequenceA: APLProposal[] = [
      proposalFactory('add-a', 'ADD_PLUGIN', {
        trackId: 'track-main',
        instanceId: 'gain-1',
        manifestId: 'echo.utility.gain.v1',
        parameters: {
          gainDb: 3.5,
          pan: 0.2,
          phaseInvert: false,
        },
      }),
      proposalFactory('set-a', 'SET_PLUGIN_PARAM', {
        trackId: 'track-main',
        instanceId: 'gain-1',
        paramId: 'gainDb',
        value: 6.125,
      }),
    ];

    const sequenceB: APLProposal[] = [
      proposalFactory('add-a', 'ADD_PLUGIN', {
        parameters: {
          phaseInvert: false,
          pan: 0.2,
          gainDb: 3.5,
        },
        manifestId: 'echo.utility.gain.v1',
        instanceId: 'gain-1',
        trackId: 'track-main',
      }),
      proposalFactory('set-a', 'SET_PLUGIN_PARAM', {
        value: 6.125,
        paramId: 'gainDb',
        instanceId: 'gain-1',
        trackId: 'track-main',
      }),
    ];

    const runA = await runDeterministicReplay(BASE_STATE, sequenceA);
    const runB = await runDeterministicReplay(BASE_STATE, sequenceB, {
      seed: 991,
      clockStartMs: 3210,
    });

    expect(runA.aplSequenceHash).toBe(runB.aplSequenceHash);
    expect(runA.outputStateHash).toBe(runB.outputStateHash);

    const track = runA.outputState.tracks.find((entry) => entry.trackId === 'track-main');
    expect(track?.inserts?.length).toBe(1);
    expect(track?.inserts?.[0].parameters.gainDb).toBe(6.125);
  });

  test('plugin parameter change mutates deterministic output hash', async () => {
    const baseActions: APLProposal[] = [
      proposalFactory('add-base', 'ADD_PLUGIN', {
        trackId: 'track-main',
        instanceId: 'gain-2',
        manifestId: 'echo.utility.gain.v1',
      }),
      proposalFactory('set-low', 'SET_PLUGIN_PARAM', {
        trackId: 'track-main',
        instanceId: 'gain-2',
        paramId: 'gainDb',
        value: 1,
      }),
    ];

    const changedActions: APLProposal[] = [
      proposalFactory('add-base', 'ADD_PLUGIN', {
        trackId: 'track-main',
        instanceId: 'gain-2',
        manifestId: 'echo.utility.gain.v1',
      }),
      proposalFactory('set-high', 'SET_PLUGIN_PARAM', {
        trackId: 'track-main',
        instanceId: 'gain-2',
        paramId: 'gainDb',
        value: 9,
      }),
    ];

    const runLow = await runDeterministicReplay(BASE_STATE, baseActions);
    const runHigh = await runDeterministicReplay(BASE_STATE, changedActions);

    expect(runLow.aplSequenceHash).not.toBe(runHigh.aplSequenceHash);
    expect(runLow.outputStateHash).not.toBe(runHigh.outputStateHash);
  });
});

