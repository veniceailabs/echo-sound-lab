/**
 * ESL HPSS Stem Separation — Median Filter Module
 *
 * 1D median filter using insertion sort (efficient for small kernels).
 * Row/column 2D variants used by HPSS algorithm:
 *   - medianFilterRows  → smooths along TIME axis → harmonic estimate
 *   - medianFilterCols  → smooths along FREQ axis → percussive estimate
 */

/**
 * Sort a small window using insertion sort (O(k²) but fast for k ≤ 63).
 */
function insertionSort(arr: Float32Array): void {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

/**
 * 1D median filter along an array with reflected boundary padding.
 *
 * @param arr        Input array
 * @param kernelSize Odd integer kernel size (will be forced odd)
 * @returns Filtered array of same length
 */
export function medianFilter1D(arr: Float32Array, kernelSize: number): Float32Array {
  // Force odd kernel size
  const k = kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize;
  const half = Math.floor(k / 2);
  const n = arr.length;
  const out = new Float32Array(n);
  const window = new Float32Array(k);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      let idx = i - half + j;
      // Reflect at boundaries
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * n - idx - 2;
      idx = Math.max(0, Math.min(n - 1, idx));
      window[j] = arr[idx];
    }
    insertionSort(window);
    out[i] = window[half];
  }

  return out;
}

/**
 * Apply 1D median filter along ROWS (time axis) of a magnitude spectrogram.
 * Input/output: matrix[frame][bin]
 * Each row (fixed bin, varying frame) is filtered independently.
 * This produces the HARMONIC estimate (spectrally stable over time).
 *
 * @param matrix     Spectrogram as array of frames, each a Float32Array of bins
 * @param kernelSize Median kernel size in frames
 * @returns Filtered matrix with same shape
 */
export function medianFilterRows(
  matrix: Float32Array[],
  kernelSize: number
): Float32Array[] {
  if (matrix.length === 0) return [];
  const numFrames = matrix.length;
  const numBins = matrix[0].length;

  // Build output structure
  const out: Float32Array[] = Array.from({ length: numFrames }, () => new Float32Array(numBins));

  // For each frequency bin, gather values across frames and filter
  const rowBuf = new Float32Array(numFrames);
  for (let bin = 0; bin < numBins; bin++) {
    for (let frame = 0; frame < numFrames; frame++) {
      rowBuf[frame] = matrix[frame][bin];
    }
    const filtered = medianFilter1D(rowBuf, kernelSize);
    for (let frame = 0; frame < numFrames; frame++) {
      out[frame][bin] = filtered[frame];
    }
  }

  return out;
}

/**
 * Apply 1D median filter along COLUMNS (frequency axis) of a magnitude spectrogram.
 * Input/output: matrix[frame][bin]
 * Each column (fixed frame, varying bin) is filtered independently.
 * This produces the PERCUSSIVE estimate (broadband transients).
 *
 * @param matrix     Spectrogram as array of frames, each a Float32Array of bins
 * @param kernelSize Median kernel size in frequency bins
 * @returns Filtered matrix with same shape
 */
export function medianFilterCols(
  matrix: Float32Array[],
  kernelSize: number
): Float32Array[] {
  if (matrix.length === 0) return [];
  const numFrames = matrix.length;
  const numBins = matrix[0].length;

  const out: Float32Array[] = Array.from({ length: numFrames }, () => new Float32Array(numBins));

  // For each frame, filter along the frequency axis
  for (let frame = 0; frame < numFrames; frame++) {
    out[frame] = medianFilter1D(matrix[frame], kernelSize);
  }

  return out;
}
