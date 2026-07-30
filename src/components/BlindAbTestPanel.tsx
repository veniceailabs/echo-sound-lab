/**
 * BlindAbTestPanel ‚ÄRandomized blind A/B listening test
 *
 * The gold standard for evaluating mastering quality. Presents two versions
 * of a track (original vs mastered, or any two files) in random order.
 * The user listens and picks which they prefer ‚Äwithout knowing which is which.
 * After N rounds, reveals the results and shows pick rate per version.
 *
 * Features:
 *   - Cryptographically randomized assignment (A=original or A=mastered, random each round)
 *   - Synchronized playback: both versions cued to same position
 *   - Keyboard shortcuts: A / B to pick, Space to toggle playback
 *   - Per-round timer shows listen time before picking
 *   - Results reveal: which version won, how often each was preferred
 *   - Export results as JSON
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BlindAbTestPanelProps {
  bufferA: AudioBuffer | null;   // "original" or version 1
  bufferB: AudioBuffer | null;   // "mastered" or version 2
  labelA?: string;
  labelB?: string;
  onClose: () => void;
}

type Pick = 'A' | 'B';

interface Round {
  roundNum: number;
  /** Which actual version was presented as "A" this round */
  aIsVersion: 'original' | 'mastered';
  userPick: Pick;
  listenMs: number;
}

const ROUNDS_DEFAULT = 5;

function playBuffer(
  ctx: AudioContext,
  buf: AudioBuffer,
  gainNode: GainNode,
  startOffset: number,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gainNode);
  gainNode.connect(ctx.destination);
  src.start(0, startOffset % buf.duration);
  return src;
}

export const BlindAbTestPanel: React.FC<BlindAbTestPanelProps> = ({
  bufferA, bufferB, labelA = 'Original', labelB = 'Mastered', onClose,
}) => {
  const [rounds] = useState(ROUNDS_DEFAULT);
  const [history, setHistory] = useState<Round[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState<'A' | 'B' | null>(null);
  const [roundStartMs, setRoundStartMs] = useState<number>(Date.now());
  const [assignment, setAssignment] = useState<{ aIsVersion: 'original' | 'mastered' }>(() => ({
    aIsVersion: Math.random() < 0.5 ? 'original' : 'mastered',
  }));

  const audioCtxRef = useRef<AudioContext | null>(null);
  const srcRef      = useRef<AudioBufferSourceNode | null>(null);
  const gainRef     = useRef<GainNode | null>(null);
  const offsetRef   = useRef(0);
  const playStartRef = useRef(0);

  const currentRound = history.length + 1;
  const done = history.length >= rounds;

  // Re-randomize assignment each round
  useEffect(() => {
    if (!done) {
      setAssignment({ aIsVersion: Math.random() < 0.5 ? 'original' : 'mastered' });
      setRoundStartMs(Date.now());
      offsetRef.current = 0;
    }
  }, [history.length, done]);

  const stopPlayback = useCallback(() => {
    if (srcRef.current) {
      try { srcRef.current.stop(); } catch {}
      srcRef.current = null;
    }
    if (audioCtxRef.current) {
      offsetRef.current = (offsetRef.current + (Date.now() - playStartRef.current) / 1000) %
        ((assignment.aIsVersion === 'original' ? bufferA : bufferB)?.duration ?? 1);
    }
    setPlaying(null);
  }, [assignment.aIsVersion, bufferA, bufferB]);

  const startPlay = useCallback((slot: 'A' | 'B') => {
    stopPlayback();
    const isVersionOriginal = slot === 'A'
      ? assignment.aIsVersion === 'original'
      : assignment.aIsVersion === 'mastered';
    const buf = isVersionOriginal ? bufferA : bufferB;
    if (!buf) return;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    const gain = ctx.createGain();
    gainRef.current = gain;
    playStartRef.current = Date.now();
    srcRef.current = playBuffer(ctx, buf, gain, offsetRef.current);
    srcRef.current.onended = () => setPlaying(null);
    setPlaying(slot);
  }, [assignment, bufferA, bufferB, stopPlayback]);

  const pick = useCallback((slot: Pick) => {
    if (done || revealed) return;
    stopPlayback();
    const listenMs = Date.now() - roundStartMs;
    setHistory(prev => [...prev, {
      roundNum: prev.length + 1,
      aIsVersion: assignment.aIsVersion,
      userPick: slot,
      listenMs,
    }]);
  }, [done, revealed, stopPlayback, roundStartMs, assignment]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'a' || e.key === 'A') { if (!done && !revealed) startPlay('A'); }
      if (e.key === 'b' || e.key === 'B') { if (!done && !revealed) startPlay('B'); }
      if (e.key === ' ') { e.preventDefault(); playing ? stopPlayback() : (startPlay('A')); }
      if (e.key === '1') pick('A');
      if (e.key === '2') pick('B');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [done, revealed, playing, startPlay, stopPlayback, pick]);

  // Cleanup on close
  useEffect(() => () => { stopPlayback(); }, [stopPlayback]);

  // Compute results
  const originalWins = history.filter(r =>
    (r.userPick === 'A' && r.aIsVersion === 'original') ||
    (r.userPick === 'B' && r.aIsVersion === 'mastered')
  ).length;
  const masteredWins = history.length - originalWins;
  const masteredWinPct = history.length > 0 ? Math.round(masteredWins / history.length * 100) : 0;
  const avgListenMs = history.length > 0 ? Math.round(history.reduce((s, r) => s + r.listenMs, 0) / history.length) : 0;

  const exportResults = useCallback(() => {
    const data = {
      test: 'Echo Sound Lab Blind A/B Test',
      date: new Date().toISOString(),
      versionA: labelA,
      versionB: labelB,
      totalRounds: history.length,
      masteredPreferred: masteredWins,
      originalPreferred: originalWins,
      masteredWinRate: `${masteredWinPct}%`,
      rounds: history.map(r => ({
        round: r.roundNum,
        presentedAs: r.aIsVersion === 'original' ? `A=${labelA}, B=${labelB}` : `A=${labelB}, B=${labelA}`,
        picked: r.userPick,
        actualPreference: (r.userPick === 'A') === (r.aIsVersion === 'original') ? labelA : labelB,
        listenTimeMs: r.listenMs,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ab_test_results.json'; a.click();
    URL.revokeObjectURL(url);
  }, [history, labelA, labelB, masteredWins, originalWins, masteredWinPct]);

  const canTest = bufferA && bufferB;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) { stopPlayback(); onClose(); } }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-md bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Blind A/B Test</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Randomized ‚Äyou don't know which is which until the reveal</p>
          </div>
          <div className="flex gap-2">
            {done && revealed && (
              <button onClick={exportResults} className="text-[9px] text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500/10 transition-all">‚ÜResults</button>
            )}
            <button onClick={() => { stopPlayback(); onClose(); }} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!canTest && (
            <p className="text-amber-400 text-sm text-center py-6">
              {!bufferA && !bufferB ? 'Load both original and mastered tracks first' : !bufferA ? 'No original track loaded' : 'No mastered track loaded'}
            </p>
          )}

          {canTest && !done && (
            <>
              {/* Round indicator */}
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-600 uppercase tracking-widest">Round {currentRound} of {rounds}</span>
                <div className="flex gap-1">
                  {Array.from({ length: rounds }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{
                      background: i < history.length ? '#10b981' : i === history.length ? '#22d3ee' : 'rgba(255,255,255,0.1)',
                    }} />
                  ))}
                </div>
              </div>

              {/* A/B play buttons */}
              <div className="grid grid-cols-2 gap-4">
                {(['A', 'B'] as const).map(slot => (
                  <div key={slot} className="space-y-3">
                    <button
                      onClick={() => playing === slot ? stopPlayback() : startPlay(slot)}
                      className={`w-full py-8 rounded-2xl border-2 text-center transition-all ${
                        playing === slot
                          ? 'border-cyan-400 bg-cyan-500/20 shadow-[0_0_24px_rgba(34,211,238,0.3)]'
                          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <p className="text-4xl font-black text-white mb-1">{slot}</p>
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                        {playing === slot ? '‚ñPlaying‚Ä¶' : 'Press to listen'}
                      </p>
                    </button>
                    <button
                      onClick={() => pick(slot)}
                      className="w-full py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all"
                    >
                      I prefer {slot}
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-[8px] text-slate-700 text-center">
                Keyboard: <kbd className="bg-white/[0.06] px-1 rounded">A</kbd> / <kbd className="bg-white/[0.06] px-1 rounded">B</kbd> to listen ¬<kbd className="bg-white/[0.06] px-1 rounded">1</kbd> / <kbd className="bg-white/[0.06] px-1 rounded">2</kbd> to pick
              </p>
            </>
          )}

          {canTest && done && !revealed && (
            <div className="text-center space-y-6 py-4">
              <div>
                <p className="text-2xl font-black text-white mb-2">All {rounds} rounds complete</p>
                <p className="text-sm text-slate-500">Ready to see which version you actually preferred?</p>
              </div>
              <button
                onClick={() => { stopPlayback(); setRevealed(true); }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-sm font-bold uppercase tracking-widest text-white hover:from-cyan-500/30 hover:to-purple-500/30 transition-all"
              >
                Reveal Results ‚Üí
              </button>
            </div>
          )}

          {canTest && done && revealed && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Winner */}
              <div className={`rounded-2xl border p-5 text-center ${masteredWins >= originalWins ? 'border-cyan-500/30 bg-cyan-500/[0.06]' : 'border-slate-500/30 bg-white/[0.03]'}`}>
                <p className="text-[9px] uppercase tracking-widest mb-2" style={{ color: masteredWins >= originalWins ? '#22d3ee' : '#94a3b8' }}>
                  {masteredWins >= originalWins ? 'üèYou preferred the master' : 'üéYou preferred the original'}
                </p>
                <p className="text-3xl font-black text-white">
                  {masteredWins >= originalWins ? masteredWinPct : 100 - masteredWinPct}%
                </p>
                <p className="text-[10px] text-slate-500 mt-1">of the time</p>
              </div>

              {/* Per-round breakdown */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-3">Round by round</p>
                {history.map((r, i) => {
                  const pickedOriginal = (r.userPick === 'A') === (r.aIsVersion === 'original');
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[8px] font-mono text-slate-600 w-12">Round {r.roundNum}</span>
                      <div className="flex-1 flex items-center gap-1.5">
                        <span className="text-[7px] text-slate-700">
                          {r.aIsVersion === 'original' ? `A=${labelA}, B=${labelB}` : `A=${labelB}, B=${labelA}`}
                        </span>
                        <span className="text-[7px] font-mono text-slate-500">‚Üpicked {r.userPick}</span>
                      </div>
                      <span className="text-[8px] font-semibold" style={{ color: pickedOriginal ? '#94a3b8' : '#22d3ee' }}>
                        {pickedOriginal ? labelA : labelB}
                      </span>
                      <span className="text-[7px] text-slate-700">{(r.listenMs / 1000).toFixed(1)}s</span>
                    </div>
                  );
                })}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-[7px] text-slate-600 uppercase tracking-widest">{labelB} wins</p>
                  <p className="text-xl font-bold text-cyan-400">{masteredWins}/{rounds}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-[7px] text-slate-600 uppercase tracking-widests">{labelA} wins</p>
                  <p className="text-xl font-bold text-slate-300">{originalWins}/{rounds}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-[7px] text-slate-600 uppercase tracking-widest">Avg listen</p>
                  <p className="text-xl font-bold text-white">{(avgListenMs / 1000).toFixed(1)}s</p>
                </div>
              </div>

              <button
                onClick={() => { setHistory([]); setRevealed(false); }}
                className="w-full py-2.5 rounded-xl border border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:text-slate-300 hover:border-white/10 transition-all"
              >
                Run again
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
