#include "echo/dsp/saturation.h"
#include <algorithm>
#include <cmath>

namespace EchoSoundLab::DSP {

Saturation::Saturation(float sample_rate)
    : sample_rate_(sample_rate),
      amount_(0.0f),
      drive_(1.0f),
      curve_(SaturationCurve::TANH),
      lut_dirty_(true) {}

void Saturation::SetParameters(float amount, float drive, SaturationCurve curve) {
  amount_ = std::clamp(amount, 0.0f, 1.0f);
  drive_ = std::clamp(drive, 0.0f, 2.0f);
  curve_ = curve;
  lut_dirty_ = true;
}

void Saturation::ProcessBlock(float* audio, size_t num_samples) {
  if (amount_ == 0.0f) return;  // No saturation

  for (size_t i = 0; i < num_samples; ++i) {
    audio[i] = ApplySaturation(audio[i]);
  }
}

void Saturation::Reset() {
  // No state to reset for saturation
}

float Saturation::ApplySaturation(float sample) {
  // Pre-gain
  sample *= drive_;

  // Apply saturation curve
  float saturated = 0.0f;
  switch (curve_) {
    case SaturationCurve::TANH:
      saturated = TanhSaturation(sample);
      break;
    case SaturationCurve::SIGMOID:
      saturated = SigmoidSaturation(sample);
      break;
    case SaturationCurve::SOFT_CLIP:
      saturated = SoftClipSaturation(sample);
      break;
  }

  // Blend between original and saturated based on amount
  return sample * (1.0f - amount_) + saturated * amount_;
}

float Saturation::TanhSaturation(float sample) {
  return FastTanh(sample);
}

float Saturation::SigmoidSaturation(float sample) {
  return FastSigmoid(sample);
}

float Saturation::SoftClipSaturation(float sample) {
  float abs_sample = std::abs(sample);
  if (abs_sample < 1.0f) {
    return sample * (1.0f - abs_sample * abs_sample / 2.0f);
  }
  return std::copysign(1.0f, sample);
}

void Saturation::BuildLUT() {
  for (int i = 0; i < LUT_SIZE; ++i) {
    float normalized = (2.0f * i / LUT_SIZE) - 1.0f;
    saturation_lut_[i] = TanhSaturation(normalized);
  }
  lut_dirty_ = false;
}

float Saturation::FastTanh(float x) {
  // Rational approximation of tanh. tanh is odd, so fold to |x| and restore
  // the sign at the end -- the previous version stripped the sign before the
  // small-x branch and returned a positive result for negative input.
  const float sign = (x < 0.0f) ? -1.0f : 1.0f;
  const float ax = std::abs(x);
  const float ax2 = ax * ax;

  if (ax < 0.5f) {
    return sign * ax * (1.0f + ax2 * (-1.0f / 3.0f + ax2 * (2.0f / 15.0f)));
  } else if (ax < 2.0f) {
    return sign * std::tanh(ax);
  } else {
    return sign;
  }
}

float Saturation::FastSigmoid(float x) {
  // Rational approximation of sigmoid
  return x / (1.0f + std::abs(x));
}

}  // namespace EchoSoundLab::DSP
