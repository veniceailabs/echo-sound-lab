/**
 * midSideDynamicEq — Threshold-triggered EQ applied independently to mid and side
 *
 * Each band can target the mid channel, the side channel, or both.
 * When the band's energy exceeds a threshold, gain reduction (or boost) is applied.
 * This enables mastering moves impossible with normal EQ:
 *
 *   • De-ess only the center (mid): vocals are in mid, overheads in side
 *   • Tighten low-mid mud only in mid: kick/bass live there
 *   • Brighten stereo width only in the high side: shimmers/reverb tails
 *   • Mono-compatible bass: cut side below 200Hz entirely
 *
 * Algorithm per band:
 *   1. Band-pass filter input to isolate frequency range (simple RBJ peaking/shelf)
 *   2. Envelope follower on band energy (attack/release)
 *   3. When envelope exceeds threshold, scale gain toward target
 *   4. Apply gain to M or S channel
 *   5. Decode M/S back to L/R
 */

const TWO_PI = 2 * Math.PI;

export type MsChannel = 'mid' | 'side' | 'both';

export interface MsDynamicEqBand {
  /** Center frequency in Hz */
  frequency: number;
  /** Q factor */
  Q: number;
  /** Which M/S channel to process */
  channel: MsChannel;
  /** Threshold in dB below which the band is inactive. Default -30. */
  threshold: number;
  /** Maximum gain change in dB (negative = cut, positive = boost). */
  maxGainDb: number;
  /** Attack time in ms (how fast gain engages). Default 5. */
  attackMs: number;
  /** Release time in ms (how fast gain recovers). Default 80. */
  releaseMs: number;
}

export interface MsDynamicEqOptions {
  bands: MsDynamicEqBand[];
  /** Dry/wet mix 0-1. Default 1 (fully wet). */
  mix?: number;
}

// ── Biquad bandpass (RBJ) ────────────────────────────────────────────────────

function applyBandpass(
  input: Float32Array,
  sr: number,
  fc: number,
  Q: number,
): Float32Array {
  const w0 = TWO_PI * fc / sr;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw0 = Math.cos(w0);

  const b0 =  alpha;
  const b1 =  0;
  const b2 = -alpha;
  const a0 =  1 + alpha;
  const a1 = -2 * cosw0;
  const a2 =  1 - alpha;

  const nb0 = b0/a0, nb2 = b2/a0, na1 = a1/a0, na2 = a2/a0;

  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = nb0*x0 + nb2*x2 - na1*y1 - na2*y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

// ── Envelope follower ────────────────────────────────────────────────────────

function makeEnvelope(
  signal: Float32Array,
  sr: number,
  attackMs: number,
  releaseMs: number,
): Float32Array {
  const atkCoef = 1 - Math.exp(-1 / (attackMs  * 0.001 * sr));
  const relCoef = 1 - Math.exp(-1 / (releaseMs * 0.001 * sr));
  const env = new Float32Array(signal.length);
  let e = 0;
  for (let i = 0; i < signal.length; i++) {
    const abs = Math.abs(signal[i]);
    e += abs > e ? atkCoef * (abs - e) : relCoef * (abs - e);
    env[i] = e;
  }
  return env;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply mid-side dynamic EQ to an AudioBuffer in place.
 * Mono buffers are processed as mid-only (side = 0).
 */
export function applyMsDynamicEq(
  buffer: AudioBuffer,
  options: MsDynamicEqOptions,
): void {
  const { bands, mix = 1.0 } = options;
  if (bands.length === 0 || mix <= 0) return;

  const sr  = buffer.sampleRate;
  const L   = buffer.getChannelData(0);
  const R   = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : new Float32Array(L.length);
  const n   = L.length;
  const isStereo = buffer.numberOfChannels > 1;

  // Encode to M/S
  const M = new Float32Array(n);
  const S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = (L[i] + R[i]) * 0.5;
    S[i] = (L[i] - R[i]) * 0.5;
  }

  // Save originals for dry/wet
  const Mdry = mix < 1 ? M.slice() : null;
  const Sdry = mix < 1 ? S.slice() : null;

  // Process each band
  for (const band of bands) {
    const { frequency, Q, channel, threshold, maxGainDb, attackMs = 5, releaseMs = 80 } = band;
    const threshLin = Math.pow(10, threshold / 20);
    const gainLin   = Math.pow(10, maxGainDb / 20);

    // Get the signal(s) to analyze
    const analyzeM = channel === 'mid'  || channel === 'both';
    const analyzeS = channel === 'side' || channel === 'both';

    // Band-pass both channels to detect band energy
    const bpM = analyzeM ? applyBandpass(M, sr, frequency, Q) : null;
    const bpS = analyzeS ? applyBandpass(S, sr, frequency, Q) : null;

    // Sidechain: max envelope across analyzed channels
    const sidechain = new Float32Array(n);
    if (bpM) {
      const eM = makeEnvelope(bpM, sr, attackMs, releaseMs);
      for (let i = 0; i < n; i++) if (eM[i] > sidechain[i]) sidechain[i] = eM[i];
    }
    if (bpS) {
      const eS = makeEnvelope(bpS, sr, attackMs, releaseMs);
      for (let i = 0; i < n; i++) if (eS[i] > sidechain[i]) sidechain[i] = eS[i];
    }

    // Compute per-sample gain from sidechain envelope
    const gainArray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const env = sidechain[i];
      if (env <= threshLin || env === 0) {
        gainArray[i] = 1.0; // no processing below threshold
      } else {
        // Scale: 0 at threshold → gainLin at full saturation
        const overshoot = Math.min(1, (env - threshLin) / threshLin);
        gainArray[i] = 1.0 + (gainLin - 1.0) * overshoot;
      }
    }

    // Apply gain to the target channel's bandpass region
    // Use shelving approach: only affect the bandpassed signal, not the full spectrum
    if (analyzeM && bpM) {
      for (let i = 0; i < n; i++) {
        M[i] += bpM[i] * (gainArray[i] - 1); // add gain-weighted band difference
      }
    }
    if (analyzeS && bpS) {
      for (let i = 0; i < n; i++) {
        S[i] += bpS[i] * (gainArray[i] - 1);
      }
    }
  }

  // Dry/wet blend
  if (mix < 1 && Mdry && Sdry) {
    for (let i = 0; i < n; i++) {
      M[i] = Mdry[i] + mix * (M[i] - Mdry[i]);
      S[i] = Sdry[i] + mix * (S[i] - Sdry[i]);
    }
  }

  // Decode M/S back to L/R
  for (let i = 0; i < n; i++) {
    L[i] = M[i] + S[i];
    if (isStereo) R[i] = M[i] - S[i];
  }
}

// ── Preset library ───────────────────────────────────────────────────────────

export const MS_DYNAMIC_EQ_PRESETS: Record<string, MsDynamicEqOptions> = {
  'De-mud (mid)': {
    bands: [{
      frequency: 350, Q: 0.8, channel: 'mid',
      threshold: -30, maxGainDb: -3,
      attackMs: 8, releaseMs: 100,
    }],
  },
  'De-ess center': {
    bands: [{
      frequency: 6000, Q: 2.0, channel: 'mid',
      threshold: -28, maxGainDb: -4,
      attackMs: 2, releaseMs: 60,
    }],
  },
  'Mono bass': {
    bands: [{
      frequency: 80, Q: 0.5, channel: 'side',
      threshold: -60, maxGainDb: -12,   // always cut side bass
      attackMs: 1, releaseMs: 1,
    }],
  },
  'Air only sides': {
    bands: [{
      frequency: 12000, Q: 0.5, channel: 'side',
      threshold: -40, maxGainDb: 2.0,
      attackMs: 10, releaseMs: 150,
    }],
  },
  'Full vocal control': {
    bands: [
      { frequency: 350,  Q: 0.8, channel: 'mid', threshold: -30, maxGainDb: -2, attackMs: 8,  releaseMs: 100 },
      { frequency: 6000, Q: 2.0, channel: 'mid', threshold: -28, maxGainDb: -3, attackMs: 2,  releaseMs: 60  },
      { frequency: 80,   Q: 0.5, channel: 'side',threshold: -60, maxGainDb: -10,attackMs: 1,  releaseMs: 1   },
    ],
  },
};
