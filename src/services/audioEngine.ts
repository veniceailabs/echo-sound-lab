import { AudioMetrics, ProcessingConfig, ProcessingMode, Stem, EQSettings, LiveProcessingConfig, MixSignature, MixIntent, VeniceColorPreset, MultibandCompressionConfig, TransientShaperConfig, DeEsserConfig, SaturationConfig, ReverbConfig, StereoImagerConfig, DynamicEQConfig, DynamicEQBand, CompressionPreset, LimiterConfig } from '../types';
import { advancedDspService } from './advancedDsp';
import { mixAnalysisService } from './mixAnalysis';
import { wamPluginService, WAMPluginInfo } from './wamPluginService';
import { MultibandValidator } from './multibandValidator';

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
const dbToLinear = (db: number) => Math.pow(10, db / 20);

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
  inputTrim: GainNode;
  staticEQ: BiquadFilterNode[];
  mainComp: DynamicsCompressorNode;
  compMakeupGain: GainNode;
  saturation: ReturnType<typeof advancedDspService.createSaturation> | null;
  transientShaper: ReturnType<typeof advancedDspService.createTransientShaper> | null;
  stereoImager: ReturnType<typeof advancedDspService.createStereoImager> | null;
  outputLimiter: DynamicsCompressorNode;
  outputTrim: GainNode;
  multibandCompressor: ReturnType<typeof advancedDspService.createMultibandCompressor> | null;
  deEsser: ReturnType<typeof advancedDspService.createDeEsser> | null;
  dynamicEq: ReturnType<typeof advancedDspService.createDynamicEQ> | null;
  motionReverb: ReturnType<typeof advancedDspService.createMotionReverb> | null;
}

export class AudioEngine {
  private audioContext: AudioContext;
  private analyser: AnalyserNode;
  private buffer: AudioBuffer | null = null; // Currently playing buffer
  private originalBuffer: AudioBuffer | null = null; // Pristine original for processing & A/B
  private processedBuffer: AudioBuffer | null = null; // Processed version for A/B
  private source: AudioBufferSourceNode | null = null;

  private liveNodes: LiveNodes | null = null;
  private liveProcessingChain: AudioNode[] = [];
  private currentConfig: LiveProcessingConfig = {};
  private isChainInitialized: boolean = false;

  private startedAt: number = 0;
  private pausedAt: number = 0;
  private isPlaying: boolean = false;

  // A/B bypass state
  private isBypassed: boolean = false;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private masterInput: GainNode;

  // Stem preview state
  private isStemPreviewMode: boolean = false;
  private stemPreviewBuffer: AudioBuffer | null = null;
  private savedBuffer: AudioBuffer | null = null;

  // WAM plugin chain
  private wamPluginChain: string[] = []; // IDs of loaded WAM plugins in order
  private wamInitialized: boolean = false;
  private wamInsertPoint: GainNode | null = null; // Insert point for WAM plugins in chain

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({ latencyHint: 'interactive' });
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;

    // Create persistent A/B routing nodes
    this.masterInput = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();
    this.wetGain = this.audioContext.createGain();

    // Default: dry signal active (original) until processing is applied
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    // Both paths merge to analyser -> destination
    this.dryGain.connect(this.analyser);
    this.wetGain.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  async loadFile(file: File): Promise<AudioBuffer> {
    console.log('[audioEngine] Starting loadFile...');
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    console.log('[audioEngine] Reading file to arrayBuffer...');
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[audioEngine] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);

    console.log('[audioEngine] Starting decodeAudioData...');
    const decodeStart = Date.now();
    this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
    console.log(`[audioEngine] Decode completed in ${Date.now() - decodeStart}ms`);

    // Store original for non-destructive processing
    this.originalBuffer = this.buffer;

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

  setBuffer(buffer: AudioBuffer) {
    this.buffer = buffer;
    // Also store as processed buffer for A/B comparison
    this.processedBuffer = buffer;
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
              config.stereoImager = { lowWidth: 0.8, midWidth: 1.2, highWidth: 1.5, crossovers: [300, 5000] };
              config.eq = [
                  { frequency: 400, gain: -3, type: 'peaking' },
                  { frequency: 10000, gain: 2, type: 'highshelf' }
              ];
              break;
          case 'JellyfishWarmth':
              config.colorFilter = 'Jellyfish Warmth';
              config.saturation = { type: 'tape', amount: 0.3, mix: 0.7 };
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

    // CRITICAL: Use original buffer for playback, processing is done offline
    // The buffer property holds either original (before processing) or processed audio
    // We play whatever is in buffer - the A/B comparison switches gain nodes
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.buffer;

    // Simple routing: source -> analyser -> destination
    // No live processing chain - all processing is done via offline rendering
    this.source.connect(this.analyser);

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
    if (this.source && this.isPlaying) {
      this.pausedAt = this.audioContext.currentTime - this.startedAt;
      this.stopSource();
    }
    this.isPlaying = false;
  }

  stop() {
    this.stopSource();
    this.resetPlaybackState();
  }

  seek(time: number) {
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

  applyProcessingConfig(config: LiveProcessingConfig) {
    // Store current config
    this.currentConfig = config;

    // If chain not initialized, build it once
    if (!this.isChainInitialized) {
      this._buildProcessingChain(config);
    } else {
      // Just update parameters, don't rebuild the graph
      this.setFullConfig(config);
    }
  }

  private _buildProcessingChain(config: LiveProcessingConfig) {
    try {
      // Only disconnect processing chain nodes, not the source
      this._disconnectProcessingNodes();

      const ctx = this.audioContext;

      // Create all DSP nodes (always create them, even if not initially used)
      // This allows enabling/disabling without rebuilding
      // Validate multiband config before creating
      const multibandConfig = config.multibandCompression || { low: {}, mid: {}, high: {}, crossovers: [150, 4000] };
      const validation = MultibandValidator.validate(multibandConfig);

      if (!validation.isValid) {
        console.error('[Echo] Multiband Compressor Configuration Errors:', validation.errors);
        validation.errors.forEach(err => console.error(`  ❌ ${err}`));
      }

      if (validation.warnings.length > 0) {
        console.warn('[Echo] Multiband Compressor Configuration Warnings:', validation.warnings);
        validation.warnings.forEach(warn => console.warn(`  ⚠️  ${warn}`));
      }

      if (!validation.hasConfiguration) {
        console.info('[Echo] Multiband Compressor using safe defaults (no user configuration provided)');
      }

      this.liveNodes = {
        inputTrim: ctx.createGain(),
        staticEQ: Array.from({ length: 5 }, () => ctx.createBiquadFilter()),
        mainComp: ctx.createDynamicsCompressor(),
        compMakeupGain: ctx.createGain(),
        outputLimiter: ctx.createDynamicsCompressor(),
        outputTrim: ctx.createGain(),
        saturation: advancedDspService.createSaturation(ctx, config.saturation || { type: 'tape', amount: 0, mix: 0 }),
        transientShaper: advancedDspService.createTransientShaper(ctx, config.transientShaper || { attack: 0, sustain: 0, mix: 0 }),
        stereoImager: advancedDspService.createStereoImager(ctx, config.stereoImager || { lowWidth: 1, midWidth: 1, highWidth: 1, crossovers: [300, 5000] }),
        multibandCompressor: advancedDspService.createMultibandCompressor(ctx, multibandConfig),
        deEsser: advancedDspService.createDeEsser(ctx, config.deEsser || { frequency: 7000, threshold: -20, amount: 0 }),
        dynamicEq: advancedDspService.createDynamicEQ(ctx, config.dynamicEq || []),
        motionReverb: advancedDspService.createMotionReverb(ctx, config.motionReverb || { mix: 0, decay: 2.0, preDelay: 0.01 }),
      };

      // Build the chain: inputTrim -> ... -> outputTrim -> wetGain
      const chainNodes: AudioNode[] = [];
      let currentNode: AudioNode = this.liveNodes.inputTrim;
      chainNodes.push(currentNode);

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

        currentNode.connect(inputNode);
        chainNodes.push(inputNode);
        if (inputNode !== outputNode) {
          chainNodes.push(outputNode);
        }
        currentNode = outputNode;
      };

      // Chain order: input -> deEsser -> dynamicEQ -> staticEQ -> multiband -> comp -> saturation -> transient -> imager -> reverb -> limiter -> output -> [WAM plugins] -> wetGain
      connectNext(this.liveNodes.deEsser);
      connectNext(this.liveNodes.dynamicEq);
      this.liveNodes.staticEQ.forEach(filter => connectNext(filter));
      connectNext(this.liveNodes.multibandCompressor);
      connectNext(this.liveNodes.mainComp);
      connectNext(this.liveNodes.compMakeupGain);
      connectNext(this.liveNodes.saturation);
      connectNext(this.liveNodes.transientShaper);
      connectNext(this.liveNodes.stereoImager);
      connectNext(this.liveNodes.motionReverb);
      connectNext(this.liveNodes.outputLimiter);
      connectNext(this.liveNodes.outputTrim);

      // Insert WAM plugins between our DSP chain and wetGain
      // WAM plugins are connected in series: outputTrim -> [WAM1 -> WAM2 -> ...] -> wetGain
      if (this.wamPluginChain.length > 0) {
        this.connectWAMPlugins(currentNode, this.wetGain);
      } else {
        // No WAM plugins, connect directly to wetGain
        currentNode.connect(this.wetGain);
      }

      this.liveProcessingChain = chainNodes;
      this.isChainInitialized = true;

      // Apply the initial config values
      this.setFullConfig(config);

      // If currently playing, reconnect masterInput to the chain
      if (this.isPlaying && this.source) {
        try { this.masterInput.disconnect(this.wetGain); } catch (e) {}
        try { this.masterInput.disconnect(this.liveNodes.inputTrim); } catch (e) {}
        this.masterInput.connect(this.liveNodes.inputTrim);
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
        this.setMultibandCompression(config.multibandCompression);
        this.setDeEsser(config.deEsser);
        this.setDynamicEQ(config.dynamicEq);
        this.setMotionReverb(config.motionReverb);
    } catch (e) {
        console.error('[audioEngine] setFullConfig failed', e);
    }
  }

  disconnectLiveProcessingChain() {
    this._disconnectProcessingNodes();
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
    // CRITICAL: Always process from original to prevent cumulative degradation
    const sourceBuffer = this.originalBuffer || this.buffer;
    if (!sourceBuffer) throw new Error("No buffer to render.");

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

    if (config.deEsser && config.deEsser.amount > 0) {
        const de = advancedDspService.createDeEsser(offlineCtx, config.deEsser);
        currentNode.connect(de.input); currentNode = de.output;
    }

    if (config.dynamicEq && config.dynamicEq.some(b => b.enabled)) {
        const deq = advancedDspService.createDynamicEQ(offlineCtx, config.dynamicEq);
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

    if (config.multibandCompression) {
        const validation = MultibandValidator.validate(config.multibandCompression);
        if (!validation.isValid) {
            console.error('[Echo] Offline Render: Multiband config has errors. Processing may fail.', validation.errors);
        }
        const mb = advancedDspService.createMultibandCompressor(offlineCtx, config.multibandCompression);
        currentNode.connect(mb.input); currentNode = mb.output;
    }

    if (config.compression) {
        const comp = offlineCtx.createDynamicsCompressor();
        comp.threshold.value = config.compression.threshold ?? -24;
        comp.ratio.value = config.compression.ratio ?? 3;
        comp.attack.value = config.compression.attack ?? 0.003;
        comp.release.value = config.compression.release ?? 0.25;
        comp.knee.value = 6; // Soft knee for transparent mastering
        currentNode.connect(comp); currentNode = comp;

        if (config.compression.makeupGain && config.compression.makeupGain !== 0) {
            const makeupGainNode = offlineCtx.createGain();
            makeupGainNode.gain.value = dbToLinear(config.compression.makeupGain);
            currentNode.connect(makeupGainNode); currentNode = makeupGainNode;
        }
    }

    if (config.saturation && config.saturation.amount > 0) {
        const sat = advancedDspService.createSaturation(offlineCtx, config.saturation);
        currentNode.connect(sat.input); currentNode = sat.output;
    }

    if (config.transientShaper && (config.transientShaper.attack !== 0 || config.transientShaper.sustain !== 0)) {
        const ts = advancedDspService.createTransientShaper(offlineCtx, config.transientShaper);
        currentNode.connect(ts.input); currentNode = ts.output;
    }

    if (config.stereoImager && (config.stereoImager.lowWidth !== 1 || config.stereoImager.midWidth !== 1 || config.stereoImager.highWidth !== 1)) {
        const imager = advancedDspService.createStereoImager(offlineCtx, config.stereoImager);
        currentNode.connect(imager.input); currentNode = imager.output;
    }

    if (config.motionReverb && config.motionReverb.mix > 0) {
        const verb = advancedDspService.createMotionReverb(offlineCtx, config.motionReverb);
        currentNode.connect(verb.input); currentNode = verb.output;
    }

    // Only apply limiter if explicitly requested
    if (config.limiter) {
        const limiter = offlineCtx.createDynamicsCompressor();
        limiter.threshold.value = config.limiter.threshold ?? -1;
        limiter.knee.value = 0;
        limiter.ratio.value = config.limiter.ratio ?? 20;
        limiter.attack.value = config.limiter.attack ?? 0.0005; // 0.5ms for brick-wall limiting
        limiter.release.value = config.limiter.release ?? 0.08;
        currentNode.connect(limiter); currentNode = limiter;
    }

    // Only apply output trim if explicitly set (default 0dB = no change)
    if (config.outputTrimDb !== undefined && config.outputTrimDb !== 0) {
        const outputTrim = offlineCtx.createGain();
        outputTrim.gain.value = dbToLinear(config.outputTrimDb);
        currentNode.connect(outputTrim); currentNode = outputTrim;
    }

    currentNode.connect(offlineCtx.destination);

    return await offlineCtx.startRendering();
  }

  setInputTrim(db: number = -3) {
      if (!this.liveNodes) return;
      try {
        const linearGain = dbToLinear(clamp(db, -24, 6));
        this.liveNodes.inputTrim.gain.setTargetAtTime(linearGain, this.audioContext.currentTime, 0.02);
      } catch (e) { console.error('[audioEngine] setInputTrim failed', e); }
  }
  
  setOutputTrim(db: number = -1) {
    if (!this.liveNodes) return;
    try {
      const linearGain = dbToLinear(clamp(db, -24, 0));
      this.liveNodes.outputTrim.gain.setTargetAtTime(linearGain, this.audioContext.currentTime, 0.02);
    } catch (e) { console.error('[audioEngine] setOutputTrim failed', e); }
  }

  setLimiter(config?: LimiterConfig) {
    if (!this.liveNodes) return;
    try {
        this.liveNodes.outputLimiter.threshold.setTargetAtTime(clamp(config?.threshold ?? -0.8, -12, 0), this.audioContext.currentTime, 0.02);
        this.liveNodes.outputLimiter.knee.setTargetAtTime(0, this.audioContext.currentTime, 0.02);
        this.liveNodes.outputLimiter.ratio.setTargetAtTime(clamp(config?.ratio ?? 20, 1, 20), this.audioContext.currentTime, 0.02);
        this.liveNodes.outputLimiter.attack.setTargetAtTime(config?.attack ?? 0.0005, this.audioContext.currentTime, 0.02); // 0.5ms for brick-wall limiting
        this.liveNodes.outputLimiter.release.setTargetAtTime(clamp(config?.release ?? 0.08, 0.01, 1), this.audioContext.currentTime, 0.02);
    } catch (e) { console.error('[audioEngine] setLimiter failed', e); }
  }
  
  setStaticEQ(settings?: EQSettings) {
    if (!this.liveNodes) return;
    try {
        this.liveNodes.staticEQ.forEach((filter, i) => {
            const band = settings?.[i];
            if (band) {
                filter.type = mapFilterType(band.type);
                filter.frequency.setTargetAtTime(clamp(band.frequency, 20, 20000), this.audioContext.currentTime, 0.02);
                filter.gain.setTargetAtTime(clamp(band.gain, -18, 18), this.audioContext.currentTime, 0.02);
                if (band.q) filter.Q.setTargetAtTime(clamp(band.q, 0.1, 18), this.audioContext.currentTime, 0.02);
            } else {
                filter.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.02);
            }
        });
    } catch (e) { console.error('[audioEngine] setStaticEQ failed', e); }
  }
  
  setCompression(config?: Partial<CompressionPreset>) {
    if (!this.liveNodes) return;
    try {
        const t = config?.threshold ?? -24;
        const r = config?.ratio ?? 2;
        const a = config?.attack ?? 0.003;
        const rel = config?.release ?? 0.25;
        const mg = config?.makeupGain ?? 0;

        this.liveNodes.mainComp.threshold.setTargetAtTime(clamp(t, -100, 0), this.audioContext.currentTime, 0.02);
        this.liveNodes.mainComp.ratio.setTargetAtTime(clamp(r, 1, 20), this.audioContext.currentTime, 0.02);
        this.liveNodes.mainComp.attack.setTargetAtTime(clamp(a, 0, 1), this.audioContext.currentTime, 0.02);
        this.liveNodes.mainComp.release.setTargetAtTime(clamp(rel, 0.01, 1), this.audioContext.currentTime, 0.02);
        this.liveNodes.mainComp.knee.setTargetAtTime(6, this.audioContext.currentTime, 0.02); // Soft knee for transparent mastering

        const makeupGainLinear = dbToLinear(clamp(mg, -12, 24));
        this.liveNodes.compMakeupGain.gain.setTargetAtTime(makeupGainLinear, this.audioContext.currentTime, 0.02);
    } catch (e) { console.error('[audioEngine] setCompression failed', e); }
  }
  
  setMultibandCompression(config?: MultibandCompressionConfig) {
      if (!this.liveNodes?.multibandCompressor || !config) return;
      try {
          const { low, mid, high, crossovers } = config;
          if (low) this.liveNodes.multibandCompressor.setLow(low.threshold ?? -24, low.ratio ?? 2, low.attack ?? 0.003, low.release ?? 0.25, low.makeupGain ?? 0);
          if (mid) this.liveNodes.multibandCompressor.setMid(mid.threshold ?? -24, mid.ratio ?? 2, mid.attack ?? 0.003, mid.release ?? 0.25, mid.makeupGain ?? 0);
          if (high) this.liveNodes.multibandCompressor.setHigh(high.threshold ?? -24, high.ratio ?? 2, high.attack ?? 0.003, high.release ?? 0.25, high.makeupGain ?? 0);
          if (crossovers) this.liveNodes.multibandCompressor.setCrossovers(crossovers[0], crossovers[1]);
      } catch (e) { console.error('[audioEngine] setMultibandCompression failed', e); }
  }

  setSaturation(config?: SaturationConfig) { if (this.liveNodes?.saturation && config) { this.liveNodes.saturation.setDrive(config.amount); this.liveNodes.saturation.setMix(config.mix ?? 1); this.liveNodes.saturation.setMode(config.type); } }
  setTransientShaper(config?: TransientShaperConfig) { if (this.liveNodes?.transientShaper && config) { this.liveNodes.transientShaper.setAttack(config.attack); this.liveNodes.transientShaper.setSustain(config.sustain); this.liveNodes.transientShaper.setMix(config.mix); } }
  setStereoImager(config?: StereoImagerConfig) { if (this.liveNodes?.stereoImager && config) { this.liveNodes.stereoImager.setLowWidth(config.lowWidth); this.liveNodes.stereoImager.setMidWidth(config.midWidth); this.liveNodes.stereoImager.setHighWidth(config.highWidth); this.liveNodes.stereoImager.setCrossovers(config.crossovers[0], config.crossovers[1]); } }
  setDeEsser(config?: DeEsserConfig) { if (this.liveNodes?.deEsser && config) { this.liveNodes.deEsser.setFrequency(config.frequency); this.liveNodes.deEsser.setThreshold(config.threshold); this.liveNodes.deEsser.setIntensity(config.amount); } }
  setDynamicEQ(config?: DynamicEQConfig) { if (this.liveNodes?.dynamicEq && config) { config.forEach((band, i) => this.liveNodes?.dynamicEq?.updateBand(i, band)); } }
  setMotionReverb(config?: ReverbConfig) { if (this.liveNodes?.motionReverb && config) { this.liveNodes.motionReverb.setMix(config.mix); this.liveNodes.motionReverb.setDucking(config.duckingAmount ?? 0); if (config.motion) { this.liveNodes.motionReverb.setDepth(config.motion.depth); this.liveNodes.motionReverb.setPulse(config.motion.bpm); } } }

  setMultibandLow(threshold: number, ratio: number, attack: number, release: number, makeupGain: number) { if(this.liveNodes?.multibandCompressor) this.liveNodes.multibandCompressor.setLow(threshold, ratio, attack, release, makeupGain); }
  setMultibandMid(threshold: number, ratio: number, attack: number, release: number, makeupGain: number) { if(this.liveNodes?.multibandCompressor) this.liveNodes.multibandCompressor.setMid(threshold, ratio, attack, release, makeupGain); }
  setMultibandHigh(threshold: number, ratio: number, attack: number, release: number, makeupGain: number) { if(this.liveNodes?.multibandCompressor) this.liveNodes.multibandCompressor.setHigh(threshold, ratio, attack, release, makeupGain); }
  setMultibandCrossovers(c1: number, c2: number) { if(this.liveNodes?.multibandCompressor) this.liveNodes.multibandCompressor.setCrossovers(c1, c2); }
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
    if (this.isPlaying && this.buffer) {
      return clamp(this.audioContext.currentTime - this.startedAt, 0, this.buffer.duration);
    }
    return this.pausedAt;
  }
  
  getAnalyserNode(): AnalyserNode {
    return this.analyser;
  }

  getDuration(): number {
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

    // For stem preview, bypass processing and connect directly
    this.source.connect(this.masterInput);
    try { this.masterInput.disconnect(this.dryGain); } catch (e) {}
    this.masterInput.connect(this.dryGain);

    // Force dry signal for stem preview
    this.dryGain.gain.setTargetAtTime(1, this.audioContext.currentTime, 0.01);
    this.wetGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.01);

    this.startedAt = this.audioContext.currentTime;
    this.pausedAt = 0;
    this.source.start(0);
    this.isPlaying = true;
  }

  analyzeStaticMetrics(bufferOverride?: AudioBuffer): AudioMetrics {
      return mixAnalysisService.analyzeStaticMetrics(bufferOverride); 
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
      if (pluginNode) {
        currentSource.connect(pluginNode);
        currentSource = pluginNode;
      }
    }

    // Connect final plugin to output
    currentSource.connect(outputNode);
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