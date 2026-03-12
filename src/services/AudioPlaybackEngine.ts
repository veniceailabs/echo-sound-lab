import {
  ReplayPluginInstance,
  ReplayRegionState,
  ReplayState,
  ReplayTrackState,
} from './deterministicReplayService';
import { assetRegistry, DecodedAssetBuffer } from './AssetRegistry';

export interface AudioParamLike {
  value: number;
  cancelScheduledValues?: (startTime: number) => void;
  setValueAtTime?: (value: number, startTime: number) => void;
  linearRampToValueAtTime?: (value: number, endTime: number) => void;
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

export interface WaveShaperNodeLike extends AudioNodeLike {
  curve: Float32Array | null;
  oversample: 'none' | '2x' | '4x';
}

export interface ConvolverNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  normalize: boolean;
}

export interface AnalyserNodeLike extends AudioNodeLike {
  fftSize: number;
  frequencyBinCount: number;
  smoothingTimeConstant?: number;
  getByteFrequencyData: (array: Uint8Array) => void;
  getByteTimeDomainData?: (array: Uint8Array) => void;
}

export interface AudioBufferLike {
  duration: number;
  length?: number;
  sampleRate?: number;
  numberOfChannels?: number;
  getChannelData?: (channel: number) => Float32Array;
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
  sampleRate?: number;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  decodeAudioData?: (audioData: ArrayBuffer) => Promise<AudioBufferLike>;
  createStereoPanner?: () => StereoPannerNodeLike;
  createDynamicsCompressor?: () => DynamicsCompressorNodeLike;
  createBiquadFilter?: () => BiquadFilterNodeLike;
  createDelay?: (maxDelayTime?: number) => DelayNodeLike;
  createWaveShaper?: () => WaveShaperNodeLike;
  createConvolver?: () => ConvolverNodeLike;
  createAnalyser?: () => AnalyserNodeLike;
  createBuffer?: (numberOfChannels: number, length: number, sampleRate: number) => AudioBufferLike;
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
  resolveAutomationParam: (paramId: string) => AudioParamLike | null;
  mapAutomationValue: (paramId: string, value: number) => number;
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

function isDecodedAssetBuffer(buffer: AudioBufferLike): buffer is AudioBufferLike & DecodedAssetBuffer {
  return (
    typeof buffer.length === 'number' &&
    typeof buffer.sampleRate === 'number' &&
    typeof buffer.numberOfChannels === 'number' &&
    typeof buffer.getChannelData === 'function'
  );
}

function createSoftClipCurve(amount: number, length = 2048): Float32Array {
  const curve = new Float32Array(length);
  const drive = Math.max(0, amount);
  for (let i = 0; i < length; i += 1) {
    const x = (i * 2) / (length - 1) - 1;
    curve[i] = Math.tanh(x * (1 + drive));
  }
  return curve;
}

function createBitcrushCurve(bits: number, length = 2048): Float32Array {
  const curve = new Float32Array(length);
  const depth = Math.max(2, Math.min(24, Math.round(bits)));
  const levels = Math.pow(2, depth - 1);
  for (let i = 0; i < length; i += 1) {
    const x = (i * 2) / (length - 1) - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

function fillSyntheticImpulse(
  buffer: AudioBufferLike,
  decaySeconds: number,
  tint = 1
): void {
  const channels = Math.max(1, buffer.numberOfChannels || 1);
  const length = Math.max(1, buffer.length || Math.floor((buffer.sampleRate || 44100) * decaySeconds));
  const sampleRate = buffer.sampleRate || 44100;
  if (!buffer.getChannelData) return;

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    const channelTint = tint * (channel === 0 ? 1 : 0.95);
    for (let i = 0; i < Math.min(length, data.length); i += 1) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t / Math.max(0.01, decaySeconds));
      const seeded = Math.sin((i + 1) * 12.9898 + (channel + 1) * 78.233) * 43758.5453;
      const noise = (seeded - Math.floor(seeded)) * 2 - 1;
      const white = noise * envelope * channelTint;
      data[i] = white;
    }
  }
}

function getSortedAutomationPoints(points: Array<{ timeSec: number; value: number }>): Array<{ timeSec: number; value: number }> {
  return [...points].sort((a, b) => (a.timeSec === b.timeSec ? a.value - b.value : a.timeSec - b.timeSec));
}

function sampleLinearValueAtTime(
  points: Array<{ timeSec: number; value: number }>,
  timeSec: number
): number | null {
  if (points.length === 0) return null;
  if (timeSec <= points[0].timeSec) return points[0].value;
  const last = points[points.length - 1];
  if (timeSec >= last.timeSec) return last.value;

  for (let idx = 0; idx < points.length - 1; idx += 1) {
    const left = points[idx];
    const right = points[idx + 1];
    if (timeSec < left.timeSec || timeSec > right.timeSec) continue;
    const span = right.timeSec - left.timeSec;
    if (span <= 0) return right.value;
    const alpha = (timeSec - left.timeSec) / span;
    return left.value + (right.value - left.value) * alpha;
  }
  return last.value;
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
  private masterAnalyserNode: AnalyserNodeLike | null = null;
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

    if (context.createAnalyser) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      if (typeof analyser.smoothingTimeConstant === 'number') {
        analyser.smoothingTimeConstant = 0.75;
      }
      this.connectNodes(this.masterGainNode, analyser);
      this.masterAnalyserNode = analyser;
    }
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
    await this.ensureRegionBuffersDecoded(state.regions);

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

  private async ensureRegionBuffersDecoded(regions: ReplayRegionState[]): Promise<void> {
    const context = this.requireContext();
    for (const region of regions) {
      const sourceId = region.sourceId;
      if (!sourceId) continue;
      if (this.regionBuffers.has(sourceId)) continue;

      const cachedDecoded = assetRegistry.getDecodedBuffer(sourceId);
      if (cachedDecoded) {
        this.regionBuffers.set(sourceId, cachedDecoded);
        continue;
      }

      const encodedBytes = assetRegistry.getArrayBuffer(sourceId);
      if (!encodedBytes || !context.decodeAudioData) continue;

      try {
        const decodedBuffer = await context.decodeAudioData(encodedBytes);
        if (!decodedBuffer) continue;
        this.regionBuffers.set(sourceId, decodedBuffer);
        if (isDecodedAssetBuffer(decodedBuffer)) {
          assetRegistry.setDecodedBuffer(sourceId, decodedBuffer);
        }
      } catch {
        // decode failed; deterministic no-op
      }
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

    this.scheduleAutomationForPlayback(clampedStart, context.currentTime);

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

  getMasterAnalyserNode(): AnalyserNodeLike | null {
    return this.masterAnalyserNode;
  }

  private scheduleAutomationForPlayback(playheadSec: number, contextStartTimeSec: number): void {
    if (!this.currentState || this.currentState.automation.length === 0) return;

    for (const lane of this.currentState.automation) {
      const runtime = this.trackRuntimes.get(lane.trackId);
      if (!runtime || !Array.isArray(lane.points) || lane.points.length === 0) continue;

      const points = getSortedAutomationPoints(
        lane.points.map((point) => ({
          timeSec: toNumber(point.timeSec, 0),
          value: toNumber(point.value, 0),
        }))
      );
      if (points.length === 0) continue;

      const target = this.resolveAutomationTarget(runtime, lane.parameter);
      if (!target) continue;

      const valueAtPlayhead = sampleLinearValueAtTime(points, playheadSec);
      if (valueAtPlayhead === null) continue;
      const mappedStartValue = target.mapValue(valueAtPlayhead);

      const audioParam = target.audioParam;
      if (!audioParam.cancelScheduledValues || !audioParam.setValueAtTime || !audioParam.linearRampToValueAtTime) {
        audioParam.value = mappedStartValue;
        continue;
      }

      audioParam.cancelScheduledValues(contextStartTimeSec);
      audioParam.setValueAtTime(mappedStartValue, contextStartTimeSec);

      const futurePoints = points.filter((point) => point.timeSec > playheadSec);
      for (const point of futurePoints) {
        const when = contextStartTimeSec + Math.max(0, point.timeSec - playheadSec);
        audioParam.linearRampToValueAtTime(target.mapValue(point.value), when);
      }
    }
  }

  private resolveAutomationTarget(
    runtime: TrackRuntime,
    parameter: string
  ): { audioParam: AudioParamLike; mapValue: (value: number) => number } | null {
    if (parameter === 'volumeDb' || parameter === 'track:volumeDb') {
      return {
        audioParam: runtime.gainNode.gain,
        mapValue: (value) => dbToLinear(value),
      };
    }

    if (parameter === 'pan' || parameter === 'track:pan') {
      if (!runtime.panNode) return null;
      return {
        audioParam: runtime.panNode.pan,
        mapValue: (value) => clamp(value, -1, 1),
      };
    }

    const pluginTarget = this.parsePluginAutomationTarget(parameter);
    if (!pluginTarget) return null;
    const plugin = runtime.plugins.get(pluginTarget.instanceId);
    if (!plugin) return null;
    const audioParam = plugin.resolveAutomationParam(pluginTarget.paramId);
    if (!audioParam) return null;
    return {
      audioParam,
      mapValue: (value) => plugin.mapAutomationValue(pluginTarget.paramId, value),
    };
  }

  private parsePluginAutomationTarget(parameter: string): { instanceId: string; paramId: string } | null {
    if (!parameter || typeof parameter !== 'string') return null;

    if (parameter.startsWith('plugin:') || parameter.startsWith('insert:')) {
      const parts = parameter.split(':');
      if (parts.length >= 3 && parts[1] && parts[2]) {
        return {
          instanceId: parts[1],
          paramId: parts.slice(2).join(':'),
        };
      }
      return null;
    }

    if (parameter.startsWith('plugin/')) {
      const parts = parameter.split('/');
      if (parts.length >= 3 && parts[1] && parts[2]) {
        return {
          instanceId: parts[1],
          paramId: parts.slice(2).join('/'),
        };
      }
      return null;
    }

    if (parameter.includes('.') && !parameter.startsWith('track.')) {
      const splitIndex = parameter.indexOf('.');
      const instanceId = parameter.slice(0, splitIndex);
      const paramId = parameter.slice(splitIndex + 1);
      if (instanceId && paramId) {
        return { instanceId, paramId };
      }
    }

    return null;
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
      case 'echo.vocal.comp.vca':
      case 'echo.bus.glue':
        return this.buildCompressorRuntime(insert, context, 'compressor-main');
      case 'echo.vocal.comp.opto':
        return this.buildCompressorRuntime(insert, context, 'compressor-opto');
      case 'echo.vocal.deesser':
        return this.buildDeEsserRuntime(insert, context);
      case 'echo.vocal.gate':
        return this.buildCompressorRuntime(insert, context, 'gate');
      case 'echo.vocal.rider':
        return this.buildGainTargetRuntime(insert, context, 'rider');
      case 'echo.vocal.expander':
        return this.buildGainTargetRuntime(insert, context, 'expander');
      case 'echo.vocal.harshness':
        return this.buildEqRuntime(insert, context, 'harshness');
      case 'echo.vocal.eq.air':
      case 'echo.vocal.eq.presence':
      case 'echo.vocal.eq.mud':
      case 'echo.vocal.eq.proximity':
      case 'echo.vocal.eq.tilt':
      case 'echo.fx.sub':
        return this.buildEqRuntime(insert, context, 'single');
      case 'echo.vocal.eq.telephone':
        return this.buildDualEqRuntime(insert, context, 'telephone');
      case 'echo.vocal.eq.tube':
        return this.buildDualEqRuntime(insert, context, 'tube');
      case 'echo.master.linear':
        return this.buildTripleEqRuntime(insert, context, 'master-linear');
      case 'echo.vocal.eq.clean':
        return this.buildTripleEqRuntime(insert, context, 'clean');
      case 'echo.space.reverb.plate':
      case 'echo.space.reverb.hall':
      case 'echo.space.reverb.room':
      case 'echo.space.reverb.spring':
      case 'echo.space.reverb.shimmer':
      case 'echo.space.reverb.chamber':
        return this.buildConvolverRuntime(insert, context);
      case 'echo.mod.delay.slap':
      case 'echo.space.delay.slap':
      case 'echo.mod.delay.pingpong':
      case 'echo.mod.delay.tape':
      case 'echo.mod.doubler':
      case 'echo.mod.chorus':
      case 'echo.fx.flanger':
      case 'echo.fx.phaser':
      case 'echo.fx.tremolo':
      case 'echo.fx.rotary':
        return this.buildDelayModRuntime(insert, context);
      case 'echo.color.tube':
      case 'echo.color.tape':
      case 'echo.color.bitcrush':
      case 'echo.bus.tapemaster':
      case 'echo.master.clipper':
      case 'echo.fx.vinyl':
      case 'echo.fx.amp':
      case 'echo.fx.fuzz':
      case 'echo.fx.ringmod':
      case 'echo.bus.smasher':
        return this.buildWaveShaperRuntime(insert, context);
      case 'echo.bus.transient':
      case 'echo.bus.width':
        return this.buildGainTargetRuntime(insert, context, 'bus-shaper');
      case 'echo.master.multiband':
        return this.buildTripleEqRuntime(insert, context, 'multiband');
      case 'echo.master.lufs':
        return this.buildGainTargetRuntime(insert, context, 'lufs');
      case 'echo.master.limiter.brick':
        return this.buildCompressorRuntime(insert, context, 'limiter');
      case 'echo.fx.autowah':
        return this.buildEqRuntime(insert, context, 'autowah');
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
      resolveAutomationParam: () => passthroughGain.gain,
      mapAutomationValue: (_, value) => value,
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'gainDb') return gainNode.gain;
        if (paramId === 'pan' && panNode) return panNode.pan;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'gainDb') return dbToLinear(value);
        if (paramId === 'pan') return clamp(value, -1, 1);
        return value;
      },
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

  private buildCompressorRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike,
    mode: 'compressor-main' | 'compressor-opto' | 'gate' | 'limiter'
  ): PluginRuntime {
    if (!context.createDynamicsCompressor) {
      return this.createPassthroughRuntime(insert, context, `${mode}-fallback`);
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'threshold' || paramId === 'ceiling' || paramId === 'peakReduction') return compressor.threshold;
        if (paramId === 'ratio' || paramId === 'makeup') return compressor.ratio;
        if (paramId === 'attack') return compressor.attack;
        if (paramId === 'release') return compressor.release;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'threshold' || paramId === 'ceiling') return clamp(value, -80, 0);
        if (paramId === 'ratio') return clamp(value, 1, 20);
        if (paramId === 'peakReduction') return clamp(value, -40, 0);
        if (paramId === 'makeup') return 1 + clamp(value, 0, 24) / 4;
        if (paramId === 'attack') return clamp(value, 0.001, 0.2);
        if (paramId === 'release') return clamp(value, 0.01, 2);
        return value;
      },
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);

        if (mode === 'compressor-opto') {
          const peakReduction = clamp(toNumber(instance.parameters.peakReduction, -10), -40, 0);
          const makeup = clamp(toNumber(instance.parameters.makeup, 2), 0, 24);
          compressor.threshold.value = enabled ? peakReduction : 0;
          compressor.ratio.value = enabled ? 1 + (1 + makeup / 6) * mix : 1;
          compressor.attack.value = 0.03;
          compressor.release.value = 0.25;
          compressor.knee.value = 8;
          return;
        }

        if (mode === 'gate') {
          const threshold = clamp(toNumber(instance.parameters.threshold, -50), -80, -20);
          const release = clamp(toNumber(instance.parameters.release, 0.5), 0.1, 2);
          compressor.threshold.value = enabled ? threshold : 0;
          compressor.ratio.value = enabled ? 20 : 1;
          compressor.attack.value = 0.001;
          compressor.release.value = release;
          compressor.knee.value = 0;
          return;
        }

        if (mode === 'limiter') {
          const ceiling = clamp(toNumber(instance.parameters.ceiling, -0.1), -6, 0);
          const release = clamp(toNumber(instance.parameters.release, 0.1), 0.01, 1);
          compressor.threshold.value = enabled ? ceiling : 0;
          compressor.ratio.value = enabled ? 20 : 1;
          compressor.attack.value = 0.003;
          compressor.release.value = release;
          compressor.knee.value = 0;
          return;
        }

        const threshold = clamp(toNumber(instance.parameters.threshold, -18), -60, 0);
        const ratio = clamp(toNumber(instance.parameters.ratio, 4), 1, 20);
        const attack = clamp(toNumber(instance.parameters.attack, 0.01), 0.001, 0.2);
        const release = clamp(toNumber(instance.parameters.release, 0.2), 0.01, 2);
        const makeup = clamp(toNumber(instance.parameters.makeup, 0), 0, 24);
        compressor.threshold.value = enabled ? threshold : 0;
        compressor.ratio.value = enabled ? 1 + (ratio - 1) * mix + makeup / 12 : 1;
        compressor.attack.value = attack;
        compressor.release.value = release;
        compressor.knee.value = 6;
      },
      dispose: () => {
        this.disconnectNode(compressor);
      },
    };
  }

  private buildGainTargetRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike,
    mode: 'rider' | 'expander' | 'bus-shaper' | 'lufs'
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
      nodeKind: 'gain-shaper',
      gainNode,
      panNode,
      rewireInternal,
      dspSnapshot: () => ({
        gain: gainNode.gain.value,
        pan: panNode ? panNode.pan.value : null,
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'targetLufs' || paramId === 'threshold' || paramId === 'attack' || paramId === 'sustain' || paramId === 'width' || paramId === 'mix') return gainNode.gain;
        if (paramId === 'speed' || paramId === 'ratio') return gainNode.gain;
        if (paramId === 'pan' && panNode) return panNode.pan;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'width' && panNode) return clamp((value - 100) / 100, -1, 1);
        return value;
      },
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);
        if (!enabled) {
          gainNode.gain.value = 1;
          if (panNode) panNode.pan.value = 0;
          return;
        }

        if (mode === 'rider') {
          const target = clamp(toNumber(instance.parameters.targetLufs, -14), -24, -6);
          const speed = clamp(toNumber(instance.parameters.speed, 1), 0.1, 2);
          const gainDb = (-14 - target) / Math.max(0.1, speed);
          gainNode.gain.value = 1 + (dbToLinear(gainDb) - 1) * mix;
          return;
        }
        if (mode === 'expander') {
          const threshold = clamp(toNumber(instance.parameters.threshold, -40), -60, -20);
          const ratio = clamp(toNumber(instance.parameters.ratio, 0.5), 0.1, 0.9);
          const gainDb = Math.abs(threshold + 20) * (1 - ratio) * 0.05;
          gainNode.gain.value = 1 + (dbToLinear(gainDb) - 1) * mix;
          return;
        }
        if (mode === 'lufs') {
          const target = clamp(toNumber(instance.parameters.target, -14), -24, -6);
          const gainDb = -14 - target;
          gainNode.gain.value = 1 + (dbToLinear(gainDb) - 1) * mix;
          return;
        }

        const attack = clamp(toNumber(instance.parameters.attack, 20), -100, 100);
        const sustain = clamp(toNumber(instance.parameters.sustain, 0), -100, 100);
        const width = clamp(toNumber(instance.parameters.width, 100), 0, 200);
        gainNode.gain.value = 1 + ((attack * 0.003 + sustain * 0.002) * mix);
        if (panNode) {
          panNode.pan.value = clamp((width - 100) / 100, -1, 1);
        }
      },
      dispose: () => {
        this.disconnectNode(gainNode);
        if (panNode) this.disconnectNode(panNode);
      },
    };
  }

  private buildEqRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike,
    mode: 'single' | 'harshness' | 'autowah'
  ): PluginRuntime {
    if (!context.createBiquadFilter) {
      return this.createPassthroughRuntime(insert, context, 'eq-fallback');
    }
    const filter = context.createBiquadFilter();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: filter,
      outputNode: filter,
      nodeKind: 'biquad-filter',
      gainNode: null,
      panNode: null,
      rewireInternal: () => {
        // single-node plugin
      },
      dspSnapshot: () => ({
        type: filter.type,
        frequency: filter.frequency.value,
        gain: filter.gain.value,
        q: filter.Q.value,
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId.includes('freq') || paramId === 'frequency' || paramId === 'hpf') return filter.frequency;
        if (paramId.includes('gain') || paramId.includes('boost') || paramId.includes('cut') || paramId === 'tilt' || paramId === 'amount') return filter.gain;
        if (paramId === 'resonance') return filter.Q;
        return null;
      },
      mapAutomationValue: (_, value: number) => value,
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const mix = clamp(toNumber(instance.mix, 1), 0, 1);
        const id = instance.manifestId;

        if (!enabled) {
          filter.type = 'allpass';
          filter.frequency.value = 1000;
          filter.gain.value = 0;
          filter.Q.value = 0.707;
          return;
        }

        if (mode === 'autowah') {
          filter.type = 'bandpass';
          const sensitivity = clamp(toNumber(instance.parameters.sensitivity, 50), 0, 100);
          const resonance = clamp(toNumber(instance.parameters.resonance, 70), 0, 100);
          filter.frequency.value = 300 + sensitivity * 35;
          filter.Q.value = 0.2 + resonance * 0.08;
          filter.gain.value = 0;
          return;
        }

        if (mode === 'harshness') {
          filter.type = 'peaking';
          const amount = clamp(toNumber(instance.parameters.amount, 50), 0, 100);
          const freq = clamp(toNumber(instance.parameters.freq, 3000), 2000, 5000);
          filter.frequency.value = freq;
          filter.Q.value = 2.5;
          filter.gain.value = -amount * 0.12 * mix;
          return;
        }

        if (id === 'echo.vocal.eq.air') {
          filter.type = 'highshelf';
          filter.frequency.value = clamp(toNumber(instance.parameters.freq, 12000), 8000, 20000);
          filter.gain.value = clamp(toNumber(instance.parameters.boost, 4), 0, 15) * mix;
          filter.Q.value = 0.707;
          return;
        }
        if (id === 'echo.vocal.eq.presence') {
          filter.type = 'peaking';
          filter.frequency.value = clamp(toNumber(instance.parameters.freq, 3500), 2000, 6000);
          filter.gain.value = clamp(toNumber(instance.parameters.gain, 3), -10, 10) * mix;
          filter.Q.value = 1.2;
          return;
        }
        if (id === 'echo.vocal.eq.mud') {
          filter.type = 'peaking';
          filter.frequency.value = clamp(toNumber(instance.parameters.freq, 300), 200, 600);
          filter.gain.value = clamp(toNumber(instance.parameters.cut, -4), -15, 0) * mix;
          filter.Q.value = 1.1;
          return;
        }
        if (id === 'echo.vocal.eq.proximity') {
          filter.type = 'lowshelf';
          filter.frequency.value = clamp(toNumber(instance.parameters.freq, 120), 80, 200);
          filter.gain.value = clamp(toNumber(instance.parameters.boost, 3), 0, 10) * mix;
          filter.Q.value = 0.707;
          return;
        }
        if (id === 'echo.vocal.eq.tilt') {
          filter.type = 'highshelf';
          filter.frequency.value = 3200;
          filter.gain.value = clamp(toNumber(instance.parameters.tilt, 0), -10, 10) * mix;
          filter.Q.value = 0.707;
          return;
        }
        if (id === 'echo.fx.sub') {
          filter.type = 'lowshelf';
          filter.frequency.value = clamp(toNumber(instance.parameters.freq, 50), 30, 80);
          const mixPct = clamp(toNumber(instance.parameters.mix, 30), 0, 100) / 100;
          filter.gain.value = mixPct * 9;
          filter.Q.value = 0.8;
          return;
        }

        filter.type = 'peaking';
        filter.frequency.value = 1000;
        filter.gain.value = 0;
        filter.Q.value = 1;
      },
      dispose: () => {
        this.disconnectNode(filter);
      },
    };
  }

  private buildDualEqRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike,
    mode: 'telephone' | 'tube'
  ): PluginRuntime {
    if (!context.createBiquadFilter) {
      return this.createPassthroughRuntime(insert, context, 'eq-dual-fallback');
    }
    const first = context.createBiquadFilter();
    const second = context.createBiquadFilter();
    const rewireInternal = () => {
      this.connectNodes(first, second);
    };
    rewireInternal();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: first,
      outputNode: second,
      nodeKind: 'dual-biquad',
      gainNode: null,
      panNode: null,
      rewireInternal,
      dspSnapshot: () => ({
        firstType: first.type,
        secondType: second.type,
        firstFreq: first.frequency.value,
        secondFreq: second.frequency.value,
        firstGain: first.gain.value,
        secondGain: second.gain.value,
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'lowcut' || paramId === 'hpf' || paramId === 'lowBoost') return first.frequency;
        if (paramId === 'highcut' || paramId === 'highBoost') return second.frequency;
        return null;
      },
      mapAutomationValue: (_, value: number) => value,
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        if (!enabled) {
          first.type = 'allpass';
          second.type = 'allpass';
          first.frequency.value = 1000;
          second.frequency.value = 1000;
          first.gain.value = 0;
          second.gain.value = 0;
          return;
        }

        if (mode === 'telephone') {
          first.type = 'highpass';
          second.type = 'lowpass';
          first.frequency.value = clamp(toNumber(instance.parameters.lowcut, 500), 300, 1000);
          second.frequency.value = clamp(toNumber(instance.parameters.highcut, 4000), 2000, 6000);
          first.Q.value = 0.707;
          second.Q.value = 0.707;
          return;
        }

        first.type = 'lowshelf';
        second.type = 'highshelf';
        first.frequency.value = 180;
        second.frequency.value = 8200;
        first.gain.value = clamp(toNumber(instance.parameters.lowBoost, 0), 0, 10);
        second.gain.value = clamp(toNumber(instance.parameters.highBoost, 0), 0, 10);
      },
      dispose: () => {
        this.disconnectNode(first);
        this.disconnectNode(second);
      },
    };
  }

  private buildTripleEqRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike,
    mode: 'clean' | 'multiband' | 'master-linear'
  ): PluginRuntime {
    if (!context.createBiquadFilter) {
      return this.createPassthroughRuntime(insert, context, 'eq-triple-fallback');
    }
    const lowFilter = context.createBiquadFilter();
    const lowGain = context.createGain();
    const midFilter = context.createBiquadFilter();
    const midGain = context.createGain();
    const highFilter = context.createBiquadFilter();
    const highGain = context.createGain();
    const rewireInternal = () => {
      this.connectNodes(lowFilter, lowGain);
      this.connectNodes(lowGain, midFilter);
      this.connectNodes(midFilter, midGain);
      this.connectNodes(midGain, highFilter);
      this.connectNodes(highFilter, highGain);
    };
    rewireInternal();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: lowFilter,
      outputNode: highGain,
      nodeKind: 'triple-eq-chain',
      gainNode: highGain,
      panNode: null,
      rewireInternal,
      dspSnapshot: () => ({
        lowType: lowFilter.type,
        midType: midFilter.type,
        highType: highFilter.type,
        lowFreq: lowFilter.frequency.value,
        midFreq: midFilter.frequency.value,
        highFreq: highFilter.frequency.value,
        lowGain: lowFilter.gain.value,
        midGain: midFilter.gain.value,
        highGain: highFilter.gain.value,
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'hpf' || paramId === 'low' || paramId === 'lowGain') return lowFilter.frequency;
        if (paramId === 'notchFreq' || paramId === 'mid' || paramId === 'midGain') return midFilter.frequency;
        if (paramId === 'high' || paramId === 'highGain') return highFilter.frequency;
        if (paramId === 'notchCut') return midFilter.gain;
        return null;
      },
      mapAutomationValue: (_, value: number) => value,
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        if (!enabled) {
          lowFilter.type = 'allpass';
          midFilter.type = 'allpass';
          highFilter.type = 'allpass';
          lowGain.gain.value = 1;
          midGain.gain.value = 1;
          highGain.gain.value = 1;
          return;
        }

        if (mode === 'clean') {
          lowFilter.type = 'highpass';
          lowFilter.frequency.value = clamp(toNumber(instance.parameters.hpf, 80), 20, 200);
          lowFilter.Q.value = 0.707;
          midFilter.type = 'notch';
          midFilter.frequency.value = clamp(toNumber(instance.parameters.notchFreq, 2000), 1000, 5000);
          midFilter.gain.value = clamp(toNumber(instance.parameters.notchCut, 0), -20, 0);
          midFilter.Q.value = 4;
          highFilter.type = 'allpass';
          return;
        }

        if (mode === 'multiband') {
          lowFilter.type = 'lowshelf';
          midFilter.type = 'peaking';
          highFilter.type = 'highshelf';
          lowFilter.frequency.value = 120;
          midFilter.frequency.value = 1000;
          highFilter.frequency.value = 6000;
          lowFilter.gain.value = clamp(toNumber(instance.parameters.lowGain, 0), -10, 10);
          midFilter.gain.value = clamp(toNumber(instance.parameters.midGain, 0), -10, 10);
          highFilter.gain.value = clamp(toNumber(instance.parameters.highGain, 0), -10, 10);
          lowGain.gain.value = 1;
          midGain.gain.value = 1;
          highGain.gain.value = 1;
          return;
        }

        lowFilter.type = 'lowshelf';
        midFilter.type = 'peaking';
        highFilter.type = 'highshelf';
        lowFilter.frequency.value = 120;
        midFilter.frequency.value = 1000;
        highFilter.frequency.value = 8000;
        lowFilter.gain.value = clamp(toNumber(instance.parameters.low, 0), -6, 6);
        midFilter.gain.value = clamp(toNumber(instance.parameters.mid, 0), -6, 6);
        highFilter.gain.value = clamp(toNumber(instance.parameters.high, 0), -6, 6);
        lowGain.gain.value = 1;
        midGain.gain.value = 1;
        highGain.gain.value = 1;
      },
      dispose: () => {
        this.disconnectNode(lowFilter);
        this.disconnectNode(lowGain);
        this.disconnectNode(midFilter);
        this.disconnectNode(midGain);
        this.disconnectNode(highFilter);
        this.disconnectNode(highGain);
      },
    };
  }

  private buildConvolverRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createConvolver || !context.createBuffer) {
      return this.createPassthroughRuntime(insert, context, 'reverb-fallback');
    }
    const inputGain = context.createGain();
    const outputGain = context.createGain();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const convolver = context.createConvolver();
    convolver.normalize = true;
    const rewireInternal = () => {
      this.connectNodes(inputGain, dryGain);
      this.connectNodes(dryGain, outputGain);
      this.connectNodes(inputGain, convolver);
      this.connectNodes(convolver, wetGain);
      this.connectNodes(wetGain, outputGain);
    };
    rewireInternal();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: inputGain,
      outputNode: outputGain,
      nodeKind: 'convolver-reverb',
      gainNode: wetGain,
      panNode: null,
      rewireInternal,
      dspSnapshot: () => ({
        wet: wetGain.gain.value,
        dry: dryGain.gain.value,
        hasImpulse: Boolean(convolver.buffer),
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'mix' || paramId === 'boing' || paramId === 'shimmerAmount') return wetGain.gain;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'mix') return clamp(value, 0, 1);
        return clamp(value / 100, 0, 1);
      },
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const id = instance.manifestId;
        const decayRaw = clamp(toNumber(instance.parameters.decay, 1.5), 0.1, 20);
        const mixRaw = clamp(toNumber(instance.parameters.mix, 0.2), 0, 1);
        const boing = clamp(toNumber(instance.parameters.boing, 50), 0, 100) / 100;
        const shimmer = clamp(toNumber(instance.parameters.shimmerAmount, 50), 0, 100) / 100;
        const mix = id === 'echo.space.reverb.spring' ? boing : id === 'echo.space.reverb.shimmer' ? shimmer : mixRaw;
        const sampleRate = context.sampleRate || 44100;
        const length = Math.max(1, Math.floor(sampleRate * decayRaw));
        const impulse = context.createBuffer(2, length, sampleRate);
        fillSyntheticImpulse(impulse, decayRaw, id === 'echo.space.reverb.shimmer' ? 0.75 : 1);
        convolver.buffer = impulse;
        wetGain.gain.value = enabled ? mix : 0;
        dryGain.gain.value = 1;
      },
      dispose: () => {
        this.disconnectNode(inputGain);
        this.disconnectNode(outputGain);
        this.disconnectNode(dryGain);
        this.disconnectNode(wetGain);
        this.disconnectNode(convolver);
      },
    };
  }

  private buildDelayModRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createDelay) {
      return this.createPassthroughRuntime(insert, context, 'delay-mod-fallback');
    }
    const inputGain = context.createGain();
    const outputGain = context.createGain();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const feedbackGain = context.createGain();
    const delay = context.createDelay(2);
    let panNode: StereoPannerNodeLike | null = null;
    if (context.createStereoPanner) {
      panNode = context.createStereoPanner();
    }
    const rewireInternal = () => {
      this.connectNodes(inputGain, dryGain);
      this.connectNodes(dryGain, outputGain);

      this.connectNodes(inputGain, delay);
      if (panNode) {
        this.connectNodes(delay, panNode);
        this.connectNodes(panNode, wetGain);
      } else {
        this.connectNodes(delay, wetGain);
      }
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
      nodeKind: 'delay-mod',
      gainNode: wetGain,
      panNode,
      rewireInternal,
      dspSnapshot: () => ({
        delayTime: delay.delayTime.value,
        feedback: feedbackGain.gain.value,
        wet: wetGain.gain.value,
        dry: dryGain.gain.value,
        pan: panNode ? panNode.pan.value : null,
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'time') return delay.delayTime;
        if (paramId === 'feedback' || paramId === 'depth' || paramId === 'mix') return wetGain.gain;
        if (paramId === 'width' && panNode) return panNode.pan;
        if (paramId === 'rate') return feedbackGain.gain;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'width') return clamp(value, -1, 1);
        return value;
      },
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const id = instance.manifestId;
        const mix = clamp(
          toNumber(
            instance.parameters.mix,
            toNumber(instance.parameters.depth, 50) / 100
          ),
          0,
          1
        );
        const rate = clamp(toNumber(instance.parameters.rate, 1), 0.1, 20);
        const feedback = clamp(toNumber(instance.parameters.feedback, 0.2), 0, 0.9);

        let time = clamp(toNumber(instance.parameters.time, 0.18), 0.01, 2);
        if (id === 'echo.mod.delay.slap' || id === 'echo.space.delay.slap') {
          time = clamp(toNumber(instance.parameters.time, 0.08), 0.05, 0.15);
        } else if (id === 'echo.mod.delay.pingpong') {
          time = clamp(toNumber(instance.parameters.time, 0.25), 0.1, 1);
        } else if (id === 'echo.mod.delay.tape') {
          time = clamp(toNumber(instance.parameters.time, 0.3), 0.1, 1);
          const wow = clamp(toNumber(instance.parameters.wow, 20), 0, 100) / 100;
          time = clamp(time * (1 + wow * 0.08), 0.01, 2);
        } else if (id === 'echo.mod.doubler') {
          time = 0.015 + clamp(toNumber(instance.parameters.detune, 15), 0, 50) * 0.0007;
        } else if (id === 'echo.mod.chorus') {
          time = 0.012 + (clamp(toNumber(instance.parameters.depth, 40), 0, 100) / 100) * 0.018;
        } else if (id === 'echo.fx.flanger') {
          time = 0.001 + (clamp(toNumber(instance.parameters.depth, 60), 0, 100) / 100) * 0.004;
        } else if (id === 'echo.fx.phaser') {
          time = 0.004 + (clamp(toNumber(instance.parameters.feedback, 50), 0, 100) / 100) * 0.006;
        } else if (id === 'echo.fx.tremolo') {
          time = 1 / Math.max(1, rate * 4);
        } else if (id === 'echo.fx.rotary') {
          const speed = clamp(toNumber(instance.parameters.speed, 50), 0, 100);
          time = 0.03 + (speed / 100) * 0.08;
        }

        delay.delayTime.value = time;
        feedbackGain.gain.value = enabled ? feedback : 0;
        wetGain.gain.value = enabled ? mix : 0;
        dryGain.gain.value = 1;
        if (panNode) {
          const width = clamp(toNumber(instance.parameters.width, 100), 0, 200);
          panNode.pan.value = enabled ? clamp((width - 100) / 100, -1, 1) : 0;
        }
      },
      dispose: () => {
        this.disconnectNode(inputGain);
        this.disconnectNode(outputGain);
        this.disconnectNode(dryGain);
        this.disconnectNode(wetGain);
        this.disconnectNode(feedbackGain);
        this.disconnectNode(delay);
        if (panNode) this.disconnectNode(panNode);
      },
    };
  }

  private buildWaveShaperRuntime(
    insert: ReplayPluginInstance,
    context: AudioContextLike
  ): PluginRuntime {
    if (!context.createWaveShaper) {
      return this.createPassthroughRuntime(insert, context, 'waveshaper-fallback');
    }
    const inputGain = context.createGain();
    const outputGain = context.createGain();
    const preGain = context.createGain();
    const shaper = context.createWaveShaper();
    shaper.oversample = '2x';
    let postFilter: BiquadFilterNodeLike | null = null;
    if (context.createBiquadFilter) {
      postFilter = context.createBiquadFilter();
      postFilter.type = 'lowpass';
      postFilter.frequency.value = 18000;
      postFilter.Q.value = 0.707;
    }
    let compressor: DynamicsCompressorNodeLike | null = null;
    if (insert.manifestId === 'echo.bus.smasher' && context.createDynamicsCompressor) {
      compressor = context.createDynamicsCompressor();
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.08;
      compressor.threshold.value = -28;
    }
    const rewireInternal = () => {
      this.connectNodes(inputGain, preGain);
      if (compressor) {
        this.connectNodes(preGain, compressor);
        this.connectNodes(compressor, shaper);
      } else {
        this.connectNodes(preGain, shaper);
      }
      if (postFilter) {
        this.connectNodes(shaper, postFilter);
        this.connectNodes(postFilter, outputGain);
      } else {
        this.connectNodes(shaper, outputGain);
      }
    };
    rewireInternal();
    return {
      instanceId: insert.instanceId,
      manifestId: insert.manifestId,
      inputNode: inputGain,
      outputNode: outputGain,
      nodeKind: 'waveshaper',
      gainNode: outputGain,
      panNode: null,
      rewireInternal,
      dspSnapshot: () => ({
        preGain: preGain.gain.value,
        outputGain: outputGain.gain.value,
        curveLength: shaper.curve ? shaper.curve.length : 0,
      }),
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'drive' || paramId === 'saturation' || paramId === 'fuzz') return preGain.gain;
        if (paramId === 'mix' || paramId === 'knee' || paramId === 'tone') return outputGain.gain;
        return null;
      },
      mapAutomationValue: (_, value: number) => value,
      apply: (instance: ReplayPluginInstance) => {
        const enabled = instance.enabled !== false;
        const id = instance.manifestId;
        const mix = clamp(
          toNumber(
            instance.parameters.mix,
            toNumber(instance.parameters.drive, 0) / 100
          ),
          0,
          1
        );
        const driveDb = clamp(toNumber(instance.parameters.drive, 0), 0, 100);
        const saturation = clamp(toNumber(instance.parameters.saturation, driveDb), 0, 100);
        const fuzz = clamp(toNumber(instance.parameters.fuzz, driveDb), 0, 100);
        const tone = clamp(toNumber(instance.parameters.tone, 50), 0, 100);
        const bits = clamp(toNumber(instance.parameters.bits, 8), 4, 16);
        const knee = clamp(toNumber(instance.parameters.knee, 50), 0, 100);
        const ringFreq = clamp(toNumber(instance.parameters.freq, 500), 100, 2000);
        const ringMix = clamp(toNumber(instance.parameters.mix, 50), 0, 100) / 100;

        preGain.gain.value = enabled ? 1 + (driveDb + saturation + fuzz) / 45 : 1;
        outputGain.gain.value = enabled ? 1 + mix * 0.2 : 1;

        if (id === 'echo.color.bitcrush') {
          shaper.curve = createBitcrushCurve(bits);
          shaper.oversample = 'none';
        } else if (id === 'echo.fx.ringmod') {
          shaper.curve = createSoftClipCurve(0.2 + ringMix * 0.6, 2048);
          preGain.gain.value = enabled ? 1 + (ringFreq - 100) / 2400 : 1;
        } else if (id === 'echo.master.clipper') {
          shaper.curve = createSoftClipCurve(0.4 + knee / 100, 4096);
          shaper.oversample = '4x';
        } else {
          shaper.curve = createSoftClipCurve(0.2 + (driveDb + saturation + fuzz) / 100, 4096);
          shaper.oversample = '2x';
        }

        if (postFilter) {
          if (id === 'echo.fx.amp') {
            const cabinet = clamp(toNumber(instance.parameters.cabinet, 1), 1, 3);
            postFilter.type = 'lowpass';
            postFilter.frequency.value = 4200 + cabinet * 1200;
          } else {
            postFilter.type = 'lowpass';
            postFilter.frequency.value = 1000 + tone * 180;
          }
        }
      },
      dispose: () => {
        this.disconnectNode(inputGain);
        this.disconnectNode(outputGain);
        this.disconnectNode(preGain);
        this.disconnectNode(shaper);
        if (postFilter) this.disconnectNode(postFilter);
        if (compressor) this.disconnectNode(compressor);
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'threshold') return compressor.threshold;
        if (paramId === 'ratio') return compressor.ratio;
        if (paramId === 'attack') return compressor.attack;
        if (paramId === 'release') return compressor.release;
        return null;
      },
      mapAutomationValue: (_, value) => value,
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'peakReduction') return compressor.threshold;
        if (paramId === 'gain') return compressor.ratio;
        if (paramId === 'threshold') return compressor.threshold;
        if (paramId === 'ratio') return compressor.ratio;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'peakReduction') {
          return clamp(-0.6 * clamp(value, 0, 100), -60, 0);
        }
        if (paramId === 'gain') {
          const normalized = clamp(value, 0, 24) / 24;
          return 1 + normalized * 7;
        }
        return value;
      },
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'freq') return filter.frequency;
        if (paramId === 'boost') return filter.gain;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'freq') return clamp(value, 8000, 20000);
        if (paramId === 'boost') return clamp(value, 0, 15);
        return value;
      },
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'time') return delay.delayTime;
        if (paramId === 'feedback') return feedbackGain.gain;
        if (paramId === 'mix') return wetGain.gain;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'time') return clamp(value, 0.05, 0.15);
        if (paramId === 'feedback') return clamp(value, 0, 0.5);
        if (paramId === 'mix') return clamp(value, 0, 1);
        return value;
      },
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'mix' || paramId === 'decay') return plateGain.gain;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'mix') return 1 + clamp(value, 0, 1) * 0.2;
        if (paramId === 'decay') return 1 + clamp(value, 0.5, 5) * 0.02;
        return value;
      },
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
      resolveAutomationParam: (paramId: string) => {
        if (paramId === 'ceiling') return limiter.threshold;
        if (paramId === 'release') return limiter.release;
        return null;
      },
      mapAutomationValue: (paramId: string, value: number) => {
        if (paramId === 'ceiling') return clamp(value, -6, 0);
        if (paramId === 'release') return clamp(value, 0.01, 2);
        return value;
      },
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
