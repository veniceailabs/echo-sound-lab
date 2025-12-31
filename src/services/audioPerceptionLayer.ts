/**
 * PHASE 1 LOCK - READ-ONLY PERCEPTION SURFACE
 *
 * This file is part of the Phase 1 APL <-> ANME boundary.
 *
 * Invariants:
 * - No control authority
 * - No lifecycle control
 * - No DSP execution
 * - No persistence
 * - No inferred intent
 *
 * Any mutation, execution, or control capability
 * requires a new, versioned contract (Phase 2+).
 */

type APLState = 'idle' | 'listening' | 'paused' | 'closed';

export interface APLConfig {
  frameMs: number;
  embeddingWindowMs: number;
  maxFrames: number;
  logEveryMs: number;
  devLogging: boolean;
}

export interface APLStemContext {
  stemId?: string;
  stemType?: string;
  role?: string;
  channelIndex?: number;
}

export interface APLInput {
  analyser: AnalyserNode;
  sampleRate: number;
  sourceId?: string;
  sourceType?: 'file' | 'bus' | 'live' | 'reference';
  durationSec?: number;
  stemContext?: APLStemContext;
}

export interface PerceptualFrame {
  timestampMs: number;
  brightness: number;
  density: number;
  dynamics: number;
  transientEnergy: number;
  stemContext?: APLStemContext;
}

export interface PerceptualEmbedding {
  windowStartMs: number;
  windowEndMs: number;
  brightnessMean: number;
  brightnessVariance: number;
  densityMean: number;
  dynamicsMean: number;
  transientMean: number;
  brightnessTrend: number;
  densityTrend: number;
  dynamicsTrend: number;
  transientTrend: number;
  stemContext?: APLStemContext;
}

export type APLChangeType =
  | 'BRIGHTNESS_INCREASE'
  | 'BRIGHTNESS_DROP'
  | 'DENSITY_INCREASE'
  | 'DENSITY_DROP'
  | 'DYNAMICS_RISE'
  | 'DYNAMICS_DROP'
  | 'TRANSIENT_SPIKE'
  | 'TRANSIENT_SOFTENING';

export interface APLChangeEvent {
  windowStartMs: number;
  windowEndMs: number;
  type: APLChangeType;
  magnitude: number;
  confidence: number;
  stemContext?: APLStemContext;
}

export interface APLSnapshot {
  state: APLState;
  latestFrame?: PerceptualFrame;
  latestEmbedding?: PerceptualEmbedding;
  recentChanges: APLChangeEvent[];
  stemContext?: APLStemContext;
}

export type APLEventType = 'frame' | 'embedding' | 'change' | 'state';
export type APLEventHandler = (payload: unknown) => void;

const DEFAULT_CONFIG: APLConfig = {
  frameMs: 100,
  embeddingWindowMs: 2000,
  maxFrames: 120,
  logEveryMs: 1000,
  devLogging: false,
};

const IS_DEV = process.env.NODE_ENV === 'development';
const HIGH_BAND_START_HZ = 4000;
const MAX_CHANGE_EVENTS = 12;
const CHANGE_THRESHOLDS = {
  brightness: 0.08,
  density: 0.08,
  dynamics: 0.08,
  transient: 0.1,
};

const clamp01 = (val: number) => Math.min(1, Math.max(0, val));
const devInvariant = (condition: boolean, message: string) => {
  if (IS_DEV && !condition) {
    throw new Error(`[APL] Invariant failed: ${message}`);
  }
};
const isPromiseLike = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { then?: unknown }).then === 'function';
};
const isClassInstance = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto !== Object.prototype && proto !== null;
};

class AudioPerceptionLayer {
  private state: APLState = 'idle';
  private analyser: AnalyserNode | null = null;
  private sampleRate = 44100;
  private config: APLConfig = { ...DEFAULT_CONFIG };
  private intervalId: number | null = null;
  private startTimeMs = 0;
  private lastLogMs = 0;
  private latestFrame: PerceptualFrame | undefined;
  private latestEmbedding: PerceptualEmbedding | undefined;
  private recentChanges: APLChangeEvent[] = [];
  private frames: PerceptualFrame[] = [];
  private freqData: Float32Array | null = null;
  private timeData: Float32Array | null = null;
  private listeners: Map<APLEventType, Set<APLEventHandler>> = new Map();
  private sourceId: string | undefined;
  private sourceType: APLInput['sourceType'] | undefined;
  private stemContext: APLStemContext | undefined;

  // Phase 1 lock: configure() is internal to APL lifecycle; ANME must never call or proxy this.
  configure(overrides: Partial<APLConfig>) {
    this.config = { ...this.config, ...overrides };
  }

  start(input: APLInput, overrides?: Partial<APLConfig>) {
    if (!input.analyser) return;
    if (this.state === 'listening') return;
    if (this.state === 'paused') {
      this.resume();
      return;
    }
    if (overrides) {
      this.configure(overrides);
    }
    this.analyser = input.analyser;
    this.sampleRate = input.sampleRate;
    this.sourceId = input.sourceId;
    this.sourceType = input.sourceType;
    this.stemContext = input.stemContext ? this.freezeIfDev({ ...input.stemContext }) : undefined;
    this.startTimeMs = performance.now();
    this.lastLogMs = 0;
    this.latestFrame = undefined;
    this.latestEmbedding = undefined;
    this.recentChanges = [];
    this.frames = [];
    this.ensureBuffers();
    this.state = 'listening';
    this.emit('state', this.state);
    this.startLoop();
  }

  pause() {
    if (this.state !== 'listening') return;
    this.stopLoop();
    this.state = 'paused';
    this.emit('state', this.state);
  }

  resume() {
    if (this.state !== 'paused') return;
    if (!this.analyser) return;
    this.state = 'listening';
    this.emit('state', this.state);
    this.startLoop();
  }

  stop() {
    this.stopLoop();
    this.analyser = null;
    this.freqData = null;
    this.timeData = null;
    this.latestFrame = undefined;
    this.latestEmbedding = undefined;
    this.recentChanges = [];
    this.frames = [];
    this.sourceId = undefined;
    this.sourceType = undefined;
    this.stemContext = undefined;
    this.state = 'idle';
    this.emit('state', this.state);
  }

  close() {
    this.stop();
    this.state = 'closed';
    this.emit('state', this.state);
  }

  getSnapshot(): APLSnapshot {
    const recentChanges = [...this.recentChanges];
    if (IS_DEV) {
      recentChanges.forEach(change => {
        this.assertFrozen(change, 'APL change event');
      });
      Object.freeze(recentChanges);
    }
    const snapshot = {
      state: this.state,
      latestFrame: this.latestFrame,
      latestEmbedding: this.latestEmbedding,
      recentChanges,
      stemContext: this.stemContext,
    };
    if (IS_DEV) {
      if (this.stemContext) {
        this.assertFrozen(this.stemContext, 'APL stem context');
      }
      Object.freeze(snapshot);
      this.assertAdvisoryPayload(snapshot, 'APL snapshot');
      this.assertFrozen(snapshot, 'APL snapshot');
    }
    return snapshot;
  }

  on(event: APLEventType, handler: APLEventHandler): () => void {
    const set = this.listeners.get(event) || new Set<APLEventHandler>();
    set.add(handler);
    this.listeners.set(event, set);
    return () => {
      set.delete(handler);
    };
  }

  private emit(event: APLEventType, payload: unknown) {
    if (IS_DEV) {
      this.assertAdvisoryPayload(payload, `APL ${event} payload`);
      this.assertFrozen(payload, `APL ${event} payload`);
    }
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach(handler => handler(payload));
  }

  private ensureBuffers() {
    if (!this.analyser) return;
    if (!this.freqData || this.freqData.length !== this.analyser.frequencyBinCount) {
      this.freqData = new Float32Array(this.analyser.frequencyBinCount);
    }
    if (!this.timeData || this.timeData.length !== this.analyser.fftSize) {
      this.timeData = new Float32Array(this.analyser.fftSize);
    }
  }

  private startLoop() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => this.captureFrame(), this.config.frameMs);
  }

  private stopLoop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private captureFrame() {
    if (this.state !== 'listening' || !this.analyser || !this.freqData || !this.timeData) return;
    this.analyser.getFloatFrequencyData(this.freqData);
    this.analyser.getFloatTimeDomainData(this.timeData);

    const frame = this.computeFrame(performance.now());
    this.latestFrame = frame;
    this.frames.push(frame);
    this.trimFrames(frame.timestampMs);
    const embedding = this.computeEmbedding();
    if (embedding) {
      const previousEmbedding = this.latestEmbedding;
      this.detectChanges(embedding, previousEmbedding);
      this.latestEmbedding = embedding;
      this.emit('embedding', embedding);
    }
    this.emit('frame', frame);

    if (this.config.devLogging && performance.now() - this.lastLogMs >= this.config.logEveryMs) {
      this.lastLogMs = performance.now();
      console.log('[APL] Frame', {
        ...frame,
        sourceId: this.sourceId,
        sourceType: this.sourceType,
      });
      if (this.latestEmbedding) {
        console.log('[APL] Embedding', this.latestEmbedding);
      }
    }
  }

  private computeFrame(nowMs: number): PerceptualFrame {
    const freqData = this.freqData as Float32Array;
    const timeData = this.timeData as Float32Array;
    const binHz = (this.sampleRate / 2) / freqData.length;

    let totalEnergy = 0;
    let highEnergy = 0;
    for (let i = 0; i < freqData.length; i += 1) {
      const magnitude = Math.pow(10, freqData[i] / 20);
      totalEnergy += magnitude;
      if (i * binHz >= HIGH_BAND_START_HZ) {
        highEnergy += magnitude;
      }
    }

    let sumSquares = 0;
    let peak = 0;
    let transientSum = 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const sample = timeData[i];
      const absSample = Math.abs(sample);
      if (absSample > peak) peak = absSample;
      sumSquares += sample * sample;
      if (i > 0) {
        transientSum += Math.abs(sample - timeData[i - 1]);
      }
    }

    const rms = Math.sqrt(sumSquares / timeData.length);
    const crest = peak / (rms + 1e-6);

    const brightness = totalEnergy > 0 ? clamp01(highEnergy / totalEnergy) : 0;
    const density = clamp01(rms * 3);
    const dynamics = clamp01((crest - 1) / 4);
    const transientEnergy = clamp01((transientSum / timeData.length) * 4);

    return this.freezeIfDev({
      timestampMs: Math.max(0, Math.round(nowMs - this.startTimeMs)),
      brightness,
      density,
      dynamics,
      transientEnergy,
      stemContext: this.stemContext,
    });
  }

  private trimFrames(currentTimestampMs: number) {
    const windowMs = this.config.embeddingWindowMs;
    while (this.frames.length > 0 && currentTimestampMs - this.frames[0].timestampMs > windowMs) {
      this.frames.shift();
    }
    while (this.frames.length > this.config.maxFrames) {
      this.frames.shift();
    }
  }

  private computeEmbedding(): PerceptualEmbedding | null {
    if (this.frames.length === 0) return null;
    const windowStartMs = this.frames[0].timestampMs;
    const windowEndMs = this.frames[this.frames.length - 1].timestampMs;
    const spanMs = Math.max(1, windowEndMs - windowStartMs);

    let brightnessSum = 0;
    let densitySum = 0;
    let dynamicsSum = 0;
    let transientSum = 0;
    for (const frame of this.frames) {
      brightnessSum += frame.brightness;
      densitySum += frame.density;
      dynamicsSum += frame.dynamics;
      transientSum += frame.transientEnergy;
    }
    const count = this.frames.length;
    const brightnessMean = brightnessSum / count;
    const densityMean = densitySum / count;
    const dynamicsMean = dynamicsSum / count;
    const transientMean = transientSum / count;

    let brightnessVarianceSum = 0;
    for (const frame of this.frames) {
      const diff = frame.brightness - brightnessMean;
      brightnessVarianceSum += diff * diff;
    }
    const brightnessVariance = brightnessVarianceSum / count;

    const first = this.frames[0];
    const last = this.frames[this.frames.length - 1];
    const brightnessTrend = (last.brightness - first.brightness) / spanMs;
    const densityTrend = (last.density - first.density) / spanMs;
    const dynamicsTrend = (last.dynamics - first.dynamics) / spanMs;
    const transientTrend = (last.transientEnergy - first.transientEnergy) / spanMs;

    return this.freezeIfDev({
      windowStartMs,
      windowEndMs,
      brightnessMean: clamp01(brightnessMean),
      brightnessVariance: clamp01(brightnessVariance),
      densityMean: clamp01(densityMean),
      dynamicsMean: clamp01(dynamicsMean),
      transientMean: clamp01(transientMean),
      brightnessTrend,
      densityTrend,
      dynamicsTrend,
      transientTrend,
      stemContext: this.stemContext,
    });
  }

  private detectChanges(current: PerceptualEmbedding, previous: PerceptualEmbedding | undefined) {
    if (!previous) {
      return;
    }
    const prev = previous;
    const changes: APLChangeEvent[] = [];

    const pushChange = (type: APLChangeType, delta: number, threshold: number) => {
      const magnitude = clamp01(Math.abs(delta) / 0.25);
      const confidence = clamp01(Math.abs(delta) / (threshold * 2));
      changes.push(this.freezeIfDev({
        windowStartMs: current.windowStartMs,
        windowEndMs: current.windowEndMs,
        type,
        magnitude,
        confidence,
        stemContext: this.stemContext,
      }));
    };

    const brightnessDelta = current.brightnessMean - prev.brightnessMean;
    if (brightnessDelta >= CHANGE_THRESHOLDS.brightness) {
      pushChange('BRIGHTNESS_INCREASE', brightnessDelta, CHANGE_THRESHOLDS.brightness);
    } else if (brightnessDelta <= -CHANGE_THRESHOLDS.brightness) {
      pushChange('BRIGHTNESS_DROP', brightnessDelta, CHANGE_THRESHOLDS.brightness);
    }

    const densityDelta = current.densityMean - prev.densityMean;
    if (densityDelta >= CHANGE_THRESHOLDS.density) {
      pushChange('DENSITY_INCREASE', densityDelta, CHANGE_THRESHOLDS.density);
    } else if (densityDelta <= -CHANGE_THRESHOLDS.density) {
      pushChange('DENSITY_DROP', densityDelta, CHANGE_THRESHOLDS.density);
    }

    const dynamicsDelta = current.dynamicsMean - prev.dynamicsMean;
    if (dynamicsDelta >= CHANGE_THRESHOLDS.dynamics) {
      pushChange('DYNAMICS_RISE', dynamicsDelta, CHANGE_THRESHOLDS.dynamics);
    } else if (dynamicsDelta <= -CHANGE_THRESHOLDS.dynamics) {
      pushChange('DYNAMICS_DROP', dynamicsDelta, CHANGE_THRESHOLDS.dynamics);
    }

    const transientDelta = current.transientMean - prev.transientMean;
    if (transientDelta >= CHANGE_THRESHOLDS.transient) {
      pushChange('TRANSIENT_SPIKE', transientDelta, CHANGE_THRESHOLDS.transient);
    } else if (transientDelta <= -CHANGE_THRESHOLDS.transient) {
      pushChange('TRANSIENT_SOFTENING', transientDelta, CHANGE_THRESHOLDS.transient);
    }

    if (changes.length === 0) {
      return;
    }

    this.recentChanges.push(...changes);
    while (this.recentChanges.length > MAX_CHANGE_EVENTS) {
      this.recentChanges.shift();
    }

    changes.forEach(change => this.emit('change', change));
    if (this.config.devLogging) {
      changes.forEach(change => {
        console.log('[APL] Change', change);
      });
    }
  }

  private freezeIfDev<T>(value: T): T {
    if (!IS_DEV || !value || typeof value !== 'object') {
      return value;
    }
    Object.freeze(value);
    return value;
  }

  private assertFrozen(value: unknown, label: string) {
    if (!IS_DEV || !value || typeof value !== 'object') return;
    devInvariant(Object.isFrozen(value), `${label} must be immutable once emitted`);
  }

  private assertAdvisoryPayload(value: unknown, label: string) {
    if (!IS_DEV || !value || typeof value !== 'object') return;
    devInvariant(!isPromiseLike(value), `${label} must not be a promise`);
    devInvariant(!isClassInstance(value), `${label} must not be a class instance`);
    const entries = Object.entries(value as Record<string, unknown>);
    const hasFunction = entries.some(([, entryValue]) => typeof entryValue === 'function');
    devInvariant(!hasFunction, `${label} must not include executable fields`);
    const hasPromise = entries.some(([, entryValue]) => isPromiseLike(entryValue));
    devInvariant(!hasPromise, `${label} must not include promises`);
    const hasClassInstance = entries.some(([, entryValue]) => isClassInstance(entryValue));
    devInvariant(!hasClassInstance, `${label} must not include class instances`);
    const forbiddenKeys = new Set(['action', 'command', 'execute', 'apply', 'control', 'trigger']);
    const hasForbiddenKey = entries.some(([key]) => forbiddenKeys.has(key));
    devInvariant(!hasForbiddenKey, `${label} must not include control or trigger fields`);
    const stemContext = (value as Record<string, unknown>).stemContext;
    if (stemContext && typeof stemContext === 'object') {
      devInvariant(Object.isFrozen(stemContext), `${label} stemContext must be immutable`);
    }
  }
}

export const audioPerceptionLayer = new AudioPerceptionLayer();
