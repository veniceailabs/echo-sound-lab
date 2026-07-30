#include "echo/dsp/metering.h"
#include "echo/utils/simd-math.h"
#include <algorithm>
#include <cmath>

namespace EchoSoundLab::DSP {

namespace {
// Convert a mean K-weighted power to LUFS.
inline float PowerToLufs(double mean_power) {
  return -0.691f + 10.0f * std::log10(static_cast<float>(mean_power) + 1e-12f);
}

// One transposed-DF-II biquad step.
inline float BiquadStep(float x, float b0, float b1, float b2, float a1, float a2,
                        float& z1, float& z2) {
  const float y = b0 * x + z1;
  z1 = b1 * x - a1 * y + z2;
  z2 = b2 * x - a2 * y;
  return y;
}
}  // namespace

LUFSMeter::LUFSMeter(float sample_rate)
    : sample_rate_(sample_rate), block_count_(0), true_peak_(0.0f) {
  DesignKWeighting(sample_rate);
  DesignTruePeakFilters();

  // Fixed-size ring buffers for the sliding windows.
  momentary_buffer_.assign(static_cast<size_t>(sample_rate * 0.4f), 0.0f);   // 400ms
  short_term_buffer_.assign(static_cast<size_t>(sample_rate * 3.0f), 0.0f);  // 3s
  integrated_block_powers_.reserve(1024);
  Reset();
}

void LUFSMeter::DesignKWeighting(float sample_rate) {
  // ITU-R BS.1770-4 defines K-weighting analytically; these are the standard
  // bilinear-transform designs used by libebur128, valid at any sample rate.
  //
  // Stage 1: high-frequency shelving filter (head/torso acoustic model).
  {
    constexpr double f0 = 1681.974450955533;
    constexpr double G = 3.999843853973347;
    constexpr double Q = 0.7071752369554196;

    const double K = std::tan(M_PI * f0 / sample_rate);
    const double Vh = std::pow(10.0, G / 20.0);
    const double Vb = std::pow(Vh, 0.4996667741545416);
    const double a0 = 1.0 + K / Q + K * K;

    shelf_coeffs_.b0 = static_cast<float>((Vh + Vb * K / Q + K * K) / a0);
    shelf_coeffs_.b1 = static_cast<float>(2.0 * (K * K - Vh) / a0);
    shelf_coeffs_.b2 = static_cast<float>((Vh - Vb * K / Q + K * K) / a0);
    shelf_coeffs_.a1 = static_cast<float>(2.0 * (K * K - 1.0) / a0);
    shelf_coeffs_.a2 = static_cast<float>((1.0 - K / Q + K * K) / a0);
  }

  // Stage 2: RLB high-pass.
  {
    constexpr double f0 = 38.13547087602444;
    constexpr double Q = 0.5003270373238773;

    const double K = std::tan(M_PI * f0 / sample_rate);
    const double denom = 1.0 + K / Q + K * K;

    rlb_coeffs_.b0 = 1.0f;
    rlb_coeffs_.b1 = -2.0f;
    rlb_coeffs_.b2 = 1.0f;
    rlb_coeffs_.a1 = static_cast<float>(2.0 * (K * K - 1.0) / denom);
    rlb_coeffs_.a2 = static_cast<float>((1.0 - K / Q + K * K) / denom);
  }
}

void LUFSMeter::DesignTruePeakFilters() {
  // Polyphase windowed-sinc interpolator for 4x oversampling. Reconstructing
  // between samples is what reveals inter-sample peaks -- a raw sample peak
  // can read below 0 dBFS while the analog waveform overshoots it.
  for (int phase = 0; phase < TRUE_PEAK_OVERSAMPLE; ++phase) {
    const double offset = static_cast<double>(phase) / TRUE_PEAK_OVERSAMPLE;
    double sum = 0.0;
    std::array<double, TRUE_PEAK_TAPS> taps{};

    for (int t = 0; t < TRUE_PEAK_TAPS; ++t) {
      const double x = static_cast<double>(t) - (TRUE_PEAK_TAPS / 2 - 1) - offset;
      double sinc = (std::abs(x) < 1e-9) ? 1.0 : std::sin(M_PI * x) / (M_PI * x);
      // Blackman-Harris window keeps stopband leakage low.
      const double w = 2.0 * M_PI * t / (TRUE_PEAK_TAPS - 1);
      const double win = 0.35875 - 0.48829 * std::cos(w) + 0.14128 * std::cos(2 * w) -
                         0.01168 * std::cos(3 * w);
      taps[t] = sinc * win;
      sum += taps[t];
    }
    // Normalise each phase to unity DC gain so the interpolation is level-exact.
    for (int t = 0; t < TRUE_PEAK_TAPS; ++t) {
      tp_filters_[phase][t] = static_cast<float>(taps[t] / sum);
    }
  }
}

void LUFSMeter::UpdateTruePeak(float sample) {
  tp_history_[tp_history_index_] = sample;
  tp_history_index_ = (tp_history_index_ + 1) % TRUE_PEAK_TAPS;

  // Evaluate every interpolated sub-sample position and keep the largest.
  for (int phase = 0; phase < TRUE_PEAK_OVERSAMPLE; ++phase) {
    float acc = 0.0f;
    const auto& taps = tp_filters_[phase];
    for (int t = 0; t < TRUE_PEAK_TAPS; ++t) {
      const size_t idx = (tp_history_index_ + t) % TRUE_PEAK_TAPS;
      acc += tp_history_[idx] * taps[t];
    }
    const float mag = std::abs(acc);
    if (mag > true_peak_oversampled_) true_peak_oversampled_ = mag;
  }
}

void LUFSMeter::PushPower(float power) {
  // Momentary window (400ms), incremental sum.
  if (!momentary_buffer_.empty()) {
    momentary_sum_ -= momentary_buffer_[momentary_index_];
    momentary_buffer_[momentary_index_] = power;
    momentary_sum_ += power;
    momentary_index_ = (momentary_index_ + 1) % momentary_buffer_.size();
    if (momentary_filled_ < momentary_buffer_.size()) momentary_filled_++;
  }

  // Short-term window (3s), incremental sum.
  if (!short_term_buffer_.empty()) {
    short_term_sum_ -= short_term_buffer_[short_term_index_];
    short_term_buffer_[short_term_index_] = power;
    short_term_sum_ += power;
    short_term_index_ = (short_term_index_ + 1) % short_term_buffer_.size();
    if (short_term_filled_ < short_term_buffer_.size()) short_term_filled_++;
  }

  // Integrated loudness accumulates into discrete 400ms blocks, which are what
  // BS.1770 gating operates on.
  const size_t block_len = static_cast<size_t>(sample_rate_ * 0.4f);
  integrated_block_accum_ += power;
  integrated_block_count_++;
  if (block_len > 0 && integrated_block_count_ >= block_len) {
    integrated_block_powers_.push_back(
        static_cast<float>(integrated_block_accum_ / integrated_block_count_));
    integrated_block_accum_ = 0.0;
    integrated_block_count_ = 0;
  }
}

void LUFSMeter::ProcessBlock(const float* audio, size_t num_samples, int num_channels) {
  if (num_channels < 1) num_channels = 1;
  const int channels = std::min(num_channels, static_cast<int>(filter_state_.size()));

  // Update peaks. true_peak_ tracks the raw sample peak; UpdateTruePeak
  // additionally reconstructs between samples to catch inter-sample overs.
  for (size_t i = 0; i < num_samples; ++i) {
    const float mag = std::abs(audio[i]);
    if (mag > true_peak_) true_peak_ = mag;
    UpdateTruePeak(audio[i]);
  }

  // K-weight each sample and accumulate its power. Input is interleaved.
  for (size_t i = 0; i < num_samples; ++i) {
    const int channel = static_cast<int>(i % static_cast<size_t>(num_channels));
    const int slot = std::min(channel, channels - 1);
    const float weighted = ApplyKWeighting(audio[i], filter_state_[slot]);
    PushPower(weighted * weighted);
  }

  block_count_++;
}

void LUFSMeter::Reset() {
  for (auto& ch : filter_state_) {
    ch.shelf = {0.0f, 0.0f};
    ch.hpf = {0.0f, 0.0f};
  }
  std::fill(momentary_buffer_.begin(), momentary_buffer_.end(), 0.0f);
  std::fill(short_term_buffer_.begin(), short_term_buffer_.end(), 0.0f);
  momentary_index_ = short_term_index_ = 0;
  momentary_filled_ = short_term_filled_ = 0;
  momentary_sum_ = short_term_sum_ = 0.0;
  integrated_block_powers_.clear();
  integrated_block_accum_ = 0.0;
  integrated_block_count_ = 0;
  block_count_ = 0;
  true_peak_ = 0.0f;
  true_peak_oversampled_ = 0.0f;
  tp_history_.fill(0.0f);
  tp_history_index_ = 0;
}

LUFSMeter::LoudnessMetrics LUFSMeter::GetMetrics() const {
  LoudnessMetrics metrics = {};

  metrics.momentary_lufs =
      momentary_filled_ > 0 ? PowerToLufs(momentary_sum_ / momentary_filled_) : -100.0f;
  metrics.short_term_lufs =
      short_term_filled_ > 0 ? PowerToLufs(short_term_sum_ / short_term_filled_) : -100.0f;

  // Integrated loudness with BS.1770 two-stage gating.
  metrics.integrated_lufs = -100.0f;
  metrics.loudness_range = 0.0f;

  std::vector<float> blocks = integrated_block_powers_;
  // Include the partial trailing block so short buffers still measure.
  if (integrated_block_count_ > 0) {
    blocks.push_back(static_cast<float>(integrated_block_accum_ / integrated_block_count_));
  }

  if (!blocks.empty()) {
    // Absolute gate at -70 LUFS.
    std::vector<float> gated;
    gated.reserve(blocks.size());
    for (float p : blocks) {
      if (PowerToLufs(p) > ABSOLUTE_GATE_LUFS) gated.push_back(p);
    }

    if (!gated.empty()) {
      double sum = 0.0;
      for (float p : gated) sum += p;
      const float ungated_lufs = PowerToLufs(sum / gated.size());

      // Relative gate at -10 LU below the absolute-gated mean.
      const float relative_gate = ungated_lufs - 10.0f;
      std::vector<float> final_blocks;
      final_blocks.reserve(gated.size());
      for (float p : gated) {
        if (PowerToLufs(p) > relative_gate) final_blocks.push_back(p);
      }

      const std::vector<float>& use = final_blocks.empty() ? gated : final_blocks;
      double final_sum = 0.0;
      for (float p : use) final_sum += p;
      metrics.integrated_lufs = PowerToLufs(final_sum / use.size());

      // Loudness range: 10th-95th percentile spread of the gated blocks.
      if (use.size() > 2) {
        std::vector<float> lufs_values;
        lufs_values.reserve(use.size());
        for (float p : use) lufs_values.push_back(PowerToLufs(p));
        std::sort(lufs_values.begin(), lufs_values.end());
        const float p10 = lufs_values[lufs_values.size() / 10];
        const float p95 =
            lufs_values[std::min(lufs_values.size() - 1, lufs_values.size() * 95 / 100)];
        metrics.loudness_range = p95 - p10;
      }
    }
  }

  // true_peak stays the raw sample peak; true_peak_dbfs reports the
  // oversampled inter-sample value, which is the dBTP figure that matters for
  // delivery. The oversampled value is never below the sample peak.
  metrics.true_peak = true_peak_;
  const float dbtp = std::max(true_peak_oversampled_, true_peak_);
  metrics.true_peak_dbfs = 20.0f * std::log10(dbtp + 1e-12f);

  return metrics;
}

float LUFSMeter::CalculateLUFS(const float* audio, size_t num_samples, int num_channels) {
  LUFSMeter meter(48000.0f);
  meter.ProcessBlock(audio, num_samples, num_channels);
  return meter.GetMetrics().integrated_lufs;
}

float LUFSMeter::CalculateLUFSStereo(const float* left, const float* right,
                                     size_t num_samples, float sample_rate) {
  // Per BS.1770 the channel powers are summed, not averaged. We K-weight each
  // channel with its own filter state, sum the two power series, then apply
  // the same 400ms blocking and gating used for mono.
  LUFSMeter meter_l(sample_rate);
  LUFSMeter meter_r(sample_rate);

  const size_t block_len = static_cast<size_t>(sample_rate * 0.4f);
  std::vector<float> block_powers;
  block_powers.reserve(num_samples / std::max<size_t>(1, block_len) + 2);

  double accum = 0.0;
  size_t count = 0;

  for (size_t i = 0; i < num_samples; ++i) {
    const float wl = meter_l.ApplyKWeighting(left[i], meter_l.filter_state_[0]);
    const float wr = meter_r.ApplyKWeighting(right[i], meter_r.filter_state_[0]);
    accum += static_cast<double>(wl) * wl + static_cast<double>(wr) * wr;
    if (++count >= block_len && block_len > 0) {
      block_powers.push_back(static_cast<float>(accum / count));
      accum = 0.0;
      count = 0;
    }
  }
  if (count > 0) block_powers.push_back(static_cast<float>(accum / count));
  if (block_powers.empty()) return -100.0f;

  // Absolute gate at -70 LUFS.
  std::vector<float> gated;
  gated.reserve(block_powers.size());
  for (float p : block_powers) {
    if (PowerToLufs(p) > ABSOLUTE_GATE_LUFS) gated.push_back(p);
  }
  if (gated.empty()) return -100.0f;

  double sum = 0.0;
  for (float p : gated) sum += p;
  const float ungated = PowerToLufs(sum / gated.size());

  // Relative gate at -10 LU.
  const float relative_gate = ungated - 10.0f;
  std::vector<float> final_blocks;
  final_blocks.reserve(gated.size());
  for (float p : gated) {
    if (PowerToLufs(p) > relative_gate) final_blocks.push_back(p);
  }

  const std::vector<float>& use = final_blocks.empty() ? gated : final_blocks;
  double final_sum = 0.0;
  for (float p : use) final_sum += p;
  return PowerToLufs(final_sum / use.size());
}

float LUFSMeter::ApplyKWeighting(float sample, ChannelState& state) {
  // Stage 1: high-shelf pre-filter (head/torso model).
  const float shelved =
      BiquadStep(sample, shelf_coeffs_.b0, shelf_coeffs_.b1, shelf_coeffs_.b2,
                 shelf_coeffs_.a1, shelf_coeffs_.a2, state.shelf.z1, state.shelf.z2);

  // Stage 2: RLB high-pass.
  return BiquadStep(shelved, rlb_coeffs_.b0, rlb_coeffs_.b1, rlb_coeffs_.b2,
                    rlb_coeffs_.a1, rlb_coeffs_.a2, state.hpf.z1, state.hpf.z2);
}

}  // namespace EchoSoundLab::DSP
