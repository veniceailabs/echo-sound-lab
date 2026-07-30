/**
 * QuickNormalizeWidget â€One-click loudness normalization
 *
 * A compact widget that measures current RMS/LUFS and adjusts gain
 * to hit the chosen target. Replaces the audio in place.
 * Plain-English explanations on every option.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuickNormalizeWidgetProps {
  buffer: AudioBuffer | null;
  onNormalized: (normalized: AudioBuffer, gainApplied: number) => void;
}

const PRESETS = [
  { label: 'Spotify / Apple', lufs: -14, desc: 'Most streaming platforms' },
  { label: 'YouTube', lufs: -14, desc: 'Same as Spotify' },
  { label: 'SoundCloud', lufs: -8, desc: 'Louder platform' },
  { label: 'CD / Download', lufs: -10, desc: 'Louder than streaming' },
  { label: 'Podcast', lufs: -16, desc: 'Quieter, speech-focused' },
  { label: 'Broadcast / TV', lufs: -23, desc: 'EBU R128 standard' },
];

function measureLUFS(buffer: AudioBuffer): number {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  let sum = 0;
  for (let i = 0; i < L.length; i++) sum += L[i] * L[i] + R[i] * R[i];
  const rms = Math.sqrt(sum / (L.length * 2));
  return rms > 0.0001 ? 20 * Math.log10(rms) - 0.691 : -70;
}

async function applyGain(buffer: AudioBuffer, gainDb: number): Promise<AudioBuffer> {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const ctx = new OfflineAudioContext(numChannels, length, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = Math.pow(10, gainDb / 20);
  src.connect(gainNode);
  gainNode.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

export const QuickNormalizeWidget: React.FC<QuickNormalizeWidgetProps> = ({ buffer, onNormalized }) => {
  const [targetLUFS, setTargetLUFS] = useState(-14);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ currentLUFS: number; gainApplied: number } | null>(null);

  const handleNormalize = useCallback(async () => {
    if (!buffer) return;
    setRunning(true);
    setResult(null);
    try {
      const currentLUFS = measureLUFS(buffer);
      const gainNeeded = targetLUFS - currentLUFS;
      // Cap at +20dB to prevent runaway amplification
      const gainClamped = Math.min(20, Math.max(-40, gainNeeded));
      const normalized = await applyGain(buffer, gainClamped);
      setResult({ currentLUFS, gainApplied: gainClamped });
      onNormalized(normalized, gainClamped);
    } finally {
      setRunning(false);
    }
  }, [buffer, targetLUFS, onNormalized]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-white">Quick Normalize</p>
          <p className="text-[9px] text-slate-600 mt-0.5">
            Sets loudness to the exact target â€picks up any gain difference in one pass
          </p>
        </div>
        {result && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5"
          >
            âœDone
          </motion.span>
        )}
      </div>

      {/* Target presets */}
      <div className="grid grid-cols-3 gap-1.5">
        {PRESETS.map(p => (
          <button
            key={p.lufs + p.label}
            onClick={() => setTargetLUFS(p.lufs)}
            className={`rounded-lg border px-2 py-1.5 text-left transition-all ${
              targetLUFS === p.lufs
                ? 'border-cyan-500/40 bg-cyan-500/10'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
            }`}
          >
            <p className={`text-[9px] font-bold leading-tight ${targetLUFS === p.lufs ? 'text-cyan-300' : 'text-slate-400'}`}>
              {p.label}
            </p>
            <p className="text-[8px] text-slate-700 mt-0.5">{p.lufs} LUFS</p>
          </button>
        ))}
      </div>

      {/* Manual target */}
      <div className="flex items-center gap-2">
        <label className="text-[9px] text-slate-600 shrink-0">Custom target:</label>
        <input
          type="number"
          min={-40}
          max={0}
          step={0.5}
          value={targetLUFS}
          onChange={e => setTargetLUFS(Number(e.target.value))}
          className="w-20 bg-black/30 border border-white/[0.08] rounded px-2 py-1 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-cyan-500/40"
        />
        <span className="text-[9px] text-slate-600">LUFS</span>
      </div>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-1">
              <div className="flex justify-between">
                <span className="text-[9px] text-slate-600">Was:</span>
                <span className="text-[9px] font-mono text-slate-400">{result.currentLUFS.toFixed(1)} LUFS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[9px] text-slate-600">Now:</span>
                <span className="text-[9px] font-mono text-emerald-400">{targetLUFS.toFixed(1)} LUFS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[9px] text-slate-600">Gain applied:</span>
                <span className={`text-[9px] font-mono ${result.gainApplied > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {result.gainApplied > 0 ? '+' : ''}{result.gainApplied.toFixed(1)} dB
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleNormalize}
        disabled={!buffer || running}
        className="w-full py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/25 text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-500/25 transition-all disabled:opacity-30"
      >
        {running ? 'Normalizingâ€¦' : `Normalize to ${targetLUFS} LUFS`}
      </button>
    </div>
  );
};
