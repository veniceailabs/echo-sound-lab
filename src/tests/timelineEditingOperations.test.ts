import { describe, expect, test } from 'vitest';
import { runDeterministicReplay, type ReplayState } from '../services/deterministicReplayService';
import type { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { buildTimelineBranchDiffSummary } from '../services/timelineBranchDiffService';
import { pluginRegistry } from '../services/plugins/pluginRegistry';

function makeBaseState(): ReplayState {
  return {
    sessionId: 'session-edit',
    workspaceId: 'workspace-edit',
    tracks: [
      {
        trackId: 'vox',
        trackName: 'Vocals',
        kind: 'audio',
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
    regions: [
      {
        regionId: 'vox-1',
        trackId: 'vox',
        sourceId: 'source-1',
        startTimeSec: 4,
        offsetSec: 0,
        durationSec: 8,
        gainDb: 0,
        compLaneId: null,
        compTakeIndex: null,
      },
    ],
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
    trackId: 'vox',
    trackName: 'Vocals',
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

describe('timeline editing operations', () => {
  test('supports trim, slip, crossfade, and automation mode actions', async () => {
    const result = await runDeterministicReplay(makeBaseState(), [
      proposal('TRIM_REGION', { regionId: 'vox-1', side: 'left', amountSec: 0.5 }),
      proposal('SLIP_REGION', { regionId: 'vox-1', amountSec: 0.25 }),
      proposal('APPLY_CROSSFADE', { regionId: 'vox-1', fadeInSec: 0.12, fadeOutSec: 0.18 }),
      proposal('SET_AUTOMATION_MODE', { mode: 'write' }),
    ]);

    const region = result.outputState.regions.find((entry) => entry.regionId === 'vox-1');
    expect(region).toBeDefined();
    expect(region?.startTimeSec).toBeCloseTo(4.5);
    expect(region?.offsetSec).toBeCloseTo(0.75);
    expect(region?.durationSec).toBeCloseTo(7.5);
    expect(region?.fadeInSec).toBeCloseTo(0.12);
    expect(region?.fadeOutSec).toBeCloseTo(0.18);
    expect(result.outputState.metadata?.automationMode).toBe('write');
  });

  test('supports deterministic plugin chain reordering and removal', async () => {
    const manifests = pluginRegistry.getAllPlugins();
    const firstManifest = manifests[0]?.manifestId;
    const secondManifest = manifests[1]?.manifestId || firstManifest;
    expect(firstManifest).toBeTruthy();
    expect(secondManifest).toBeTruthy();

    const result = await runDeterministicReplay(makeBaseState(), [
      proposal('ADD_PLUGIN', { trackId: 'vox', instanceId: 'vox-1-a', manifestId: firstManifest }),
      proposal('ADD_PLUGIN', { trackId: 'vox', instanceId: 'vox-1-b', manifestId: secondManifest }),
      proposal('REORDER_PLUGIN', { trackId: 'vox', instanceId: 'vox-1-b', toIndex: 0 }),
      proposal('REMOVE_PLUGIN', { trackId: 'vox', instanceId: 'vox-1-a' }),
    ]);

    const track = result.outputState.tracks.find((entry) => entry.trackId === 'vox');
    expect(track?.inserts.map((insert) => insert.instanceId)).toEqual(['vox-1-b']);
    const compare = buildTimelineBranchDiffSummary(makeBaseState(), result.outputState);
    expect(compare.changedTracks).toBe(1);
  });

  test('supports explicit output routing and aux sends', async () => {
    const baseState = makeBaseState();
    baseState.tracks.push({
      trackId: 'mix-bus',
      trackName: 'Mix Bus',
      kind: 'bus',
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
    });

    const result = await runDeterministicReplay(baseState, [
      proposal('SET_TRACK_ROUTING', { trackId: 'vox', outputBusId: 'mix-bus' }),
      proposal('SET_TRACK_SEND', {
        trackId: 'vox',
        sendId: 'vox-send-1',
        targetTrackId: 'master',
        levelDb: -9,
        preFader: false,
        enabled: true,
      }),
    ]);

    const track = result.outputState.tracks.find((entry) => entry.trackId === 'vox');
    expect(track?.outputBusId).toBe('mix-bus');
    expect(track?.sends).toHaveLength(1);
    expect(track?.sends?.[0]).toMatchObject({
      sendId: 'vox-send-1',
      targetTrackId: 'master',
      levelDb: -9,
      preFader: false,
      enabled: true,
    });
    const compare = buildTimelineBranchDiffSummary(baseState, result.outputState);
    expect(compare.changedTracks).toBe(2);
  });
});
