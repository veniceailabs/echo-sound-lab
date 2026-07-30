import { describe, expect, test } from 'vitest';
import type { ArrangementAnalysis } from '../services/arrangementAnalyzer';
import type { VocalIntakeBufferLike } from '../services/vocal/intakeConditioning';
import { LowEndDiscipline } from '../services/lowend/lowEndDiscipline';

function createBuffer(
  durationSec: number,
  sampleRate: number,
  generator: (timeSec: number) => [number, number]
): VocalIntakeBufferLike {
  const length = Math.floor(durationSec * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const timeSec = index / sampleRate;
    const [l, r] = generator(timeSec);
    left[index] = l;
    right[index] = r;
  }

  return {
    duration: durationSec,
    length,
    sampleRate,
    numberOfChannels: 2,
    getChannelData(channel: number): Float32Array {
      if (channel === 1) return right;
      return left;
    },
  };
}

function balancedArrangement(): ArrangementAnalysis {
  return {
    sections: [
      { name: 'verse', startTime: 0, endTime: 8, energy: 0.44, density: 0.38, rmsDb: -17.8, peakDb: -7.6, dynamics: 2.0 },
      { name: 'chorus', startTime: 8, endTime: 16, energy: 0.57, density: 0.46, rmsDb: -15.9, peakDb: -6.3, dynamics: 1.8 },
    ],
    energyCurve: [0.44, 0.48, 0.57, 0.52],
    dynamicRange: 7.8,
    loudestSection: 'chorus',
    quietestSection: 'verse',
    suggestedFocus: ['keep low end centered'],
    overallFlow: 'building',
  };
}

function problematicArrangement(): ArrangementAnalysis {
  return {
    sections: [
      { name: 'verse', startTime: 0, endTime: 8, energy: 0.78, density: 0.78, rmsDb: -13.1, peakDb: -4.7, dynamics: 1.4 },
      { name: 'chorus', startTime: 8, endTime: 16, energy: 0.91, density: 0.86, rmsDb: -11.2, peakDb: -3.2, dynamics: 1.2 },
    ],
    energyCurve: [0.78, 0.81, 0.91, 0.88],
    dynamicRange: 5.4,
    loudestSection: 'chorus',
    quietestSection: 'verse',
    suggestedFocus: ['reduce low-end masking'],
    overallFlow: 'flat',
  };
}

describe('LowEndDiscipline', () => {
  test('keeps a balanced low end mostly stable', () => {
    const sampleRate = 48000;
    const buffer = createBuffer(8, sampleRate, (timeSec) => {
      const kickEnv = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2.0 * timeSec)), 4) * 0.22;
      const bass = (
        Math.sin(2 * Math.PI * 52 * timeSec) * 0.14 +
        Math.sin(2 * Math.PI * 104 * timeSec) * 0.09 +
        Math.sin(2 * Math.PI * 176 * timeSec) * 0.04
      );
      const sample = kickEnv + bass;
      return [sample, sample];
    });

    const analysis = LowEndDiscipline.analyze(buffer, balancedArrangement());

    expect(analysis.kickBassControl.shouldApply).toBe(false);
    expect(analysis.kickBassControl.focusBands.length).toBeGreaterThanOrEqual(0);
    expect(analysis.note808Consistency.shouldApply).toBe(false);
    expect(analysis.note808Consistency.windowNotes.length).toBeGreaterThan(0);
    expect(analysis.stereoLowMono.shouldCollapseToMono).toBe(false);
    expect(analysis.drumPocket.pocketScore).toBeGreaterThan(0.5);
    expect(analysis.translationValidation.verdict).not.toBe('needs_translation_work');
    expect(analysis.overallConfidence).toBeGreaterThan(0.55);
    expect(analysis.verdict).toMatch(/stable|needs_shaping|tight/);
  });

  test('flags a dense low end with stereo spread and note drift', () => {
    const sampleRate = 48000;
    const buffer = createBuffer(8, sampleRate, (timeSec) => {
      const sectionNote = timeSec < 2 ? 44 : timeSec < 4 ? 52 : timeSec < 6 ? 68 : 39;
      const kickEnv = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 2.4 * timeSec)), 4) * 0.38;
      const left = (
        kickEnv +
        Math.sin(2 * Math.PI * sectionNote * timeSec) * 0.32 +
        Math.sin(2 * Math.PI * 130 * timeSec) * 0.08 +
        Math.sin(2 * Math.PI * 180 * timeSec) * 0.06
      );
      const right = (
        kickEnv * 0.65 -
        Math.sin(2 * Math.PI * (sectionNote + 3) * timeSec) * 0.27 +
        Math.sin(2 * Math.PI * 240 * timeSec) * 0.05
      );
      return [left, right];
    });

    const analysis = LowEndDiscipline.analyze(buffer, problematicArrangement());

    expect(analysis.kickBassControl.shouldApply).toBe(true);
    expect(analysis.kickBassControl.focusBands.length).toBeGreaterThan(0);
    expect(analysis.note808Consistency.shouldApply).toBe(true);
    expect(analysis.note808Consistency.noteVarianceHz).toBeGreaterThan(3);
    expect(analysis.stereoLowMono.shouldCollapseToMono).toBe(true);
    expect(analysis.drumPocket.shouldApply).toBe(true);
    expect(analysis.translationValidation.verdict).toMatch(/mixed|needs_translation_work/);
    expect(analysis.shouldApply).toBe(true);
    expect(analysis.riskNotes.length).toBeGreaterThan(0);
  });
});
