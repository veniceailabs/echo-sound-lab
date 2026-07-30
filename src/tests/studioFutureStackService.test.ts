import { describe, expect, test } from 'vitest';
import { buildStudioFutureStackReport } from '../services/studioFutureStackService';
import type { AudioEngineSnapshot } from '../services/audioEngine';
import type { ProcessingConfig } from '../types';
import type { ReplayState } from '../services/deterministicReplayService';

function makeEngineSnapshot(): AudioEngineSnapshot {
  return {
    sampleRate: 48000,
    isPlaying: false,
    isBypassed: false,
    currentConfig: {} as ProcessingConfig,
    activeFlags: {
      inputTrim: true,
      outputTrim: true,
      eq: true,
      compression: true,
      limiter: false,
      saturation: true,
      transient: false,
      stereoImager: true,
      deEsser: true,
      dynamicEq: false,
      motionReverb: false,
      pitchCorrection: false,
      localPlugins: true,
      wamPlugins: true,
    },
    chainSignature: 'test-chain',
    masteringQualityMode: 'balanced',
    recommendedRenderPath: 'custom-dsp',
    renderPathReason: 'test path',
    warnings: [],
    latency: {
      baseLatencyMs: 3.2,
      outputLatencyMs: 8.4,
      latencyHint: 'interactive',
    },
    routingGraph: {
      nodeCount: 8,
      edgeCount: 12,
      pluginCount: 4,
      playbackMode: 'buffer',
      rawPlaybackEnabled: true,
      processedPlaybackEnabled: true,
    },
  };
}

function makeTimelineState(): ReplayState {
  return {
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    tracks: [
      {
        trackId: 'track-1',
        trackName: 'Vox',
        kind: 'audio',
        groupId: null,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        limiterThresholdDb: null,
        normalizedTargetLUFS: null,
        dcRemovalHz: null,
        inserts: [],
        appliedProposalIds: [],
        trackStateHash: 'hash-1',
      },
    ],
    regions: [],
    trackGroups: [],
    compLanes: [{ laneId: 'lane-1', trackId: 'track-1', name: 'Main', activeRegionId: 'region-1', regionIds: ['region-1'] }],
    markers: [{ id: 'marker-1', timeSec: 4, label: 'Hook', color: '#fff', note: '' }],
    automation: [{ laneId: 'auto-1', trackId: 'track-1', parameter: 'volume', points: [{ pointId: 'pt-1', timeSec: 2, value: 0.8, curve: 'linear' }] }],
    metadata: {},
  } as ReplayState;
}

describe('studioFutureStackService', () => {
  test('produces ten DAW pillars and a useful overall score', () => {
    const report = buildStudioFutureStackReport({
      engineSnapshot: makeEngineSnapshot(),
      serviceTemplates: [
        { templateId: 'pro-vocal-polish', name: 'Pro Vocal Polish', category: 'mix', summary: 'Vocal polish template' } as any,
      ],
      analysisResult: null,
      originalMetrics: null,
      processedMetrics: null,
      currentConfig: {} as ProcessingConfig,
      timelineState: makeTimelineState(),
      compareState: makeTimelineState(),
      branches: [{ branchId: 'main', name: 'Main', parentBranchId: null } as any, { branchId: 'alt', name: 'Alt', parentBranchId: 'main' } as any],
      hasSessionPackage: true,
      hasTimelineInterchange: true,
      hasAafExport: true,
      hasOmfExport: true,
      hasMarkerExport: true,
      hasTimelineImportWizard: true,
      hasConformWorkflow: true,
      hasReconformWorkflow: true,
      hasCompEditing: true,
      hasCompAudition: true,
      hasPostTools: true,
      hasPostHandoffProfile: true,
      hasMidiSurface: true,
      hasBeatLibrary: true,
      hasStemSplitter: true,
      hasTempoTools: true,
      hasCaptureTools: true,
      hasCapturePlan: true,
      hasCollaborationSurface: true,
      hasControlSurfaceProfile: true,
      hasContentCatalog: true,
      hasBranchReview: true,
      hasBranchMerge: true,
    });

    expect(report.pillars).toHaveLength(10);
    expect(report.pillars.map((pillar) => pillar.id)).toEqual([
      'interop',
      'timeline',
      'routing',
      'latency',
      'composition',
      'automation',
      'safety',
      'plugins',
      'workflow',
      'scale',
    ]);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.pillars.every((pillar) => pillar.score >= 0 && pillar.score <= 100)).toBe(true);
  });
});
