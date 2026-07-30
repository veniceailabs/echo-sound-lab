import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class FakeAudioParam {
  value = 0;
}

class FakeNode {
  connect() {}
  disconnect() {}
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeAnalyserNode extends FakeNode {
  fftSize = 0;
  frequencyBinCount = 0;
  smoothingTimeConstant = 0;
  getByteFrequencyData() {}
  getByteTimeDomainData() {}
}

class FakeBufferSourceNode extends FakeNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = new FakeNode();
  createGain() {
    return new FakeGainNode();
  }
  createBufferSource() {
    return new FakeBufferSourceNode();
  }
  createAnalyser() {
    return new FakeAnalyserNode();
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

describe('AudioEngine playback safety', () => {
  const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;

  beforeEach(() => {
    const stubWindow = {
      AudioContext: FakeAudioContext,
      webkitAudioContext: undefined,
    } as unknown as Window;
    (globalThis as typeof globalThis & { window?: Window }).window = stubWindow;
  });

  afterEach(() => {
    (globalThis as typeof globalThis & { window?: Window }).window = originalWindow;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  test('refuses to report playback when no buffer is loaded', async () => {
    const { AudioEngine } = await import('../services/audioEngine');
    const engine = new AudioEngine();

    await expect(engine.play()).rejects.toThrow('No audio buffer loaded');
    expect(engine.getEngineSnapshot().isPlaying).toBe(false);
  });

  test('falls back to Web Audio playback when native media playback is blocked', async () => {
    const { AudioEngine } = await import('../services/audioEngine');
    const engine = new AudioEngine();
    const nativePlay = vi.fn().mockRejectedValue(new Error('NotAllowedError'));

    (engine as any).buffer = { duration: 12 } as AudioBuffer;
    (engine as any).preferNativePlayback = true;
    (engine as any).rawElement = {
      currentTime: 0,
      duration: 12,
      play: nativePlay,
      pause: vi.fn(),
    };

    await expect(engine.play(3)).resolves.toBeUndefined();
    expect(nativePlay).toHaveBeenCalledTimes(1);
    expect(engine.getEngineSnapshot().isPlaying).toBe(true);
  });

  test('prefers decoded buffer playback when a buffer is already loaded', async () => {
    const { AudioEngine } = await import('../services/audioEngine');
    const engine = new AudioEngine();
    const nativePlay = vi.fn().mockResolvedValue(undefined);

    (engine as any).buffer = { duration: 8 } as AudioBuffer;
    (engine as any).rawElement = {
      currentTime: 0,
      duration: 8,
      play: nativePlay,
      pause: vi.fn(),
    };

    await engine.play(2);
    expect(nativePlay).not.toHaveBeenCalled();
    expect((engine as any).source).not.toBeNull();
    expect(engine.getEngineSnapshot().isPlaying).toBe(true);
  });
});
