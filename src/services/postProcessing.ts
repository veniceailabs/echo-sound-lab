import { GateExpanderConfig, TruePeakLimiterConfig, ClipperConfig } from '../types';

const dbToLinear = (db: number) => Math.pow(10, db / 20);
const linearToDb = (linear: number) => 20 * Math.log10(Math.max(linear, 1e-10));

export const applyGateExpander = (
  buffer: AudioBuffer,
  config: GateExpanderConfig
): void => {
  if (!config.enabled) return;
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.01));
  const attackCoeff = Math.exp(-1 / Math.max(1, sampleRate * config.attack));
  const releaseCoeff = Math.exp(-1 / Math.max(1, sampleRate * config.release));
  const thresholdDb = config.threshold;
  const ratio = Math.max(1, config.ratio);
  const minGainDb = -Math.abs(config.range);

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, idx) => buffer.getChannelData(idx));
  const length = channels[0].length;

  let gainDb = 0;
  let sumSquares = 0;
  const window = new Float32Array(windowSize);
  let windowIndex = 0;

  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      sample = Math.max(sample, Math.abs(channels[ch][i]));
    }

    const outgoing = window[windowIndex];
    sumSquares -= outgoing * outgoing;
    window[windowIndex] = sample;
    sumSquares += sample * sample;
    windowIndex = (windowIndex + 1) % windowSize;

    const rms = Math.sqrt(sumSquares / windowSize);
    const levelDb = linearToDb(rms);

    let targetGainDb = 0;
    if (levelDb < thresholdDb) {
      const below = levelDb - thresholdDb;
      targetGainDb = Math.max(minGainDb, below * (ratio - 1));
    }

    if (targetGainDb < gainDb) {
      gainDb = targetGainDb + attackCoeff * (gainDb - targetGainDb);
    } else {
      gainDb = targetGainDb + releaseCoeff * (gainDb - targetGainDb);
    }

    const gain = dbToLinear(gainDb);
    for (let ch = 0; ch < channels.length; ch++) {
      channels[ch][i] *= gain;
    }
  }
};

export const applyTruePeakLimiter = (
  buffer: AudioBuffer,
  config: TruePeakLimiterConfig
): void => {
  if (!config.enabled) return;
  const ceilingLinear = dbToLinear(config.ceiling);
  const oversample = Math.max(2, config.oversampleFactor ?? 4);
  let maxPeak = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i];
      const b = data[i + 1];
      for (let j = 0; j < oversample; j++) {
        const t = j / oversample;
        const interp = a + (b - a) * t;
        const abs = Math.abs(interp);
        if (abs > maxPeak) maxPeak = abs;
      }
    }
  }

  if (maxPeak <= ceilingLinear || maxPeak === 0) return;
  const gain = ceilingLinear / maxPeak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
};

export const applySoftClipper = (buffer: AudioBuffer, config: ClipperConfig): void => {
  if (!config.enabled) return;
  const threshold = dbToLinear(config.threshold);
  const softness = Math.max(0, Math.min(1, config.softness));
  const drive = 1 + softness * 2;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      const clipped = Math.tanh(x * drive / threshold) * threshold;
      data[i] = clipped;
    }
  }
};
