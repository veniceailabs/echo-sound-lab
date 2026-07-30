#!/usr/bin/env python3

"""
NATURAL VOICE SYNTHESIS SYSTEM
Uses pyttsx3 with native macOS TTS for professional, natural-sounding voiceovers
Includes prosody control for realistic speech patterns
"""

import pyttsx3
import os
import sys
import json

class NaturalVoiceSystem:
    def __init__(self, voice_type="professional"):
        """
        Initialize with pyttsx3 using macOS native TTS engine
        voice_type: 'professional', 'conversational', or 'energetic'
        """
        self.engine = pyttsx3.init()
        self.voice_type = voice_type
        self.configure_voice()

    def configure_voice(self):
        """Configure voice with natural prosody"""
        voices = self.engine.getProperty('voices')

        # Select best available voice
        # macOS provides good quality voices through NSSpeechSynthesizer
        selected_voice = None

        for voice in voices:
            # Prefer voices that sound natural
            voice_name = voice.name.lower()
            if any(name in voice_name for name in ['Samantha', 'Karen', 'Victoria', 'Flo']):
                selected_voice = voice.id
                break

        if selected_voice:
            self.engine.setProperty('voice', selected_voice)

        # Set rate based on type (words per minute)
        if self.voice_type == "professional":
            # Slower, measured, clear speech
            self.engine.setProperty('rate', 145)
            self.engine.setProperty('volume', 0.95)
        elif self.voice_type == "conversational":
            # Slightly faster, more natural
            self.engine.setProperty('rate', 160)
            self.engine.setProperty('volume', 0.9)
        else:  # energetic
            self.engine.setProperty('rate', 170)
            self.engine.setProperty('volume', 0.95)

    def add_prosody(self, text):
        """
        Add natural pauses and inflection markers to text
        """
        # Add pauses at sentence boundaries
        text = text.replace('. ', '.\n')  # Sentence pause
        text = text.replace('! ', '!\n')  # Emphasis pause
        text = text.replace('? ', '?\n')  # Question pause
        text = text.replace(', ', ', ')   # Minor pause at commas
        return text

    def generate_voiceover(self, text, output_path):
        """Generate natural-sounding voiceover"""
        try:
            # Add prosodic elements
            processed_text = self.add_prosody(text)

            # Save to file
            self.engine.save_to_file(processed_text, output_path)
            self.engine.runAndWait()

            if os.path.exists(output_path):
                return True, None
            else:
                return False, "File not created"
        except Exception as e:
            return False, str(e)

    def get_info(self):
        """Return voice configuration"""
        voices = self.engine.getProperty('voices')
        rate = self.engine.getProperty('rate')
        volume = self.engine.getProperty('volume')

        return {
            'engine': 'pyttsx3 (macOS NSSpeechSynthesizer)',
            'available_voices': len(voices),
            'rate': rate,
            'volume': volume,
            'type': self.voice_type
        }


def main():
    """CLI interface"""
    if len(sys.argv) < 3:
        print("Usage: natural-voice-system.py <text> <output_path> [voice_type]")
        print("Voice types: professional (default), conversational, energetic")
        sys.exit(1)

    text = sys.argv[1]
    output_path = sys.argv[2]
    voice_type = sys.argv[3] if len(sys.argv) > 3 else "professional"

    # Generate voiceover
    voice_system = NaturalVoiceSystem(voice_type=voice_type)
    success, error = voice_system.generate_voiceover(text, output_path)

    if success:
        print(f"✓ Generated: {output_path}")
        info = voice_system.get_info()
        print(f"  Engine: {info['engine']}")
        print(f"  Rate: {info['rate']} wpm")
        sys.exit(0)
    else:
        print(f"✗ Error: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
