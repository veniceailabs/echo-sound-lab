/**
 * ClientShareView â€What the client sees when they open a Fiverr delivery link
 *
 * Shows: mastered track player, before/after toggle, LUFS improvement, echo summary
 * No login required. Read-only. Looks premium.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RichShare } from '../services/sessionShareService';

interface Props {
  share: RichShare;
}

export const ClientShareView: React.FC<Props> = ({ share }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState<'processed' | 'original'>('processed');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);

  const audioUrl = mode === 'processed' ? share.audioUrl : share.originalAudioUrl;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.src = audioUrl ?? '';
    el.load();
    if (isPlaying) el.play().catch(() => {});
  }, [audioUrl]); // eslint-disable-line

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => { setIsPlaying(false); setProgress(0); };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => { el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('ended', onEnd); };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(() => {});
      const tick = () => {
        setProgress(el.currentTime / (el.duration || 1));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      el.pause();
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const togglePlay = () => setIsPlaying(p => !p);
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const lufs = share.processedMetrics?.lufs?.integrated;
  const origLufs = share.originalMetrics?.lufs?.integrated;
  const improvement = lufs && origLufs ? Math.abs(lufs - origLufs) : null;
  const truePeak = share.processedMetrics?.lufs?.truePeak;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center px-4 py-12">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-orange-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-cyan-500/[0.03] rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-lg space-y-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-1 mb-6"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-orange-400">
                <path d="M3 10 a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <rect x="1" y="9" width="3.5" height="5" rx="1.75" fill="currentColor"/>
                <rect x="15.5" y="9" width="3.5" height="5" rx="1.75" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">Echo Sound Lab</span>
          </div>
          <h1 className="text-xl font-bold text-slate-100">{share.fileName}</h1>
          <p className="text-xs text-slate-500">
            Mastered {new Date(share.sharedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </motion.div>

        {/* Player card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/60 border border-white/[0.07] rounded-2xl p-5 space-y-4 backdrop-blur-xl"
        >
          {/* Before/After toggle */}
          {share.originalAudioUrl && (
            <div className="flex items-center bg-white/[0.04] rounded-xl p-1 gap-1">
              {(['processed', 'original'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setIsPlaying(false); setProgress(0); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    mode === m
                      ? m === 'processed'
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/25'
                        : 'bg-white/[0.06] text-slate-300 border border-white/10'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {m === 'processed' ? 'âœMastered' : 'Original'}
                </button>
              ))}
            </div>
          )}

          {/* Play button + progress */}
          <div className="flex items-center gap-4">
            <motion.button
              onClick={togglePlay}
              disabled={!audioUrl}
              whileTap={{ scale: 0.92 }}
              className="w-12 h-12 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-400 flex items-center justify-center hover:bg-orange-500/25 transition-colors disabled:opacity-30 flex-shrink-0"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </motion.button>

            <div className="flex-1 space-y-1">
              <div
                className="h-1 bg-white/[0.06] rounded-full overflow-hidden cursor-pointer"
                onClick={seek}
              >
                <motion.div
                  className="h-full bg-orange-400/60 rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>{fmt((audioRef.current?.currentTime) || 0)}</span>
                <span>{duration ? fmt(duration) : '--:--'}</span>
              </div>
            </div>
          </div>

          <audio ref={audioRef} preload="auto" />
        </motion.div>

        {/* Metrics grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            {
              label: 'Loudness',
              value: lufs != null ? `${lufs.toFixed(1)}` : 'â€”',
              unit: 'LUFS',
              sub: origLufs != null ? `was ${origLufs.toFixed(1)}` : undefined,
              color: 'orange',
            },
            {
              label: 'True Peak',
              value: truePeak != null ? `${truePeak.toFixed(1)}` : 'â€”',
              unit: 'dBTP',
              sub: 'streaming safe',
              color: 'cyan',
            },
            {
              label: 'Improvement',
              value: improvement != null ? `+${improvement.toFixed(1)}` : 'â€”',
              unit: 'dB',
              sub: 'louder & cleaner',
              color: 'emerald',
            },
          ].map(card => (
            <div
              key={card.label}
              className="bg-slate-900/50 border border-white/[0.06] rounded-xl p-3 text-center"
            >
              <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">{card.label}</p>
              <p className={`text-lg font-bold text-${card.color}-400 leading-none`}>
                {card.value}
                <span className="text-[10px] text-slate-600 font-normal ml-0.5">{card.unit}</span>
              </p>
              {card.sub && <p className="text-[9px] text-slate-600 mt-0.5">{card.sub}</p>}
            </div>
          ))}
        </motion.div>

        {/* Echo summary */}
        {share.echoSummary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-900/40 border border-white/[0.06] rounded-xl p-4"
          >
            <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Engineer Notes</p>
            <p className="text-xs text-slate-400 leading-relaxed">{share.echoSummary}</p>
          </motion.div>
        )}

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-[10px] text-slate-700 pt-2"
        >
          Mastered with Echo Sound Lab ÂProfessional AI Mastering
        </motion.p>
      </div>
    </div>
  );
};
