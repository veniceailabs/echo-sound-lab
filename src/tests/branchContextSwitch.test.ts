import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';
import { DeterministicBranchRegistry } from '../services/timelineBranchingService';

const BASE_STATE: ReplayState = {
  sessionId: 'session-branch-1',
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
      regionId: 'region-main-1',
      trackId: 'track-main',
      sourceId: 'clip-main',
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
      metric: 'branch-test',
      currentValue: 1,
      targetValue: 1,
      rationale: 'branching test',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('Branch Context Switching', () => {
  test('forks a branch from scrub index and preserves parent hash lineage', async () => {
    const registry = await DeterministicBranchRegistry.create(BASE_STATE, {
      snapshotInterval: 25,
      rootBranchName: 'main',
    });

    await registry.appendToActiveBranch(proposalFactory('p1', 'GAIN_ADJUSTMENT', { gainDb: 1 }));
    await registry.appendToActiveBranch(proposalFactory('p2', 'SET_AUTOMATION_POINT', {
      trackId: 'track-main',
      parameter: 'volumeDb',
      timeSec: 2,
      value: -2,
    }));

    const branch = await registry.forkBranch(1, 'vocals');
    const expectedAtFork = await runDeterministicReplay(BASE_STATE, [
      proposalFactory('p1', 'GAIN_ADJUSTMENT', { gainDb: 1 }),
    ]);

    expect(branch.parentHash).toBe(expectedAtFork.outputStateHash);
    expect(branch.headHash).toBe(expectedAtFork.outputStateHash);
    expect(branch.forkIndex).toBe(1);
  });

  test('switching between diverged branches restores exact deterministic head hashes', async () => {
    const registry = await DeterministicBranchRegistry.create(BASE_STATE, {
      snapshotInterval: 25,
      rootBranchName: 'main',
    });

    const p1 = proposalFactory('p1', 'GAIN_ADJUSTMENT', { gainDb: 1 });
    const pMain = proposalFactory('p-main', 'SET_AUTOMATION_POINT', {
      trackId: 'track-main',
      parameter: 'volumeDb',
      timeSec: 3,
      value: -4,
    });
    const pBranch = proposalFactory('p-branch', 'ADD_TRACK', {
      trackId: 'track-vocals',
      trackName: 'Vocals',
      trackType: 'audio',
    });

    await registry.appendToActiveBranch(p1);
    const branch = await registry.forkBranch(1, 'vocals');
    await registry.appendToActiveBranch(pMain);

    await registry.checkoutBranch(branch.id);
    await registry.appendToActiveBranch(pBranch);

    const main = registry.getBranchByName('main');
    const vocals = registry.getBranchByName('vocals');
    expect(main).toBeTruthy();
    expect(vocals).toBeTruthy();
    expect(main!.headHash).not.toBe(vocals!.headHash);

    const mainCheckout = await registry.checkoutBranch(main!.id);
    const vocalsCheckout = await registry.checkoutBranch(vocals!.id);

    const expectedMain = await runDeterministicReplay(BASE_STATE, [p1, pMain]);
    const expectedVocals = await runDeterministicReplay(BASE_STATE, [p1, pBranch]);

    expect(mainCheckout.outputStateHash).toBe(expectedMain.outputStateHash);
    expect(vocalsCheckout.outputStateHash).toBe(expectedVocals.outputStateHash);
  });
});

