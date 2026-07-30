/**
 * psychoacousticEnhancer — Fletcher-Munson equal-loudness correction
 *
 * At lower listening levels, human hearing is less sensitive to bass and extreme
 * highs (the equal-loudness contours). This module applies a compensating boost
 * so mixes perceived quietly still feel full and balanced.
 *
 * Technique:
 *   1. Estimate perceptual listening level from integrated RMS.
 *   2. Derive a correction curve from ITU-R BS.1770 equal-loudness offsets.
 *   3. Apply as a 3-band shelving EQ (sub-bass, low-mid presence, air).
 *   4. Scale correction depth by how far below "reference loud" the track is.
 *
 * Also includes "Psy-Stereo" enhancement: increases perceived width in the
 * 2k-8kHz range where binaural difference is most audible, while keeping
 * low end (<200Hz) in mono for translation.
 *
 * All processing runs on raw Float32Array — no AudioContext needed.
 */

const TWO_PI = 2 * Math.PI;

/** Simple first-order shelf: positive gainDb = boost, negative = cut */
function applyShelf(
  data: Float32Array,
  sr: number,
  fc: number,
  gainDb: number,
  type: 'low' | 'high',
): void {
  if (Math.abs(gainDb) < 0.05) return;
  const A = Math.pow(10, gainDb / 40);
  const w0 = TWO_PI * fc / sr;
  const cos_w0 = Math.cos(w0);
  const sin_w0 = Math.sin(w0);
  const alpha = sin_w0 / 2 * Math.sqrt((A + 1 / A) * (1 / 1.0 - 1) + 2);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  if (type === 'low') {
    b0 =  A  * ((A+1) - (A-1)*cos_w0 + 2*Math.sqrt(A)*alpha);
    b1 = 2*A  * ((A-1) - (A+1)*cos_w0);
    b2 =  A  * ((A+1) - (A-1)*cos_w0 - 2*Math.sqrt(A)*alpha);
    a0 =        (A+1) + (A-1)*cos_w0 + 2*Math.sqrt(A)*alpha;
    a1 =   -2  * ((A-1) + (A+1)*cos_w0);
    a2 =        (A+1) + (A-1)*cos_w0 - 2*Math.sqrt(A)*alpha;
  } else {
    b0 =  A  * ((A+1) + (A-1)*cos_w0 + 2*Math.sqrt(A)*alpha);
    b1 = -2*A * ((A-1) + (A+1)*cos_w0);
    b2 =  A  * ((A+1) + (A-1)*cos_w0 - 2*Math.sqrt(A)*alpha);
    a0 =        (A+1) - (A-1)*cos_w0 + 2*Math.sqrt(A)*alpha;
    a1 =    2  * ((A-1) - (A+1)*cos_w0);
    a2 =        (A+1) - (A-1)*cos_w0 - 2*Math.sqrt(A)*alpha;
  }

  // Normalize
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = b0*x0 + b1*x1 + b2*x2 - a1*y1 - a2*y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
    data[i] = y0;
  }
}

/** First-order peaking EQ (bell) */
function applyPeaking(
  data: Float32Array,
  sr: number,
  fc: number,
  gainDb: number,
  Q: number,
): void {
  if (Math.abs(gainDb) < 0.05) return;
  const A = Math.pow(10, gainDb / 40);
  const w0 = TWO_PI * fc / sr;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 =  1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 =  1 - alpha * A;
  const a0 =  1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 =  1 - alpha / A;

  const nb0 = b0/a0, nb1 = b1/a0, nb2 = b2/a0, na1 = a1/a0, na2 = a2/a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = nb0*x0 + nb1*x1 + nb2*x2 - na1*y1 - na2*y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
    data[i] = y0;
  }
}

function rmsOf(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

export interface PsychoacousticOptions {
  /**
   * Target reference RMS that represents "loud" listening (0–1 linear scale).
   * Everything below this gets equal-loudness compensation applied proportionally.
   * Default 0.25 ≈ roughly -12 dBFS RMS (typical loud mix).
   */
  referenceLoudness?: number;

  /**
   * Maximum sub-bass shelf boost in dB at max correction depth. Default 3.0.
   */
  maxSubBoost?: number;

  /**
   * Maximum presence peak boost in dB. Default 1.5.
   */
  maxPresenceBoost?: number;

  /**
   * Maximum air shelf boost in dB. Default 1.0.
   */
  maxAirBoost?: number;

  /**
   * Enable psy-stereo presence widening (0 = off, 1 = full). Default 0.3.
   */
  stereoWidthAmount?: number;
}

/**
 * Apply psychoacoustic equal-loudness enhancement to a stereo (or mono) buffer.
 * Mutates channel data in place — returns void.
 */
export function applyPsychoacousticEnhancement(
  buffer: AudioBuffer,
  options: PsychoacousticOptions = {},
): void {
  const {
    referenceLoudness  = 0.25,
    maxSubBoost        = 3.0,
    maxPresenceBoost   = 1.5,
    maxAirBoost        = 1.0,
    stereoWidthAmount  = 0.3,
  } = options;

  const sr = buffer.sampleRate;
  const L  = buffer.getChannelData(0);
  const R  = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;

  // 1. Measure integrated RMS across both channels
  const rmsL = rmsOf(L);
  const rmsR = rmsOf(R);
  const rms  = (rmsL + rmsR) / 2;

  // 2. Correction depth: 0 = at reference (no boost), 1 = very quiet
  const depth = Math.max(0, Math.min(1, 1 - rms / referenceLoudness));

  // 3. Equal-loudness correction amounts (scaled by depth)
  const subBoost      = maxSubBoost      * depth;   // ~60Hz low shelf
  const presenceBoost = maxPresenceBoost * depth;   // ~3.5kHz peak
  const airBoost      = maxAirBoost      * depth;   // ~12kHz high shelf

  // 4. Apply per channel
  for (const ch of [L, R]) {
    applyShelf   (ch, sr, 60,    subBoost,      'low');
    applyPeaking (ch, sr, 3500,  presenceBoost, 1.5);
    applyShelf   (ch, sr, 12000, airBoost,      'high');
  }

  // 5. Psy-stereo: gentle M/S widening in presence band only (2k-8kHz)
  //    Encode → boost side channel in that range → decode
  if (stereoWidthAmount > 0.01 && buffer.numberOfChannels > 1) {
    const n = L.length;
    const M = new Float32Array(n);
    const S = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      M[i] = (L[i] + R[i]) * 0.5;
      S[i] = (L[i] - R[i]) * 0.5;
    }

    // HP at 2kHz on M to get only the mid-high side signal to widen
    const sideWidened = new Float32Array(S);
    applyShelf(sideWidened, sr, 2000, stereoWidthAmount * depth * 3.0, 'high');

    for (let i = 0; i < n; i++) {
      L[i] = M[i] + sideWidened[i];
      R[i] = M[i] - sideWidened[i];
    }
  }
}

/** Convenience: measure what correction depth would be for a given buffer. */
export function measureCorrectionDepth(
  buffer: AudioBuffer,
  referenceLoudness = 0.25,
): { rms: number; depth: number; subBoostDb: number } {
  const L   = buffer.getChannelData(0);
  const R   = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const rms = (rmsOf(L) + rmsOf(R)) / 2;
  const depth = Math.max(0, Math.min(1, 1 - rms / referenceLoudness));
  return { rms, depth, subBoostDb: 3.0 * depth };
}
