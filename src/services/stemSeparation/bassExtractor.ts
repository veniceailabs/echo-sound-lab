/**
 * ESL HPSS Stem Separation — Bass Extractor
 *
 * Extracts bass (sub-bass through low-mids) from the harmonic component
 * by zeroing spectral bins above a cutoff frequency in the STFT domain.
 * Applies a gentle raised-cosine fade at the cutoff to prevent ringing.
 */

import { stft, istft } from './stft';

export interface BassExtractionResult {
  bass: Float32Array;
  melodic: Float32Array;
}

/**
 * Extract bass frequencies from a harmonic signal.
 *
 * @param harmonic  Mono harmonic time-domain signal
 * @param sampleRate Sample rate in Hz
 * @param cutoffHz  Low-pass cutoff (default 300 Hz); bins above this become melodic
 */
export async function extractBass(
  harmonic: Float32Array,
  sampleRate: number,
  cutoffHz: number = 300
): Promise<BassExtractionResult> {
  const fftSize = 2048;
  const hopSize = 512;

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── STFT ─────────────────────────────────────────────────────────────────
  const { real, imag, frames } = stft(harmonic, fftSize, hopSize);
  const numBins = fftSize / 2 + 1;

  // Frequency of each bin
  const binHz = sampleRate / fftSize;
  const cutoffBin = Math.min(numBins - 1, Math.ceil(cutoffHz / binHz));

  // Raised-cosine fade width (in bins) to smooth the cutoff
  const fadeWidth = Math.max(3, Math.floor(cutoffBin * 0.1));

  // ── Build per-bin masks (shared across all frames) ───────────────────────
  const bassMask = new Float32Array(numBins);
  const melodicMask = new Float32Array(numBins);

  for (let f = 0; f < numBins; f++) {
    if (f <= cutoffBin - fadeWidth) {
      // Well below cutoff: full bass
      bassMask[f] = 1;
      melodicMask[f] = 0;
    } else if (f >= cutoffBin + fadeWidth) {
      // Well above cutoff: full melodic
      bassMask[f] = 0;
      melodicMask[f] = 1;
    } else {
      // Transition zone: raised-cosine fade
      const t = (f - (cutoffBin - fadeWidth)) / (2 * fadeWidth);
      const fade = 0.5 * (1 + Math.cos(Math.PI * t));      // bass fades out
      bassMask[f] = fade;
      melodicMask[f] = 1 - fade;
    }
  }

  // ── Apply masks in STFT domain ───────────────────────────────────────────
  const bassReal: Float32Array[] = [];
  const bassImag: Float32Array[] = [];
  const melodicReal: Float32Array[] = [];
  const melodicImag: Float32Array[] = [];

  for (let t = 0; t < frames; t++) {
    const bRe = new Float32Array(numBins);
    const bIm = new Float32Array(numBins);
    const mRe = new Float32Array(numBins);
    const mIm = new Float32Array(numBins);

    for (let f = 0; f < numBins; f++) {
      bRe[f] = real[t][f] * bassMask[f];
      bIm[f] = imag[t][f] * bassMask[f];
      mRe[f] = real[t][f] * melodicMask[f];
      mIm[f] = imag[t][f] * melodicMask[f];
    }

    bassReal.push(bRe);
    bassImag.push(bIm);
    melodicReal.push(mRe);
    melodicImag.push(mIm);
  }

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── ISTFT ────────────────────────────────────────────────────────────────
  const sigLen = harmonic.length;
  const bass = istft(bassReal, bassImag, fftSize, hopSize, sigLen);
  const melodic = istft(melodicReal, melodicImag, fftSize, hopSize, sigLen);

  return { bass, melodic };
}
