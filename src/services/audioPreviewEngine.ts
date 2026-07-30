/**
 * Echo Sound Lab — Real-Time Audio Preview Engine
 * Stream audio processing in real-time using Web Audio API + WebWorker
 * Lets users hear mix/master changes instantly without waiting
 */

export interface PreviewConfig {
  sourceUrl: string;
  processingType: 'mixing' | 'mastering' | 'enhancement';
  eq?: { frequency: number; gain: number; q: number }[];
  compression?: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
  };
  reverb?: { amount: number; decay: number };
  delay?: { time: number; feedback: number };
}

export class AudioPreviewEngine {
  private audioContext: AudioContext | null = null;
  private sourceBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private processingNodes: Map<string, AudioNode> = new Map();
  private isPlaying = false;
  private startTime = 0;
  private pausedTime = 0;

  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
    }
  }

  async loadAudio(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) await this.initialize();

    try {
      this.sourceBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error('Failed to decode audio:', error);
    }
  }

  /**
   * Create real-time EQ filter
   */
  private createEQFilter(config: PreviewConfig['eq']): BiquadFilterNode {
    const filter = this.audioContext!.createBiquadFilter();

    if (!config || config.length === 0) {
      return filter;
    }

    // For simplicity, apply first band
    const band = config[0];
    filter.type = 'peaking';
    filter.frequency.value = band.frequency;
    filter.gain.value = band.gain;
    filter.Q.value = band.q;

    return filter;
  }

  /**
   * Create real-time compressor
   */
  private createCompressor(config: PreviewConfig['compression']): DynamicsCompressorNode {
    const compressor = this.audioContext!.createDynamicsCompressor();

    if (config) {
      compressor.threshold.value = config.threshold;
      compressor.ratio.value = config.ratio;
      compressor.attack.value = config.attack / 1000; // Convert ms to seconds
      compressor.release.value = config.release / 1000;
      compressor.knee.value = 6; // Soft knee
    }

    return compressor;
  }

  /**
   * Create real-time reverb (using ConvolverNode)
   */
  private async createReverb(config: PreviewConfig['reverb']): Promise<ConvolverNode> {
    const convolver = this.audioContext!.createConvolver();

    if (config) {
      // Generate simple impulse response
      const length = this.audioContext!.sampleRate * config.decay;
      const impulse = this.audioContext!.createBuffer(2, length, this.audioContext!.sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);

      for (let i = 0; i < length; i++) {
        left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }

      convolver.buffer = impulse;

      // Dry/wet mix
      const gainNode = this.audioContext!.createGain();
      gainNode.gain.value = config.amount || 0.3;

      convolver.connect(gainNode);
      this.processingNodes.set('reverb-gain', gainNode);
    }

    return convolver;
  }

  /**
   * Create real-time delay (using DelayNode)
   */
  private createDelay(config: PreviewConfig['delay']): DelayNode {
    const delayNode = this.audioContext!.createDelay();

    if (config) {
      delayNode.delayTime.value = config.time / 1000; // Convert ms to seconds
      const feedback = this.audioContext!.createGain();
      feedback.gain.value = config.feedback || 0.3;
      delayNode.connect(feedback);
      feedback.connect(delayNode); // Create feedback loop
    }

    return delayNode;
  }

  /**
   * Build processing chain based on config
   */
  async buildProcessingChain(config: PreviewConfig): Promise<void> {
    if (!this.audioContext || !this.sourceBuffer) {
      throw new Error('Audio context or source buffer not initialized');
    }

    // Clear existing nodes
    this.processingNodes.forEach((node) => {
      try {
        node.disconnect();
      } catch (e) {
        // Already disconnected
      }
    });
    this.processingNodes.clear();

    // Create source
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.sourceBuffer;

    let previousNode: AudioNode = this.sourceNode;

    // Build chain based on type
    if (config.processingType === 'mixing' || config.processingType === 'enhancement') {
      // EQ → Compression → Reverb → Delay → Output
      if (config.eq) {
        const eq = this.createEQFilter(config.eq);
        previousNode.connect(eq);
        previousNode = eq;
        this.processingNodes.set('eq', eq);
      }

      if (config.compression) {
        const compressor = this.createCompressor(config.compression);
        previousNode.connect(compressor);
        previousNode = compressor;
        this.processingNodes.set('compressor', compressor);
      }

      if (config.reverb) {
        const reverb = await this.createReverb(config.reverb);
        previousNode.connect(reverb);
        previousNode = reverb;
        this.processingNodes.set('reverb', reverb);
      }

      if (config.delay) {
        const delay = this.createDelay(config.delay);
        previousNode.connect(delay);
        previousNode = delay;
        this.processingNodes.set('delay', delay);
      }
    } else if (config.processingType === 'mastering') {
      // Mastering chain: EQ → Compression → Limiting
      if (config.eq) {
        const eq = this.createEQFilter(config.eq);
        previousNode.connect(eq);
        previousNode = eq;
        this.processingNodes.set('eq', eq);
      }

      if (config.compression) {
        const compressor = this.createCompressor(config.compression);
        previousNode.connect(compressor);
        previousNode = compressor;
        this.processingNodes.set('compressor', compressor);
      }

      // Add limiter for mastering
      const limiter = this.audioContext.createDynamicsCompressor();
      limiter.threshold.value = -0.3;
      limiter.ratio.value = 10; // Hard limiting
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      previousNode.connect(limiter);
      previousNode = limiter;
      this.processingNodes.set('limiter', limiter);
    }

    // Connect to destination (speaker)
    previousNode.connect(this.audioContext.destination);
  }

  /**
   * Play audio with current processing chain
   */
  play(): void {
    if (!this.sourceNode || !this.audioContext) {
      throw new Error('Audio not loaded');
    }

    if (this.isPlaying) return;

    if (this.pausedTime > 0) {
      // Resume from paused position
      this.sourceNode.start(0, this.pausedTime);
      this.startTime = this.audioContext.currentTime - this.pausedTime;
    } else {
      this.sourceNode.start(0);
      this.startTime = this.audioContext.currentTime;
    }

    this.isPlaying = true;
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.sourceNode || !this.audioContext) return;

    this.pausedTime = this.audioContext.currentTime - this.startTime;
    this.sourceNode.stop();
    this.isPlaying = false;
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.sourceNode) return;

    try {
      this.sourceNode.stop();
    } catch (e) {
      // Already stopped
    }

    this.pausedTime = 0;
    this.isPlaying = false;
  }

  /**
   * Get current playback position
   */
  getCurrentTime(): number {
    if (!this.audioContext) return 0;
    return this.audioContext.currentTime - this.startTime;
  }

  /**
   * Get source duration
   */
  getDuration(): number {
    return this.sourceBuffer?.duration || 0;
  }

  /**
   * Get metering data for visualization
   */
  getMeters(): { peak: number; rms: number } {
    // Simplified metering - would need real-time analysis with AnalyserNode
    const analyser = this.audioContext!.createAnalyser();
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const peak = Math.max(...dataArray) / 255;
    const rms = Math.sqrt(
      dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length
    ) / 255;

    return {
      peak: 20 * Math.log10(peak || 0.001),
      rms: 20 * Math.log10(rms || 0.001),
    };
  }

  /**
   * Update single processing parameter in real-time
   */
  updateParameter(paramPath: string, value: number): void {
    const parts = paramPath.split('.');
    const nodeType = parts[0];
    const paramName = parts[1];

    const node = this.processingNodes.get(nodeType);
    if (!node) return;

    if (nodeType === 'eq' && 'frequency' in node) {
      const eq = node as BiquadFilterNode;
      if (paramName === 'gain') eq.gain.setValueAtTime(value, this.audioContext!.currentTime);
      if (paramName === 'frequency') eq.frequency.setValueAtTime(value, this.audioContext!.currentTime);
    }

    if (nodeType === 'compressor' && 'threshold' in node) {
      const comp = node as DynamicsCompressorNode;
      if (paramName === 'threshold') comp.threshold.setValueAtTime(value, this.audioContext!.currentTime);
      if (paramName === 'ratio') comp.ratio.setValueAtTime(value, this.audioContext!.currentTime);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Already stopped
      }
    }

    this.processingNodes.forEach((node) => {
      try {
        node.disconnect();
      } catch (e) {
        // Already disconnected
      }
    });

    this.processingNodes.clear();
    this.sourceBuffer = null;
    this.sourceNode = null;
  }
}

// Export singleton instance
export const audioPreviewEngine = new AudioPreviewEngine();
