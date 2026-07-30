import { describe, expect, test } from 'vitest';
import type { AudioEngineSnapshot } from '../services/audioEngine';
import type { ReplayState } from '../services/deterministicReplayService';
import type { ProcessingConfig } from '../types';
import { buildStudioMoonshotExecutionStack } from '../services/studioMoonshotExecutionService';
import { buildSessionTranscriptSearchIndex } from '../services/sessionTranscriptSearchService';
import { buildSessionPlayerArrangement } from '../services/sessionPlayerArrangementService';
import { buildCreatorRoomShareManifest, createCreatorRoom } from '../services/creatorRoomService';

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
      limiter: true,
      saturation: true,
      transient: true,
      stereoImager: true,
      deEsser: true,
      dynamicEq: true,
      motionReverb: false,
      pitchCorrection: true,
      localPlugins: true,
      wamPlugins: true,
    },
    chainSignature: 'moonshot-chain',
    masteringQualityMode: 'mastering',
    recommendedRenderPath: 'native',
    renderPathReason: 'test',
    warnings: [],
    latency: {
      baseLatencyMs: 3,
      outputLatencyMs: 6,
      latencyHint: 'interactive',
    },
    routingGraph: {
      nodeCount: 12,
      edgeCount: 16,
      pluginCount: 5,
      playbackMode: 'hybrid',
      rawPlaybackEnabled: true,
      processedPlaybackEnabled: true,
    },
  };
}

function makeTimeline(): ReplayState {
  return {
    sessionId: 'session-moonshot',
    workspaceId: 'workspace-moonshot',
    tracks: [
      {
        trackId: 'vox',
        trackName: 'Lead Vocal',
        kind: 'audio',
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        limiterThresholdDb: null,
        normalizedTargetLUFS: null,
        dcRemovalHz: null,
        inserts: [],
        appliedProposalIds: [],
        trackStateHash: '',
      },
    ],
    regions: [
      {
        regionId: 'vox-hook',
        trackId: 'vox',
        sourceId: 'vox.wav',
        startTimeSec: 16,
        offsetSec: 0,
        durationSec: 8,
      },
    ],
    midiNotes: [],
    automation: [{ laneId: 'auto-1', trackId: 'vox', parameter: 'volume', points: [] }],
    markers: [{ id: 'hook', timeSec: 16, label: 'Hook', color: '#fff' }],
    metadata: {},
  } as ReplayState;
}

describe('studioMoonshotExecutionService', () => {
  test('builds a complete executable stack for the major studio capability lanes', () => {
    const timeline = makeTimeline();
    const transcriptIndex = buildSessionTranscriptSearchIndex(timeline, [
      { segmentId: 'seg-1', startSec: 16, endSec: 18, text: 'make the hook bigger', speakerId: 'andra' },
    ]);
    const playerPlan = buildSessionPlayerArrangement({
      sessionId: timeline.sessionId,
      bpm: 98,
      key: 'C',
      sections: [{ sectionId: 'hook', label: 'Hook', startBar: 4, bars: 4, energy: 0.9, chord: 'F' }],
      players: [{ role: 'drums', enabled: true, feel: 'laid-back', complexity: 0.7 }],
    });
    const room = createCreatorRoom({
      name: 'Moonshot Room',
      owner: { userId: 'andra', displayName: 'Andra', role: 'owner' },
      timelineState: timeline,
      processingConfig: {} as ProcessingConfig,
      visibility: 'unlisted',
    });
    const stack = buildStudioMoonshotExecutionStack({
      timelineState: timeline,
      engineSnapshot: makeEngineSnapshot(),
      currentConfig: { targetLufs: -10 } as ProcessingConfig,
      serviceTemplates: [
        { templateId: 'vocal-polish', name: 'Vocal Polish', category: 'mix', summary: 'test' } as any,
      ],
      creatorRoom: buildCreatorRoomShareManifest(room, { allowForks: true }),
      transcriptIndex,
      sessionPlayerPlan: playerPlan,
    });

    expect(stack.nativePluginBridge.supportedFormats).toEqual(expect.arrayContaining(['WAM', 'AU', 'VST3']));
    expect(stack.recordingPlan.inputTracks[0].monitorMode).toBe('auto');
    expect(stack.immersiveDelivery.formats).toContain('DOLBY_ATMOS_ADM');
    expect(stack.stemSeparationJob.targets).toEqual(expect.arrayContaining(['vocals', 'guitar', 'piano']));
    expect(stack.controlSurfaceMap.macroSafety).toBe('action-authority-required');
    expect(stack.interchangeValidation.pass).toBe(true);
    expect(stack.contentPack.templates).toContain('Vocal Polish');
    expect(stack.creatorRoom?.allowForks).toBe(true);
    expect(stack.transcriptIndex?.speakers).toEqual(['andra']);
    expect(stack.sessionPlayerPlan?.midiNotes.length).toBeGreaterThan(0);
    expect(stack.workspaceSandbox.workspaceRoot).toContain('tests/fixtures/workspaces/workspace-moonshot/session-moonshot');
    expect(stack.workspaceSandbox.cleanupActions.length).toBeGreaterThan(0);
    expect(stack.workspaceSandboxDelivery.vaultArchivePath).toContain('delivery-vault/workspace-moonshot/session-moonshot.zip');
    expect(stack.workspaceSandboxDelivery.cleanupActions.length).toBeGreaterThan(0);
    expect(stack.executionOrder).toContain('prepare-immersive-delivery');
  });
});
