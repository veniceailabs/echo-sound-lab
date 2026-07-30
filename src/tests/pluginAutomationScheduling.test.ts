import { describe, expect, test } from 'vitest';
import {
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  AudioPlaybackEngine,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  StereoPannerNodeLike,
} from '../services/AudioPlaybackEngine';
import { ReplayState } from '../services/deterministicReplayService';

type ParamEvent =
  | { type: 'cancel'; at: number }
  | { type: 'set'; value: number; at: number }
  | { type: 'ramp'; value: number; at: number };

class FakeAudioParam implements AudioParamLike {
  value: number;
  readonly events: ParamEvent[] = [];

  constructor(initial = 0) {
    this.value = initial;
  }

  cancelScheduledValues(startTime: number): void {
    this.events.push({ type: 'cancel', at: startTime });
  }

  setValueAtTime(value: number, startTime: number): void {
    this.value = value;
    this.events.push({ type: 'set', value, at: startTime });
  }

  linearRampToValueAtTime(value: number, endTime: number): void {
    this.value = value;
    this.events.push({ type: 'ramp', value, at: endTime });
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

class FakeDynamicsCompressorNode extends FakeNode implements DynamicsCompressorNodeLike {
  threshold = new FakeAudioParam(-24);
  knee = new FakeAudioParam(6);
  ratio = new FakeAudioParam(8);
  attack = new FakeAudioParam(0.005);
  release = new FakeAudioParam(0.2);
}

class FakeBufferSourceNode extends FakeNode implements AudioBufferSourceNodeLike {
  buffer = null;
  onended: (() => void) | null = null;

  start(): void {
    // no-op
  }

  stop(): void {
    this.onended?.();
  }
}

class FakeAudioContext implements AudioContextLike {
  state = 'running';
  currentTime = 10;
  destination = new FakeNode('destination');
  private gainCounter = 0;
  private sourceCounter = 0;
  private pannerCounter = 0;
  private compressorCounter = 0;

  createGain(): GainNodeLike {
    this.gainCounter += 1;
    return new FakeGainNode(`gain-${this.gainCounter}`);
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    this.sourceCounter += 1;
    return new FakeBufferSourceNode(`source-${this.sourceCounter}`);
  }

  createStereoPanner(): StereoPannerNodeLike {
    this.pannerCounter += 1;
    return new FakeStereoPannerNode(`panner-${this.pannerCounter}`);
  }

  createDynamicsCompressor(): DynamicsCompressorNodeLike {
    this.compressorCounter += 1;
    return new FakeDynamicsCompressorNode(`compressor-${this.compressorCounter}`);
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }
}

const AUTOMATION_STATE: ReplayState = {
  sessionId: 'session-automation',
  workspaceId: 'workspace-main',
  tracks: [
    {
      trackId: 'track-vocal',
      trackName: 'Lead Vocal',
      kind: 'audio',
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      limiterThresholdDb: null,
      normalizedTargetLUFS: null,
      dcRemovalHz: null,
      inserts: [
        {
          instanceId: 'fet-1',
          manifestId: 'echo.vocal.comp.fet',
          enabled: true,
          mix: 1,
          parameters: {
            threshold: -24,
            ratio: '8',
            attack: 0.005,
            release: 0.2,
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
      startTimeSec: 0,
      offsetSec: 0,
      durationSec: 8,
      gainDb: 0,
    },
  ],
  automation: [
    {
      laneId: 'lane-threshold',
      trackId: 'track-vocal',
      parameter: 'plugin:fet-1:threshold',
      points: [
        { pointId: 'p-0', timeSec: 0, value: -24, curve: 'linear' },
        { pointId: 'p-1', timeSec: 2, value: -12, curve: 'linear' },
        { pointId: 'p-2', timeSec: 4, value: -30, curve: 'linear' },
      ],
    },
  ],
};

describe('Plugin Automation Scheduling', () => {
  test('schedules deterministic linear ramps for plugin parameter automation', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    await engine.syncState(AUTOMATION_STATE);
    engine.playFrom(1);

    const track = engine.getTrackDebug('track-vocal');
    expect(track).not.toBeNull();
    const compressor = track?.plugins[0].inputNode as FakeDynamicsCompressorNode;
    expect(compressor).toBeInstanceOf(FakeDynamicsCompressorNode);

    const events = compressor.threshold.events;
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: 'cancel', at: 10 });
    expect(events[1]).toEqual({ type: 'set', value: -18, at: 10 });
    expect(events[2]).toEqual({ type: 'ramp', value: -12, at: 11 });
    expect(events[3]).toEqual({ type: 'ramp', value: -30, at: 13 });
  });

  test('schedules master LUFS automation on the mastering lane', async () => {
    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    const state: ReplayState = {
      ...AUTOMATION_STATE,
      tracks: [
        ...AUTOMATION_STATE.tracks,
        {
          trackId: 'master-bus',
          trackName: 'Master Bus',
          kind: 'master',
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          limiterThresholdDb: -0.1,
          normalizedTargetLUFS: -14,
          dcRemovalHz: null,
          inserts: [],
          outputBusId: null,
          sends: [],
          appliedProposalIds: [],
          trackStateHash: '',
        },
      ],
      automation: [
        {
          laneId: 'lane-master-lufs',
          trackId: 'master-bus',
          parameter: 'master:normalizedTargetLUFS',
          points: [
            { pointId: 'm-0', timeSec: 0, value: -14, curve: 'linear' },
            { pointId: 'm-1', timeSec: 2, value: -12, curve: 'linear' },
          ],
        },
      ],
    };

    await engine.init();
    await engine.syncState(state);
    engine.playFrom(0);

    const masterTrack = engine.getTrackDebug('master-bus');
    expect(masterTrack).not.toBeNull();
    const gainNode = masterTrack?.gainNode as FakeGainNode;
    expect(gainNode.gain.events).toHaveLength(3);
    expect(gainNode.gain.events[0]).toEqual({ type: 'cancel', at: 10 });
    expect(gainNode.gain.events[1]).toEqual({ type: 'set', value: 1, at: 10 });
    expect(gainNode.gain.events[2].type).toBe('ramp');
    expect(gainNode.gain.events[2].at).toBe(12);
    expect(gainNode.gain.events[2].value).toBeCloseTo(Math.pow(10, -2 / 20), 6);
    expect(gainNode.gain.value).toBeCloseTo(Math.pow(10, -2 / 20), 6);
  });
});
