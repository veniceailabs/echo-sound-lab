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

    this.stop();

    for (const runtime of this.trackRuntimes.values()) {
      for (const region of runtime.regions) {
        const buffer = this.regionBuffers.get(region.sourceId);
        if (!buffer) continue;

        const regionEnd = region.startTimeSec + region.durationSec;
        if (regionEnd <= playheadSec) continue;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.onended = null;
        this.connectNodes(source, runtime.inputNode);

        const startOffsetIntoRegion = Math.max(0, playheadSec - region.startTimeSec);
        const when = context.currentTime + Math.max(0, region.startTimeSec - playheadSec);
        const offset = Math.max(0, region.offsetSec + startOffsetIntoRegion);
        const duration = Math.max(0, region.durationSec - startOffsetIntoRegion);
        if (duration <= 0) continue;

        source.start(when, offset, duration);
        runtime.activeSources.set(region.regionId, source);
      }
    }
  }

  stop(): void {
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

    if (insert.manifestId === 'echo.utility.gain.v1') {
      const gainNode = context.createGain();
      let panNode: StereoPannerNodeLike | null = null;
      let outputNode: AudioNodeLike = gainNode;
      if (context.createStereoPanner) {
        panNode = context.createStereoPanner();
        this.connectNodes(gainNode, panNode);
        outputNode = panNode;
      }

      const apply = (instance: ReplayPluginInstance): void => {
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
      };

      return {
        instanceId: insert.instanceId,
        manifestId: insert.manifestId,
        inputNode: gainNode,
        outputNode,
        nodeKind: 'utility-gain',
        gainNode,
        panNode,
        apply,
        dispose: () => {
          this.disconnectNode(gainNode);
          if (panNode) this.disconnectNode(panNode);
        },
      };
    }

    const passthroughGain = context.createGain();
    passthroughGain.gain.value = 1;
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: passthroughGain,
      outputNode: passthroughGain,
      nodeKind: 'passthrough',
      gainNode: passthroughGain,
      panNode: null,
      apply: () => {
        passthroughGain.gain.value = 1;
      },
      dispose: () => {
        this.disconnectNode(passthroughGain);
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

