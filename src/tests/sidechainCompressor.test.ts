import { describe, expect, test } from 'vitest';
import { applySidechainCompression, SIDECHAIN_PRESETS } from '../services/sidechainCompressor';

function makeBuffer(channels: number, length: number, sampleRate = 48000, fill = 0): AudioBuffer {
  const channelData = Array.from({ length: channels }, () => Float32Array.from({ length }, () => fill));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData(channel: number) {
      return channelData[channel];
    },
  } as unknown as AudioBuffer;
}

describe('sidechainCompressor', () => {
  test('reduces program level when the sidechain trigger spikes', () => {
    const main = makeBuffer(2, 4800, 48000, 0.75);
    const trigger = makeBuffer(2, 4800, 48000, 0);
    const triggerLeft = trigger.getChannelData(0);
    const triggerRight = trigger.getChannelData(1);

    for (let i = 1200; i < 1500; i += 1) {
      triggerLeft[i] = 1;
      triggerRight[i] = 1;
    }

    const stats = applySidechainCompression(main, trigger, {
      ...SIDECHAIN_PRESETS['Vocal duck'],
      mix: 1,
    });

    expect(stats.avgGainReductionDb).toBeGreaterThan(0);
    expect(stats.maxGainReductionDb).toBeGreaterThan(0);
    expect(stats.outputPeakDb).toBeLessThan(0);
    expect(main.getChannelData(0)[1300]).toBeLessThan(0.75);
  });

  test('self-ducking preset is available for same-track compression', () => {
    expect(SIDECHAIN_PRESETS['Vocal duck']).toBeTruthy();
    expect(SIDECHAIN_PRESETS['Radio duck']).toBeTruthy();
  });
});
