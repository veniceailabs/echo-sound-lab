/**
 * dynamicRangeEnhancer — Upward expansion to restore punch to over-compressed mixes
 *
 * Over-compressed masters have excessive loudness but destroyed dynamics.
 * Upward expansion is the inverse of a compressor: below the threshold,
 * it REDUCES gain, making quiet moments quieter while leaving loud peaks alone.
 * The result: increased dynamic range without changing peak level.
 *
 * This is fundamentally different from a downward compressor.
 * A downward expander ratio of 1:2 means:
 *   signal 3dB below threshold → output 6dB below threshold (more dynamics)
 *
 * Three-band implementation:
 *   Sub/Bass  (< 200Hz)  — transient punch: kick attack sharpening
 *   Mid       (200-5kHz) — body + presence dynamics
 *   High      (> 5kHz)   — air/shimmer breathiness
 *
 * All in pure Float32Array — no AudioContext dependency.
 */

const TWO_PI = 2 * Math.PI;

function makeCoefs(type: 'lowpass' | 'highpass', fc: number, sr: number) {
  const w0 = (TWO_PI * fc) / sr;
  const cos_w0 = Math.cos(w0);
  const sin_w0 = Math.sin(w0);
  const alpha = sin_w0 / (2 * 0.7071);
  if (type === 'lowpass') {
    const a0 = 1 + alpha;
    return {
      b0: (1 - cos_w0) / 2 / a0,
      b1:  (1 - cos_w0)      / a0,
      b2: (1 - cos_w0) / 2  / a0,
      a1: -2 * cos_w0        / a0,
      a2: (1 - alpha)        / a0,
    };
  } else {
    const a0 = 1 + alpha;
    return {
      b0:  (1 + cos_w0) / 2 / a0,
      b1: -(1 + cos_w0)      / a0,
      b2:  (1 + cos_w0) / 2 / a0,
      a1: -2 * cos_w0        / a0,
      a2:  (1 - alpha)       / a0,
    };
  }
}

function applyBiquad(data: Float32Array, c: ReturnType<typeof makeCoefs>): Float32Array {
  const out = new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = c.b0*x0 + c.b1*x1 + c.b2*x2 - c.a1*y1 - c.a2*y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

function envFollow(data: Float32Array, atkCoef: number, relCoef: number): Float32Array {
  const env = new Float32Array(data.length);
  let e = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    e += abs > e ? atkCoef * (abs - e) : relCoef * (abs - e);
    env[i] = e;
  }
  return env;
}

export interface DynamicRangeEnhancerOptions {
  /** Threshold below which expansion kicks in (dBFS). Default -18. */
  threshold?: number;
  /** Expansion ratio. >1 = expansion (1.5 = gentle, 2.0 = strong). Default 1.4. */
  ratio?: number;
  /** Attack ms for envelope follower. Default 3. */
  attackMs?: number;
  /** Release ms. Default 150. */
  releaseMs?: number;
  /** Which bands to process: 'all' | 'bass' | 'mid' | 'high'. Default 'all'. */
  bands?: 'all' | 'bass' | 'mid' | 'high';
  /** Dry/wet mix 0-1. Default 0.8. */
  mix?: number;
}

export interface DynamicRangeResult {
  /** Estimated dynamic range gain in LU (positive = more dynamics). */
  dynamicRangeGainLu: number;
  /** Samples processed below threshold (pct). */
  expandedPct: number;
}

export function applyDynamicRangeEnhancement(
  buffer: AudioBuffer,
  options: DynamicRangeEnhancerOptions = {},
): DynamicRangeResult {
  const {
    threshold = -18,
    ratio     = 1.4,
    attackMs  = 3,
    releaseMs = 150,
    bands     = 'all',
    mix       = 0.8,
  } = options;

  const sr  = buffer.sampleRate;
  const n   = buffer.length;
  const L   = buffer.getChannelData(0);
  const R   = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  const threshLin = Math.pow(10, threshold / 20);
  const atkCoef   = 1 - Math.exp(-1 / (attackMs  * 0.001 * sr));
  const relCoef   = 1 - Math.exp(-1 / (releaseMs * 0.001 * sr));

  let expandedCount = 0;

  function processBand(signal: Float32Array): Float32Array {
    const env = envFollow(signal, atkCoef, relCoef);
    const out = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      const e = env[i];
      if (e < threshLin && e > 0) {
        // Downward expansion: reduce gain below threshold
        const gainDb = (ratio - 1) * 20 * Math.log10(e / threshLin);
        const gainLin = Math.pow(10, gainDb / 20);
        out[i] = signal[i] * gainLin;
        expandedCount++;
      } else {
        out[i] = signal[i];
      }
    }
    return out;
  }

  function applyToChannel(ch: Float32Array) {
    const dry = ch.slice();

    if (bands === 'bass' || bands === 'all') {
      const lp = applyBiquad(ch, makeCoefs('lowpass', 200, sr));
      const hp = ch.map((v, i) => v - lp[i]); // high = original - low
      const expLp = processBand(lp);
      for (let i = 0; i < n; i++) ch[i] = expLp[i] + hp[i];
    }
    if (bands === 'mid' || bands === 'all') {
      const lp1 = applyBiquad(ch, makeCoefs('lowpass',  200, sr));
      const lp2 = applyBiquad(ch, makeCoefs('lowpass', 5000, sr));
      const mid  = lp2.map((v, i) => v - lp1[i]);
      const expMid = processBand(mid);
      for (let i = 0; i < n; i++) ch[i] += expMid[i] - mid[i];
    }
    if (bands === 'high' || bands === 'all') {
      const lp = applyBiquad(ch, makeCoefs('lowpass', 5000, sr));
      const hi  = ch.map((v, i) => v - lp[i]);
      const expHi = processBand(hi);
      for (let i = 0; i < n; i++) ch[i] += expHi[i] - hi[i];
    }

    // Dry/wet blend
    if (mix < 1) {
      for (let i = 0; i < n; i++) ch[i] = dry[i] + mix * (ch[i] - dry[i]);
    }
  }

  applyToChannel(L);
  if (R) applyToChannel(R);

  const totalSamples = n * (R ? 2 : 1);
  const expandedPct = Math.round((expandedCount / totalSamples) * 100);

  // Estimate LU gain: ratio applied over expanded region
  const dynamicRangeGainLu = parseFloat(((ratio - 1) * 6 * (expandedPct / 100)).toFixed(1));

  return { dynamicRangeGainLu, expandedPct };
}

export const DRE_PRESETS: Record<string, DynamicRangeEnhancerOptions> = {
  'Gentle restore':   { threshold: -20, ratio: 1.3, attackMs: 5,  releaseMs: 200, bands: 'all',  mix: 0.6 },
  'Punchy drums':     { threshold: -16, ratio: 1.6, attackMs: 2,  releaseMs: 80,  bands: 'bass', mix: 0.8 },
  'Vocal breath':     { threshold: -22, ratio: 1.4, attackMs: 8,  releaseMs: 250, bands: 'mid',  mix: 0.7 },
  'Air & shimmer':    { threshold: -24, ratio: 1.5, attackMs: 10, releaseMs: 300, bands: 'high', mix: 0.8 },
  'Full unclamp':     { threshold: -14, ratio: 2.0, attackMs: 3,  releaseMs: 150, bands: 'all',  mix: 0.9 },
  'Subtle presence':  { threshold: -26, ratio: 1.2, attackMs: 5,  releaseMs: 200, bands: 'all',  mix: 0.5 },
};
