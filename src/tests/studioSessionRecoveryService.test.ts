import { describe, expect, test } from 'vitest';
import type { AudioEngineSnapshot } from '../services/audioEngine';
import { buildStudioSessionRecoveryBundle, parseStudioSessionRecoveryBundleJson, serializeStudioSessionRecoveryBundleJson } from '../services/studioSessionRecoveryService';
import type { SessionState } from '../services/sessionManager';
import type { ProcessingConfig } from '../types';
import type { ReplayState } from '../services/deterministicReplayService';

function makeSessionState(): SessionState {
  return {
    version: '2.1',
    savedAt: 1234567890,
    fileName: 'test-ep-session',
    config: {} as ProcessingConfig,
    isAbComparing: true,
    playheadSeconds: 48.5,
    appliedSuggestionIds: ['suggestion-1'],
    echoReportSummary: 'Recovery bundle test',
    activeMode: 'AI_STUDIO',
    revisionLog: [],
    activeWamPluginId: 'wam-1',
  };
}

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
    chainSignature: 'recovery-chain',
    masteringQualityMode: 'balanced',
    recommendedRenderPath: 'custom-dsp',
    renderPathReason: 'test path',
    warnings: [],
    latency: {
      baseLatencyMs: 4.5,
      outputLatencyMs: 7.25,
      latencyHint: 'interactive',
    },
    routingGraph: {
      nodeCount: 6,
      edgeCount: 9,
      pluginCount: 3,
      playbackMode: 'hybrid',
      rawPlaybackEnabled: true,
      processedPlaybackEnabled: true,
    },
  };
}

function makeReplayState(): ReplayState {
  return {
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    tracks: [],
    regions: [],
    trackGroups: [],
    compLanes: [],
    markers: [],
    automation: [],
    metadata: {},
  } as ReplayState;
}

describe('studioSessionRecoveryService', () => {
  test('round-trips a session recovery bundle cleanly', () => {
    const bundle = buildStudioSessionRecoveryBundle({
      session: makeSessionState(),
      timelineState: makeReplayState(),
      timelineCompareState: makeReplayState(),
      activeTimelineBranchId: 'main',
      timelineCompareBranchId: 'alt',
      currentPlayheadSeconds: 48.5,
      currentFileName: 'test-ep-session.wav',
      engineSnapshot: makeEngineSnapshot(),
      hardwareProfile: null,
      midiSnapshot: null,
      parityReport: {
        generatedAt: 1234567890,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        score: 88,
        coverage: [],
        missing: ['vendor native sdk bridge'],
        recommendations: ['Keep the session package as the recovery source of truth.'],
      },
      bridgeRuntime: {
        generatedAt: 1234567890,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        activeMode: 'esl-fallback',
        nativeAdaptersRegistered: 0,
        activeAdapters: {
          AAF: {
            id: 'aaf',
            label: 'AAF',
            format: 'AAF',
            provider: 'esl-fallback',
            available: true,
            nativeSdkRequired: false,
            notes: [],
          },
          OMF: {
            id: 'omf',
            label: 'OMF',
            format: 'OMF',
            provider: 'esl-fallback',
            available: true,
            nativeSdkRequired: false,
            notes: [],
          },
        },
        availableAdapters: [],
        sdkReady: false,
        notes: ['Fallback bridge is active for recovery testing.'],
      },
      parityPlan: null,
      notes: ['Recovery bundle test note.'],
    });

    const serialized = serializeStudioSessionRecoveryBundleJson(bundle);
    const parsed = parseStudioSessionRecoveryBundleJson(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed?.manifest.format).toBe('esl-studio-recovery-bundle');
    expect(parsed?.sessionPackage.session.fileName).toBe('test-ep-session');
    expect(parsed?.timelineCompareBranchId).toBe('alt');
    expect(parsed?.notes).toContain('Recovery bundle test note.');
    expect(parsed?.engineSnapshot.routingGraph.pluginCount).toBe(3);
    expect(parsed?.engineSnapshot.latency.baseLatencyMs).toBe(4.5);
  });
});
