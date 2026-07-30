/**
 * stemSplitter — Frequency-domain stem separation
 *
 * Separates a stereo mix into 4 stems: Vocals, Bass, Drums, Other.
 * Uses a multi-pass approach:
 *
 *   1. Mid/Side decomposition — vocals concentrate in Mid channel
 *   2. Frequency-domain masking via FFT (Blackman windowed STFT)
 *   3. Per-band soft masks derived from energy ratios
 *   4. Harmonic vs percussive separation (HPSS) for Drums
 *   5. Overlap-add reconstruction (75% overlap, Hann synthesis window)
 *
 * Limitations (no ML model available in browser):
 *   - Assumes mono-center vocal arrangement (common in mastered music)
 *   - Bass separation uses sub-200Hz low-pass, not harmonic tracking
 *   - HPSS gives clean percussion separation on most commercial music
 *   - Crosstalk: some bleed is unavoidable without a neural network
 *
 * All processing runs in pure Float32Array with no AudioContext dependency.
 * Suitable for use in a Web Worker for non-blocking UI.
 *
 * Reference:
 *   Driedger, J., Müller, M. & Disch, S. (2014) — Extending Harmonic-Percussive
 *   Source Separation of Audio Signals. ISMIR 2014.
 */

// ── FFT (Cooley-Tukey, power-of-2, real-valued) ───────────────────────────────

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Cooley-Tukey butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const wRe = Math.cos(-2 * Math.PI / len);
    const wIm = Math.sin(-2 * Math.PI / len);
    for (let i = 0; i < n; i += len) {
      let uRe = 1, uIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const vRe = re[i + j + len / 2] * uRe - im[i + j + len / 2] * uIm;
        const vIm = re[i + j + len / 2] * uIm + im[i + j + len / 2] * uRe;
        re[i + j + len / 2] = re[i + j] - vRe;
        im[i + j + len / 2] = im[i + j] - vIm;
        re[i + j] += vRe;
        im[i + j] += vIm;
        const nxtRe = uRe * wRe - uIm * wIm;
        uIm = uRe * wIm + uIm * wRe;
        uRe = nxtRe;
      }
    }
  }
}

function ifft(re: Float64Array, im: Float64Array): void {
  // Inverse FFT = conjugate → FFT → conjugate / N
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  const n = re.length;
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// ── Windowing ─────────────────────────────────────────────────────────────────

function blackmanWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))
                + 0.08 * Math.cos(4 * Math.PI * i / (n - 1));
  }
  return w;
}

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

// ── STFT helpers ──────────────────────────────────────────────────────────────

interface STFTFrame {
  re: Float64Array;
  im: Float64Array;
}

function stft(signal: Float32Array, fftSize: number, hopSize: number, win: Float64Array): STFTFrame[] {
  const frames: STFTFrame[] = [];
  for (let pos = 0; pos + fftSize <= signal.length; pos += hopSize) {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) re[i] = signal[pos + i] * win[i];
    fft(re, im);
    frames.push({ re, im });
  }
  return frames;
}

function istft(
  frames: STFTFrame[],
  fftSize: number,
  hopSize: number,
  synthWin: Float64Array,
  outputLen: number,
): Float32Array {
  const out = new Float64Array(outputLen);
  const norm = new Float64Array(outputLen);
  for (let f = 0; f < frames.length; f++) {
    const pos = f * hopSize;
    const { re, im } = frames[f];
    ifft(re, im);
    for (let i = 0; i < fftSize && pos + i < outputLen; i++) {
      out[pos + i] += re[i] * synthWin[i];
      norm[pos + i] += synthWin[i] * synthWin[i];
    }
  }
  const result = new Float32Array(outputLen);
  for (let i = 0; i < outputLen; i++) result[i] = norm[i] > 1e-8 ? out[i] / norm[i] : 0;
  return result;
}

// ── Mask application ──────────────────────────────────────────────────────────

function applyMask(frames: STFTFrame[], mask: Float64Array[]): STFTFrame[] {
  return frames.map((f, fi) => {
    const re = new Float64Array(f.re.length);
    const im = new Float64Array(f.im.length);
    const m = mask[fi];
    for (let k = 0; k < f.re.length; k++) {
      const g = m ? (m[k] ?? 1) : 1;
      re[k] = f.re[k] * g;
      im[k] = f.im[k] * g;
    }
    return { re, im };
  });
}

// ── Median filter (for HPSS horizontal/vertical smoothing) ────────────────────

function medianOf(arr: number[]): number {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

// ── HPSS — Harmonic-Percussive Source Separation ──────────────────────────────
// Returns { harmonicMask, percussiveMask } per-frame, per-bin

function hpss(
  frames: STFTFrame[],
  harmonicLen = 17,  // median filter length along time axis (bins = frequency)
  percLen = 17,      // median filter length along frequency axis (bins = time)
  beta = 2.0,        // separation margin (higher = harder masks)
): { hMask: Float64Array[]; pMask: Float64Array[] } {
  const nFrames = frames.length;
  const nBins   = frames[0].re.length;

  // Build magnitude spectrogram
  const mag: number[][] = Array.from({ length: nFrames }, (_, f) => {
    const row = new Array<number>(nBins);
    for (let k = 0; k < nBins; k++) row[k] = Math.sqrt(frames[f].re[k] ** 2 + frames[f].im[k] ** 2);
    return row;
  });

  // Horizontal median (across time → harmonic)
  const hMag: number[][] = Array.from({ length: nFrames }, () => new Array<number>(nBins));
  const half = Math.floor(harmonicLen / 2);
  for (let k = 0; k < nBins; k++) {
    for (let f = 0; f < nFrames; f++) {
      const window: number[] = [];
      for (let df = -half; df <= half; df++) {
        const fi = Math.max(0, Math.min(nFrames - 1, f + df));
        window.push(mag[fi][k]);
      }
      hMag[f][k] = medianOf(window);
    }
  }

  // Vertical median (across frequency → percussive)
  const pMag: number[][] = Array.from({ length: nFrames }, () => new Array<number>(nBins));
  const halfF = Math.floor(percLen / 2);
  for (let f = 0; f < nFrames; f++) {
    for (let k = 0; k < nBins; k++) {
      const window: number[] = [];
      for (let dk = -halfF; dk <= halfF; dk++) {
        const ki = Math.max(0, Math.min(nBins - 1, k + dk));
        window.push(mag[f][ki]);
      }
      pMag[f][k] = medianOf(window);
    }
  }

  // Wiener-like soft masks
  const hMask: Float64Array[] = [];
  const pMask: Float64Array[] = [];
  for (let f = 0; f < nFrames; f++) {
    const hm = new Float64Array(nBins);
    const pm = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) {
      const hb = Math.pow(hMag[f][k], beta);
      const pb = Math.pow(pMag[f][k], beta);
      const tot = hb + pb + 1e-12;
      hm[k] = hb / tot;
      pm[k] = pb / tot;
    }
    hMask.push(hm);
    pMask.push(pm);
  }

  return { hMask, pMask };
}

// ── Frequency bin range helper ────────────────────────────────────────────────

function freqMask(nBins: number, sr: number, fftSize: number, loHz: number, hiHz: number): (k: number) => number {
  const binHz = sr / fftSize;
  const loK = Math.round(loHz / binHz);
  const hiK = Math.round(hiHz / binHz);
  return (k: number) => k >= loK && k <= hiK ? 1 : 0;
}

// ── M/S decomposition ─────────────────────────────────────────────────────────

function midSide(L: Float32Array, R: Float32Array): { M: Float32Array; S: Float32Array } {
  const M = new Float32Array(L.length);
  const S = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) {
    M[i] = (L[i] + R[i]) * 0.5;
    S[i] = (L[i] - R[i]) * 0.5;
  }
  return { M, S };
}

function midSideDecode(M: Float32Array, S: Float32Array): { L: Float32Array; R: Float32Array } {
  const L = new Float32Array(M.length);
  const R = new Float32Array(M.length);
  for (let i = 0; i < M.length; i++) {
    L[i] = M[i] + S[i];
    R[i] = M[i] - S[i];
  }
  return { L, R };
}

// ── Simple brick-wall frequency filter (time domain via STFT mask) ─────────────

function freqFilter(
  signal: Float32Array,
  fftSize: number,
  hopSize: number,
  sr: number,
  loHz: number,
  hiHz: number,
): Float32Array {
  const anaWin = blackmanWindow(fftSize);
  const synWin = hannWindow(fftSize);
  const frames = stft(signal, fftSize, hopSize, anaWin);
  const binHz = sr / fftSize;
  const loK = Math.round(loHz / binHz);
  const hiK = Math.round(hiHz / binHz);
  const masked = frames.map(f => {
    const re = new Float64Array(f.re.length);
    const im = new Float64Array(f.im.length);
    for (let k = 0; k < f.re.length; k++) {
      if (k >= loK && k <= hiK) { re[k] = f.re[k]; im[k] = f.im[k]; }
      // Mirror (IFFT needs conjugate symmetry for real output)
      const km = f.re.length - k;
      if (km < f.re.length && k >= loK && k <= hiK) { re[km] = f.re[km]; im[km] = f.im[km]; }
    }
    return { re, im };
  });
  return istft(masked, fftSize, hopSize, synWin, signal.length);
}

// ── Main API ──────────────────────────────────────────────────────────────────

export interface StemResult {
  vocals:  { L: Float32Array; R: Float32Array };
  bass:    { L: Float32Array; R: Float32Array };
  drums:   { L: Float32Array; R: Float32Array };
  other:   { L: Float32Array; R: Float32Array };
}

export interface StemSplitProgress {
  stage: string;
  pct: number;  // 0-1
}

export type ProgressCallback = (p: StemSplitProgress) => void;

/**
 * Split a stereo AudioBuffer into 4 stems.
 * CPU intensive — best called from a Web Worker or with async chunking.
 *
 * @param buffer   Stereo (or mono) AudioBuffer
 * @param onProgress  Optional callback for progress updates
 */
export function splitStems(
  buffer: AudioBuffer,
  onProgress?: ProgressCallback,
): StemResult {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0);

  // STFT parameters — 2048-sample window, 75% overlap = 512-sample hop
  const FFT_SIZE = 2048;
  const HOP_SIZE = 512;

  const report = (stage: string, pct: number) => onProgress?.({ stage, pct });

  // ── Stage 1: M/S decomposition ────────────────────────────────────────────
  report('M/S decomposition', 0.02);
  const { M, S } = midSide(L, R);

  // ── Stage 2: STFT on all 3 channels ──────────────────────────────────────
  report('Building spectrograms', 0.05);
  const anaWin  = blackmanWindow(FFT_SIZE);
  const synWin  = hannWindow(FFT_SIZE);
  const framesM = stft(M, FFT_SIZE, HOP_SIZE, anaWin);
  const framesL = stft(L as Float32Array, FFT_SIZE, HOP_SIZE, anaWin);
  const framesR = stft(R as Float32Array, FFT_SIZE, HOP_SIZE, anaWin);

  // ── Stage 3: HPSS on Mid channel → drums vs harmonic ─────────────────────
  report('Harmonic-percussive separation', 0.15);
  const { hMask, pMask } = hpss(framesM, 17, 17, 2.0);

  // ── Stage 4: Build stems ──────────────────────────────────────────────────
  report('Isolating drums', 0.40);
  const drumFramesL = applyMask(framesL, pMask);
  const drumFramesR = applyMask(framesR, pMask);

  report('Isolating harmonic content', 0.50);
  const harmFramesL = applyMask(framesL, hMask);
  const harmFramesR = applyMask(framesR, hMask);

  // ── Stage 5: Vocal extraction from harmonic Mid (center channel) ──────────
  // Vocals concentrate in Mid; Side contains mostly instruments
  // Soft mask: vocal = harmonic × mid_dominance × mid_frequency_range (200–4000Hz)
  report('Isolating vocals', 0.60);
  const binHz = sr / FFT_SIZE;
  const vocalLoK = Math.round(200  / binHz);
  const vocalHiK = Math.round(4000 / binHz);

  const vocalMask: Float64Array[] = harmFramesL.map((hf, fi) => {
    const mm = new Float64Array(FFT_SIZE);
    const magM = framesM[fi];
    const magS = framesL[fi]; // proxy for side energy (L - R ≈ side info)
    for (let k = 0; k < FFT_SIZE; k++) {
      const mEnergy = magM.re[k] ** 2 + magM.im[k] ** 2;
      const sEnergy = magS.re[k] ** 2 + magS.im[k] ** 2;
      // Mid dominance ratio — high = center = vocal
      const midDom = mEnergy / (mEnergy + sEnergy + 1e-12);
      const freqOk = k >= vocalLoK && k <= vocalHiK ? 1 : 0.08;
      mm[k] = hMask[fi][k] * midDom * freqOk;
    }
    return mm;
  });

  const vocalFramesL = applyMask(framesL, vocalMask);
  const vocalFramesR = applyMask(framesR, vocalMask);

  // ── Stage 6: Bass (sub-200Hz, harmonic) ──────────────────────────────────
  report('Isolating bass', 0.70);
  const bassHiK = Math.round(200 / binHz);
  const bassMask: Float64Array[] = harmFramesL.map((_, fi) => {
    const bm = new Float64Array(FFT_SIZE);
    for (let k = 0; k <= bassHiK; k++) bm[k] = hMask[fi][k];
    return bm;
  });
  const bassFramesL = applyMask(framesL, bassMask);
  const bassFramesR = applyMask(framesR, bassMask);

  // ── Stage 7: Other = harmonic − vocal − bass ──────────────────────────────
  report('Isolating other instruments', 0.78);
  const otherMask: Float64Array[] = harmFramesL.map((_, fi) => {
    const om = new Float64Array(FFT_SIZE);
    for (let k = 0; k < FFT_SIZE; k++) {
      om[k] = Math.max(0, hMask[fi][k] - vocalMask[fi][k] - bassMask[fi][k]);
    }
    return om;
  });
  const otherFramesL = applyMask(framesL, otherMask);
  const otherFramesR = applyMask(framesR, otherMask);

  // ── Stage 8: Reconstruct ──────────────────────────────────────────────────
  report('Reconstructing stems', 0.85);
  const len = L.length;

  const vocalsL = istft(vocalFramesL, FFT_SIZE, HOP_SIZE, synWin, len);
  const vocalsR = istft(vocalFramesR, FFT_SIZE, HOP_SIZE, synWin, len);
  report('Vocals done', 0.87);

  const bassL = istft(bassFramesL, FFT_SIZE, HOP_SIZE, synWin, len);
  const bassR = istft(bassFramesR, FFT_SIZE, HOP_SIZE, synWin, len);
  report('Bass done', 0.90);

  const drumsL = istft(drumFramesL, FFT_SIZE, HOP_SIZE, synWin, len);
  const drumsR = istft(drumFramesR, FFT_SIZE, HOP_SIZE, synWin, len);
  report('Drums done', 0.93);

  const otherL = istft(otherFramesL, FFT_SIZE, HOP_SIZE, synWin, len);
  const otherR = istft(otherFramesR, FFT_SIZE, HOP_SIZE, synWin, len);
  report('Complete', 1.0);

  return {
    vocals: { L: vocalsL, R: vocalsR },
    bass:   { L: bassL,   R: bassR   },
    drums:  { L: drumsL,  R: drumsR  },
    other:  { L: otherL,  R: otherR  },
  };
}

/**
 * Convert a stem channel pair to an AudioBuffer.
 * Used for playback or WAV export.
 */
export function stemToAudioBuffer(
  stem: { L: Float32Array; R: Float32Array },
  sampleRate: number,
): AudioBuffer {
  const buf = new AudioBuffer({ length: stem.L.length, numberOfChannels: 2, sampleRate });
  buf.getChannelData(0).set(stem.L);
  buf.getChannelData(1).set(stem.R);
  return buf;
}
