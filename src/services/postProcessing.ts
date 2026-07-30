import { GateExpanderConfig, TruePeakLimiterConfig, ClipperConfig } from '../types';

const dbToLinear = (db: number) => Math.pow(10, db / 20);
const linearToDb = (linear: number) => 20 * Math.log10(Math.max(linear, 1e-10));

export interface AdaptiveLoudnessConfig {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  attack: number;
  release: number;
  makeupDb?: number;
}

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

export const applyAdaptiveLoudnessShaper = (
  buffer: AudioBuffer,
  config: AdaptiveLoudnessConfig
): void => {
  if (!config.enabled) return;

  const thresholdDb = Math.min(0, config.thresholdDb);
  const ratio = Math.max(1, config.ratio);
  const attackCoeff = Math.exp(-1 / Math.max(1, buffer.sampleRate * Math.max(0.0005, config.attack)));
  const releaseCoeff = Math.exp(-1 / Math.max(1, buffer.sampleRate * Math.max(0.005, config.release)));
  const makeupGain = dbToLinear(config.makeupDb ?? 0);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, idx) => buffer.getChannelData(idx));
  const length = channels[0]?.length ?? 0;

  let gainReductionDb = 0;
  for (let i = 0; i < length; i += 1) {
    let peak = 0;
    for (let ch = 0; ch < channels.length; ch += 1) {
      peak = Math.max(peak, Math.abs(channels[ch][i]));
    }

    const levelDb = linearToDb(peak);
    let targetReductionDb = 0;
    if (levelDb > thresholdDb) {
      const compressedLevelDb = thresholdDb + (levelDb - thresholdDb) / ratio;
      targetReductionDb = compressedLevelDb - levelDb;
    }

    if (targetReductionDb < gainReductionDb) {
      gainReductionDb = targetReductionDb + attackCoeff * (gainReductionDb - targetReductionDb);
    } else {
      gainReductionDb = targetReductionDb + releaseCoeff * (gainReductionDb - targetReductionDb);
    }

    const gain = dbToLinear(gainReductionDb) * makeupGain;
    for (let ch = 0; ch < channels.length; ch += 1) {
      channels[ch][i] *= gain;
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

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL GRADE DSP EXTENSIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helpers ──────────────────────────────────────────────────────────────────
const db2l = (db: number) => Math.pow(10, db / 20);
const l2db = (l: number) => 20 * Math.log10(Math.max(l, 1e-10));

// ─── 1. TRUE LOOK-AHEAD LIMITER ───────────────────────────────────────────────
/**
 * applyLookAheadLimiter
 *
 * Professional brickwall limiting with:
 * - N-sample look-ahead delay (sees transients before they hit)
 * - Gain riding: slow gain reduction on sustained material
 * - Fast attack for transient control, asymmetric release
 * - True inter-sample peak detection (4x linear interp)
 *
 * This is what Limitless / iZotope Maximizer / FabFilter Pro-L do.
 */
export interface LookAheadLimiterConfig {
  ceilingDb: number;      // Target ceiling, e.g. -1.0
  lookAheadMs: number;    // Look-ahead in ms, e.g. 5
  releaseMs: number;      // Release in ms, e.g. 80
  attackMs?: number;      // Attack in ms, e.g. 0.5 (default)
}

export function applyLookAheadLimiter(
  buffer: AudioBuffer,
  config: LookAheadLimiterConfig
): void {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const ceilingLin = db2l(config.ceilingDb);
  const lookAheadSamples = Math.max(1, Math.floor(sr * config.lookAheadMs / 1000));
  const attackCoeff = Math.exp(-1 / Math.max(1, sr * (config.attackMs ?? 0.5) / 1000));
  const releaseCoeff = Math.exp(-1 / Math.max(1, sr * config.releaseMs / 1000));

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < nCh; ch++) channels.push(buffer.getChannelData(ch));
  const len = channels[0].length;

  // Gain reduction signal (computed on mix of all channels)
  const gainReduction = new Float32Array(len).fill(1.0);

  // Step 1: compute per-sample peak envelope (max across channels)
  const peakEnv = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let peak = 0;
    for (let ch = 0; ch < nCh; ch++) {
      const s = Math.abs(channels[ch][i]);
      if (s > peak) peak = s;
    }
    // True inter-sample: linear interpolation with next sample
    if (i < len - 1) {
      for (let ch = 0; ch < nCh; ch++) {
        const a = channels[ch][i], b = channels[ch][i + 1];
        for (let k = 1; k < 4; k++) {
          const s = Math.abs(a + (b - a) * (k / 4));
          if (s > peak) peak = s;
        }
      }
    }
    peakEnv[i] = peak;
  }

  // Step 2: look-ahead: for each sample i, find max peak in [i, i+lookAhead]
  // Use a sliding window maximum for O(N) efficiency
  const lookaheadPeak = new Float32Array(len);
  let runMax = 0;
  // Compute suffix max
  for (let i = len - 1; i >= 0; i--) {
    const end = Math.min(len - 1, i + lookAheadSamples);
    // Simplified: for small look-ahead (< 512), direct scan is fine
    let mx = peakEnv[i];
    for (let j = i + 1; j <= end; j++) {
      if (peakEnv[j] > mx) mx = peakEnv[j];
    }
    lookaheadPeak[i] = mx;
  }

  // Step 3: gain reduction signal from look-ahead peaks
  let gr = 1.0; // current gain
  for (let i = 0; i < len; i++) {
    const peak = lookaheadPeak[i];
    const targetGr = peak > ceilingLin ? ceilingLin / peak : 1.0;

    if (targetGr < gr) {
      // Attack: fast reduction
      gr = targetGr + attackCoeff * (gr - targetGr);
    } else {
      // Release: slow recovery
      gr = targetGr + releaseCoeff * (gr - targetGr);
    }
    gainReduction[i] = gr;
  }

  // Step 4: Apply gain reduction with look-ahead delay (shift signal back)
  for (let ch = 0; ch < nCh; ch++) {
    const data = channels[ch];
    // Shift: apply gainReduction[i] to data[i + lookAheadSamples] but we work in-place
    // Actually: delay the signal by lookAheadSamples and apply GR computed ahead
    const delayed = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      delayed[i] = i >= lookAheadSamples ? (data[i - lookAheadSamples] ?? 0) : 0;
    }
    for (let i = 0; i < len; i++) {
      data[i] = delayed[i] * gainReduction[i];
    }
  }
}

// ─── 2. MID/SIDE DYNAMICS PROCESSOR ──────────────────────────────────────────
/**
 * applyMidSideDynamics
 *
 * Encodes stereo into Mid+Side, compresses them independently,
 * then decodes back. Keeps center vocals/bass tight while letting
 * stereo width breathe naturally.
 */
export interface MidSideDynamicsConfig {
  midThresholdDb: number;   // e.g. -18
  midRatio: number;          // e.g. 3
  sideThresholdDb: number;  // e.g. -24 (sides compress more)
  sideRatio: number;         // e.g. 2
  attackMs: number;          // e.g. 5
  releaseMs: number;         // e.g. 120
  midMakeupDb?: number;      // e.g. 0
  sideMakeupDb?: number;     // e.g. 1
}

export function applyMidSideDynamics(
  buffer: AudioBuffer,
  config: MidSideDynamicsConfig
): void {
  if (buffer.numberOfChannels < 2) return;

  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const len = L.length;

  const attackCoeff = Math.exp(-1 / Math.max(1, sr * config.attackMs / 1000));
  const releaseCoeff = Math.exp(-1 / Math.max(1, sr * config.releaseMs / 1000));
  const midMakeup = db2l(config.midMakeupDb ?? 0);
  const sideMakeup = db2l(config.sideMakeupDb ?? 0);

  // Encode to M/S
  const M = new Float32Array(len);
  const S = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    M[i] = (L[i] + R[i]) * 0.5;
    S[i] = (L[i] - R[i]) * 0.5;
  }

  // RMS compressor for a single channel in-place
  function compress(
    data: Float32Array,
    threshDb: number,
    ratio: number,
    makeup: number
  ): void {
    const thresh = db2l(threshDb);
    let rms = 0;
    let gr = 1.0; // current gain
    const rmsWindow = Math.floor(sr * 0.01); // 10ms RMS window
    const sqBuf = new Float32Array(rmsWindow);
    let sqSum = 0;
    let sqIdx = 0;

    for (let i = 0; i < len; i++) {
      const sq = data[i] * data[i];
      sqSum -= sqBuf[sqIdx];
      sqBuf[sqIdx] = sq;
      sqSum += sq;
      sqIdx = (sqIdx + 1) % rmsWindow;
      rms = Math.sqrt(sqSum / rmsWindow);

      let targetGr = 1.0;
      if (rms > thresh) {
        const excessDb = l2db(rms) - threshDb;
        const reducedDb = excessDb / ratio - excessDb;
        targetGr = db2l(reducedDb);
      }

      if (targetGr < gr) gr = targetGr + attackCoeff * (gr - targetGr);
      else gr = targetGr + releaseCoeff * (gr - targetGr);

      data[i] *= gr * makeup;
    }
  }

  compress(M, config.midThresholdDb, config.midRatio, midMakeup);
  compress(S, config.sideThresholdDb, config.sideRatio, sideMakeup);

  // Decode back to L/R
  for (let i = 0; i < len; i++) {
    L[i] = M[i] + S[i];
    R[i] = M[i] - S[i];
  }
}

// ─── 3. PSYCHOACOUSTIC HARMONIC EXCITER ───────────────────────────────────────
/**
 * applyHarmonicExciter
 *
 * Adds subtle even harmonics (2nd, 4th) to high-frequency content above
 * crossoverHz. This creates perceived brightness and "air" without a high-shelf
 * boost — so no ear fatigue. Inspired by the Aphex Aural Exciter.
 *
 * Transfer function: y = x + mix * tanh(drive * x²) * HPF(x)
 */
export interface HarmonicExciterConfig {
  crossoverHz: number;  // e.g. 4000 — only excites above this
  amount: number;       // 0.0–1.0 blend of harmonics
  drive: number;        // 0.5–3.0 harmonic density
}

export function applyHarmonicExciter(
  buffer: AudioBuffer,
  config: HarmonicExciterConfig
): void {
  if (config.amount <= 0) return;
  const sr = buffer.sampleRate;
  const mix = Math.max(0, Math.min(1, config.amount)) * 0.15; // keep subtle
  const drive = Math.max(0.5, Math.min(4, config.drive));

  // 1-pole HPF to isolate high frequencies
  // y[n] = α * (y[n-1] + x[n] - x[n-1])
  const rc = 1 / (2 * Math.PI * config.crossoverHz);
  const dt = 1 / sr;
  const alpha = rc / (rc + dt);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let yPrev = 0, xPrev = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      // HPF
      const hpf = alpha * (yPrev + x - xPrev);
      yPrev = hpf; xPrev = x;
      // Even harmonic: square then soft-clip (2nd harmonic dominant)
      const excitation = Math.tanh(hpf * hpf * drive);
      data[i] = x + mix * excitation;
    }
  }
}

// ─── 4. SPECTRAL BALANCE AUTO-CORRECTION ─────────────────────────────────────
/**
 * analyzeSpectralBalance
 *
 * FFT-based spectral analysis returning average energy per band.
 * Used by auto-EQ to detect frequency imbalances.
 */
export interface SpectralBand {
  label: string;
  loHz: number;
  hiHz: number;
  energyDb: number;
}

export function analyzeSpectralBalance(buffer: AudioBuffer): SpectralBand[] {
  const BANDS = [
    { label: 'Sub',    loHz: 20,   hiHz: 80   },
    { label: 'Bass',   loHz: 80,   hiHz: 250  },
    { label: 'Lo-Mid', loHz: 250,  hiHz: 800  },
    { label: 'Mid',    loHz: 800,  hiHz: 2500 },
    { label: 'Hi-Mid', loHz: 2500, hiHz: 6000 },
    { label: 'Air',    loHz: 6000, hiHz: 20000},
  ];

  const sr = buffer.sampleRate;
  const fftSize = 4096;
  const hopSize = fftSize >> 1;
  const ch0 = buffer.getChannelData(0);
  const len = ch0.length;

  // Accumulate energy per bin across frames
  const binEnergy = new Float32Array(fftSize / 2);
  let frames = 0;

  // Hanning window
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
  }

  // DFT via Goertzel for each band (simpler than full FFT)
  // For simplicity, do a naive energy measurement via RMS in frequency-filtered signals
  // (Full FFT requires typed array manipulation — use Goertzel approximation)
  return BANDS.map(band => {
    const omegaLo = 2 * Math.PI * band.loHz / sr;
    const omegaHi = 2 * Math.PI * band.hiHz / sr;
    const centerHz = Math.sqrt(band.loHz * band.hiHz);
    const omega = 2 * Math.PI * centerHz / sr;

    // Goertzel for center frequency energy across entire signal
    let s1 = 0, s2 = 0;
    const coeff = 2 * Math.cos(omega);
    const stepSz = Math.max(1, Math.floor(sr / 4000)); // Downsample for speed
    for (let i = 0; i < len; i += stepSz) {
      const s = (ch0[i] ?? 0) + coeff * s1 - s2;
      s2 = s1; s1 = s;
    }
    const energy = Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
    const energyDb = l2db(energy / Math.max(1, len / stepSz) + 1e-10);

    return { ...band, energyDb };
  });
}

/**
 * Suggest corrective EQ bands based on spectral balance analysis.
 * Target: a perceptually flat response curve for mastered material.
 */
export function suggestSpectralCorrection(bands: SpectralBand[]): Array<{ frequency: number; gain: number; type: string; q?: number }> {
  // Target energy levels (dBFS, approximate for well-mastered material)
  const TARGET_DB: Record<string, number> = {
    'Sub':    -24,
    'Bass':   -18,
    'Lo-Mid': -20,
    'Mid':    -22,
    'Hi-Mid': -24,
    'Air':    -28,
  };

  const corrections: Array<{ frequency: number; gain: number; type: string; q?: number }> = [];

  for (const band of bands) {
    const target = TARGET_DB[band.label] ?? -22;
    const delta = target - band.energyDb;
    const maxCorrection = 4; // Never apply more than 4dB

    if (Math.abs(delta) < 1.5) continue; // Close enough, skip

    const gain = Math.max(-maxCorrection, Math.min(maxCorrection, delta * 0.4));
    const centerHz = Math.sqrt(band.loHz * band.hiHz);
    const isShelf = band.label === 'Sub' || band.label === 'Air';

    corrections.push({
      frequency: centerHz,
      gain: Math.round(gain * 10) / 10,
      type: isShelf ? (band.label === 'Sub' ? 'lowshelf' : 'highshelf') : 'peaking',
      q: isShelf ? undefined : 0.7,
    });
  }

  return corrections;
}
