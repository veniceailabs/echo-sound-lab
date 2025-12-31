/**
 * Test Configuration for Custom DSP Chain
 *
 * Bypasses Gemini API to test custom processors directly.
 * Use this when Gemini is timing out or for quick DSP testing.
 */

import { ProcessingConfig } from '../types';

/**
 * Safe test configuration for custom DSP chain
 *
 * Applies protective mastering:
 * - 30Hz high-pass (subsonic cleanup)
 * - -3dB gain reduction (headroom)
 * - 1.5:1 compression at -12dB (transparent glue)
 * - -1dB limiter (peak protection)
 */
export const SAFE_TEST_CONFIG: ProcessingConfig = {
  // Input gain: reduce by 3dB for headroom
  inputTrimDb: -3,

  // EQ: 30Hz high-pass only (remove subsonic rumble)
  eq: [
    {
      frequency: 30,
      gain: 0,
      type: 'highpass',
      q: 0.707
    }
  ],

  // Compression: 1.5:1 transparent glue
  compression: {
    threshold: -12,
    ratio: 1.5,
    attack: 0.010,  // 10ms
    release: 0.100, // 100ms
    makeupGain: 0   // NO makeup gain
  },

  // Limiter: -1dB ceiling for safety
  limiter: {
    threshold: -1.0,
    release: 0.100,
    ratio: 20,
    attack: 0.005
  },

  // No other processors
  outputTrimDb: 0
};

/**
 * Minimal test configuration (high-pass only)
 *
 * Use this to test if custom EQ is working without artifacts.
 */
export const MINIMAL_TEST_CONFIG: ProcessingConfig = {
  eq: [
    {
      frequency: 30,
      gain: 0,
      type: 'highpass',
      q: 0.707
    }
  ]
};

/**
 * Compression test configuration
 *
 * Use this to test if custom compressor is transparent.
 */
export const COMPRESSION_TEST_CONFIG: ProcessingConfig = {
  compression: {
    threshold: -12,
    ratio: 1.5,
    attack: 0.010,
    release: 0.100,
    makeupGain: 0
  }
};

/**
 * Limiter test configuration
 *
 * Use this to test if custom limiter preserves transients.
 */
export const LIMITER_TEST_CONFIG: ProcessingConfig = {
  limiter: {
    threshold: -1.0,
    release: 0.100,
    ratio: 20,
    attack: 0.005
  }
};
