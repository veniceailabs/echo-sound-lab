import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';
import {
  DeterministicBranchRegistry,
  MergeConflictError,
} from '../services/timelineBranchingService';

const BASE_STATE: ReplayState = {
  sessionId: 'session-merge-1',
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
      durationSec: 16,
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
      metric: 'merge-test',
      currentValue: 1,
      targetValue: 1,
      rationale: 'deterministic merge test',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('Deterministic Merge Strategy', () => {
  test('fast-forward merge updates target head to source head hash', async () => {
    const registry = await DeterministicBranchRegistry.create(BASE_STATE, { rootBranchName: 'main' });
    const p1 = proposalFactory('p1', 'GAIN_ADJUSTMENT', { gainDb: 1 });
    const p2 = proposalFactory('p2', 'SET_AUTOMATION_POINT', {
      trackId: 'track-main',
      parameter: 'volumeDb',
      timeSec: 2,
      value: -2,
    });
    const p3 = proposalFactory('p3', 'ADD_TRACK', { trackId: 'track-vocals', trackName: 'Vocals', trackType: 'audio' });

    await registry.appendToActiveBranch(p1);
    const feature = await registry.forkBranch(1, 'feature');
    await registry.checkoutBranch(feature.id);
    await registry.appendToActiveBranch(p2);
    await registry.appendToActiveBranch(p3);

    const main = registry.getBranchByName('main');
    const source = registry.getBranch(feature.id);
    expect(main).toBeTruthy();
    expect(source).toBeTruthy();

    const merged = await registry.mergeBranches(source!.id, main!.id);
    const sourceHead = await registry.hydrateBranchHead(source!.id);
    const targetHead = await registry.hydrateBranchHead(main!.id);

    expect(merged.headHash).toBe(source!.headHash);
    expect(targetHead.outputStateHash).toBe(sourceHead.outputStateHash);
  });

  test('divergent non-conflict merge creates deterministic combined hash', async () => {
    const registry = await DeterministicBranchRegistry.create(BASE_STATE, { rootBranchName: 'main' });
    const p0 = proposalFactory('p0', 'GAIN_ADJUSTMENT', { gainDb: 0.5 });
    const pA = proposalFactory('pA', 'ADD_TRACK', { trackId: 'track-drums', trackName: 'Drums', trackType: 'audio' });
    const pB = proposalFactory('pB', 'ADD_TRACK', { trackId: 'track-vocals', trackName: 'Vocals', trackType: 'audio' });

    await registry.appendToActiveBranch(p0);
    const vocals = await registry.forkBranch(1, 'vocals');
    await registry.appendToActiveBranch(pA); // main tail
    await registry.checkoutBranch(vocals.id);
    await registry.appendToActiveBranch(pB); // source tail

    const main = registry.getBranchByName('main');
    expect(main).toBeTruthy();
    const merged = await registry.mergeBranches(vocals.id, main!.id, 'THEIRS');
    const mainHead = await registry.hydrateBranchHead(main!.id);

    const expected = await runDeterministicReplay(BASE_STATE, [p0, pA, pB], {
      workspaceId: BASE_STATE.workspaceId,
    });
    expect(merged.headHash).toBe(expected.outputStateHash);
    expect(mainHead.outputStateHash).toBe(expected.outputStateHash);
  });

  test('divergent conflict merge obeys OURS/THEIRS and MANUAL throws', async () => {
    const createConflictRegistry = async () => {
      const registry = await DeterministicBranchRegistry.create(BASE_STATE, { rootBranchName: 'main' });
      const p0 = proposalFactory('p0', 'GAIN_ADJUSTMENT', { gainDb: 0.25 });
      await registry.appendToActiveBranch(p0);
      const alt = await registry.forkBranch(1, 'alt');

      const pMain = proposalFactory('p-main', 'SET_AUTOMATION_POINT', {
        trackId: 'track-main',
        parameter: 'volumeDb',
        timeSec: 15,
        value: -4,
      });
      await registry.appendToActiveBranch(pMain);
      await registry.checkoutBranch(alt.id);
      const pAlt = proposalFactory('p-alt', 'SET_AUTOMATION_POINT', {
        trackId: 'track-main',
        parameter: 'volumeDb',
        timeSec: 15,
        value: -9,
      });
      await registry.appendToActiveBranch(pAlt);
      return { registry, p0, pMain, pAlt, alt };
    };

    const manualSetup = await createConflictRegistry();
    const mainManual = manualSetup.registry.getBranchByName('main');
    expect(mainManual).toBeTruthy();
    await expect(
      manualSetup.registry.mergeBranches(manualSetup.alt.id, mainManual!.id, 'MANUAL')
    ).rejects.toBeInstanceOf(MergeConflictError);

    const oursSetup = await createConflictRegistry();
    const mainOurs = oursSetup.registry.getBranchByName('main');
    expect(mainOurs).toBeTruthy();
    const oursMerged = await oursSetup.registry.mergeBranches(oursSetup.alt.id, mainOurs!.id, 'OURS');
    const oursExpected = await runDeterministicReplay(BASE_STATE, [oursSetup.p0, oursSetup.pMain], {
      workspaceId: BASE_STATE.workspaceId,
    });
    expect(oursMerged.headHash).toBe(oursExpected.outputStateHash);

    const theirsSetup = await createConflictRegistry();
    const mainTheirs = theirsSetup.registry.getBranchByName('main');
    expect(mainTheirs).toBeTruthy();
    const theirsMerged = await theirsSetup.registry.mergeBranches(theirsSetup.alt.id, mainTheirs!.id, 'THEIRS');
    const theirsExpected = await runDeterministicReplay(BASE_STATE, [theirsSetup.p0, theirsSetup.pAlt], {
      workspaceId: BASE_STATE.workspaceId,
    });
    expect(theirsMerged.headHash).toBe(theirsExpected.outputStateHash);
  });
});

