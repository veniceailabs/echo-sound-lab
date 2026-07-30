/**
 * Auto Genre Detector — classify genre from raw audio features.
 *
 * No ML model required. Uses spectral + temporal features that are
 * statistically reliable for major genre classes:
 *
 *  Feature set:
 *    - Spectral centroid  (brightness → pop/electronic vs jazz/acoustic)
 *    - Sub-bass energy    (60Hz band → trap/hip-hop vs pop/rock)
 *    - Kick presence      (50-120Hz transient density → EDM/trap)
 *    - Hi-hat density     (8-16kHz event rate → trap vs rock)
 *    - Tempo              (BPM → ~70-80 = hip-hop/RnB, ~140+ = EDM)
 *    - Dynamic range      (loud/compressed → pop, wide → jazz/classical)
 *    - Harmonic richness  (low-mid energy ratio → rock vs trap)
 *
 * Returns: Genre + confidence + detected BPM + spectral centroid
 */

export type Genre =
  | 'hip_hop' | 'trap' | 'pop' | 'rnb'
  | 'rock' | 'electronic' | 'jazz' | 'classical';

export interface GenreDetectionResult {
  genre: Genre;
  confidence: number;   // 0–1
  bpm: number;
  spectralCentroid: number;   // Hz
  subBassRatio: number;
  dynamicRange: number;
  scores: Record<Genre, number>;
}

// ─── FEATURE EXTRACTION ───────────────────────────────────────────────────────

function monoMix(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) out[i] += ch[i]!;
  }
  const scale = 1 / buffer.numberOfChannels;
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}

function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i]! ** 2);
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return 20 * Math.log10(Math.max(rms, 1e-9));
}

function peakDb(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  return 20 * Math.log10(Math.max(peak, 1e-9));
}

/**
 * Spectral centroid via Goertzel algorithm on frequency bands.
 * Returns the weighted center frequency in Hz.
 */
function spectralCentroid(samples: Float32Array, sr: number): number {
  const windowSize = Math.min(4096, samples.length);
  // Pick the loudest window
  let bestStart = 0, bestEnergy = 0;
  const hop = Math.max(1, Math.floor(windowSize / 4));
  for (let s = 0; s <= samples.length - windowSize; s += hop) {
    let e = 0;
    for (let i = 0; i < windowSize; i++) e += samples[s + i]! ** 2;
    if (e > bestEnergy) { bestEnergy = e; bestStart = s; }
  }
  const win = samples.subarray(bestStart, bestStart + windowSize);

  // Compute FFT magnitudes via DFT on 64 log-spaced bins from 60–18000 Hz
  let weightedFreq = 0, totalMag = 0;
  const nBins = 64;
  for (let b = 0; b < nBins; b++) {
    const freq = 60 * Math.exp((b / (nBins - 1)) * Math.log(18000 / 60));
    const omega = (2 * Math.PI * freq) / sr;
    let s1 = 0, s2 = 0;
    const coeff = 2 * Math.cos(omega);
    for (let i = 0; i < win.length; i++) {
      const s = win[i]! + coeff * s1 - s2;
      s2 = s1; s1 = s;
    }
    const mag = Math.sqrt(s2 * s2 + s1 * s1 - coeff * s1 * s2);
    weightedFreq += freq * mag;
    totalMag += mag;
  }
  return totalMag > 0 ? weightedFreq / totalMag : 2000;
}

/**
 * Band energy ratio (energy in [loHz, hiHz] / total energy).
 */
function bandEnergyRatio(samples: Float32Array, sr: number, loHz: number, hiHz: number): number {
  const windowSize = Math.min(2048, samples.length);
  let bandEnergy = 0, totalEnergy = 0;
  const step = Math.max(1, Math.floor(samples.length / 20));

  for (let start = 0; start <= samples.length - windowSize; start += step * windowSize) {
    const win = samples.subarray(start, start + windowSize);
    for (let b = 0; b < 32; b++) {
      const freq = loHz + (b / 31) * (hiHz - loHz);
      const omega = (2 * Math.PI * freq) / sr;
      let s1 = 0, s2 = 0;
      const coeff = 2 * Math.cos(omega);
      for (let i = 0; i < win.length; i++) {
        const s = win[i]! + coeff * s1 - s2;
        s2 = s1; s1 = s;
      }
      const mag = Math.sqrt(s2 * s2 + s1 * s1 - coeff * s1 * s2);
      bandEnergy += mag * mag;
    }
    // Total energy across broader range 60–18000
    for (let i = 0; i < win.length; i++) totalEnergy += win[i]! ** 2;
    break; // One window is enough for ratio estimation
  }

  return totalEnergy > 0 ? Math.min(bandEnergy / (totalEnergy * 32 + 1e-10), 1) : 0;
}

/**
 * Transient density: count sharp onset events per second.
 * High density (>4/s) = drums, trap hi-hats.
 * Low density (<1/s) = sustained, jazz/classical.
 */
function transientDensity(samples: Float32Array, sr: number): number {
  const frameSamples = Math.max(1, Math.floor(0.01 * sr)); // 10ms frames
  const nFrames = Math.floor(samples.length / frameSamples);
  let onsets = 0;
  let prevEnergy = 0;

  for (let i = 0; i < nFrames; i++) {
    let energy = 0;
    for (let j = 0; j < frameSamples; j++) {
      energy += samples[i * frameSamples + j]! ** 2;
    }
    energy /= frameSamples;
    if (energy > prevEnergy * 1.8 && energy > 1e-5) onsets++;
    prevEnergy = energy;
  }

  const durationSeconds = samples.length / sr;
  return durationSeconds > 0 ? onsets / durationSeconds : 0;
}

/**
 * Estimate BPM via onset autocorrelation (fast version for genre detection).
 */
function estimateBpm(samples: Float32Array, sr: number): number {
  const frameSamples = Math.max(1, Math.floor(0.01 * sr));
  const nFrames = Math.min(800, Math.floor(samples.length / frameSamples)); // 8 seconds max
  const onset = new Float32Array(nFrames);
  let prev = 0;

  for (let i = 0; i < nFrames; i++) {
    let energy = 0;
    for (let j = 0; j < frameSamples; j++) energy += samples[i * frameSamples + j]! ** 2;
    energy /= frameSamples;
    onset[i] = Math.max(0, energy - prev);
    prev = energy;
  }

  const fps = sr / frameSamples;
  const lagMin = Math.max(1, Math.floor(fps * 60 / 200));
  const lagMax = Math.min(nFrames - 1, Math.floor(fps * 60 / 50));

  let bestLag = lagMin, bestAc = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let ac = 0;
    for (let i = 0; i < nFrames - lag; i++) ac += onset[i]! * onset[i + lag]!;
    if (ac > bestAc) { bestAc = ac; bestLag = lag; }
  }

  const bpm = fps * 60 / bestLag;
  // Harmonic correction
  if (bpm < 80 && bpm * 2 <= 200) return bpm * 2;
  if (bpm > 180 && bpm / 2 >= 60) return bpm / 2;
  return Math.max(60, Math.min(200, bpm));
}

// ─── GENRE CLASSIFIER ─────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Score each genre from 0–1 based on extracted features.
 * Higher score = better match.
 */
function scoreGenres(
  centroid:        number,
  subBassRatio:    number,
  midBassRatio:    number,   // 120–400 Hz
  hiHatRatio:      number,   // 8–16 kHz
  bpm:             number,
  dynamicRange:    number,   // peak - rms in dB
  transients:      number,   // onsets/second
): Record<Genre, number> {

  const scores: Record<Genre, number> = {
    hip_hop:    0, trap:       0, pop:        0, rnb:        0,
    rock:       0, electronic: 0, jazz:       0, classical:  0,
  };

  // ── hip_hop ──────────────────────────────────────────────────────────────
  // BPM 80–100, sub-bass heavy, moderate centroid, dense but not insane transients
  scores.hip_hop = clamp(
    (bpm >= 75 && bpm <= 105 ? 0.35 : 0) +
    subBassRatio * 0.30 +
    (centroid < 3500 ? 0.20 : 0) +
    (dynamicRange < 14 ? 0.15 : 0),
    0, 1
  );

  // ── trap ──────────────────────────────────────────────────────────────────
  // BPM 120–160 (half-time feel), huge sub-bass, hi-hat density, compressed
  scores.trap = clamp(
    (bpm >= 115 && bpm <= 165 ? 0.30 : 0) +
    subBassRatio * 0.35 +
    hiHatRatio * 0.20 +
    (dynamicRange < 10 ? 0.15 : 0),
    0, 1
  );

  // ── pop ───────────────────────────────────────────────────────────────────
  // BPM 100–130, balanced centroid, moderate compression, bright
  scores.pop = clamp(
    (bpm >= 95 && bpm <= 135 ? 0.25 : 0) +
    (centroid >= 2500 && centroid <= 5500 ? 0.25 : 0) +
    (dynamicRange >= 6 && dynamicRange <= 12 ? 0.25 : 0) +
    midBassRatio * 0.10 +
    0.15,   // baseline — pop is a catch-all
    0, 1
  );

  // ── rnb ───────────────────────────────────────────────────────────────────
  // BPM 60–100, mid-bass warmth, smooth dynamics, lower centroid
  scores.rnb = clamp(
    (bpm >= 55 && bpm <= 105 ? 0.30 : 0) +
    midBassRatio * 0.25 +
    (centroid >= 1500 && centroid <= 3500 ? 0.25 : 0) +
    subBassRatio * 0.20,
    0, 1
  );

  // ── rock ──────────────────────────────────────────────────────────────────
  // BPM 120–170, mid-heavy, wide dynamic range, dense transients
  scores.rock = clamp(
    (bpm >= 115 && bpm <= 175 ? 0.25 : 0) +
    midBassRatio * 0.30 +
    (dynamicRange > 12 ? 0.20 : 0) +
    (transients > 4 ? 0.15 : 0) +
    (centroid >= 2000 && centroid <= 5000 ? 0.10 : 0),
    0, 1
  );

  // ── electronic ────────────────────────────────────────────────────────────
  // BPM 120–145, bright centroid, compressed, hi-hat activity
  scores.electronic = clamp(
    (bpm >= 118 && bpm <= 148 ? 0.30 : 0) +
    (centroid > 4000 ? 0.25 : 0) +
    hiHatRatio * 0.20 +
    (dynamicRange < 10 ? 0.15 : 0) +
    subBassRatio * 0.10,
    0, 1
  );

  // ── jazz ──────────────────────────────────────────────────────────────────
  // Variable BPM, wide dynamic range, mid-heavy, low transient density
  scores.jazz = clamp(
    (dynamicRange > 14 ? 0.35 : 0) +
    (transients < 3 ? 0.25 : 0) +
    midBassRatio * 0.20 +
    (centroid >= 1200 && centroid <= 4000 ? 0.10 : 0) +
    (subBassRatio < 0.1 ? 0.10 : 0),
    0, 1
  );

  // ── classical ─────────────────────────────────────────────────────────────
  // Wide dynamic range, low sub-bass, high centroid (strings/winds), low transients
  scores.classical = clamp(
    (dynamicRange > 18 ? 0.35 : 0) +
    (subBassRatio < 0.05 ? 0.25 : 0) +
    (transients < 2 ? 0.20 : 0) +
    (centroid > 3000 ? 0.10 : 0) +
    (bpm < 100 || bpm > 160 ? 0.10 : 0),   // classical tempos are often extreme
    0, 1
  );

  return scores;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export class GenreDetector {
  /**
   * Detect genre from an AudioBuffer.
   * Analyzes up to 30 seconds (enough for reliable classification).
   */
  static detect(buffer: AudioBuffer): GenreDetectionResult {
    const sr = buffer.sampleRate;
    // Work on first 30s to keep it fast
    const maxSamples = Math.min(buffer.length, sr * 30);
    const fullMono = monoMix(buffer);
    const mono = fullMono.subarray(0, maxSamples);

    const centroid      = spectralCentroid(mono, sr);
    const subBassRatio  = bandEnergyRatio(mono, sr, 20, 80);
    const midBassRatio  = bandEnergyRatio(mono, sr, 120, 400);
    const hiHatRatio    = bandEnergyRatio(mono, sr, 8000, 16000);
    const bpm           = estimateBpm(mono, sr);
    const dR            = Math.max(0, peakDb(mono) - rmsDb(mono));
    const transients    = transientDensity(mono, sr);

    const scores = scoreGenres(
      centroid, subBassRatio, midBassRatio, hiHatRatio, bpm, dR, transients
    );

    // Pick winner
    let bestGenre: Genre = 'pop';
    let bestScore = 0;
    for (const [g, s] of Object.entries(scores)) {
      if (s > bestScore) { bestScore = s; bestGenre = g as Genre; }
    }

    // Normalise confidence to 0–1 (0 = all genres equally likely)
    const sortedScores = Object.values(scores).sort((a, b) => b - a);
    const margin = (sortedScores[0]! - (sortedScores[1] ?? 0));
    const confidence = clamp(0.4 + margin * 2.0, 0.3, 0.95);

    return {
      genre:           bestGenre,
      confidence,
      bpm,
      spectralCentroid: centroid,
      subBassRatio,
      dynamicRange:    dR,
      scores,
    };
  }
}

export const genreDetector = GenreDetector;
