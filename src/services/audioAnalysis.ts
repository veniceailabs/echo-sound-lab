/**
 * audioAnalysis.ts — Real-time audio feature extraction
 *
 * BPM detection via autocorrelation (no external deps)
 * Musical key detection via chromagram + Krumhansl-Schmuckler profiles
 * Loudness timeline (400ms LUFS blocks across the track)
 * All processing is offline (OfflineAudioContext or pure Float32Array math)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BPMResult {
  bpm: number;           // detected tempo
  confidence: number;    // 0–1
  candidates: number[];  // top 3 alternates
}

export interface KeyResult {
  key: string;           // e.g. "C Major" or "A Minor"
  root: string;          // e.g. "C"
  mode: 'major' | 'minor';
  confidence: number;    // 0–1
  chromagram: number[];  // 12 pitch class energies (C, C#, D, …)
}

export interface LoudnessBlock {
  timeMs: number;
  lufs: number;
}

export interface FullAnalysisResult {
  bpm: BPMResult;
  key: KeyResult;
  loudnessTimeline: LoudnessBlock[];
  duration: number;
  sampleRate: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// ─── BPM Detection (autocorrelation) ─────────────────────────────────────────

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const L = buffer.getChannelData(0);
  if (buffer.numberOfChannels === 1) return L.slice();
  const R = buffer.getChannelData(1);
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  return mono;
}

function computeOnsetEnvelope(mono: Float32Array, sr: number): Float32Array {
  // Half-wave rectified spectral flux as onset envelope
  const hopSize = Math.floor(sr * 0.01); // 10ms hops
  const winSize = hopSize * 4;
  const frames = Math.floor((mono.length - winSize) / hopSize);
  const envelope = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    const start = f * hopSize;
    let energy = 0;
    for (let i = 0; i < winSize; i++) energy += mono[start + i] * mono[start + i];
    envelope[f] = Math.sqrt(energy / winSize);
  }

  // First-order difference (flux)
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    flux[f] = Math.max(0, envelope[f] - envelope[f - 1]);
  }
  return flux;
}

function autocorrelate(signal: Float32Array, minLag: number, maxLag: number): Float32Array {
  const result = new Float32Array(maxLag - minLag);
  const N = signal.length;
  for (let lag = minLag; lag < maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < N; i++) sum += signal[i] * signal[i + lag];
    result[lag - minLag] = sum / (N - lag);
  }
  return result;
}

export function detectBPM(buffer: AudioBuffer): BPMResult {
  const sr = buffer.sampleRate;
  const mono = downmixToMono(buffer);

  // Limit to first 60s for speed
  const maxSamples = Math.min(mono.length, sr * 60);
  const trimmed = mono.subarray(0, maxSamples);

  const hopSize = Math.floor(sr * 0.01);
  const flux = computeOnsetEnvelope(trimmed, sr);

  // BPM range 60–200 → lag range in flux frames
  const fluxSr = sr / hopSize; // frames per second in flux domain
  const minLag = Math.floor(fluxSr * (60 / 200)); // 200 BPM
  const maxLag = Math.floor(fluxSr * (60 / 60));  // 60 BPM

  if (maxLag <= minLag || flux.length < maxLag) {
    return { bpm: 120, confidence: 0, candidates: [120] };
  }

  const acf = autocorrelate(flux, minLag, maxLag);

  // Find top peaks
  const peaks: Array<{ lag: number; value: number }> = [];
  for (let i = 1; i < acf.length - 1; i++) {
    if (acf[i] > acf[i - 1] && acf[i] > acf[i + 1]) {
      peaks.push({ lag: i + minLag, value: acf[i] });
    }
  }
  peaks.sort((a, b) => b.value - a.value);

  if (peaks.length === 0) return { bpm: 120, confidence: 0, candidates: [120] };

  const topPeaks = peaks.slice(0, 5);
  const bpmFromLag = (lag: number) => (fluxSr * 60) / lag;

  // Round to nearest 0.5 BPM
  const round = (x: number) => Math.round(x * 2) / 2;

  const primaryBPM = round(bpmFromLag(topPeaks[0].lag));
  const candidates = topPeaks.map(p => round(bpmFromLag(p.lag)));

  // Confidence: how much stronger is the top peak vs the mean?
  const maxVal = topPeaks[0].value;
  const meanVal = acf.reduce((a, b) => a + b, 0) / acf.length;
  const confidence = Math.min(1, (maxVal - meanVal) / (maxVal + 0.0001) * 2);

  return { bpm: primaryBPM, confidence, candidates };
}

// ─── Key Detection (Krumhansl-Schmuckler) ─────────────────────────────────────

function buildChromagram(buffer: AudioBuffer): number[] {
  const sr = buffer.sampleRate;
  const mono = downmixToMono(buffer);

  // Use first 30s
  const maxSamples = Math.min(mono.length, sr * 30);
  const chroma = new Array(12).fill(0);

  // Simple constant-Q via tuned sine/cosine bank
  const fRef = 27.5; // A0 in Hz
  const hopSize = 512;
  const winSize = 4096;

  // For each of 7 octaves × 12 notes = 84 bins, accumulate energy
  for (let octave = 2; octave < 7; octave++) {
    for (let pc = 0; pc < 12; pc++) {
      const freq = fRef * Math.pow(2, (octave * 12 + pc) / 12.0);
      if (freq > sr / 2) continue;

      let energy = 0;
      let count = 0;

      for (let hop = 0; hop + winSize < maxSamples; hop += hopSize) {
        let re = 0, im = 0;
        const omega = 2 * Math.PI * freq / sr;
        for (let i = 0; i < winSize; i++) {
          const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / winSize); // Hann
          re += mono[hop + i] * window * Math.cos(omega * i);
          im += mono[hop + i] * window * Math.sin(omega * i);
        }
        energy += re * re + im * im;
        count++;
      }

      chroma[pc] += count > 0 ? energy / count : 0;
    }
  }

  // Normalize
  const max = Math.max(...chroma);
  return max > 0 ? chroma.map(v => v / max) : chroma;
}

function pearsonCorr(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db; denA += da * da; denB += db * db;
  }
  return Math.sqrt(denA * denB) > 0 ? num / Math.sqrt(denA * denB) : 0;
}

export function detectKey(buffer: AudioBuffer): KeyResult {
  const chroma = buildChromagram(buffer);

  let bestKey = 0;
  let bestMode: 'major' | 'minor' = 'major';
  let bestCorr = -Infinity;

  for (let root = 0; root < 12; root++) {
    // Rotate profiles
    const rotatedMajor = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - root + 12) % 12]);
    const rotatedMinor = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - root + 12) % 12]);

    const corrMajor = pearsonCorr(chroma, rotatedMajor);
    const corrMinor = pearsonCorr(chroma, rotatedMinor);

    if (corrMajor > bestCorr) { bestCorr = corrMajor; bestKey = root; bestMode = 'major'; }
    if (corrMinor > bestCorr) { bestCorr = corrMinor; bestKey = root; bestMode = 'minor'; }
  }

  const confidence = Math.max(0, Math.min(1, (bestCorr + 1) / 2));
  const root = NOTE_NAMES[bestKey];
  const mode = bestMode;
  const key = `${root} ${mode === 'major' ? 'Major' : 'Minor'}`;

  return { key, root, mode, confidence, chromagram: chroma };
}

// ─── Loudness Timeline ────────────────────────────────────────────────────────

export function computeLoudnessTimeline(buffer: AudioBuffer, blockMs = 400): LoudnessBlock[] {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const blockSize = Math.floor(sr * blockMs / 1000);
  const blocks: LoudnessBlock[] = [];
  const totalBlocks = Math.floor(buffer.length / blockSize);

  for (let b = 0; b < totalBlocks; b++) {
    const start = b * blockSize;
    let sum = 0;
    for (let i = 0; i < blockSize; i++) {
      sum += L[start + i] * L[start + i] + R[start + i] * R[start + i];
    }
    const rms = Math.sqrt(sum / (blockSize * 2));
    // Approximate LUFS (integrated = RMS - 0.691 dB)
    const lufs = rms > 0.0001 ? 20 * Math.log10(rms) - 0.691 : -70;
    blocks.push({ timeMs: b * blockMs, lufs });
  }

  return blocks;
}

// ─── Full analysis (runs all three) ──────────────────────────────────────────

export async function analyzeAudio(buffer: AudioBuffer): Promise<FullAnalysisResult> {
  // Run sync operations (no await needed — all pure Float32Array math)
  const bpm = detectBPM(buffer);
  const key = detectKey(buffer);
  const loudnessTimeline = computeLoudnessTimeline(buffer);

  return {
    bpm,
    key,
    loudnessTimeline,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
  };
}
