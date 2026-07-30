import { describe, expect, test } from 'vitest';
import { PolicyEngine } from '../action-authority/governance/semantic/PolicyEngine';
import { AcademyAudioEngine } from '../modules/master-class/engine/AcademyAudioEngine';

class FakeAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  private channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel] ?? this.channels[0];
  }
}

class FakeAudioContext {
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }
}

function ensurePolicyEngineReady(): void {
  try {
    PolicyEngine.getConfig();
  } catch {
    PolicyEngine.initialize();
  }
}

describe('AcademyAudioEngine', () => {
  test('creates a populated lesson object from real signal analysis', async () => {
    ensurePolicyEngineReady();
    (globalThis as typeof globalThis & { window: any }).window = {
      AudioContext: FakeAudioContext,
      webkitAudioContext: FakeAudioContext,
    };

    const audioContext = new FakeAudioContext();
    const sampleRate = 44100;
    const durationSec = 1.5;
    const buffer = audioContext.createBuffer(1, Math.floor(sampleRate * durationSec), sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < channelData.length; i += 1) {
      const t = i / sampleRate;
      channelData[i] = Math.sin(2 * Math.PI * 220 * t) * 0.42 + Math.sin(2 * Math.PI * 440 * t) * 0.14;
    }

    const engine = new AcademyAudioEngine();
    engine.initialize();

    const result = await engine.processAudio(buffer as unknown as AudioBuffer, 'user-123', 'Test Song');
    expect(result.success).toBe(true);
    expect(result.lessonObject).toBeDefined();
    expect(result.lessonObject?.stems.vocals.notes.length).toBeGreaterThanOrEqual(0);
    expect(result.lessonObject?.stems.bass.frequency.length).toBeGreaterThan(0);
    expect(result.lessonObject?.audioMetadata.tempo).toBeGreaterThan(0);
    expect(result.lessonObject?.visualizations.pianoRoll.notes.length).toBeGreaterThanOrEqual(0);
    expect(result.lessonObject?.visualizations.spectrogram.frames.length).toBeGreaterThan(0);
  });
});
