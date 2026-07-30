/**
 * FFT ANALYZER SERVICE
 *
 * Sprint 2: Eyes (Synesthesia)
 * Real-time frequency domain analysis for visualization
 *
 * Extracts frequency bins from Web Audio AnalyserNode for:
 * - Waveform visualization
 * - Spectrogram (waterfall) display
 * - Piano roll peak detection
 * - Real-time frequency analysis
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

/**
 * Frequency bin data for visualization
 */
export interface FrequencyBinData {
  frequencies: number[];      // Hz for each bin
  magnitudes: number[];       // dB values (0-255 raw → normalized to dB)
  peaks: number[];           // Peak frequencies in this frame
  dominantFrequency: number; // Most prominent frequency
  timestamp: number;         // When this frame was captured
}

/**
 * Spectrogram frame (time-frequency representation)
 */
export interface SpectrogramFrame {
  timestamp: number;
  frequencies: number[];
  magnitudes: number[];      // dB (normalized)
  dominantFrequency: number;
}

/**
 * Waveform data for time-domain visualization
 */
export interface WaveformData {
  samples: number[];         // -1 to 1 range
  rms: number[];            // RMS energy per frame
  peaks: number[];          // Peak levels per frame
  duration: number;         // Total duration in ms
  sampleRate: number;
}

/**
 * FFT Analysis configuration
 */
export interface FFTAnalyzerConfig {
  fftSize: number;          // 256, 512, 1024, 2048, 4096, 8192, 16384, 32768
  smoothingTimeConstant: number; // 0.0 to 1.0 (higher = more smoothing)
  minDecibels: number;      // Minimum dB value (-100 to -30 typical)
  maxDecibels: number;      // Maximum dB value (0 to 10 typical)
  peakHoldFrames: number;   // How many frames to hold peak display
  frequencyScale: 'linear' | 'log'; // Frequency axis scale
}

/**
 * FFTAnalyzerService
 *
 * Provides real-time frequency analysis for visualization.
 * Works with Web Audio API AnalyserNode.
 */
class FFTAnalyzerService {
  private config: FFTAnalyzerConfig = {
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: 0,
    peakHoldFrames: 3,
    frequencyScale: 'log',
  };

  private dataArrays: Map<number, Uint8Array> = new Map();
  private peakHoldData: Map<number, { peaks: number[]; holdCounter: Uint8Array }> = new Map();

  /**
   * Initialize or update configuration
   */
  public configure(overrides: Partial<FFTAnalyzerConfig>): void {
    this.config = { ...this.config, ...overrides };
  }

  /**
   * Get or create typed array for FFT data
   */
  private getDataArray(fftSize: number): Uint8Array {
    if (!this.dataArrays.has(fftSize)) {
      this.dataArrays.set(fftSize, new Uint8Array(fftSize / 2));
    }
    return this.dataArrays.get(fftSize)!;
  }

  /**
   * Extract frequency bin data from AnalyserNode
   *
   * @param analyser - Web Audio AnalyserNode
   * @param sampleRate - Audio context sample rate
   * @returns Frequency bin data with peaks
   */
  public analyzeFrequencyBins(
    analyser: AnalyserNode,
    sampleRate: number
  ): FrequencyBinData {
    const fftSize = analyser.fftSize;
    const dataArray = this.getDataArray(fftSize);

    // Get raw frequency data (0-255)
    analyser.getByteFrequencyData(dataArray);

    // Calculate frequency resolution
    const freqResolution = sampleRate / fftSize;

    // Convert to dB scale and detect peaks
    const { frequencies, magnitudes, peaks, dominant } = this.processFrequencyData(
      dataArray,
      freqResolution,
      sampleRate
    );

    return {
      frequencies,
      magnitudes,
      peaks,
      dominantFrequency: dominant,
      timestamp: Date.now(),
    };
  }

  /**
   * Process raw frequency data: normalize to dB and detect peaks
   */
  private processFrequencyData(
    rawData: Uint8Array,
    freqResolution: number,
    maxFrequency: number
  ): {
    frequencies: number[];
    magnitudes: number[];
    peaks: number[];
    dominant: number;
  } {
    const frequencies: number[] = [];
    const magnitudes: number[] = [];
    let maxMagnitude = 0;
    let dominantIndex = 0;

    const { minDecibels, maxDecibels } = this.config;
    const dbRange = maxDecibels - minDecibels;

    // Process each frequency bin
    for (let i = 0; i < rawData.length; i++) {
      const rawValue = rawData[i];

      // Convert 0-255 to dB range
      // dB = minDecibels + (value/255) * (maxDecibels - minDecibels)
      const normalizedValue = rawValue / 255;
      const db = minDecibels + normalizedValue * dbRange;
      const clampedDb = Math.max(minDecibels, Math.min(maxDecibels, db));

      const frequency = i * freqResolution;

      // Skip sub-audible frequencies (below 20Hz)
      if (frequency < 20) continue;

      // Skip above Nyquist or max human hearing
      if (frequency > 20000) continue;

      frequencies.push(frequency);
      magnitudes.push(clampedDb);

      // Track dominant frequency
      if (clampedDb > maxMagnitude) {
        maxMagnitude = clampedDb;
        dominantIndex = frequencies.length - 1;
      }
    }

    // Detect peaks (local maxima)
    const peaks = this.detectPeaks(magnitudes, frequencies);

    const dominantFrequency = frequencies[dominantIndex] || 0;

    return {
      frequencies,
      magnitudes,
      peaks,
      dominant: dominantFrequency,
    };
  }

  /**
   * Detect spectral peaks (local maxima)
   */
  private detectPeaks(magnitudes: number[], frequencies: number[]): number[] {
    const peaks: number[] = [];
    const threshold = -40; // dB threshold for peak detection

    for (let i = 1; i < magnitudes.length - 1; i++) {
      const prev = magnitudes[i - 1];
      const current = magnitudes[i];
      const next = magnitudes[i + 1];

      // Is this a local maximum above threshold?
      if (current > prev && current > next && current > threshold) {
        peaks.push(frequencies[i]);
      }
    }

    return peaks;
  }

  /**
   * Extract time-domain waveform data from audio buffer
   *
   * @param audioBuffer - AudioBuffer to analyze
   * @param samplesPerFrame - How many samples per visualization frame
   * @returns Waveform visualization data
   */
  public analyzeWaveform(
    audioBuffer: AudioBuffer,
    samplesPerFrame: number = 512
  ): WaveformData {
    const channelData = audioBuffer.getChannelData(0); // Use first channel
    const frameCount = Math.ceil(channelData.length / samplesPerFrame);
    const samples: number[] = [];
    const peaks: number[] = [];
    const rms: number[] = [];

    for (let frame = 0; frame < frameCount; frame++) {
      const startIndex = frame * samplesPerFrame;
      const endIndex = Math.min(startIndex + samplesPerFrame, channelData.length);

      let maxPeak = 0;
      let sumSquares = 0;
      let frameSum = 0;

      for (let i = startIndex; i < endIndex; i++) {
        const sample = channelData[i];
        maxPeak = Math.max(maxPeak, Math.abs(sample));
        sumSquares += sample * sample;
        frameSum += sample;
      }

      const frameLength = endIndex - startIndex;
      const rmsValue = Math.sqrt(sumSquares / frameLength);
      const frameAvg = frameSum / frameLength;

      samples.push(frameAvg);
      peaks.push(maxPeak);
      rms.push(rmsValue);
    }

    return {
      samples,
      peaks,
      rms,
      duration: (audioBuffer.length / audioBuffer.sampleRate) * 1000,
      sampleRate: audioBuffer.sampleRate,
    };
  }

  /**
   * Build spectrogram over time (multiple FFT frames)
   *
   * @param analyser - AnalyserNode
   * @param sampleRate - Sample rate
   * @param frameCount - Number of frames to accumulate
   * @param delayMs - Delay between frames (for animation)
   * @returns Promise that resolves with accumulated frames
   */
  public async buildSpectrogram(
    analyser: AnalyserNode,
    sampleRate: number,
    frameCount: number = 100,
    delayMs: number = 50
  ): Promise<SpectrogramFrame[]> {
    const frames: SpectrogramFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      const binData = this.analyzeFrequencyBins(analyser, sampleRate);

      frames.push({
        timestamp: Date.now(),
        frequencies: binData.frequencies,
        magnitudes: binData.magnitudes,
        dominantFrequency: binData.dominantFrequency,
      });

      // Wait between frames
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return frames;
  }

  /**
   * Map frequency to X position (linear or logarithmic)
   */
  public frequencyToX(frequency: number, width: number, maxFrequency: number = 20000): number {
    if (this.config.frequencyScale === 'log') {
      // Logarithmic scale (20Hz to 20kHz)
      const minFreq = 20;
      return (Math.log10(frequency / minFreq) / Math.log10(maxFrequency / minFreq)) * width;
    } else {
      // Linear scale
      return (frequency / maxFrequency) * width;
    }
  }

  /**
   * Map magnitude (dB) to Y position (inverted for display)
   */
  public magnitudeToY(
    magnitude: number,
    height: number,
    minDb: number = -100,
    maxDb: number = 0
  ): number {
    // Normalize magnitude to 0-1 range
    const normalized = (magnitude - minDb) / (maxDb - minDb);
    const clamped = Math.max(0, Math.min(1, normalized));

    // Invert Y axis (higher magnitude = lower Y position)
    return (1 - clamped) * height;
  }

  /**
   * Smooth magnitude values over time
   * Useful for reducing noise in visualization
   */
  public smoothMagnitudes(
    magnitudes: number[],
    smoothingFactor: number = 0.7
  ): number[] {
    if (!this.peakHoldData.has(smoothingFactor)) {
      this.peakHoldData.set(smoothingFactor, {
        peaks: new Array(magnitudes.length).fill(-Infinity),
        holdCounter: new Uint8Array(magnitudes.length),
      });
    }

    const { peaks, holdCounter } = this.peakHoldData.get(smoothingFactor)!;
    const smoothed: number[] = [];

    for (let i = 0; i < magnitudes.length; i++) {
      // Update peak with hold time
      if (magnitudes[i] > peaks[i]) {
        peaks[i] = magnitudes[i];
        holdCounter[i] = this.config.peakHoldFrames;
      } else if (holdCounter[i] > 0) {
        holdCounter[i]--;
      } else {
        peaks[i] = magnitudes[i];
      }

      // Exponential smoothing
      smoothed[i] = smoothingFactor * peaks[i] + (1 - smoothingFactor) * magnitudes[i];
    }

    return smoothed;
  }

  /**
   * Downsample frequency data for performance
   * (e.g., for display on limited-width canvas)
   */
  public downsample(
    frequencies: number[],
    magnitudes: number[],
    targetBins: number
  ): { frequencies: number[]; magnitudes: number[] } {
    if (frequencies.length <= targetBins) {
      return { frequencies, magnitudes };
    }

    const ratio = frequencies.length / targetBins;
    const downsampled: { frequencies: number[]; magnitudes: number[] } = {
      frequencies: [],
      magnitudes: [],
    };

    for (let i = 0; i < targetBins; i++) {
      const startIdx = Math.floor(i * ratio);
      const endIdx = Math.floor((i + 1) * ratio);

      let maxMag = -Infinity;
      let freqAtMax = 0;

      for (let j = startIdx; j < endIdx && j < magnitudes.length; j++) {
        if (magnitudes[j] > maxMag) {
          maxMag = magnitudes[j];
          freqAtMax = frequencies[j];
        }
      }

      downsampled.frequencies.push(freqAtMax);
      downsampled.magnitudes.push(maxMag);
    }

    return downsampled;
  }

  /**
   * Clear cached data
   */
  public clear(): void {
    this.dataArrays.clear();
    this.peakHoldData.clear();
  }

  /**
   * Get current configuration
   */
  public getConfig(): FFTAnalyzerConfig {
    return { ...this.config };
  }
}

/**
 * Singleton instance
 */
export const fftAnalyzer = new FFTAnalyzerService();

export default fftAnalyzer;
