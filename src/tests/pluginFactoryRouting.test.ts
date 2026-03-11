import { describe, expect, test } from 'vitest';
import type { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import {
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  AudioPlaybackEngine,
  BiquadFilterNodeLike,
  DelayNodeLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  StereoPannerNodeLike,
} from '../services/AudioPlaybackEngine';
import { ReplayState, runDeterministicReplay } from '../services/deterministicReplayService';

class FakeAudioParam implements AudioParamLike {
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

class FakeDynamicsCompressorNode extends FakeNode implements DynamicsCompressorNodeLike {
  threshold = new FakeAudioParam(-24);
  knee = new FakeAudioParam(6);
  ratio = new FakeAudioParam(8);
  attack = new FakeAudioParam(0.005);
  release = new FakeAudioParam(0.2);
}

class FakeBiquadFilterNode extends FakeNode implements BiquadFilterNodeLike {
  type: BiquadFilterNodeLike['type'] = 'peaking';
  frequency = new FakeAudioParam(1000);
  gain = new FakeAudioParam(0);
  Q = new FakeAudioParam(0.707);
}

class FakeDelayNode extends FakeNode implements DelayNodeLike {
  delayTime = new FakeAudioParam(0.1);
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
  currentTime = 0;
  destination = new FakeNode('destination');
  private gainCounter = 0;
  private pannerCounter = 0;
  private sourceCounter = 0;
  private compressorCounter = 0;
  private biquadCounter = 0;
  private delayCounter = 0;

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

  createBiquadFilter(): BiquadFilterNodeLike {
    this.biquadCounter += 1;
    return new FakeBiquadFilterNode(`biquad-${this.biquadCounter}`);
  }

  createDelay(): DelayNodeLike {
    this.delayCounter += 1;
    return new FakeDelayNode(`delay-${this.delayCounter}`);
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }
}

const BASE_STATE: ReplayState = {
  sessionId: 'plugin-factory-session',
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
      appliedProposalIds: [],
      trackStateHash: '',
    },
  ],
  regions: [],
  automation: [],
};

function makeProposal(
  proposalId: string,
  actionType: APLProposal['action']['type'],
  parameters: Record<string, unknown>
): APLProposal {
  return {
    proposalId,
    trackId: 'track-vocal',
    trackName: 'Lead Vocal',
    action: {
      type: actionType,
      description: actionType,
      parameters,
    },
    evidence: {
      metric: 'plugin-factory',
      currentValue: 1,
      targetValue: 1,
      rationale: 'plugin factory routing',
    },
    confidence: 1,
    provenance: {
      engine: 'CLASSICAL',
      confidence: 1,
    },
    signalIntelligence: {} as any,
  };
}

describe('Plugin Factory Routing', () => {
  test('maps echo.vocal.comp.fet to DynamicsCompressorNode and updates threshold in place', async () => {
    const addCompressor = makeProposal('add-fet', 'ADD_PLUGIN', {
      trackId: 'track-vocal',
      instanceId: 'fet-1',
      manifestId: 'echo.vocal.comp.fet',
      parameters: {
        threshold: -18,
        ratio: '12',
        attack: 0.004,
        release: 0.14,
      },
    });
    const setThreshold = makeProposal('set-threshold', 'SET_PLUGIN_PARAM', {
      trackId: 'track-vocal',
      instanceId: 'fet-1',
      paramId: 'threshold',
      value: -10,
    });

    const stateAfterAdd = await runDeterministicReplay(BASE_STATE, [addCompressor]);
    const stateAfterSet = await runDeterministicReplay(BASE_STATE, [addCompressor, setThreshold]);

    const fakeContext = new FakeAudioContext();
    const engine = new AudioPlaybackEngine({
      createAudioContext: () => fakeContext,
    });

    await engine.init();
    await engine.syncState(stateAfterAdd.outputState);
    const debugAfterAdd = engine.getTrackDebug('track-vocal');
    expect(debugAfterAdd).not.toBeNull();
    expect(debugAfterAdd?.plugins).toHaveLength(1);
    expect(debugAfterAdd?.plugins[0].manifestId).toBe('echo.vocal.comp.fet');
    expect(debugAfterAdd?.plugins[0].nodeKind).toBe('dynamics-compressor');
    expect(debugAfterAdd?.plugins[0].inputNode instanceof FakeDynamicsCompressorNode).toBe(true);
    expect(debugAfterAdd?.plugins[0].dspSnapshot.threshold).toBeCloseTo(-18, 6);

    const compressorNodeRef = debugAfterAdd!.plugins[0].inputNode;
    await engine.syncState(stateAfterSet.outputState);
    const debugAfterSet = engine.getTrackDebug('track-vocal');
    expect(debugAfterSet).not.toBeNull();
    expect(debugAfterSet!.plugins[0].inputNode).toBe(compressorNodeRef);
    expect(debugAfterSet!.plugins[0].dspSnapshot.threshold).toBeCloseTo(-10, 6);
  });
});

