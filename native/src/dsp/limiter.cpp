#include "echo/dsp/limiter.h"
#include "echo/utils/simd-math.h"
#include <algorithm>
#include <cmath>

namespace EchoSoundLab::DSP {

TruePeakLimiter::TruePeakLimiter(float sample_rate, float look_ahead_ms)
    : sample_rate_(sample_rate),
      threshold_dbfs_(-0.3f),
      attack_ms_(0.5f),
      release_ms_(100.0f),
      envelope_db_(0.0f),
      gain_reduction_db_(0.0f) {
  // Setup lookahead buffer. envelope_db_ tracks gain reduction in dB and so
  // starts at 0 (no reduction) — starting at -100 would mute the signal until
  // the envelope released.
  lookahead_samples_ = std::max<size_t>(
      1, static_cast<size_t>(sample_rate * look_ahead_ms / 1000.0f));
  lookahead_buffer_.resize(lookahead_samples_, 0.0f);
  lookahead_index_ = 0;

  // Calculate coefficients
  attack_coef_ = std::exp(-1.0f / (attack_ms_ * sample_rate / 1000.0f));
  release_coef_ = std::exp(-1.0f / (release_ms_ * sample_rate / 1000.0f));
}

void TruePeakLimiter::SetParameters(float threshold_dbfs, float attack_ms, float release_ms) {
  threshold_dbfs_ = threshold_dbfs;
  attack_ms_ = std::max(0.1f, attack_ms);
  release_ms_ = std::max(10.0f, release_ms);

  attack_coef_ = std::exp(-1.0f / (attack_ms_ * sample_rate_ / 1000.0f));
  release_coef_ = std::exp(-1.0f / (release_ms_ * sample_rate_ / 1000.0f));
}

void TruePeakLimiter::ProcessBlock(float* audio, size_t num_samples) {
  for (size_t i = 0; i < num_samples; ++i) {
    const float input = audio[i];

    // The oldest sample in the ring is the one we emit; writing the new sample
    // over it delays the output by lookahead_samples_, which is what lets the
    // envelope react *before* a transient arrives.
    const float delayed = lookahead_buffer_[lookahead_index_];
    lookahead_buffer_[lookahead_index_] = input;
    lookahead_index_ = (lookahead_index_ + 1) % lookahead_samples_;

    // Peak across the lookahead window.
    const float peak = FindPeakInLookahead();
    const float peak_dbfs = 20.0f * std::log10(peak + 1e-12f);

    // Target gain reduction (<= 0 dB).
    const float target_gr = CalculateGainReduction(peak_dbfs);

    // Attack when we need *more* reduction (target below current), release
    // when we need less.
    if (target_gr < envelope_db_) {
      envelope_db_ = attack_coef_ * envelope_db_ + (1.0f - attack_coef_) * target_gr;
    } else {
      envelope_db_ = release_coef_ * envelope_db_ + (1.0f - release_coef_) * target_gr;
    }

    gain_reduction_db_ = envelope_db_;

    const float gain_linear = std::pow(10.0f, gain_reduction_db_ / 20.0f);
    audio[i] = delayed * gain_linear;
  }
}

void TruePeakLimiter::ProcessStereo(float* left, float* right, size_t num_samples) {
  if (lookahead_buffer_r_.size() != lookahead_buffer_.size()) {
    lookahead_buffer_r_.assign(lookahead_buffer_.size(), 0.0f);
  }

  for (size_t i = 0; i < num_samples; ++i) {
    const float in_l = left[i];
    const float in_r = right[i];

    const float delayed_l = lookahead_buffer_[lookahead_index_];
    const float delayed_r = lookahead_buffer_r_[lookahead_index_];
    lookahead_buffer_[lookahead_index_] = in_l;
    lookahead_buffer_r_[lookahead_index_] = in_r;
    lookahead_index_ = (lookahead_index_ + 1) % lookahead_samples_;

    // Detection from the louder channel across the whole lookahead window, so
    // both channels receive identical gain and the image never shifts.
    float peak = 0.0f;
    for (size_t j = 0; j < lookahead_buffer_.size(); ++j) {
      peak = std::max(peak, std::abs(lookahead_buffer_[j]));
      peak = std::max(peak, std::abs(lookahead_buffer_r_[j]));
    }
    const float peak_dbfs = 20.0f * std::log10(peak + 1e-12f);
    const float target_gr = CalculateGainReduction(peak_dbfs);

    if (target_gr < envelope_db_) {
      envelope_db_ = attack_coef_ * envelope_db_ + (1.0f - attack_coef_) * target_gr;
    } else {
      envelope_db_ = release_coef_ * envelope_db_ + (1.0f - release_coef_) * target_gr;
    }
    gain_reduction_db_ = envelope_db_;

    const float gain_linear = std::pow(10.0f, gain_reduction_db_ / 20.0f);
    left[i] = delayed_l * gain_linear;
    right[i] = delayed_r * gain_linear;
  }
}

void TruePeakLimiter::Reset() {
  std::fill(lookahead_buffer_r_.begin(), lookahead_buffer_r_.end(), 0.0f);
  std::fill(lookahead_buffer_.begin(), lookahead_buffer_.end(), 0.0f);
  lookahead_index_ = 0;
  envelope_db_ = 0.0f;
  gain_reduction_db_ = 0.0f;
}

float TruePeakLimiter::FindPeakInLookahead() const {
  float peak = 0.0f;
  for (float sample : lookahead_buffer_) {
    peak = std::max(peak, std::abs(sample));
  }
  return peak;
}

float TruePeakLimiter::CalculateGainReduction(float peak_dbfs) {
  if (peak_dbfs > threshold_dbfs_) {
    return threshold_dbfs_ - peak_dbfs;
  }
  return 0.0f;
}

void TruePeakLimiter::UpdateEnvelope(float target_db, bool is_attack) {
  if (is_attack) {
    envelope_db_ = attack_coef_ * envelope_db_ + (1.0f - attack_coef_) * target_db;
  } else {
    envelope_db_ = release_coef_ * envelope_db_ + (1.0f - release_coef_) * target_db;
  }
}

}  // namespace EchoSoundLab::DSP
