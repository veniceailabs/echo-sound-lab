/**
 * SourceAwareAnalysisService — Phase 2B
 * Detects recording artifacts and generates correction EQ chains
 */

import { EQSettings } from '../types';

export type ArtifactType =
  | 'dc_offset'
  | 'bandwidth_limited'
  | 'boxy_resonance'
  | 'harsh_presence'
  | 'noise_floor';

export interface ArtifactFlag {
  type: ArtifactType;
  severity: 'minor' | 'moderate' | 'significant';
  description: string;
  detailHz?: number; // for resonance/presence
  value?: number;    // measured value
}

export type OverallQuality = 'clean' | 'minor_issues' | 'needs_correction';

export interface SourceAwareReport {
  artifacts: ArtifactFlag[];
  correctionChain: EQSettings;
  overallQuality: OverallQuality;
}

/** Compute FFT magnitude array from audio samples */
function computeFFT(
  data: Float32Array,
  fftSize: number = 4096
): { magnitudes: Float32Array; binHz: number } {
  const sampleRate = 44100; // default — overridden by caller
  const binHz = sampleRate / fftSize;

  // Simple DFT magnitude approximation using overlapping windows
  const magnitudes = new Float32Array(fftSize / 2);
  const limit = Math.min(data.length, fftSize);

  // Apply Hann window and compute basic power
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let i = 0; i < limit; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (limit - 1));
    re[i] = data[i] * w;
  }

  // Lightweight DFT for small fftSize - use FFT approximation
  for (let k = 0; k < fftSize / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < limit; n += 4) { // stride=4 for speed
      const angle = (2 * Math.PI * k * n) / fftSize;
      real += re[n] * Math.cos(angle);
      imag -= re[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }

  return { magnitudes, binHz };
}

function computeFFTWithSampleRate(
  data: Float32Array,
  sampleRate: number,
  fftSize: number = 4096
): { magnitudes: Float32Array; binHz: number } {
  const binHz = sampleRate / fftSize;
  const magnitudes = new Float32Array(fftSize / 2);
  const limit = Math.min(data.length, fftSize);

  const re = new Float32Array(fftSize);

  for (let i = 0; i < limit; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (limit - 1));
    re[i] = data[i] * w;
  }

  // Stride FFT approximation
  for (let k = 0; k < fftSize / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < limit; n += 8) {
      const angle = (2 * Math.PI * k * n) / fftSize;
      real += re[n] * Math.cos(angle);
      imag -= re[n] * Math.sin(angle);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }

  return { magnitudes, binHz };
}

function computeRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

function computeMean(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / data.length;
}

export class SourceAwareAnalysisService {
  /**
   * Analyze an AudioBuffer for recording artifacts.
   */
  async analyze(buffer: AudioBuffer): Promise<SourceAwareReport> {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);
    const artifacts: ArtifactFlag[] = [];
    const correctionChain: EQSettings = [];

    // 1. DC Offset detection
    const mean = computeMean(channelData);
    if (Math.abs(mean) > 0.001) {
      artifacts.push({
        type: 'dc_offset',
        severity: Math.abs(mean) > 0.01 ? 'significant' : 'minor',
        description: `DC offset detected: ${(mean * 1000).toFixed(2)}mV. This can cause clicks on export.`,
        value: mean,
      });
      // DC offset correction is handled in applySourceCorrection via mean subtraction
      // EQ equivalent: very aggressive high-pass below 5Hz
      correctionChain.push({
        frequency: 5,
        gain: -40,
        type: 'highpass',
      });
    }

    // 2. Bandwidth limiting detection
    const { magnitudes, binHz } = computeFFTWithSampleRate(channelData, sampleRate, 4096);
    const rolloffBin8k = Math.floor(8000 / binHz);
    const rolloffBin16k = Math.floor(16000 / binHz);

    let energyAbove8k = 0;
    let energyTotal = 0;
    for (let i = 0; i < magnitudes.length; i++) {
      energyTotal += magnitudes[i];
      if (i >= rolloffBin8k) energyAbove8k += magnitudes[i];
    }

    const ratioAbove8k = energyTotal > 0 ? energyAbove8k / energyTotal : 0;
    if (ratioAbove8k < 0.02 && energyTotal > 0) {
      artifacts.push({
        type: 'bandwidth_limited',
        severity: 'moderate',
        description: 'Limited bandwidth detected — source may be from a phone or laptop mic. High-frequency extension missing above 8kHz.',
        value: ratioAbove8k,
      });
      // Gentle high-shelf boost to compensate
      correctionChain.push({
        frequency: 8000,
        gain: 2.5,
        type: 'highshelf',
      });
    }

    // 3. Boxy resonance detection (200–500Hz)
    const boxyBinStart = Math.floor(200 / binHz);
    const boxyBinEnd = Math.floor(500 / binHz);
    let peakMag = 0;
    let peakBin = boxyBinStart;

    // Compute local average for comparison
    const contextBinStart = Math.max(0, boxyBinStart - 20);
    const contextBinEnd = Math.min(magnitudes.length - 1, boxyBinEnd + 20);
    let contextSum = 0;
    let contextCount = 0;
    for (let i = contextBinStart; i <= contextBinEnd; i++) {
      if (i < boxyBinStart || i > boxyBinEnd) {
        contextSum += magnitudes[i];
        contextCount++;
      }
    }
    const contextAvg = contextCount > 0 ? contextSum / contextCount : 1;

    for (let i = boxyBinStart; i <= boxyBinEnd; i++) {
      if (magnitudes[i] > peakMag) {
        peakMag = magnitudes[i];
        peakBin = i;
      }
    }

    if (contextAvg > 0 && peakMag / contextAvg > 3.5) {
      const peakHz = Math.round(peakBin * binHz);
      artifacts.push({
        type: 'boxy_resonance',
        severity: peakMag / contextAvg > 6 ? 'significant' : 'moderate',
        description: `Narrow resonance at ${peakHz}Hz (${(peakMag / contextAvg).toFixed(1)}x above local average). Likely room mode or proximity effect.`,
        detailHz: peakHz,
        value: peakMag / contextAvg,
      });
      correctionChain.push({
        frequency: peakHz,
        gain: -3.5,
        type: 'peaking',
        q: 2.5,
      } as any);
    }

    // 4. Harsh presence peak (2–6kHz)
    const harshBinStart = Math.floor(2000 / binHz);
    const harshBinEnd = Math.floor(6000 / binHz);
    let harshPeakMag = 0;
    let harshPeakBin = harshBinStart;

    // Local average for 2-6kHz context
    const harshContextStart = Math.max(0, harshBinStart - 30);
    const harshContextEnd = Math.min(magnitudes.length - 1, harshBinEnd + 30);
    let harshContextSum = 0;
    let harshContextCount = 0;
    for (let i = harshContextStart; i <= harshContextEnd; i++) {
      if (i < harshBinStart || i > harshBinEnd) {
        harshContextSum += magnitudes[i];
        harshContextCount++;
      }
    }
    const harshAvg = harshContextCount > 0 ? harshContextSum / harshContextCount : 1;

    for (let i = harshBinStart; i <= harshBinEnd; i++) {
      if (magnitudes[i] > harshPeakMag) {
        harshPeakMag = magnitudes[i];
        harshPeakBin = i;
      }
    }

    if (harshAvg > 0 && harshPeakMag / harshAvg > 4) {
      const harshHz = Math.round(harshPeakBin * binHz);
      artifacts.push({
        type: 'harsh_presence',
        severity: 'moderate',
        description: `Harsh presence peak at ${harshHz}Hz. Can cause listener fatigue on extended playback.`,
        detailHz: harshHz,
        value: harshPeakMag / harshAvg,
      });
      correctionChain.push({
        frequency: harshHz,
        gain: -2.5,
        type: 'peaking',
        q: 1.8,
      } as any);
    }

    // 5. Noise floor detection (last 500ms)
    const tailSamples = Math.floor(sampleRate * 0.5);
    const tailStart = Math.max(0, channelData.length - tailSamples);
    const tailData = channelData.slice(tailStart);
    const tailRMS = computeRMS(tailData);
    const tailDbFS = 20 * Math.log10(tailRMS + 1e-10);

    if (tailDbFS > -60) {
      artifacts.push({
        type: 'noise_floor',
        severity: tailDbFS > -45 ? 'significant' : 'minor',
        description: `Noise floor at ${tailDbFS.toFixed(1)}dBFS. Audible hiss or room noise may compete with quiet passages.`,
        value: tailDbFS,
      });
    }

    // Determine overall quality
    const hasSignificant = artifacts.some(a => a.severity === 'significant');
    const hasModerate = artifacts.some(a => a.severity === 'moderate');
    let overallQuality: OverallQuality = 'clean';
    if (hasSignificant || artifacts.length >= 3) {
      overallQuality = 'needs_correction';
    } else if (hasModerate || artifacts.length >= 1) {
      overallQuality = 'minor_issues';
    }

    return {
      artifacts,
      correctionChain,
      overallQuality,
    };
  }

  /**
   * Apply the correction chain from a SourceAwareReport to an AudioBuffer.
   * Returns a corrected AudioBuffer.
   */
  async applySourceCorrection(
    buffer: AudioBuffer,
    report: SourceAwareReport
  ): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();

    // Apply DC offset removal by modifying buffer copy
    const correctedBuffer = offlineCtx.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const hasDCOffset = report.artifacts.some(a => a.type === 'dc_offset');

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = correctedBuffer.getChannelData(ch);
      let mean = 0;

      if (hasDCOffset) {
        for (let i = 0; i < input.length; i++) mean += input[i];
        mean /= input.length;
      }

      for (let i = 0; i < input.length; i++) {
        output[i] = input[i] - mean;
      }
    }

    source.buffer = correctedBuffer;

    // Chain EQ filters
    let lastNode: AudioNode = source;

    // Only apply non-DC EQ bands (highpass at 5Hz is handled by DC subtraction)
    const eqBands = report.correctionChain.filter(band => band.frequency > 5);

    for (const band of eqBands) {
      const filter = offlineCtx.createBiquadFilter();
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;

      if (band.type === 'lowshelf') {
        filter.type = 'lowshelf';
      } else if (band.type === 'highshelf') {
        filter.type = 'highshelf';
      } else if (band.type === 'highpass') {
        filter.type = 'highpass';
        filter.Q.value = 0.707;
      } else {
        filter.type = 'peaking';
        filter.Q.value = (band as any).q ?? 1.4;
      }

      lastNode.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(offlineCtx.destination);
    source.start(0);

    return await offlineCtx.startRendering();
  }
}

export const sourceAwareAnalysis = new SourceAwareAnalysisService();
export default sourceAwareAnalysis;
