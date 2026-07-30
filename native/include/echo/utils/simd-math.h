#pragma once

#include <cstddef>

#include <cmath>
#include <vector>

namespace EchoSoundLab::Utils {

/**
 * @brief SIMD Math Utilities
 * Provides vectorized operations using SSE4.2/AVX2 where available
 */
class SIMDMath {
public:
  /**
   * @brief Check if AVX2 is available on this CPU
   */
  static bool IsAVX2Available();

  /**
   * @brief Check if SSE4.2 is available
   */
  static bool IsSSE42Available();

  /**
   * @brief Multiply array by gain (dB to linear)
   * @param audio Input/output audio buffer
   * @param num_samples Number of samples
   * @param gain_db Gain in decibels
   */
  static void MultiplyByGain(float* audio, size_t num_samples, float gain_db);

  /**
   * @brief Find peak value in audio buffer
   * @param audio Input audio
   * @param num_samples Number of samples
   * @return Maximum absolute value
   */
  static float FindPeak(const float* audio, size_t num_samples);

  /**
   * @brief Calculate RMS (root mean square) of audio buffer
   * @param audio Input audio
   * @param num_samples Number of samples
   * @return RMS value
   */
  static float CalculateRMS(const float* audio, size_t num_samples);

  /**
   * @brief Convert linear amplitude to dB
   */
  static float LinearToDb(float linear);

  /**
   * @brief Convert dB to linear amplitude
   */
  static float DbToLinear(float db);

  /**
   * @brief Fast approximation of log10
   */
  static float FastLog10(float x);

  /**
   * @brief Fast approximation of 10^x
   */
  static float FastPow10(float x);

private:
  // Prevent instantiation
  SIMDMath() = delete;
};

}  // namespace EchoSoundLab::Utils
