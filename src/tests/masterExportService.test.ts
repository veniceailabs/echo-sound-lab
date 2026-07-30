import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ProcessingConfig } from '../types';

function createBuffer(tag: string): AudioBuffer {
  return { __tag: tag } as unknown as AudioBuffer;
}

class StubAudioContext {
  sampleRate = 44100;
  state = 'running';
  currentTime = 0;
  destination = {};
  audioWorklet = {
    addModule: () => Promise.resolve(),
  };

  createGain() {
    return {
      gain: { value: 1 },
      connect() {},
      disconnect() {},
    };
  }

  createAnalyser() {
    return {
      fftSize: 2048,
      connect() {},
      disconnect() {},
      getByteFrequencyData() {},
      getByteTimeDomainData() {},
      getFloatTimeDomainData() {},
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      onended: null,
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    };
  }

  resume() {
    return Promise.resolve();
  }
}

describe('masterExportService', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      AudioContext: StubAudioContext,
      webkitAudioContext: StubAudioContext,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('prefers an existing processed buffer for export', async () => {
    const { resolveMasterExportBuffer } = await import('../services/masterExportService');
    const processed = createBuffer('processed');
    const source = createBuffer('source');

    const result = await resolveMasterExportBuffer({
      processedBuffer: processed,
      sourceBuffer: source,
      config: { limiter: { threshold: -6, ratio: 8, attack: 0.01, release: 0.2 } } as ProcessingConfig,
    });

    expect(result.buffer).toBe(processed);
    expect(result.source).toBe('processed');
  });

  test('re-renders from source when config exists but processed buffer is missing', async () => {
    const { resolveMasterExportBuffer } = await import('../services/masterExportService');
    const { audioEngine } = await import('../services/audioEngine');
    const source = createBuffer('source');
    const rerendered = createBuffer('rerendered');
    const renderSpy = vi.spyOn(audioEngine, 'renderProcessedAudio').mockResolvedValue(rerendered);

    const result = await resolveMasterExportBuffer({
      processedBuffer: null,
      sourceBuffer: source,
      config: { outputTrimDb: -1.5 } as ProcessingConfig,
    });

    expect(renderSpy).toHaveBeenCalledWith({ outputTrimDb: -1.5 }, source);
    expect(result.buffer).toBe(rerendered);
    expect(result.source).toBe('rerendered');
  });

  test('falls back to original audio when no processing config exists', async () => {
    const { resolveMasterExportBuffer } = await import('../services/masterExportService');
    const { audioEngine } = await import('../services/audioEngine');
    const source = createBuffer('source');
    const renderSpy = vi.spyOn(audioEngine, 'renderProcessedAudio');

    const result = await resolveMasterExportBuffer({
      processedBuffer: null,
      sourceBuffer: source,
      config: {},
    });

    expect(renderSpy).not.toHaveBeenCalled();
    expect(result.buffer).toBe(source);
    expect(result.source).toBe('original');
  });
});
