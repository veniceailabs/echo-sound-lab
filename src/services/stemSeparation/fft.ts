/**
 * ESL HPSS Stem Separation — FFT Module
 *
 * Cooley-Tukey radix-2 Decimation-In-Time (DIT) in-place FFT.
 * Complex data is stored as two parallel Float32Arrays: real and imaginary parts.
 *
 * Supports power-of-2 sizes: 512, 1024, 2048, 4096 (and any other power-of-2).
 */

/** Bit-reversal permutation for in-place radix-2 FFT */
function bitReversePermutation(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      // Swap real parts
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      // Swap imaginary parts
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }
}

/**
 * In-place Cooley-Tukey radix-2 FFT.
 * Modifies re and im arrays in place.
 * Both arrays must have the same power-of-2 length.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;

  bitReversePermutation(re, im);

  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curRe = 1.0;
      let curIm = 0.0;

      for (let j = 0; j < halfLen; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + halfLen] * curRe - im[i + j + halfLen] * curIm;
        const vIm = re[i + j + halfLen] * curIm + im[i + j + halfLen] * curRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + halfLen] = uRe - vRe;
        im[i + j + halfLen] = uIm - vIm;

        // Advance twiddle factor: cur *= w
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

/**
 * In-place inverse FFT (IFFT).
 * Conjugates input, applies FFT, conjugates output, then divides by N.
 * Modifies re and im arrays in place.
 */
export function ifft(re: Float32Array, im: Float32Array): void {
  const n = re.length;

  // Conjugate
  for (let i = 0; i < n; i++) {
    im[i] = -im[i];
  }

  // Forward FFT
  fft(re, im);

  // Conjugate and scale
  const scale = 1.0 / n;
  for (let i = 0; i < n; i++) {
    re[i] *= scale;
    im[i] = -im[i] * scale;
  }
}
