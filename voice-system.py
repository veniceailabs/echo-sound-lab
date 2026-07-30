#!/usr/bin/env python3

"""
CUSTOM VOICE SYNTHESIS SYSTEM
Builds professional voiceovers without external APIs
Uses pyttsx3 with advanced prosody control
"""

import pyttsx3
import os
import sys
import json
from pathlib import Path

class VoiceSystem:
    def __init__(self, voice_profile="professional"):
        """Initialize TTS engine with natural voice settings"""
        self.engine = pyttsx3.init()
        self.voice_profile = voice_profile
        self.configure_voice()

    def configure_voice(self):
        """Configure voice with natural prosody parameters"""
        # Set up voice based on profile
        if self.voice_profile == "professional":
            # Professional, clear, moderately paced
            self.engine.setProperty('rate', 145)  # Slower than default for clarity
            self.engine.setProperty('volume', 0.95)  # High volume

            # Try to find a natural male voice
            voices = self.engine.getProperty('voices')
            for voice in voices:
                # Prefer voices that sound natural
                if 'david' in voice.name.lower() or 'henry' in voice.name.lower():
                    self.engine.setProperty('voice', voice.id)
                    break
            else:
                # Fallback to first available voice
                if voices:
                    self.engine.setProperty('voice', voices[0].id)

        elif self.voice_profile == "conversational":
            # More natural, slightly faster
            self.engine.setProperty('rate', 155)
            self.engine.setProperty('volume', 0.9)

    def generate_voiceover(self, text, output_path):
        """Generate voiceover with natural prosody"""
        try:
            # Save to file
            self.engine.save_to_file(text, output_path)
            self.engine.runAndWait()

            if os.path.exists(output_path):
                return True, None
            else:
                return False, "File not created"
        except Exception as e:
            return False, str(e)

    def get_voice_info(self):
        """Return current voice configuration"""
        voices = self.engine.getProperty('voices')
        rate = self.engine.getProperty('rate')
        volume = self.engine.getProperty('volume')

        return {
            'available_voices': len(voices),
            'rate': rate,
            'volume': volume,
            'profile': self.voice_profile
        }


def main():
    """CLI interface for voice generation"""
    if len(sys.argv) < 3:
        print("Usage: voice-system.py <text> <output_path> [voice_profile]")
        print("Profiles: professional (default), conversational")
        sys.exit(1)

    text = sys.argv[1]
    output_path = sys.argv[2]
    voice_profile = sys.argv[3] if len(sys.argv) > 3 else "professional"

    # Create voice system
    voice_system = VoiceSystem(voice_profile=voice_profile)

    # Generate voiceover
    success, error = voice_system.generate_voiceover(text, output_path)

    if success:
        print(f"✓ Generated: {output_path}")
        sys.exit(0)
    else:
        print(f"✗ Error: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
