/**
 * TempoGroovePanel ‚ÄVisual metronome, delay calculator, and groove advisor
 *
 * Three sections:
 * 1. Tap Tempo / BPM input with animated visual metronome
 * 2. Note division calculator ‚Äconverts BPM ‚Üms values for delay/reverb pre-delay
 * 3. Groove advisor ‚Äwhat time signature works, feel descriptor
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TempoGrovePanelProps {
  initialBpm?: number;
  onClose: () => void;
}

const NOTE_DIVISIONS = [
  { label: '1 bar', beats: 4 },
  { label: '2 beats', beats: 2 },
  { label: '1 beat', beats: 1 },
  { label: '1/2', beats: 0.5 },
  { label: '1/4', beats: 0.25 },
  { label: '1/8', beats: 0.125 },
  { label: '1/16', beats: 0.0625 },
  { label: '1/3 (trip)', beats: 1 / 3 },
  { label: '2/3 (trip)', beats: 2 / 3 },
  { label: '1/6 (trip)', beats: 1 / 6 },
  { label: 'dotted 1/4', beats: 0.375 },
  { label: 'dotted 1/8', beats: 0.1875 },
];

function bpmToMs(bpm: number, beats: number): number {
  return (60000 / bpm) * beats;
}

function grooveDescriptor(bpm: number): { feel: string; genre: string; color: string } {
  if (bpm < 60) return { feel: 'Very slow / dramatic', genre: 'Ballad, ambient, doom', color: '#60a5fa' };
  if (bpm < 80) return { feel: 'Slow & heavy', genre: 'R&B, soul, slow rap', color: '#818cf8' };
  if (bpm < 100) return { feel: 'Mid-tempo groove', genre: 'Hip-hop, reggae, pop', color: '#a855f7' };
  if (bpm < 120) return { feel: 'Walking pace', genre: 'Pop, funk, rock', color: '#22d3ee' };
  if (bpm < 130) return { feel: 'Dance groove', genre: 'House, dance-pop', color: '#10b981' };
  if (bpm < 145) return { feel: 'Energetic', genre: 'Techno, EDM, trance', color: '#f59e0b' };
  if (bpm < 175) return { feel: 'High energy', genre: 'Drum & bass, punk', color: '#f97316' };
  return { feel: 'Extreme / frenetic', genre: 'Speed metal, gabber, hardcore', color: '#ef4444' };
}

function VisualMetronome({ bpm, isRunning }: { bpm: number; isRunning: boolean }) {
  const [beat, setBeat] = useState(0);
  const [barBeat, setBarBeat] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isRunning || bpm <= 0) return;

    const ms = (60000 / bpm);
    intervalRef.current = setInterval(() => {
      setBeat(b => b + 1);
      setBarBeat(b => (b + 1) % 4);
    }, ms);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [bpm, isRunning]);

  return (
    <div className="flex gap-2 justify-center">
      {[0, 1, 2, 3].map(i => (
        <motion.div
          key={i}
          className={`w-8 h-8 rounded-full border-2 ${i === 0 ? 'border-cyan-400' : 'border-white/20'}`}
          animate={
            isRunning && barBeat === i
              ? { scale: [1, 1.4, 1], backgroundColor: i === 0 ? 'rgb(6,182,212)' : 'rgba(255,255,255,0.3)' }
              : { scale: 1, backgroundColor: 'transparent' }
          }
          transition={{ duration: 0.12, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

export const TempoGroovePanel: React.FC<TempoGrovePanelProps> = ({ initialBpm = 120, onClose }) => {
  const [bpm, setBpm] = useState(initialBpm);
  const [bpmInput, setBpmInput] = useState(initialBpm.toString());
  const [isRunning, setIsRunning] = useState(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [highlightMs, setHighlightMs] = useState<number | null>(null);

  const groove = grooveDescriptor(bpm);

  const handleBpmInputChange = useCallback((v: string) => {
    setBpmInput(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n >= 20 && n <= 300) setBpm(n);
  }, []);

  const handleTap = useCallback(() => {
    const now = Date.now();
    setTapTimes(prev => {
      const recent = [...prev, now].filter(t => now - t < 3000).slice(-8);
      if (recent.length >= 2) {
        const intervals = recent.slice(1).map((t, i) => t - recent[i]);
        const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const detected = Math.round(60000 / avgMs * 10) / 10;
        if (detected >= 20 && detected <= 300) {
          setBpm(detected);
          setBpmInput(detected.toFixed(1));
        }
      }
      return recent;
    });
  }, []);

  const halfTime = Math.round(bpm / 2 * 10) / 10;
  const doubleTime = Math.round(bpm * 2 * 10) / 10;

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
        className="w-full max-w-lg bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Tempo & Groove</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Visual metronome ¬delay calculator ¬groove advisor
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* BPM + metronome */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
            <div className="flex items-end gap-4">
              {/* Big BPM display */}
              <div className="flex-1 space-y-1">
                <p className="text-[8px] text-slate-600 uppercase tracking-widest">Tempo</p>
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    min={20} max={300}
                    value={bpmInput}
                    onChange={e => handleBpmInputChange(e.target.value)}
                    className="w-24 bg-transparent text-4xl font-black text-white outline-none border-b border-white/10 focus:border-cyan-500/50 pb-1"
                  />
                  <span className="text-sm text-slate-500 font-semibold">BPM</span>
                </div>
              </div>

              {/* BPM presets */}
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => { setBpm(halfTime); setBpmInput(halfTime.toFixed(1)); }}
                  className="text-[8px] text-slate-600 hover:text-slate-400 border border-white/[0.06] px-2 py-1 rounded-lg hover:border-white/10 transition-all"
                >
                  ¬time ({halfTime})
                </button>
                <button
                  onClick={() => { setBpm(doubleTime); setBpmInput(doubleTime.toFixed(1)); }}
                  className="text-[8px] text-slate-600 hover:text-slate-400 border border-white/[0.06] px-2 py-1 rounded-lg hover:border-white/10 transition-all"
                >
                  2√time ({doubleTime})
                </button>
              </div>
            </div>

            {/* Metronome dots */}
            <VisualMetronome bpm={bpm} isRunning={isRunning} />

            {/* Controls */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsRunning(r => !r)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest border transition-all ${
                  isRunning
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/20'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25 hover:bg-cyan-500/20'
                }`}
              >
                {isRunning ? '‚èStop' : '‚ñStart Metronome'}
              </button>
              <button
                onPointerDown={handleTap}
                className="flex-1 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] transition-all active:scale-95 select-none"
              >
                üëTap Tempo
              </button>
            </div>

            {tapTimes.length >= 2 && (
              <p className="text-[8px] text-slate-600 text-center">
                {tapTimes.length} taps ‚Äkeep tapping to refine
              </p>
            )}
          </div>

          {/* Groove descriptor */}
          <div className="rounded-xl border p-3 space-y-1" style={{ borderColor: groove.color + '33', background: groove.color + '08' }}>
            <div className="flex items-center justify-between">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">Groove feel</p>
              <p className="text-[10px] font-bold" style={{ color: groove.color }}>{groove.feel}</p>
            </div>
            <p className="text-[9px] text-slate-500">{groove.genre}</p>
          </div>

          {/* Delay calculator */}
          <div className="space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Delay / Pre-Delay Times</p>
            <p className="text-[8px] text-slate-700 leading-relaxed">
              Tap any value to highlight it. Use for delay throws, reverb pre-delay, tremolo, LFO sync.
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {NOTE_DIVISIONS.map(d => {
                const ms = bpmToMs(bpm, d.beats);
                const isHighlighted = highlightMs === ms;
                return (
                  <motion.button
                    key={d.label}
                    onClick={() => setHighlightMs(isHighlighted ? null : ms)}
                    whileTap={{ scale: 0.95 }}
                    className={`rounded-xl border p-2.5 text-center transition-all ${
                      isHighlighted
                        ? 'border-cyan-500/40 bg-cyan-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                    }`}
                  >
                    <p className={`text-[8px] uppercase tracking-widest ${isHighlighted ? 'text-cyan-300' : 'text-slate-500'}`}>{d.label}</p>
                    <p className={`text-[12px] font-mono font-bold mt-0.5 ${isHighlighted ? 'text-cyan-200' : 'text-slate-300'}`}>
                      {ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Common delay suggestions */}
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 space-y-1.5">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Quick references</p>
            <div className="space-y-1">
              {[
                { label: 'Slapback delay', ms: bpmToMs(bpm, 0.125), tip: '1/8 note ‚Äclassic rockabilly slapback' },
                { label: 'Pre-delay (lush reverb)', ms: bpmToMs(bpm, 0.0625), tip: '1/16 note ‚Äadds space before reverb tail' },
                { label: 'Dotted 1/8 delay', ms: bpmToMs(bpm, 0.1875), tip: 'The classic U2/Edge rhythmic delay' },
                { label: 'Ping-pong (1/4)', ms: bpmToMs(bpm, 0.25), tip: 'L‚ÜíR ping-pong on the quarter note' },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] text-slate-400">{r.label}</p>
                    <p className="text-[7px] text-slate-700">{r.tip}</p>
                  </div>
                  <p className="text-[10px] font-mono text-cyan-400">{r.ms.toFixed(0)}ms</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
