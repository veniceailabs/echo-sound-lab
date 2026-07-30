#pragma once

#include <cstddef>

#include <array>
#include <vector>
#include <cmath>

namespace EchoSoundLab::DSP {

/**
 * @brief Parametric 10-Band EQ using Biquad Filters
 * Provides professional-grade equalization with bell/shelf filter types
 */
class ParametricEQ {
public:
  static constexpr int NUM_BANDS = 10;

  enum class FilterType {
    PEAK,       // Bell filter (boost/cut at frequency)
    LOW_SHELF,  // Low frequency shelf
    HIGH_SHELF, // High frequency shelf
  };

  struct BandParameters {
    float frequency;     // Hz (20 - 20000)
    float gain;          // dB (-24 to +24)
    float q_factor;      // Quality factor (0.5 - 10.0)
    FilterType type;
  };

  /**
   * @param sample_rate Sample rate in Hz
   */
  explicit ParametricEQ(float sample_rate);

  /**
   * @brief Set parameters for a single EQ band
   * @param band_index 0-9 for the 10 bands
   * @param params Band parameters
   */
  void SetBand(int band_index, const BandParameters& params);

  /**
   * @brief Process audio through the EQ chain
   * @param audio Input/output audio samples
   * @param num_samples Number of samples to process
   */
  void ProcessBlock(float* audio, size_t num_samples);

  /**
   * @brief Get current band parameters
   */
  BandParameters GetBand(int band_index) const;

  /**
   * @brief Reset all filter states
   */
  void Reset();

  /**
   * @brief Calculate frequency response at given frequency
   * @param frequency Frequency in Hz
   * @return Magnitude response in dB
   */
  float GetResponseAt(float frequency) const;

private:
  float sample_rate_;
  std::array<BandParameters, NUM_BANDS> bands_;

  // Biquad filter state (per-band).
  // Coefficients are normalised by a0 at calculation time; z1/z2 are the
  // transposed-Direct-Form-II delay elements (they hold mixed input/output
  // history, not past outputs).
  struct BiquadState {
    float b0, b1, b2;  // Feedforward coefficients (a0-normalised)
    float a1, a2;      // Feedback coefficients (a0-normalised)
    float z1, z2;      // Filter delay elements
  };
  std::array<BiquadState, NUM_BANDS> states_;

  // Coefficient calculation
  void CalculateBiquadCoefficients(int band_index);
  static float ApplyBiquad(float sample, BiquadState& state);
};

}  // namespace EchoSoundLab::DSP
