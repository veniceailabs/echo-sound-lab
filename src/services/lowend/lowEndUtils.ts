import type { VocalIntakeBufferLike } from '../vocal/intakeConditioning';

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const powerToDb = (power: number): number => 10 * Math.log10(Math.max(power, 1e-12));

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function monoMix(buffer: VocalIntakeBufferLike): Float32Array {
  const mono = new Float32Array(buffer.length);
  const channels = Math.max(1, buffer.numberOfChannels);

  for (let ch = 0; ch < channels; ch += 1) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += channel[i] ?? 0;
    }
  }

  for (let i = 0; i < mono.length; i += 1) {
    mono[i] /= channels;
  }

  return mono;
}

export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(Math.max(rms, 1e-8));
}

export function goertzelPower(samples: Float32Array, sampleRate: number, frequency: number): number {
  if (samples.length === 0 || frequency <= 0) return 0;
  const normalized = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(normalized);
  let sPrev = 0;
  let sPrev2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    const s = sample + coeff * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }

  return sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
}

export function averagePower(samples: Float32Array, sampleRate: number, frequencies: number[]): number {
  if (frequencies.length === 0) return 0;
  return frequencies.reduce((sum, frequency) => sum + goertzelPower(samples, sampleRate, frequency), 0) / frequencies.length;
}

export function lowBandPower(samples: Float32Array, sampleRate: number): number {
  return averagePower(samples, sampleRate, [35, 45, 55, 65, 75, 85]);
}

export function midLowPower(samples: Float32Array, sampleRate: number): number {
  return averagePower(samples, sampleRate, [90, 110, 130, 150, 180, 220]);
}

export function highPassPower(samples: Float32Array, sampleRate: number): number {
  return averagePower(samples, sampleRate, [240, 320, 420, 560, 720, 900]);
}

export function analyzeWindows(mono: Float32Array, sampleRate: number): number[] {
  const windowSize = Math.max(1024, Math.floor(sampleRate * 0.2));
  const hopSize = Math.max(256, Math.floor(windowSize / 2));
  const levels: number[] = [];

  for (let start = 0; start < mono.length; start += hopSize) {
    const end = Math.min(mono.length, start + windowSize);
    if (end - start < Math.max(128, windowSize / 4)) continue;
    const window = mono.subarray(start, end);
    levels.push(rmsDb(window));
  }

  return levels;
}

export function correlation(left: Float32Array, right: Float32Array): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 1;
  let sumLR = 0;
  let sumL2 = 0;
  let sumR2 = 0;

  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    sumLR += l * r;
    sumL2 += l * l;
    sumR2 += r * r;
  }

  return sumLR / Math.max(Math.sqrt(sumL2 * sumR2), 1e-8);
}

export function movingAverageLowPass(samples: Float32Array, sampleRate: number, cutoffHz = 120): Float32Array {
  const windowSize = Math.max(3, Math.floor(sampleRate / Math.max(cutoffHz, 20)));
  const output = new Float32Array(samples.length);
  let sum = 0;

  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] ?? 0;
    if (i >= windowSize) {
      sum -= samples[i - windowSize] ?? 0;
    }
    output[i] = sum / Math.min(i + 1, windowSize);
  }

  return output;
}
