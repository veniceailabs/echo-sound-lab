#pragma once

#include <cstddef>

#include <cmath>

namespace EchoSoundLab::DSP {

/**
 * @brief Harmonic Saturation / Soft Clipping
 * Adds warmth and character through controlled distortion
 */
class Saturation {
public:
  enum class SaturationCurve {
    TANH,        // Hyperbolic tangent (smooth, musical)
    SIGMOID,     // Sigmoid function
    SOFT_CLIP,   // Soft clipping with knee
  };

  /**
   * @param sample_rate Sample rate in Hz
   */
  explicit Saturation(float sample_rate);

  /**
   * @brief Set saturation parameters
   * @param amount 0.0-1.0, how much saturation to apply
   * @param drive Input gain before saturation
   * @param curve Which saturation curve to use
   */
  void SetParameters(float amount, float drive, SaturationCurve curve);

  /**
   * @brief Process audio through saturation
   * @param audio Input/output audio samples
   * @param num_samples Number of samples
   */
  void ProcessBlock(float* audio, size_t num_samples);

  /**
   * @brief Reset any internal state
   */
  void Reset();

private:
  float sample_rate_;
  float amount_;      // 0-1
  float drive_;       // Input gain multiplier
  SaturationCurve curve_;

  // Lookup table for fast saturation (optional)
  static constexpr int LUT_SIZE = 8192;
  float saturation_lut_[LUT_SIZE];
  bool lut_dirty_;

  // Internal methods
  float ApplySaturation(float sample);
  float TanhSaturation(float sample);
  float SigmoidSaturation(float sample);
  float SoftClipSaturation(float sample);
  void BuildLUT();

  // Fast approximations
  static float FastTanh(float x);
  static float FastSigmoid(float x);
};

}  // namespace EchoSoundLab::DSP
