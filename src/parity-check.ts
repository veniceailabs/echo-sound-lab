import { audioEngine } from './services/audioEngine';
import { lufsMeteringService } from './services/lufsMetering';
import type { ProcessingConfig } from './types';

const outputEl = document.getElementById('output');

const formatDb = (val: number) => `${val.toFixed(2)} dB`;

const computePeakDb = (buffer: AudioBuffer): number => {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  return 20 * Math.log10(Math.max(peak, 1e-9));
};

const computeWindowedRmsDb = (buffer: AudioBuffer, windowMs: number): number => {
  const windowSize = Math.max(1, Math.floor(buffer.sampleRate * (windowMs / 1000)));
  const totalSamples = buffer.length;
  let rmsSum = 0;
  let windowCount = 0;

  for (let start = 0; start < totalSamples; start += windowSize) {
    const end = Math.min(totalSamples, start + windowSize);
    let sumSquares = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i++) {
        const sample = data[i];
        sumSquares += sample * sample;
      }
    }
    const denom = (end - start) * buffer.numberOfChannels;
    const rms = Math.sqrt(sumSquares / Math.max(1, denom));
    rmsSum += rms;
    windowCount += 1;
  }

  const avgRms = rmsSum / Math.max(1, windowCount);
  return 20 * Math.log10(Math.max(avgRms, 1e-9));
};

const createFixtureBuffer = (ctx: AudioContext, durationSeconds: number): AudioBuffer => {
  const length = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const freqs = [110, 220, 440, 880];
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    let sample = 0;
    for (const f of freqs) {
      sample += Math.sin(2 * Math.PI * f * t);
    }
    sample *= 0.12;
    // Add transient bursts every ~1.2s
    if (i % Math.floor(ctx.sampleRate * 1.2) < ctx.sampleRate * 0.02) {
      sample += (Math.random() * 2 - 1) * 0.4;
    }
    left[i] = sample;
    right[i] = sample * 0.98;
  }

  return buffer;
};

const log = (line: string) => {
  if (outputEl) {
    outputEl.textContent = `${outputEl.textContent}\n${line}`;
  }
};

const runParityCheck = async () => {
  if (outputEl) outputEl.textContent = '';
  log('Parity check starting...');

  const ctx = audioEngine.getAudioContext();
  const fixture = createFixtureBuffer(ctx, 12);

  const config: ProcessingConfig = {
    eq: [
      { frequency: 80, gain: 1.5, type: 'lowshelf', q: 0.7 },
      { frequency: 3000, gain: -1, type: 'peaking', q: 1.1 },
      { frequency: 12000, gain: 1.2, type: 'highshelf', q: 0.6 },
    ],
    compression: { threshold: -18, ratio: 3, attack: 0.01, release: 0.35, makeupGain: 0 },
    limiter: { threshold: -6, ratio: 10, attack: 0.005, release: 0.35 },
    saturation: { type: 'tape', amount: 0.1, mix: 0.4 },
  };

  audioEngine.setBuffer(fixture);
  audioEngine.setProcessedBuffer(null);
  audioEngine.applyProcessingConfig(config);

  const previewBuffer = await audioEngine.renderProcessedAudio(config);
  const exportBuffer = await audioEngine.renderProcessedAudio(config);

  const [previewLUFS, exportLUFS] = await Promise.all([
    lufsMeteringService.measureLUFS(previewBuffer),
    lufsMeteringService.measureLUFS(exportBuffer),
  ]);

  const previewMetrics = {
    lufs: previewLUFS.integratedLUFS,
    rms: computeWindowedRmsDb(previewBuffer, 200),
    peak: computePeakDb(previewBuffer),
  };

  const exportMetrics = {
    lufs: exportLUFS.integratedLUFS,
    rms: computeWindowedRmsDb(exportBuffer, 200),
    peak: computePeakDb(exportBuffer),
  };

  const deltas = {
    lufs: Math.abs(previewMetrics.lufs - exportMetrics.lufs),
    rms: Math.abs(previewMetrics.rms - exportMetrics.rms),
    peak: Math.abs(previewMetrics.peak - exportMetrics.peak),
  };

  console.table({
    'Integrated LUFS': {
      Preview: previewMetrics.lufs.toFixed(2),
      Export: exportMetrics.lufs.toFixed(2),
      Delta: deltas.lufs.toFixed(2),
    },
    'RMS (avg, 200ms)': {
      Preview: previewMetrics.rms.toFixed(2),
      Export: exportMetrics.rms.toFixed(2),
      Delta: deltas.rms.toFixed(2),
    },
    Peak: {
      Preview: previewMetrics.peak.toFixed(2),
      Export: exportMetrics.peak.toFixed(2),
      Delta: deltas.peak.toFixed(2),
    },
  });

  log('Metric            Preview     Export      Δ');
  log('-----------------------------------------------');
  log(`Integrated LUFS   ${previewMetrics.lufs.toFixed(2).padStart(7)}   ${exportMetrics.lufs.toFixed(2).padStart(7)}   ${deltas.lufs.toFixed(2)}`);
  log(`RMS (avg)         ${formatDb(previewMetrics.rms).padStart(7)}   ${formatDb(exportMetrics.rms).padStart(7)}   ${deltas.rms.toFixed(2)}`);
  log(`Peak              ${formatDb(previewMetrics.peak).padStart(7)}   ${formatDb(exportMetrics.peak).padStart(7)}   ${deltas.peak.toFixed(2)}`);

  const lufsOk = deltas.lufs <= 0.3;
  const rmsOk = deltas.rms <= 0.5;
  const peakOk = deltas.peak <= 0.01;
  if (lufsOk && rmsOk && peakOk) {
    log('');
    log('✅ Parity confirmed within tolerance.');
  } else {
    log('');
    log('⚠️ Parity drift detected (outside tolerance).');
  }
};

runParityCheck().catch((err) => {
  console.error('[parity-check] Failed:', err);
  log('Parity check failed. See console for details.');
});
