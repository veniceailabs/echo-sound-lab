import { describe, expect, test } from 'vitest';
import {
  buildStemPlaybackSchedule,
  computeStemPlaybackTimelineDuration,
  normalizeStemPlaybackAlignment,
  type StemPlaybackAlignment,
} from '../services/stemPlaybackService';
import type { StemId } from '../services/stemPlaybackService';

function makeBuffer(duration: number): AudioBuffer {
  return {
    duration,
    length: Math.floor(duration * 48_000),
    numberOfChannels: 2,
    sampleRate: 48_000,
    getChannelData: () => new Float32Array(Math.floor(duration * 48_000)),
  } as unknown as AudioBuffer;
}

describe('stemPlaybackService alignment helpers', () => {
  test('normalizes alignment and schedules stem playback from the aligned transport position', () => {
    const buffer = makeBuffer(12);
    const alignment: Partial<StemPlaybackAlignment> = {
      startTimeSec: 2.5,
      sourceOffsetSec: 1.25,
      durationSec: 8,
    };

    const normalized = normalizeStemPlaybackAlignment(buffer, alignment);
    expect(normalized.startTimeSec).toBeCloseTo(2.5, 6);
    expect(normalized.sourceOffsetSec).toBeCloseTo(1.25, 6);
    expect(normalized.durationSec).toBeCloseTo(8, 6);

    const schedule = buildStemPlaybackSchedule(buffer, normalized, 0.75);
    expect(schedule).toEqual({
      when: 1.75,
      offset: 1.25,
      duration: 8,
    });
  });

  test('advances offset when playhead lands inside an aligned stem', () => {
    const buffer = makeBuffer(10);
    const alignment: StemPlaybackAlignment = {
      startTimeSec: 1,
      sourceOffsetSec: 0.5,
      durationSec: 6,
    };

    const schedule = buildStemPlaybackSchedule(buffer, alignment, 3.25);
    expect(schedule?.when).toBe(0);
    expect(schedule?.offset).toBeCloseTo(2.75, 6);
    expect(schedule?.duration).toBeCloseTo(3.75, 6);
  });

  test('computes timeline duration from aligned stem windows', () => {
    const buffers: Partial<Record<StemId, AudioBuffer | null>> = {
      vocals: makeBuffer(10),
      drums: makeBuffer(8),
      bass: makeBuffer(6),
      other: null,
    };
    const alignments: Partial<Record<StemId, StemPlaybackAlignment | null>> = {
      vocals: { startTimeSec: 0, sourceOffsetSec: 0.25, durationSec: 7 },
      drums: { startTimeSec: 1.5, sourceOffsetSec: 0, durationSec: 6 },
      bass: { startTimeSec: 4, sourceOffsetSec: 1, durationSec: 4.5 },
    };

    expect(computeStemPlaybackTimelineDuration(buffers, alignments)).toBeCloseTo(8.5, 6);
  });
});
