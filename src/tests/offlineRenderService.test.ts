import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OfflineRenderService } from '../services/OfflineRenderService';
import { ReplayState } from '../services/deterministicReplayService';
import { provenanceLedger } from '../services/ProvenanceLedger';
import { hashManifestPayload, signManifestPayloadWithSecret } from '../services/provenanceSigning';
import {
  extractEmbeddedProvenanceReference,
  verifyEmbeddedProvenanceReference,
} from '../services/provenanceMetadataService';
import {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  GainNodeLike,
} from '../services/AudioPlaybackEngine';

class FakeAudioParam {
  value = 1;
}

class FakeNode implements AudioNodeLike {
  connect(_destination: AudioNodeLike): void {
    // no-op
  }

  disconnect(): void {
    // no-op
  }
}

class FakeGainNode extends FakeNode implements GainNodeLike {
  gain = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  onended: (() => void) | null = null;

  start(): void {
    // no-op
  }

  stop(): void {
    this.onended?.();
  }
}

class FakeOfflineContext implements AudioContextLike {
  state = 'suspended';
  currentTime = 0;
  destination = new FakeNode();

  createGain(): GainNodeLike {
    return new FakeGainNode();
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    return new FakeBufferSourceNode();
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async startRendering() {
    const samples = new Float32Array(44100);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.sin((i / 44100) * Math.PI * 2 * 220) * 0.15;
    }
    return {
      duration: 1,
      length: 44100,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => samples,
    };
  }
}

const TIMELINE_STATE: ReplayState = {
  sessionId: 'offline-session',
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
      inserts: [],
      appliedProposalIds: [],
      trackStateHash: '',
    },
  ],
  regions: [
    {
      regionId: 'region-main-1',
      trackId: 'track-main',
      sourceId: 'uploaded-audio',
      startTimeSec: 0,
      offsetSec: 0,
      durationSec: 1,
      gainDb: 0,
    },
  ],
  automation: [],
  metadata: {
    sampleRate: 44100,
    channelCount: 1,
  },
};

describe('OfflineRenderService', () => {
  beforeEach(() => {
    provenanceLedger.resetForTest();
    provenanceLedger.append({
      proposalId: 'offline-proposal-1',
      actor: { id: 'human:producer', type: 'HUMAN' },
      actionType: 'offline_render',
      timestamp: 1_700_000_000_000,
      signature: 'sig_offline_render_zzzzzzzzzzzzzzzzzzzz',
      sessionId: 'offline-session',
      sourceHash: 'offline-source-hash',
      contextId: 'offline-context',
      generator: 'human-directed',
      assertions: ['agent.human', 'apl.executed'],
    });

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const manifest = body?.manifest;
      const signature = await signManifestPayloadWithSecret(manifest, 'offline-render-signing-secret');
      const manifestHash = await hashManifestPayload(manifest);
      return new Response(JSON.stringify({
        signature,
        signatureAlgorithm: 'hmac-sha256-v1',
        manifestHash,
        keyId: 'offline-key-01',
        signedAt: Date.now(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('renders deterministic wav and embeds signed provenance metadata', async () => {
    const service = new OfflineRenderService({
      createOfflineAudioContext: () => new FakeOfflineContext() as any,
    });

    const result = await service.renderTimelineToWav({
      timelineState: TIMELINE_STATE,
      audioFileName: 'offline-export.wav',
      creatorId: 'human:producer',
      fallbackRegionBuffers: {
        'uploaded-audio': { duration: 1 },
      },
      autoDownload: false,
    });

    expect(result.audioFileName).toBe('offline-export.wav');
    expect(result.manifestFileName).toBe('offline-export.manifest.json');
    expect(result.signedManifest.manifest.schemaVersion).toBe('esl.render-manifest.v1');

    const embeddedRef = await extractEmbeddedProvenanceReference(result.audioBlob, result.audioFileName);
    expect(embeddedRef).not.toBeNull();
    expect(embeddedRef?.manifestFileName).toBe(result.manifestFileName);

    const verification = await verifyEmbeddedProvenanceReference(
      result.audioBlob,
      result.audioFileName,
      result.signedManifest,
      result.manifestFileName
    );
    expect(verification.ok).toBe(true);
  });
});
