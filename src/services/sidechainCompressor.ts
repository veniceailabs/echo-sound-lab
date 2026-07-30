/**
 * sidechainCompressor — Sidechain (ducking) compressor
 *
 * Used in music production, podcast music beds, and sync licensing:
 *   - Kick-triggered bass pumping (EDM, hip-hop)
 *   - Music ducking under voiceover
 *   - Rhythmic tremolo/gating effects
 *
 * Architecture:
 *   • Sidechain signal (trigger) → envelope follower → gain computer
 *   • Main signal → gain reduction → makeup gain → output
 *   • True RMS envelope (not peak) for smooth musical ducking
 *   • Lookahead buffer (up to 10ms) to anticipate transients
 *   • Soft-knee compression around threshold ±knee/2
 *
 * Reference:
 *   Zölzer, U. (2011) — DAFX: Digital Audio Effects, 2nd ed., Chapter 4.
 */

export interface SidechainCompressorOptions {
  /** Compression threshold in dBFS. Default -18. */
  threshold?: number;
  /** Compression ratio (1=no comp, 4=4:1, Inf=limit). Default 4. */
  ratio?: number;
  /** Knee width in dB. Default 6. */
  knee?: number;
  /** Attack time in ms. Default 5. */
  attackMs?: number;
  /** Release time in ms. Default 150. */
  releaseMs?: number;
  /** Lookahead in ms (0-10). Default 3. */
  lookaheadMs?: number;
  /** Makeup gain in dB. Default 0. */
  makeupGainDb?: number;
  /** Dry/wet blend 0-1. Default 1. */
  mix?: number;
  /** RMS averaging window in ms. Default 10. */
  rmsWindowMs?: number;
}

export interface SidechainResult {
  /** Average gain reduction applied in dB. */
  avgGainReductionDb: number;
  /** Max gain reduction in dB. */
  maxGainReductionDb: number;
  /** Peak output level in dBFS. */
  outputPeakDb: number;
}

// ── RMS envelope follower ─────────────────────────────────────────────────────

function rmsEnvelope(signal: Float32Array, windowSamples: number): Float32Array {
  const env = new Float32Array(signal.length);
  let sumSq = 0;
  // Running RMS using a ring buffer
  const ring = new Float32Array(windowSamples);
  let pos = 0;
  for (let i = 0; i < signal.length; i++) {
    const s = signal[i];
    sumSq -= ring[pos] * ring[pos];
    ring[pos] = s;
    sumSq += s * s;
    pos = (pos + 1) % windowSamples;
    env[i] = Math.sqrt(Math.max(0, sumSq) / windowSamples);
  }
  return env;
}

// ── Gain computer ─────────────────────────────────────────────────────────────

function gainComputer(
  envDb: number,
  threshDb: number,
  ratio: number,
  knee: number,
): number {
  const halfKnee = knee / 2;
  const diff = envDb - threshDb;

  if (diff < -halfKnee) {
    // Below knee — no gain reduction
    return 0; // gain reduction in dB
  } else if (diff <= halfKnee) {
    // Within knee — interpolate smoothly
    const t = (diff + halfKnee) / knee;
    return (1 - 1 / ratio) * t * t * halfKnee;
  } else {
    // Above knee — full compression
    return diff - diff / ratio;
  }
}

// ── Gain smoothing (ballistics) ───────────────────────────────────────────────

function applyBallistics(
  gainReductionDb: Float32Array,
  atkCoef: number,
  relCoef: number,
): Float32Array {
  const smoothed = new Float32Array(gainReductionDb.length);
  let state = 0;
  for (let i = 0; i < gainReductionDb.length; i++) {
    const target = gainReductionDb[i];
    const coef = target > state ? atkCoef : relCoef;
    state += coef * (target - state);
    smoothed[i] = state;
  }
  return smoothed;
}

// ── Lookahead (delay main signal, advance sidechain) ─────────────────────────

function applyLookahead(gainReduction: Float32Array, lookaheadSamples: number): Float32Array {
  if (lookaheadSamples <= 0) return gainReduction;
  const advanced = new Float32Array(gainReduction.length);
  for (let i = 0; i < gainReduction.length; i++) {
    advanced[i] = gainReduction[Math.min(i + lookaheadSamples, gainReduction.length - 1)];
  }
  return advanced;
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Apply sidechain compression.
 *
 * @param mainBuffer    The audio to be compressed (modified in place)
 * @param scBuffer      The sidechain trigger signal (read only)
 * @param options       Compressor parameters
 */
export function applySidechainCompression(
  mainBuffer: AudioBuffer,
  scBuffer: AudioBuffer,
  options: SidechainCompressorOptions = {},
): SidechainResult {
  const {
    threshold    = -18,
    ratio        = 4,
    knee         = 6,
    attackMs     = 5,
    releaseMs    = 150,
    lookaheadMs  = 3,
    makeupGainDb = 0,
    mix          = 1,
    rmsWindowMs  = 10,
  } = options;

  const sr = mainBuffer.sampleRate;

  // Compute coefficients
  const atkCoef  = 1 - Math.exp(-1 / (attackMs  * 0.001 * sr));
  const relCoef  = 1 - Math.exp(-1 / (releaseMs * 0.001 * sr));
  const makeupLin = Math.pow(10, makeupGainDb / 20);
  const lookSamples = Math.round(lookaheadMs * 0.001 * sr);
  const rmsWindow   = Math.round(rmsWindowMs * 0.001 * sr);

  // Mix down sidechain to mono
  const scLen = scBuffer.length;
  const scMono = new Float32Array(scLen);
  for (let ch = 0; ch < scBuffer.numberOfChannels; ch++) {
    const chData = scBuffer.getChannelData(ch);
    for (let i = 0; i < scLen; i++) scMono[i] += chData[i] / scBuffer.numberOfChannels;
  }

  // Trim/pad sidechain to main length
  const mainLen = mainBuffer.length;
  const scSignal = new Float32Array(mainLen);
  scSignal.set(scMono.subarray(0, Math.min(scLen, mainLen)));

  // 1. RMS envelope of sidechain
  const scEnv = rmsEnvelope(scSignal, Math.max(1, rmsWindow));

  // 2. Gain reduction per sample (in dB, positive = more reduction)
  const grDb = new Float32Array(mainLen);
  for (let i = 0; i < mainLen; i++) {
    const envDb = scEnv[i] > 0 ? 20 * Math.log10(scEnv[i]) : -100;
    grDb[i] = gainComputer(envDb, threshold, ratio, knee);
  }

  // 3. Lookahead (advance gain reduction ahead of the signal)
  const grLookahead = applyLookahead(grDb, lookSamples);

  // 4. Ballistic smoothing
  const grSmoothed = applyBallistics(grLookahead, atkCoef, relCoef);

  // 5. Apply gain to main channels
  let totalGR = 0;
  let maxGR = 0;
  let peakOut = 0;

  for (let ch = 0; ch < mainBuffer.numberOfChannels; ch++) {
    const data = mainBuffer.getChannelData(ch);
    const dry  = data.slice();
    // Delay main by lookahead so GR anticipates transients
    const delayed = new Float32Array(mainLen);
    for (let i = 0; i < mainLen; i++) delayed[i] = data[Math.max(0, i - lookSamples)];

    for (let i = 0; i < mainLen; i++) {
      const gr = grSmoothed[i];
      const gainLin = Math.pow(10, -gr / 20) * makeupLin;
      const wet = delayed[i] * gainLin;
      data[i] = mix < 1 ? dry[i] + mix * (wet - dry[i]) : wet;

      if (ch === 0) {
        totalGR += gr;
        if (gr > maxGR) maxGR = gr;
      }
      const abs = Math.abs(data[i]);
      if (abs > peakOut) peakOut = abs;
    }
  }

  return {
    avgGainReductionDb: parseFloat((totalGR / mainLen).toFixed(2)),
    maxGainReductionDb: parseFloat(maxGR.toFixed(2)),
    outputPeakDb:       peakOut > 0 ? parseFloat((20 * Math.log10(peakOut)).toFixed(1)) : -100,
  };
}

export const SIDECHAIN_PRESETS: Record<string, SidechainCompressorOptions> = {
  'EDM pump':        { threshold: -20, ratio: 8,   knee: 2,  attackMs: 2,  releaseMs: 200, lookaheadMs: 2 },
  'Radio duck':      { threshold: -18, ratio: 6,   knee: 4,  attackMs: 5,  releaseMs: 400, lookaheadMs: 3 },
  'Kick-bass glue':  { threshold: -16, ratio: 4,   knee: 6,  attackMs: 8,  releaseMs: 80,  lookaheadMs: 1 },
  'Vocal duck':      { threshold: -20, ratio: 5,   knee: 4,  attackMs: 10, releaseMs: 300, lookaheadMs: 5 },
  'Transparent':     { threshold: -24, ratio: 2.5, knee: 8,  attackMs: 15, releaseMs: 250, lookaheadMs: 3 },
  'Hard gate':       { threshold: -12, ratio: 20,  knee: 1,  attackMs: 1,  releaseMs: 50,  lookaheadMs: 1 },
};
