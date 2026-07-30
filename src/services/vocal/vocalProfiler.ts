import type { VocalIntakeConditioningReport, VocalIntakeBufferLike } from './intakeConditioning';

export type VocalVoiceType = 'bass' | 'baritone' | 'tenor' | 'alto' | 'soprano' | 'unknown';

export interface VocalProfilerFormants {
  f1: number;
  f2: number;
  f3: number;
}

export interface VocalProfile {
  fundamentalRange: {
    minHz: number;
    maxHz: number;
    medianHz: number;
  };
  formants: VocalProfilerFormants;
  dynamicRangeDb: number;
  peakLevelDb: number;
  rmsLevelDb: number;
  transientSharpness: number;
  breathiness: number;
  nasality: number;
  warmth: number;
  tightness: number;
  voiceType: VocalVoiceType;
  voiceTypeConfidence: number;
  conditioning: {
    clippingRepaired: boolean;
    normalizedGainDb: number;
    humPresent: boolean;
    clickCount: number;
    proximityEffect: number;
    verdict: VocalIntakeConditioningReport['verdict'];
    nextStep: string;
  };
}

interface WindowAnalysis {
  rmsDb: number;
  peakDb: number;
  transientSharpness: number;
  breathiness: number;
  warmth: number;
  nasality: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(Math.max(rms, 1e-8));
}

function peakDb(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  }
  return 20 * Math.log10(Math.max(peak, 1e-8));
}

function findLoudestWindow(buffer: VocalIntakeBufferLike, windowSize = 4096): Float32Array {
  const channel = buffer.getChannelData(0);
  if (channel.length <= windowSize) {
    return channel.slice();
  }

  let bestStart = 0;
  let bestEnergy = 0;
  const hop = Math.max(1, Math.floor(windowSize / 4));

  for (let start = 0; start <= channel.length - windowSize; start += hop) {
    let energy = 0;
    for (let i = 0; i < windowSize; i += 1) {
      const sample = channel[start + i] ?? 0;
      energy += sample * sample;
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }

  return channel.slice(bestStart, bestStart + windowSize);
}

function estimateFundamentalFromWindow(samples: Float32Array, sampleRate: number): number {
  if (samples.length < 4) return 0;
  const minLag = Math.max(1, Math.floor(sampleRate / 500));
  const maxLag = Math.max(minLag + 1, Math.floor(sampleRate / 60));
  let bestLag = 0;
  let bestScore = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let denomA = 0;
    let denomB = 0;

    for (let i = 0; i < samples.length - lag; i += 1) {
      const a = samples[i] ?? 0;
      const b = samples[i + lag] ?? 0;
      numerator += a * b;
      denomA += a * a;
      denomB += b * b;
    }

    const score = numerator / Math.max(Math.sqrt(denomA * denomB), 1e-8);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestLag > 0 && bestScore > 0.25 ? sampleRate / bestLag : 0;
}

function analyzeFrequencyWindow(samples: Float32Array): WindowAnalysis {
  const peak = peakDb(samples);
  const rms = rmsDb(samples);
  const dynamic = peak - rms;

  const totalEnergy = samples.reduce((sum, sample) => sum + sample * sample, 0) || 1;
  let hfEnergy = 0;
  let lowMidEnergy = 0;
  let nasalEnergy = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const delta = Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0));
    hfEnergy += delta * delta;
  }

  const bandCount = Math.min(samples.length, 1024);
  for (let i = 0; i < bandCount; i += 1) {
    const t = i / bandCount;
    const sample = samples[i] ?? 0;
    lowMidEnergy += Math.abs(sample) * (1 - t);
    nasalEnergy += Math.abs(sample) * Math.sin(Math.PI * t);
  }

  const breathiness = clamp(hfEnergy / (totalEnergy * 18), 0, 1);
  const warmth = clamp(lowMidEnergy / (totalEnergy * 8), 0, 1);
  const nasality = clamp(nasalEnergy / (totalEnergy * 10), 0, 1);

  return {
    rmsDb: rms,
    peakDb: peak,
    transientSharpness: clamp(dynamic / 20, 0, 1),
    breathiness,
    warmth,
    nasality,
  };
}

function estimateFormants(samples: Float32Array, sampleRate: number): VocalProfilerFormants {
  const step = 25;
  const maxFreq = 5000;
  const magnitudes: Array<{ freq: number; magnitude: number }> = [];

  for (let freq = step; freq <= maxFreq; freq += step) {
    const omega = (2 * Math.PI * freq) / sampleRate;
    let sPrev = 0;
    let sPrev2 = 0;
    const coeff = 2 * Math.cos(omega);

    for (let i = 0; i < samples.length; i += 1) {
      const s = (samples[i] ?? 0) + coeff * sPrev - sPrev2;
      sPrev2 = sPrev;
      sPrev = s;
    }

    const magnitude = Math.sqrt(sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2);
    magnitudes.push({ freq, magnitude });
  }

  const pickPeak = (minFreq: number, maxFreq: number): number => {
    let bestFreq = minFreq;
    let bestMagnitude = -Infinity;
    for (const entry of magnitudes) {
      if (entry.freq < minFreq || entry.freq > maxFreq) continue;
      if (entry.magnitude > bestMagnitude) {
        bestMagnitude = entry.magnitude;
        bestFreq = entry.freq;
      }
    }
    return bestFreq;
  };

  return {
    f1: pickPeak(180, 1000),
    f2: pickPeak(800, 3000),
    f3: pickPeak(2000, 5000),
  };
}

function classifyVoiceType(f0: number): { voiceType: VocalVoiceType; confidence: number } {
  if (!Number.isFinite(f0) || f0 <= 0) {
    return { voiceType: 'unknown', confidence: 0 };
  }

  if (f0 < 100) return { voiceType: 'bass', confidence: 0.65 };
  if (f0 < 135) return { voiceType: 'baritone', confidence: 0.7 };
  if (f0 < 220) return { voiceType: 'tenor', confidence: 0.82 };
  if (f0 < 290) return { voiceType: 'alto', confidence: 0.78 };
  return { voiceType: 'soprano', confidence: 0.74 };
}

function buildPitchTrack(buffer: VocalIntakeBufferLike): number[] {
  const sampleRate = buffer.sampleRate;
  const mono = buffer.getChannelData(0);
  const windowSize = Math.max(1024, Math.floor(sampleRate * 0.06));
  const hop = Math.max(256, Math.floor(windowSize / 2));
  const pitches: number[] = [];

  for (let start = 0; start <= mono.length - windowSize; start += hop) {
    const window = mono.subarray(start, start + windowSize);
    const energy = window.reduce((sum, sample) => sum + sample * sample, 0) / window.length;
    if (energy < 1e-4) continue;
    const f0 = estimateFundamentalFromWindow(window, sampleRate);
    if (f0 > 0) pitches.push(f0);
  }

  return pitches;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

export class VocalProfiler {
  public static profile(
    buffer: VocalIntakeBufferLike,
    conditioning: VocalIntakeConditioningReport
  ): VocalProfile {
    const loudWindow = findLoudestWindow(buffer);
    const pitchTrack = buildPitchTrack(buffer);
    const medianF0 = percentile(pitchTrack, 0.5);
    const minF0 = percentile(pitchTrack, 0.1);
    const maxF0 = percentile(pitchTrack, 0.9);
    const voicedWindow = loudWindow.length > 0 ? loudWindow : buffer.getChannelData(0).slice();
    const windowStats = analyzeFrequencyWindow(voicedWindow);
    const formants = estimateFormants(voicedWindow, buffer.sampleRate);
    const classification = classifyVoiceType(medianF0);

    const pitchSpread = maxF0 > minF0 ? clamp((maxF0 - minF0) / Math.max(medianF0, 1), 0, 1) : 0;
    const signalQuality = clamp(
      1
        - Math.abs(conditioning.gainStaging.gainAppliedDb) / 12
        - (conditioning.noiseSources.hum50Hz || conditioning.noiseSources.hum60Hz ? 0.1 : 0)
        - clamp(conditioning.noiseSources.clicks / 40, 0, 0.15),
      0,
      1
    );
    const stability = clamp(1 - pitchSpread, 0, 1);
    const voiceTypeConfidence = clamp(classification.confidence * 0.7 + stability * 0.2 + signalQuality * 0.1, 0, 1);

    const tightness = clamp(
      0.35 + windowStats.transientSharpness * 0.45 + (conditioning.dynamics.needsDynamicNormalization ? 0.08 : 0) + signalQuality * 0.12,
      0,
      1
    );

    return {
      fundamentalRange: {
        minHz: minF0 || medianF0,
        maxHz: maxF0 || medianF0,
        medianHz: medianF0,
      },
      formants,
      dynamicRangeDb: Math.max(0, windowStats.peakDb - windowStats.rmsDb),
      peakLevelDb: windowStats.peakDb,
      rmsLevelDb: windowStats.rmsDb,
      transientSharpness: windowStats.transientSharpness,
      breathiness: clamp(
        windowStats.breathiness + conditioning.micProximity.proximityEffect * 0.08,
        0,
        1
      ),
      nasality: clamp(windowStats.nasality + (conditioning.micProximity.compensationNeeded ? 0.08 : 0), 0, 1),
      warmth: clamp(windowStats.warmth + (conditioning.micProximity.proximityEffect * 0.12), 0, 1),
      tightness,
      voiceType: classification.voiceType,
      voiceTypeConfidence,
      conditioning: {
        clippingRepaired: conditioning.gainStaging.clippingRepair,
        normalizedGainDb: conditioning.gainStaging.gainAppliedDb,
        humPresent: conditioning.noiseSources.hum50Hz || conditioning.noiseSources.hum60Hz,
        clickCount: conditioning.noiseSources.clicks,
        proximityEffect: conditioning.micProximity.proximityEffect,
        verdict: conditioning.verdict,
        nextStep: conditioning.recommendedNextStep,
      },
    };
  }
}

export const vocalProfiler = VocalProfiler;
