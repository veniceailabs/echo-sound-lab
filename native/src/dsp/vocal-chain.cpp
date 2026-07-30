#include "echo/dsp/vocal-chain.h"

#include <algorithm>
#include <cmath>

namespace EchoSoundLab::DSP {

namespace {
constexpr float kPi = 3.14159265358979f;
constexpr float kButterworthQ = 0.70710678f;

inline float LinearToDb(float x) { return 20.0f * std::log10(std::abs(x) + 1e-12f); }
inline float DbToLinear(float db) { return std::pow(10.0f, db / 20.0f); }
}  // namespace

VocalChain::VocalChain(float sample_rate) : sample_rate_(sample_rate) {
  UpdateCoefficients();
  Reset();
}

void VocalChain::SetSettings(const Settings& settings) {
  settings_ = settings;
  UpdateCoefficients();
}

void VocalChain::UpdateCoefficients() {
  DesignHighpass(highpass_a_, settings_.highpass_hz);
  DesignHighpass(highpass_b_, settings_.highpass_hz);

  // De-esser crossover: LR4, so the two bands recombine flat.
  DesignLowpass(deess_lp_a_, settings_.deess_freq_hz);
  DesignLowpass(deess_lp_b_, settings_.deess_freq_hz);
  DesignHighpass(deess_hp_a_, settings_.deess_freq_hz);
  DesignHighpass(deess_hp_b_, settings_.deess_freq_hz);

  DesignHighShelf(presence_shelf_, settings_.presence_hz, settings_.presence_gain_db);
  DesignHighShelf(air_shelf_, settings_.air_hz, settings_.air_gain_db);

  auto coef = [&](float ms) {
    return std::exp(-1.0f / (std::max(0.01f, ms) * sample_rate_ / 1000.0f));
  };

  comp1_.threshold_db = settings_.comp1_threshold_db;
  comp1_.ratio = std::max(1.0f, settings_.comp1_ratio);
  comp1_.attack_coef = coef(settings_.comp1_attack_ms);
  comp1_.release_coef = coef(settings_.comp1_release_ms);

  comp2_.threshold_db = settings_.comp2_threshold_db;
  comp2_.ratio = std::max(1.0f, settings_.comp2_ratio);
  comp2_.attack_coef = coef(settings_.comp2_attack_ms);
  comp2_.release_coef = coef(settings_.comp2_release_ms);

  parallel_comp_.threshold_db = settings_.parallel_threshold_db;
  parallel_comp_.ratio = std::max(1.0f, settings_.parallel_ratio);
  parallel_comp_.attack_coef = coef(2.0f);
  parallel_comp_.release_coef = coef(120.0f);

  // De-essing has to be fast enough to catch a consonant but release quickly
  // so it doesn't dull the following vowel.
  deess_attack_coef_ = coef(0.5f);
  deess_release_coef_ = coef(40.0f);
}

void VocalChain::DesignHighpass(Biquad& filter, float freq) {
  freq = std::clamp(freq, 10.0f, sample_rate_ * 0.45f);
  const float w0 = 2.0f * kPi * freq / sample_rate_;
  const float cos_w0 = std::cos(w0);
  const float alpha = std::sin(w0) / (2.0f * kButterworthQ);
  const float a0 = 1.0f + alpha;

  filter.b0 = ((1.0f + cos_w0) * 0.5f) / a0;
  filter.b1 = (-(1.0f + cos_w0)) / a0;
  filter.b2 = ((1.0f + cos_w0) * 0.5f) / a0;
  filter.a1 = (-2.0f * cos_w0) / a0;
  filter.a2 = (1.0f - alpha) / a0;
}

void VocalChain::DesignLowpass(Biquad& filter, float freq) {
  freq = std::clamp(freq, 10.0f, sample_rate_ * 0.45f);
  const float w0 = 2.0f * kPi * freq / sample_rate_;
  const float cos_w0 = std::cos(w0);
  const float alpha = std::sin(w0) / (2.0f * kButterworthQ);
  const float a0 = 1.0f + alpha;

  filter.b0 = ((1.0f - cos_w0) * 0.5f) / a0;
  filter.b1 = (1.0f - cos_w0) / a0;
  filter.b2 = ((1.0f - cos_w0) * 0.5f) / a0;
  filter.a1 = (-2.0f * cos_w0) / a0;
  filter.a2 = (1.0f - alpha) / a0;
}

void VocalChain::DesignHighShelf(Biquad& filter, float freq, float gain_db) {
  freq = std::clamp(freq, 10.0f, sample_rate_ * 0.45f);
  const float A = std::pow(10.0f, gain_db / 40.0f);
  const float w0 = 2.0f * kPi * freq / sample_rate_;
  const float cos_w0 = std::cos(w0);
  const float alpha = std::sin(w0) / (2.0f * kButterworthQ);
  const float twoSqrtAalpha = 2.0f * std::sqrt(A) * alpha;

  const float a0 = (A + 1.0f) - (A - 1.0f) * cos_w0 + twoSqrtAalpha;
  filter.b0 = (A * ((A + 1.0f) + (A - 1.0f) * cos_w0 + twoSqrtAalpha)) / a0;
  filter.b1 = (-2.0f * A * ((A - 1.0f) + (A + 1.0f) * cos_w0)) / a0;
  filter.b2 = (A * ((A + 1.0f) + (A - 1.0f) * cos_w0 - twoSqrtAalpha)) / a0;
  filter.a1 = (2.0f * ((A - 1.0f) - (A + 1.0f) * cos_w0)) / a0;
  filter.a2 = ((A + 1.0f) - (A - 1.0f) * cos_w0 - twoSqrtAalpha) / a0;
}

float VocalChain::CompStage::Process(float sample, float& gr_out) {
  const float level_db = LinearToDb(sample);

  float target_gr = 0.0f;
  if (level_db > threshold_db) {
    target_gr = -(level_db - threshold_db) * (1.0f - 1.0f / ratio);
  }

  if (target_gr < envelope_db) {
    envelope_db = attack_coef * envelope_db + (1.0f - attack_coef) * target_gr;
  } else {
    envelope_db = release_coef * envelope_db + (1.0f - release_coef) * target_gr;
  }

  gr_out = envelope_db;
  return sample * DbToLinear(envelope_db);
}

float VocalChain::ApplySaturation(float x) const {
  const float amount = std::clamp(settings_.saturation_amount, 0.0f, 1.0f);
  if (amount <= 0.0f) return x;

  const float driven = x * std::max(0.01f, settings_.saturation_drive);
  const float saturated = std::tanh(driven);
  return x * (1.0f - amount) + saturated * amount;
}

void VocalChain::ProcessBlock(float* audio, size_t num_samples) {
  const float out_gain = DbToLinear(settings_.output_gain_db);
  const float deess_range = std::max(0.0f, settings_.deess_range_db);
  const float blend = std::clamp(settings_.parallel_blend, 0.0f, 1.0f);

  for (size_t i = 0; i < num_samples; ++i) {
    float x = audio[i];

    // 1. High-pass (4th order).
    x = highpass_b_.Process(highpass_a_.Process(x));

    // 2. De-ess. Split the sibilance band off, duck only that band when it
    // gets loud, then recombine. Ducking the full signal would dull the vowel
    // underneath every "s".
    if (settings_.deesser_enabled) {
      const float low = deess_lp_b_.Process(deess_lp_a_.Process(x));
      const float high = deess_hp_b_.Process(deess_hp_a_.Process(x));

      const float high_db = LinearToDb(high);
      float target_gr = 0.0f;
      if (high_db > settings_.deess_threshold_db) {
        const float ratio = std::max(1.0f, settings_.deess_ratio);
        target_gr = -(high_db - settings_.deess_threshold_db) * (1.0f - 1.0f / ratio);
        // Range-limit so heavy sibilance doesn't turn into a lisp.
        target_gr = std::max(target_gr, -deess_range);
      }

      if (target_gr < deess_env_db_) {
        deess_env_db_ = deess_attack_coef_ * deess_env_db_ +
                        (1.0f - deess_attack_coef_) * target_gr;
      } else {
        deess_env_db_ = deess_release_coef_ * deess_env_db_ +
                        (1.0f - deess_release_coef_) * target_gr;
      }
      deess_gr_db_ = deess_env_db_;

      x = low + high * DbToLinear(deess_env_db_);
    }

    // Keep a copy for the parallel path, taken after de-essing so the crushed
    // copy isn't full of sibilance.
    const float parallel_source = x;

    // 3. Fast compressor: catches peaks.
    if (settings_.comp1_enabled) {
      x = comp1_.Process(x, comp1_gr_db_);
    }

    // 4. Slow compressor: levels the performance.
    if (settings_.comp2_enabled) {
      x = comp2_.Process(x, comp2_gr_db_);
    }

    // 5. Saturation.
    x = ApplySaturation(x);

    // 6. Presence and air.
    x = presence_shelf_.Process(x);
    x = air_shelf_.Process(x);

    // 7. Parallel compression blend.
    if (blend > 0.0f) {
      float dummy_gr = 0.0f;
      const float crushed = parallel_comp_.Process(parallel_source, dummy_gr);
      x = x * (1.0f - blend) + crushed * blend;
    }

    audio[i] = x * out_gain;
  }
}

void VocalChain::Reset() {
  highpass_a_.ResetState();
  highpass_b_.ResetState();
  deess_lp_a_.ResetState();
  deess_lp_b_.ResetState();
  deess_hp_a_.ResetState();
  deess_hp_b_.ResetState();
  presence_shelf_.ResetState();
  air_shelf_.ResetState();

  comp1_.envelope_db = 0.0f;
  comp2_.envelope_db = 0.0f;
  parallel_comp_.envelope_db = 0.0f;
  deess_env_db_ = 0.0f;

  deess_gr_db_ = 0.0f;
  comp1_gr_db_ = 0.0f;
  comp2_gr_db_ = 0.0f;
}

}  // namespace EchoSoundLab::DSP
