#include "echo/dsp/eq.h"
#include "echo/utils/simd-math.h"
#include <algorithm>
#include <cmath>

namespace EchoSoundLab::DSP {

ParametricEQ::ParametricEQ(float sample_rate) : sample_rate_(sample_rate) {
  // Initialize default bands (10-band graphic EQ style)
  float frequencies[NUM_BANDS] = {
      31.5f, 63.0f, 125.0f, 250.0f, 500.0f, 1000.0f, 2000.0f, 4000.0f, 8000.0f, 16000.0f};

  for (int i = 0; i < NUM_BANDS; ++i) {
    bands_[i] = {frequencies[i], 0.0f, 0.707f, FilterType::PEAK};
    states_[i] = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
    CalculateBiquadCoefficients(i);
  }
}

void ParametricEQ::SetBand(int band_index, const BandParameters& params) {
  if (band_index >= 0 && band_index < NUM_BANDS) {
    bands_[band_index] = params;
    CalculateBiquadCoefficients(band_index);
  }
}

void ParametricEQ::ProcessBlock(float* audio, size_t num_samples) {
  for (size_t i = 0; i < num_samples; ++i) {
    float sample = audio[i];

    // Apply each band in series
    for (int band = 0; band < NUM_BANDS; ++band) {
      sample = ApplyBiquad(sample, states_[band]);
    }

    audio[i] = sample;
  }
}

ParametricEQ::BandParameters ParametricEQ::GetBand(int band_index) const {
  if (band_index >= 0 && band_index < NUM_BANDS) {
    return bands_[band_index];
  }
  return {0.0f, 0.0f, 0.707f, FilterType::PEAK};
}

void ParametricEQ::Reset() {
  for (int i = 0; i < NUM_BANDS; ++i) {
    states_[i] = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
  }
}

float ParametricEQ::GetResponseAt(float frequency) const {
  // Simplified frequency response calculation
  float response_db = 0.0f;
  for (int i = 0; i < NUM_BANDS; ++i) {
    float freq_ratio = frequency / bands_[i].frequency;
    float distance = std::log2(freq_ratio);

    // Bell curve centered at band frequency
    if (std::abs(distance) < 2.0f) {
      float bell = std::exp(-distance * distance / (2.0f * bands_[i].q_factor));
      response_db += bands_[i].gain * bell;
    }
  }
  return response_db;
}

void ParametricEQ::CalculateBiquadCoefficients(int band_index) {
  const BandParameters& band = bands_[band_index];
  BiquadState& state = states_[band_index];

  // RBJ Audio EQ Cookbook formulas. Each branch computes an explicit a0 and
  // normalises every coefficient by it; a0 differs per filter type, so it can
  // not be derived from a2 after the fact.
  const float A = std::pow(10.0f, band.gain / 40.0f);
  const float w0 = 2.0f * 3.14159265358979f * band.frequency / sample_rate_;
  const float sin_w0 = std::sin(w0);
  const float cos_w0 = std::cos(w0);
  const float q = std::max(0.01f, band.q_factor);
  const float alpha = sin_w0 / (2.0f * q);
  const float sqrtA = std::sqrt(A);

  float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f;
  float a0 = 1.0f, a1 = 0.0f, a2 = 0.0f;

  if (band.type == FilterType::PEAK) {
    b0 = 1.0f + alpha * A;
    b1 = -2.0f * cos_w0;
    b2 = 1.0f - alpha * A;
    a0 = 1.0f + alpha / A;
    a1 = -2.0f * cos_w0;
    a2 = 1.0f - alpha / A;
  } else if (band.type == FilterType::LOW_SHELF) {
    const float twoSqrtAalpha = 2.0f * sqrtA * alpha;
    b0 = A * ((A + 1.0f) - (A - 1.0f) * cos_w0 + twoSqrtAalpha);
    b1 = 2.0f * A * ((A - 1.0f) - (A + 1.0f) * cos_w0);
    b2 = A * ((A + 1.0f) - (A - 1.0f) * cos_w0 - twoSqrtAalpha);
    a0 = (A + 1.0f) + (A - 1.0f) * cos_w0 + twoSqrtAalpha;
    a1 = -2.0f * ((A - 1.0f) + (A + 1.0f) * cos_w0);
    a2 = (A + 1.0f) + (A - 1.0f) * cos_w0 - twoSqrtAalpha;
  } else if (band.type == FilterType::HIGH_SHELF) {
    const float twoSqrtAalpha = 2.0f * sqrtA * alpha;
    b0 = A * ((A + 1.0f) + (A - 1.0f) * cos_w0 + twoSqrtAalpha);
    b1 = -2.0f * A * ((A - 1.0f) + (A + 1.0f) * cos_w0);
    b2 = A * ((A + 1.0f) + (A - 1.0f) * cos_w0 - twoSqrtAalpha);
    a0 = (A + 1.0f) - (A - 1.0f) * cos_w0 + twoSqrtAalpha;
    a1 = 2.0f * ((A - 1.0f) - (A + 1.0f) * cos_w0);
    a2 = (A + 1.0f) - (A - 1.0f) * cos_w0 - twoSqrtAalpha;
  }

  const float inv_a0 = 1.0f / a0;
  state.b0 = b0 * inv_a0;
  state.b1 = b1 * inv_a0;
  state.b2 = b2 * inv_a0;
  state.a1 = a1 * inv_a0;
  state.a2 = a2 * inv_a0;
}

float ParametricEQ::ApplyBiquad(float sample, BiquadState& state) {
  // Transposed Direct Form II — numerically well-behaved in float and the
  // standard topology for per-sample biquad processing.
  const float out = state.b0 * sample + state.z1;
  state.z1 = state.b1 * sample - state.a1 * out + state.z2;
  state.z2 = state.b2 * sample - state.a2 * out;
  return out;
}

}  // namespace EchoSoundLab::DSP
