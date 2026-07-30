export interface VocalIntakeBufferLike {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export type VocalIntakeVerdict = 'ready' | 'needs_conditioning' | 'damaged_beyond_repair';

export interface VocalIntakeAction {
  action: 'gain_normalize' | 'clip_repair' | 'hum_notch' | 'click_remove' | 'proximity_correct';
  before: number;
  after: number;
  impact: string;
}

export interface VocalIntakeConditioningReport {
  gainStaging: {
    peakLevelDb: number;
    headroomDb: number;
    clipping: boolean;
    clippingSamples: number;
    clippingRepair: boolean;
    gainAppliedDb: number;
  };
  noiseSources: {
    noiseFloorDb: number;
    hum50Hz: boolean;
    hum60Hz: boolean;
    clicks: number;
    breathiness: number;
  };
  dynamics: {
    consistencyScore: number;
    levelVariationDb: number;
    needsDynamicNormalization: boolean;
  };
  micProximity: {
    proximityEffect: number;
    compensationNeeded: boolean;
    suggestedEQ: {
      freq: number;
      gain: number;
      q: number;
    };
  };
  actions: VocalIntakeAction[];
  verdict: VocalIntakeVerdict;
  recommendedNextStep: string;
}

export interface VocalIntakeConditioningResult {
  report: VocalIntakeConditioningReport;
  conditionedBuffer: VocalIntakeBufferLike;
}

interface ConditioningBuffers {
  channels: Float32Array[];
  buffer: VocalIntakeBufferLike;
}

const TARGET_PEAK_DB = -3;
const PEAK_TOLERANCE_DB = 0.75;
const CLIP_THRESHOLD = 0.9995;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const dbToLinear = (db: number): number => Math.pow(10, db / 20);

function monoMix(buffer: VocalIntakeBufferLike): Float32Array {
  const mono = new Float32Array(buffer.length);
  const channels = Math.max(1, buffer.numberOfChannels);

  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += data[i] ?? 0;
    }
  }

  for (let i = 0; i < mono.length; i += 1) {
    mono[i] /= channels;
  }

  return mono;
}

function cloneBuffer(buffer: VocalIntakeBufferLike): ConditioningBuffers {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channelIndex) =>
    Float32Array.from(buffer.getChannelData(channelIndex))
  );

  const conditionedBuffer: VocalIntakeBufferLike = {
    duration: buffer.duration,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    getChannelData(channel: number): Float32Array {
      return channels[channel] ?? channels[0] ?? new Float32Array(buffer.length);
    },
  };

  return {
    channels,
    buffer: conditionedBuffer,
  };
}

function repairClipping(channels: Float32Array[]): number {
  let repairedSamples = 0;

  for (const channel of channels) {
    let index = 0;
    while (index < channel.length) {
      const current = Math.abs(channel[index] ?? 0);
      if (current < CLIP_THRESHOLD) {
        index += 1;
        continue;
      }

      let start = index;
      while (start > 0 && Math.abs(channel[start - 1] ?? 0) >= CLIP_THRESHOLD) {
        start -= 1;
      }

      let end = index;
      while (end + 1 < channel.length && Math.abs(channel[end + 1] ?? 0) >= CLIP_THRESHOLD) {
        end += 1;
      }

      const left = start > 0 ? channel[start - 1] ?? 0 : 0;
      const right = end + 1 < channel.length ? channel[end + 1] ?? left : left;
      const span = Math.max(1, end - start + 2);

      for (let i = start; i <= end; i += 1) {
        const t = (i - start + 1) / span;
        channel[i] = left + (right - left) * t;
        repairedSamples += 1;
      }

      index = end + 1;
    }
  }

  return repairedSamples;
}

function applyGain(channels: Float32Array[], gainDb: number): void {
  if (!Number.isFinite(gainDb) || Math.abs(gainDb) < 1e-6) return;
  const gain = dbToLinear(gainDb);
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] *= gain;
    }
  }
}

function peakDbFromChannels(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const abs = Math.abs(channel[i] ?? 0);
      if (abs > peak) peak = abs;
    }
  }
  return 20 * Math.log10(Math.max(peak, 1e-8));
}

function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(Math.max(rms, 1e-8));
}

function analyzeWindows(mono: Float32Array, sampleRate: number): { noiseFloorDb: number; levelVariationDb: number; consistencyScore: number } {
  const windowSize = Math.max(256, Math.floor(sampleRate * 0.25));
  const hopSize = Math.max(128, Math.floor(windowSize / 2));
  const levels: number[] = [];

  for (let start = 0; start < mono.length; start += hopSize) {
    const end = Math.min(mono.length, start + windowSize);
    if (end - start < Math.max(64, windowSize / 4)) continue;
    const window = mono.subarray(start, end);
    const levelDb = rmsDb(window);
    if (Number.isFinite(levelDb)) {
      levels.push(levelDb);
    }
  }

  if (levels.length === 0) {
    return { noiseFloorDb: -120, levelVariationDb: 0, consistencyScore: 100 };
  }

  const sorted = [...levels].sort((a, b) => a - b);
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  const variance = levels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / levels.length;
  const stdDev = Math.sqrt(variance);
  const min = sorted[0] ?? mean;
  const max = sorted[sorted.length - 1] ?? mean;
  const levelVariationDb = max - min;
  const consistencyScore = clamp(100 - stdDev * 8, 0, 100);
  const quietThreshold = mean - 12;
  const quietSlice = sorted.filter((value) => value <= quietThreshold);
  const noiseFloorDb = quietSlice.length > 0
    ? quietSlice.reduce((sum, value) => sum + value, 0) / quietSlice.length
    : mean - 18;

  return {
    noiseFloorDb,
    levelVariationDb,
    consistencyScore,
  };
}

function goertzelPower(samples: Float32Array, sampleRate: number, frequency: number): number {
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

function averagePower(samples: Float32Array, sampleRate: number, frequencies: number[]): number {
  if (frequencies.length === 0) return 0;
  const total = frequencies.reduce((sum, frequency) => sum + goertzelPower(samples, sampleRate, frequency), 0);
  return total / frequencies.length;
}

function analyzeSpectralBalance(mono: Float32Array, sampleRate: number): {
  hum50Hz: boolean;
  hum60Hz: boolean;
  clicks: number;
  breathiness: number;
  proximityEffect: number;
  compensationNeeded: boolean;
  suggestedEQ: { freq: number; gain: number; q: number };
} {
  const lowMidPower = averagePower(mono, sampleRate, [120, 180, 240, 300, 400]);
  const presencePower = averagePower(mono, sampleRate, [1200, 1800, 2500, 4000]);
  const highPower = averagePower(mono, sampleRate, [6000, 8000, 10000, 12000]);
  const lowPower = averagePower(mono, sampleRate, [50, 60, 80, 100]);

  const hum50Power = goertzelPower(mono, sampleRate, 50);
  const hum60Power = goertzelPower(mono, sampleRate, 60);
  const humAdjacent = averagePower(mono, sampleRate, [45, 55, 65, 70]);
  const humRatio50 = hum50Power / Math.max(humAdjacent, 1e-9);
  const humRatio60 = hum60Power / Math.max(humAdjacent, 1e-9);

  let clicks = 0;
  let previous = mono[0] ?? 0;
  for (let i = 1; i < mono.length; i += 1) {
    const sample = mono[i] ?? 0;
    const delta = Math.abs(sample - previous);
    if (delta > 0.72) {
      const local = Math.max(Math.abs(sample), Math.abs(previous));
      if (local < 0.35 || delta > 0.9) {
        clicks += 1;
      }
    }
    previous = sample;
  }

  const spectralBalance = lowMidPower / Math.max(presencePower, 1e-9);
  const lowDominance = lowPower / Math.max(highPower + presencePower, 1e-9);
  const proximityEffect = clamp((spectralBalance * 0.8 + lowDominance * 0.6 - 0.4) * 0.8, 0, 1);
  const compensationNeeded = proximityEffect > 0.45;

  const breathiness = clamp(highPower / Math.max(highPower + lowMidPower + lowPower, 1e-9), 0, 1);

  const hum50Hz = humRatio50 > 1.6 && hum50Power > hum60Power;
  const hum60Hz = humRatio60 > 1.6 && hum60Power >= hum50Power;

  const suggestedEQ = compensationNeeded
    ? {
        freq: lowMidPower > presencePower ? 220 : 180,
        gain: -2.5 - proximityEffect * 2.5,
        q: 0.7,
      }
    : {
        freq: 180,
        gain: 0,
        q: 0.7,
      };

  return {
    hum50Hz,
    hum60Hz,
    clicks,
    breathiness,
    proximityEffect,
    compensationNeeded,
    suggestedEQ,
  };
}

function buildActions(params: {
  clippingSamples: number;
  gainAppliedDb: number;
  noiseFloorDb: number;
  hum50Hz: boolean;
  hum60Hz: boolean;
  clicks: number;
  proximityEffect: number;
}): VocalIntakeAction[] {
  const actions: VocalIntakeAction[] = [];

  if (params.clippingSamples > 0) {
    actions.push({
      action: 'clip_repair',
      before: params.clippingSamples,
      after: 0,
      impact: `Repaired ${params.clippingSamples} clipped sample${params.clippingSamples === 1 ? '' : 's'} in-place for analysis`,
    });
  }

  if (Math.abs(params.gainAppliedDb) > 0.75) {
    actions.push({
      action: 'gain_normalize',
      before: params.gainAppliedDb > 0 ? params.gainAppliedDb : 0,
      after: 0,
      impact: `Normalized peak level by ${params.gainAppliedDb > 0 ? '+' : ''}${params.gainAppliedDb.toFixed(2)} dB to preserve headroom`,
    });
  }

  if (params.hum50Hz || params.hum60Hz) {
    actions.push({
      action: 'hum_notch',
      before: params.hum50Hz ? 50 : 60,
      after: params.hum50Hz ? 50 : 60,
      impact: 'Detected mains hum; recommend a narrow notch before profiling',
    });
  }

  if (params.clicks > 0) {
    actions.push({
      action: 'click_remove',
      before: params.clicks,
      after: 0,
      impact: `Detected ${params.clicks} transient click${params.clicks === 1 ? '' : 's'} that can skew vocal profiling`,
    });
  }

  if (params.proximityEffect > 0.45) {
    actions.push({
      action: 'proximity_correct',
      before: params.proximityEffect,
      after: Math.max(0, params.proximityEffect - 0.2),
      impact: 'Close-mic proximity effect detected; recommend a gentle low-mid reduction before profiling',
    });
  }

  return actions;
}

function determineVerdict(report: VocalIntakeConditioningReport): VocalIntakeVerdict {
  const severeNoise = report.noiseSources.noiseFloorDb > -6;
  const excessiveClicks = report.noiseSources.clicks > Math.max(16, Math.floor(report.gainStaging.clippingSamples * 2));
  const clipped = report.gainStaging.clipping;
  const needsWork =
    clipped ||
    report.gainStaging.gainAppliedDb !== 0 ||
    report.noiseSources.hum50Hz ||
    report.noiseSources.hum60Hz ||
    report.micProximity.compensationNeeded ||
    report.dynamics.levelVariationDb > 8;

  if (severeNoise || excessiveClicks) {
    return 'damaged_beyond_repair';
  }

  return needsWork ? 'needs_conditioning' : 'ready';
}

export class VocalIntakeConditioningService {
  public static condition(buffer: VocalIntakeBufferLike): VocalIntakeConditioningResult {
    const cloned = cloneBuffer(buffer);
    const monoBefore = monoMix(buffer);

    const peakDbBefore = peakDbFromChannels(cloned.channels);
    const clippingSamples = repairClipping(cloned.channels);
    const peakDbAfterRepair = peakDbFromChannels(cloned.channels);

    const targetGainDb = TARGET_PEAK_DB - peakDbAfterRepair;
    const shouldNormalize = Math.abs(peakDbAfterRepair - TARGET_PEAK_DB) > PEAK_TOLERANCE_DB;
    const gainAppliedDb = shouldNormalize ? targetGainDb : 0;
    applyGain(cloned.channels, gainAppliedDb);

    const peakDbAfter = peakDbFromChannels(cloned.channels);
    const headroomDb = Math.max(0, -peakDbAfter);

    const { noiseFloorDb, levelVariationDb, consistencyScore } = analyzeWindows(monoBefore, buffer.sampleRate);
    const spectral = analyzeSpectralBalance(monoBefore, buffer.sampleRate);

    const report: VocalIntakeConditioningReport = {
      gainStaging: {
        peakLevelDb: peakDbAfter,
        headroomDb,
        clipping: clippingSamples > 0,
        clippingSamples,
        clippingRepair: clippingSamples > 0,
        gainAppliedDb,
      },
      noiseSources: {
        noiseFloorDb,
        hum50Hz: spectral.hum50Hz,
        hum60Hz: spectral.hum60Hz,
        clicks: spectral.clicks,
        breathiness: spectral.breathiness,
      },
      dynamics: {
        consistencyScore,
        levelVariationDb,
        needsDynamicNormalization: shouldNormalize,
      },
      micProximity: {
        proximityEffect: spectral.proximityEffect,
        compensationNeeded: spectral.compensationNeeded,
        suggestedEQ: spectral.suggestedEQ,
      },
      actions: buildActions({
        clippingSamples,
        gainAppliedDb,
        noiseFloorDb,
        hum50Hz: spectral.hum50Hz,
        hum60Hz: spectral.hum60Hz,
        clicks: spectral.clicks,
        proximityEffect: spectral.proximityEffect,
      }),
      verdict: 'ready',
      recommendedNextStep: 'Proceed to Vocal Profiler',
    };

    report.verdict = determineVerdict(report);
    if (report.verdict === 'needs_conditioning') {
      const reasons: string[] = [];
      if (report.gainStaging.clipping) reasons.push('clip repair');
      if (report.gainStaging.gainAppliedDb !== 0) reasons.push('level normalization');
      if (report.noiseSources.hum50Hz || report.noiseSources.hum60Hz) reasons.push('hum notch');
      if (report.noiseSources.clicks > 0) reasons.push('click cleanup');
      if (report.micProximity.compensationNeeded) reasons.push('proximity correction');
      report.recommendedNextStep = reasons.length > 0
        ? `Apply ${reasons.join(', ')} before vocal profiling`
        : 'Proceed to Vocal Profiler';
    } else if (report.verdict === 'damaged_beyond_repair') {
      report.recommendedNextStep = 'Source is too compromised for reliable intake conditioning; request a cleaner vocal take';
    }

    return {
      report,
      conditionedBuffer: cloned.buffer,
    };
  }
}

export const vocalIntakeConditioningService = VocalIntakeConditioningService;
