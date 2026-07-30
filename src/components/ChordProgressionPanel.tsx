/**
 * ChordProgressionPanel â€Chord detection timeline
 *
 * Detects chords across the track and displays them as a scrollable
 * timeline with a piano roll visualization. Shows the progression in
 * a readable sequence and lets users copy it.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { detectChords, ChordEvent, ChordQuality } from '../services/chordDetection';

interface ChordProgressionPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const QUALITY_COLOR: Record<ChordQuality, string> = {
  major:  '#22d3ee',
  minor:  '#a855f7',
  dom7:   '#f97316',
  maj7:   '#10b981',
  min7:   '#8b5cf6',
  sus2:   '#06b6d4',
  sus4:   '#0ea5e9',
  dim:    '#ef4444',
  aug:    '#f59e0b',
  power:  '#6b7280',
};

const QUALITY_LABEL: Record<ChordQuality, string> = {
  major: 'Major',
  minor: 'Minor',
  dom7:  'Dom 7',
  maj7:  'Maj 7',
  min7:  'Min 7',
  sus2:  'Sus 2',
  sus4:  'Sus 4',
  dim:   'Diminished',
  aug:   'Augmented',
  power: 'Power',
};

// Mini piano showing which keys are active
function MiniPiano({ chroma }: { chroma: number[] }) {
  const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
  const blackKeys = [1, 3, -1, 6, 8, 10, -1]; // C# D# - F# G# A# -

  return (
    <div className="relative flex" style={{ height: 28, width: 56 }}>
      {whiteKeys.map((pc, i) => (
        <div
          key={i}
          className="relative border border-white/10 rounded-b"
          style={{
            width: 8,
            height: 28,
            background: pc >= 0 && chroma[pc] > 0.4
              ? `rgba(34,211,238,${0.3 + chroma[pc] * 0.7})`
              : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
      {blackKeys.map((pc, i) => pc >= 0 && (
        <div
          key={i}
          className="absolute rounded-b"
          style={{
            width: 5,
            height: 17,
            top: 0,
            left: 5 + i * 8 + (i > 1 ? 2 : 0),
            background: pc >= 0 && chroma[pc] > 0.4
              ? `rgba(168,85,247,${0.3 + chroma[pc] * 0.7})`
              : 'rgba(0,0,0,0.6)',
            zIndex: 1,
          }}
        />
      ))}
    </div>
  );
}

function ChordCard({ event, isLast }: { event: ChordEvent; isLast: boolean }) {
  const [hover, setHover] = useState(false);
  const color = QUALITY_COLOR[event.quality];
  const durationSec = (event.durationMs / 1000).toFixed(1);
  const timeSec = (event.timeMs / 1000).toFixed(1);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex flex-col items-center gap-1 shrink-0"
    >
      <motion.div
        whileHover={{ scale: 1.05 }}
        className="rounded-xl border p-2.5 text-center cursor-default"
        style={{
          borderColor: `${color}40`,
          background: hover ? `${color}15` : `${color}08`,
          minWidth: 64,
        }}
      >
        <p className="text-base font-black leading-none" style={{ color }}>
          {event.chord}
        </p>
        <p className="text-[8px] mt-1" style={{ color: `${color}99` }}>
          {QUALITY_LABEL[event.quality]}
        </p>
        <div className="mt-1.5 flex justify-center">
          <MiniPiano chroma={event.chromagram} />
        </div>
        <p className="text-[7px] text-slate-700 mt-1.5 font-mono">{durationSec}s</p>
      </motion.div>

      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-10 mt-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[9px] text-slate-400 shadow-xl whitespace-nowrap"
            style={{ top: '100%' }}
          >
            At {timeSec}s Â{(event.confidence * 100).toFixed(0)}% confident
          </motion.div>
        )}
      </AnimatePresence>

      {!isLast && (
        <div className="text-slate-700 text-sm mt-1 self-center">â†’</div>
      )}
    </div>
  );
}

// Timeline bar â€each chord is a proportional segment
function TimelineBar({ events, totalDuration }: { events: ChordEvent[]; totalDuration: number }) {
  if (!events.length || totalDuration === 0) return null;
  return (
    <div className="h-5 flex rounded-full overflow-hidden border border-white/[0.06]">
      {events.map((e, i) => {
        const widthPct = (e.durationMs / (totalDuration * 1000)) * 100;
        const color = QUALITY_COLOR[e.quality];
        return (
          <motion.div
            key={i}
            title={`${e.chord} @ ${(e.timeMs / 1000).toFixed(1)}s`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            style={{
              width: `${widthPct}%`,
              minWidth: 2,
              background: color,
              opacity: 0.7,
            }}
          />
        );
      })}
    </div>
  );
}

export const ChordProgressionPanel: React.FC<ChordProgressionPanelProps> = ({ buffer, onClose }) => {
  const [events, setEvents] = useState<ChordEvent[] | null>(null);
  const [running, setRunning] = useState(false);
  const [windowMs, setWindowMs] = useState(500);
  const [copied, setCopied] = useState(false);

  const runDetection = useCallback(async () => {
    if (!buffer) return;
    setRunning(true);
    setEvents(null);
    try {
      await new Promise(r => setTimeout(r, 30));
      const result = detectChords(buffer, windowMs);
      setEvents(result);
    } finally {
      setRunning(false);
    }
  }, [buffer, windowMs]);

  useEffect(() => {
    if (buffer) runDetection();
  }, [buffer, runDetection]);

  const progressionText = events
    ? [...new Set(events.map(e => e.chord))].join(' - ')
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(progressionText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const uniqueChords = events ? [...new Set(events.map(e => e.chord))] : [];

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
        className="w-full max-w-3xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Chord Progression</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Detects chords across the track â€major, minor, 7th, sus, dim, aug, and more
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={windowMs}
              onChange={e => setWindowMs(Number(e.target.value))}
              className="bg-slate-800 border border-white/[0.08] text-slate-300 text-[10px] rounded-lg px-2 py-1 outline-none"
            >
              <option value={250}>250ms windows (fast tracks)</option>
              <option value={500}>500ms windows (standard)</option>
              <option value={1000}>1s windows (slow/ambient)</option>
              <option value={2000}>2s windows (very slow)</option>
            </select>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs"
            >
              âœ•
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!buffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>
          )}

          {running && (
            <div className="text-center py-10 space-y-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                className="w-8 h-8 mx-auto border-2 border-purple-500/30 border-t-purple-400 rounded-full"
              />
              <p className="text-[11px] text-slate-400">Analysing chordsâ€¦</p>
            </div>
          )}

          {events && !running && (
            <>
              {events.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 text-sm">No clear chords detected</p>
                  <p className="text-slate-700 text-[11px] mt-1">Try a longer window, or the track may be purely rhythmic</p>
                </div>
              ) : (
                <>
                  {/* Progression summary */}
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest">Detected progression</p>
                      <button
                        onClick={handleCopy}
                        className={`text-[9px] px-2 py-1 rounded border transition-all ${
                          copied
                            ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                            : 'border-white/[0.06] text-slate-600 hover:text-slate-300'
                        }`}
                      >
                        {copied ? 'âœCopied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-lg font-bold text-white leading-relaxed tracking-wide">
                      {uniqueChords.join(' â†')}
                    </p>
                    <TimelineBar events={events} totalDuration={buffer!.duration} />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Unique chords', value: uniqueChords.length },
                      { label: 'Total events', value: events.length },
                      { label: 'Avg confidence', value: `${Math.round(events.reduce((s, e) => s + e.confidence, 0) / events.length * 100)}%` },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[8px] text-slate-700 uppercase tracking-widest">{s.label}</p>
                        <p className="text-lg font-bold text-slate-300 mt-1">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Chord cards */}
                  <div className="space-y-2">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                      Chord timeline â€{events.length} events
                    </p>
                    <div className="relative overflow-x-auto pb-2">
                      <div className="flex gap-3 min-w-max">
                        {events.map((e, i) => (
                          <div key={i} className="relative">
                            <ChordCard event={e} isLast={i === events.length - 1} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Legend</p>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(QUALITY_COLOR).map(([quality, color]) => (
                        <div key={quality} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded" style={{ background: color }} />
                          <span className="text-[9px] text-slate-600">{QUALITY_LABEL[quality as ChordQuality]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={runDetection}
                    className="w-full py-2 rounded-xl border border-white/[0.06] text-[10px] text-slate-600 hover:text-slate-300 transition-all"
                  >
                    Re-analyse with {windowMs}ms windows
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
