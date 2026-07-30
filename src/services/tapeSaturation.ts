/**
 * tapeSaturation — Analog tape machine emulation
 *
 * Models three distinct behaviors of magnetic tape recording:
 *
 *   1. TAPE SATURATION (soft-knee waveshaper)
 *      Tape magnetization follows a sigmoid transfer function (Langevin equation).
 *      At low input levels it's linear; above a drive threshold it compresses
 *      non-linearly, adding warmth without audible distortion.
 *      Transfer function: y = tanh(drive * x) / tanh(drive)
 *
 *   2. HARMONIC GENERATION (bias distortion)
 *      Tape bias creates asymmetric saturation → 2nd + 3rd harmonics.
 *      We synthesize these via Chebyshev polynomials mixed in at low amplitude.
 *      Even harmonics (2nd) add "warmth"; odd harmonics (3rd) add "presence".
 *
 *   3. HIGH-FREQUENCY ROLLOFF (head bump + HF loss)
 *      Tape exhibits:
 *        - Head bump: slight bass boost around 50-100Hz from gap resonance
 *        - HF loss: gradual treble rolloff above ~14kHz from head azimuth loss
 *      Both modeled as 1st-order IIR filters.
 *
 *   4. FLUTTER SIMULATION (optional)
 *      Wow & flutter from motor speed variation: subtle pitch modulation via
 *      a slow LFO (0.5–4Hz) applied as a read-pointer offset.
 *
 * All in pure Float32Array — no AudioContext dependency.
 *
 * References:
 *   - Creasey, D.H. (2014) — Audio Electronics Reference Book
 *   - Valimaki, V. et al. (2012) — Virtual Analog Effects, DAFX
 */

export interface TapeSaturationOptions {
  /** Input drive level (1=subtle, 3=moderate, 6=aggressive). Default 2. */
  drive?: number;
  /** 2nd harmonic level 0-1. Default 0.08. */
  evenHarmonics?: number;
  /** 3rd harmonic level 0-1. Default 0.04. */
  oddHarmonics?: number;
  /** High-frequency loss (0=none, 1=full vintage rolloff). Default 0.5. */
  hfRolloff?: number;
  /** Head bump boost amount in dB. Default 1.5. */
  headBumpDb?: number;
  /** Flutter rate in Hz (0=off). Default 0. */
  flutterRate?: number;
  /** Flutter depth in semitone fraction (0-0.01). Default 0.003. */
  flutterDepth?: number;
  /** Output gain makeup in dB. Default 0. */
  outputGainDb?: number;
  /** Dry/wet mix 0-1. Default 1. */
  mix?: number;
}

export interface TapeResult {
  /** Estimated harmonic content added (dB). */
  harmonicsAdded: number;
  /** Estimated saturation level (0-1). */
  saturationLevel: number;
  /** Peak output level (dBFS). */
  outputPeak: number;
}

// ── Biquad helpers ─────────────────────────────────────────────────────────────

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

function makeLowpass(fc: number, sr: number, Q = 0.7071): Biquad {
  const w0 = 2 * Math.PI * fc / sr;
  const c = Math.cos(w0), s = Math.sin(w0);
  const alpha = s / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - c) / 2 / a0,
    b1:  (1 - c)      / a0,
    b2: (1 - c) / 2 / a0,
    a1: -2 * c         / a0,
    a2: (1 - alpha)    / a0,
  };
}

function makePeaking(fc: number, sr: number, gainDb: number, Q = 1.5): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * fc / sr;
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha / A;
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * Math.cos(w0)) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha / A)  / a0,
  };
}

function runBiquad(data: Float32Array, q: Biquad): Float32Array {
  const out = new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = q.b0*x0 + q.b1*x1 + q.b2*x2 - q.a1*y1 - q.a2*y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

// ── Tape transfer function (Langevin sigmoid) ──────────────────────────────────

function tapeTransfer(x: number, drive: number): number {
  // Normalized tanh so unity in = unity out at low levels
  const d = Math.max(0.01, drive);
  const sat = Math.tanh(d * x) / Math.tanh(d);
  return sat;
}

// ── Chebyshev harmonic generation ─────────────────────────────────────────────
// T2(x) = 2x² - 1   (generates 2nd harmonic)
// T3(x) = 4x³ - 3x  (generates 3rd harmonic)

function harmonic2(x: number): number { return 2 * x * x - 1; }
function harmonic3(x: number): number { return 4 * x * x * x - 3 * x; }

// ── Flutter via quasi-sinusoidal read-pointer offset ──────────────────────────

function applyFlutter(data: Float32Array, rate: number, depth: number, sr: number): Float32Array {
  if (rate <= 0 || depth <= 0) return data;
  const out = new Float32Array(data.length);
  const maxDelaySamples = Math.ceil(depth * sr); // depth in seconds
  const buf = new Float32Array(data.length + maxDelaySamples * 2);
  buf.set(data, maxDelaySamples);

  for (let i = 0; i < data.length; i++) {
    // Slow LFO: flutter has a slight second harmonic component (realistic)
    const lfo = 0.75 * Math.sin(2 * Math.PI * rate * i / sr)
              + 0.25 * Math.sin(4 * Math.PI * rate * i / sr);
    const delaySamples = lfo * maxDelaySamples;
    const readPos = i + maxDelaySamples + delaySamples;
    const readInt = Math.floor(readPos);
    const frac = readPos - readInt;
    // Linear interpolation
    out[i] = buf[readInt] * (1 - frac) + (buf[readInt + 1] ?? 0) * frac;
  }
  return out;
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Apply tape saturation to an AudioBuffer (modifies in place).
 * Returns a TapeResult with estimates of the processing applied.
 */
export function applyTapeSaturation(
  buffer: AudioBuffer,
  options: TapeSaturationOptions = {},
): TapeResult {
  const {
    drive         = 2,
    evenHarmonics = 0.08,
    oddHarmonics  = 0.04,
    hfRolloff     = 0.5,
    headBumpDb    = 1.5,
    flutterRate   = 0,
    flutterDepth  = 0.003,
    outputGainDb  = 0,
    mix           = 1,
  } = options;

  const sr = buffer.sampleRate;
  const gainLin = Math.pow(10, outputGainDb / 20);

  // Build EQ filters
  // HF rolloff: 1st-order Butterworth lowpass, cutoff scales with hfRolloff
  const hfCutoff = 20000 - hfRolloff * 6000; // 14kHz (full rolloff) to 20kHz (flat)
  const lpFilter = makeLowpass(hfCutoff, sr);

  // Head bump: peaking at 80Hz
  const bumpFilter = makePeaking(80, sr, headBumpDb);

  let maxSat = 0;
  let harmEnergyAdded = 0;
  let peakOut = 0;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    const dry  = data.slice();
    const n    = data.length;

    // Stage 1: head bump (before saturation — tape head shapes the input)
    const bumped = runBiquad(data, bumpFilter);

    // Stage 2: saturation + harmonics
    const saturated = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = bumped[i];
      const sat = tapeTransfer(x, drive);
      const h2  = harmonic2(sat) * evenHarmonics * 0.1;
      const h3  = harmonic3(sat) * oddHarmonics  * 0.1;
      saturated[i] = sat + h2 + h3;

      const satLevel = Math.abs(sat - x);
      if (satLevel > maxSat) maxSat = satLevel;
      harmEnergyAdded += (h2 * h2 + h3 * h3);
    }

    // Stage 3: HF rolloff (after saturation — head response shapes output)
    let processed: Float32Array = hfRolloff > 0.01
      ? runBiquad(saturated, lpFilter)
      : saturated;

    // Stage 4: flutter
    if (flutterRate > 0) {
      processed = applyFlutter(processed, flutterRate, flutterDepth * (1 / sr) * sr, sr);
    }

    // Stage 5: output gain + dry/wet blend
    for (let i = 0; i < n; i++) {
      const wet = processed[i] * gainLin;
      data[i] = mix < 1 ? dry[i] + mix * (wet - dry[i]) : wet;
      const abs = Math.abs(data[i]);
      if (abs > peakOut) peakOut = abs;
    }
  }

  const harmRms = Math.sqrt(harmEnergyAdded / (buffer.length * buffer.numberOfChannels));
  const harmonicsAdded = harmRms > 0 ? 20 * Math.log10(harmRms) : -100;
  const saturationLevel = Math.min(1, maxSat / 0.5);
  const outputPeak = peakOut > 0 ? 20 * Math.log10(peakOut) : -100;

  return { harmonicsAdded: parseFloat(harmonicsAdded.toFixed(1)), saturationLevel: parseFloat(saturationLevel.toFixed(3)), outputPeak: parseFloat(outputPeak.toFixed(1)) };
}

export const TAPE_PRESETS: Record<string, TapeSaturationOptions> = {
  'Subtle warmth':     { drive: 1.5, evenHarmonics: 0.06, oddHarmonics: 0.02, hfRolloff: 0.2, headBumpDb: 1.0, mix: 0.7 },
  'Vintage tape':      { drive: 3.0, evenHarmonics: 0.12, oddHarmonics: 0.06, hfRolloff: 0.6, headBumpDb: 2.0, mix: 0.9 },
  'Hot tape':          { drive: 5.0, evenHarmonics: 0.18, oddHarmonics: 0.10, hfRolloff: 0.8, headBumpDb: 2.5, mix: 1.0 },
  'Mix glue':          { drive: 2.0, evenHarmonics: 0.10, oddHarmonics: 0.04, hfRolloff: 0.3, headBumpDb: 1.5, mix: 0.6 },
  'Tape + flutter':    { drive: 2.5, evenHarmonics: 0.10, oddHarmonics: 0.05, hfRolloff: 0.5, headBumpDb: 1.8, flutterRate: 1.2, flutterDepth: 0.003, mix: 0.85 },
  'Mastering sheen':   { drive: 1.2, evenHarmonics: 0.04, oddHarmonics: 0.02, hfRolloff: 0.1, headBumpDb: 0.8, mix: 0.5 },
};
