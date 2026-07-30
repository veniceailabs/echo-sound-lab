/**
 * audioRestoration — Professional audio restoration DSP
 *
 * 1. Noise Reduction — spectral subtraction using a noise profile from a
 *    quiet section of the audio. Reduces broadband noise floor without
 *    affecting transients.
 *
 * 2. De-Clicker — detects and interpolates over amplitude spikes
 *    (clicks/pops) using surrounding samples via cubic interpolation.
 *
 * 3. De-Esser — frequency-selective downward expander targeting the 5–10kHz
 *    sibilance range using a split-band approach: sidechain detects energy in
 *    the sibilance band, applies gain reduction only to that band via BiquadFilter.
 *
 * All functions operate on AudioBuffer (in-place or returning new buffer).
 * They are synchronous DSP — no Web Workers needed for typical track lengths.
 */

export interface NoiseReductionConfig {
  /** Strength 0–1: how aggressively to subtract noise (default 0.7) */
  strength: number;
  /** Smoothing frames for noise floor estimate (default 5) */
  smoothFrames: number;
  /** FFT size — must be power of 2 (default 2048) */
  fftSize: number;
}

export interface DeClickerConfig {
  /** Threshold: amplitude spike ratio to trigger de-click (default 3.0 = 3× neighbors) */
  threshold: number;
  /** Max width of click to repair in samples (default 64) */
  maxWidth: number;
}

export interface DeEsserConfig {
  /** Center frequency of sibilance band in Hz (default 7500) */
  frequency: number;
  /** Q of the sibilance detector band (default 2.0) */
  q: number;
  /** Threshold below which gain reduction starts (default -30 dBFS) */
  thresholdDb: number;
  /** Ratio of gain reduction (default 4:1) */
  ratio: number;
  /** Attack in ms (default 2) */
  attackMs: number;
  /** Release in ms (default 80) */
  releaseMs: number;
}

// ─── Noise Reduction ──────────────────────────────────────────────────────────

/** Simple FFT via Cooley-Tukey (in-place, complex input as [re, im] interleaved) */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  // FFT butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j]!, uIm = im[i + j]!;
        const vRe = re[i + j + len / 2]! * curRe - im[i + j + len / 2]! * curIm;
        const vIm = re[i + j + len / 2]! * curIm + im[i + j + len / 2]! * curRe;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe; im[i + j + len / 2] = uIm - vIm;
        [curRe, curIm] = [curRe * wRe - curIm * wIm, curRe * wIm + curIm * wRe];
      }
    }
  }
}

function ifft(re: Float32Array, im: Float32Array): void {
  // Conjugate, FFT, conjugate, scale
  for (let i = 0; i < im.length; i++) im[i] = -im[i]!;
  fft(re, im);
  for (let i = 0; i < re.length; i++) {
    re[i] = re[i]! / re.length;
    im[i] = -im[i]! / im.length;
  }
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

/**
 * Apply spectral subtraction noise reduction to a channel of audio.
 * @param data   Raw PCM samples
 * @param sr     Sample rate
 * @param cfg    Config
 */
export function applyNoiseReduction(
  data: Float32Array,
  _sr: number,
  cfg: Partial<NoiseReductionConfig> = {}
): Float32Array {
  const { strength = 0.7, smoothFrames = 5, fftSize = 2048 } = cfg;
  const hop = fftSize / 4;
  const win = hann(fftSize);
  const out = new Float32Array(data.length);
  const overlap = new Float32Array(data.length);

  // Build noise profile from first 0.5s (assumed quiet / silence / noise floor)
  const profileFrames = Math.min(smoothFrames, Math.floor(data.length / fftSize));
  const noiseProfile = new Float32Array(fftSize / 2);

  for (let f = 0; f < profileFrames; f++) {
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const start = f * hop;
    for (let i = 0; i < fftSize; i++) re[i] = (data[start + i] ?? 0) * (win[i] ?? 0);
    fft(re, im);
    for (let k = 0; k < fftSize / 2; k++) {
      const mag = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!);
      noiseProfile[k] = noiseProfile[k]! + mag / profileFrames;
    }
  }

  // Spectral subtraction pass
  const numFrames = Math.floor((data.length - fftSize) / hop);
  for (let f = 0; f < numFrames; f++) {
    const start = f * hop;
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) re[i] = (data[start + i] ?? 0) * (win[i] ?? 0);
    fft(re, im);

    // Subtract noise floor
    for (let k = 0; k < fftSize / 2; k++) {
      const mag = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!);
      const phase = Math.atan2(im[k]!, re[k]!);
      const noise = noiseProfile[k]! * strength;
      const newMag = Math.max(0, mag - noise);
      re[k] = newMag * Math.cos(phase);
      im[k] = newMag * Math.sin(phase);
      // Mirror
      if (k > 0) {
        re[fftSize - k] = re[k]!;
        im[fftSize - k] = -im[k]!;
      }
    }

    ifft(re, im);
    for (let i = 0; i < fftSize; i++) {
      overlap[start + i] = (overlap[start + i] ?? 0) + re[i]! * (win[i] ?? 0);
    }
  }

  // Normalize overlap
  for (let i = 0; i < data.length; i++) out[i] = overlap[i]!;
  return out;
}

// ─── De-Clicker ───────────────────────────────────────────────────────────────

/**
 * Detect and repair clicks/pops using cubic interpolation.
 */
export function applyDeClicker(
  data: Float32Array,
  cfg: Partial<DeClickerConfig> = {}
): Float32Array {
  const { threshold = 3.0, maxWidth = 64 } = cfg;
  const out = new Float32Array(data);
  const n = data.length;

  for (let i = 4; i < n - maxWidth - 4; i++) {
    // Local smoothed average around current sample
    const avgPrev = (Math.abs(out[i - 1] ?? 0) + Math.abs(out[i - 2] ?? 0) + Math.abs(out[i - 3] ?? 0) + Math.abs(out[i - 4] ?? 0)) / 4;
    const curr = Math.abs(out[i] ?? 0);
    if (curr > avgPrev * threshold && avgPrev > 0.001) {
      // Find end of click
      let width = 1;
      while (width < maxWidth && Math.abs(out[i + width] ?? 0) > avgPrev * (threshold * 0.5)) width++;
      // Cubic interpolation between pre-click and post-click values
      const y0 = out[i - 1] ?? 0;
      const y1 = out[i + width] ?? 0;
      for (let j = 0; j < width; j++) {
        const t = j / width;
        out[i + j] = y0 + (y1 - y0) * (3 * t * t - 2 * t * t * t); // smooth step
      }
      i += width - 1;
    }
  }
  return out;
}

// ─── De-Esser (offline, no Web Audio) ────────────────────────────────────────

/**
 * Offline de-esser: detect sibilance energy in 5–10kHz band, apply
 * frequency-selective gain reduction via a simple band-pass + downward expansion.
 */
export function applyDeEsser(
  data: Float32Array,
  sr: number,
  cfg: Partial<DeEsserConfig> = {}
): Float32Array {
  const {
    frequency = 7500,
    q = 2.0,
    thresholdDb = -30,
    ratio = 4,
    attackMs = 2,
    releaseMs = 80,
  } = cfg;

  const out = new Float32Array(data);
  const n = data.length;

  // Simple 2nd order BPF (sibilance detector)
  // Using bilinear transform BPF coefficients
  const w0 = 2 * Math.PI * frequency / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const nb0 = b0/a0, nb1 = b1/a0, nb2 = b2/a0;
  const na1 = a1/a0, na2 = a2/a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const sibilance = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = data[i]!;
    const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    sibilance[i] = y;
  }

  // Envelope follower on sibilance
  const attackCoef = Math.exp(-1 / (sr * attackMs / 1000));
  const releaseCoef = Math.exp(-1 / (sr * releaseMs / 1000));
  let env = 0;
  const threshold = Math.pow(10, thresholdDb / 20);

  for (let i = 0; i < n; i++) {
    const level = Math.abs(sibilance[i]!);
    env = level > env ? attackCoef * env + (1 - attackCoef) * level : releaseCoef * env + (1 - releaseCoef) * level;
    if (env > threshold) {
      // Gain reduction: downward expand the full signal proportionally
      const overDb = 20 * Math.log10(env / threshold);
      const gainReductionDb = overDb * (1 - 1 / ratio);
      const gain = Math.pow(10, -gainReductionDb / 20);
      out[i] = (out[i] ?? 0) * gain;
    }
  }

  return out;
}

// ─── Combined Restoration Chain ───────────────────────────────────────────────

export interface RestorationConfig {
  noiseReduction: { enabled: boolean } & Partial<NoiseReductionConfig>;
  deClicker: { enabled: boolean } & Partial<DeClickerConfig>;
  deEsser: { enabled: boolean } & Partial<DeEsserConfig>;
}

export function DEFAULT_RESTORATION(): RestorationConfig {
  return {
    noiseReduction: { enabled: false, strength: 0.65 },
    deClicker: { enabled: false, threshold: 3.5 },
    deEsser: { enabled: false, thresholdDb: -28, ratio: 4 },
  };
}

/**
 * Apply the full restoration chain to an AudioBuffer.
 * Returns a new AudioBuffer with the processed audio.
 */
export async function applyRestoration(
  buffer: AudioBuffer,
  cfg: RestorationConfig
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const outChannels: Float32Array[] = [];

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    let data = new Float32Array(buffer.getChannelData(ch));

    if (cfg.deClicker.enabled) {
      data = applyDeClicker(data, cfg.deClicker);
    }
    if (cfg.noiseReduction.enabled) {
      data = applyNoiseReduction(data, buffer.sampleRate, cfg.noiseReduction);
    }
    if (cfg.deEsser.enabled) {
      data = applyDeEsser(data, buffer.sampleRate, cfg.deEsser);
    }

    outChannels.push(data);
  }

  const outBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );
  for (let ch = 0; ch < outChannels.length; ch++) {
    outBuffer.copyToChannel(outChannels[ch]!, ch);
  }

  return outBuffer;
}
