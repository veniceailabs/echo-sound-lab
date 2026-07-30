#include "echo/mastering-engine.h"
#include "echo/utils/simd-math.h"
#include <algorithm>
#include <cstring>

namespace EchoSoundLab {

MasteringEngine::MasteringEngine(float sample_rate)
    : sample_rate_(sample_rate), target_lufs_(-14.0f) {
  // Initialize all DSP components
  eq_ = std::make_unique<DSP::ParametricEQ>(sample_rate);
  compressor_ = std::make_unique<DSP::MultibandCompressor>(sample_rate);
  saturation_ = std::make_unique<DSP::Saturation>(sample_rate);
  limiter_ = std::make_unique<DSP::TruePeakLimiter>(sample_rate);
  metering_ = std::make_unique<DSP::LUFSMeter>(sample_rate);

  // Set default compressor configuration (4-band)
  DSP::MultibandCompressor::BandDefinition band0 = {
      20.0f, {4.0f, -24.0f, 20.0f, 300.0f, 0.0f}};
  DSP::MultibandCompressor::BandDefinition band1 = {
      250.0f, {3.0f, -18.0f, 15.0f, 200.0f, 0.0f}};
  DSP::MultibandCompressor::BandDefinition band2 = {
      2000.0f, {2.5f, -16.0f, 10.0f, 150.0f, 0.0f}};
  DSP::MultibandCompressor::BandDefinition band3 = {
      8000.0f, {2.0f, -14.0f, 8.0f, 100.0f, 0.0f}};

  compressor_->SetBand(0, band0);
  compressor_->SetBand(1, band1);
  compressor_->SetBand(2, band2);
  compressor_->SetBand(3, band3);
}

MasteringEngine::~MasteringEngine() = default;

std::pair<std::vector<float>, std::vector<float>> MasteringEngine::ProcessStereoBlock(
    const float* left, const float* right, size_t num_samples) {
  // Lazily create the right-channel processors and mirror the left channel's
  // configuration onto them.
  if (!eq_r_) {
    eq_r_ = std::make_unique<DSP::ParametricEQ>(sample_rate_);
    compressor_r_ = std::make_unique<DSP::MultibandCompressor>(sample_rate_);
    saturation_r_ = std::make_unique<DSP::Saturation>(sample_rate_);
    for (int i = 0; i < DSP::ParametricEQ::NUM_BANDS; ++i) {
      eq_r_->SetBand(i, eq_->GetBand(i));
    }
  }

  std::vector<float> buf_l(left, left + num_samples);
  std::vector<float> buf_r(right, right + num_samples);

  // 1-3. Tone and dynamics, per channel with independent state.
  eq_->ProcessBlock(buf_l.data(), num_samples);
  eq_r_->ProcessBlock(buf_r.data(), num_samples);
  // Stereo-linked so the louder channel can't duck further than the quieter
  // one and drag the image with it.
  compressor_->ProcessStereo(buf_l.data(), buf_r.data(), num_samples);
  saturation_->ProcessBlock(buf_l.data(), num_samples);
  saturation_r_->ProcessBlock(buf_r.data(), num_samples);

  // 4. Solve for one shared makeup gain against the stereo-summed loudness.
  const float pre_limit_lufs =
      DSP::LUFSMeter::CalculateLUFSStereo(buf_l.data(), buf_r.data(), num_samples, sample_rate_);
  float makeup_gain_db = CalculateMakeupGain(pre_limit_lufs, target_lufs_);

  if (pre_limit_lufs > -100.0f) {
    constexpr int MAX_ITERATIONS = 4;
    constexpr float TOLERANCE_LU = 0.1f;
    std::vector<float> scratch_l(num_samples), scratch_r(num_samples);

    for (int iter = 0; iter < MAX_ITERATIONS; ++iter) {
      std::copy(buf_l.begin(), buf_l.end(), scratch_l.begin());
      std::copy(buf_r.begin(), buf_r.end(), scratch_r.begin());
      ApplyGainToBuffer(scratch_l.data(), num_samples, makeup_gain_db);
      ApplyGainToBuffer(scratch_r.data(), num_samples, makeup_gain_db);

      DSP::TruePeakLimiter trial(sample_rate_);
      trial.SetParameters(limiter_threshold_dbfs_, 0.5f, 100.0f);
      trial.ProcessStereo(scratch_l.data(), scratch_r.data(), num_samples);

      const float achieved = DSP::LUFSMeter::CalculateLUFSStereo(
          scratch_l.data(), scratch_r.data(), num_samples, sample_rate_);
      const float error_lu = target_lufs_ - achieved;
      if (std::abs(error_lu) < TOLERANCE_LU) break;
      makeup_gain_db += error_lu;
    }
  }

  ApplyGainToBuffer(buf_l.data(), num_samples, makeup_gain_db);
  ApplyGainToBuffer(buf_r.data(), num_samples, makeup_gain_db);

  // 5. Stereo-linked limiting.
  limiter_->ProcessStereo(buf_l.data(), buf_r.data(), num_samples);

  // 6. Meter the finished programme (interleave for BS.1770 channel summing).
  metering_->Reset();
  std::vector<float> interleaved(num_samples * 2);
  for (size_t i = 0; i < num_samples; ++i) {
    interleaved[i * 2] = buf_l[i];
    interleaved[i * 2 + 1] = buf_r[i];
  }
  metering_->ProcessBlock(interleaved.data(), interleaved.size(), 2);

  // Report the BS.1770 channel-summed loudness rather than the meter's
  // interleaved average, which reads ~3 LU low for stereo.
  stereo_integrated_lufs_ =
      DSP::LUFSMeter::CalculateLUFSStereo(buf_l.data(), buf_r.data(), num_samples, sample_rate_);
  has_stereo_lufs_ = true;

  return {std::move(buf_l), std::move(buf_r)};
}

std::vector<float> MasteringEngine::ProcessBlock(const float* input_audio,
                                                  size_t num_samples,
                                                  int num_channels) {
  // Create working buffer
  std::vector<float> working_buffer(input_audio, input_audio + num_samples);

  // Processing chain:
  // 1. EQ
  eq_->ProcessBlock(working_buffer.data(), num_samples);

  // 2. Multiband Compression
  compressor_->ProcessBlock(working_buffer.data(), num_samples);

  // 3. Saturation
  saturation_->ProcessBlock(working_buffer.data(), num_samples);

  // 4. Loudness normalisation. This has to happen *before* the limiter --
  // applying makeup gain after it would push peaks straight back through the
  // ceiling with nothing left to catch them.
  //
  // Limiting itself removes loudness, so a single open-loop gain calculation
  // undershoots the target on dense material. We solve for the pre-limiter
  // gain on scratch copies, then commit exactly one real limiter pass. Doing
  // it this way (rather than re-limiting in place) keeps the total latency at
  // a single lookahead delay instead of accumulating one per iteration.
  const float pre_limit_lufs =
      DSP::LUFSMeter::CalculateLUFS(working_buffer.data(), num_samples, num_channels);
  float makeup_gain_db = CalculateMakeupGain(pre_limit_lufs, target_lufs_);

  if (pre_limit_lufs > -100.0f) {
    constexpr int MAX_ITERATIONS = 4;
    constexpr float TOLERANCE_LU = 0.1f;
    std::vector<float> scratch(num_samples);

    for (int iter = 0; iter < MAX_ITERATIONS; ++iter) {
      std::copy(working_buffer.begin(), working_buffer.end(), scratch.begin());
      ApplyGainToBuffer(scratch.data(), num_samples, makeup_gain_db);

      // Trial limit with a throwaway limiter so the real one keeps clean state.
      DSP::TruePeakLimiter trial(sample_rate_);
      trial.SetParameters(limiter_threshold_dbfs_, 0.5f, 100.0f);
      trial.ProcessBlock(scratch.data(), num_samples);

      const float achieved =
          DSP::LUFSMeter::CalculateLUFS(scratch.data(), num_samples, num_channels);
      const float error_lu = target_lufs_ - achieved;
      if (std::abs(error_lu) < TOLERANCE_LU) break;
      makeup_gain_db += error_lu;
    }
  }

  ApplyGainToBuffer(working_buffer.data(), num_samples, makeup_gain_db);

  // 5. True Peak Limiter -- final stage, guarantees the ceiling.
  limiter_->ProcessBlock(working_buffer.data(), num_samples);

  // 6. Final metering
  metering_->ProcessBlock(working_buffer.data(), num_samples, num_channels);

  return working_buffer;
}

void MasteringEngine::SetLUFSTarget(float lufs) {
  target_lufs_ = std::clamp(lufs, -23.0f, -7.0f);
}

void MasteringEngine::SetEQBand(int band,
                                 const DSP::ParametricEQ::BandParameters& params) {
  if (band >= 0 && band < DSP::ParametricEQ::NUM_BANDS) {
    eq_->SetBand(band, params);
  }
}

void MasteringEngine::SetCompressorBand(
    int band, const DSP::MultibandCompressor::BandDefinition& band_def) {
  if (band >= 0 && band < DSP::MultibandCompressor::NUM_BANDS) {
    compressor_->SetBand(band, band_def);
  }
}

void MasteringEngine::SetSaturation(float amount, float drive) {
  saturation_->SetParameters(std::clamp(amount, 0.0f, 1.0f),
                            std::clamp(drive, 0.0f, 2.0f),
                            DSP::Saturation::SaturationCurve::TANH);
}

void MasteringEngine::SetLimiterThreshold(float threshold_dbfs) {
  limiter_threshold_dbfs_ = threshold_dbfs;
  limiter_->SetParameters(threshold_dbfs, 0.5f, 100.0f);
}

DSP::LUFSMeter::LoudnessMetrics MasteringEngine::GetMetrics() const {
  DSP::LUFSMeter::LoudnessMetrics metrics = metering_->GetMetrics();
  if (has_stereo_lufs_) {
    metrics.integrated_lufs = stereo_integrated_lufs_;
  }
  return metrics;
}

float MasteringEngine::GetCompressorGainReduction(int band) const {
  return compressor_->GetGainReduction(band);
}

float MasteringEngine::GetLimiterGainReduction() const {
  return limiter_->GetGainReduction();
}

void MasteringEngine::Reset() {
  has_stereo_lufs_ = false;
  stereo_integrated_lufs_ = -100.0f;
  if (eq_r_) {
    eq_r_->Reset();
    compressor_r_->Reset();
    saturation_r_->Reset();
  }
  eq_->Reset();
  compressor_->Reset();
  saturation_->Reset();
  limiter_->Reset();
  metering_->Reset();
}

float MasteringEngine::CalculateMakeupGain(float input_lufs, float target_lufs) {
  if (input_lufs < -100.0f) return 0.0f;  // Silent input
  return target_lufs - input_lufs;
}

void MasteringEngine::ApplyGainToBuffer(float* audio, size_t num_samples,
                                        float gain_db) {
  if (gain_db == 0.0f) return;
  Utils::SIMDMath::MultiplyByGain(audio, num_samples, gain_db);
}

}  // namespace EchoSoundLab
