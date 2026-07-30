import { describe, expect, test } from 'vitest';
import {
  buildMidiNoteExportPackage,
  parseMidiNoteExportPackage,
  quantizeMidiNotes,
  serializeMidiNoteExportPackage,
} from '../services/midiCompositionService';
import type { ReplayMidiNote } from '../services/deterministicReplayService';

function makeNote(overrides: Partial<ReplayMidiNote> = {}): ReplayMidiNote {
  return {
    noteId: 'note-1',
    trackId: 'keys',
    startTimeSec: 1.137,
    durationSec: 0.487,
    pitch: 60,
    velocity: 93,
    channel: 0,
    ...overrides,
  };
}

describe('midiCompositionService', () => {
  test('quantizes notes to the requested grid', () => {
    const notes = quantizeMidiNotes([makeNote()], { gridSeconds: 0.25 });
    expect(notes[0]?.startTimeSec).toBeCloseTo(1.25);
    expect(notes[0]?.durationSec).toBeCloseTo(0.5);
  });

  test('round-trips the MIDI note export package', () => {
    const pkg = buildMidiNoteExportPackage('keys', 'Keys', [makeNote()]);
    const raw = serializeMidiNoteExportPackage(pkg);
    const parsed = parseMidiNoteExportPackage(raw);

    expect(parsed?.format).toBe('esl-midi-notes');
    expect(parsed?.trackId).toBe('keys');
    expect(parsed?.notes).toHaveLength(1);
  });
});
