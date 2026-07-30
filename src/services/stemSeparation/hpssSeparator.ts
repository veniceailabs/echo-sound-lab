/**
 * ESL HPSS Stem Separation — HPSS Separator
 *
 * Harmonic-Percussive Source Separation using median filtering and
 * soft Wiener masks in the STFT domain.
 *
 * Reference: Fitzgerald, D. (2010). "Harmonic/Percussive Separation Using
 * Median Filtering." DAFx-2010.
 */

import { stft, istft } from './stft';
import { medianFilterRows, medianFilterCols } from './medianFilter';

export interface HPSSResult {
  harmonic: Float32Array;   // time-domain harmonic output
  percussive: Float32Array; // time-domain percussive output
  residual: Float32Array;   // remainder
}

export interface HPSSOptions {
  fftSize?: number;          // default 2048
  hopSize?: number;          // default 512
  harmonicKernel?: number;   // median kernel along time (frames), default 31
  percussiveKernel?: number; // median kernel along freq (bins), default 31
  power?: number;            // Wiener exponent, default 2
}

/**
 * Separate a mono signal into harmonic, percussive, and residual components.
 *
 * @param signal     Mono time-domain signal
 * @param sampleRate Sample rate in Hz (used for progress only)
 * @param options    HPSS tuning parameters
 */
export async function hpssSeparate(
  signal: Float32Array,
  sampleRate: number,
  options?: HPSSOptions
): Promise<HPSSResult> {
  const fftSize = options?.fftSize ?? 2048;
  const hopSize = options?.hopSize ?? 512;
  const harmonicKernel = options?.harmonicKernel ?? 31;
  const percussiveKernel = options?.percussiveKernel ?? 31;
  const power = options?.power ?? 2;

  // Yield to event loop between heavy stages
  await new Promise<void>((r) => setTimeout(r, 0));

  // ── Step 1: STFT ────────────────────────────────────────────────────────
  const { real, imag, frames } = stft(signal, fftSize, hopSize);
  const numBins = fftSize / 2 + 1;

  // ── Step 2: Magnitude spectrogram |X[t,f]| ──────────────────────────────
  const mag: Float32Array[] = [];
  for (let t = 0; t < frames; t++) {
    const m = new Float32Array(numBins);
    for (let f = 0; f < numBins; f++) {
      m[f] = Math.sqrt(real[t][f] ** 2 + imag[t][f] ** 2);
    }
    mag.push(m);
  }

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── Step 3: Harmonic estimate via time-axis (row) median filter ──────────
  const H = medianFilterRows(mag, harmonicKernel);

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── Step 4: Percussive estimate via freq-axis (col) median filter ────────
  const P = medianFilterCols(mag, percussiveKernel);

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── Step 5: Soft Wiener masks ────────────────────────────────────────────
  //   H_mask = H^p / (H^p + P^p + ε)
  //   P_mask = P^p / (H^p + P^p + ε)
  //   R_mask = max(0, 1 - H_mask - P_mask)
  const eps = 1e-6;

  const harmonicReal: Float32Array[] = [];
  const harmonicImag: Float32Array[] = [];
  const percussiveReal: Float32Array[] = [];
  const percussiveImag: Float32Array[] = [];
  const residualReal: Float32Array[] = [];
  const residualImag: Float32Array[] = [];

  for (let t = 0; t < frames; t++) {
    const hRe = new Float32Array(numBins);
    const hIm = new Float32Array(numBins);
    const pRe = new Float32Array(numBins);
    const pIm = new Float32Array(numBins);
    const rRe = new Float32Array(numBins);
    const rIm = new Float32Array(numBins);

    for (let f = 0; f < numBins; f++) {
      const hp = H[t][f] ** power;
      const pp = P[t][f] ** power;
      const denom = hp + pp + eps;
      const hMask = hp / denom;
      const pMask = pp / denom;
      const rMask = Math.max(0, 1 - hMask - pMask);

      hRe[f] = real[t][f] * hMask;
      hIm[f] = imag[t][f] * hMask;
      pRe[f] = real[t][f] * pMask;
      pIm[f] = imag[t][f] * pMask;
      rRe[f] = real[t][f] * rMask;
      rIm[f] = imag[t][f] * rMask;
    }

    harmonicReal.push(hRe);
    harmonicImag.push(hIm);
    percussiveReal.push(pRe);
    percussiveImag.push(pIm);
    residualReal.push(rRe);
    residualImag.push(rIm);
  }

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── Step 6: ISTFT each masked spectrogram ───────────────────────────────
  const sigLen = signal.length;
  const harmonic = istft(harmonicReal, harmonicImag, fftSize, hopSize, sigLen);
  const percussive = istft(percussiveReal, percussiveImag, fftSize, hopSize, sigLen);
  const residual = istft(residualReal, residualImag, fftSize, hopSize, sigLen);

  // Suppress unused variable (sampleRate available for future logging)
  void sampleRate;

  return { harmonic, percussive, residual };
}
