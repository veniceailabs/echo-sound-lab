#pragma once

#include <cstddef>

#include "dsp/metering.h"
#include "dsp/eq.h"
#include "dsp/compressor.h"
#include "dsp/limiter.h"
#include "dsp/saturation.h"
#include <memory>
#include <utility>
#include <vector>

namespace EchoSoundLab {

/**
 * @brief Main Mastering Engine
 * Orchestrates the complete mastering chain: EQ → Compression → Saturation → Limiting → Metering
 */
class MasteringEngine {
public:
  /**
   * @param sample_rate Sample rate in Hz (typically 48000)
   */
  explicit MasteringEngine(float sample_rate = 48000.0f);

  ~MasteringEngine();

  /**
   * @brief Process audio buffer through mastering chain
   * @param input_audio Input samples
   * @param num_samples Number of samples
   * @param num_channels Number of audio channels
   * @return Processed audio (same length)
   */
  std::vector<float> ProcessBlock(const float* input_audio, size_t num_samples, int num_channels);

  /**
   * @brief Process a planar stereo pair as a single programme.
   *
   * Differs from calling ProcessBlock twice in three ways that matter:
   *  - loudness is measured with BS.1770 channel summing, not per-channel;
   *  - one common makeup gain is applied to both channels;
   *  - the limiter is stereo-linked.
   * Processing channels independently would mis-report loudness by ~3 LU and
   * let gain differences smear the stereo image.
   *
   * @param left Left channel samples
   * @param right Right channel samples
   * @param num_samples Samples per channel
   * @return {processed_left, processed_right}
   */
  std::pair<std::vector<float>, std::vector<float>> ProcessStereoBlock(
      const float* left, const float* right, size_t num_samples);

  /**
   * @brief Set target LUFS for output
   * @param lufs Target loudness (-23 to -14, -13 for radio, -7 for dynamic)
   */
  void SetLUFSTarget(float lufs);

  /**
   * @brief Set EQ band parameters
   */
  void SetEQBand(int band, const DSP::ParametricEQ::BandParameters& params);

  /**
   * @brief Set compression for a frequency band
   */
  void SetCompressorBand(int band_index, const DSP::MultibandCompressor::BandDefinition& definition);

  /**
   * @brief Set saturation parameters
   */
  void SetSaturation(float amount, float drive);

  /**
   * @brief Set limiter parameters
   */
  void SetLimiterThreshold(float threshold_dbfs);

  /**
   * @brief Get loudness metrics from last processed block
   */
  DSP::LUFSMeter::LoudnessMetrics GetMetrics() const;

  /**
   * @brief Get current gain reduction on compressor (for visualization)
   */
  float GetCompressorGainReduction(int band) const;

  /**
   * @brief Get current limiter gain reduction
   */
  float GetLimiterGainReduction() const;

  /**
   * @brief Reset all processing state
   */
  void Reset();

  /**
   * @brief Get sample rate
   */
  float GetSampleRate() const { return sample_rate_; }

private:
  float sample_rate_;
  float target_lufs_;
  float limiter_threshold_dbfs_ = -0.3f;

  // The shared meter averages interleaved channel power, which is not the
  // BS.1770 stereo figure. ProcessStereoBlock computes the correct summed
  // value and caches it here for GetMetrics to report.
  bool has_stereo_lufs_ = false;
  float stereo_integrated_lufs_ = -100.0f;

  // Processing chain components
  std::unique_ptr<DSP::ParametricEQ> eq_;
  std::unique_ptr<DSP::MultibandCompressor> compressor_;
  std::unique_ptr<DSP::Saturation> saturation_;
  std::unique_ptr<DSP::TruePeakLimiter> limiter_;
  std::unique_ptr<DSP::LUFSMeter> metering_;

  // Right-channel tone/dynamics processors. Filter and envelope state must be
  // per-channel; the limiter and meter are shared because they operate on the
  // linked stereo programme.
  std::unique_ptr<DSP::ParametricEQ> eq_r_;
  std::unique_ptr<DSP::MultibandCompressor> compressor_r_;
  std::unique_ptr<DSP::Saturation> saturation_r_;

  // Utility methods
  float CalculateMakeupGain(float input_lufs, float target_lufs);
  void ApplyGainToBuffer(float* audio, size_t num_samples, float gain_db);
};

}  // namespace EchoSoundLab
