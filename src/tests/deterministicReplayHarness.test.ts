import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';

const BASE_STATE: ReplayState = {
  sessionId: 'session-replay-1',
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
  metadata: {
    sampleRate: 44100,
    channels: 2,
  },
};

function proposalFactory(
  proposalId: string,
  type: APLProposal['action']['type'],
  parameters: Record<string, unknown>
): APLProposal {
  return {
    proposalId,
    trackId: 'track-main',
    trackName: 'Main',
    action: {
      type,
      description: `${type} action`,
      parameters,
    },
    evidence: {
      metric: 'test-metric',
      currentValue: 1,
      targetValue: 2,
      rationale: 'deterministic replay test',
    },
    confidence: 0.99,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 0.99,
    },
    signalIntelligence: {} as any,
  };
}

describe('Deterministic Replay Harness', () => {
  test('same base state + semantically identical APL sequence produce identical hashes', async () => {
    const sequenceA: APLProposal[] = [
      proposalFactory('p-1', 'GAIN_ADJUSTMENT', { gainDb: 2, plugin: 'gain' }),
      proposalFactory('p-2', 'LIMITING', { threshold: -0.2, lookahead: 5 }),
    ];

    // Same semantic payload but parameter insertion order changed.
    const sequenceB: APLProposal[] = [
      proposalFactory('p-1', 'GAIN_ADJUSTMENT', { plugin: 'gain', gainDb: 2 }),
      proposalFactory('p-2', 'LIMITING', { lookahead: 5, threshold: -0.2 }),
    ];

    const runA = await runDeterministicReplay(BASE_STATE, sequenceA, {
      seed: 101,
      clockStartMs: 1000,
    });
    const runB = await runDeterministicReplay(BASE_STATE, sequenceB, {
      seed: 999,
      clockStartMs: 999999,
    });

    expect(runA.baseStateHash).toBe(runB.baseStateHash);
    expect(runA.aplSequenceHash).toBe(runB.aplSequenceHash);
    expect(runA.outputStateHash).toBe(runB.outputStateHash);
    const track = runA.outputState.tracks.find((entry) => entry.trackId === 'track-main');
    expect(track?.gainDb).toBe(2);
    expect(track?.limiterThresholdDb).toBe(-0.2);
  });

  test('tampering with one APL parameter changes replay output hash', async () => {
    const baseSequence: APLProposal[] = [
      proposalFactory('p-1', 'GAIN_ADJUSTMENT', { gainDb: 2 }),
    ];
    const tamperedSequence: APLProposal[] = [
      proposalFactory('p-1', 'GAIN_ADJUSTMENT', { gainDb: 10 }),
    ];

    const baseRun = await runDeterministicReplay(BASE_STATE, baseSequence);
    const tamperedRun = await runDeterministicReplay(BASE_STATE, tamperedSequence);

    expect(baseRun.aplSequenceHash).not.toBe(tamperedRun.aplSequenceHash);
    expect(baseRun.outputStateHash).not.toBe(tamperedRun.outputStateHash);
  });

  test('reordering APL sequence produces different sequence and output hashes', async () => {
    const ordered: APLProposal[] = [
      proposalFactory('p-1', 'GAIN_ADJUSTMENT', { gainDb: 1 }),
      proposalFactory('p-2', 'GAIN_ADJUSTMENT', { gainDb: -2 }),
      proposalFactory('p-3', 'NORMALIZATION', { targetLUFS: -14 }),
    ];
    const reordered: APLProposal[] = [ordered[2], ordered[0], ordered[1]];

    const orderedRun = await runDeterministicReplay(BASE_STATE, ordered);
    const reorderedRun = await runDeterministicReplay(BASE_STATE, reordered);

    expect(orderedRun.aplSequenceHash).not.toBe(reorderedRun.aplSequenceHash);
    expect(orderedRun.outputStateHash).not.toBe(reorderedRun.outputStateHash);
  });
});
