/**
 * SPECTRAL ANALYZER
 * Real-time frequency analysis using Web Audio API
 *
 * Analyzes AudioBuffers to detect:
 *  - Clipping (samples >= 0dBFS)
 *  - DC offset (static bias in signal)
 *  - Low-end rumble (energy < 40Hz)
 *  - Spectral centroid (brightness/color of sound)
 *  - Peak frequency (fundamental energy concentration)
 */

export interface SpectralProfile {
  // Time Domain
  peakLevel: number;              // Highest sample magnitude (0.0-1.0)
  truePeakDB: number;             // Peak in dBFS
  clippingDetected: boolean;      // Any samples >= 1.0?
  clippingEvents: number;         // Count of clipped samples
  dcOffset: number;               // DC bias (-1.0 to 1.0)
  dcOffsetDetected: boolean;      // Significant DC detected?

  // Frequency Domain
  spectralCentroid: number;       // Weighted frequency center (Hz)
  peakFrequency: number;          // Frequency with most energy (Hz)
  lowEndEnergy: number;           // Energy ratio in sub-bass (0-1)
  hasLowEndRumble: boolean;       // Significant energy < 40Hz?

  // Computed Metrics
  loudnessLUFS: number;           // Approximated (for full calc, use libebur128)
  crestFactor: number;            // Peak-to-RMS ratio (dynamics)
  silenceDetected: boolean;       // Almost no energy?

  // Analysis metadata
  sampleRate: number;
  duration: number;               // ms
}

/**
 * SpectralAnalyzer: Main analysis engine
 */
export class SpectralAnalyzer {
  /**
   * Analyze a complete audio buffer
   * Returns forensic metrics for signal intelligence
   */
  public static analyze(audioBuffer: AudioBuffer): SpectralProfile {
    const result: SpectralProfile = {
      peakLevel: 0,
      truePeakDB: -Infinity,
      clippingDetected: false,
      clippingEvents: 0,
      dcOffset: 0,
      dcOffsetDetected: false,

      spectralCentroid: 0,
      peakFrequency: 0,
      lowEndEnergy: 0,
      hasLowEndRumble: false,

      loudnessLUFS: 0,
      crestFactor: 0,
      silenceDetected: false,

      sampleRate: audioBuffer.sampleRate,
      duration: (audioBuffer.length / audioBuffer.sampleRate) * 1000
    };

    // Analyze each channel and merge (for stereo, average L+R)
    const channelCount = audioBuffer.numberOfChannels;
    const channelProfiles: SpectralProfile[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const channel = audioBuffer.getChannelData(ch);
      channelProfiles.push(this.analyzeChannel(channel, audioBuffer.sampleRate));
    }

    // Merge results (average metrics across channels)
    return this.mergeChannelProfiles(channelProfiles, result);
  }

  /**
   * Analyze a single channel (Float32Array)
   */
  private static analyzeChannel(
    channelData: Float32Array,
    sampleRate: number
  ): SpectralProfile {
    const result: SpectralProfile = {
      peakLevel: 0,
      truePeakDB: -Infinity,
      clippingDetected: false,
      clippingEvents: 0,
      dcOffset: 0,
      dcOffsetDetected: false,

      spectralCentroid: 0,
      peakFrequency: 0,
      lowEndEnergy: 0,
      hasLowEndRumble: false,

      loudnessLUFS: 0,
      crestFactor: 0,
      silenceDetected: false,

      sampleRate,
      duration: (channelData.length / sampleRate) * 1000
    };

    // ========== TIME DOMAIN ANALYSIS ==========

    let peakLevel = 0;
    let dcSum = 0;
    let rmsSum = 0;
    let silentSamples = 0;

    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];

      // Peak detection
      const absSample = Math.abs(sample);
      if (absSample > peakLevel) {
        peakLevel = absSample;
      }

      // Clipping detection
      if (absSample >= 1.0) {
        result.clippingEvents++;
        result.clippingDetected = true;
      }

      // DC offset (running average of signal)
      dcSum += sample;

      // RMS for loudness approximation
      rmsSum += sample * sample;

      // Silence detection
      if (absSample < 0.001) {
        silentSamples++;
      }
    }

    result.peakLevel = peakLevel;
    result.truePeakDB = 20 * Math.log10(Math.max(peakLevel, 0.00001));

    // DC Offset Analysis
    result.dcOffset = dcSum / channelData.length;
    result.dcOffsetDetected = Math.abs(result.dcOffset) > 0.001;

    // RMS and Crest Factor
    const rms = Math.sqrt(rmsSum / channelData.length);
    result.crestFactor = rms > 0 ? peakLevel / rms : 0;

    // Approximate LUFS from RMS (VERY simplified, real LUFS uses ITU-R BS.1770-4)
    const rmsDB = 20 * Math.log10(Math.max(rms, 0.00001));
    result.loudnessLUFS = rmsDB - 23; // Rough approximation

    // Silence Detection
    result.silenceDetected = silentSamples / channelData.length > 0.95;

    // ========== FREQUENCY DOMAIN ANALYSIS (FFT) ==========

    // Find loudest chunk for FFT analysis (avoid silence)
    const chunkSize = 4096;
    const loudIndex = this.findLoudestChunk(channelData, chunkSize);
    const fftWindow = channelData.slice(loudIndex, loudIndex + chunkSize);

    // Apply Hann window to reduce spectral leakage
    const windowedData = this.applyHannWindow(fftWindow);

    // Compute FFT using simple Radix-2 DFT
    const spectrum = this.computeFFT(windowedData);

    // Extract spectral features
    const spectralData = this.analyzeSpectrum(spectrum, sampleRate);
    result.spectralCentroid = spectralData.centroid;
    result.peakFrequency = spectralData.peakFreq;
    result.lowEndEnergy = spectralData.lowEndRatio;
    result.hasLowEndRumble = spectralData.lowEndRatio > 0.3;

    return result;
  }

  /**
   * Find the loudest chunk of audio (best representation)
   */
  private static findLoudestChunk(data: Float32Array, chunkSize: number): number {
    let maxEnergy = 0;
    let maxIndex = 0;

    for (let i = 0; i < data.length - chunkSize; i += chunkSize) {
      let energy = 0;
      for (let j = 0; j < chunkSize; j++) {
        energy += Math.abs(data[i + j]);
      }
      if (energy > maxEnergy) {
        maxEnergy = energy;
        maxIndex = i;
      }
    }

    return maxIndex;
  }

  /**
   * Apply Hann window to reduce spectral leakage
   */
  private static applyHannWindow(data: Float32Array): Float32Array {
    const result = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (data.length - 1)));
      result[i] = data[i] * window;
    }
    return result;
  }

  /**
   * Simple FFT using Cooley-Tukey radix-2 algorithm
   * Input must be power-of-2 length
   */
  private static computeFFT(input: Float32Array): { real: number[]; imag: number[] } {
    const N = input.length;
    const real = new Array(N).fill(0);
    const imag = new Array(N).fill(0);

    // Bit-reversal permutation
    for (let i = 0; i < N; i++) {
      real[i] = input[this.bitReverse(i, Math.log2(N))];
      imag[i] = 0;
    }

    // Cooley-Tukey FFT
    let step = 1;
    while (step < N) {
      step *= 2;
      const halfStep = step / 2;
      const angleDelta = (-2 * Math.PI) / step;

      for (let i = 0; i < N; i += step) {
        let angle = 0;
        for (let j = 0; j < halfStep; j++) {
          const realW = Math.cos(angle);
          const imagW = Math.sin(angle);

          const k = i + j;
          const kPlus = i + j + halfStep;

          const realT = real[kPlus] * realW - imag[kPlus] * imagW;
          const imagT = real[kPlus] * imagW + imag[kPlus] * realW;

          real[kPlus] = real[k] - realT;
          imag[kPlus] = imag[k] - imagT;

          real[k] = real[k] + realT;
          imag[k] = imag[k] + imagT;

          angle += angleDelta;
        }
      }
    }

    return { real, imag };
  }

  /**
   * Bit reversal helper for FFT
   */
  private static bitReverse(index: number, bits: number): number {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (index & 1);
      index >>= 1;
    }
    return result;
  }

  /**
   * Extract spectral features from FFT result
   */
  private static analyzeSpectrum(
    spectrum: { real: number[]; imag: number[] },
    sampleRate: number
  ): { centroid: number; peakFreq: number; lowEndRatio: number } {
    const { real, imag } = spectrum;
    const N = real.length;
    const nyquist = sampleRate / 2;
    const freqPerBin = nyquist / (N / 2);

    let centroidNumerator = 0;
    let centroidDenominator = 0;
    let peakMagnitude = 0;
    let peakBin = 0;
    let lowEndEnergy = 0;
    let totalEnergy = 0;

    // Only analyze up to Nyquist (first half)
    for (let i = 0; i < N / 2; i++) {
      const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      const frequency = i * freqPerBin;

      // Track total energy
      totalEnergy += magnitude;

      // Spectral centroid (weighted average frequency)
      centroidNumerator += frequency * magnitude;
      centroidDenominator += magnitude;

      // Peak frequency
      if (magnitude > peakMagnitude) {
        peakMagnitude = magnitude;
        peakBin = i;
      }

      // Low-end rumble (< 80Hz, we'll say < 40Hz is aggressive rumble)
      if (frequency < 80) {
        lowEndEnergy += magnitude;
      }
    }

    return {
      centroid: centroidDenominator > 0 ? centroidNumerator / centroidDenominator : 0,
      peakFreq: peakBin * freqPerBin,
      lowEndRatio: totalEnergy > 0 ? lowEndEnergy / totalEnergy : 0
    };
  }

  /**
   * Merge channel profiles (for stereo, average)
   */
  private static mergeChannelProfiles(
    profiles: SpectralProfile[],
    template: SpectralProfile
  ): SpectralProfile {
    if (profiles.length === 0) return template;

    const merged: SpectralProfile = { ...template };

    // Average metrics across channels
    let peakLevel = 0;
    let clippingTotal = 0;
    let dcOffsetSum = 0;
    let centroidSum = 0;
    let peakFreqSum = 0;
    let lowEndSum = 0;
    let loudnessSum = 0;
    let crestFactorSum = 0;
    let clippingChannels = 0;
    let dcChannels = 0;
    let rumbleChannels = 0;

    for (const profile of profiles) {
      peakLevel = Math.max(peakLevel, profile.peakLevel);
      clippingTotal += profile.clippingEvents;
      dcOffsetSum += profile.dcOffset;
      centroidSum += profile.spectralCentroid;
      peakFreqSum += profile.peakFrequency;
      lowEndSum += profile.lowEndEnergy;
      loudnessSum += profile.loudnessLUFS;
      crestFactorSum += profile.crestFactor;

      if (profile.clippingDetected) clippingChannels++;
      if (profile.dcOffsetDetected) dcChannels++;
      if (profile.hasLowEndRumble) rumbleChannels++;
    }

    const ch = profiles.length;
    merged.peakLevel = peakLevel;
    merged.truePeakDB = 20 * Math.log10(Math.max(peakLevel, 0.00001));
    merged.clippingEvents = clippingTotal;
    merged.clippingDetected = clippingChannels > 0;
    merged.dcOffset = dcOffsetSum / ch;
    merged.dcOffsetDetected = dcChannels / ch > 0.5; // Majority of channels
    merged.spectralCentroid = centroidSum / ch;
    merged.peakFrequency = peakFreqSum / ch;
    merged.lowEndEnergy = lowEndSum / ch;
    merged.hasLowEndRumble = rumbleChannels / ch > 0.5;
    merged.loudnessLUFS = loudnessSum / ch;
    merged.crestFactor = crestFactorSum / ch;
    merged.silenceDetected = profiles.every(p => p.silenceDetected);

    return merged;
  }
}

/**
 * Singleton for convenient access
 */
export const spectralAnalyzer = new SpectralAnalyzer();
