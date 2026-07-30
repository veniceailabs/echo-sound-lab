#pragma once

#include <cstddef>

#include <cmath>
#include <vector>

namespace EchoSoundLab::DSP {

/**
 * @brief True Peak Limiter
 * Prevents clipping with look-ahead detection and fast attack
 */
class TruePeakLimiter {
public:
  /**
   * @param sample_rate Sample rate in Hz
   * @param look_ahead_ms Look-ahead time in milliseconds (typically 5-10ms)
   */
  TruePeakLimiter(float sample_rate, float look_ahead_ms = 5.0f);

  /**
   * @brief Set limiter parameters
   * @param threshold_dbfs Threshold in dBFS (typically -0.3)
   * @param attack_ms Attack time in milliseconds (should be <1ms for true peak)
   * @param release_ms Release time in milliseconds (typically 50-100)
   */
  void SetParameters(float threshold_dbfs, float attack_ms, float release_ms);

  /**
   * @brief Process audio block through limiter
   * @param audio Input/output audio samples
   * @param num_samples Number of samples to process
   */
  void ProcessBlock(float* audio, size_t num_samples);

  /**
   * @brief Process a stereo pair with linked gain reduction.
   * Detection uses the louder of the two channels and the same gain is applied
   * to both, so limiting never shifts the stereo image. Running two
   * independent limiters would pull the image toward whichever channel is
   * being reduced less.
   * @param left Left channel (in/out)
   * @param right Right channel (in/out)
   * @param num_samples Samples per channel
   */
  void ProcessStereo(float* left, float* right, size_t num_samples);

  /**
   * @brief Reset limiter state
   */
  void Reset();

  /**
   * @brief Get current gain reduction in dB
   */
  float GetGainReduction() const { return gain_reduction_db_; }

  /**
   * @brief Check if limiter is engaged (GR > 0dB)
   */
  bool IsEngaged() const { return gain_reduction_db_ < 0.0f; }

private:
  float sample_rate_;
  float threshold_dbfs_;
  float attack_ms_;
  float release_ms_;

  // Look-ahead buffers (circular). The right-channel buffer is only used by
  // ProcessStereo.
  std::vector<float> lookahead_buffer_;
  std::vector<float> lookahead_buffer_r_;
  size_t lookahead_index_;
  size_t lookahead_samples_;

  // Envelope follower
  float envelope_db_;
  float gain_reduction_db_;
  float attack_coef_;   // Exponential moving average coefficient
  float release_coef_;

  // Internal methods
  float FindPeakInLookahead() const;
  float CalculateGainReduction(float peak_dbfs);
  void UpdateEnvelope(float target_db, bool is_attack);
};

}  // namespace EchoSoundLab::DSP
