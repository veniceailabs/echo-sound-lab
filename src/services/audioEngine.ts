import { AudioMetrics, ProcessingConfig, ProcessingMode, Stem, EQSettings, LiveProcessingConfig, MixSignature, MixIntent, VeniceColorPreset, TransientShaperConfig, DeEsserConfig, SaturationConfig, ReverbConfig, StereoImagerConfig, DynamicEQConfig, DynamicEQBand, CompressionPreset, LimiterConfig, PitchCorrectionConfig, SSCScan, SSCScanEntry, SSCConfidenceLevel } from '../types';
import { advancedDspService } from './advancedDsp';
import { mixAnalysisService } from './mixAnalysis';
import { wamPluginService, WAMPluginInfo } from './wamPluginService';
import { localPluginService } from './localPluginService';
import { CustomProcessingChain } from './customDsp';
import { perceptualDiffHarness } from './perceptualDiffHarness';
import { pitchCorrectionService } from './pitchCorrectionService';
import { applyGateExpander, applySoftClipper, applyTruePeakLimiter } from './postProcessing';

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
const dbToLinear = (db: number) => Math.pow(10, db / 20);
const PROCESSING_ORDER = 'Input Trim -> Pitch -> De-Esser -> Dynamic EQ -> Static EQ -> Compression -> Makeup -> Saturation -> Transient -> Stereo Imager -> Motion Reverb -> Limiter -> Output Trim -> External Plugins -> Wet Gain';
const isCompressionActive = (config?: Partial<CompressionPreset>) => {
  if (!config) return false;
  const ratio = config.ratio ?? 1;
  const makeupGain = config.makeupGain ?? 0;
  return ratio > 1.01 || makeupGain !== 0;
};
const isLimiterActive = (config?: LimiterConfig) => {
  if (!config) return false;
  const ratio = config.ratio ?? 1;
  return ratio > 1.01;
};
const isTransientActive = (config?: TransientShaperConfig) => {
  if (!config) return false;
  return config.attack !== 0 || config.sustain !== 0 || config.mix !== 1;
};
const getStereoWidth = (config?: StereoImagerConfig) => {
  if (!config) return 1;
  const widths = [config.lowWidth, config.midWidth, config.highWidth].filter(val => Number.isFinite(val));
  if (widths.length === 0) return 1;
  const sum = widths.reduce((acc, val) => acc + val, 0);
  return sum / widths.length;
};
const normalizeStereoImagerConfig = (config?: StereoImagerConfig): StereoImagerConfig | undefined => {
  if (!config) return undefined;
  const width = getStereoWidth(config);
  const crossovers = Array.isArray(config.crossovers) && config.crossovers.length === 2
    ? config.crossovers
    : [300, 5000];
  return {
    lowWidth: width,
    midWidth: width,
    highWidth: width,
    crossovers,
  };
};
const sanitizeProcessingConfig = (config: ProcessingConfig): ProcessingConfig => {
  const sanitized: ProcessingConfig = { ...config };
  if ('multibandCompression' in sanitized) {
    delete sanitized.multibandCompression;
  }
  if (sanitized.stereoImager) {
    sanitized.stereoImager = normalizeStereoImagerConfig(sanitized.stereoImager);
  }
  return sanitized;
};
const isStereoImagerActive = (config?: StereoImagerConfig) => {
  if (!config) return false;
  return getStereoWidth(config) !== 1;
};
const isSaturationActive = (config?: SaturationConfig) => (config?.amount ?? 0) > 0;
const isPitchCorrectionActive = (config?: PitchCorrectionConfig) => !!config?.enabled;
const isDeEsserActive = (config?: DeEsserConfig) => (config?.amount ?? 0) > 0;
const isMotionReverbActive = (config?: ReverbConfig) => (config?.mix ?? 0) > 0;
const isDynamicEqActive = (config?: DynamicEQConfig) => config?.some(b => b.enabled) ?? false;

// Map custom EQ type names to Web Audio API BiquadFilterType enum
const mapFilterType = (type: string): BiquadFilterType => {
  const typeMap: Record<string, BiquadFilterType> = {
    'Bell': 'peaking',
    'bell': 'peaking',
    'peak': 'peaking',
    'peaking': 'peaking',
    'High-Shelf': 'highshelf',
    'high-shelf': 'highshelf',
    'highshelf': 'highshelf',
    'Low-Shelf': 'lowshelf',
    'low-shelf': 'lowshelf',
    'lowshelf': 'lowshelf',
    'highpass': 'highpass',
    'lowpass': 'lowpass',
    'bandpass': 'bandpass',
    'notch': 'notch',
    'allpass': 'allpass'
  };
  return typeMap[type] || 'peaking';
};

interface LiveNodes {
  inputTrim?: GainNode;
  staticEQ?: BiquadFilterNode[];
  mainComp?: DynamicsCompressorNode;
  compMakeupGain?: GainNode;
  saturation?: ReturnType<typeof advancedDspService.createSaturation> | null;
  transientShaper?: ReturnType<typeof advancedDspService.createTransientShaper> | null;
  stereoImager?: ReturnType<typeof advancedDspService.createStereoImager> | null;
  outputLimiter?: DynamicsCompressorNode;
  outputTrim?: GainNode;
  deEsser?: ReturnType<typeof advancedDspService.createDeEsser> | null;
  dynamicEq?: ReturnType<typeof advancedDspService.createDynamicEQ> | null;
  motionReverb?: ReturnType<typeof advancedDspService.createMotionReverb> | null;
  pitchCorrection?: AudioWorkletNode | null;
}

interface ActiveProcessingFlags {
  inputTrim: boolean;
  outputTrim: boolean;
  eq: boolean;
  compression: boolean;
  limiter: boolean;
  saturation: boolean;
  transient: boolean;
  stereoImager: boolean;
  deEsser: boolean;
  dynamicEq: boolean;
  motionReverb: boolean;
  pitchCorrection: boolean;
  localPlugins: boolean;
  wamPlugins: boolean;
}

export class AudioEngine {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private buffer: AudioBuffer | null = null; // Currently playing buffer
  private originalBuffer: AudioBuffer | null = null; // Pristine original for processing & A/B
  private processedBuffer: AudioBuffer | null = null; // Processed version for A/B
  private snapshotBackup: {
    originalBuffer: AudioBuffer | null;
    processedBuffer: AudioBuffer | null;
    buffer: AudioBuffer | null;
    isBypassed: boolean;
  } | null = null;
  private isSnapshotABMode: boolean = false;
  private source: AudioBufferSourceNode | null = null;

  private liveNodes: LiveNodes | null = null;
  private liveProcessingChain: AudioNode[] = [];
  private currentConfig: LiveProcessingConfig = {};
  private isChainInitialized: boolean = false;
  private activeChainSignature: string | null = null;
  private liveChainInput: AudioNode | null = null;
  private engineMode: 'FRIENDLY' | 'ADVANCED' = 'FRIENDLY'; // Stage Architecture mode

  private startedAt: number = 0;
  private pausedAt: number = 0;
  private isPlaying: boolean = false;

  // A/B bypass state
  private isBypassed: boolean = false;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private masterInput: GainNode;
  private outputGain: GainNode;
  private analyserSource: AudioNode | null = null;
  private rawElement: HTMLAudioElement | null = null;
  private rawObjectUrl: string | null = null;
  private rawElementSource: MediaElementAudioSourceNode | null = null;
  private rawElementGain: GainNode | null = null;

  // Stem preview state
  private isStemPreviewMode: boolean = false;
  private stemPreviewBuffer: AudioBuffer | null = null;
  private savedBuffer: AudioBuffer | null = null;

  // WAM plugin chain
  private wamPluginChain: string[] = []; // IDs of loaded WAM plugins in order
  private wamInitialized: boolean = false;
  private wamInsertPoint: GainNode | null = null; // Insert point for WAM plugins in chain

  constructor() {
    this.initializeAudioContext();
  }

  private initializeAudioContext(sampleRate?: number) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const options: AudioContextOptions = { latencyHint: 'interactive' };
    if (sampleRate && Number.isFinite(sampleRate)) {
      options.sampleRate = sampleRate;
    }
    try {
      this.audioContext = new AudioContextClass(options);
    } catch (err) {
      if (options.sampleRate) {
        console.warn(`[audioEngine] Failed to init AudioContext at ${options.sampleRate}Hz, falling back to default`, err);
        this.audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      } else {
        throw err;
      }
    }
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    void localPluginService.init(this.audioContext);
    void pitchCorrectionService.ensureWorklet(this.audioContext);

    // Create persistent A/B routing nodes
    this.masterInput = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();
    this.wetGain = this.audioContext.createGain();
    this.outputGain = this.audioContext.createGain();

    // Default: dry signal active (original) until processing is applied
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    // Persistent routing: masterInput always feeds dry path
    this.masterInput.connect(this.dryGain);

    // Both paths merge to output -> destination
    this.dryGain.connect(this.outputGain);
    this.wetGain.connect(this.outputGain);
    this.outputGain.connect(this.audioContext.destination);
  }

  private prepareNativePlayback(file: File) {
    if (this.rawObjectUrl) {
      URL.revokeObjectURL(this.rawObjectUrl);
      this.rawObjectUrl = null;
    }

    this.rawObjectUrl = URL.createObjectURL(file);
    this.rawElement = new Audio(this.rawObjectUrl);
    this.rawElement.preload = 'auto';
    this.rawElement.onended = () => {
      if (this.isPlaying) {
        this.resetPlaybackState();
      }
    };

    if (this.rawElementSource) {
      try { this.rawElementSource.disconnect(); } catch {}
      this.rawElementSource = null;
    }
    if (this.rawElementGain) {
      try { this.rawElementGain.disconnect(); } catch {}
      this.rawElementGain = null;
    }

    this.rawElementSource = this.audioContext.createMediaElementSource(this.rawElement);
    this.rawElementGain = this.audioContext.createGain();
    this.rawElementSource.connect(this.rawElementGain);
    this.rawElementGain.connect(this.audioContext.destination);
    this.connectAnalyserTap(this.rawElementSource);
  }

  private rebuildNativePlayback() {
    if (!this.rawObjectUrl) return;
    if (this.rawElement) {
      try { this.rawElement.pause(); } catch {}
    }
    this.rawElement = new Audio(this.rawObjectUrl);
    this.rawElement.preload = 'auto';
    this.rawElement.onended = () => {
      if (this.isPlaying) {
        this.resetPlaybackState();
      }
    };
    this.rawElementSource = this.audioContext.createMediaElementSource(this.rawElement);
    this.rawElementGain = this.audioContext.createGain();
    this.rawElementSource.connect(this.rawElementGain);
    this.rawElementGain.connect(this.audioContext.destination);
    this.connectAnalyserTap(this.rawElementSource);
  }

  private clearNativePlayback() {
    if (this.rawElement) {
      try { this.rawElement.pause(); } catch (e) {}
    }
    this.rawElement = null;
    if (this.rawObjectUrl) {
      URL.revokeObjectURL(this.rawObjectUrl);
      this.rawObjectUrl = null;
    }
    if (this.rawElementSource) {
      try { this.rawElementSource.disconnect(); } catch {}
      this.rawElementSource = null;
    }
    if (this.rawElementGain) {
      try { this.rawElementGain.disconnect(); } catch {}
      this.rawElementGain = null;
    }
  }

  private stopNativePlayback() {
    if (!this.rawElement) return;
    try { this.rawElement.pause(); } catch (e) {}
    this.rawElement.currentTime = 0;
    this.pausedAt = 0;
    this.isPlaying = false;
  }

  private shouldUseNativePlayback(): boolean {
    return !!this.rawElement && !this.processedBuffer && !this.hasActiveLiveProcessing();
  }

  private connectAnalyserTap(source: AudioNode) {
    if (this.analyserSource) {
      try { this.analyserSource.disconnect(this.analyser); } catch (e) {}
    }
    this.analyserSource = source;
    source.connect(this.analyser);
  }

  private setMonitorMix(dry: number, wet: number) {
    this.dryGain.gain.value = dry;
    this.wetGain.gain.value = wet;
  }

  private hasActiveLiveProcessing(): boolean {
    const flags = this.getActiveProcessingFlags(this.currentConfig);
    return Object.values(flags).some(Boolean);
  }

  private getLocalPluginChainSignature(): string {
    const instances = localPluginService.getActiveInstances();
    return instances.map(instance => instance.id).join(',');
  }

  private connectMasterInputToChain() {
    if (!this.liveChainInput) return;
    try { this.masterInput.disconnect(this.wetGain); } catch (e) {}
    try { this.masterInput.disconnect(this.liveChainInput); } catch (e) {}
    this.masterInput.connect(this.liveChainInput);
  }

  private async reinitializeAudioContext(sampleRate: number) {
    const currentRate = this.audioContext.sampleRate;
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate === currentRate) {
      return;
    }

    console.log(`[audioEngine] Reinitializing AudioContext for ${sampleRate}Hz (was ${currentRate}Hz)`);
    this.stopSource();
    localPluginService.destroyAll();

    try {
      await this.audioContext.close();
    } catch (e) {
      console.warn('[audioEngine] Failed to close AudioContext cleanly', e);
    }

    this.initializeAudioContext(sampleRate);

    // Reset live processing graph and plugin state (context change invalidates nodes)
    this._disconnectProcessingNodes();
    this.currentConfig = {};
    this.activeChainSignature = null;
    this.liveChainInput = null;
    this.wamInitialized = false;
    this.wamPluginChain = [];
    this.wamInsertPoint = null;
    this.analyserSource = null;
    this.rawElementSource = null;
    this.rawElementGain = null;
    void localPluginService.init(this.audioContext);
    void pitchCorrectionService.ensureWorklet(this.audioContext);

    if (this.rawElement) {
      this.rebuildNativePlayback();
    }
  }

  private getWavSampleRate(arrayBuffer: ArrayBuffer): number | null {
    if (arrayBuffer.byteLength < 44) return null;

    const view = new DataView(arrayBuffer);
    const riff = view.getUint32(0, false);
    const wave = view.getUint32(8, false);

    // "RIFF" and "WAVE"
    if (riff !== 0x52494646 || wave !== 0x57415645) {
      return null;
    }

    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const chunkId = view.getUint32(offset, false);
      const chunkSize = view.getUint32(offset + 4, true);

      // "fmt "
      if (chunkId === 0x666d7420) {
        if (offset + 16 <= view.byteLength) {
          const sampleRate = view.getUint32(offset + 12, true);
          return sampleRate > 0 ? sampleRate : null;
        }
        return null;
      }

      offset += 8 + chunkSize;
      if (chunkSize % 2 === 1) {
        offset += 1; // padding byte
      }
    }

    return null;
  }

  async loadFile(file: File): Promise<AudioBuffer> {
    console.log('[audioEngine] Starting loadFile...');
    console.log('[audioEngine] Reading file to arrayBuffer...');
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[audioEngine] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);

    this.prepareNativePlayback(file);

    const wavSampleRate = this.getWavSampleRate(arrayBuffer);
    if (wavSampleRate) {
      console.log(`[audioEngine] WAV sample rate detected: ${wavSampleRate}Hz`);
      await this.reinitializeAudioContext(wavSampleRate);
    }

    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    console.log('[audioEngine] Starting decodeAudioData...');
    const decodeStart = Date.now();
    this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
    console.log(`[audioEngine] Decode completed in ${Date.now() - decodeStart}ms`);

    // Store original for non-destructive processing
    this.originalBuffer = this.buffer;
    this.processedBuffer = null;
    this.isBypassed = true;
    this.currentConfig = {};
    this.disconnectLiveProcessingChain();

    this.resetPlaybackState();
    return this.buffer;
  }
  
  async loadFromBase64(base64: string): Promise<AudioBuffer> {
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    const binaryString = window.atob(base64.split(',')[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  async decodeFile(file: File): Promise<AudioBuffer> {
    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }
    const arrayBuffer = await file.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  setBuffer(buffer: AudioBuffer | null) {
    this.buffer = buffer;
    if (!buffer) {
      this.clearNativePlayback();
    }
  }

  setProcessedBuffer(buffer: AudioBuffer | null) {
    this.processedBuffer = buffer;
    if (buffer) {
      this.stopNativePlayback();
      this.buffer = buffer;
    }
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  getOriginalBuffer(): AudioBuffer | null {
    return this.originalBuffer;
  }

  getProcessedBuffer(): AudioBuffer | null {
    return this.processedBuffer;
  }
  
  applyVenicePreset(preset: VeniceColorPreset): ProcessingConfig {
      const config: ProcessingConfig = {};
      
      switch(preset) {
          case 'DawnGlow':
              config.colorFilter = 'Dawn Glow';
              config.saturation = { type: 'tube', amount: 0.2, mix: 0.6 };
              config.eq = [
                  { frequency: 60, gain: 1, type: 'lowshelf' },
                  { frequency: 8000, gain: 3, type: 'highshelf' }
              ];
              config.motionReverb = { mix: 0.1, decay: 2.5, preDelay: 0.02, motion: { bpm: 120, depth: 0.2 } };
              break;
          case 'VeniceBlue':
              config.colorFilter = 'Venice Blue';
              config.saturation = { type: 'digital', amount: 0.1, mix: 0.4 };
              config.stereoImager = { lowWidth: 1.17, midWidth: 1.17, highWidth: 1.17, crossovers: [300, 5000] };
              config.eq = [
                  { frequency: 400, gain: -3, type: 'peaking' },
                  { frequency: 10000, gain: 2, type: 'highshelf' }
              ];
              break;
          case 'JellyfishWarmth':
              config.colorFilter = 'Jellyfish Warmth';
              config.saturation = { type: 'tape', amount: 0.15, mix: 0.5 };  // More subtle saturation
              config.eq = [
                  { frequency: 80, gain: 1.5, type: 'lowshelf' },
                  { frequency: 250, gain: 2.5, type: 'peaking', q: 0.7 },
                  { frequency: 4000, gain: -1, type: 'peaking', q: 1.0 },
                  { frequency: 15000, gain: 0, type: 'highshelf' } 
              ];
              config.motionReverb = { mix: 0.05, decay: 1.8, preDelay: 0.01, duckingAmount: 0.3 };
              break;
      }
      return config;
  }

  async play(offset?: number) {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Exit stem preview mode if active
    if (this.isStemPreviewMode) {
      this.exitStemPreviewMode();
    }

    if (!this.buffer) return;

    this.stopSource();

    if (this.shouldUseNativePlayback()) {
      const startOffset = offset !== undefined ? offset : this.pausedAt;
      if (this.rawElement) {
        this.rawElement.currentTime = Math.max(0, Math.min(startOffset, this.rawElement.duration || startOffset));
        try {
          await this.rawElement.play();
        } catch (e) {
          console.warn('[audioEngine] Native playback failed', e);
        }
        this.isPlaying = true;
      }
      return;
    }

    // Create buffer source
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.channelCountMode = 'explicit';
    this.source.channelInterpretation = 'speakers';

    const hasLiveProcessing = this.hasActiveLiveProcessing();
    const useLiveChain = hasLiveProcessing && !this.processedBuffer;

    if (useLiveChain) {
      this.applyProcessingConfig(this.currentConfig);
      this.source.connect(this.masterInput);
      this.connectAnalyserTap(this.source);
      this.setMonitorMix(0, 1);
      this.connectMasterInputToChain();
    } else {
      // Raw audio playback
      // Audio graph: source -> destination (no gain nodes)
      // Analyzer is a parallel tap, not inline
      this.source.connect(this.audioContext.destination);
      this.connectAnalyserTap(this.source);
      this.setMonitorMix(1, 0);
    }

    const startOffset = offset !== undefined ? offset : this.pausedAt;

    if (startOffset >= this.buffer.duration) {
      this.pausedAt = 0;
      this.source.start(0, 0);
      this.startedAt = this.audioContext.currentTime;
    } else {
    this.source.start(0, startOffset);
    this.startedAt = this.audioContext.currentTime - startOffset;
    }

    this.isPlaying = true;

    this.source.onended = () => {
      if (this.isPlaying && this.buffer && this.getCurrentTime() >= this.buffer.duration - 0.1) {
        this.resetPlaybackState();
      }
    };
  }

  pause() {
    if (this.shouldUseNativePlayback() && this.rawElement) {
      this.pausedAt = this.rawElement.currentTime;
      this.rawElement.pause();
      this.isPlaying = false;
      return;
    }
    if (this.source && this.isPlaying) {
      this.pausedAt = this.audioContext.currentTime - this.startedAt;
      this.stopSource();
    }
    this.isPlaying = false;
  }

  stop() {
    if (this.shouldUseNativePlayback()) {
      this.stopNativePlayback();
      this.resetPlaybackState();
      return;
    }
    this.stopSource();
    this.resetPlaybackState();
  }

  seek(time: number) {
      if (this.shouldUseNativePlayback() && this.rawElement) {
          const safeTime = clamp(time, 0, this.rawElement.duration || time);
          this.rawElement.currentTime = safeTime;
          this.pausedAt = safeTime;
          return;
      }
      if (!this.buffer) return;
      const safeTime = clamp(time, 0, this.buffer.duration);
      if (this.isPlaying) {
          this.play(safeTime);
      } else {
          this.pausedAt = safeTime;
      }
  }
    
  setTime(time: number) {
      this.seek(time);
  }

  // Skip forward by seconds
  skipForward(seconds: number) {
      const currentTime = this.getCurrentTime();
      const duration = this.getDuration();
      const newTime = Math.min(currentTime + seconds, duration);
      this.seek(newTime);
  }

  // Skip backward by seconds
  skipBackward(seconds: number) {
      const currentTime = this.getCurrentTime();
      const newTime = Math.max(currentTime - seconds, 0);
      this.seek(newTime);
  }

  private getActiveProcessingFlags(config: LiveProcessingConfig): ActiveProcessingFlags {
    const hasLocalPlugins = localPluginService.getActiveInstances().length > 0;
    const hasWamPlugins = this.wamPluginChain.length > 0;
    const hasInputTrim = config.inputTrimDb !== undefined && config.inputTrimDb !== 0;
    const hasOutputTrim = config.outputTrimDb !== undefined && config.outputTrimDb !== 0;
    const hasEq = config.eq?.some(band => band.gain !== 0) ?? false;
    const hasCompression = isCompressionActive(config.compression);
    const hasLimiter = isLimiterActive(config.limiter);
    const hasDeEsser = isDeEsserActive(config.deEsser);
    const hasDynamicEq = isDynamicEqActive(config.dynamicEq);
    const hasStereoImager = isStereoImagerActive(config.stereoImager);
    const hasSaturation = this.engineMode === 'ADVANCED' && isSaturationActive(config.saturation);
    const hasTransient = this.engineMode === 'ADVANCED' && isTransientActive(config.transientShaper);
    const hasMotionReverb = this.engineMode === 'ADVANCED' && isMotionReverbActive(config.motionReverb);
    const hasPitchCorrection = isPitchCorrectionActive(config.pitch);

    return {
      inputTrim: hasInputTrim,
      outputTrim: hasOutputTrim,
      eq: hasEq,
      compression: hasCompression,
      limiter: hasLimiter,
      saturation: hasSaturation,
      transient: hasTransient,
      stereoImager: hasStereoImager,
      deEsser: hasDeEsser,
      dynamicEq: hasDynamicEq,
      motionReverb: hasMotionReverb,
      pitchCorrection: hasPitchCorrection,
      localPlugins: hasLocalPlugins,
      wamPlugins: hasWamPlugins,
    };
  }

  private buildChainSignature(config: LiveProcessingConfig, active: ActiveProcessingFlags): string {
    const parts: string[] = [];
    if (active.inputTrim) parts.push('inputTrim');
    if (active.deEsser) parts.push('deEsser');
    if (active.dynamicEq) parts.push(`dynamicEq:${config.dynamicEq?.length ?? 0}`);
    if (active.pitchCorrection) parts.push(`pitch:${config.pitch?.mode ?? 'chromatic'}`);
    if (active.eq) parts.push(`eq:${config.eq?.length ?? 0}`);
    if (active.compression) parts.push('compression');
    if (active.saturation) parts.push('saturation');
    if (active.transient) parts.push('transient');
    if (active.stereoImager) parts.push('stereoImager');
    if (active.motionReverb) parts.push('motionReverb');
    if (active.limiter) parts.push('limiter');
    if (active.outputTrim) parts.push('outputTrim');
    if (active.localPlugins) parts.push(`localPlugins:${this.getLocalPluginChainSignature()}`);
    if (active.wamPlugins) parts.push(`wamPlugins:${this.wamPluginChain.join(',')}`);
    return parts.join('|');
  }

  applyProcessingConfig(config: LiveProcessingConfig) {
    const sanitized = sanitizeProcessingConfig(config as ProcessingConfig) as LiveProcessingConfig;
    // Store current config
    this.currentConfig = sanitized;

    // Log config for debugging
    console.log('[audioEngine] applyProcessingConfig called with:', JSON.stringify(sanitized, null, 2));

    // Check if there's actual live processing to apply
    const activeFlags = this.getActiveProcessingFlags(sanitized);
    const hasLiveProcessing = Object.values(activeFlags).some(Boolean);

    if (!hasLiveProcessing) {
      console.log('[audioEngine] No live processing configured - disconnecting chain');
      this.disconnectLiveProcessingChain();
      this.activeChainSignature = null;
      this.liveChainInput = null;
      return;
    }

    const chainSignature = this.buildChainSignature(sanitized, activeFlags);

    // If chain not initialized, build it once
    if (!this.isChainInitialized || chainSignature !== this.activeChainSignature) {
      this._buildProcessingChain(sanitized, activeFlags, chainSignature);
    } else {
      // Just update parameters, don't rebuild the graph
      this.setFullConfig(sanitized);
    }
  }

  private _buildProcessingChain(config: LiveProcessingConfig, activeFlags?: ActiveProcessingFlags, chainSignature?: string) {
    try {
      // Only disconnect processing chain nodes, not the source
      this._disconnectProcessingNodes();

      const ctx = this.audioContext;
      const active = activeFlags ?? this.getActiveProcessingFlags(config);
      const stereoConfig = normalizeStereoImagerConfig(config.stereoImager);

      // Authoritative processing order (live + offline):
      // Input Trim -> Pitch -> De-Esser -> Dynamic EQ -> Static EQ -> Compression -> Makeup ->
      // Saturation -> Transient -> Stereo Imager -> Motion Reverb -> Limiter -> Output Trim -> External Plugins -> Wet Gain

      // Create only active DSP nodes
      this.liveNodes = {
        inputTrim: active.inputTrim ? ctx.createGain() : undefined,
        staticEQ: active.eq ? Array.from({ length: config.eq?.length ?? 0 }, () => ctx.createBiquadFilter()) : undefined,
        mainComp: active.compression ? ctx.createDynamicsCompressor() : undefined,
        compMakeupGain: active.compression ? ctx.createGain() : undefined,
        outputLimiter: active.limiter ? ctx.createDynamicsCompressor() : undefined,
        outputTrim: active.outputTrim ? ctx.createGain() : undefined,
        saturation: active.saturation ? advancedDspService.createSaturation(ctx, config.saturation as SaturationConfig) : undefined,
        transientShaper: active.transient ? advancedDspService.createTransientShaper(ctx, config.transientShaper as TransientShaperConfig) : undefined,
        stereoImager: active.stereoImager ? advancedDspService.createStereoImager(ctx, stereoConfig as StereoImagerConfig) : undefined,
        deEsser: active.deEsser ? advancedDspService.createDeEsser(ctx, config.deEsser as DeEsserConfig) : undefined,
        dynamicEq: active.dynamicEq ? advancedDspService.createDynamicEQ(ctx, config.dynamicEq as DynamicEQConfig) : undefined,
        motionReverb: active.motionReverb ? advancedDspService.createMotionReverb(ctx, config.motionReverb as ReverbConfig) : undefined,
        pitchCorrection: active.pitchCorrection
          ? (pitchCorrectionService.canUseRealtime(ctx as AudioContext)
            ? pitchCorrectionService.createNodeSync(ctx, config.pitch as PitchCorrectionConfig)
            : null)
          : undefined,
      };
      if (active.pitchCorrection && !this.liveNodes.pitchCorrection) {
        console.warn('[audioEngine] Pitch correction disabled for real-time preview (latency or module not ready)');
      }

      // Build the chain: inputTrim -> ... -> outputTrim -> wetGain
      const chainNodes: AudioNode[] = [];
      let currentNode: AudioNode | null = null;
      let chainInput: AudioNode | null = null;
      const previousChainInput = this.liveChainInput;
      this.liveChainInput = null;

      const connectNext = (node: AudioNode | { input: AudioNode; output: AudioNode } | null) => {
        if (!node) return;
        let inputNode: AudioNode;
        let outputNode: AudioNode;

        if ('input' in node && 'output' in node) {
          inputNode = node.input;
          outputNode = node.output;
        } else {
          inputNode = node as AudioNode;
          outputNode = node as AudioNode;
        }

        if (!chainInput) {
          chainInput = inputNode;
        }
        if (currentNode) {
          currentNode.connect(inputNode);
        }
        chainNodes.push(inputNode);
        if (inputNode !== outputNode) {
          chainNodes.push(outputNode);
        }
        currentNode = outputNode;
      };

      if (active.inputTrim) {
        connectNext(this.liveNodes.inputTrim ?? null);
      }
      if (active.pitchCorrection && this.liveNodes.pitchCorrection) {
        connectNext(this.liveNodes.pitchCorrection);
      }
      if (active.deEsser) {
        connectNext(this.liveNodes.deEsser ?? null);
      }
      if (active.dynamicEq) {
        connectNext(this.liveNodes.dynamicEq ?? null);
      }
      if (active.eq && this.liveNodes.staticEQ) {
        this.liveNodes.staticEQ.forEach(filter => connectNext(filter));
      }
      if (active.compression) {
        connectNext(this.liveNodes.mainComp ?? null);
        connectNext(this.liveNodes.compMakeupGain ?? null);
      }
      if (active.saturation) {
        connectNext(this.liveNodes.saturation ?? null);
      }
      if (active.transient) {
        connectNext(this.liveNodes.transientShaper ?? null);
      }
      if (active.stereoImager) {
        connectNext(this.liveNodes.stereoImager ?? null);
      }
      if (active.motionReverb) {
        connectNext(this.liveNodes.motionReverb ?? null);
      }
      if (active.limiter) {
        connectNext(this.liveNodes.outputLimiter ?? null);
      }
      if (active.outputTrim) {
        connectNext(this.liveNodes.outputTrim ?? null);
      }

      const needsExternalPlugins = active.localPlugins || active.wamPlugins;
      if (!currentNode || !chainInput) {
        if (!needsExternalPlugins) {
          this.disconnectLiveProcessingChain();
          return;
        }
        const passThrough = ctx.createGain();
        chainInput = passThrough;
        currentNode = passThrough;
        chainNodes.push(passThrough);
      }

      // Insert external plugins between our DSP chain and wetGain
      let pluginInput = currentNode;
      if (active.localPlugins) {
        pluginInput = this.connectLocalPlugins(pluginInput);
      }
      if (this.wamPluginChain.length > 0) {
        this.connectWAMPlugins(pluginInput, this.wetGain);
      } else {
        // No WAM plugins, connect directly to wetGain
        pluginInput.connect(this.wetGain);
      }

      this.liveChainInput = chainInput;

      this.liveProcessingChain = chainNodes;
      this.isChainInitialized = true;
      this.activeChainSignature = chainSignature ?? this.buildChainSignature(config, active);

      // Apply the initial config values
      this.setFullConfig(config);

      // If currently playing, reconnect masterInput to the chain
      if (this.isPlaying && this.source && this.liveChainInput) {
        try { this.masterInput.disconnect(this.wetGain); } catch (e) {}
        if (previousChainInput) {
          try { this.masterInput.disconnect(previousChainInput); } catch (e) {}
        }
        try { this.masterInput.disconnect(this.liveChainInput); } catch (e) {}
        this.masterInput.connect(this.liveChainInput);
      }

      console.log('[audioEngine] Processing chain built successfully');
    } catch (err) {
      console.error('[audioEngine] _buildProcessingChain failed', err);
      this.isChainInitialized = false;
      // Fallback: direct connection
      try { this.masterInput.disconnect(); } catch (e) {}
      this.masterInput.connect(this.wetGain);
      this.masterInput.connect(this.dryGain);
    }
  }

  private _disconnectProcessingNodes() {
    // Disconnect all chain nodes but keep masterInput connections intact
    this.liveProcessingChain.forEach(node => {
      try { node.disconnect(); } catch (e) {}
    });
    this.liveProcessingChain = [];
    this.liveNodes = null;
    this.isChainInitialized = false;
    this.activeChainSignature = null;
    this.liveChainInput = null;
  }
  
  private setFullConfig(config: ProcessingConfig) {
    if (!this.liveNodes) return;
    try {
        this.setInputTrim(config.inputTrimDb);
        this.setStaticEQ(config.eq);
        this.setCompression(config.compression);
        this.setSaturation(config.saturation);
        this.setTransientShaper(config.transientShaper);
        this.setStereoImager(config.stereoImager);
        this.setLimiter(config.limiter); 
        this.setOutputTrim(config.outputTrimDb);
        this.setDeEsser(config.deEsser);
        this.setDynamicEQ(config.dynamicEq);
        this.setMotionReverb(config.motionReverb);
        this.setPitchCorrection(config.pitch);
    } catch (e) {
        console.error('[audioEngine] setFullConfig failed', e);
    }
  }

  private setPitchCorrection(config?: PitchCorrectionConfig) {
    if (!this.liveNodes?.pitchCorrection || !config) return;
    pitchCorrectionService.updateNode(this.liveNodes.pitchCorrection, config);
  }

  disconnectLiveProcessingChain() {
    const previousChainInput = this.liveChainInput;
    this._disconnectProcessingNodes();
    if (previousChainInput) {
      try { this.masterInput.disconnect(previousChainInput); } catch (e) {}
    }
    // Re-establish direct path if no chain
    try { this.masterInput.disconnect(this.wetGain); } catch (e) {}
    this.masterInput.connect(this.wetGain);
  }

  // A/B bypass control - switches between original and processed buffers
  setBypass(bypassed: boolean) {
    // Exit stem preview mode before A/B switching
    if (this.isStemPreviewMode) {
      console.warn('[audioEngine] Cannot A/B compare while in stem preview mode. Exiting stem preview.');
      this.exitStemPreviewMode();
    }

    this.isBypassed = bypassed;
    const currentTime = this.getCurrentTime();
    const wasPlaying = this.isPlaying;

    if (bypassed) {
      // Bypass ON: switch to original buffer
      if (this.originalBuffer) {
        this.buffer = this.originalBuffer;
        console.log('[audioEngine] A/B: Switched to original');
      }
    } else {
      // Bypass OFF: switch to processed buffer
      if (this.processedBuffer) {
        this.buffer = this.processedBuffer;
        console.log('[audioEngine] A/B: Switched to processed');
      }
    }

    // If was playing, restart at same position with new buffer
    if (wasPlaying) {
      this.play(currentTime);
    }
  }

  getBypassState(): boolean {
    return this.isBypassed;
  }

  toggleBypass(): boolean {
    this.setBypass(!this.isBypassed);
    return this.isBypassed;
  }

  // Snapshot A/B: compare two processed versions without losing the main session
  enableSnapshotAB(snapshotA: AudioBuffer, snapshotB: AudioBuffer) {
    this.exitStemPreviewMode();
    this.stopNativePlayback();

    if (!this.snapshotBackup) {
      this.snapshotBackup = {
        originalBuffer: this.originalBuffer,
        processedBuffer: this.processedBuffer,
        buffer: this.buffer,
        isBypassed: this.isBypassed
      };
    }

    this.originalBuffer = snapshotA;
    this.processedBuffer = snapshotB;
    this.buffer = snapshotA;
    this.isBypassed = true;
    this.isSnapshotABMode = true;
  }

  disableSnapshotAB() {
    if (!this.snapshotBackup) return;

    this.originalBuffer = this.snapshotBackup.originalBuffer;
    this.processedBuffer = this.snapshotBackup.processedBuffer;
    this.buffer = this.snapshotBackup.buffer;
    this.isBypassed = this.snapshotBackup.isBypassed;
    this.snapshotBackup = null;
    this.isSnapshotABMode = false;
  }

  isSnapshotABActive(): boolean {
    return this.isSnapshotABMode;
  }

  // Exit stem preview mode and restore main buffer
  exitStemPreviewMode() {
    if (this.isStemPreviewMode && this.savedBuffer) {
      this.buffer = this.savedBuffer;
      this.savedBuffer = null;
      this.stemPreviewBuffer = null;
      this.isStemPreviewMode = false;
      console.log('[audioEngine] Exited stem preview mode, restored main buffer');
    }
  }

  // Enable processed signal - call after applying processing
  enableProcessedSignal() {
    if (this.processedBuffer) {
      this.buffer = this.processedBuffer;
      this.isBypassed = false;
      console.log('[audioEngine] Enabled processed signal');
    }
  }

  // Reset to original signal
  resetToOriginal() {
    if (this.originalBuffer) {
      this.buffer = this.originalBuffer;
      this.isBypassed = true;
      console.log('[audioEngine] Reset to original signal');
    }
  }

  async renderProcessedAudio(config: ProcessingConfig): Promise<AudioBuffer> {
    const sanitized = sanitizeProcessingConfig(config);
    // CRITICAL: Always process from original to prevent cumulative degradation
    const sourceBuffer = this.originalBuffer || this.buffer;
    if (!sourceBuffer) throw new Error("No buffer to render.");

    // CRITICAL: If no actual processing is being applied, return original unmodified
    const hasProcessing = isCompressionActive(sanitized.compression) ||
                         isLimiterActive(sanitized.limiter) ||
                         (sanitized.eq?.some(b => b.gain !== 0) ?? false) ||
                         isSaturationActive(sanitized.saturation) ||
                         isTransientActive(sanitized.transientShaper) ||
                         isStereoImagerActive(sanitized.stereoImager) ||
                         isMotionReverbActive(sanitized.motionReverb) ||
                         isDynamicEqActive(sanitized.dynamicEq) ||
                         isDeEsserActive(sanitized.deEsser) ||
                         isPitchCorrectionActive(sanitized.pitch) ||
                         (sanitized.gateExpander?.enabled ?? false) ||
                         (sanitized.truePeakLimiter?.enabled ?? false) ||
                         (sanitized.clipper?.enabled ?? false) ||
                         (sanitized.inputTrimDb !== undefined && sanitized.inputTrimDb !== 0) ||
                         (sanitized.outputTrimDb !== undefined && sanitized.outputTrimDb !== 0);

    if (!hasProcessing) {
      console.log('[audioEngine] No processing configured - returning original buffer unmodified');
      return sourceBuffer;
    }

    // PERCEPTUAL DIFF HARNESS: Capture BEFORE metrics
    const beforeMetrics = mixAnalysisService.analyzeStaticMetrics(sourceBuffer);
    const sessionId = `render-${Date.now()}`;
    perceptualDiffHarness.startSession(sessionId, beforeMetrics);

    // BETA: Use Web Audio API (custom DSP chain has NaN bug, producing silence on all samples)
    // TODO: Fix custom DSP processors post-BETA
    const outputBuffer = await this.renderWithWebAudio(sourceBuffer, sanitized);

    // PERCEPTUAL DIFF HARNESS: Capture AFTER metrics and analyze
    const afterMetrics = mixAnalysisService.analyzeStaticMetrics(outputBuffer);
    perceptualDiffHarness.endSession(sessionId, afterMetrics);

    return outputBuffer;
  }

  /**
   * Render audio with custom DSP chain (transparent mastering-grade processors)
   */
  private async renderWithCustomDSP(sourceBuffer: AudioBuffer, config: ProcessingConfig): Promise<AudioBuffer> {
    const sampleRate = sourceBuffer.sampleRate;
    const numChannels = sourceBuffer.numberOfChannels;
    const length = sourceBuffer.length;

    // Create output buffer
    const outputBuffer = new AudioBuffer({
      length,
      numberOfChannels: numChannels,
      sampleRate
    });

    // Build custom processing chain
    const chain = new CustomProcessingChain(sampleRate);

    // Configure De-Esser
    if (config.deEsser && config.deEsser.amount > 0) {
      chain.setDeEsser(
        config.deEsser.frequency ?? 6000,
        config.deEsser.threshold ?? -20,
        config.deEsser.amount ?? 0.5
      );
    }

    // Configure Dynamic EQ
    if (config.dynamicEq && config.dynamicEq.some(b => b.enabled)) {
      const enabledBands = config.dynamicEq
        .filter(b => b.enabled)
        .map(b => ({
          frequency: b.frequency,
          q: b.q,
          threshold: b.threshold,
          ratio: b.type === 'compress' ? b.gain : 1.0 / b.gain
        }));

      if (enabledBands.length > 0) {
        chain.setDynamicEQ(enabledBands);
      }
    }

    // Configure EQ (including high-pass filter)
    if (config.eq && config.eq.some(band => band.gain !== 0)) {
      const bands = config.eq
        .filter(band => band.gain !== 0)
        .map(band => ({
          frequency: band.frequency,
          gainDb: band.gain,
          q: band.q || 0.7
        }));

      if (bands.length > 0) {
        chain.setEQ(bands);
      }
    }

    // Configure compression (transparent only)
    if (config.compression) {
      chain.setCompressor(
        config.compression.threshold ?? -12,
        config.compression.ratio ?? 1.5,
        config.compression.attack ?? 0.010,
        config.compression.release ?? 0.100,
        6 // Soft knee
      );
    }

    // Configure Saturation
    if (config.saturation && config.saturation.amount > 0) {
      chain.setSaturation(
        config.saturation.amount,
        config.saturation.type || 'tube',
        config.saturation.mix ?? 1.0
      );
    }

    // Configure Transient Shaper
    if (config.transientShaper) {
      chain.setTransientShaper(
        config.transientShaper.attack ?? 0,
        config.transientShaper.sustain ?? 0
      );
    }

    // Configure Stereo Imager (stereo only)
    if (config.stereoImager && numChannels === 2) {
      const width = getStereoWidth(config.stereoImager);
      chain.setStereoImager(width, 200);
    }

    // Configure Delay
    if (config.delay && config.delay.mix > 0) {
      chain.setDelay(
        config.delay.time ?? 0.25,
        config.delay.feedback ?? 0.3,
        config.delay.mix ?? 0.3,
        0.7 // damping
      );
    }

    // Configure Motion Reverb
    if (config.motionReverb && config.motionReverb.mix > 0) {
      chain.setReverb(
        config.motionReverb.decay / 2, // Convert decay to size (0-1)
        0.5, // damping
        config.motionReverb.mix
      );
    }

    // Configure limiter (protection only)
    if (config.limiter) {
      chain.setLimiter(
        config.limiter.threshold ?? -1.0,
        0.005, // 5ms lookahead
        config.limiter.release ?? 0.100
      );
    }

    // Apply input trim (gain staging before processing)
    let inputGain = 1.0;
    if (config.inputTrimDb !== undefined && config.inputTrimDb !== 0) {
      inputGain = dbToLinear(config.inputTrimDb);
      console.log('[audioEngine] Applying inputTrimDb:', {
        inputTrimDb: config.inputTrimDb,
        inputGainLinear: inputGain,
        willMultiplySamplesBy: inputGain
      });
    }

    // Apply output trim (gain staging after processing)
    let outputGain = 1.0;
    if (config.outputTrimDb !== undefined && config.outputTrimDb !== 0) {
      outputGain = dbToLinear(config.outputTrimDb);
      console.log('[audioEngine] Applying outputTrimDb:', {
        outputTrimDb: config.outputTrimDb,
        outputGainLinear: outputGain,
        willMultiplySamplesBy: outputGain
      });
    }

    // Process audio (stereo-linked)
    if (numChannels === 2) {
      // Stereo processing
      const leftInput = sourceBuffer.getChannelData(0);
      const rightInput = sourceBuffer.getChannelData(1);

      const leftOutput = new Float32Array(length);
      const rightOutput = new Float32Array(length);

      // Copy input to output buffers with input gain
      for (let i = 0; i < length; i++) {
        leftOutput[i] = leftInput[i] * inputGain;
        rightOutput[i] = rightInput[i] * inputGain;
      }

      // Calculate RMS before processing
      let rmsBeforeProcessing = 0;
      for (let i = 0; i < Math.min(44100, length); i++) {
        rmsBeforeProcessing += leftOutput[i] * leftOutput[i] + rightOutput[i] * rightOutput[i];
      }
      rmsBeforeProcessing = Math.sqrt(rmsBeforeProcessing / (Math.min(44100, length) * 2));
      const rmsBeforeDb = 20 * Math.log10(Math.max(rmsBeforeProcessing, 1e-10));

      // Process through custom chain
      chain.processStereo(leftOutput, rightOutput);

      // CRITICAL: NaN protection - clamp any NaN/Infinity values to zero
      let nanCount = 0;
      for (let i = 0; i < length; i++) {
        if (!isFinite(leftOutput[i])) {
          leftOutput[i] = 0;
          nanCount++;
        }
        if (!isFinite(rightOutput[i])) {
          rightOutput[i] = 0;
          nanCount++;
        }
      }

      if (nanCount > 0) {
        console.error(`[audioEngine] NaN/Infinity protection: clamped ${nanCount} samples to zero`);
      }

      // Calculate RMS after processing
      let rmsAfterProcessing = 0;
      for (let i = 0; i < Math.min(44100, length); i++) {
        rmsAfterProcessing += leftOutput[i] * leftOutput[i] + rightOutput[i] * rightOutput[i];
      }
      rmsAfterProcessing = Math.sqrt(rmsAfterProcessing / (Math.min(44100, length) * 2));
      const rmsAfterDb = 20 * Math.log10(Math.max(rmsAfterProcessing, 1e-10));

      console.log('[audioEngine] DSP Chain Effect:', {
        rmsBeforeProcessing: rmsBeforeDb.toFixed(2) + ' dB',
        rmsAfterProcessing: rmsAfterDb.toFixed(2) + ' dB',
        gainChange: (rmsAfterDb - rmsBeforeDb).toFixed(2) + ' dB',
        nanSamplesClamped: nanCount
      });

      // Apply output gain and copy to output buffer
      const leftChannel = outputBuffer.getChannelData(0);
      const rightChannel = outputBuffer.getChannelData(1);
      for (let i = 0; i < length; i++) {
        leftChannel[i] = leftOutput[i] * outputGain;
        rightChannel[i] = rightOutput[i] * outputGain;
      }
    } else {
      // Mono processing
      const input = sourceBuffer.getChannelData(0);
      const output = new Float32Array(length);

      // Copy input with input gain
      for (let i = 0; i < length; i++) {
        output[i] = input[i] * inputGain;
      }

      // Process through custom chain
      chain.processMono(output);

      // Apply output gain and copy to output buffer
      const channel = outputBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        channel[i] = output[i] * outputGain;
      }
    }

    return outputBuffer;
  }

  /**
   * Legacy renderProcessedAudio using Web Audio API (kept for Advanced Tools)
   */
  private async renderWithWebAudio(sourceBuffer: AudioBuffer, config: ProcessingConfig): Promise<AudioBuffer> {
    console.log('[audioEngine.renderWithWebAudio] Starting render:', {
      channels: sourceBuffer.numberOfChannels,
      length: sourceBuffer.length,
      sampleRate: sourceBuffer.sampleRate,
      duration: sourceBuffer.duration.toFixed(2) + 's'
    });

    const offlineCtx = new OfflineAudioContext(sourceBuffer.numberOfChannels, sourceBuffer.length, sourceBuffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = sourceBuffer;
    source.start(0);

    let currentNode: AudioNode = source;

    // Only apply input trim if explicitly set (default 0dB = no change)
    if (config.inputTrimDb !== undefined && config.inputTrimDb !== 0) {
        const inputTrim = offlineCtx.createGain();
        inputTrim.gain.value = dbToLinear(config.inputTrimDb);
        currentNode.connect(inputTrim); currentNode = inputTrim;
    }

    if (isPitchCorrectionActive(config.pitch)) {
        const pitchNode = await pitchCorrectionService.createNode(offlineCtx, config.pitch as PitchCorrectionConfig);
        if (pitchNode) {
            currentNode.connect(pitchNode);
            currentNode = pitchNode;
        } else {
            console.warn('[audioEngine] Pitch correction node unavailable for offline render');
        }
    }

    // Only apply de-esser if explicitly requested (not auto-applied)
    if (isDeEsserActive(config.deEsser)) {
        const de = advancedDspService.createDeEsser(offlineCtx, config.deEsser as DeEsserConfig);
        currentNode.connect(de.input); currentNode = de.output;
    }

    if (isDynamicEqActive(config.dynamicEq)) {
        const deq = advancedDspService.createDynamicEQ(offlineCtx, config.dynamicEq as DynamicEQConfig);
        currentNode.connect(deq.input); currentNode = deq.output;
    }

    if (config.eq && config.eq.some(band => band.gain !== 0)) {
        config.eq.forEach(band => {
            if (band.gain === 0) return;
            const filter = offlineCtx.createBiquadFilter();
            filter.type = mapFilterType(band.type);
            filter.frequency.value = band.frequency;
            filter.gain.value = band.gain;
            if (band.q) filter.Q.value = band.q;
            currentNode.connect(filter); currentNode = filter;
        });
    }

    // COMPRESSION: Match live preview chain for parity (DynamicsCompressorNode + makeup gain)
    if (isCompressionActive(config.compression)) {
        const comp = offlineCtx.createDynamicsCompressor();
        const t = isFinite(config.compression?.threshold ?? -12) ? (config.compression?.threshold ?? -12) : -12;
        const r = isFinite(config.compression?.ratio ?? 2.0) ? (config.compression?.ratio ?? 2.0) : 2.0;
        const a = isFinite(config.compression?.attack ?? 0.015) ? (config.compression?.attack ?? 0.015) : 0.015;
        const rel = isFinite(config.compression?.release ?? 0.400) ? (config.compression?.release ?? 0.400) : 0.400;
        const mg = isFinite(config.compression?.makeupGain ?? 0) ? (config.compression?.makeupGain ?? 0) : 0;

        comp.threshold.value = clamp(t, -100, 0);
        comp.ratio.value = clamp(r, 1, 20);
        comp.attack.value = clamp(a, 0, 1);
        comp.release.value = clamp(rel, 0.01, 1);
        comp.knee.value = 6;

        currentNode.connect(comp); currentNode = comp;

        const makeup = offlineCtx.createGain();
        makeup.gain.value = dbToLinear(clamp(mg, -12, 24));
        currentNode.connect(makeup); currentNode = makeup;
    }

    if (isSaturationActive(config.saturation)) {
        const sat = advancedDspService.createSaturation(offlineCtx, config.saturation as SaturationConfig);
        currentNode.connect(sat.input); currentNode = sat.output;
    }

    if (isTransientActive(config.transientShaper)) {
        const ts = advancedDspService.createTransientShaper(offlineCtx, config.transientShaper as TransientShaperConfig);
        currentNode.connect(ts.input); currentNode = ts.output;
    }

    if (isStereoImagerActive(config.stereoImager)) {
        const imagerConfig = normalizeStereoImagerConfig(config.stereoImager) as StereoImagerConfig;
        const imager = advancedDspService.createStereoImager(offlineCtx, imagerConfig);
        currentNode.connect(imager.input); currentNode = imager.output;
    }

    if (isMotionReverbActive(config.motionReverb)) {
        const verb = advancedDspService.createMotionReverb(offlineCtx, config.motionReverb as ReverbConfig);
        currentNode.connect(verb.input); currentNode = verb.output;
    }

    // LIMITER: Match live preview chain for parity (DynamicsCompressorNode)
    if (isLimiterActive(config.limiter)) {
        const limiter = offlineCtx.createDynamicsCompressor();
        const threshold = isFinite(config.limiter?.threshold ?? -6) ? (config.limiter?.threshold ?? -6) : -6;
        const ratio = isFinite(config.limiter?.ratio ?? 10) ? (config.limiter?.ratio ?? 10) : 10;
        const attack = isFinite(config.limiter?.attack ?? 0.005) ? (config.limiter?.attack ?? 0.005) : 0.005;
        const release = isFinite(config.limiter?.release ?? 0.35) ? (config.limiter?.release ?? 0.35) : 0.35;

        limiter.threshold.value = clamp(threshold, -12, 0);
        limiter.knee.value = 8;
        limiter.ratio.value = clamp(ratio, 1, 20);
        limiter.attack.value = attack;
        limiter.release.value = clamp(release, 0.01, 1);

        currentNode.connect(limiter); currentNode = limiter;
    }

    // Only apply output trim if explicitly set (default 0dB = no change)
    if (config.outputTrimDb !== undefined && config.outputTrimDb !== 0) {
        const outputTrim = offlineCtx.createGain();
        outputTrim.gain.value = dbToLinear(config.outputTrimDb);
        currentNode.connect(outputTrim); currentNode = outputTrim;
    }

    currentNode.connect(offlineCtx.destination);

    const renderedBuffer = await offlineCtx.startRendering();

    console.log('[audioEngine.renderWithWebAudio] Rendering complete:', {
      channels: renderedBuffer.numberOfChannels,
      length: renderedBuffer.length,
      sampleRate: renderedBuffer.sampleRate,
      hasCompression: !!config.compression,
      hasLimiter: !!config.limiter
    });

    // POST-PROCESS: Gate/expander cleanup before dynamics
    if (config.gateExpander?.enabled) {
      applyGateExpander(renderedBuffer, config.gateExpander);
    }

    if (config.truePeakLimiter?.enabled) {
      applyTruePeakLimiter(renderedBuffer, config.truePeakLimiter);
    }
    if (config.clipper?.enabled) {
      applySoftClipper(renderedBuffer, config.clipper);
    }

    console.log('[audioEngine] No post-processing applied, returning rendered buffer as-is');
    return renderedBuffer;
  } // End of renderWithWebAudio

  setInputTrim(db: number = 0) {
      const inputTrim = this.liveNodes?.inputTrim;
      if (!inputTrim) return;
      try {
        if (!isFinite(db)) {
          console.warn(`[audioEngine] Invalid inputTrim: ${db} - using 0dB`);
          db = 0;
        }
        const linearGain = dbToLinear(clamp(db, -24, 6));
        inputTrim.gain.setTargetAtTime(linearGain, this.audioContext.currentTime, 0.02);
      } catch (e) { console.error('[audioEngine] setInputTrim failed', e); }
  }

  setOutputTrim(db: number = 0) {
    const outputTrim = this.liveNodes?.outputTrim;
    if (!outputTrim) return;
    try {
      if (!isFinite(db)) {
        console.warn(`[audioEngine] Invalid outputTrim: ${db} - using 0dB`);
        db = 0;
      }
      const linearGain = dbToLinear(clamp(db, -24, 0));
      outputTrim.gain.setTargetAtTime(linearGain, this.audioContext.currentTime, 0.02);
    } catch (e) { console.error('[audioEngine] setOutputTrim failed', e); }
  }

  setLimiter(config?: LimiterConfig) {
    const outputLimiter = this.liveNodes?.outputLimiter;
    if (!outputLimiter) return;
    try {
        const active = isLimiterActive(config);
        const threshold = isFinite(config?.threshold ?? -6) ? (config?.threshold ?? -6) : -6;
        const ratio = isFinite(config?.ratio ?? 10) ? (config?.ratio ?? 10) : 10;
        const attack = isFinite(config?.attack ?? 0.005) ? (config?.attack ?? 0.005) : 0.005;
        const release = isFinite(config?.release ?? 0.35) ? (config?.release ?? 0.35) : 0.35;

        outputLimiter.threshold.setTargetAtTime(active ? clamp(threshold, -12, 0) : 0, this.audioContext.currentTime, 0.02);
        outputLimiter.knee.setTargetAtTime(active ? 8 : 0, this.audioContext.currentTime, 0.02);
        outputLimiter.ratio.setTargetAtTime(active ? clamp(ratio, 1, 20) : 1, this.audioContext.currentTime, 0.02);
        outputLimiter.attack.setTargetAtTime(attack, this.audioContext.currentTime, 0.02); // 5ms - let transient through
        outputLimiter.release.setTargetAtTime(clamp(release, 0.01, 1), this.audioContext.currentTime, 0.02); // Longer release for groove
    } catch (e) { console.error('[audioEngine] setLimiter failed', e); }
  }
  
  setStaticEQ(settings?: EQSettings) {
    const filters = this.liveNodes?.staticEQ;
    if (!filters || filters.length === 0) return;
    try {
        filters.forEach((filter, i) => {
            const band = settings?.[i];
            if (band) {
                // VALIDATE: Reject non-finite values from Gemini (NaN, Infinity, -Infinity)
                if (!isFinite(band.frequency) || !isFinite(band.gain)) {
                    console.warn(`[audioEngine] Invalid EQ band ${i}: freq=${band.frequency}, gain=${band.gain} - skipping`);
                    filter.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.02);
                    return;
                }

                filter.type = mapFilterType(band.type);
                filter.frequency.setTargetAtTime(clamp(band.frequency, 20, 20000), this.audioContext.currentTime, 0.02);
                filter.gain.setTargetAtTime(clamp(band.gain, -18, 18), this.audioContext.currentTime, 0.02);
                // Set Q to smooth out the filter response - wider Q = broader, smoother changes
                const q = band.q ?? (band.type === 'peaking' ? 0.7 : 0.5); // Wider Q for smoother response
                const validQ = isFinite(q) ? q : 0.7;
                filter.Q.setTargetAtTime(clamp(validQ, 0.1, 18), this.audioContext.currentTime, 0.02);
            } else {
                filter.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.02);
            }
        });
    } catch (e) { console.error('[audioEngine] setStaticEQ failed', e); }
  }
  
  setEngineMode(mode: 'FRIENDLY' | 'ADVANCED') {
    if (this.engineMode === mode) return; // No change needed
    this.engineMode = mode;
    if (this.isChainInitialized) {
      this.applyProcessingConfig(this.currentConfig);
    }
  }

  getEngineMode(): 'FRIENDLY' | 'ADVANCED' {
    return this.engineMode;
  }

  setCompression(config?: Partial<CompressionPreset>) {
    const mainComp = this.liveNodes?.mainComp;
    const compMakeupGain = this.liveNodes?.compMakeupGain;
    if (!mainComp || !compMakeupGain) return;
    try {
        // Main compressor provides intelligent level control without phase artifacts
        // Using light compression by default for transparency
        const active = isCompressionActive(config);
        const t = isFinite(config?.threshold ?? -12) ? (config?.threshold ?? -12) : -12;
        const r = isFinite(config?.ratio ?? 2.0) ? (config?.ratio ?? 2.0) : 2.0;
        const a = isFinite(config?.attack ?? 0.015) ? (config?.attack ?? 0.015) : 0.015;
        const rel = isFinite(config?.release ?? 0.400) ? (config?.release ?? 0.400) : 0.400;
        const mg = isFinite(config?.makeupGain ?? 0) ? (config?.makeupGain ?? 0) : 0;

        mainComp.threshold.setTargetAtTime(active ? clamp(t, -100, 0) : 0, this.audioContext.currentTime, 0.02);
        mainComp.ratio.setTargetAtTime(active ? clamp(r, 1, 20) : 1, this.audioContext.currentTime, 0.02);
        mainComp.attack.setTargetAtTime(clamp(a, 0, 1), this.audioContext.currentTime, 0.02);
        mainComp.release.setTargetAtTime(clamp(rel, 0.01, 1), this.audioContext.currentTime, 0.02);
        mainComp.knee.setTargetAtTime(active ? 6 : 0, this.audioContext.currentTime, 0.02); // Soft knee for transparent mastering

        const makeupGainLinear = dbToLinear(clamp(active ? mg : 0, -12, 24));
        compMakeupGain.gain.setTargetAtTime(makeupGainLinear, this.audioContext.currentTime, 0.02);
    } catch (e) { console.error('[audioEngine] setCompression failed', e); }
  }
  
  setSaturation(config?: SaturationConfig) { if (this.liveNodes?.saturation && config) { this.liveNodes.saturation.setDrive(config.amount); this.liveNodes.saturation.setMix(config.mix ?? 1); this.liveNodes.saturation.setMode(config.type); } }
  setTransientShaper(config?: TransientShaperConfig) { if (this.liveNodes?.transientShaper && config) { this.liveNodes.transientShaper.setAttack(config.attack); this.liveNodes.transientShaper.setSustain(config.sustain); this.liveNodes.transientShaper.setMix(config.mix); } }
  setStereoImager(config?: StereoImagerConfig) {
    if (!this.liveNodes?.stereoImager || !config) return;
    const normalized = normalizeStereoImagerConfig(config);
    if (!normalized) return;
    this.liveNodes.stereoImager.setLowWidth(normalized.lowWidth);
    this.liveNodes.stereoImager.setMidWidth(normalized.midWidth);
    this.liveNodes.stereoImager.setHighWidth(normalized.highWidth);
    this.liveNodes.stereoImager.setCrossovers(normalized.crossovers[0], normalized.crossovers[1]);
  }
  setDeEsser(config?: DeEsserConfig) { if (this.liveNodes?.deEsser && config) { this.liveNodes.deEsser.setFrequency(config.frequency); this.liveNodes.deEsser.setThreshold(config.threshold); this.liveNodes.deEsser.setIntensity(config.amount); } }
  setDynamicEQ(config?: DynamicEQConfig) { if (this.liveNodes?.dynamicEq && config) { config.forEach((band, i) => this.liveNodes?.dynamicEq?.updateBand(i, band)); } }
  setMotionReverb(config?: ReverbConfig) { if (this.liveNodes?.motionReverb && config) { this.liveNodes.motionReverb.setMix(config.mix); this.liveNodes.motionReverb.setDucking(config.duckingAmount ?? 0); if (config.motion) { this.liveNodes.motionReverb.setDepth(config.motion.depth); this.liveNodes.motionReverb.setPulse(config.motion.bpm); } } }

  setTransientAttack(val: number) { if(this.liveNodes?.transientShaper) this.liveNodes.transientShaper.setAttack(val); }
  setTransientSustain(val: number) { if(this.liveNodes?.transientShaper) this.liveNodes.transientShaper.setSustain(val); }
  setTransientMix(mix: number) { if(this.liveNodes?.transientShaper) this.liveNodes.transientShaper.setMix(mix); }
  setDeEsserFrequency(f: number) { if(this.liveNodes?.deEsser) this.liveNodes.deEsser.setFrequency(f); }
  setDeEsserThreshold(t: number) { if(this.liveNodes?.deEsser) this.liveNodes.deEsser.setThreshold(t); }
  setDeEsserIntensity(amt: number) { if(this.liveNodes?.deEsser) this.liveNodes.deEsser.setIntensity(amt); }
  setDynamicEQBand(idx: number, bandConfig: DynamicEQBand) { if(this.liveNodes?.dynamicEq) this.liveNodes.dynamicEq.updateBand(idx, bandConfig); }
  toggleDynamicEQBand(idx: number, enabled: boolean) { if(this.liveNodes?.dynamicEq) this.liveNodes.dynamicEq.toggleBand(idx, enabled); }
  setSaturationDrive(drive: number) { if(this.liveNodes?.saturation) this.liveNodes.saturation.setDrive(drive); }
  setSaturationMix(mix: number) { if(this.liveNodes?.saturation) this.liveNodes.saturation.setMix(mix); }
  setSaturationMode(mode: 'tube' | 'tape' | 'digital' | 'density' | 'console' | 'spiral' | 'channel' | 'totape' | 'purestdrive') { if(this.liveNodes?.saturation) this.liveNodes.saturation.setMode(mode); }
  setStereoImagerLowWidth(val: number) { if(this.liveNodes?.stereoImager) this.liveNodes.stereoImager.setLowWidth(val); }
  setStereoImagerMidWidth(val: number) { if(this.liveNodes?.stereoImager) this.liveNodes.stereoImager.setMidWidth(val); }
  setStereoImagerHighWidth(val: number) { if(this.liveNodes?.stereoImager) this.liveNodes.stereoImager.setHighWidth(val); }
  setStereoImagerCrossovers(c1: number, c2: number) { if(this.liveNodes?.stereoImager) this.liveNodes.stereoImager.setCrossovers(c1, c2); }
  setMotionReverbDepth(d: number) { if(this.liveNodes?.motionReverb) this.liveNodes.motionReverb.setDepth(d); }
  setMotionReverbPulse(bpm: number) { if(this.liveNodes?.motionReverb) this.liveNodes.motionReverb.setPulse(bpm); }
  setMotionReverbMix(m: number) { if(this.liveNodes?.motionReverb) this.liveNodes.motionReverb.setMix(m); }
  setMotionReverbDucking(amount: number) { if(this.liveNodes?.motionReverb) this.liveNodes.motionReverb.setDucking(amount); }

  updateLiveParameter(param: 'eq', value: EQSettings) {
    if (param === 'eq') {
        this.setStaticEQ(value);
    }
  }

  private stopSource() {
    if (this.source) {
      try { this.source.stop(); this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
  }
  
  private resetPlaybackState() {
    this.pausedAt = 0;
    this.startedAt = 0;
    this.isPlaying = false;
  }
  
  getCurrentTime(): number {
    if (this.shouldUseNativePlayback() && this.rawElement) {
      return this.rawElement.currentTime;
    }
    if (this.isPlaying && this.buffer) {
      return clamp(this.audioContext.currentTime - this.startedAt, 0, this.buffer.duration);
    }
    return this.pausedAt;
  }
  
  getAnalyserNode(): AnalyserNode {
    return this.analyser;
  }

  getDuration(): number {
    if (this.shouldUseNativePlayback() && this.rawElement && isFinite(this.rawElement.duration)) {
      return this.rawElement.duration;
    }
    return this.buffer?.duration || 0;
  }
  
  getSampleRate(): number {
    return this.audioContext.sampleRate;
  }

  async previewStem(buffer: AudioBuffer) {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.stopSource();

    // Save main buffer state before entering stem preview mode
    if (!this.isStemPreviewMode) {
      this.savedBuffer = this.buffer;
      this.isStemPreviewMode = true;
    }

    // Use dedicated stem preview buffer without corrupting main buffer state
    this.stemPreviewBuffer = buffer;
    this.buffer = buffer; // Temporary assignment for getCurrentTime() compatibility

    this.source = this.audioContext.createBufferSource();
    this.source.buffer = buffer;
    this.source.channelCountMode = 'explicit';
    this.source.channelInterpretation = 'speakers';

    // For stem preview, bypass processing and connect directly
    this.source.connect(this.audioContext.destination);
    this.connectAnalyserTap(this.source);

    this.startedAt = this.audioContext.currentTime;
    this.pausedAt = 0;
    this.source.start(0);
    this.isPlaying = true;
  }

  analyzeStaticMetrics(bufferOverride?: AudioBuffer): AudioMetrics {
      return mixAnalysisService.analyzeStaticMetrics(bufferOverride); 
  }

  getSSCScan(): SSCScan {
    const sanitized = sanitizeProcessingConfig(this.currentConfig as ProcessingConfig);
    const activeFlags = this.getActiveProcessingFlags(sanitized as LiveProcessingConfig);
    const makeEntry = (
      id: string,
      label: string,
      active: boolean,
      reason: string,
      confidenceLevel: SSCConfidenceLevel,
      value?: number | string | boolean | null,
      defaultValue?: number | string | boolean | null
    ): SSCScanEntry => ({
      id,
      label,
      active,
      reason,
      confidenceLevel,
      value: value ?? null,
      defaultValue: defaultValue ?? null,
    });

    const width = getStereoWidth(sanitized.stereoImager);
    const dynamicEqEnabled = sanitized.dynamicEq?.filter(b => b.enabled).length ?? 0;
    const eqActiveBands = sanitized.eq?.filter(b => b.gain !== 0).length ?? 0;

    const processors: SSCScanEntry[] = [
      makeEntry('inputTrim', 'Input Trim', activeFlags.inputTrim, activeFlags.inputTrim ? `Input trim set to ${sanitized.inputTrimDb ?? 0} dB` : 'Input trim at 0 dB', 'certain', sanitized.inputTrimDb ?? 0, 0),
      makeEntry('pitch', 'Pitch Correction', activeFlags.pitchCorrection, activeFlags.pitchCorrection ? 'Pitch correction enabled' : 'Pitch correction disabled', 'certain', sanitized.pitch?.enabled ?? false, false),
      makeEntry('deEsser', 'De-Esser', activeFlags.deEsser, activeFlags.deEsser ? `De-esser amount ${sanitized.deEsser?.amount ?? 0}` : 'De-esser amount at 0', 'certain', sanitized.deEsser?.amount ?? 0, 0),
      makeEntry('dynamicEq', 'Dynamic EQ', activeFlags.dynamicEq, activeFlags.dynamicEq ? `${dynamicEqEnabled} band(s) enabled` : 'No enabled dynamic EQ bands', 'derived', dynamicEqEnabled, 0),
      makeEntry('staticEq', 'Static EQ', activeFlags.eq, activeFlags.eq ? `${eqActiveBands} band(s) active` : 'All EQ bands at 0 dB', 'derived', eqActiveBands, 0),
      makeEntry('compression', 'Compression', activeFlags.compression, activeFlags.compression ? 'Compression configured' : 'Compression inactive', 'derived'),
      makeEntry('saturation', 'Saturation', activeFlags.saturation, activeFlags.saturation ? `Amount ${sanitized.saturation?.amount ?? 0}` : this.engineMode === 'ADVANCED' ? 'Saturation amount at 0' : 'Saturation disabled (friendly mode)', 'derived', sanitized.saturation?.amount ?? 0, 0),
      makeEntry('transient', 'Transient Shaper', activeFlags.transient, activeFlags.transient ? 'Transient shaping configured' : this.engineMode === 'ADVANCED' ? 'Transient shaping neutral' : 'Transient shaping disabled (friendly mode)', 'derived'),
      makeEntry('stereoImager', 'Stereo Width', activeFlags.stereoImager, activeFlags.stereoImager ? `Global width ${width.toFixed(2)}` : 'Global width at 1.0 (neutral)', 'derived', Number(width.toFixed(2)), 1),
      makeEntry('motionReverb', 'Motion Reverb', activeFlags.motionReverb, activeFlags.motionReverb ? `Reverb mix ${sanitized.motionReverb?.mix ?? 0}` : this.engineMode === 'ADVANCED' ? 'Reverb mix at 0' : 'Reverb disabled (friendly mode)', 'derived', sanitized.motionReverb?.mix ?? 0, 0),
      makeEntry('limiter', 'Limiter', activeFlags.limiter, activeFlags.limiter ? 'Limiter configured' : 'Limiter inactive', 'derived'),
      makeEntry('outputTrim', 'Output Trim', activeFlags.outputTrim, activeFlags.outputTrim ? `Output trim set to ${sanitized.outputTrimDb ?? 0} dB` : 'Output trim at 0 dB', 'certain', sanitized.outputTrimDb ?? 0, 0),
      makeEntry('localPlugins', 'Local Plugins', activeFlags.localPlugins, activeFlags.localPlugins ? `${localPluginService.getActiveInstances().length} active` : 'No local plugins active', 'certain'),
      makeEntry('wamPlugins', 'WAM Plugins', activeFlags.wamPlugins, activeFlags.wamPlugins ? `${this.wamPluginChain.length} active` : 'No WAM plugins active', 'certain'),
    ];

    const controls: SSCScanEntry[] = [
      makeEntry('inputTrimDb', 'Input Trim (dB)', !!sanitized.inputTrimDb && sanitized.inputTrimDb !== 0, sanitized.inputTrimDb ? 'Non-zero input trim' : 'Neutral', 'certain', sanitized.inputTrimDb ?? 0, 0),
      makeEntry('outputTrimDb', 'Output Trim (dB)', !!sanitized.outputTrimDb && sanitized.outputTrimDb !== 0, sanitized.outputTrimDb ? 'Non-zero output trim' : 'Neutral', 'certain', sanitized.outputTrimDb ?? 0, 0),
      makeEntry('compressionRatio', 'Compression Ratio', isCompressionActive(sanitized.compression), isCompressionActive(sanitized.compression) ? 'Compression active' : 'Ratio at 1.0', 'derived', sanitized.compression?.ratio ?? 1, 1),
      makeEntry('limiterThreshold', 'Limiter Threshold', isLimiterActive(sanitized.limiter), isLimiterActive(sanitized.limiter) ? 'Limiter active' : 'Limiter inactive', 'derived', sanitized.limiter?.threshold ?? -6, -6),
      makeEntry('stereoWidth', 'Stereo Width (Global)', width !== 1, width !== 1 ? 'Width adjusted' : 'Neutral width', 'derived', Number(width.toFixed(2)), 1),
    ];

    const noOp = !Object.values(activeFlags).some(Boolean);
    const noOpReasons = noOp
      ? [{ id: 'all', reason: 'No processors are active; configuration is neutral or disabled.', confidenceLevel: 'derived' as SSCConfidenceLevel }]
      : [];

    return {
      session: {
        id: `ssc-${Date.now()}`,
        timestamp: Date.now(),
        mode: 'read-only',
        actionability: 'none',
      },
      processingOrder: PROCESSING_ORDER,
      sanitizedConfig: JSON.parse(JSON.stringify(sanitized)),
      processors,
      controls,
      noOp,
      noOpReasons,
      constraints: ['Read-only session. No actions available.'],
      affordances: ['Observation only. No controls are actionable in Phase 0.'],
      notes: [
        { level: 'info', message: 'SSC is in observe-only mode.', confidenceLevel: 'certain' },
      ],
    };
  }
  
  async calculateSpectralBalance(bufferOverride?: AudioBuffer): Promise<{low: number, mid: number, high: number}> {
      const signature = await mixAnalysisService.extractMixSignature(bufferOverride || this.buffer!);
      return signature.tonalBalance;
  }
  
  async mixStems(stems: Stem[]): Promise<AudioBuffer> {
      return stems[0].buffer;
  }

  // ============================================
  // WAM Plugin Integration
  // ============================================

  /**
   * Initialize WAM environment (call once before loading plugins)
   */
  async initializeWAM(): Promise<boolean> {
    if (this.wamInitialized) return true;

    try {
      const success = await wamPluginService.initialize(this.audioContext);
      if (success) {
        this.wamInitialized = true;
        // Create insert point for WAM plugins
        this.wamInsertPoint = this.audioContext.createGain();
        console.log('[AudioEngine] WAM environment initialized');
      }
      return success;
    } catch (error) {
      console.error('[AudioEngine] Failed to initialize WAM:', error);
      return false;
    }
  }

  /**
   * Get available WAM plugins
   */
  getAvailableWAMPlugins(): WAMPluginInfo[] {
    return wamPluginService.getAvailablePlugins();
  }

  /**
   * Load a WAM plugin and add to chain
   */
  async loadWAMPlugin(pluginId: string): Promise<boolean> {
    if (!this.wamInitialized) {
      const initialized = await this.initializeWAM();
      if (!initialized) return false;
    }

    try {
      const instance = await wamPluginService.loadPlugin(pluginId);
      if (instance) {
        this.wamPluginChain.push(pluginId);
        console.log(`[AudioEngine] WAM plugin loaded: ${pluginId}`);
        this.refreshExternalPluginChain();
        return true;
      }
    } catch (error) {
      console.error(`[AudioEngine] Failed to load WAM plugin: ${pluginId}`, error);
    }
    return false;
  }

  /**
   * Unload a WAM plugin
   */
  async unloadWAMPlugin(pluginId: string): Promise<void> {
    await wamPluginService.unloadPlugin(pluginId);
    this.wamPluginChain = this.wamPluginChain.filter(id => id !== pluginId);
    console.log(`[AudioEngine] WAM plugin unloaded: ${pluginId}`);
    this.refreshExternalPluginChain();
  }

  /**
   * Get loaded WAM plugin chain
   */
  getWAMPluginChain(): string[] {
    return [...this.wamPluginChain];
  }

  /**
   * Reorder WAM plugins in chain
   */
  reorderWAMPlugins(newOrder: string[]): void {
    this.wamPluginChain = newOrder.filter(id => this.wamPluginChain.includes(id));
    this.refreshExternalPluginChain();
  }

  refreshExternalPluginChain(): void {
    this.applyProcessingConfig(this.currentConfig);
  }

  /**
   * Set WAM plugin parameter
   */
  async setWAMPluginParameter(pluginId: string, paramId: string, value: number): Promise<boolean> {
    return wamPluginService.setPluginParameter(pluginId, paramId, value);
  }

  /**
   * Get WAM plugin parameters
   */
  async getWAMPluginParameters(pluginId: string): Promise<Record<string, any> | null> {
    return wamPluginService.getPluginParameters(pluginId);
  }

  /**
   * Open WAM plugin GUI
   */
  async openWAMPluginGUI(pluginId: string, container: HTMLElement): Promise<HTMLElement | null> {
    return wamPluginService.openPluginGUI(pluginId, container);
  }

  /**
   * Connect WAM plugins into the processing chain
   * Call this after building the main processing chain
   */
  connectWAMPlugins(inputNode: AudioNode, outputNode: AudioNode): AudioNode {
    if (this.wamPluginChain.length === 0) {
      // No WAM plugins, connect directly
      inputNode.connect(outputNode);
      return inputNode;
    }

    let currentSource = inputNode;
    for (const pluginId of this.wamPluginChain) {
      const pluginNode = wamPluginService.getPluginNode(pluginId);
      if (!pluginNode) continue;
      const nodeAny = pluginNode as unknown as { input?: AudioNode; output?: AudioNode };
      try {
        if (nodeAny.input && nodeAny.output) {
          currentSource.connect(nodeAny.input);
          currentSource = nodeAny.output;
        } else {
          currentSource.connect(pluginNode);
          currentSource = pluginNode;
        }
      } catch (err) {
        console.error(`[audioEngine] Failed to connect WAM plugin ${pluginId}`, err);
      }
    }

    // Connect final plugin to output
    currentSource.connect(outputNode);
    return currentSource;
  }

  connectLocalPlugins(inputNode: AudioNode): AudioNode {
    const instances = localPluginService.getActiveInstances();
    if (instances.length === 0) {
      return inputNode;
    }

    let currentSource = inputNode;
    for (const instance of instances) {
      localPluginService.disconnect(instance.id);
      currentSource.connect(instance.inputNode);
      currentSource = instance.outputNode;
    }

    return currentSource;
  }

  /**
   * Save WAM plugin preset
   */
  async saveWAMPreset(pluginId: string, presetName: string): Promise<boolean> {
    return wamPluginService.savePluginPreset(pluginId, presetName);
  }

  /**
   * Load WAM plugin preset
   */
  async loadWAMPreset(pluginId: string, presetName: string): Promise<boolean> {
    return wamPluginService.loadPluginPreset(pluginId, presetName);
  }

  /**
   * Get AudioContext (needed for WAM GUI mounting)
   */
  getAudioContext(): AudioContext {
    return this.audioContext;
  }

  canPreviewPitchRealtime(): boolean {
    return pitchCorrectionService.canUseRealtime(this.audioContext);
  }

  /**
   * Test WAM plugin loading - for debugging
   * Call from console: audioEngine.testWAMPlugin('simple-delay')
   */
  async testWAMPlugin(pluginId: string = 'simple-delay'): Promise<void> {
    console.log(`[WAM Test] Starting test for plugin: ${pluginId}`);

    // 1. Initialize WAM
    console.log('[WAM Test] Initializing WAM environment...');
    const initialized = await this.initializeWAM();
    if (!initialized) {
      console.error('[WAM Test] Failed to initialize WAM environment');
      return;
    }
    console.log('[WAM Test] WAM environment ready');

    // 2. Load plugin
    console.log(`[WAM Test] Loading plugin: ${pluginId}...`);
    const loaded = await this.loadWAMPlugin(pluginId);
    if (!loaded) {
      console.error(`[WAM Test] Failed to load plugin: ${pluginId}`);
      return;
    }
    console.log(`[WAM Test] Plugin loaded successfully`);

    // 3. Get parameters
    const params = await this.getWAMPluginParameters(pluginId);
    console.log('[WAM Test] Plugin parameters:', params);

    // 4. Check if we have audio to test with
    if (!this.buffer) {
      console.log('[WAM Test] No audio loaded. Load a file first to test audio through the plugin.');
      console.log('[WAM Test] Plugin is ready and in the chain. Play audio to hear it.');
      return;
    }

    // 5. Rebuild chain with WAM plugin
    console.log('[WAM Test] Rebuilding processing chain with WAM plugin...');
    this._buildProcessingChain(this.currentConfig);

    console.log('[WAM Test] Test complete! Play audio to hear the effect.');
    console.log(`[WAM Test] Available methods:`);
    console.log(`  - audioEngine.setWAMPluginParameter('${pluginId}', 'paramId', value)`);
    console.log(`  - audioEngine.unloadWAMPlugin('${pluginId}')`);
    console.log(`  - audioEngine.getWAMPluginChain()`);
  }
}

export const audioEngine = new AudioEngine();

// Expose to window for console testing
if (typeof window !== 'undefined') {
  (window as any).audioEngine = audioEngine;
}
