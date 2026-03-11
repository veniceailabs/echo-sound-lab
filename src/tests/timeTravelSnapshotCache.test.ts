import { describe, expect, test } from 'vitest';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';
import { TimelineReplayCache } from '../services/timelineReplayCache';

const SNAPSHOT_INTERVAL = 50;

const BASE_STATE: ReplayState = {
  sessionId: 'session-snapshot-cache-1',
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
      durationSec: 24,
      gainDb: 0,
    },
  ],
  automation: [],
};

function proposalFactory(index: number): APLProposal {
  return {
    proposalId: `p-${index}`,
    trackId: 'track-main',
    trackName: 'Main',
    action: {
      type: 'GAIN_ADJUSTMENT',
      description: 'micro gain nudge',
      parameters: {
        gainDb: (index % 3 === 0 ? 0.125 : -0.05),
      },
    },
    evidence: {
      metric: 'snapshot-cache',
      currentValue: index,
      targetValue: index + 1,
      rationale: 'deterministic replay cache benchmark',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

async function averageDurationMs(fn: () => Promise<void>, runs = 3): Promise<number> {
  let total = 0;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    total += performance.now() - start;
  }
  return total / runs;
}

describe('Time Travel Snapshot Cache', () => {
  test('cache hydration matches full replay hash at arbitrary indices', async () => {
    const baseReplay = await runDeterministicReplay(BASE_STATE, []);
    const cache = new TimelineReplayCache(baseReplay.outputState, baseReplay.outputStateHash, {
      snapshotInterval: SNAPSHOT_INTERVAL,
      workspaceId: BASE_STATE.workspaceId,
    });

    const actions = Array.from({ length: 160 }, (_, index) => proposalFactory(index + 1));
    for (const action of actions) {
      await cache.appendProposal(action);
    }

    for (const index of [0, 1, 49, 50, 51, 123, 160]) {
      const cached = await cache.hydrateToIndex(index);
      const full = await runDeterministicReplay(baseReplay.outputState, actions.slice(0, index), {
        workspaceId: BASE_STATE.workspaceId,
      });
      expect(cached.outputStateHash).toBe(full.outputStateHash);
    }
  });

  test('snapshot cache hydration is faster than full replay for deep history while preserving hash', async () => {
    const actionCount = 800;
    const targetIndex = 787;
    const baseReplay = await runDeterministicReplay(BASE_STATE, []);
    const cache = new TimelineReplayCache(baseReplay.outputState, baseReplay.outputStateHash, {
      snapshotInterval: SNAPSHOT_INTERVAL,
      workspaceId: BASE_STATE.workspaceId,
    });

    const actions = Array.from({ length: actionCount }, (_, index) => proposalFactory(index + 1));
    for (const action of actions) {
      await cache.appendProposal(action);
    }

    const fullReplay = await runDeterministicReplay(baseReplay.outputState, actions.slice(0, targetIndex), {
      workspaceId: BASE_STATE.workspaceId,
    });
    const cachedReplay = await cache.hydrateToIndex(targetIndex);

    expect(cachedReplay.outputStateHash).toBe(fullReplay.outputStateHash);
    expect(cachedReplay.metrics.replayedActionCount).toBeLessThanOrEqual(SNAPSHOT_INTERVAL);

    const fullAvgMs = await averageDurationMs(async () => {
      await runDeterministicReplay(baseReplay.outputState, actions.slice(0, targetIndex), {
        workspaceId: BASE_STATE.workspaceId,
      });
    });
    const cachedAvgMs = await averageDurationMs(async () => {
      await cache.hydrateToIndex(targetIndex);
    });

    expect(cachedAvgMs).toBeLessThan(fullAvgMs);
    expect(cachedAvgMs).toBeLessThanOrEqual(fullAvgMs * 0.7);
  });
});

