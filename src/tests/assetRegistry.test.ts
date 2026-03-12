import { describe, expect, test } from 'vitest';
import { AssetRegistry } from '../services/AssetRegistry';

function buildDecodedBuffer(samples: Float32Array) {
  return {
    duration: samples.length / 48000,
    length: samples.length,
    sampleRate: 48000,
    numberOfChannels: 1,
    getChannelData: () => samples,
  };
}

describe('AssetRegistry', () => {
  test('registers and returns immutable ArrayBuffer copies by assetId', () => {
    const registry = new AssetRegistry();
    const input = new Uint8Array([1, 2, 3, 4]).buffer;
    const registration = registry.registerArrayBuffer(input, { name: 'clip.wav', mimeType: 'audio/wav' }, 'asset-1');

    expect(registration.assetId).toBe('asset-1');
    const output = registry.getArrayBuffer('asset-1');
    expect(output).not.toBeNull();
    expect(output).not.toBe(input);
    expect(new Uint8Array(output || new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  test('derives deterministic waveform peaks from cached decoded audio', () => {
    const registry = new AssetRegistry();
    registry.registerArrayBuffer(new ArrayBuffer(16), { name: 'wave.wav', mimeType: 'audio/wav' }, 'asset-wave');
    registry.setDecodedBuffer('asset-wave', buildDecodedBuffer(new Float32Array([0, 0.5, -0.75, 0.25, -0.9, 0.1])));

    const peaks = registry.getWaveformPeaks('asset-wave', 3);
    expect(peaks).not.toBeNull();
    const values = Array.from(peaks || []);
    expect(values[0]).toBeCloseTo(0.5, 6);
    expect(values[1]).toBeCloseTo(0.75, 6);
    expect(values[2]).toBeCloseTo(0.9, 6);
  });
});
