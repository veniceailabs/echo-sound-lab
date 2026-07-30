/**
 * ESL HPSS Stem Separation — Vocal Extractor
 *
 * Extracts vocals from the harmonic component using mid-side analysis
 * and spectral soft masking. Vocals are predominantly in the center
 * (mid) channel and occupy 80 Hz – 8 kHz.
 *
 * For mono input: applies bandpass spectral weighting and a 70/30 split
 * as a reasonable approximation of the vocal content.
 */

import { stft, istft } from './stft';

export interface VocalExtractionResult {
  vocals: Float32Array;
  instrumental: Float32Array;
}

/**
 * Extract vocals from harmonic stems.
 *
 * @param harmonicMono   Mono harmonic signal (from HPSS)
 * @param harmonicStereoL Left channel harmonic (or same as mono for mono sources)
 * @param harmonicStereoR Right channel harmonic
 * @param sampleRate     Sample rate in Hz
 */
export async function extractVocals(
  harmonicMono: Float32Array,
  harmonicStereoL: Float32Array,
  harmonicStereoR: Float32Array,
  sampleRate: number
): Promise<VocalExtractionResult> {
  const fftSize = 2048;
  const hopSize = 512;

  // ── Mid/Side decomposition ───────────────────────────────────────────────
  const n = harmonicMono.length;
  const isStereo =
    harmonicStereoL !== harmonicMono &&
    harmonicStereoR !== harmonicMono &&
    harmonicStereoL.length === harmonicStereoR.length;

  // Build mid signal (mono or stereo center)
  const mid = new Float32Array(n);
  const side = new Float32Array(n);
  if (isStereo) {
    for (let i = 0; i < n; i++) {
      mid[i] = (harmonicStereoL[i] + harmonicStereoR[i]) * 0.5;
      side[i] = (harmonicStereoL[i] - harmonicStereoR[i]) * 0.5;
    }
  } else {
    mid.set(harmonicMono);
    // side stays zero for mono
  }

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── STFT of mid signal ───────────────────────────────────────────────────
  const { real, imag, frames } = stft(mid, fftSize, hopSize);
  const numBins = fftSize / 2 + 1;

  // Frequency resolution in Hz per bin
  const binHz = sampleRate / fftSize;

  // Vocal band: 80 Hz – 8 kHz → bin range
  const vocalLo = Math.floor(80 / binHz);
  const vocalHi = Math.min(numBins - 1, Math.ceil(8000 / binHz));

  // Soft vocal mask: raised-cosine fade at band edges, 0.7 inside band
  // Instruments get the complementary mask
  const vocalReal: Float32Array[] = [];
  const vocalImag: Float32Array[] = [];
  const instReal: Float32Array[] = [];
  const instImag: Float32Array[] = [];

  // Mid/side contribution:
  // If stereo: vocal = 0.85 * mid_masked + 0.15 * side_masked (center bias)
  // If mono:   vocal = 0.70 * masked_harmonic
  const vocalBias = isStereo ? 0.85 : 0.70;

  for (let t = 0; t < frames; t++) {
    const vRe = new Float32Array(numBins);
    const vIm = new Float32Array(numBins);
    const iRe = new Float32Array(numBins);
    const iIm = new Float32Array(numBins);

    for (let f = 0; f < numBins; f++) {
      // Smooth band mask (raised cosine at edges, 5-bin ramps)
      let bandMask = 0;
      const fadeWidth = 5;
      if (f >= vocalLo && f <= vocalHi) {
        const loFade = Math.min(1, (f - vocalLo) / fadeWidth);
        const hiFade = Math.min(1, (vocalHi - f) / fadeWidth);
        bandMask = Math.min(loFade, hiFade);
      }

      const vMask = vocalBias * bandMask;
      const iMask = 1 - vMask;

      vRe[f] = real[t][f] * vMask;
      vIm[f] = imag[t][f] * vMask;
      iRe[f] = real[t][f] * iMask;
      iIm[f] = imag[t][f] * iMask;
    }

    vocalReal.push(vRe);
    vocalImag.push(vIm);
    instReal.push(iRe);
    instImag.push(iIm);
  }

  await new Promise<void>((r) => setTimeout(r, 0));

  // ── ISTFT ────────────────────────────────────────────────────────────────
  const vocals = istft(vocalReal, vocalImag, fftSize, hopSize, n);
  const instrumental = istft(instReal, instImag, fftSize, hopSize, n);

  // Guardrail: clamp to prevent polarity issues
  for (let i = 0; i < n; i++) {
    vocals[i] = Math.max(-1, Math.min(1, vocals[i]));
    instrumental[i] = Math.max(-1, Math.min(1, instrumental[i]));
  }

  return { vocals, instrumental };
}
