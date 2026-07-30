#include "echo/utils/simd-math.h"
#include <algorithm>
#include <cmath>

#ifdef __AVX2__
#include <immintrin.h>
#endif

namespace EchoSoundLab::Utils {

bool SIMDMath::IsAVX2Available() {
#ifdef __AVX2__
  return true;
#else
  return false;
#endif
}

bool SIMDMath::IsSSE42Available() {
#ifdef __SSE4_2__
  return true;
#else
  return false;
#endif
}

void SIMDMath::MultiplyByGain(float* audio, size_t num_samples, float gain_db) {
  float gain_linear = DbToLinear(gain_db);

#ifdef __AVX2__
  __m256 gain_vec = _mm256_set1_ps(gain_linear);
  size_t i = 0;

  // Process 8 samples at a time with AVX2
  for (; i + 8 <= num_samples; i += 8) {
    __m256 samples = _mm256_loadu_ps(&audio[i]);
    __m256 result = _mm256_mul_ps(samples, gain_vec);
    _mm256_storeu_ps(&audio[i], result);
  }

  // Process remaining samples
  for (; i < num_samples; ++i) {
    audio[i] *= gain_linear;
  }
#else
  // Fallback to scalar
  for (size_t i = 0; i < num_samples; ++i) {
    audio[i] *= gain_linear;
  }
#endif
}

float SIMDMath::FindPeak(const float* audio, size_t num_samples) {
  float peak = 0.0f;

#ifdef __AVX2__
  __m256 peak_vec = _mm256_setzero_ps();
  __m256 sign_mask = _mm256_set1_ps(-0.0f);

  size_t i = 0;
  for (; i + 8 <= num_samples; i += 8) {
    __m256 samples = _mm256_loadu_ps(&audio[i]);
    // Take absolute value
    samples = _mm256_andnot_ps(sign_mask, samples);
    // Update peak
    peak_vec = _mm256_max_ps(peak_vec, samples);
  }

  // Reduce: find max in vector
  float* peak_ptr = (float*)&peak_vec;
  peak = std::max({peak_ptr[0], peak_ptr[1], peak_ptr[2], peak_ptr[3],
                   peak_ptr[4], peak_ptr[5], peak_ptr[6], peak_ptr[7]});

  // Process remaining samples
  for (; i < num_samples; ++i) {
    peak = std::max(peak, std::abs(audio[i]));
  }
#else
  for (size_t i = 0; i < num_samples; ++i) {
    peak = std::max(peak, std::abs(audio[i]));
  }
#endif

  return peak;
}

float SIMDMath::CalculateRMS(const float* audio, size_t num_samples) {
  if (num_samples == 0) return 0.0f;

  float sum_squares = 0.0f;

#ifdef __AVX2__
  __m256 sum_vec = _mm256_setzero_ps();
  size_t i = 0;

  for (; i + 8 <= num_samples; i += 8) {
    __m256 samples = _mm256_loadu_ps(&audio[i]);
    __m256 squared = _mm256_mul_ps(samples, samples);
    sum_vec = _mm256_add_ps(sum_vec, squared);
  }

  // Reduce: sum across vector
  float* sum_ptr = (float*)&sum_vec;
  sum_squares = sum_ptr[0] + sum_ptr[1] + sum_ptr[2] + sum_ptr[3] +
                sum_ptr[4] + sum_ptr[5] + sum_ptr[6] + sum_ptr[7];

  // Process remaining
  for (; i < num_samples; ++i) {
    sum_squares += audio[i] * audio[i];
  }
#else
  for (size_t i = 0; i < num_samples; ++i) {
    sum_squares += audio[i] * audio[i];
  }
#endif

  return std::sqrt(sum_squares / num_samples);
}

float SIMDMath::LinearToDb(float linear) {
  return 20.0f * FastLog10(linear + 1e-10f);
}

float SIMDMath::DbToLinear(float db) {
  return FastPow10(db / 20.0f);
}

float SIMDMath::FastLog10(float x) {
  // Using log2(x) / log2(10)
  return std::log2(x) * 0.301029995664f;
}

float SIMDMath::FastPow10(float x) {
  // Using 2^(x * log2(10))
  return std::exp2(x * 3.321928094887f);
}

}  // namespace EchoSoundLab::Utils
