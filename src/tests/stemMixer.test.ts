import { afterEach, describe, expect, test } from 'vitest';
import {
  getConstantPowerPanGains,
  createDefaultStemMixState,
  shouldApplyBassSidechain,
  stemMixerService,
  type Stem,
} from '../services/stemMixer';

function makeStem(role: Stem['role']): Stem {
  return {
    id: `${role}-1`,
    name: role,
    role,
    buffer: {
      numberOfChannels: 2,
      length: 4800,
      sampleRate: 48000,
      duration: 0.1,
      getChannelData: () => new Float32Array(4800),
    } as unknown as AudioBuffer,
    volume: 0,
    pan: 0,
    muted: false,
    solo: false,
    reverbSend: 0,
    delaySend: 0,
  };
}

describe('stemMixer routing helpers', () => {
  afterEach(() => {
    stemMixerService.clear();
  });

  test('applies 4-stem mix state with solo and mute semantics', () => {
    stemMixerService.clear();
    stemMixerService.addStem('lead vox', makeStem('lead_vocal').buffer, 'lead_vocal');
    stemMixerService.addStem('kick', makeStem('drums').buffer, 'drums');
    stemMixerService.addStem('sub', makeStem('bass').buffer, 'bass');
    stemMixerService.addStem('pad', makeStem('other').buffer, 'other');

    const mixState = createDefaultStemMixState();
    mixState.vocals = { volume_db: -3, pan: -0.5, mute: false, solo: true };
    mixState.drums = { volume_db: -6, pan: 0, mute: true, solo: false };
    mixState.bass = { volume_db: 1.5, pan: 0.25, mute: false, solo: false };
    mixState.other = { volume_db: -9, pan: 0.8, mute: false, solo: false };

    const updated = stemMixerService.applyMixState(mixState);
    const vocals = updated.find((stem) => stem.role === 'lead_vocal');
    const drums = updated.find((stem) => stem.role === 'drums');
    const bass = updated.find((stem) => stem.role === 'bass');
    const other = updated.find((stem) => stem.role === 'other');

    expect(vocals?.solo).toBe(true);
    expect(vocals?.muted).toBe(false);
    expect(vocals?.volume).toBe(-3);
    expect(vocals?.pan).toBe(-0.5);
    expect(drums?.muted).toBe(true);
    expect(drums?.solo).toBe(false);
    expect(bass?.muted).toBe(true);
    expect(other?.muted).toBe(true);

  });

  test('uses constant-power pan gains with preserved center energy', () => {
    const center = getConstantPowerPanGains(0);
    const hardLeft = getConstantPowerPanGains(-1);
    const hardRight = getConstantPowerPanGains(1);

    expect(center.left).toBeCloseTo(Math.SQRT1_2, 6);
    expect(center.right).toBeCloseTo(Math.SQRT1_2, 6);
    expect(hardLeft.left).toBeCloseTo(1, 6);
    expect(hardLeft.right).toBeCloseTo(0, 6);
    expect(hardRight.left).toBeCloseTo(0, 6);
    expect(hardRight.right).toBeCloseTo(1, 6);
  });

  test('enables bass sidechain only when trigger and analysis support it', () => {
    const stems = [makeStem('beat'), makeStem('bass')];

    expect(shouldApplyBassSidechain(stems, null)).toBe(false);
    expect(shouldApplyBassSidechain(stems, {
      sidechain: { detected: true } as any,
      overallCharacter: { energy: 'raw' } as any,
    } as any)).toBe(true);
    expect(shouldApplyBassSidechain(stems, {
      sidechain: { detected: false } as any,
      overallCharacter: { energy: 'aggressive' } as any,
    } as any)).toBe(true);
    expect(shouldApplyBassSidechain([makeStem('bass')], {
      sidechain: { detected: true } as any,
      overallCharacter: { energy: 'aggressive' } as any,
    } as any)).toBe(false);
  });
});
