#include "echo/dsp/compressor.h"
#include "echo/utils/simd-math.h"
#include <algorithm>
#include <cmath>

namespace EchoSoundLab::DSP {

MultibandCompressor::MultibandCompressor(float sample_rate) : sample_rate_(sample_rate) {
  // Initialize default 4-band configuration. crossover_freq is the frequency
  // at which each band *starts*, so band 0's value is informational and the
  // actual split points are bands_[1..3].crossover_freq.
  bands_[0] = {20.0f, {4.0f, -24.0f, 20.0f, 300.0f, 0.0f}};
  bands_[1] = {250.0f, {3.0f, -18.0f, 15.0f, 200.0f, 0.0f}};
  bands_[2] = {2000.0f, {2.5f, -16.0f, 10.0f, 150.0f, 0.0f}};
  bands_[3] = {8000.0f, {2.0f, -14.0f, 8.0f, 100.0f, 0.0f}};

  Reset();
}

void MultibandCompressor::SetBand(int band_index, const BandDefinition& band) {
  if (band_index >= 0 && band_index < NUM_BANDS) {
    bands_[band_index] = band;
    UpdateCoefficients();
  }
}

void MultibandCompressor::UpdateCoefficients() {
  // Per-band envelope and makeup coefficients, cached so the audio loop does
  // no exp/pow calls for them.
  for (int i = 0; i < NUM_BANDS; ++i) {
    const CompressorParameters& p = bands_[i].params;
    const float attack_samples = std::max(0.01f, p.attack_ms) * sample_rate_ / 1000.0f;
    const float release_samples = std::max(0.01f, p.release_ms) * sample_rate_ / 1000.0f;
    states_[i].attack_coef = std::exp(-1.0f / attack_samples);
    states_[i].release_coef = std::exp(-1.0f / release_samples);
    states_[i].makeup_linear = std::pow(10.0f, p.makeup_gain_db / 20.0f);
  }

  // Crossover frequencies must be strictly ascending and below Nyquist or the
  // filter design degenerates.
  const float nyquist = sample_rate_ * 0.5f;
  float previous = 20.0f;
  for (int i = 0; i < NUM_BANDS - 1; ++i) {
    float freq = bands_[i + 1].crossover_freq;
    freq = std::clamp(freq, previous + 1.0f, nyquist * 0.98f);
    previous = freq;
    DesignLR4(crossovers_[i].lowpass, freq, false);
    DesignLR4(crossovers_[i].highpass, freq, true);
    DesignLR4(crossovers_r_[i].lowpass, freq, false);
    DesignLR4(crossovers_r_[i].highpass, freq, true);
  }
}

void MultibandCompressor::DesignLR4(LR4& filter, float frequency, bool highpass) {
  // Butterworth (Q = 1/sqrt(2)) biquad; cascading two gives Linkwitz-Riley 4th
  // order with a -6 dB crossover point and flat magnitude summation.
  const float w0 = 2.0f * 3.14159265358979f * frequency / sample_rate_;
  const float cos_w0 = std::cos(w0);
  const float sin_w0 = std::sin(w0);
  const float alpha = sin_w0 / (2.0f * 0.70710678f);

  float b0, b1, b2;
  const float a0 = 1.0f + alpha;
  const float a1 = -2.0f * cos_w0;
  const float a2 = 1.0f - alpha;

  if (highpass) {
    b0 = (1.0f + cos_w0) * 0.5f;
    b1 = -(1.0f + cos_w0);
    b2 = (1.0f + cos_w0) * 0.5f;
  } else {
    b0 = (1.0f - cos_w0) * 0.5f;
    b1 = 1.0f - cos_w0;
    b2 = (1.0f - cos_w0) * 0.5f;
  }

  const float inv_a0 = 1.0f / a0;
  Biquad section;
  section.b0 = b0 * inv_a0;
  section.b1 = b1 * inv_a0;
  section.b2 = b2 * inv_a0;
  section.a1 = a1 * inv_a0;
  section.a2 = a2 * inv_a0;

  // Both cascaded sections use identical coefficients; preserve any existing
  // delay state so live parameter changes don't click.
  const float az1 = filter.a.z1, az2 = filter.a.z2;
  const float bz1 = filter.b.z1, bz2 = filter.b.z2;
  filter.a = section;
  filter.b = section;
  filter.a.z1 = az1; filter.a.z2 = az2;
  filter.b.z1 = bz1; filter.b.z2 = bz2;
}

void MultibandCompressor::ProcessBlock(float* audio, size_t num_samples) {
  for (size_t i = 0; i < num_samples; ++i) {
    const float input = audio[i];

    // Split into bands with a cascaded LR4 tree. Each stage peels off the
    // next band from the running highpass remainder:
    //
    //   band0 = LP(f0, x)
    //   rest  = HP(f0, x)
    //   band1 = LP(f1, rest), rest = HP(f1, rest) ... etc.
    float bands[NUM_BANDS];
    float remainder = input;
    for (int c = 0; c < NUM_BANDS - 1; ++c) {
      bands[c] = crossovers_[c].lowpass.Process(remainder);
      remainder = crossovers_[c].highpass.Process(remainder);
    }
    bands[NUM_BANDS - 1] = remainder;

    // Compress each band independently, then sum back to one signal.
    float output = 0.0f;
    for (int b = 0; b < NUM_BANDS; ++b) {
      output += CompressBand(bands[b], b);
    }

    audio[i] = output;
  }
}

void MultibandCompressor::ProcessStereo(float* left, float* right, size_t num_samples) {
  for (size_t i = 0; i < num_samples; ++i) {
    float bands_l[NUM_BANDS];
    float bands_r[NUM_BANDS];

    float rem_l = left[i];
    float rem_r = right[i];
    for (int c = 0; c < NUM_BANDS - 1; ++c) {
      bands_l[c] = crossovers_[c].lowpass.Process(rem_l);
      rem_l = crossovers_[c].highpass.Process(rem_l);
      bands_r[c] = crossovers_r_[c].lowpass.Process(rem_r);
      rem_r = crossovers_r_[c].highpass.Process(rem_r);
    }
    bands_l[NUM_BANDS - 1] = rem_l;
    bands_r[NUM_BANDS - 1] = rem_r;

    float out_l = 0.0f;
    float out_r = 0.0f;
    for (int b = 0; b < NUM_BANDS; ++b) {
      const float gain = LinkedBandGain(bands_l[b], bands_r[b], b);
      out_l += bands_l[b] * gain;
      out_r += bands_r[b] * gain;
    }

    left[i] = out_l;
    right[i] = out_r;
  }
}

float MultibandCompressor::LinkedBandGain(float left_sample, float right_sample,
                                          int band_index) {
  BandState& state = states_[band_index];

  // Detect from the louder channel so both receive identical gain.
  const float magnitude = std::max(std::abs(left_sample), std::abs(right_sample));
  const float level_db = 20.0f * std::log10(magnitude + 1e-12f);
  state.gain_reduction = CalculateGainReduction(level_db, band_index);

  if (state.gain_reduction < state.envelope_db) {
    state.envelope_db = state.attack_coef * state.envelope_db +
                        (1.0f - state.attack_coef) * state.gain_reduction;
  } else {
    state.envelope_db = state.release_coef * state.envelope_db +
                        (1.0f - state.release_coef) * state.gain_reduction;
  }

  return std::pow(10.0f, state.envelope_db / 20.0f) * state.makeup_linear;
}

void MultibandCompressor::Reset() {
  for (int i = 0; i < NUM_BANDS; ++i) {
    states_[i].envelope_db = 0.0f;
    states_[i].gain_reduction = 0.0f;
  }
  for (auto& crossover : crossovers_) {
    crossover.ResetState();
  }
  for (auto& crossover : crossovers_r_) {
    crossover.ResetState();
  }
  UpdateCoefficients();
}

float MultibandCompressor::GetGainReduction(int band_index) const {
  if (band_index >= 0 && band_index < NUM_BANDS) {
    return states_[band_index].envelope_db;
  }
  return 0.0f;
}

float MultibandCompressor::CompressBand(float sample, int band_index) {
  BandState& state = states_[band_index];

  // Feed-forward detector: measure this band's level, derive the target gain
  // reduction, then smooth that reduction with attack/release.
  const float level_db = 20.0f * std::log10(std::abs(sample) + 1e-12f);
  state.gain_reduction = CalculateGainReduction(level_db, band_index);

  // Attack when more reduction is needed, release when less.
  if (state.gain_reduction < state.envelope_db) {
    state.envelope_db = state.attack_coef * state.envelope_db +
                        (1.0f - state.attack_coef) * state.gain_reduction;
  } else {
    state.envelope_db = state.release_coef * state.envelope_db +
                        (1.0f - state.release_coef) * state.gain_reduction;
  }

  const float gain_linear = std::pow(10.0f, state.envelope_db / 20.0f);
  return sample * gain_linear * state.makeup_linear;
}

float MultibandCompressor::CalculateGainReduction(float input_db, int band_index) {
  const CompressorParameters& params = bands_[band_index].params;
  const float ratio = std::max(1.0f, params.ratio);

  if (input_db > params.threshold_db) {
    const float excess = input_db - params.threshold_db;
    const float reduction = excess * (1.0f - 1.0f / ratio);
    return -reduction;
  }
  return 0.0f;
}

}  // namespace EchoSoundLab::DSP
