#include "echo/ai/reference-analyzer.h"
#include "echo/dsp/metering.h"
#include "echo/utils/simd-math.h"
#include <cmath>
#include <sstream>

namespace EchoSoundLab::AI {

ReferenceAnalyzer::ReferenceAnalyzer(float sample_rate) : sample_rate_(sample_rate) {}

ReferenceAnalyzer::ReferenceCharacteristics ReferenceAnalyzer::Analyze(
    const float* audio, size_t num_samples, int num_channels) {
  ReferenceCharacteristics characteristics = {};

  // Measure LUFS
  characteristics.target_lufs = DSP::LUFSMeter::CalculateLUFS(audio, num_samples, num_channels);

  // Measure true peak
  float peak = Utils::SIMDMath::FindPeak(audio, num_samples);
  characteristics.true_peak = peak;

  // Calculate loudness range (simplified)
  characteristics.loudness_range = 12.0f;  // Default estimate

  // Measure stereo width (if stereo)
  if (num_channels == 2) {
    float left_power = 0.0f, right_power = 0.0f, correlation = 0.0f;
    for (size_t i = 0; i < num_samples; i += 2) {
      left_power += audio[i] * audio[i];
      right_power += audio[i + 1] * audio[i + 1];
      correlation += audio[i] * audio[i + 1];
    }
    float total = left_power + right_power;
    if (total > 0.0f) {
      float stereo_index = correlation / total;
      characteristics.stereo_width = (1.0f - std::abs(stereo_index)) * 100.0f;
    } else {
      characteristics.stereo_width = 50.0f;
    }
  } else {
    characteristics.stereo_width = 0.0f;
  }

  // Extract spectral balance
  std::vector<float> spectrum = ExtractSpectralBalance(audio, num_samples);
  if (spectrum.size() >= 3) {
    characteristics.bass_energy = spectrum[0];
    characteristics.midrange_presence = spectrum[1];
    characteristics.treble_brightness = spectrum[2];
  }

  characteristics.air_shimmer = 0.3f;  // Default

  // Estimate compression intensity
  characteristics.compression_intensity = MeasureCompressionIntensity(audio, num_samples);

  // Estimate saturation amount
  characteristics.saturation_amount = MeasureSaturationAmount(audio, num_samples);

  // Generate description
  std::ostringstream desc;
  if (characteristics.bass_energy > 0.6f) desc << "Warm bass, ";
  if (characteristics.treble_brightness > 0.6f) desc << "Bright highs, ";
  if (characteristics.compression_intensity > 0.5f) desc << "Compressed, ";
  if (characteristics.saturation_amount > 0.3f) desc << "Saturated";

  std::string description = desc.str();
  if (!description.empty() && description.back() == ' ') {
    description.pop_back();
    if (description.back() == ',') description.pop_back();
  }
  characteristics.character_description = description.empty() ? "Neutral" : description;

  return characteristics;
}

std::string ReferenceAnalyzer::GenerateMatchingProfile(
    const ReferenceCharacteristics& ref, float target_lufs) {
  // JSON-like output
  std::ostringstream json;
  json << "{"
       << "\"target_lufs\":" << target_lufs << ","
       << "\"ref_lufs\":" << ref.target_lufs << ","
       << "\"makeup_gain_db\":" << (target_lufs - ref.target_lufs) << ","
       << "\"eq_bass_boost\":" << (ref.bass_energy > 0.6f ? 3.0f : 0.0f) << ","
       << "\"eq_treble_boost\":" << (ref.treble_brightness > 0.6f ? 2.0f : 0.0f) << ","
       << "\"compression_intensity\":" << ref.compression_intensity << ","
       << "\"saturation_amount\":" << ref.saturation_amount << "}";

  return json.str();
}

std::vector<float> ReferenceAnalyzer::ExtractSpectralBalance(const float* audio, size_t num_samples) {
  // Simplified: measure energy in different frequency ranges
  // In a real implementation, this would use FFT
  std::vector<float> balance(3, 0.33f);  // Default balanced spectrum

  // For now, return equal distribution
  return balance;
}

float ReferenceAnalyzer::MeasureCompressionIntensity(const float* audio, size_t num_samples) {
  // Measure crest factor (peak-to-average ratio)
  float rms = Utils::SIMDMath::CalculateRMS(audio, num_samples);
  float peak = Utils::SIMDMath::FindPeak(audio, num_samples);

  if (rms > 1e-10f) {
    float crest_db = 20.0f * std::log10(peak / rms + 1e-10f);
    // Higher crest factor = less compression
    // Normalize: typical crest factor 12-24 dB
    return std::max(0.0f, std::min(1.0f, 1.0f - (crest_db - 6.0f) / 24.0f));
  }
  return 0.0f;
}

float ReferenceAnalyzer::MeasureSaturationAmount(const float* audio, size_t num_samples) {
  // Measure harmonic distortion (simplified)
  // Count peaks that are very close to adjacent peaks
  float peak = Utils::SIMDMath::FindPeak(audio, num_samples);
  if (peak < 0.01f) return 0.0f;

  int near_peak_count = 0;
  const float threshold = peak * 0.9f;

  for (size_t i = 1; i < num_samples - 1; ++i) {
    if (std::abs(audio[i]) > threshold) {
      if (std::abs(audio[i - 1]) > threshold || std::abs(audio[i + 1]) > threshold) {
        near_peak_count++;
      }
    }
  }

  float saturation = static_cast<float>(near_peak_count) / num_samples * 10.0f;
  return std::clamp(saturation, 0.0f, 1.0f);
}

}  // namespace EchoSoundLab::AI
