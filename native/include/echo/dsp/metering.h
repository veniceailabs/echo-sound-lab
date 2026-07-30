#pragma once

#include <cstddef>

#include <vector>
#include <cmath>
#include <array>

namespace EchoSoundLab::DSP {

/**
 * @brief LUFS Metering - EBU R128 Loudness Standard
 * Measures perceived loudness of audio according to ITU-R BS.1770-4
 */
class LUFSMeter {
public:
  struct LoudnessMetrics {
    float momentary_lufs;      // Loudness over last 400ms window
    float short_term_lufs;     // Loudness over last 3s window
    float integrated_lufs;     // Overall loudness (cumulative)
    float loudness_range;      // LU (loudness units) - dynamic range
    float true_peak;           // Maximum instantaneous peak in dBFS
    float true_peak_dbfs;      // True peak in digital domain
  };

  /**
   * @param sample_rate Sample rate in Hz (typically 48000)
   */
  explicit LUFSMeter(float sample_rate);

  /**
   * @brief Process audio block and update loudness measurements
   * @param audio Input audio samples (mono or stereo)
   * @param num_samples Number of samples in block
   * @param num_channels Number of audio channels (1=mono, 2=stereo)
   */
  void ProcessBlock(const float* audio, size_t num_samples, int num_channels);

  /**
   * @brief Reset metering state (start fresh measurement)
   */
  void Reset();

  /**
   * @brief Get current loudness metrics
   */
  LoudnessMetrics GetMetrics() const;

  /**
   * @brief Calculate LUFS for a complete audio buffer
   * @param audio Input audio samples
   * @param num_samples Total samples
   * @param num_channels Channels in audio
   * @return Integrated LUFS value
   */
  static float CalculateLUFS(const float* audio, size_t num_samples, int num_channels);

  /**
   * @brief Integrated LUFS for planar stereo, per BS.1770 channel summing.
   * BS.1770 sums the K-weighted power of each channel rather than averaging,
   * so identical content in two channels measures ~3 LU louder than mono.
   * Measuring stereo as if it were mono under-reads by that amount.
   * @param left Left channel samples
   * @param right Right channel samples (may equal left for dual-mono)
   * @param num_samples Samples per channel
   */
  static float CalculateLUFSStereo(const float* left, const float* right,
                                   size_t num_samples, float sample_rate);

private:
  float sample_rate_;

  // K-weighting is two cascaded biquads per BS.1770: a high-shelf pre-filter
  // followed by an RLB high-pass. Each needs its own delay elements.
  struct FilterState {
    float z1, z2;  // Filter delay elements (transposed DF-II)
  };
  struct ChannelState {
    FilterState shelf;  // Stage 1: high-shelf pre-filter
    FilterState hpf;    // Stage 2: RLB high-pass
  };
  std::array<ChannelState, 2> filter_state_;  // Per-channel state

  // Sliding power accumulators. Sums are maintained incrementally so that
  // advancing the window is O(1) per sample rather than O(window).
  std::vector<float> momentary_buffer_;   // ring buffer, 400ms
  std::vector<float> short_term_buffer_;  // ring buffer, 3s
  size_t momentary_index_ = 0;
  size_t short_term_index_ = 0;
  size_t momentary_filled_ = 0;
  size_t short_term_filled_ = 0;
  double momentary_sum_ = 0.0;
  double short_term_sum_ = 0.0;

  // Integrated loudness is gated per BS.1770, so we keep 400ms block powers
  // (not every sample) and gate at analysis time.
  std::vector<float> integrated_block_powers_;
  double integrated_block_accum_ = 0.0;
  size_t integrated_block_count_ = 0;

  size_t block_count_;
  float true_peak_;

  // ITU-R BS.1770-4 K-weighting coefficients, derived for the actual sample
  // rate rather than hardcoded for 48kHz. The published constants are only
  // correct at 48kHz; using them at 44.1kHz shifts both filter corners and
  // biases the reading.
  struct BiquadCoeffs {
    float b0, b1, b2, a1, a2;
  };
  BiquadCoeffs shelf_coeffs_;  // Stage 1: high-shelf pre-filter
  BiquadCoeffs rlb_coeffs_;    // Stage 2: RLB high-pass

  void DesignKWeighting(float sample_rate);

  // Absolute gate for integrated loudness (LUFS)
  static constexpr float ABSOLUTE_GATE_LUFS = -70.0f;

  // True-peak estimation uses 4x oversampling to catch inter-sample overs.
  static constexpr int TRUE_PEAK_OVERSAMPLE = 4;
  static constexpr int TRUE_PEAK_TAPS = 24;  // per polyphase phase
  std::array<std::array<float, TRUE_PEAK_TAPS>, TRUE_PEAK_OVERSAMPLE> tp_filters_;
  std::array<float, TRUE_PEAK_TAPS> tp_history_;
  size_t tp_history_index_ = 0;
  float true_peak_oversampled_ = 0.0f;

  void DesignTruePeakFilters();
  void UpdateTruePeak(float sample);

  // Internal methods
  float ApplyKWeighting(float sample, ChannelState& state);
  void PushPower(float power);
};

}  // namespace EchoSoundLab::DSP
