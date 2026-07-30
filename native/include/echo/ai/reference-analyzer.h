#pragma once

#include <cstddef>

#include <vector>
#include <string>

namespace EchoSoundLab::AI {

/**
 * @brief Reference Track Analyzer
 * Extracts mastering characteristics from a reference track
 */
class ReferenceAnalyzer {
public:
  struct ReferenceCharacteristics {
    float target_lufs;          // Target loudness
    float loudness_range;       // Dynamic range (LU)
    float true_peak;            // Peak headroom (dBFS)
    float stereo_width;         // Stereo imaging (0-100%)

    // Spectral balance (0-1)
    float bass_energy;          // Low freq presence
    float midrange_presence;    // Mid freq definition
    float treble_brightness;    // High freq presence
    float air_shimmer;          // Presence region (8k-12k)

    // Processing characteristics
    float compression_intensity;  // 0-1, estimated compression
    float saturation_amount;      // 0-1, harmonic content
    std::string character_description;  // "Warm bass, bright highs" etc
  };

  /**
   * @param sample_rate Sample rate in Hz
   */
  explicit ReferenceAnalyzer(float sample_rate);

  /**
   * @brief Analyze a reference audio buffer
   * @param audio Audio samples
   * @param num_samples Number of samples
   * @param num_channels Number of channels
   * @return Extracted characteristics
   */
  ReferenceCharacteristics Analyze(const float* audio, size_t num_samples, int num_channels);

  /**
   * @brief Generate suggested EQ and compression to match reference
   * @param ref Reference characteristics to match
   * @param target_lufs What LUFS to target (may differ from reference)
   * @return Suggested processing parameters (as JSON string)
   */
  std::string GenerateMatchingProfile(const ReferenceCharacteristics& ref, float target_lufs);

private:
  float sample_rate_;

  // Spectral analysis
  std::vector<float> ExtractSpectralBalance(const float* audio, size_t num_samples);
  float MeasureCompressionIntensity(const float* audio, size_t num_samples);
  float MeasureSaturationAmount(const float* audio, size_t num_samples);
};

}  // namespace EchoSoundLab::AI
