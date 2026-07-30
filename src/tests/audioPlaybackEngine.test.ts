import { describe, expect, test } from 'vitest';
import { assetRegistry } from '../services/AssetRegistry';
import {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  DelayNodeLike,
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
  setTargetAtTime(value: number): void {
    this.value = value;
  }
  setValueAtTime(value: number): void {
    this.value = value;
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

class FakeDelayNode extends FakeNode implements DelayNodeLike {
  delayTime = new FakeAudioParam(0);
}

class FakeDynamicsCompressorNode extends FakeNode {
  threshold = new FakeAudioParam(-24);
  knee = new FakeAudioParam(0);
  ratio = new FakeAudioParam(1);
  attack = new FakeAudioParam(0);
  release = new FakeAudioParam(0.1);
}

class FakeAnalyserNode extends FakeNode {
  fftSize = 2048;
  frequencyBinCount = 1024;
  smoothingTimeConstant = 0.75;
  getByteFrequencyData(array: Uint8Array): void {
    array.fill(0);
  }
  getByteTimeDomainData(array: Uint8Array): void {
    array.fill(128);
  }
  getFloatTimeDomainData(array: Float32Array): void {
    array.fill(0);
  }
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

  createDelay(): DelayNodeLike {
    this.sourceCounter += 1;
    return new FakeDelayNode(`delay-${this.sourceCounter}`);
  }

  createDynamicsCompressor() {
    this.sourceCounter += 1;
    return new FakeDynamicsCompressorNode(`compressor-${this.sourceCounter}`);
  }

  createAnalyser() {
    this.sourceCounter += 1;
    return new FakeAnalyserNode(`analyser-${this.sourceCounter}`);
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
        outputBusId: null,
        sends: [],
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
    const trackGain = track!.gainNode as FakeGainNode;
    const trackOutput = track!.outputNode as FakeNode;

    expect(sourceNode.connections.has(trackInput)).toBe(true);
    expect(trackInput.connections.has(pluginInput)).toBe(true);
    expect(pluginInput.connections.has(pluginOutput)).toBe(true);
    expect(trackGain.connections.has(trackOutput)).toBe(true);
    expect(sourceNode.starts[0]).toEqual({
      when: 12,
      offset: 0.5,
      duration: 4,
    });
  });

  test('routes track output into a selected bus and aux send target', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);

    const state = makeState(0);
    state.tracks.push({
      trackId: 'mix-bus',
      trackName: 'Mix Bus',
      kind: 'bus',
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      outputBusId: null,
      sends: [],
      inserts: [],
      appliedProposalIds: [],
      trackStateHash: '',
    });
    state.tracks[0].outputBusId = 'mix-bus';
    state.tracks[0].sends = [
      {
        sendId: 'send-1',
        targetTrackId: 'master',
        levelDb: -9,
        preFader: false,
        enabled: true,
      },
    ];

    await engine.syncState(state);
    engine.playFrom(0);

    const track = engine.getTrackDebug('track-vocal');
    expect(track?.outputBusId).toBe('mix-bus');
    expect(track?.sends).toHaveLength(1);
    expect(track?.sends[0]).toMatchObject({
      sendId: 'send-1',
      targetTrackId: 'master',
      levelDb: -9,
      preFader: false,
      enabled: true,
    });
    const bus = engine.getTrackDebug('mix-bus');
    expect(bus).not.toBeNull();
    expect((track?.gainNode as FakeGainNode).connections.size).toBeGreaterThan(0);
  });

  test('routes sidechain sends through the target track sidechain compressor', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    engine.setRegionBuffer('source-bass-1', BUFFER);

    const state = makeState(0);
    state.tracks.push({
      trackId: 'track-bass',
      trackName: 'Bass',
      kind: 'audio',
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      outputBusId: null,
      sends: [],
      inserts: [],
      appliedProposalIds: [],
      trackStateHash: '',
    });
    state.regions.push({
      regionId: 'region-bass-1',
      trackId: 'track-bass',
      sourceId: 'source-bass-1',
      startTimeSec: 0,
      offsetSec: 0,
      durationSec: 4,
      gainDb: 0,
    });
    state.tracks[0].sends = [
      {
        sendId: 'send-sidechain-1',
        targetTrackId: 'track-bass',
        levelDb: -12,
        preFader: false,
        enabled: true,
        mode: 'sidechain',
      },
    ];

    await engine.syncState(state);
    engine.playFrom(0);

    const vocalTrack = engine.getTrackDebug('track-vocal');
    const bassTrack = engine.getTrackDebug('track-bass');

    expect(vocalTrack?.sends[0]).toMatchObject({
      sendId: 'send-sidechain-1',
      targetTrackId: 'track-bass',
      mode: 'sidechain',
    });
    expect(bassTrack?.sidechainActive).toBe(true);
    expect((bassTrack?.gainNode as FakeGainNode).connections.size).toBeGreaterThan(0);
  });

  test('applies send level automation aliases to the send gain node', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state = makeState(0);
    state.tracks[0].sends = [
      {
        sendId: 'send-1',
        targetTrackId: 'master',
        levelDb: -12,
        preFader: false,
        enabled: true,
      },
    ];
    state.automation = [
      {
        laneId: 'lane-send-level',
        trackId: 'track-vocal',
        parameter: 'send:send-1:levelDb',
        points: [{ pointId: 'p-send', timeSec: 0, value: -3, curve: 'linear' }],
      },
    ];

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(state);
    engine.playFrom(0);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    expect(track?.sends[0].gainValue).toBeCloseTo(Math.pow(10, -3 / 20), 6);
  });

  test('applies APL track_gain_db automation aliases to the track gain node', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state = makeState(0);
    state.automation = [
      {
        laneId: 'lane-apl-gain',
        trackId: 'track-vocal',
        parameter: 'track_gain_db',
        points: [
          { pointId: 'p-0', timeSec: 0, value: -6, curve: 'linear' },
          { pointId: 'p-1', timeSec: 2, value: 0, curve: 'linear' },
        ],
      },
    ];

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(state);
    engine.playFrom(1);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    expect(track?.trackGainValue).toBeCloseTo(Math.pow(10, -3 / 20), 6);
  });

  test('routes stereo_width automation aliases into a delay plugin width control', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state = makeState(0);
    state.tracks[0].inserts = [
      {
        instanceId: 'delay-width-1',
        manifestId: 'echo.mod.delay.pingpong',
        enabled: true,
        mix: 1,
        parameters: {
          time: 0.25,
          feedback: 0.4,
          width: 100,
        },
      },
    ];
    state.automation = [
      {
        laneId: 'lane-width',
        trackId: 'track-vocal',
        parameter: 'stereo_width',
        points: [{ pointId: 'p-width', timeSec: 0, value: 1.2, curve: 'linear' }],
      },
    ];

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(state);
    engine.playFrom(0);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    expect(track?.plugins[0].manifestId).toBe('echo.mod.delay.pingpong');
    expect(track?.plugins[0].panValue).toBeCloseTo(0.3, 6);
  });

  test('routes delay_mix automation aliases into a delay plugin wet mix control', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state = makeState(0);
    state.tracks[0].inserts = [
      {
        instanceId: 'delay-mix-1',
        manifestId: 'echo.mod.delay.slap',
        enabled: true,
        mix: 1,
        parameters: {
          time: 0.08,
          feedback: 0.1,
          mix: 0.2,
        },
      },
    ];
    state.automation = [
      {
        laneId: 'lane-delay-mix',
        trackId: 'track-vocal',
        parameter: 'delay_mix',
        points: [{ pointId: 'p-delay', timeSec: 0, value: 0.36, curve: 'linear' }],
      },
    ];

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(state);
    engine.playFrom(0);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    expect(track?.plugins[0].manifestId).toBe('echo.mod.delay.slap');
    expect(track?.plugins[0].gainValue).toBeCloseTo(0.36, 6);
  });

  test('maps plugin bypass automation aliases to runtime plugin attenuation', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state = makeState(0);
    state.automation = [
      {
        laneId: 'lane-bypass',
        trackId: 'track-vocal',
        parameter: 'plugin:gain-1:bypass',
        points: [{ pointId: 'p-bypass', timeSec: 0, value: 0, curve: 'step' }],
      },
    ];

    await engine.init();
    engine.setRegionBuffer('source-vocal-1', BUFFER);
    await engine.syncState(state);
    engine.playFrom(0);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    expect(track?.plugins[0].manifestId).toBe('echo.utility.gain.v1');
    expect(track?.plugins[0].gainValue).toBe(0);
  });

  test('applies monitored latency compensation across track paths', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state = makeState(0);
    state.tracks[0].inserts = [
      {
        instanceId: 'delay-1',
        manifestId: 'echo.mod.delay.slap',
        enabled: true,
        mix: 1,
        parameters: { time: 0.5 },
      },
    ];
    state.tracks.push({
      trackId: 'track-drums',
      trackName: 'Drums',
      kind: 'audio',
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      outputBusId: null,
      sends: [],
      inserts: [],
      appliedProposalIds: [],
      trackStateHash: '',
    });
    state.regions.push({
      regionId: 'region-drums-1',
      trackId: 'track-drums',
      sourceId: 'source-drums-1',
      startTimeSec: 0,
      offsetSec: 0,
      durationSec: 4,
      gainDb: 0,
    });

    await engine.init();
    engine.setRegionBuffers({
      'source-vocal-1': BUFFER,
      'source-drums-1': BUFFER,
    });
    await engine.syncState(state);

    const vocalDebug = engine.getTrackDebug('track-vocal');
    const drumsDebug = engine.getTrackDebug('track-drums');

    expect(vocalDebug?.estimatedLatencyMs).toBeGreaterThan(0);
    expect(drumsDebug?.compensationMs).toBeGreaterThan(0);
    expect((drumsDebug?.outputNode as FakeDelayNode).delayTime.value).toBeGreaterThan(0);
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
