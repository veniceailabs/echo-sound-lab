import { audioEngine } from './services/audioEngine';
import { lufsMeteringService } from './services/lufsMetering';
import { generateDiagnosticReport } from './services/advancedDiagnostics';
import type { ProcessingConfig } from './types';

const outputEl = document.getElementById('output');

const log = (line: string) => {
  if (outputEl) {
    outputEl.textContent = `${outputEl.textContent}\n${line}`;
  }
};

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
    if (i % Math.floor(ctx.sampleRate * 1.2) < ctx.sampleRate * 0.02) {
      sample += (Math.random() * 2 - 1) * 0.4;
    }
    left[i] = sample;
    right[i] = sample * 0.98;
  }

  return buffer;
};

const summarize = async (label: string, buffer: AudioBuffer) => {
  const lufs = await lufsMeteringService.measureLUFS(buffer);
  const rms = computeWindowedRmsDb(buffer, 200);
  const peak = computePeakDb(buffer);
  return { label, lufs: lufs.integratedLUFS, rms, peak };
};

const runSanityCheck = async () => {
  if (outputEl) outputEl.textContent = '';
  log('Engine sanity check starting...');

  const ctx = audioEngine.getAudioContext();
  const fixture = createFixtureBuffer(ctx, 12);
  audioEngine.setBuffer(fixture);
  audioEngine.setProcessedBuffer(null);

  // 1) Default config should be a true no-op.
  const noOpBuffer = await audioEngine.renderProcessedAudio({});
  log('');
  log('No-op default config:');
  log(noOpBuffer === fixture ? '✅ Returned original buffer (no-op)' : '⚠️ Returned new buffer (check no-op path)');

  // 2) Global width normalization stays single-path.
  const bandedConfig: ProcessingConfig = {
    stereoImager: { lowWidth: 0.8, midWidth: 1.2, highWidth: 1.6, crossovers: [300, 5000] },
  };
  const avgWidth = (0.8 + 1.2 + 1.6) / 3;
  const globalConfig: ProcessingConfig = {
    stereoImager: { lowWidth: avgWidth, midWidth: avgWidth, highWidth: avgWidth, crossovers: [300, 5000] },
  };

  const bandedBuffer = await audioEngine.renderProcessedAudio(bandedConfig);
  const globalBuffer = await audioEngine.renderProcessedAudio(globalConfig);

  const [bandedMetrics, globalMetrics] = await Promise.all([
    summarize('Banded', bandedBuffer),
    summarize('Global', globalBuffer),
  ]);

  log('');
  log('Global width normalization:');
  log('Metric            Banded      Global      Δ');
  log('----------------------------------------------');
  log(`Integrated LUFS   ${bandedMetrics.lufs.toFixed(2).padStart(7)}   ${globalMetrics.lufs.toFixed(2).padStart(7)}   ${Math.abs(bandedMetrics.lufs - globalMetrics.lufs).toFixed(2)}`);
  log(`RMS (avg)         ${formatDb(bandedMetrics.rms).padStart(7)}   ${formatDb(globalMetrics.rms).padStart(7)}   ${Math.abs(bandedMetrics.rms - globalMetrics.rms).toFixed(2)}`);
  log(`Peak              ${formatDb(bandedMetrics.peak).padStart(7)}   ${formatDb(globalMetrics.peak).padStart(7)}   ${Math.abs(bandedMetrics.peak - globalMetrics.peak).toFixed(2)}`);

  // 3) Diagnostics should not alter processing state.
  audioEngine.setProcessedBuffer(globalBuffer);
  const beforeBuffer = audioEngine.getProcessedBuffer();
  const diagnostics = audioEngine.analyzeStaticMetrics(globalBuffer);
  generateDiagnosticReport(diagnostics);
  const afterBuffer = audioEngine.getProcessedBuffer();

  log('');
  log('Diagnostics side effects:');
  log(beforeBuffer === afterBuffer ? '✅ Diagnostics left processing state unchanged' : '⚠️ Diagnostics altered processing state');
};

runSanityCheck().catch((err) => {
  console.error('[sanity-check] Failed:', err);
  log('Sanity check failed. See console for details.');
});
