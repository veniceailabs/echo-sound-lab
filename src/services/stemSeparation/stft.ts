/**
 * ESL HPSS Stem Separation — STFT / ISTFT Module
 *
 * Short-Time Fourier Transform and its inverse using Hann windows.
 * ISTFT uses overlap-add with proper normalization.
 */

import { fft, ifft } from './fft';

/** Build a Hann window of given size */
function hannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return win;
}

export interface STFTResult {
  /** Real parts per frame: real[frame][bin] */
  real: Float32Array[];
  /** Imaginary parts per frame: imag[frame][bin] */
  imag: Float32Array[];
  /** Number of frames */
  frames: number;
}

/**
 * Short-Time Fourier Transform.
 *
 * @param signal   Input time-domain signal
 * @param fftSize  FFT length (must be power-of-2)
 * @param hopSize  Hop between frames in samples
 * @returns STFTResult with real/imag arrays indexed [frame][bin],
 *          where bin count = fftSize/2 + 1 (positive frequencies only)
 */
export function stft(
  signal: Float32Array,
  fftSize: number,
  hopSize: number
): STFTResult {
  const win = hannWindow(fftSize);
  const numBins = fftSize / 2 + 1;
  const frames = Math.floor((signal.length + fftSize) / hopSize);

  const real: Float32Array[] = [];
  const imag: Float32Array[] = [];

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let frame = 0; frame < frames; frame++) {
    const start = frame * hopSize - fftSize / 2;

    // Fill frame buffer with windowed signal (zero-pad boundaries)
    re.fill(0);
    im.fill(0);
    for (let n = 0; n < fftSize; n++) {
      const sigIdx = start + n;
      re[n] = (sigIdx >= 0 && sigIdx < signal.length) ? signal[sigIdx] * win[n] : 0;
    }

    fft(re, im);

    // Keep only positive frequencies (DC through Nyquist)
    const frameRe = new Float32Array(numBins);
    const frameIm = new Float32Array(numBins);
    for (let b = 0; b < numBins; b++) {
      frameRe[b] = re[b];
      frameIm[b] = im[b];
    }
    real.push(frameRe);
    imag.push(frameIm);
  }

  return { real, imag, frames };
}

/**
 * Inverse Short-Time Fourier Transform using overlap-add.
 *
 * @param real          Real parts per frame [frame][bin]
 * @param imag          Imaginary parts per frame [frame][bin]
 * @param fftSize       FFT length
 * @param hopSize       Hop between frames in samples
 * @param signalLength  Desired output length in samples
 * @returns Reconstructed time-domain signal
 */
export function istft(
  real: Float32Array[],
  imag: Float32Array[],
  fftSize: number,
  hopSize: number,
  signalLength: number
): Float32Array {
  const win = hannWindow(fftSize);
  const numBins = fftSize / 2 + 1;
  const frames = real.length;

  // Output accumulation buffers
  const output = new Float32Array(signalLength + fftSize);
  const windowSum = new Float32Array(signalLength + fftSize);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let frame = 0; frame < frames; frame++) {
    const start = frame * hopSize - fftSize / 2;

    // Mirror positive frequencies to negative (conjugate symmetry)
    re.fill(0);
    im.fill(0);
    for (let b = 0; b < numBins; b++) {
      re[b] = real[frame][b];
      im[b] = imag[frame][b];
    }
    // Mirror: bins fftSize-1 down to numBins are conjugate of bins 1..numBins-2
    for (let b = 1; b < numBins - 1; b++) {
      re[fftSize - b] = real[frame][b];
      im[fftSize - b] = -imag[frame][b];
    }

    ifft(re, im);

    // Overlap-add windowed frame into output
    for (let n = 0; n < fftSize; n++) {
      const outIdx = start + n;
      if (outIdx >= 0 && outIdx < output.length) {
        output[outIdx] += re[n] * win[n];
        windowSum[outIdx] += win[n] * win[n];
      }
    }
  }

  // Normalize by window overlap
  const result = new Float32Array(signalLength);
  for (let i = 0; i < signalLength; i++) {
    result[i] = windowSum[i] > 1e-8 ? output[i] / windowSum[i] : 0;
  }

  return result;
}
