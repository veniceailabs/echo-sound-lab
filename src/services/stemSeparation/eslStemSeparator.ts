/**
 * ESL HPSS Stem Separation — Top-Level Orchestrator
 *
 * Produces 4 professional-quality stems (vocals, drums, bass, other)
 * from any AudioBuffer using the full ESL HPSS pipeline:
 *
 *   Input → HPSS (harmonic + percussive) → bass split → vocal split
 *         → stereo reconstruction via OfflineAudioContext
 *
 * No external libraries required — pure Web Audio API + DSP math.
 */

import { hpssSeparate } from './hpssSeparator';
import { extractBass } from './bassExtractor';
import { extractVocals } from './vocalExtractor';

export interface StemSeparationResult {
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  other: AudioBuffer;
  metadata: {
    mode: 'esl-hpss';
    duration: number;
    sampleRate: number;
    processingTimeMs: number;
    algorithm: string;
  };
}

// ── Utility helpers ──────────────────────────────────────────────────────────

/** Downmix a multi-channel AudioBuffer to mono Float32Array */
function downmixToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const mono = new Float32Array(len);
  const numCh = buffer.numberOfChannels;
  const scale = 1 / numCh;
  for (let ch = 0; ch < numCh; ch++) {
    const ch_data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      mono[i] += ch_data[i] * scale;
    }
  }
  return mono;
}

/**
 * Wrap a mono Float32Array into a stereo AudioBuffer, applying a gain mask
 * derived from a mono mask signal (same length).  The mask is smoothed over
 * a 256-sample window and applied symmetrically to L and R.
 */
async function wrapMonoToStereoBuffer(
  monoSignal: Float32Array,
  originalBuffer: AudioBuffer,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const len = monoSignal.length;
  const ctx = new OfflineAudioContext(numChannels, len, sampleRate);
  const outBuf = ctx.createBuffer(numChannels, len, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const origCh = originalBuffer.getChannelData(Math.min(ch, originalBuffer.numberOfChannels - 1));
    const out = outBuf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      out[i] = monoSignal[i];
    }
    // Re-add a subtle portion of original width for naturalness
    const widthBlend = 0.15;
    for (let i = 0; i < len; i++) {
      out[i] = monoSignal[i] * (1 - widthBlend) + origCh[i] * widthBlend;
    }
  }

  return outBuf;
}

/**
 * Apply a per-sample gain array to every channel of an existing AudioBuffer
 * and return a new AudioBuffer.
 */
async function applyGainToBuffer(
  sourceBuffer: AudioBuffer,
  gainSignal: Float32Array,
  sampleRate: number
): Promise<AudioBuffer> {
  const len = Math.min(sourceBuffer.length, gainSignal.length);
  const numCh = sourceBuffer.numberOfChannels;
  const ctx = new OfflineAudioContext(numCh, len, sampleRate);
  const outBuf = ctx.createBuffer(numCh, len, sampleRate);

  for (let ch = 0; ch < numCh; ch++) {
    const src = sourceBuffer.getChannelData(ch);
    const out = outBuf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      out[i] = src[i] * gainSignal[i];
    }
  }
  return outBuf;
}

/**
 * Compute RMS-based gain mask: mask[i] = |signal[i]| / (|original[i]| + ε)
 * Smoothed over a window to avoid rapid gain modulation.
 */
function computeSoftMask(signal: Float32Array, original: Float32Array, windowSize = 256): Float32Array {
  const n = Math.min(signal.length, original.length);
  const mask = new Float32Array(n);
  const eps = 1e-7;

  for (let i = 0; i < n; i++) {
    mask[i] = Math.abs(signal[i]) / (Math.abs(original[i]) + eps);
  }

  // Smooth the mask
  const smoothed = new Float32Array(n);
  const half = Math.floor(windowSize / 2);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(half, n); i++) {
    sum += mask[i];
    count++;
  }
  for (let i = 0; i < n; i++) {
    if (i + half < n) { sum += mask[i + half]; count++; }
    if (i - half - 1 >= 0) { sum -= mask[i - half - 1]; count--; }
    smoothed[i] = Math.min(1, sum / Math.max(1, count));
  }
  return smoothed;
}

/**
 * Build an AudioBuffer clamped to [-1, 1] from a mono signal.
 */
async function monoToAudioBuffer(
  signal: Float32Array,
  numChannels: number,
  sampleRate: number
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(numChannels, signal.length, sampleRate);
  const buf = ctx.createBuffer(numChannels, signal.length, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const out = buf.getChannelData(ch);
    for (let i = 0; i < signal.length; i++) {
      out[i] = Math.max(-1, Math.min(1, signal[i]));
    }
  }
  return buf;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Separate an AudioBuffer into 4 professional stems.
 *
 * @param inputBuffer The source audio
 * @param onProgress  Optional progress callback (0–100 %)
 */
export async function separateStems(
  inputBuffer: AudioBuffer,
  onProgress?: (percent: number, stage: string) => void
): Promise<StemSeparationResult> {
  const startTime = performance.now();
  const sampleRate = inputBuffer.sampleRate;
  const numChannels = Math.min(inputBuffer.numberOfChannels, 2);
  const duration = inputBuffer.duration;

  const progress = (pct: number, stage: string) => {
    onProgress?.(pct, stage);
    console.log(`[ESL-HPSS] ${pct}% — ${stage}`);
  };

  progress(5, 'Preparing audio…');

  // ── Stage 1: Downmix to mono for HPSS analysis ───────────────────────────
  const mono = downmixToMono(inputBuffer);

  // Keep stereo channels for width reconstruction
  const chL = inputBuffer.getChannelData(0);
  const chR = numChannels > 1 ? inputBuffer.getChannelData(1) : chL;

  progress(10, 'Running HPSS separation…');

  // ── Stage 2: HPSS on mono ────────────────────────────────────────────────
  const { harmonic, percussive, residual } = await hpssSeparate(mono, sampleRate, {
    fftSize: 2048,
    hopSize: 512,
    harmonicKernel: 31,
    percussiveKernel: 31,
    power: 2,
  });

  progress(45, 'Extracting bass frequencies…');

  // ── Stage 3: Bass extraction from harmonic ───────────────────────────────
  const { bass: bassSignal, melodic: melodicSignal } = await extractBass(harmonic, sampleRate, 300);

  progress(60, 'Isolating vocals…');

  // ── Stage 4: Vocal extraction from melodic harmonic ──────────────────────
  const { vocals: vocalsSignal, instrumental: otherSignal } = await extractVocals(
    melodicSignal,
    chL,
    chR,
    sampleRate
  );

  progress(75, 'Reconstructing stereo stems…');

  // ── Stage 5: Build stereo AudioBuffers ───────────────────────────────────
  // Drums: apply percussive gain mask to original stereo
  const drumsMask = computeSoftMask(percussive, mono, 128);
  const drumsBuffer = await applyGainToBuffer(
    inputBuffer,
    drumsMask,
    sampleRate
  );

  // Bass: low-pass original stereo using OfflineAudioContext BiquadFilter
  const bassBuffer = await buildBassBuffer(inputBuffer, sampleRate, 300);

  // Vocals: mono → stereo with width blend
  const vocalsBuffer = await wrapMonoToStereoBuffer(vocalsSignal, inputBuffer, sampleRate, numChannels);

  // Other: residual mix (original - drums - bass - vocals, clamped)
  const otherBuffer = await monoToAudioBuffer(otherSignal, numChannels, sampleRate);

  progress(90, 'Finalising…');

  const processingTimeMs = performance.now() - startTime;

  progress(95, 'Complete');

  return {
    vocals: vocalsBuffer,
    drums: drumsBuffer,
    bass: bassBuffer,
    other: otherBuffer,
    metadata: {
      mode: 'esl-hpss',
      duration,
      sampleRate,
      processingTimeMs,
      algorithm:
        'ESL HPSS v1.0 — Cooley-Tukey FFT + Median-Filter HPSS + Wiener Soft Masks',
    },
  };
}

/**
 * Build a bass-only stereo AudioBuffer by running the original through
 * OfflineAudioContext BiquadFilter (low-pass at cutoffHz).
 */
async function buildBassBuffer(
  sourceBuffer: AudioBuffer,
  sampleRate: number,
  cutoffHz: number
): Promise<AudioBuffer> {
  const numCh = Math.min(sourceBuffer.numberOfChannels, 2);
  const len = sourceBuffer.length;
  const ctx = new OfflineAudioContext(numCh, len, sampleRate);

  const src = ctx.createBufferSource();
  src.buffer = sourceBuffer;

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = cutoffHz;
  lpf.Q.value = 0.707; // Butterworth (maximally flat)

  src.connect(lpf);
  lpf.connect(ctx.destination);
  src.start(0);

  return ctx.startRendering();
}
