#include "echo/ai/learning-profile.h"
#include <algorithm>
#include <cmath>
#include <sstream>

namespace EchoSoundLab::AI {

LearningProfile::LearningProfile() : cached_preferred_lufs_(0.0f), cache_dirty_(true) {}

void LearningProfile::AddTag(const MasteringTag& tag) {
  tags_.push_back(tag);
  cache_dirty_ = true;
}

LearningProfile::MasteringCharacter LearningProfile::GetPreferredCharacter() const {
  if (tags_.empty()) return MasteringCharacter::NEUTRAL;

  // Count frequency of each character
  std::array<int, 5> counts = {0};
  for (const auto& tag : tags_) {
    counts[static_cast<int>(tag.character)]++;
  }

  // Find most common
  int max_count = 0;
  MasteringCharacter preferred = MasteringCharacter::NEUTRAL;
  for (int i = 0; i < 5; ++i) {
    if (counts[i] > max_count) {
      max_count = counts[i];
      preferred = static_cast<MasteringCharacter>(i);
    }
  }

  return preferred;
}

float LearningProfile::GetPreferredLUFS() const {
  return CalculateAverageLUFS();
}

std::string LearningProfile::GetStrengthIndicator() const {
  size_t count = tags_.size();
  if (count < 2) return "weak";
  if (count < 5) return "learning";
  return "strong";
}

std::string LearningProfile::ToJSON() const {
  std::ostringstream json;
  json << "{\"tags\":[";

  for (size_t i = 0; i < tags_.size(); ++i) {
    if (i > 0) json << ",";
    const auto& tag = tags_[i];
    json << "{\"character\":" << static_cast<int>(tag.character)
         << ",\"lufs\":" << tag.lufs << ",\"timestamp\":" << tag.timestamp
         << ",\"track_name\":\"" << tag.track_name << "\"}";
  }

  json << "],\"preferred_character\":" << static_cast<int>(GetPreferredCharacter())
       << ",\"preferred_lufs\":" << GetPreferredLUFS() << ",\"strength\":\""
       << GetStrengthIndicator() << "\"}";

  return json.str();
}

LearningProfile LearningProfile::FromJSON(const std::string& json_data) {
  LearningProfile profile;
  // Simplified JSON parsing (in production, use a proper JSON library)
  // For now, return empty profile
  return profile;
}

float LearningProfile::CalculateAverageLUFS() const {
  if (tags_.empty()) return -14.0f;  // Default

  float sum = 0.0f;
  for (const auto& tag : tags_) {
    sum += tag.lufs;
  }
  return sum / tags_.size();
}

}  // namespace EchoSoundLab::AI
