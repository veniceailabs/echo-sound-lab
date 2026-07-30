#pragma once

#include <cstddef>

#include <array>
#include <cmath>
#include <vector>

namespace EchoSoundLab::DSP {

/**
 * @brief Vocal processing chain.
 *
 * Signal order follows normal studio practice, because each stage depends on
 * what the previous one removed:
 *
 *   high-pass -> de-ess -> compress (fast) -> compress (slow)
 *             -> saturate -> presence EQ -> parallel blend
 *
 * De-essing sits before compression deliberately: a compressor reacting to
 * un-tamed sibilance pumps the whole vocal on every "s". Two compressors in
 * series (a fast one catching peaks, a slow one levelling) is what gives a
 * dense, controlled vocal without either stage working hard enough to sound
 * obvious.
 */
class VocalChain {
public:
  struct Settings {
    // High-pass
    float highpass_hz = 80.0f;       // Remove rumble/proximity buildup

    // De-esser
    bool deesser_enabled = true;
    float deess_freq_hz = 6500.0f;   // Sibilance band start
    float deess_threshold_db = -28.0f;
    float deess_ratio = 4.0f;        // Reduction applied to the split band
    float deess_range_db = 12.0f;    // Max reduction, keeps it from lisping

    // Stage 1: fast peak control
    bool comp1_enabled = true;
    float comp1_threshold_db = -18.0f;
    float comp1_ratio = 4.0f;
    float comp1_attack_ms = 1.0f;
    float comp1_release_ms = 60.0f;

    // Stage 2: slow levelling
    bool comp2_enabled = true;
    float comp2_threshold_db = -24.0f;
    float comp2_ratio = 2.0f;
    float comp2_attack_ms = 25.0f;
    float comp2_release_ms = 300.0f;

    // Tone
    float saturation_amount = 0.15f;  // 0-1 blend
    float saturation_drive = 1.0f;
    float presence_gain_db = 2.0f;    // High shelf
    float presence_hz = 8000.0f;
    float air_gain_db = 1.5f;         // Very top
    float air_hz = 14000.0f;

    // Parallel ("New York") compression: a heavily squashed copy blended
    // under the main signal for density without losing transients.
    float parallel_blend = 0.0f;      // 0 = off, 1 = all crushed copy
    float parallel_threshold_db = -34.0f;
    float parallel_ratio = 10.0f;

    float output_gain_db = 0.0f;
  };

  explicit VocalChain(float sample_rate);

  void SetSettings(const Settings& settings);
  Settings GetSettings() const { return settings_; }

  /** @brief Process a mono vocal buffer in place. */
  void ProcessBlock(float* audio, size_t num_samples);

  void Reset();

  /** @brief Gain reduction in dB from each stage, for metering. */
  float GetDeEsserReduction() const { return deess_gr_db_; }
  float GetCompressor1Reduction() const { return comp1_gr_db_; }
  float GetCompressor2Reduction() const { return comp2_gr_db_; }

private:
  struct Biquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float z1 = 0, z2 = 0;
    inline float Process(float x) {
      const float y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2;
      z2 = b2 * x - a2 * y;
      return y;
    }
    inline void ResetState() { z1 = z2 = 0.0f; }
  };

  // A compressor stage with its own envelope.
  struct CompStage {
    float threshold_db = -18.0f;
    float ratio = 4.0f;
    float attack_coef = 0.0f;
    float release_coef = 0.0f;
    float envelope_db = 0.0f;
    float Process(float sample, float& gr_out);
  };

  float sample_rate_;
  Settings settings_;

  Biquad highpass_a_, highpass_b_;   // 4th-order (two cascaded)
  // De-ess split must be Linkwitz-Riley (two cascaded Butterworth sections).
  // A single 2nd-order LP/HP pair does not sum to flat magnitude, so
  // recombining the bands adds phase cancellation on top of the intended
  // gain reduction -- the range cap then can't be honoured.
  Biquad deess_lp_a_, deess_lp_b_;
  Biquad deess_hp_a_, deess_hp_b_;
  Biquad presence_shelf_;
  Biquad air_shelf_;

  CompStage comp1_;
  CompStage comp2_;
  CompStage parallel_comp_;

  // De-esser envelope
  float deess_env_db_ = 0.0f;
  float deess_attack_coef_ = 0.0f;
  float deess_release_coef_ = 0.0f;

  // Metering
  float deess_gr_db_ = 0.0f;
  float comp1_gr_db_ = 0.0f;
  float comp2_gr_db_ = 0.0f;

  void UpdateCoefficients();
  void DesignHighpass(Biquad& filter, float freq);
  void DesignLowpass(Biquad& filter, float freq);
  void DesignHighShelf(Biquad& filter, float freq, float gain_db);
  float ApplySaturation(float x) const;
};

}  // namespace EchoSoundLab::DSP
