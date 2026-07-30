/**
 * KeyScaleHelper �Music theory reference panel
 *
 * Given a root note + scale (major/minor), shows:
 * - All 7 diatonic chords with Roman numeral notation
 * - The relative major/minor
 * - 3 best modulation targets
 * - Circle of Fifths with current key highlighted
 * - Common chord progressions in that key
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface KeyScaleHelperProps {
  initialRoot?: string;
  initialMode?: 'major' | 'minor';
  onClose: () => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_FLAT_ALIAS: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

// Major scale intervals: W W H W W W H
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
// Natural minor: W H W W H W W
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Chord quality per scale degree
const MAJOR_CHORD_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_CHORD_QUALITIES = ['m', 'dim', '', 'm', 'm', '', ''];
const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_ROMAN = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

const MAJOR_COLORS = ['#22d3ee', '#94a3b8', '#94a3b8', '#22d3ee', '#22d3ee', '#94a3b8', '#ef4444'];
const MINOR_COLORS = ['#a855f7', '#ef4444', '#22d3ee', '#a855f7', '#a855f7', '#22d3ee', '#22d3ee'];

// Common progressions (as 0-indexed scale degree indices)
const MAJOR_PROGRESSIONS = [
  { name: 'I–V–vi–IV (pop)', degrees: [0, 4, 5, 3] },
  { name: 'I–IV–V (blues/rock)', degrees: [0, 3, 4] },
  { name: 'ii–V–I (jazz)', degrees: [1, 4, 0] },
  { name: 'vi–IV–I–V (emotional)', degrees: [5, 3, 0, 4] },
  { name: 'I–vi–IV–V (50s)', degrees: [0, 5, 3, 4] },
];
const MINOR_PROGRESSIONS = [
  { name: 'i–VI–III–VII (anthemic)', degrees: [0, 5, 2, 6] },
  { name: 'i–iv–v (natural minor)', degrees: [0, 3, 4] },
  { name: 'i–VII–VI–VII (loop)', degrees: [0, 6, 5, 6] },
  { name: 'i–VI–VII (pop minor)', degrees: [0, 5, 6] },
  { name: 'i–iv–VII–III (modal)', degrees: [0, 3, 6, 2] },
];

// Circle of fifths order (major keys)
const CIRCLE_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
const CIRCLE_MINOR = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D'];

function noteAt(rootIdx: number, interval: number): string {
  return NOTES[(rootIdx + interval) % 12];
}

function displayNote(n: string): string {
  return NOTE_FLAT_ALIAS[n] ?? n;
}

function getRelative(rootIdx: number, mode: 'major' | 'minor'): { root: string; mode: 'major' | 'minor' } {
  if (mode === 'major') {
    // Relative minor is 6th degree (9 semitones up)
    return { root: NOTES[(rootIdx + 9) % 12], mode: 'minor' };
  } else {
    // Relative major is 3rd degree (3 semitones up)
    return { root: NOTES[(rootIdx + 3) % 12], mode: 'major' };
  }
}

function getModulationTargets(rootIdx: number, mode: 'major' | 'minor'): Array<{ root: string; mode: 'major' | 'minor'; relationship: string }> {
  const results = [];
  // Dominant (5th)
  results.push({ root: NOTES[(rootIdx + 7) % 12], mode, relationship: 'Dominant (V) �most common modulation' });
  // Subdominant (4th)
  results.push({ root: NOTES[(rootIdx + 5) % 12], mode, relationship: 'Subdominant (IV) �feels warmer, more relaxed' });
  // Parallel mode (same root, opposite mode)
  results.push({ root: NOTES[rootIdx], mode: mode === 'major' ? 'minor' : 'major', relationship: `Parallel ${mode === 'major' ? 'minor' : 'major'} �dramatic contrast` });
  return results;
}

export const KeyScaleHelper: React.FC<KeyScaleHelperProps> = ({
  initialRoot = 'C',
  initialMode = 'major',
  onClose,
}) => {
  const [root, setRoot] = useState(initialRoot);
  const [mode, setMode] = useState<'major' | 'minor'>(initialMode);

  const rootIdx = NOTES.indexOf(root.replace('b', '#').replace('Bb', 'A#').replace('Eb', 'D#').replace('Ab', 'G#').replace('Db', 'C#').replace('Gb', 'F#'));
  const safeRootIdx = rootIdx >= 0 ? rootIdx : 0;

  const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const qualities = mode === 'major' ? MAJOR_CHORD_QUALITIES : MINOR_CHORD_QUALITIES;
  const romans = mode === 'major' ? MAJOR_ROMAN : MINOR_ROMAN;
  const colors = mode === 'major' ? MAJOR_COLORS : MINOR_COLORS;
  const progressions = mode === 'major' ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS;

  const scaleNotes = intervals.map(i => noteAt(safeRootIdx, i));
  const chords = scaleNotes.map((n, i) => `${displayNote(n)}${qualities[i]}`);

  const relative = getRelative(safeRootIdx, mode);
  const modulationTargets = getModulationTargets(safeRootIdx, mode);

  const circleKeys = mode === 'major' ? CIRCLE_MAJOR : CIRCLE_MINOR;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-2xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Key & Scale Reference</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Diatonic chords �progressions �modulation targets �circle of fifths
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Key selector */}
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <p className="text-[8px] text-slate-600 uppercase tracking-widest">Root</p>
              <div className="flex flex-wrap gap-1">
                {NOTES.map(n => (
                  <button
                    key={n}
                    onClick={() => setRoot(n)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-bold border transition-all ${
                      root === n || (NOTE_FLAT_ALIAS[n] && root === NOTE_FLAT_ALIAS[n])
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300 hover:border-white/10'
                    }`}
                  >
                    {displayNote(n)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[8px] text-slate-600 uppercase tracking-widest">Mode</p>
              <div className="flex gap-2">
                {(['major', 'minor'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all capitalize ${
                      mode === m
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 text-right">
              <p className="text-2xl font-black text-white">{displayNote(NOTES[safeRootIdx])} {mode}</p>
              <p className="text-[9px] text-slate-600">Relative: {displayNote(relative.root)} {relative.mode}</p>
            </div>
          </div>

          {/* Diatonic chords */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Diatonic chords</p>
            <div className="grid grid-cols-7 gap-1.5">
              {chords.map((chord, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-center"
                  style={{ borderColor: colors[i] + '30', background: colors[i] + '0a' }}
                >
                  <p className="text-[8px] font-semibold" style={{ color: colors[i] }}>{romans[i]}</p>
                  <p className="text-[11px] font-bold text-slate-200 mt-0.5">{chord}</p>
                  <p className="text-[7px] text-slate-600 mt-0.5">{displayNote(scaleNotes[i])}</p>
                </div>
              ))}
            </div>
            <p className="text-[8px] text-slate-700 px-1">
              Scale notes: {scaleNotes.map(displayNote).join(' �')}
            </p>
          </div>

          {/* Common progressions */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Common progressions</p>
            <div className="space-y-1.5">
              {progressions.map(prog => (
                <div key={prog.name} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-slate-500">{prog.name}</p>
                    <div className="flex gap-1.5 mt-1">
                      {prog.degrees.map((d, i) => (
                        <span key={i} className="text-[10px] font-bold text-slate-200">{chords[d]}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {prog.degrees.map((d, i) => (
                      <span key={i} className="text-[8px] font-semibold" style={{ color: colors[d] }}>{romans[d]}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modulation targets */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Modulation targets</p>
            <div className="space-y-1.5">
              {modulationTargets.map((t, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[9px] text-slate-500">{t.relationship}</p>
                  </div>
                  <button
                    onClick={() => { setRoot(t.root); setMode(t.mode); }}
                    className="text-[11px] font-bold text-cyan-300 hover:text-cyan-100 transition-colors"
                  >
                    {displayNote(t.root)} {t.mode} →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Circle of fifths (simplified) */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Circle of Fifths ({mode})</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {circleKeys.map((k, i) => {
                const normK = k.replace('b', '#');
                const normRoot = NOTES[safeRootIdx];
                const isActive = normK === normRoot || k === displayNote(NOTES[safeRootIdx]);
                const isAdjacent = Math.min(Math.abs(i - circleKeys.indexOf(NOTES[safeRootIdx])), 12 - Math.abs(i - circleKeys.indexOf(NOTES[safeRootIdx]))) === 1;
                return (
                  <button
                    key={k}
                    onClick={() => setRoot(NOTES[NOTES.indexOf(normK) >= 0 ? NOTES.indexOf(normK) : safeRootIdx])}
                    className={`w-10 h-10 rounded-full text-[9px] font-bold border transition-all ${
                      isActive
                        ? 'bg-cyan-500/30 border-cyan-400/60 text-cyan-200 scale-110'
                        : isAdjacent
                        ? 'bg-white/[0.05] border-white/10 text-slate-400'
                        : 'bg-white/[0.02] border-white/[0.05] text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {displayNote(k)}
                  </button>
                );
              })}
            </div>
            <p className="text-[8px] text-slate-700 text-center">Click any key to switch</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
