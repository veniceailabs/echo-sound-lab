/**
 * ReferenceTrackPanel ‚ÄLoad a professional reference track for A/B comparison
 *
 * Lets the user upload any reference track (commercially released song)
 * and compares it against their mix on:
 * - LUFS / integrated loudness
 * - True peak
 * - Dynamic range
 * - RMS per frequency band (tonal balance)
 * - Stereo width
 * - Phase correlation
 *
 * Gives specific gap analysis: "Your mix is 4.2 dB quieter than the reference"
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';

interface ReferenceTrackPanelProps {
  mixBuffer: AudioBuffer | null;
  onClose: () => void;
}

interface TrackStats {
  name: string;
  lufs: number;
  truePeak: number;
  rms: number;
  dynamicRange: number;
  stereoWidth: number;
  correlation: number;
  bassEnergy: number;
  midEnergy: number;
  highEnergy: number;
}

async function analyzeBuffer(buffer: AudioBuffer, name: string): Promise<TrackStats> {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const n = L.length;
  const sr = buffer.sampleRate;

  let sumL2 = 0, sumR2 = 0, sumLR = 0, sumM2 = 0, sumS2 = 0;
  let peakL = 0, peakR = 0;

  // Band energies via simple IIR approximation
  let bassSum = 0, midSum = 0, highSum = 0;
  // Bass: LP ~250Hz; High: HP ~4kHz
  const rc_bass = 1 / (2 * Math.PI * 250 / sr + 1);
  const rc_high = 1 / (2 * Math.PI * 4000 / sr + 1);
  let lpL = 0, lpR = 0, hpL = 0, hpR = 0;
  let prevL = 0, prevR = 0;

  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    const m = (l + r) * 0.5;
    const s = (l - r) * 0.5;

    sumL2 += l * l;
    sumR2 += r * r;
    sumLR += l * r;
    sumM2 += m * m;
    sumS2 += s * s;

    if (Math.abs(l) > peakL) peakL = Math.abs(l);
    if (Math.abs(r) > peakR) peakR = Math.abs(r);

    // Bass LP
    lpL = rc_bass * lpL + (1 - rc_bass) * l;
    lpR = rc_bass * lpR + (1 - rc_bass) * r;
    bassSum += lpL * lpL + lpR * lpR;

    // High HP
    hpL = rc_high * (hpL + l - prevL);
    hpR = rc_high * (hpR + r - prevR);
    highSum += hpL * hpL + hpR * hpR;

    prevL = l; prevR = r;
  }
  midSum = sumL2 + sumR2 - (bassSum / n * n) - (highSum / n * n);

  const rmsL = Math.sqrt(sumL2 / n);
  const rmsR = Math.sqrt(sumR2 / n);
  const rms = Math.sqrt((sumL2 + sumR2) / (n * 2));
  const peak = Math.max(peakL, peakR);
  const toDb = (v: number) => v > 0 ? 20 * Math.log10(v) : -96;

  const lufs = toDb(rms) - 0.691;
  const truePeak = toDb(peak);
  const dynamicRange = Math.max(0, truePeak - lufs);

  const rmsM = Math.sqrt(sumM2 / n);
  const rmsS = Math.sqrt(sumS2 / n);
  const stereoWidth = (rmsM + rmsS) > 0 ? rmsS / (rmsM + rmsS) : 0;
  const correlation = Math.sqrt(sumL2 * sumR2) > 0 ? sumLR / Math.sqrt(sumL2 * sumR2) : 1;

  const total = bassSum + Math.max(0, midSum) + highSum || 1;

  return {
    name,
    lufs,
    truePeak,
    rms: toDb(rms),
    dynamicRange,
    stereoWidth,
    correlation,
    bassEnergy: bassSum / total,
    midEnergy: Math.max(0, midSum) / total,
    highEnergy: highSum / total,
  };
}

function StatRow({ label, mix, ref: refVal, unit, higherIsBetter = true }: {
  label: string;
  mix: number;
  ref: number;
  unit: string;
  higherIsBetter?: boolean;
}) {
  const diff = mix - refVal;
  const better = higherIsBetter ? diff >= 0 : diff <= 0;
  const absGap = Math.abs(diff);

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[9px] text-slate-500 w-28">{label}</span>
      <span className="text-[9px] font-mono text-slate-300 w-20 text-right">{mix.toFixed(1)}{unit}</span>
      <span className="text-[9px] font-mono text-slate-500 w-20 text-right">{refVal.toFixed(1)}{unit}</span>
      <div className="w-24 text-right">
        {absGap < 0.5 ? (
          <span className="text-[8px] text-emerald-400">‚âmatch</span>
        ) : (
          <span className={`text-[8px] font-semibold ${better ? 'text-emerald-400' : 'text-amber-400'}`}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}{unit}
          </span>
        )}
      </div>
    </div>
  );
}

function BandBar({ label, mix, ref: refVal, color }: {
  label: string; mix: number; ref: number; color: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between">
        <span className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</span>
        <span className="text-[7px] font-mono text-slate-600">mix {(mix * 100).toFixed(0)}% ¬ref {(refVal * 100).toFixed(0)}%</span>
      </div>
      <div className="relative h-3 rounded bg-white/[0.04] overflow-hidden">
        {/* Reference bar (ghost) */}
        <div className="absolute inset-y-0 left-0 rounded opacity-20" style={{ width: `${refVal * 100}%`, background: color }} />
        {/* Mix bar */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded opacity-70"
          style={{ background: color }}
          animate={{ width: `${mix * 100}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>
    </div>
  );
}

export const ReferenceTrackPanel: React.FC<ReferenceTrackPanelProps> = ({ mixBuffer, onClose }) => {
  const [mixStats, setMixStats] = useState<TrackStats | null>(null);
  const [refStats, setRefStats] = useState<TrackStats | null>(null);
  const [loadingMix, setLoadingMix] = useState(false);
  const [loadingRef, setLoadingRef] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  // Analyze mix buffer on mount
  React.useEffect(() => {
    if (!mixBuffer) return;
    setLoadingMix(true);
    analyzeBuffer(mixBuffer, 'Your Mix').then(stats => {
      setMixStats(stats);
      setLoadingMix(false);
    });
  }, [mixBuffer]);

  const handleRefFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingRef(true);
    try {
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      await ctx.close();
      const stats = await analyzeBuffer(buffer, file.name.replace(/\.[^.]+$/, ''));
      setRefStats(stats);
    } catch {
      // file couldn't be decoded
    } finally {
      setLoadingRef(false);
    }
  }, []);

  const lufsGap = mixStats && refStats ? refStats.lufs - mixStats.lufs : null;

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
            <h2 className="text-sm font-bold text-white">Reference Track Comparator</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Load a reference track ¬compare LUFS, spectrum, stereo width, dynamics
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!mixBuffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track into the session first</p>
          )}

          {/* Reference loader */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest">Reference track</p>
            {refStats ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-slate-200">{refStats.name}</p>
                  <p className="text-[9px] text-slate-500">{refStats.lufs.toFixed(1)} LUFS ¬{refStats.truePeak.toFixed(1)} dBTP</p>
                </div>
                <button
                  onClick={() => refInputRef.current?.click()}
                  className="text-[9px] text-slate-500 hover:text-slate-300 border border-white/[0.06] px-2 py-1 rounded-lg hover:border-white/10 transition-all"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => refInputRef.current?.click()}
                disabled={loadingRef}
                className="w-full py-4 rounded-xl border border-dashed border-white/10 text-[10px] text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all"
              >
                {loadingRef ? '‚èAnalyzing‚Ä¶' : '+ Load reference track (MP3, WAV, FLAC‚Ä¶)'}
              </button>
            )}
            <input ref={refInputRef} type="file" accept="audio/*" className="hidden" onChange={handleRefFile} />
          </div>

          {/* Comparison table */}
          {mixStats && refStats && (
            <>
              {/* LUFS gap summary */}
              {lufsGap !== null && (
                <div className={`rounded-xl border p-4 space-y-1 ${
                  Math.abs(lufsGap) < 1 ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                  : 'border-amber-500/20 bg-amber-500/[0.04]'
                }`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-200">Loudness gap</p>
                    <p className={`text-xl font-black ${Math.abs(lufsGap) < 1 ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {lufsGap > 0 ? '+' : ''}{lufsGap.toFixed(1)} LU
                    </p>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    {Math.abs(lufsGap) < 1
                      ? 'Your mix matches the reference loudness ‚Ägreat job.'
                      : lufsGap > 0
                      ? `Reference is ${lufsGap.toFixed(1)} LU louder. Apply ${lufsGap.toFixed(1)} dB makeup gain to match.`
                      : `Your mix is ${Math.abs(lufsGap).toFixed(1)} LU louder than the reference. Cut ${Math.abs(lufsGap).toFixed(1)} dB.`}
                  </p>
                </div>
              )}

              {/* Stats table */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest w-28">Metric</span>
                  <span className="text-[9px] text-cyan-400 uppercase tracking-widest w-20 text-right">Your Mix</span>
                  <span className="text-[9px] text-purple-400 uppercase tracking-widest w-20 text-right">Reference</span>
                  <span className="text-[9px] text-slate-600 uppercase tracking-widest w-24 text-right">Gap</span>
                </div>
                <StatRow label="LUFS (integrated)" mix={mixStats.lufs} ref={refStats.lufs} unit=" LU" higherIsBetter={false} />
                <StatRow label="True Peak" mix={mixStats.truePeak} ref={refStats.truePeak} unit=" dBTP" higherIsBetter={false} />
                <StatRow label="Dynamic Range" mix={mixStats.dynamicRange} ref={refStats.dynamicRange} unit=" dB" higherIsBetter />
                <StatRow label="Stereo Width" mix={mixStats.stereoWidth * 100} ref={refStats.stereoWidth * 100} unit="%" higherIsBetter />
                <StatRow label="Correlation" mix={mixStats.correlation} ref={refStats.correlation} unit="" higherIsBetter />
              </div>

              {/* Tonal balance comparison */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Tonal balance (solid = your mix ¬ghost = reference)</p>
                <BandBar label="Bass (< 250 Hz)" mix={mixStats.bassEnergy} ref={refStats.bassEnergy} color="#a855f7" />
                <BandBar label="Mids (250 Hz ‚Ä4 kHz)" mix={mixStats.midEnergy} ref={refStats.midEnergy} color="#22d3ee" />
                <BandBar label="High (> 4 kHz)" mix={mixStats.highEnergy} ref={refStats.highEnergy} color="#f59e0b" />
              </div>
            </>
          )}

          {mixStats && !refStats && !loadingRef && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
              <p className="text-[9px] text-slate-600 uppercase tracking-widest">Your mix stats</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { label: 'LUFS', value: `${mixStats.lufs.toFixed(1)} LU` },
                  { label: 'True Peak', value: `${mixStats.truePeak.toFixed(1)} dBTP` },
                  { label: 'Dynamic Range', value: `${mixStats.dynamicRange.toFixed(0)} dB` },
                  { label: 'Stereo Width', value: `${(mixStats.stereoWidth * 100).toFixed(0)}%` },
                ].map(s => (
                  <div key={s.label} className="flex justify-between">
                    <span className="text-[9px] text-slate-500">{s.label}</span>
                    <span className="text-[9px] font-mono text-slate-300">{s.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-slate-600 mt-2">Load a reference track above to see the comparison.</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
