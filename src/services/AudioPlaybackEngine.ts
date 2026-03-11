import {
  ReplayPluginInstance,
  ReplayRegionState,
  ReplayState,
  ReplayTrackState,
} from './deterministicReplayService';

export interface AudioParamLike {
  value: number;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void | AudioNodeLike;
  disconnect?: () => void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface StereoPannerNodeLike extends AudioNodeLike {
  pan: AudioParamLike;
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  threshold: AudioParamLike;
  knee: AudioParamLike;
  ratio: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
}

export type BiquadFilterTypeLike =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass';

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterTypeLike;
  frequency: AudioParamLike;
  gain: AudioParamLike;
  Q: AudioParamLike;
}

export interface DelayNodeLike extends AudioNodeLike {
  delayTime: AudioParamLike;
}

export interface AudioBufferLike {
  duration: number;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  state: string;
  currentTime: number;
  destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createStereoPanner?: () => StereoPannerNodeLike;
  createDynamicsCompressor?: () => DynamicsCompressorNodeLike;
  createBiquadFilter?: () => BiquadFilterNodeLike;
  createDelay?: (maxDelayTime?: number) => DelayNodeLike;
  resume(): Promise<void> | void;
}

export interface AudioPlaybackEngineOptions {
  createAudioContext?: () => AudioContextLike | Promise<AudioContextLike>;
}

export interface AudioPlaybackPluginDebug {
  instanceId: string;
  manifestId: string;
  nodeKind: string;
  inputNode: AudioNodeLike;
  outputNode: AudioNodeLike;
  gainValue: number | null;
  panValue: number | null;
  dspSnapshot: Record<string, number | string | boolean | null>;
}

export interface AudioPlaybackTrackDebug {
  trackId: string;
  inputNode: AudioNodeLike;
  outputNode: AudioNodeLike;
  gainNode: GainNodeLike;
  panNode: StereoPannerNodeLike | null;
  trackGainValue: number;
  trackPanValue: number | null;
  pluginOrder: string[];
  plugins: AudioPlaybackPluginDebug[];
  activeSources: Array<{ regionId: string; node: AudioBufferSourceNodeLike }>;
}

interface PluginRuntime {
  instanceId: string;
  manifestId: string;
  inputNode: AudioNodeLike;
  outputNode: AudioNodeLike;
  nodeKind: string;
  gainNode: GainNodeLike | null;
  panNode: StereoPannerNodeLike | null;
  rewireInternal: () => void;
  dspSnapshot: () => Record<string, number | string | boolean | null>;
  apply(instance: ReplayPluginInstance): void;
  dispose(): void;
}

interface TrackRuntime {
  trackId: string;
  inputNode: GainNodeLike;
  gainNode: GainNodeLike;
  panNode: StereoPannerNodeLike | null;
  outputNode: AudioNodeLike;
  plugins: Map<string, PluginRuntime>;
  pluginOrder: string[];
  pluginOrderKey: string;
  regions: ReplayRegionState[];
  activeSources: Map<string, AudioBufferSourceNodeLike>;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const dbToLinear = (db: number): number => Math.pow(10, db / 20);

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  }
  return fallback;
}

function getDefaultContextFactory(): () => AudioContextLike {
  return () => {
    const ctor =
      (globalThis as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext ||
      (globalThis as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext;
    if (!ctor) {
      throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
    }
    return new ctor();
  };
}

export class AudioPlaybackEngine {
  private readonly createAudioContext: () => AudioContextLike | Promise<AudioContextLike>;
  private context: AudioContextLike | null = null;
  private masterGainNode: GainNodeLike | null = null;
  private currentState: ReplayState | null = null;
  private readonly trackRuntimes = new Map<string, TrackRuntime>();
  private readonly regionBuffers = new Map<string, AudioBufferLike>();
  private isPlaying = false;
  private playheadSec = 0;
  private startedAtContextSec = 0;

  constructor(options: AudioPlaybackEngineOptions = {}) {
    this.createAudioContext = options.createAudioContext || getDefaultContextFactory();
  }

  async init(): Promise<void> {
    if (this.context && this.masterGainNode) return;
    const context = await this.createAudioContext();
    this.context = context;
    this.masterGainNode = context.createGain();
    this.masterGainNode.gain.value = 1;
    this.connectNodes(this.masterGainNode, context.destination);
  }

  async resume(): Promise<void> {
    await this.init();
    const context = this.requireContext();
    await context.resume();
  }

  setRegionBuffer(sourceId: string, buffer: AudioBufferLike): void {
    this.regionBuffers.set(sourceId, buffer);
  }

  setRegionBuffers(buffers: Record<string, AudioBufferLike>): void {
    for (const [sourceId, buffer] of Object.entries(buffers)) {
      this.regionBuffers.set(sourceId, buffer);
    }
  }

  removeRegionBuffer(sourceId: string): void {
    this.regionBuffers.delete(sourceId);
  }

  clearRegionBuffers(): void {
    this.regionBuffers.clear();
  }

  async syncState(state: ReplayState): Promise<void> {
    await this.init();
    this.currentState = state;

    const nextTrackIds = new Set(state.tracks.map((track) => track.trackId));
    for (const [trackId, runtime] of this.trackRuntimes.entries()) {
      if (nextTrackIds.has(trackId)) continue;
      this.disposeTrackRuntime(runtime);
      this.trackRuntimes.delete(trackId);
    }

    for (const track of state.tracks) {
      const runtime = this.ensureTrackRuntime(track);
      runtime.regions = state.regions
        .filter((region) => region.trackId === track.trackId)
        .sort((a, b) => (a.startTimeSec === b.startTimeSec ? a.regionId.localeCompare(b.regionId) : a.startTimeSec - b.startTimeSec));
      this.applyTrackChannelValues(runtime, track);
      this.reconcileTrackPlugins(runtime, track.inserts || []);
    }
  }

  playFrom(playheadSec = 0): void {
    if (!this.currentState) return;
    const context = this.requireContext();
    const duration = this.getDuration();
    const clampedStart = clamp(playheadSec, 0, duration);
    this.stopActiveSources();

    for (const runtime of this.trackRuntimes.values()) {
      for (const region of runtime.regions) {
        const buffer = this.regionBuffers.get(region.sourceId);
        if (!buffer) continue;

        const regionEnd = region.startTimeSec + region.durationSec;
        if (regionEnd <= clampedStart) continue;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.onended = null;
        this.connectNodes(source, runtime.inputNode);

        const startOffsetIntoRegion = Math.max(0, clampedStart - region.startTimeSec);
        const when = context.currentTime + Math.max(0, region.startTimeSec - clampedStart);
        const offset = Math.max(0, region.offsetSec + startOffsetIntoRegion);
        const duration = Math.max(0, region.durationSec - startOffsetIntoRegion);
        if (duration <= 0) continue;

        source.start(when, offset, duration);
        runtime.activeSources.set(region.regionId, source);
      }
    }

    this.playheadSec = clampedStart;
    this.startedAtContextSec = context.currentTime;
    this.isPlaying = true;
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.playheadSec = this.getCurrentTime();
    this.isPlaying = false;
    this.stopActiveSources();
  }

  seek(nextPlayheadSec: number): void {
    const duration = this.getDuration();
    const clamped = clamp(nextPlayheadSec, 0, duration);
    this.playheadSec = clamped;
    if (this.isPlaying) {
      this.playFrom(clamped);
    }
  }

  stop(): void {
    this.isPlaying = false;
    this.playheadSec = 0;
    this.startedAtContextSec = 0;
    this.stopActiveSources();
  }

  dispose(): void {
    this.stop();
    for (const runtime of this.trackRuntimes.values()) {
      this.disposeTrackRuntime(runtime);
    }
    this.trackRuntimes.clear();
    this.currentState = null;
  }

  getTrackDebug(trackId: string): AudioPlaybackTrackDebug | null {
    const runtime = this.trackRuntimes.get(trackId);
    if (!runtime) return null;

    const plugins: AudioPlaybackPluginDebug[] = runtime.pluginOrder
      .map((instanceId) => runtime.plugins.get(instanceId))
      .filter((entry): entry is PluginRuntime => Boolean(entry))
      .map((plugin) => ({
        instanceId: plugin.instanceId,
        manifestId: plugin.manifestId,
        nodeKind: plugin.nodeKind,
        inputNode: plugin.inputNode,
        outputNode: plugin.outputNode,
        gainValue: plugin.gainNode ? plugin.gainNode.gain.value : null,
        panValue: plugin.panNode ? plugin.panNode.pan.value : null,
        dspSnapshot: plugin.dspSnapshot(),
      }));

    return {
      trackId,
      inputNode: runtime.inputNode,
      outputNode: runtime.outputNode,
      gainNode: runtime.gainNode,
      panNode: runtime.panNode,
      trackGainValue: runtime.gainNode.gain.value,
      trackPanValue: runtime.panNode ? runtime.panNode.pan.value : null,
      pluginOrder: [...runtime.pluginOrder],
      plugins,
      activeSources: Array.from(runtime.activeSources.entries()).map(([regionId, node]) => ({ regionId, node })),
    };
  }

  getCurrentTime(): number {
    const duration = this.getDuration();
    if (!this.isPlaying) {
      return clamp(this.playheadSec, 0, duration);
    }
    const context = this.requireContext();
    const elapsed = Math.max(0, context.currentTime - this.startedAtContextSec);
    return clamp(this.playheadSec + elapsed, 0, duration);
  }

  getDuration(): number {
    if (!this.currentState || this.currentState.regions.length === 0) return 0;
    return this.currentState.regions.reduce(
      (max, region) => Math.max(max, region.startTimeSec + region.durationSec),
      0
    );
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  private requireContext(): AudioContextLike {
    if (!this.context) {
      throw new Error('AUDIO_PLAYBACK_ENGINE_NOT_INITIALIZED');
    }
    return this.context;
  }

  private requireMasterGainNode(): GainNodeLike {
    if (!this.masterGainNode) {
      throw new Error('AUDIO_PLAYBACK_ENGINE_NOT_INITIALIZED');
    }
    return this.masterGainNode;
  }

  private ensureTrackRuntime(track: ReplayTrackState): TrackRuntime {
    const existing = this.trackRuntimes.get(track.trackId);
    if (existing) return existing;

    const context = this.requireContext();
    const masterGain = this.requireMasterGainNode();

    const inputNode = context.createGain();
    inputNode.gain.value = 1;

    const gainNode = context.createGain();
    gainNode.gain.value = 1;

    let panNode: StereoPannerNodeLike | null = null;
    let outputNode: AudioNodeLike = gainNode;
    if (context.createStereoPanner) {
      panNode = context.createStereoPanner();
      outputNode = panNode;
      this.connectNodes(panNode, gainNode);
    }
    this.connectNodes(gainNode, masterGain);
    this.connectNodes(inputNode, outputNode);

    const runtime: TrackRuntime = {
      trackId: track.trackId,
      inputNode,
      gainNode,
      panNode,
      outputNode,
      plugins: new Map(),
      pluginOrder: [],
      pluginOrderKey: '',
      regions: [],
      activeSources: new Map(),
    };

    this.trackRuntimes.set(track.trackId, runtime);
    return runtime;
  }

  private applyTrackChannelValues(runtime: TrackRuntime, track: ReplayTrackState): void {
    const gainLinear = track.muted ? 0 : dbToLinear(toNumber(track.gainDb, 0));
    runtime.gainNode.gain.value = gainLinear;
    if (runtime.panNode) {
      runtime.panNode.pan.value = clamp(toNumber(track.pan, 0), -1, 1);
    }
  }

  private reconcileTrackPlugins(runtime: TrackRuntime, inserts: ReplayPluginInstance[]): void {
    const orderKey = inserts.map((insert) => `${insert.instanceId}:${insert.manifestId}`).join('|');
    const structureChanged = orderKey !== runtime.pluginOrderKey;

    if (structureChanged) {
      for (const plugin of runtime.plugins.values()) {
        plugin.dispose();
      }
      runtime.plugins.clear();
      runtime.pluginOrder = [];

      for (const insert of inserts) {
        const pluginRuntime = this.buildPluginRuntime(insert);
        runtime.plugins.set(insert.instanceId, pluginRuntime);
        runtime.pluginOrder.push(insert.instanceId);
      }
      runtime.pluginOrderKey = orderKey;
      this.rewireTrackPluginChain(runtime);
    }

    for (const insert of inserts) {
      const plugin = runtime.plugins.get(insert.instanceId);
      if (!plugin) continue;
      plugin.apply(insert);
    }
  }

  private rewireTrackPluginChain(runtime: TrackRuntime): void {
    this.disconnectNode(runtime.inputNode);

    if (runtime.pluginOrder.length === 0) {
      this.connectNodes(runtime.inputNode, runtime.outputNode);
      return;
    }

    for (const plugin of runtime.plugins.values()) {
      this.disconnectNode(plugin.inputNode);
      if (plugin.outputNode !== plugin.inputNode) {
        this.disconnectNode(plugin.outputNode);
      }
      plugin.rewireInternal();
    }

    const orderedPlugins = runtime.pluginOrder
      .map((instanceId) => runtime.plugins.get(instanceId))
      .filter((entry): entry is PluginRuntime => Boolean(entry));

    if (orderedPlugins.length === 0) {
      this.connectNodes(runtime.inputNode, runtime.outputNode);
      return;
    }

    this.connectNodes(runtime.inputNode, orderedPlugins[0].inputNode);

    for (let idx = 0; idx < orderedPlugins.length - 1; idx += 1) {
      this.connectNodes(orderedPlugins[idx].outputNode, orderedPlugins[idx + 1].inputNode);
    }

    this.connectNodes(orderedPlugins[orderedPlugins.length - 1].outputNode, runtime.outputNode);
  }

  private buildPluginRuntime(insert: ReplayPluginInstance): PluginRuntime {
    const context = this.requireContext();
    switch (insert.manifestId) {
      case 'echo.utility.gain.v1':
        return this.buildUtilityGainRuntime(insert, context);
      case 'echo.vocal.comp.fet':
        return this.buildFetCompressorRuntime(insert, context);
      case 'echo.vocal.comp.opto':
        return this.buildOptoCompressorRuntime(insert, context);
      case 'echo.vocal.eq.air':
        return this.buildAirEqRuntime(insert, context);
      case 'echo.space.delay.slap':
        return this.buildSlapDelayRuntime(insert, context);
      case 'echo.space.reverb.plate':
        return this.buildPlatePlaceholderRuntime(insert, context);
      case 'echo.master.limiter.brick':
        return this.buildBrickLimiterRuntime(insert, context);
      default:
        return this.createPassthroughRuntime(insert, context, 'passthrough');
    }
  }

  private createPassthroughRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike,
    nodeKind: string
  ): PluginRuntime {
    const passthroughGain = context.createGain();
    passthroughGain.gain.value = 1;
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: passthroughGain,
      outputNode: passthroughGain,
      nodeKind,
      gainNode: passthroughGain,
      panNode: null,
      rewireInternal: () => {
        // single-node passthrough
      },
      dspSnapshot: () => ({
        gain: passthroughGain.gain.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        passthroughGain.gain.value = enabled ? 1 : 0;
      },
      dispose: () => {
        this.disconnectNode(passthroughGain);
      },
    };
  }

  private buildUtilityGainRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    const gainNode = context.createGain();
    let panNode: StereoPannerNodeLike | null = null;
    let outputNode: AudioNodeLike = gainNode;
    const rewireInternal = () => {
      if (panNode) this.connectNodes(gainNode, panNode);
    };
    if (context.createStereoPanner) {
      panNode = context.createStereoPanner();
      rewireInternal();
      outputNode = panNode;
    }

    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: gainNode,
      outputNode,
      nodeKind: 'utility-gain',
      gainNode,
      panNode,
      rewireInternal,
      dspSnapshot: () => ({
        gain: gainNode.gain.value,
        pan: panNode ? panNode.pan.value : null,
      }),
      apply: (instance: ReplayPluginInstance): void => {
        const gainDb = toNumber(instance.parameters.gainDb, 0);
        const pan = clamp(toNumber(instance.parameters.pan, 0), -1, 1);
        const phaseInvert = toBoolean(instance.parameters.phaseInvert, false);
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);

        const targetLinear = enabled ? dbToLinear(gainDb) : 1;
        const mixedGain = 1 + (targetLinear - 1) * mix;
        gainNode.gain.value = phaseInvert ? -mixedGain : mixedGain;

        if (panNode) {
          panNode.pan.value = enabled ? pan * mix : 0;
        }
      },
      dispose: () => {
        this.disconnectNode(gainNode);
        if (panNode) this.disconnectNode(panNode);
      },
    };
  }

  private buildFetCompressorRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createDynamicsCompressor) {
      return this.createPassthroughRuntime(insert, context, 'compressor-fallback');
    }
    const compressor = context.createDynamicsCompressor();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: compressor,
      outputNode: compressor,
      nodeKind: 'dynamics-compressor',
      gainNode: null,
      panNode: null,
      rewireInternal: () => {
        // single-node plugin
      },
      dspSnapshot: () => ({
        threshold: compressor.threshold.value,
        ratio: compressor.ratio.value,
        attack: compressor.attack.value,
        release: compressor.release.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);
        const threshold = clamp(toNumber(instance.parameters.threshold, -24), -60, 0);
        const ratio = clamp(toNumber(instance.parameters.ratio, 8), 4, 20);
        const attack = clamp(toNumber(instance.parameters.attack, 0.005), 0.001, 0.05);
        const release = clamp(toNumber(instance.parameters.release, 0.2), 0.05, 1);

        compressor.threshold.value = enabled ? threshold : 0;
        compressor.ratio.value = enabled ? 1 + (ratio - 1) * mix : 1;
        compressor.attack.value = attack;
        compressor.release.value = release;
        compressor.knee.value = 6;
      },
      dispose: () => {
        this.disconnectNode(compressor);
      },
    };
  }

  private buildOptoCompressorRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createDynamicsCompressor) {
      return this.createPassthroughRuntime(insert, context, 'opto-fallback');
    }
    const compressor = context.createDynamicsCompressor();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: compressor,
      outputNode: compressor,
      nodeKind: 'dynamics-compressor',
      gainNode: null,
      panNode: null,
      rewireInternal: () => {
        // single-node plugin
      },
      dspSnapshot: () => ({
        threshold: compressor.threshold.value,
        ratio: compressor.ratio.value,
        attack: compressor.attack.value,
        release: compressor.release.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const peakReduction = clamp(toNumber(instance.parameters.peakReduction, 45), 0, 100);
        const gain = clamp(toNumber(instance.parameters.gain, 0), 0, 24);
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);

        const threshold = -0.6 * peakReduction + gain * 0.05;
        const ratio = 2 + (peakReduction / 100) * 6;
        compressor.threshold.value = enabled ? clamp(threshold, -60, 0) : 0;
        compressor.ratio.value = enabled ? 1 + (ratio - 1) * mix : 1;
        compressor.attack.value = 0.02;
        compressor.release.value = 0.25;
        compressor.knee.value = 8;
      },
      dispose: () => {
        this.disconnectNode(compressor);
      },
    };
  }

  private buildAirEqRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createBiquadFilter) {
      return this.createPassthroughRuntime(insert, context, 'eq-fallback');
    }
    const filter = context.createBiquadFilter();
    filter.type = 'highshelf';
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: filter,
      outputNode: filter,
      nodeKind: 'biquad-highshelf',
      gainNode: null,
      panNode: null,
      rewireInternal: () => {
        // single-node plugin
      },
      dspSnapshot: () => ({
        type: filter.type,
        frequency: filter.frequency.value,
        gain: filter.gain.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);
        const freq = clamp(toNumber(instance.parameters.freq, 12000), 8000, 20000);
        const boost = clamp(toNumber(instance.parameters.boost, 2.5), 0, 15);
        filter.frequency.value = freq;
        filter.gain.value = enabled ? boost * mix : 0;
        filter.Q.value = 0.707;
      },
      dispose: () => {
        this.disconnectNode(filter);
      },
    };
  }

  private buildSlapDelayRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createDelay) {
      return this.createPassthroughRuntime(insert, context, 'delay-fallback');
    }

    const inputGain = context.createGain();
    const outputGain = context.createGain();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const feedbackGain = context.createGain();
    const delay = context.createDelay(1);

    const rewireInternal = () => {
      this.connectNodes(inputGain, dryGain);
      this.connectNodes(dryGain, outputGain);

      this.connectNodes(inputGain, delay);
      this.connectNodes(delay, wetGain);
      this.connectNodes(wetGain, outputGain);

      this.connectNodes(delay, feedbackGain);
      this.connectNodes(feedbackGain, delay);
    };
    rewireInternal();

    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: inputGain,
      outputNode: outputGain,
      nodeKind: 'delay-slap',
      gainNode: outputGain,
      panNode: null,
      rewireInternal,
      dspSnapshot: () => ({
        delayTime: delay.delayTime.value,
        feedback: feedbackGain.gain.value,
        wet: wetGain.gain.value,
        dry: dryGain.gain.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const time = clamp(toNumber(instance.parameters.time, 0.09), 0.05, 0.15);
        const feedback = clamp(toNumber(instance.parameters.feedback, 0.15), 0, 0.5);
        const mix = clamp(toNumber(instance.parameters.mix, instance.mix), 0, 1);

        delay.delayTime.value = time;
        feedbackGain.gain.value = enabled ? feedback : 0;
        wetGain.gain.value = enabled ? mix : 0;
        dryGain.gain.value = 1;
      },
      dispose: () => {
        this.disconnectNode(inputGain);
        this.disconnectNode(outputGain);
        this.disconnectNode(dryGain);
        this.disconnectNode(wetGain);
        this.disconnectNode(feedbackGain);
        this.disconnectNode(delay);
      },
    };
  }

  private buildPlatePlaceholderRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    const plateGain = context.createGain();
    plateGain.gain.value = 1;
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: plateGain,
      outputNode: plateGain,
      nodeKind: 'plate-placeholder',
      gainNode: plateGain,
      panNode: null,
      rewireInternal: () => {
        // single-node plugin
      },
      dspSnapshot: () => ({
        gain: plateGain.gain.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.parameters.mix, 0.2), 0, 1);
        const decay = clamp(toNumber(instance.parameters.decay, 1.8), 0.5, 5);
        const contour = 1 + (decay - 1) * 0.02;
        plateGain.gain.value = enabled ? 1 + mix * (contour - 1) : 1;
      },
      dispose: () => {
        this.disconnectNode(plateGain);
      },
    };
  }

  private buildBrickLimiterRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createDynamicsCompressor) {
      return this.createPassthroughRuntime(insert, context, 'limiter-fallback');
    }
    const limiter = context.createDynamicsCompressor();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: limiter,
      outputNode: limiter,
      nodeKind: 'dynamics-compressor',
      gainNode: null,
      panNode: null,
      rewireInternal: () => {
        // single-node plugin
      },
      dspSnapshot: () => ({
        threshold: limiter.threshold.value,
        ratio: limiter.ratio.value,
        attack: limiter.attack.value,
        release: limiter.release.value,
      }),
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const ceiling = clamp(toNumber(instance.parameters.ceiling, -0.8), -6, 0);
        const release = clamp(toNumber(instance.parameters.release, 0.2), 0.01, 2);
        limiter.threshold.value = enabled ? ceiling : 0;
        limiter.ratio.value = enabled ? 20 : 1;
        limiter.attack.value = 0.003;
        limiter.release.value = release;
        limiter.knee.value = 0;
      },
      dispose: () => {
        this.disconnectNode(limiter);
      },
    };
  }

  private disposeTrackRuntime(runtime: TrackRuntime): void {
    for (const source of runtime.activeSources.values()) {
      try {
        source.stop();
      } catch {
        // no-op
      }
      this.disconnectNode(source);
    }
    runtime.activeSources.clear();
    for (const plugin of runtime.plugins.values()) {
      plugin.dispose();
    }
    runtime.plugins.clear();
    this.disconnectNode(runtime.inputNode);
    if (runtime.panNode) this.disconnectNode(runtime.panNode);
    this.disconnectNode(runtime.gainNode);
  }

  private stopActiveSources(): void {
    for (const runtime of this.trackRuntimes.values()) {
      for (const source of runtime.activeSources.values()) {
        try {
          source.stop();
        } catch {
          // no-op
        }
        this.disconnectNode(source);
      }
      runtime.activeSources.clear();
    }
  }

  private connectNodes(source: AudioNodeLike, destination: AudioNodeLike): void {
    try {
      source.connect(destination);
    } catch {
      // deterministic no-op on connection failure
    }
  }

  private disconnectNode(node: AudioNodeLike): void {
    if (!node.disconnect) return;
    try {
      node.disconnect();
    } catch {
      // deterministic no-op on disconnect failure
    }
  }
}

export const audioPlaybackEngine = new AudioPlaybackEngine();
