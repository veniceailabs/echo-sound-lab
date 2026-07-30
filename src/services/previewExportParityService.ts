import { lufsMeteringService } from './lufsMetering';

export interface PreviewExportParityReport {
  passed: boolean;
  deltas: {
    gainDb: number;
    truePeakDb: number;
    timingMs: number;
    spectralBandsDb: number[];
    maxSpectralDeltaDb: number;
  };
  tolerances: {
    gainDb: number;
    truePeakDb: number;
    timingMs: number;
    spectralBandDb: number;
  };
  reasons: string[];
}

const PARITY_TOLERANCES = {
  gainDb: 0.5,
  truePeakDb: 0.1,
  timingMs: 1,
  spectralBandDb: 1,
} as const;

function downmix(buffer: AudioBuffer, maxSamples: number): Float32Array {
  const length = Math.min(buffer.length, maxSamples);
  const out = new Float32Array(length);
  const channels = Math.max(1, buffer.numberOfChannels);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      out[i] += (data[i] ?? 0) / channels;
    }
  }
  return out;
}

function rmsDb(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  return 20 * Math.log10(Math.max(rms, 1e-9));
}

function windowedBandDb(samples: Float32Array, sampleRate: number, bandCount = 6): number[] {
  const fftSize = Math.min(2048, 2 ** Math.floor(Math.log2(Math.max(64, samples.length))));
  const slice = samples.slice(0, fftSize);
  const magnitudes = new Array<number>(fftSize / 2).fill(0);

  for (let k = 0; k < fftSize / 2; k += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < fftSize; n += 1) {
      const phase = (2 * Math.PI * k * n) / fftSize;
      real += slice[n] * Math.cos(phase);
      imag -= slice[n] * Math.sin(phase);
    }
    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }

  const bandEdges = [20, 80, 250, 1000, 4000, 8000, Math.max(12000, sampleRate / 2)];
  const bands: number[] = [];
  for (let band = 0; band < bandCount; band += 1) {
    const minFreq = bandEdges[band];
    const maxFreq = bandEdges[band + 1];
    let sum = 0;
    let count = 0;
    for (let k = 1; k < magnitudes.length; k += 1) {
      const freq = (k * sampleRate) / fftSize;
      if (freq >= minFreq && freq < maxFreq) {
        sum += magnitudes[k] * magnitudes[k];
        count += 1;
      }
    }
    const energy = Math.sqrt(sum / Math.max(1, count));
    bands.push(20 * Math.log10(Math.max(energy, 1e-9)));
  }
  return bands;
}

function estimateTimingDriftMs(preview: Float32Array, exportSamples: Float32Array, sampleRate: number): number {
  const window = Math.min(preview.length, exportSamples.length, Math.floor(sampleRate * 0.25));
  if (window <= 64) return 0;
  const searchRadius = Math.min(Math.floor(sampleRate * 0.02), Math.max(8, Math.floor(window / 12)));
  let bestOffset = 0;
  let bestCorrelation = -Infinity;

  for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < window; i += 1) {
      const otherIndex = i + offset;
      if (otherIndex < 0 || otherIndex >= window) continue;
      correlation += preview[i] * exportSamples[otherIndex];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  return Math.abs(bestOffset / sampleRate) * 1000;
}

export async function verifyPreviewExportParity(
  previewBuffer: AudioBuffer,
  exportBuffer: AudioBuffer,
): Promise<PreviewExportParityReport> {
  const maxSamples = Math.floor(Math.min(previewBuffer.sampleRate, exportBuffer.sampleRate) * 10);
  const previewSamples = downmix(previewBuffer, maxSamples);
  const exportSamples = downmix(exportBuffer, maxSamples);
  const [previewLufs, exportLufs, previewPeak, exportPeak] = await Promise.all([
    lufsMeteringService.measureLUFS(previewBuffer),
    lufsMeteringService.measureLUFS(exportBuffer),
    lufsMeteringService.calculateTruePeak(previewBuffer),
    lufsMeteringService.calculateTruePeak(exportBuffer),
  ]);

  const previewBands = windowedBandDb(previewSamples, previewBuffer.sampleRate);
  const exportBands = windowedBandDb(exportSamples, exportBuffer.sampleRate);
  const spectralBandsDb = previewBands.map((band, index) => Math.abs(band - (exportBands[index] ?? band)));
  const maxSpectralDeltaDb = spectralBandsDb.reduce((max, value) => Math.max(max, value), 0);
  const gainDb = Math.abs((Number.isFinite(previewLufs.integratedLUFS) ? previewLufs.integratedLUFS : rmsDb(previewSamples)) - (Number.isFinite(exportLufs.integratedLUFS) ? exportLufs.integratedLUFS : rmsDb(exportSamples)));
  const truePeakDb = Math.abs(previewPeak - exportPeak);
  const timingMs = estimateTimingDriftMs(previewSamples, exportSamples, Math.min(previewBuffer.sampleRate, exportBuffer.sampleRate));

  const reasons: string[] = [];
  if (gainDb > PARITY_TOLERANCES.gainDb) {
    reasons.push(`Preview/export gain drift is ${gainDb.toFixed(2)} dB.`);
  }
  if (truePeakDb > PARITY_TOLERANCES.truePeakDb) {
    reasons.push(`Preview/export true peak drift is ${truePeakDb.toFixed(2)} dBTP.`);
  }
  if (timingMs > PARITY_TOLERANCES.timingMs) {
    reasons.push(`Preview/export timing drift is ${timingMs.toFixed(2)} ms.`);
  }
  if (maxSpectralDeltaDb > PARITY_TOLERANCES.spectralBandDb) {
    reasons.push(`Preview/export spectral drift reaches ${maxSpectralDeltaDb.toFixed(2)} dB in one octave band.`);
  }

  return {
    passed: reasons.length === 0,
    deltas: {
      gainDb,
      truePeakDb,
      timingMs,
      spectralBandsDb,
      maxSpectralDeltaDb,
    },
    tolerances: PARITY_TOLERANCES,
    reasons,
  };
}
