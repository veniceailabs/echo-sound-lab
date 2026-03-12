export interface NativeVoiceOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string;
}

export interface NativeVoiceAsset {
  audioUrl: string;
  durationSec: number;
  transcript: string;
}

function getSpeechSynthesisOrThrow(): SpeechSynthesis {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('Speech synthesis is unavailable in this environment.');
  }
  return window.speechSynthesis;
}

function estimateSpeechDurationSec(text: string, rate = 1): number {
  const words = Math.max(1, text.trim().split(/\s+/).length);
  const wordsPerSecond = 2.4 * Math.max(0.5, rate);
  return Math.max(1.5, words / wordsPerSecond);
}

function findVoiceByName(voices: SpeechSynthesisVoice[], voiceName?: string): SpeechSynthesisVoice | null {
  if (!voiceName) return null;
  const normalized = voiceName.trim().toLowerCase();
  return voices.find((voice) => voice.name.trim().toLowerCase() === normalized) || null;
}

function createToneWavBlob(durationSec: number): Blob {
  const sampleRate = 22050;
  const channels = 1;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSec));
  const pcmBytes = frameCount * 2;
  const headerBytes = 44;
  const buffer = new ArrayBuffer(headerBytes + pcmBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcmBytes, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.04);
    const release = Math.min(1, (durationSec - t) / 0.12);
    const envelope = Math.max(0, Math.min(attack, release));
    const formantA = Math.sin(2 * Math.PI * 180 * t);
    const formantB = Math.sin(2 * Math.PI * 720 * t + 0.6);
    const sample = (formantA * 0.6 + formantB * 0.2) * envelope * 0.2;
    const pcm = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, Math.floor(pcm * 32767), true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

class NativeVoiceService {
  async speakText(text: string, options: NativeVoiceOptions = {}): Promise<void> {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const synthesis = getSpeechSynthesisOrThrow();
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(trimmedText);
    utterance.lang = options.lang || utterance.lang || 'en-US';
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;

    const voices = synthesis.getVoices?.() || [];
    const desiredVoice = findVoiceByName(voices, options.voiceName);
    if (desiredVoice) utterance.voice = desiredVoice;

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(event.error || 'Speech synthesis failed'));
      synthesis.speak(utterance);
    });
  }

  async createVoiceAsset(text: string, options: NativeVoiceOptions = {}): Promise<NativeVoiceAsset> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Native voice text cannot be empty.');
    }
    const durationSec = estimateSpeechDurationSec(trimmedText, options.rate);
    const wavBlob = createToneWavBlob(durationSec);
    const audioUrl = URL.createObjectURL(wavBlob);
    return {
      audioUrl,
      durationSec,
      transcript: trimmedText,
    };
  }
}

export const nativeVoiceService = new NativeVoiceService();
