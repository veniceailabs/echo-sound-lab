import type { ReplayMidiNote } from './deterministicReplayService';
import { deterministicId } from './deterministicJson';

export interface MidiNoteExportPackage {
  format: 'esl-midi-notes';
  version: 1;
  exportedAt: number;
  trackId: string;
  trackName: string;
  notes: ReplayMidiNote[];
}

export interface MidiQuantizeOptions {
  gridSeconds: number;
  preserveDuration?: boolean;
  preserveVelocity?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

export function quantizeMidiNotes(notes: ReplayMidiNote[], options: MidiQuantizeOptions): ReplayMidiNote[] {
  const gridSeconds = Math.max(0.03125, options.gridSeconds);
  return notes.map((note) => {
    const startTimeSec = roundToStep(note.startTimeSec, gridSeconds);
    const durationSec = options.preserveDuration === false
      ? gridSeconds
      : Math.max(gridSeconds / 4, roundToStep(note.durationSec, gridSeconds));
    const velocity = options.preserveVelocity === false
      ? 96
      : clamp(note.velocity, 1, 127);

    return {
      ...note,
      noteId: note.noteId || deterministicId('midi-note', note),
      startTimeSec: Number(startTimeSec.toFixed(4)),
      durationSec: Number(durationSec.toFixed(4)),
      velocity,
    };
  });
}

export function buildMidiNoteExportPackage(trackId: string, trackName: string, notes: ReplayMidiNote[]): MidiNoteExportPackage {
  return {
    format: 'esl-midi-notes',
    version: 1,
    exportedAt: Date.now(),
    trackId,
    trackName,
    notes: notes.map((note) => ({ ...note })),
  };
}

export function serializeMidiNoteExportPackage(pkg: MidiNoteExportPackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function parseMidiNoteExportPackage(raw: string): MidiNoteExportPackage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<MidiNoteExportPackage>;
    if (parsed?.format !== 'esl-midi-notes' || parsed.version !== 1) return null;
    if (!parsed.trackId || !parsed.trackName || !Array.isArray(parsed.notes)) return null;
    return parsed as MidiNoteExportPackage;
  } catch {
    return null;
  }
}
