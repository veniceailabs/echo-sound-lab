import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../action-authority/src/action-authority/audit/SignatureProvider', () => {
  const provider = {
    sign: async (data: Record<string, unknown>) => ({
      classical: {
        algorithm: 'SHA-256' as const,
        format: 'hex' as const,
        hash: JSON.stringify(data),
        timestamp: 1,
      },
      postQuantum: {
        algorithm: null,
        format: null,
        signature: null,
        publicKeyId: null,
        timestamp: null,
      },
      bundleVersion: 1 as const,
    }),
    verify: async (data: Record<string, unknown>, bundle: { classical: { hash: string } }) =>
      bundle.classical.hash === JSON.stringify(data),
    getAlgorithmSupport: () => ({ classical: true, postQuantum: false }),
    getVersion: () => '1.0.0-test',
  };

  return {
    getSignatureProvider: () => provider,
    initializeSignatureProvider: () => undefined,
  };
});

import type { AudioEngineSnapshot } from '../services/audioEngine';
import type { ProcessingConfig } from '../types';
import type { ReplayState } from '../services/deterministicReplayService';
import type { SessionState } from '../services/sessionManager';

function makeSessionState(): SessionState {
  return {
    version: '2.1',
    savedAt: 1234567890,
    fileName: 'recovery-session',
    config: {} as ProcessingConfig,
    isAbComparing: false,
    playheadSeconds: 12.5,
    appliedSuggestionIds: [],
    echoReportSummary: 'Recovery storage test',
    activeMode: 'AI_STUDIO',
    revisionLog: [],
    activeWamPluginId: null,
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
    chainSignature: 'recovery-storage-chain',
    masteringQualityMode: 'balanced',
    recommendedRenderPath: 'custom-dsp',
    renderPathReason: 'test',
    warnings: [],
    latency: {
      baseLatencyMs: 4,
      outputLatencyMs: 8,
      latencyHint: 'interactive',
    },
    routingGraph: {
      nodeCount: 4,
      edgeCount: 6,
      pluginCount: 2,
      playbackMode: 'buffer',
      rawPlaybackEnabled: true,
      processedPlaybackEnabled: true,
    },
  };
}

function makeReplayState(): ReplayState {
  return {
    sessionId: 'recovery-storage-session',
    workspaceId: 'workspace-main',
    tracks: [],
    regions: [],
    automation: [],
    markers: [],
    compLanes: [],
    metadata: {},
  } as ReplayState;
}

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: new MemoryStorage() } as any);
});

describe('studioSessionRecoveryService storage drill', () => {
  test('persists, reloads, and clears a recovery bundle through secure storage', async () => {
    const {
      buildStudioSessionRecoveryBundle,
      clearStudioSessionRecoveryBundle,
      loadStudioSessionRecoveryBundle,
      saveStudioSessionRecoveryBundle,
    } = await import('../services/studioSessionRecoveryService');

    const bundle = buildStudioSessionRecoveryBundle({
      session: makeSessionState(),
      timelineState: makeReplayState(),
      timelineCompareState: null,
      activeTimelineBranchId: 'main',
      timelineCompareBranchId: null,
      currentPlayheadSeconds: 12.5,
      currentFileName: 'recovery-session.wav',
      engineSnapshot: makeEngineSnapshot(),
      hardwareProfile: null,
      midiSnapshot: null,
      parityReport: {
        generatedAt: 1234567890,
        sessionId: 'recovery-storage-session',
        workspaceId: 'workspace-main',
        score: 91,
        coverage: [],
        missing: [],
        recommendations: [],
      },
      bridgeRuntime: {
        generatedAt: 1234567890,
        sessionId: 'recovery-storage-session',
        workspaceId: 'workspace-main',
        activeMode: 'esl-fallback',
        nativeAdaptersRegistered: 0,
        activeAdapters: {},
        availableAdapters: [],
        sdkReady: false,
        notes: ['Storage drill'],
      },
      parityPlan: null,
      notes: ['Storage-backed recovery drill.'],
    });

    await saveStudioSessionRecoveryBundle(bundle);
    const loaded = await loadStudioSessionRecoveryBundle();
    expect(loaded).not.toBeNull();
    expect(loaded?.currentFileName).toBe('recovery-session.wav');
    expect(loaded?.sessionPackage.session.fileName).toBe('recovery-session');

    await clearStudioSessionRecoveryBundle();
    const cleared = await loadStudioSessionRecoveryBundle();
    expect(cleared).toBeNull();
  });
});
