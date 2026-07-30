#pragma once

#include <cstddef>

#include <array>
#include <cmath>

namespace EchoSoundLab::DSP {

/**
 * @brief Multiband Compressor - 4-Band Dynamic Processor
 * Applies frequency-aware compression to shape dynamics
 */
class MultibandCompressor {
public:
  static constexpr int NUM_BANDS = 4;

  struct CompressorParameters {
    float ratio;           // Compression ratio (1:1 to ∞:1, typically 2-8)
    float threshold_db;    // dB threshold (-60 to 0)
    float attack_ms;       // Attack time in milliseconds (0.5 - 50)
    float release_ms;      // Release time in milliseconds (50 - 1000)
    float makeup_gain_db;  // Output gain compensation in dB
  };

  struct BandDefinition {
    float crossover_freq;  // Hz - frequency where this band starts
    CompressorParameters params;
  };

  /**
   * @param sample_rate Sample rate in Hz
   */
  explicit MultibandCompressor(float sample_rate);

  /**
   * @brief Set parameters for a frequency band
   * @param band_index 0-3 (low, low-mid, mid-high, high)
   * @param band Band definition with crossover and compression params
   */
  void SetBand(int band_index, const BandDefinition& band);

  /**
   * @brief Process audio through multiband compressor
   * @param audio Input/output audio samples
   * @param num_samples Number of samples to process
   */
  void ProcessBlock(float* audio, size_t num_samples);

  /**
   * @brief Process a stereo pair with linked gain reduction per band.
   * Detection uses the louder channel within each band and applies the same
   * gain to both. Compressing channels independently makes the louder side
   * duck further than the quieter one, which walks the stereo image around.
   * @param left Left channel (in/out)
   * @param right Right channel (in/out)
   * @param num_samples Samples per channel
   */
  void ProcessStereo(float* left, float* right, size_t num_samples);

  /**
   * @brief Reset compressor state (gain reduction envelope)
   */
  void Reset();

  /**
   * @brief Get current gain reduction in dB (for visualization)
   * @param band_index Which band (0-3)
   * @return Current gain reduction value
   */
  float GetGainReduction(int band_index) const;

  /**
   * @brief Total latency introduced by the crossover, in samples.
   * Linkwitz-Riley crossovers are IIR and phase-shifting but not delaying,
   * so this is zero. Present so callers can treat all processors uniformly.
   */
  static constexpr size_t GetLatencySamples() { return 0; }

private:
  float sample_rate_;
  std::array<BandDefinition, NUM_BANDS> bands_;

  // Per-band state
  struct BandState {
    float envelope_db;     // Smoothed gain reduction envelope in dB
    float gain_reduction;  // Instantaneous target GR in dB
    float attack_coef;     // Cached from attack_ms / sample_rate
    float release_coef;    // Cached from release_ms / sample_rate
    float makeup_linear;   // Cached from makeup_gain_db
  };
  std::array<BandState, NUM_BANDS> states_;

  // One biquad section (transposed Direct Form II).
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

  // A 4th-order Linkwitz-Riley section is two cascaded Butterworth (Q=0.7071)
  // biquads of the same type. LR4 is the standard multiband crossover: the
  // lowpass and highpass branches sum to an allpass with no magnitude ripple
  // at the crossover point.
  struct LR4 {
    Biquad a, b;
    inline float Process(float x) { return b.Process(a.Process(x)); }
    inline void ResetState() { a.ResetState(); b.ResetState(); }
  };

  // NUM_BANDS bands require NUM_BANDS-1 crossover points, each with a lowpass
  // and a highpass branch.
  struct Crossover {
    LR4 lowpass;
    LR4 highpass;
    inline void ResetState() { lowpass.ResetState(); highpass.ResetState(); }
  };
  std::array<Crossover, NUM_BANDS - 1> crossovers_;
  // Right-channel crossover state, used only by ProcessStereo. Filter state
  // must not be shared between channels.
  std::array<Crossover, NUM_BANDS - 1> crossovers_r_;

  // Internal methods
  void UpdateCoefficients();
  void DesignLR4(LR4& filter, float frequency, bool highpass);
  float CompressBand(float sample, int band_index);
  // Returns the linked gain (linear, incl. makeup) for a band given the
  // louder of the two channels.
  float LinkedBandGain(float left_sample, float right_sample, int band_index);
  float CalculateGainReduction(float input_db, int band_index);
};

}  // namespace EchoSoundLab::DSP
