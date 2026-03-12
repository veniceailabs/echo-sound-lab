import { describe, expect, test } from 'vitest';
import { assetRegistry } from '../services/AssetRegistry';
import {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioPlaybackEngine,
  GainNodeLike,
  StereoPannerNodeLike,
} from '../services/AudioPlaybackEngine';
import { ReplayState } from '../services/deterministicReplayService';

class FakeAudioParam {
  value: number;
  constructor(initial = 0) {
    this.value = initial;
  }
}

class FakeNode implements AudioNodeLike {
  readonly id: string;
  readonly connections = new Set<FakeNode>();

  constructor(id: string) {
    this.id = id;
  }

  connect(destination: AudioNodeLike): void {
    this.connections.add(destination as FakeNode);
  }

  disconnect(): void {
    this.connections.clear();
  }
}

class FakeGainNode extends FakeNode implements GainNodeLike {
  gain = new FakeAudioParam(1);
}

class FakeStereoPannerNode extends FakeNode implements StereoPannerNodeLike {
  pan = new FakeAudioParam(0);
}

class FakeBufferSourceNode extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  onended: (() => void) | null = null;
  readonly starts: Array<{ when: number; offset: number; duration: number }> = [];
  stopCount = 0;

  start(when = 0, offset = 0, duration = 0): void {
    this.starts.push({ when, offset, duration });
  }

  stop(): void {
    this.stopCount += 1;
    this.onended?.();
  }
}

class FakeAudioContext implements AudioContextLike {
  state = 'running';
  currentTime = 10;
  destination = new FakeNode('destination');
  readonly createdBufferSources: FakeBufferSourceNode[] = [];
  decodeCalls = 0;
  private gainCounter = 0;
  private pannerCounter = 0;
  private sourceCounter = 0;

  createGain(): GainNodeLike {
    this.gainCounter += 1;
    return new FakeGainNode(`gain-${this.gainCounter}`);
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    this.sourceCounter += 1;
    const source = new FakeBufferSourceNode(`source-${this.sourceCounter}`);
    this.createdBufferSources.push(source);
    return source;
  }

  createStereoPanner(): StereoPannerNodeLike {
    this.pannerCounter += 1;
    return new FakeStereoPannerNode(`panner-${this.pannerCounter}`);
  }

  async decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBufferLike> {
    this.decodeCalls += 1;
    return {
      duration: 12,
      length: 529200,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(529200),
    };
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }
}

const BUFFER: AudioBufferLike = { duration: 12 };

function makeState(gainDb: number): ReplayState {
  return {
    sessionId: 'session-audio-engine',
    workspaceId: 'workspace-main',
    tracks: [
      {
        trackId: 'track-vocal',
        trackName: 'Lead Vocal',
        kind: 'audio',
        gainDb: -3,
        pan: 0.25,
        muted: false,
        solo: false,
        limiterThresholdDb: null,
        normalizedTargetLUFS: null,
        dcRemovalHz: null,
        inserts: [
          {
            instanceId: 'gain-1',
            manifestId: 'echo.utility.gain.v1',
            enabled: true,
            mix: 1,
            parameters: {
              gainDb,
              pan: 0.4,
              phaseInvert: false,
            },
          },
        ],
        appliedProposalIds: [],
        trackStateHash: '',
      },
    ],
    regions: [
      {
        regionId: 'region-vocal-1',
        trackId: 'track-vocal',
        sourceId: 'source-vocal-1',
        startTimeSec: 2,
        offsetSec: 0.5,
        durationSec: 4,
        gainDb: 0,
      },
    ],
    automation: [],
  };
}

describe('AudioPlaybackEngine', () => {
  test('decodes asset-backed regions via AssetRegistry when explicit region buffers are absent', async () => {
    assetRegistry.clear();
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    assetRegistry.registerArrayBuffer(new Uint8Array([0, 1, 2, 3]).buffer, { name: 'kick.wav', mimeType: 'audio/wav' }, 'asset-kick');

    const state = makeState(0);
    state.regions = [
      {
        regionId: 'region-vocal-1',
        trackId: 'track-vocal',
        sourceId: 'asset-kick',
        startTimeSec: 0,
        offsetSec: 0,
        durationSec: 2,
        gainDb: 0,
      },
    ];

    await engine.init();
    await engine.syncState(state);
    engine.playFrom(0);

    expect(fakeContext.decodeCalls).toBe(1);
    const track = engine.getTrackDebug('track-vocal');
    expect(track?.activeSources.length).toBe(1);
    assetRegistry.clear();
  });

  test('renders deterministic routing Source -> Insert -> Track -> Master', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(makeState(0));
    engine.playFrom(0);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    expect(track?.plugins).toHaveLength(1);
    expect(track?.plugins[0].manifestId).toBe('echo.utility.gain.v1');
    expect(track?.activeSources).toHaveLength(1);
    expect(track?.trackPanValue).toBeCloseTo(0.25, 6);

    const sourceNode = track!.activeSources[0].node as FakeBufferSourceNode;
    const trackInput = track!.inputNode as FakeNode;
    const pluginInput = track!.plugins[0].inputNode as FakeNode;
    const pluginOutput = track!.plugins[0].outputNode as FakeNode;
    const trackOutput = track!.outputNode as FakeNode;

    expect(sourceNode.connections.has(trackInput)).toBe(true);
    expect(trackInput.connections.has(pluginInput)).toBe(true);
    expect(pluginOutput.connections.has(trackOutput)).toBe(true);
    expect((track!.gainNode as FakeGainNode).connections.size).toBeGreaterThan(0);
    expect(sourceNode.starts[0]).toEqual({
      when: 12,
      offset: 0.5,
      duration: 4,
    });
  });

  test('reconciles SET_PLUGIN_PARAM-style updates in-place without rebuilding plugin nodes', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    await engine.syncState(makeState(0));
    const before = engine.getTrackDebug('track-vocal');

    await engine.syncState(makeState(6));
    const after = engine.getTrackDebug('track-vocal');

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(before!.plugins[0].inputNode).toBe(after!.plugins[0].inputNode);
    expect(before!.plugins[0].outputNode).toBe(after!.plugins[0].outputNode);
    expect(after!.plugins[0].gainValue).toBeCloseTo(Math.pow(10, 6 / 20), 6);
    expect(after!.plugins[0].panValue).toBeCloseTo(0.4, 6);
  });

  test('maintains deterministic transport semantics for pause, seek, and stop', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(makeState(0));

    engine.playFrom(1.5);
    expect(engine.getIsPlaying()).toBe(true);
    expect(engine.getCurrentTime()).toBeCloseTo(1.5, 6);

    fakeContext.currentTime = 10.75;
    engine.pause();
    expect(engine.getIsPlaying()).toBe(false);
    expect(engine.getCurrentTime()).toBeCloseTo(2.25, 6);

    engine.seek(4.2);
    expect(engine.getCurrentTime()).toBeCloseTo(4.2, 6);

    engine.playFrom(engine.getCurrentTime());
    fakeContext.currentTime = 11.5;
    expect(engine.getCurrentTime()).toBeCloseTo(4.95, 6);

    engine.stop();
    expect(engine.getIsPlaying()).toBe(false);
    expect(engine.getCurrentTime()).toBe(0);
  });
});
