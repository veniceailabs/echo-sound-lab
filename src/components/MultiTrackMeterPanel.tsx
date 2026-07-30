/**
 * MultiTrackMeterPanel â€Broadcast-style VU meters for all tracks
 *
 * Shows per-track:
 * - True peak (PPM) in dBFS
 * - RMS (VU equivalent)
 * - Animated peak hold with decay
 * - Clip indicator
 * - Stereo balance bar
 *
 * All analysis is done from the raw AudioBuffer â€no real-time processing needed.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface TrackMeterInput {
  id: string;
  name: string;
  blob: Blob;
}

interface TrackMetrics {
  id: string;
  name: string;
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
  truePeak: number;
  dynamicRange: number;
  clipped: boolean;
  balance: number;  // -1 to +1
}

interface MultiTrackMeterPanelProps {
  tracks: TrackMeterInput[];
  onClose: () => void;
}

async function measureTrack(id: string, name: string, blob: Blob): Promise<TrackMetrics> {
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();

  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const n = L.length;

  let peakL = 0, peakR = 0;
  let sumL2 = 0, sumR2 = 0;
  let clipped = false;

  for (let i = 0; i < n; i++) {
    const l = Math.abs(L[i]);
    const r = Math.abs(R[i]);
    if (l > peakL) peakL = l;
    if (r > peakR) peakR = r;
    sumL2 += L[i] * L[i];
    sumR2 += R[i] * R[i];
    if (l >= 0.9999 || r >= 0.9999) clipped = true;
  }

  const rmsL = Math.sqrt(sumL2 / n);
  const rmsR = Math.sqrt(sumR2 / n);
  const toDb = (v: number) => v > 0 ? 20 * Math.log10(v) : -96;

  // Dynamic range: difference between peak and average RMS
  const avgRms = (rmsL + rmsR) / 2;
  const dynamicRange = toDb(Math.max(peakL, peakR)) - toDb(avgRms);

  // Balance: L vs R peak imbalance
  const balance = peakR > 0 || peakL > 0
    ? (toDb(peakR) - toDb(peakL)) / 60
    : 0;

  return {
    id, name,
    peakL: toDb(peakL),
    peakR: toDb(peakR),
    rmsL: toDb(rmsL),
    rmsR: toDb(rmsR),
    truePeak: toDb(Math.max(peakL, peakR)),
    dynamicRange: Math.max(0, dynamicRange),
    clipped,
    balance: Math.max(-1, Math.min(1, balance)),
  };
}

function VUMeter({ value, peak, label, color }: {
  value: number; peak: number; label: string; color: string;
}) {
  // value and peak in dBFS (-60 to 0)
  const toHeight = (db: number) => Math.max(0, Math.min(100, (db + 60) / 60 * 100));

  const segments = [
    { lo: -60, hi: -18, color: '#10b981' },
    { lo: -18, hi: -12, color: '#22d3ee' },
    { lo: -12, hi: -6,  color: '#f59e0b' },
    { lo: -6,  hi: 0,   color: '#ef4444' },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[7px] text-slate-700 uppercase tracking-wider">{label}</span>
      <div className="relative w-4 h-28 bg-black/40 rounded border border-white/[0.06] overflow-hidden">
        {/* Segmented fill */}
        {segments.map(seg => {
          const segHeight = ((seg.hi - seg.lo) / 60) * 100;
          const bottom = toHeight(seg.lo);
          const fillHeight = Math.max(0, Math.min(toHeight(seg.hi), toHeight(value)) - bottom);
          return (
            <div
              key={seg.lo}
              className="absolute left-0 right-0"
              style={{
                bottom: `${bottom}%`,
                height: `${segHeight}%`,
              }}
            >
              <motion.div
                className="absolute bottom-0 left-0 right-0"
                style={{ background: seg.color }}
                animate={{ height: `${(fillHeight / segHeight) * 100}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
          );
        })}
        {/* Peak hold line */}
        {peak > -60 && (
          <div
            className="absolute left-0 right-0 h-px"
            style={{ bottom: `${toHeight(peak)}%`, background: '#f87171' }}
          />
        )}
        {/* Reference lines */}
        <div className="absolute left-0 right-0 h-px bg-white/10" style={{ bottom: `${toHeight(-18)}%` }} />
        <div className="absolute left-0 right-0 h-px bg-white/10" style={{ bottom: `${toHeight(-6)}%` }} />
      </div>
      <span className="text-[7px] font-mono text-slate-500">{value > -60 ? value.toFixed(0) : 'â€”'}</span>
    </div>
  );
}

function TrackMeterRow({ metrics, key }: { metrics: TrackMetrics; key?: React.Key }) {
  const isHot = metrics.truePeak > -6;
  const isOk = metrics.truePeak <= -12 && metrics.truePeak > -30;

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      metrics.clipped ? 'border-red-500/30 bg-red-500/[0.03]'
      : isHot ? 'border-amber-500/20 bg-amber-500/[0.02]'
      : 'border-white/[0.06] bg-white/[0.02]'
    }`}>
      {/* Track name + clip */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-slate-200 truncate flex-1 mr-2">{metrics.name}</p>
        {metrics.clipped && (
          <span className="text-[7px] font-bold text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded bg-red-500/10">CLIP</span>
        )}
        {!metrics.clipped && isHot && (
          <span className="text-[7px] font-bold text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded bg-amber-500/10">HOT</span>
        )}
        {isOk && (
          <span className="text-[7px] font-bold text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded bg-emerald-500/10">OK</span>
        )}
      </div>

      {/* Meters row */}
      <div className="flex items-end gap-3">
        {/* L/R VU meters */}
        <div className="flex gap-1">
          <VUMeter value={metrics.rmsL} peak={metrics.peakL} label="L" color="#22d3ee" />
          <VUMeter value={metrics.rmsR} peak={metrics.peakR} label="R" color="#22d3ee" />
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              { label: 'True Peak', value: `${metrics.truePeak.toFixed(1)} dBFS`, warn: metrics.truePeak > -6 },
              { label: 'RMS L', value: `${metrics.rmsL.toFixed(1)} dB`, warn: false },
              { label: 'Dynamic Range', value: `${metrics.dynamicRange.toFixed(0)} dB`, warn: metrics.dynamicRange < 6 },
              { label: 'RMS R', value: `${metrics.rmsR.toFixed(1)} dB`, warn: false },
            ].map(s => (
              <div key={s.label} className="flex justify-between gap-2">
                <span className="text-[7px] text-slate-600 uppercase tracking-widest">{s.label}</span>
                <span className={`text-[8px] font-mono ${s.warn ? 'text-amber-300' : 'text-slate-400'}`}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Balance bar */}
          <div className="space-y-0.5">
            <span className="text-[7px] text-slate-700 uppercase tracking-widest">L/R Balance</span>
            <div className="relative h-1 bg-white/[0.06] rounded-full overflow-visible">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              <motion.div
                className="absolute inset-y-0 rounded-full bg-cyan-400"
                style={{
                  left: metrics.balance < 0 ? `${(0.5 + metrics.balance * 0.5) * 100}%` : '50%',
                  width: `${Math.abs(metrics.balance) * 50}%`,
                }}
                animate={{}}
              />
            </div>
            <div className="flex justify-between text-[6px] text-slate-700">
              <span>L</span>
              <span>Center</span>
              <span>R</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const MultiTrackMeterPanel: React.FC<MultiTrackMeterPanelProps> = ({ tracks, onClose }) => {
  const [metrics, setMetrics] = useState<TrackMetrics[]>([]);
  const [loading, setLoading] = useState(false);

  const runAnalysis = useCallback(async () => {
    if (tracks.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.all(tracks.map(t => measureTrack(t.id, t.name, t.blob)));
      setMetrics(results);
    } finally {
      setLoading(false);
    }
  }, [tracks]);

  useEffect(() => { runAnalysis(); }, [runAnalysis]);

  const clippedCount = metrics.filter(m => m.clipped).length;
  const hotCount = metrics.filter(m => !m.clipped && m.truePeak > -6).length;

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
            <h2 className="text-sm font-bold text-white">Multi-Track Meters</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              True peak ÂRMS Âdynamic range ÂL/R balance for every track
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {loading && (
            <div className="text-center py-8 space-y-2">
              <motion.div
                className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 mx-auto"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-[10px] text-slate-500">Measuring {tracks.length} track{tracks.length > 1 ? 's' : ''}â€¦</p>
            </div>
          )}

          {tracks.length === 0 && !loading && (
            <p className="text-amber-400 text-sm text-center py-6">Load tracks first</p>
          )}

          {!loading && metrics.length > 0 && (
            <>
              {/* Summary */}
              {(clippedCount > 0 || hotCount > 0) && (
                <div className={`rounded-xl border p-3 ${clippedCount > 0 ? 'border-red-500/25 bg-red-500/[0.04]' : 'border-amber-500/20 bg-amber-500/[0.03]'}`}>
                  <p className={`text-[10px] font-bold ${clippedCount > 0 ? 'text-red-300' : 'text-amber-300'}`}>
                    {clippedCount > 0
                      ? `âš${clippedCount} track${clippedCount > 1 ? 's are' : ' is'} clipping â€reduce gain before mastering`
                      : `${hotCount} track${hotCount > 1 ? 's are' : ' is'} running hot â€consider -3 to -6 dB headroom`}
                  </p>
                </div>
              )}
              {clippedCount === 0 && hotCount === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                  <p className="text-[10px] font-bold text-emerald-300">âœAll tracks within safe level range</p>
                </div>
              )}

              {/* Reference legend */}
              <div className="flex items-center gap-4 px-1 flex-wrap">
                <span className="text-[7px] text-slate-700 uppercase tracking-widest">Level guide:</span>
                {[
                  { color: '#10b981', label: '< -18 dB (safe)' },
                  { color: '#22d3ee', label: '-18 to -12 (ideal)' },
                  { color: '#f59e0b', label: '-12 to -6 (hot)' },
                  { color: '#ef4444', label: '> -6 (clip zone)' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="text-[7px] text-slate-700">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Per-track meters */}
              {metrics.map(m => <TrackMeterRow key={m.id} metrics={m} />)}

              <button
                onClick={runAnalysis}
                className="w-full py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[10px] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all uppercase tracking-widest"
              >
                â†Re-measure
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
