import React, { useMemo, useRef, useState } from 'react';
import type { ReplayMidiNote, ReplayTrackState } from '../services/deterministicReplayService';
import {
  buildMidiNoteExportPackage,
  parseMidiNoteExportPackage,
  quantizeMidiNotes,
  serializeMidiNoteExportPackage,
} from '../services/midiCompositionService';
import { downloadText } from '../services/cueSheetExporter';

interface MidiPianoRollPanelProps {
  track: ReplayTrackState;
  notes: ReplayMidiNote[];
  pxPerSec: number;
  laneWidth: number;
  isReadOnly?: boolean;
  playheadSeconds?: number | null;
  onAddNote: (trackId: string, note: Omit<ReplayMidiNote, 'noteId' | 'trackId'> & { noteId?: string }) => void;
  onSetNote: (trackId: string, noteId: string, patch: Partial<ReplayMidiNote>) => void;
  onRemoveNote: (trackId: string, noteId: string) => void;
}

type DragMode = 'move' | 'resize' | null;

interface DragState {
  noteId: string;
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  initialStartTimeSec: number;
  initialDurationSec: number;
  initialPitch: number;
}

const MIN_PITCH = 36;
const MAX_PITCH = 84;
const ROW_HEIGHT = 18;
const KEYBOARD_WIDTH = 76;
const SNAP_SECONDS = 0.125;

const PITCH_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function midiName(pitch: number): string {
  const noteIndex = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${PITCH_LABELS[noteIndex] ?? 'C'}${octave}`;
}

export default function MidiPianoRollPanel({
  track,
  notes,
  pxPerSec,
  laneWidth,
  isReadOnly = false,
  playheadSeconds = null,
  onAddNote,
  onSetNote,
  onRemoveNote,
}: MidiPianoRollPanelProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(notes[0]?.noteId || null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const sortedNotes = useMemo(
    () => [...notes].sort((left, right) => (left.startTimeSec === right.startTimeSec
      ? left.pitch - right.pitch
      : left.startTimeSec - right.startTimeSec)),
    [notes]
  );

  const noteRows = useMemo(() => {
    const rows: number[] = [];
    for (let pitch = MAX_PITCH; pitch >= MIN_PITCH; pitch -= 1) rows.push(pitch);
    return rows;
  }, []);

  const gridHeight = noteRows.length * ROW_HEIGHT;
  const contentWidth = Math.max(laneWidth, 960);

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, note: ReplayMidiNote, mode: DragMode) => {
    if (isReadOnly) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
    setSelectedNoteId(note.noteId);
    setDragState({
      noteId: note.noteId,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialStartTimeSec: note.startTimeSec,
      initialDurationSec: note.durationSec,
      initialPitch: note.pitch,
    });
  };

  const stopDrag = () => {
    setDragState(null);
  };

  const handleGridDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isReadOnly) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const localX = clamp(event.clientX - rect.left - KEYBOARD_WIDTH, 0, contentWidth);
    const localY = clamp(event.clientY - rect.top, 0, gridHeight - 1);
    const timeSec = Math.max(0, roundToStep(localX / pxPerSec, SNAP_SECONDS));
    const pitchOffset = Math.floor(localY / ROW_HEIGHT);
    const pitch = clamp(MAX_PITCH - pitchOffset, MIN_PITCH, MAX_PITCH);
    const noteId = `midi-note-${track.trackId}-${Date.now().toString(36)}`;
    onAddNote(track.trackId, {
      noteId,
      startTimeSec: timeSec,
      durationSec: 0.5,
      pitch,
      velocity: 96,
      channel: 0,
    });
    setSelectedNoteId(noteId);
  };

  const selectedNote = sortedNotes.find((note) => note.noteId === selectedNoteId) || null;
  const selectedTrackNotes = sortedNotes.filter((note) => note.trackId === track.trackId);

  const pitchToTop = (pitch: number): number => (MAX_PITCH - pitch) * ROW_HEIGHT;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || isReadOnly) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const nextStartTimeSec = Math.max(0, roundToStep(dragState.initialStartTimeSec + dx / pxPerSec, SNAP_SECONDS));
    const pitchDelta = Math.round(dy / ROW_HEIGHT);
    const nextPitch = clamp(dragState.initialPitch - pitchDelta, MIN_PITCH, MAX_PITCH);

    if (dragState.mode === 'resize') {
      const nextDurationSec = Math.max(0.05, roundToStep(dragState.initialDurationSec + dx / pxPerSec, SNAP_SECONDS));
      onSetNote(track.trackId, dragState.noteId, {
        durationSec: nextDurationSec,
      });
      return;
    }

    onSetNote(track.trackId, dragState.noteId, {
      startTimeSec: nextStartTimeSec,
      pitch: nextPitch,
    });
  };

  return (
    <div className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80">Piano Roll</p>
          <p className="mt-1 text-sm font-semibold text-white">MIDI note editor</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
            {sortedNotes.length} note{sortedNotes.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            disabled={isReadOnly || selectedTrackNotes.length === 0}
            onClick={() => {
              const quantized = quantizeMidiNotes(selectedTrackNotes, {
                gridSeconds: SNAP_SECONDS,
              });
              quantized.forEach((note) => {
                onSetNote(track.trackId, note.noteId, {
                  startTimeSec: note.startTimeSec,
                  durationSec: note.durationSec,
                  velocity: note.velocity,
                });
              });
            }}
            className="rounded-md border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quantize
          </button>
          <button
            type="button"
            disabled={selectedTrackNotes.length === 0}
            onClick={() => {
              const pkg = buildMidiNoteExportPackage(track.trackId, track.trackName, selectedTrackNotes);
              downloadText(
                serializeMidiNoteExportPackage(pkg),
                `${track.trackName.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase() || 'midi-notes'}.json`,
                'application/json'
              );
            }}
            className="rounded-md border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export MIDI
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => importRef.current?.click()}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Import MIDI
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => {
              const noteId = `midi-note-${track.trackId}-${Date.now().toString(36)}`;
              onAddNote(track.trackId, {
                noteId,
                startTimeSec: playheadSeconds != null ? roundToStep(Math.max(0, playheadSeconds), SNAP_SECONDS) : 0,
                durationSec: 0.5,
                pitch: 60,
                velocity: 96,
                channel: 0,
              });
              setSelectedNoteId(noteId);
            }}
            className="rounded-md border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Note
          </button>
        </div>
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            const raw = await file.text();
            const pkg = parseMidiNoteExportPackage(raw);
            if (!pkg || pkg.trackId !== track.trackId) {
              throw new Error('Invalid MIDI note package for this track');
            }
            pkg.notes.forEach((note) => {
              onAddNote(track.trackId, {
                noteId: note.noteId,
                startTimeSec: note.startTimeSec,
                durationSec: note.durationSec,
                pitch: note.pitch,
                velocity: note.velocity,
                channel: note.channel ?? 0,
              });
            });
          } finally {
            event.currentTarget.value = '';
          }
        }}
      />

      <div
        ref={gridRef}
        onDoubleClick={handleGridDoubleClick}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="mt-3 overflow-auto rounded-lg border border-white/10 bg-slate-950/80"
      >
        <div style={{ width: `${KEYBOARD_WIDTH + contentWidth}px`, height: `${gridHeight}px` }} className="relative">
          <div className="absolute inset-y-0 left-0 w-[76px] border-r border-white/10 bg-slate-900/80">
            {noteRows.map((pitch) => (
              <div
                key={pitch}
                className="flex items-center justify-between border-b border-white/5 px-2 text-[9px] uppercase tracking-[0.14em] text-slate-400"
                style={{ height: `${ROW_HEIGHT}px`, background: pitch % 12 === 1 || pitch % 12 === 3 || pitch % 12 === 6 || pitch % 12 === 8 || pitch % 12 === 10 ? 'rgba(15, 23, 42, 0.95)' : 'rgba(10, 15, 26, 0.95)' }}
              >
                <span>{midiName(pitch).replace(/\d+$/, '')}</span>
                <span className="text-slate-500">{midiName(pitch)}</span>
              </div>
            ))}
          </div>

          <div
            className="absolute left-[76px] top-0 h-full"
            style={{
              width: `${contentWidth}px`,
              backgroundImage: `
                linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(148, 163, 184, 0.07) 1px, transparent 1px)
              `,
              backgroundSize: `${Math.max(1, pxPerSec)}px 100%, 100% ${ROW_HEIGHT}px`,
            }}
          >
            {playheadSeconds != null && playheadSeconds >= 0 && (
              <div
                className="absolute top-0 h-full w-px bg-cyan-300/90"
                style={{ left: `${playheadSeconds * pxPerSec}px` }}
              />
            )}

            {sortedNotes.map((note) => {
              const top = pitchToTop(note.pitch);
              const left = Math.max(0, note.startTimeSec * pxPerSec);
              const width = Math.max(10, note.durationSec * pxPerSec);
              const isSelected = selectedNoteId === note.noteId;
              return (
                <button
                  key={note.noteId}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setSelectedNoteId(note.noteId)}
                  onPointerDown={(event) => startDrag(event, note, 'move')}
                  className={`absolute rounded-md border px-1.5 py-1 text-left text-[9px] uppercase tracking-[0.12em] shadow-[0_0_16px_rgba(34,211,238,0.18)] transition-colors ${
                    isSelected
                      ? 'border-fuchsia-200/80 bg-fuchsia-500/70 text-white'
                      : 'border-fuchsia-200/30 bg-fuchsia-500/35 text-fuchsia-50 hover:bg-fuchsia-500/55'
                  } disabled:cursor-not-allowed`}
                  style={{
                    left: `${left}px`,
                    top: `${top + 1}px`,
                    width: `${width}px`,
                    height: `${ROW_HEIGHT - 2}px`,
                  }}
                >
                  <div className="flex h-full items-center justify-between gap-1">
                    <span className="truncate">{midiName(note.pitch)}</span>
                    <span className="font-mono text-[8px]">{note.velocity}</span>
                  </div>
                  <span
                    role="presentation"
                    onPointerDown={(event) => startDrag(event as React.PointerEvent<HTMLButtonElement>, note, 'resize')}
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-white/15"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedNote && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Selected Note</p>
              <p className="mt-1 text-sm font-semibold text-white">{midiName(selectedNote.pitch)}</p>
            </div>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => onRemoveNote(track.trackId, selectedNote.noteId)}
              className="rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Remove
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Start (sec)</span>
              <input
                type="number"
                min={0}
                step={SNAP_SECONDS}
                value={selectedNote.startTimeSec}
                disabled={isReadOnly}
                onChange={(event) => onSetNote(track.trackId, selectedNote.noteId, { startTimeSec: Math.max(0, Number(event.target.value)) })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Duration</span>
              <input
                type="number"
                min={0.01}
                step={SNAP_SECONDS}
                value={selectedNote.durationSec}
                disabled={isReadOnly}
                onChange={(event) => onSetNote(track.trackId, selectedNote.noteId, { durationSec: Math.max(0.01, Number(event.target.value)) })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Pitch</span>
              <input
                type="number"
                min={MIN_PITCH}
                max={MAX_PITCH}
                step={1}
                value={selectedNote.pitch}
                disabled={isReadOnly}
                onChange={(event) => onSetNote(track.trackId, selectedNote.noteId, { pitch: clamp(Number(event.target.value), MIN_PITCH, MAX_PITCH) })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-slate-500">Velocity</span>
              <input
                type="number"
                min={0}
                max={127}
                step={1}
                value={selectedNote.velocity}
                disabled={isReadOnly}
                onChange={(event) => onSetNote(track.trackId, selectedNote.noteId, { velocity: clamp(Number(event.target.value), 0, 127) })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
