#pragma once

#include <cstddef>

#include <vector>
#include <string>
#include <map>

namespace EchoSoundLab::AI {

/**
 * @brief User Learning Profile
 * Learns mastering preferences from user feedback over time
 */
class LearningProfile {
public:
  enum class MasteringCharacter {
    WARM = 0,         // Boost bass/mids, smooth highs
    BRIGHT = 1,       // Crisp, present highs
    AGGRESSIVE = 2,   // Compressed, punchy
    DYNAMIC = 3,      // Minimal compression, natural
    NEUTRAL = 4,      // Balanced across spectrum
  };

  struct MasteringTag {
    MasteringCharacter character;
    float timestamp;                 // When was this tagged?
    float lufs;                      // What LUFS was used?
    std::string track_name;
    std::string user_feedback;       // Optional: "I like it warm"
  };

  /**
   * @brief Create empty learning profile
   */
  LearningProfile();

  /**
   * @brief Add a mastering preference tag
   */
  void AddTag(const MasteringTag& tag);

  /**
   * @brief Get recommended character based on learned profile
   * @return Most commonly preferred character
   */
  MasteringCharacter GetPreferredCharacter() const;

  /**
   * @brief Get recommended LUFS based on learned average
   */
  float GetPreferredLUFS() const;

  /**
   * @brief Check if profile is strong enough to use
   * @return true if enough data collected (>= 3 tags)
   */
  bool IsStrong() const { return tags_.size() >= 3; }

  /**
   * @brief Get profile strength indicator (weak/learning/strong)
   */
  std::string GetStrengthIndicator() const;

  /**
   * @brief Export profile as JSON
   */
  std::string ToJSON() const;

  /**
   * @brief Import profile from JSON
   */
  static LearningProfile FromJSON(const std::string& json_data);

  /**
   * @brief Get number of tags recorded
   */
  size_t TagCount() const { return tags_.size(); }

private:
  std::vector<MasteringTag> tags_;

  // Cache for calculations
  float cached_preferred_lufs_;
  bool cache_dirty_;

  float CalculateAverageLUFS() const;
};

}  // namespace EchoSoundLab::AI
