import { describe, expect, test } from 'vitest';
import { buildSessionBenchmarkPlan } from '../services/sessionBenchmarkService';
import { buildSessionScaleProfile } from '../services/sessionScaleService';
import type { AudioEngineSnapshot } from '../services/audioEngine';
import type { ReplayState } from '../services/deterministicReplayService';

function makeEngineSnapshot(): AudioEngineSnapshot {
  return {
    sampleRate: 48000,
    isPlaying: false,
    isBypassed: false,
    currentConfig: {} as any,
    activeFlags: {
      inputTrim: true,
      outputTrim: true,
      eq: true,
      compression: true,
      limiter: true,
      saturation: true,
      transient: true,
      stereoImager: true,
      deEsser: true,
      dynamicEq: true,
      motionReverb: false,
      pitchCorrection: false,
      localPlugins: true,
      wamPlugins: true,
    },
    chainSignature: 'stress-chain',
    masteringQualityMode: 'balanced',
    recommendedRenderPath: 'custom-dsp',
    renderPathReason: 'stress test',
    warnings: [],
    latency: {
      baseLatencyMs: 3.2,
      outputLatencyMs: 7.8,
      latencyHint: 'interactive',
    },
    routingGraph: {
      nodeCount: 12,
      edgeCount: 22,
      pluginCount: 6,
      playbackMode: 'buffer',
      rawPlaybackEnabled: true,
      processedPlaybackEnabled: true,
    },
  };
}

function makeLargeSession(): ReplayState {
  const tracks = Array.from({ length: 60 }, (_, index) => ({
    trackId: `track-${index + 1}`,
    trackName: `Track ${index + 1}`,
    kind: index === 59 ? 'master' : index >= 50 ? 'bus' : 'audio',
    groupId: null,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    limiterThresholdDb: index === 59 ? -0.1 : null,
    normalizedTargetLUFS: index === 59 ? -14 : null,
    dcRemovalHz: null,
    inserts: Array.from({ length: index < 40 ? 2 : 0 }, (_, insertIndex) => ({
      instanceId: `plugin-${index}-${insertIndex}`,
      manifestId: 'echo.utility.gain.v1',
      enabled: true,
      mix: 1,
      parameters: { gainDb: 0 },
    })),
    outputBusId: null,
    sends: [],
    appliedProposalIds: [],
    trackStateHash: '',
  }));

  const regions = Array.from({ length: 220 }, (_, index) => ({
    regionId: `region-${index + 1}`,
    trackId: `track-${(index % 48) + 1}`,
    sourceId: `source-${index + 1}`,
    startTimeSec: index * 0.75,
    offsetSec: 0,
    durationSec: 1.5,
    gainDb: 0,
  }));

  const automation = Array.from({ length: 30 }, (_, index) => ({
    laneId: `lane-${index + 1}`,
    trackId: `track-${(index % 48) + 1}`,
    parameter: index % 2 === 0 ? 'volume' : 'pan',
    points: [
      { pointId: `p-${index}-1`, timeSec: index * 0.5, value: 0, curve: 'linear' as const },
      { pointId: `p-${index}-2`, timeSec: index * 0.5 + 4, value: 1, curve: 'linear' as const },
    ],
  }));

  const compLanes = Array.from({ length: 15 }, (_, index) => ({
    laneId: `comp-${index + 1}`,
    trackId: `track-${(index % 20) + 1}`,
    name: `Comp ${index + 1}`,
    activeRegionId: `region-${index + 1}`,
    regionIds: [`region-${index + 1}`],
  }));

  const markers = Array.from({ length: 12 }, (_, index) => ({
    id: `marker-${index + 1}`,
    timeSec: index * 8,
    label: `Section ${index + 1}`,
    color: '#ffffff',
    note: '',
  }));

  return {
    sessionId: 'stress-session',
    workspaceId: 'workspace-main',
    tracks,
    regions,
    automation,
    compLanes,
    markers,
    metadata: { tempoBpm: 128, timeSignature: '4/4' },
  } as ReplayState;
}

describe('sessionBenchmarkService', () => {
  test('flags a deliberately oversized session with cleanup actions and split points', () => {
    const largeSession = makeLargeSession();
    const scaleProfile = buildSessionScaleProfile({
      timelineState: largeSession,
      compareState: largeSession,
      branches: Array.from({ length: 6 }, (_, index) => ({
        branchId: `branch-${index + 1}`,
        name: `Branch ${index + 1}`,
        parentBranchId: index === 0 ? null : 'branch-1',
      })) as any,
      engineSnapshot: makeEngineSnapshot(),
    });

    const benchmark = buildSessionBenchmarkPlan({
      timelineState: largeSession,
      compareState: largeSession,
      branches: Array.from({ length: 6 }, (_, index) => ({
        branchId: `branch-${index + 1}`,
        name: `Branch ${index + 1}`,
        parentBranchId: index === 0 ? null : 'branch-1',
      })) as any,
      scaleProfile,
      engineSnapshot: makeEngineSnapshot(),
    });

    expect(scaleProfile.readinessScore).toBeLessThan(60);
    expect(scaleProfile.warnings.some((warning) => warning.includes('cleanup pass'))).toBe(true);
    expect(benchmark.cleanupActions.length).toBeGreaterThan(1);
    expect(benchmark.cleanupActions.some((action) => action.includes('Split the session'))).toBe(true);
    expect(benchmark.splitPoints.length).toBeGreaterThan(0);
    expect(benchmark.warnings.length).toBeGreaterThan(0);
  });
});
