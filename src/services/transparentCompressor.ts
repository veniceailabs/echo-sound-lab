/**
 * TRANSPARENT COMPRESSOR ENGINE
 *
 * Professional-grade compression that's actually transparent.
 * Not like Web Audio's brick-wall DynamicsCompressor.
 *
 * Key features:
 * - Proper envelope detection (lookahead for predictability)
 * - Soft knee (smooth transition into compression)
 * - Clean attack/release envelopes (no zipper noise)
 * - Transparent gain reduction (no artifacts)
 * - Works on offline audio buffers for perfect accuracy
 */

export interface CompressorConfig {
  threshold: number;      // dB where compression starts (-60 to 0)
  ratio: number;          // 1:1 (no compression) to 20:1 (brick wall)
  attack: number;         // ms to reach full compression
  release: number;        // ms to release compression
  kneeWidth: number;      // dB soft knee width (0 = hard knee, 12 = soft)
  lookahead: number;      // ms of lookahead for predictive compression
}

export class TransparentCompressor {
  private config: CompressorConfig;
  private sampleRate: number;

  constructor(config: CompressorConfig, sampleRate: number) {
    this.config = config;
    this.sampleRate = sampleRate;
  }

  /**
   * Process a mono audio buffer with transparent compression
   */
  process(buffer: Float32Array): Float32Array {
    const output = new Float32Array(buffer.length);
    const attackSamples = this.ms2Samples(this.config.attack);
    const releaseSamples = this.ms2Samples(this.config.release);
    const lookaheadSamples = this.ms2Samples(this.config.lookahead);

    // Pre-compute RMS envelope with lookahead
    const rmsEnvelope = this.computeRMSEnvelope(buffer, lookaheadSamples);

    let gainReductionDb = 0; // Current gain reduction in dB

    for (let i = 0; i < buffer.length; i++) {
      // Get target gain reduction from lookahead RMS
      const targetGainReductionDb = this.computeGainReduction(rmsEnvelope[i]);

      // Smooth gain reduction using attack/release envelope
      if (targetGainReductionDb > gainReductionDb) {
        // Attack phase (compression engaging) - fast
        const attackCoeff = Math.exp(-1 / (attackSamples + 1));
        gainReductionDb = targetGainReductionDb + attackCoeff * (gainReductionDb - targetGainReductionDb);
      } else {
        // Release phase (compression releasing) - slower
        const releaseCoeff = Math.exp(-1 / (releaseSamples + 1));
        gainReductionDb = targetGainReductionDb + releaseCoeff * (gainReductionDb - targetGainReductionDb);
      }

      // Convert gain reduction to linear multiplier
      const gainLinear = this.dbToLinear(gainReductionDb);

      // Apply gain to sample
      output[i] = buffer[i] * gainLinear;
    }

    return output;
  }

  /**
   * Process stereo buffer (L and R channels)
   */
  processStereo(left: Float32Array, right: Float32Array): { left: Float32Array; right: Float32Array } {
    // Use linked stereo compression (both channels use same gain reduction)
    // This prevents stereo image collapse from independent compression

    const output = {
      left: new Float32Array(left.length),
      right: new Float32Array(right.length),
    };

    const attackSamples = this.ms2Samples(this.config.attack);
    const releaseSamples = this.ms2Samples(this.config.release);
    const lookaheadSamples = this.ms2Samples(this.config.lookahead);

    // Combine L+R for sidechain (more natural stereo compression)
    const sidechain = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      sidechain[i] = Math.sqrt((left[i] ** 2 + right[i] ** 2) / 2);
    }

    const rmsEnvelope = this.computeRMSEnvelope(sidechain, lookaheadSamples);
    let gainReductionDb = 0;

    for (let i = 0; i < left.length; i++) {
      const targetGainReductionDb = this.computeGainReduction(rmsEnvelope[i]);

      if (targetGainReductionDb > gainReductionDb) {
        const attackCoeff = Math.exp(-1 / (attackSamples + 1));
        gainReductionDb = targetGainReductionDb + attackCoeff * (gainReductionDb - targetGainReductionDb);
      } else {
        const releaseCoeff = Math.exp(-1 / (releaseSamples + 1));
        gainReductionDb = targetGainReductionDb + releaseCoeff * (gainReductionDb - targetGainReductionDb);
      }

      const gainLinear = this.dbToLinear(gainReductionDb);

      output.left[i] = left[i] * gainLinear;
      output.right[i] = right[i] * gainLinear;
    }

    return output;
  }

  /**
   * Compute RMS envelope with lookahead (optimized with sliding window)
   * This allows the compressor to "predict" peaks before they hit
   */
  private computeRMSEnvelope(buffer: Float32Array, lookaheadSamples: number): Float32Array {
    const windowSize = Math.max(lookaheadSamples, this.ms2Samples(10)); // At least 10ms window
    const envelope = new Float32Array(buffer.length);

    // Pre-compute squared values
    const squared = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      squared[i] = buffer[i] * buffer[i];
    }

    // Initialize sum for first window
    let sumSquares = 0;
    for (let i = 0; i < Math.min(windowSize, buffer.length); i++) {
      sumSquares += squared[i];
    }

    // Sliding window: compute RMS for each position
    for (let i = 0; i < buffer.length; i++) {
      // Lookahead from current position
      const lookaheadEnd = Math.min(i + windowSize, buffer.length);
      const windowLen = lookaheadEnd - i;

      // Build sliding window sum
      if (i === 0) {
        sumSquares = 0;
        for (let j = 0; j < windowLen; j++) {
          sumSquares += squared[j];
        }
      } else if (lookaheadEnd < buffer.length) {
        // Remove old sample, add new sample
        sumSquares -= squared[i - 1];
        sumSquares += squared[lookaheadEnd - 1];
      } else {
        // At end of buffer, just remove old samples
        if (i > 0) sumSquares -= squared[i - 1];
      }

      const rms = Math.sqrt(sumSquares / windowLen);
      envelope[i] = this.linearToDb(rms);
    }

    return envelope;
  }

  /**
   * Compute gain reduction in dB based on RMS level and compressor settings
   * This is the core compression curve
   */
  private computeGainReduction(rmsDb: number): number {
    const threshold = this.config.threshold;
    const ratio = this.config.ratio;
    const kneeWidth = this.config.kneeWidth;

    // No compression needed
    if (rmsDb <= threshold - kneeWidth / 2) {
      return 0;
    }

    // Hard knee compression (no soft knee)
    if (kneeWidth === 0) {
      if (rmsDb > threshold) {
        return (rmsDb - threshold) * (1 - 1 / ratio);
      }
      return 0;
    }

    // Soft knee compression (smooth transition)
    const kneeStart = threshold - kneeWidth / 2;
    const kneeEnd = threshold + kneeWidth / 2;

    if (rmsDb < kneeStart) {
      return 0;
    }

    if (rmsDb > kneeEnd) {
      // Full compression ratio applies
      return (rmsDb - threshold) * (1 - 1 / ratio);
    }

    // Inside knee - interpolate compression ratio
    const kneePosition = (rmsDb - kneeStart) / kneeWidth; // 0 to 1
    const effectiveRatio = 1 + (ratio - 1) * (kneePosition ** 2); // Quadratic for smooth curve
    const aboveThreshold = rmsDb - threshold;

    return aboveThreshold * (1 - 1 / effectiveRatio);
  }

  /**
   * Convert milliseconds to sample count
   */
  private ms2Samples(ms: number): number {
    return Math.max(1, Math.round((ms / 1000) * this.sampleRate));
  }

  /**
   * Convert linear amplitude to dB
   */
  private linearToDb(linear: number): number {
    if (linear === 0) return -Infinity;
    return 20 * Math.log10(Math.abs(linear));
  }

  /**
   * Convert dB to linear amplitude
   */
  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }
}

/**
 * High-level function to apply transparent compression to an AudioBuffer
 */
export function applyTransparentCompression(
  buffer: AudioBuffer,
  threshold: number,
  ratio: number,
  attack: number,
  release: number,
  kneeWidth: number = 6,
  lookahead: number = 5
): AudioBuffer {
  const config: CompressorConfig = {
    threshold,
    ratio,
    attack,
    release,
    kneeWidth,
    lookahead,
  };

  const compressor = new TransparentCompressor(config, buffer.sampleRate);
  const offlineCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  const outputBuffer = offlineCtx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  if (buffer.numberOfChannels === 1) {
    // Mono
    const inputData = buffer.getChannelData(0);
    const outputData = compressor.process(inputData);
    outputBuffer.copyToChannel(outputData, 0);
  } else {
    // Stereo
    const leftInput = buffer.getChannelData(0);
    const rightInput = buffer.getChannelData(1);
    const { left: leftOutput, right: rightOutput } = compressor.processStereo(leftInput, rightInput);

    outputBuffer.copyToChannel(leftOutput, 0);
    outputBuffer.copyToChannel(rightOutput, 1);
  }

  // Copy remaining channels unchanged
  for (let i = 2; i < buffer.numberOfChannels; i++) {
    outputBuffer.copyToChannel(buffer.getChannelData(i), i);
  }

  return outputBuffer;
}
