/**
 * GainStagingPanel â€Per-track gain staging advisor
 *
 * Measures RMS + peak for every track in the session and tells the user
 * exactly how many dB to adjust each one so the mix bus has healthy headroom.
 * Target: RMS between -18 and -12 dBFS. Peak never above -6 dBFS.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  analyzeGainStaging,
  GainStagingResult,
  TrackGainSuggestion,
} from '../services/autoGainStaging';

interface TrackInput {
  id: string;
  name: string;
  blob: Blob;
}

interface GainStagingPanelProps {
  tracks: TrackInput[];
  onClose: () => void;
}

function MeterBar({ value, color }: { value: number; color: string }) {
  // value in dBFS (-60 to 0), map to 0-100%
  const pct = Math.max(0, Math.min(100, (value + 60) / 60 * 100));
  return (
    <div className="relative h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className="absolute left-0 top-0 bottom-0 rounded-full"
        style={{ background: color }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.3 }}
      />
      {/* -18 dBFS target floor */}
      <div className="absolute top-0 bottom-0 w-px bg-emerald-400/40" style={{ left: '70%' }} />
      {/* -12 dBFS target ceiling */}
      <div className="absolute top-0 bottom-0 w-px bg-amber-400/40" style={{ left: '80%' }} />
      {/* -6 dBFS peak limit */}
      <div className="absolute top-0 bottom-0 w-px bg-red-400/40" style={{ left: '90%' }} />
    </div>
  );
}

function GainBadge({ gainDb, status }: { gainDb: number; status: TrackGainSuggestion['status'] }) {
  const colors = {
    boost: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
    cut:   'bg-red-500/15 text-red-300 border-red-500/25',
    ok:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  };
  const labels = {
    boost: `+${gainDb.toFixed(1)} dB`,
    cut:   `${gainDb.toFixed(1)} dB`,
    ok:    'âœOK',
  };
  return (
    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function TrackRow({ s }: { s: TrackGainSuggestion; key?: React.Key }) {
  const [expanded, setExpanded] = useState(false);

  const rmsColor = s.currentRmsDb > -12 ? '#f87171' : s.currentRmsDb > -18 ? '#22d3ee' : '#60a5fa';
  const peakColor = s.currentPeakDb > -6 ? '#f87171' : '#a855f7';

  return (
    <motion.div
      layout
      className={`rounded-xl border p-3 transition-colors ${
        s.status === 'ok'
          ? 'border-emerald-500/15 bg-emerald-500/[0.03]'
          : s.status === 'cut'
          ? 'border-red-500/15 bg-red-500/[0.03]'
          : 'border-cyan-500/15 bg-cyan-500/[0.03]'
      }`}
    >
      {/* Track header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-slate-200 truncate">{s.trackName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[8px] text-slate-600 uppercase tracking-wider">RMS</span>
            <span className="text-[9px] font-mono text-slate-400">{s.currentRmsDb.toFixed(1)}</span>
            <span className="text-[8px] text-slate-600 uppercase tracking-wider">Peak</span>
            <span className="text-[9px] font-mono text-slate-400">{s.currentPeakDb.toFixed(1)}</span>
          </div>
        </div>
        <GainBadge gainDb={s.suggestedGainDb} status={s.status} />
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-slate-600 hover:text-slate-400 transition-colors text-xs ml-1"
        >
          {expanded ? 'â–²' : 'â–¼'}
        </button>
      </div>

      {/* Meters */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[7px] text-slate-700 w-6 text-right">RMS</span>
          <div className="flex-1">
            <MeterBar value={s.currentRmsDb} color={rmsColor} />
          </div>
          <span className="text-[7px] font-mono text-slate-700 w-8">{s.currentRmsDb.toFixed(0)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[7px] text-slate-700 w-6 text-right">Peak</span>
          <div className="flex-1">
            <MeterBar value={s.currentPeakDb} color={peakColor} />
          </div>
          <span className="text-[7px] font-mono text-slate-700 w-8">{s.currentPeakDb.toFixed(0)}</span>
        </div>
      </div>

      {/* Expanded rationale */}
      <AnimatePresence>
        {expanded && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[9px] text-slate-500 mt-2 leading-relaxed overflow-hidden"
          >
            {s.rationale}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const GainStagingPanel: React.FC<GainStagingPanelProps> = ({ tracks, onClose }) => {
  const [result, setResult] = useState<GainStagingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (tracks.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const ctx = new AudioContext();
      const decoded = await Promise.all(
        tracks.map(async t => ({
          id: t.id,
          name: t.name,
          buffer: await ctx.decodeAudioData(await t.blob.arrayBuffer()),
        }))
      );
      const r = analyzeGainStaging(decoded);
      setResult(r);
    } catch (e) {
      setError('Could not decode audio. Make sure tracks are loaded.');
    } finally {
      setLoading(false);
    }
  }, [tracks]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

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
        className="w-full max-w-xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Gain Staging Advisor</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Target: RMS âˆ’18 to âˆ’12 dBFS ÂPeak never above âˆ’6 dBFS
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs"
          >
            âœ•
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {loading && (
            <div className="text-center py-8 space-y-2">
              <motion.div
                className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 mx-auto"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-[10px] text-slate-500">Analyzing {tracks.length} track{tracks.length > 1 ? 's' : ''}â€¦</p>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center py-6">{error}</p>
          )}

          {tracks.length === 0 && !loading && (
            <p className="text-amber-400 text-sm text-center py-6">
              Load tracks into the timeline first
            </p>
          )}

          {result && !loading && (
            <>
              {/* Summary banner */}
              <div className={`rounded-2xl border p-4 space-y-1 ${
                result.readyToMix
                  ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                  : 'border-amber-500/20 bg-amber-500/[0.04]'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-[11px] font-bold ${result.readyToMix ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {result.readyToMix ? 'âœReady to Mix' : 'âšAdjustments Needed'}
                  </p>
                  <p className="text-[9px] font-mono text-slate-500">
                    avg RMS {result.averageRmsDb.toFixed(1)} dBFS
                  </p>
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed">{result.overallRationale}</p>
              </div>

              {/* Loudest / quietest callout */}
              {result.suggestions.length > 1 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-0.5">
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest">Loudest track</p>
                    <p className="text-[11px] text-red-300 font-semibold truncate">{result.globalLoudestTrack}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-0.5">
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest">Quietest track</p>
                    <p className="text-[11px] text-cyan-300 font-semibold truncate">{result.globalQuietestTrack}</p>
                  </div>
                </div>
              )}

              {/* Meter legend */}
              <div className="flex items-center gap-4 px-1">
                <span className="text-[7px] text-slate-700 uppercase tracking-widest">Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-px bg-emerald-400/60" />
                  <span className="text-[7px] text-slate-700">âˆ’18 dBFS floor</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-px bg-amber-400/60" />
                  <span className="text-[7px] text-slate-700">âˆ’12 dBFS ceiling</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-px bg-red-400/60" />
                  <span className="text-[7px] text-slate-700">âˆ’6 dBFS peak limit</span>
                </div>
              </div>

              {/* Per-track rows */}
              <div className="space-y-2">
                {result.suggestions.map(s => (
                  <TrackRow key={s.trackId} s={s} />
                ))}
              </div>

              {/* Re-analyze button */}
              <button
                onClick={runAnalysis}
                className="w-full py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[10px] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all uppercase tracking-widest"
              >
                â†Re-analyze
              </button>

              <p className="text-[8px] text-slate-700 text-center">
                Apply suggested gains in your DAW or the Quick Normalize widget before running the AI master.
              </p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
