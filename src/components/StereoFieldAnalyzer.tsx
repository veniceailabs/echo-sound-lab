/**
 * StereoFieldAnalyzer â€Real-time stereo field visualization
 *
 * Shows:
 * - Lissajous scope (X=L, Y=R) â€a circle = perfect mono, a diagonal = wide stereo
 * - L/R peak meters
 * - M/S (mid/side) decomposition meters
 * - Phase correlation meter (-1 to +1)
 * - Stereo width percentage
 *
 * Works on a static AudioBuffer (reads all data at once for a snapshot).
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface StereoFieldAnalyzerProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

// Draw Lissajous (X-Y scope)
function drawLissajous(canvas: HTMLCanvasElement, L: Float32Array, R: Float32Array) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const cx = width / 2;
  const cy = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#060a10';
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
  ctx.moveTo(0, cy); ctx.lineTo(width, cy);
  // 45Â° diagonals
  ctx.moveTo(0, 0); ctx.lineTo(width, height);
  ctx.moveTo(width, 0); ctx.lineTo(0, height);
  ctx.stroke();

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '9px monospace';
  ctx.fillText('L', 4, cy - 4);
  ctx.fillText('R', cx + 4, 12);
  ctx.fillText('M', cx + 4, cy - 4);

  // Sample every N-th point to keep it readable
  const step = Math.max(1, Math.floor(L.length / 4096));
  const scale = Math.min(cx, cy) * 0.9;

  ctx.lineWidth = 0.8;

  let prevX = cx;
  let prevY = cy;

  for (let i = 0; i < L.length; i += step) {
    const x = cx + L[i] * scale;
    const y = cy - R[i] * scale;
    const t = i / L.length;

    // Gradient: old points fade out
    ctx.strokeStyle = `hsla(${180 + t * 60}, 80%, 60%, ${0.1 + t * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();

    prevX = x;
    prevY = y;
  }

  // Bright tail (last 256 samples)
  const tailStart = Math.max(0, L.length - 256 * step);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#22d3ee';
  ctx.beginPath();
  for (let i = tailStart; i < L.length; i += step) {
    const x = cx + L[i] * scale;
    const y = cy - R[i] * scale;
    if (i === tailStart) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function MeterBar({
  label, value, color, vertical = true,
}: {
  label: string; value: number; color: string; vertical?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value + 60) / 60 * 100));
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[8px] text-slate-600 uppercase tracking-wider">{label}</span>
      <div className="relative w-3 h-24 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06]">
        <motion.div
          className="absolute bottom-0 left-0 right-0 rounded-full"
          style={{ background: color }}
          animate={{ height: `${pct}%` }}
          transition={{ duration: 0.1 }}
        />
        {/* Peak indicator at -6 dBFS */}
        <div className="absolute w-full h-px bg-amber-400/40" style={{ bottom: '90%' }} />
        <div className="absolute w-full h-px bg-red-400/40" style={{ bottom: '97%' }} />
      </div>
      <span className="text-[8px] font-mono text-slate-500">{value.toFixed(0)}</span>
    </div>
  );
}

function CorrelationMeter({ value }: { value: number }) {
  // value: -1 to +1. Display as a horizontal bar centered at 0.
  const pct = ((value + 1) / 2) * 100;
  const color = value > 0.5 ? '#22d3ee' : value > 0 ? '#fbbf24' : '#f87171';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[9px] text-slate-600 uppercase tracking-widest">Phase Correlation</p>
        <p className="text-[10px] font-mono" style={{ color }}>{value.toFixed(2)}</p>
      </div>
      <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06] relative">
        {/* Center tick */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, marginLeft: '50%', transformOrigin: 'left' }}
          animate={{
            width: `${Math.abs(value) * 50}%`,
            marginLeft: value >= 0 ? '50%' : `${50 - Math.abs(value) * 50}%`,
          }}
          transition={{ duration: 0.1 }}
        />
      </div>
      <div className="flex justify-between text-[7px] text-slate-700 font-mono">
        <span>-1 (out of phase)</span>
        <span>0</span>
        <span>+1 (mono)</span>
      </div>
      <p className="text-[9px] text-slate-700">
        {value > 0.7 ? 'Good mono compatibility âœ“' :
         value > 0.3 ? 'Some phase issues â€check low end' :
         value > 0 ? 'Moderate phase issues' :
         'Phase cancellation problem! Will disappear in mono.'}
      </p>
    </div>
  );
}

function analyzeBuffer(buffer: AudioBuffer) {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;

  let sumL2 = 0, sumR2 = 0, sumM2 = 0, sumS2 = 0, sumLR = 0;
  let peakL = 0, peakR = 0;

  for (let i = 0; i < L.length; i++) {
    const l = L[i], r = R[i];
    const m = (l + r) * 0.5;
    const s = (l - r) * 0.5;

    sumL2 += l * l;
    sumR2 += r * r;
    sumM2 += m * m;
    sumS2 += s * s;
    sumLR += l * r;

    if (Math.abs(l) > peakL) peakL = Math.abs(l);
    if (Math.abs(r) > peakR) peakR = Math.abs(r);
  }

  const n = L.length;
  const rmsL = Math.sqrt(sumL2 / n);
  const rmsR = Math.sqrt(sumR2 / n);
  const rmsM = Math.sqrt(sumM2 / n);
  const rmsS = Math.sqrt(sumS2 / n);

  const toDb = (v: number) => v > 0 ? 20 * Math.log10(v) : -60;

  const correlation = Math.sqrt(sumL2 * sumR2) > 0
    ? sumLR / Math.sqrt(sumL2 * sumR2)
    : 1;

  const width = (rmsM + rmsS) > 0 ? rmsS / (rmsM + rmsS) : 0;

  return {
    rmsL: toDb(rmsL),
    rmsR: toDb(rmsR),
    rmsM: toDb(rmsM),
    rmsS: toDb(rmsS),
    peakL: toDb(peakL),
    peakR: toDb(peakR),
    correlation,
    width,
    L,
    R,
  };
}

export const StereoFieldAnalyzer: React.FC<StereoFieldAnalyzerProps> = ({ buffer, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<ReturnType<typeof analyzeBuffer> | null>(null);

  useEffect(() => {
    if (!buffer) return;
    const result = analyzeBuffer(buffer);
    setStats(result);
    if (canvasRef.current) {
      drawLissajous(canvasRef.current, result.L, result.R);
    }
  }, [buffer]);

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
            <h2 className="text-sm font-bold text-white">Stereo Field Analyzer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Lissajous scope ÂL/R/M/S meters ÂPhase correlation ÂStereo width
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">
            âœ•
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!buffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>
          )}

          {buffer && stats && (
            <>
              {/* Main layout: scope + meters */}
              <div className="flex gap-4">
                {/* Lissajous */}
                <div className="flex flex-col gap-2">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">X-Y Scope</p>
                  <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                    <canvas
                      ref={canvasRef}
                      width={200}
                      height={200}
                      style={{ display: 'block', width: 200, height: 200 }}
                    />
                  </div>
                  <p className="text-[8px] text-slate-700 leading-relaxed max-w-[200px]">
                    Diagonal = mono/centered. Horizontal ellipse = wide stereo. Thin diagonal = very wide or phase issues.
                  </p>
                </div>

                {/* Meters */}
                <div className="flex-1 space-y-4">
                  {/* RMS meters */}
                  <div className="space-y-2">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">RMS Levels</p>
                    <div className="flex gap-4 justify-center">
                      <MeterBar label="L" value={stats.rmsL} color="#22d3ee" />
                      <MeterBar label="R" value={stats.rmsR} color="#22d3ee" />
                      <div className="w-px bg-white/[0.06]" />
                      <MeterBar label="M" value={stats.rmsM} color="#a855f7" />
                      <MeterBar label="S" value={stats.rmsS} color="#f97316" />
                    </div>
                    <div className="flex justify-center gap-6 text-[8px] text-slate-700">
                      <span>L/R = left/right channels</span>
                      <span>M/S = mid/side</span>
                    </div>
                  </div>

                  {/* Peak levels */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">Peak Levels</p>
                    {[
                      { label: 'Left Peak', value: stats.peakL },
                      { label: 'Right Peak', value: stats.peakR },
                      { label: 'Balance', value: Math.abs(stats.peakL - stats.peakR) },
                    ].map(s => (
                      <div key={s.label} className="flex justify-between">
                        <span className="text-[9px] text-slate-500">{s.label}</span>
                        <span className={`text-[9px] font-mono ${
                          s.label === 'Balance' && s.value > 1.5 ? 'text-amber-400' : 'text-slate-300'
                        }`}>
                          {s.value.toFixed(1)} dBFS
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Width */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                    <div className="flex justify-between">
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest">Stereo Width</p>
                      <p className="text-[11px] font-mono text-cyan-300">{(stats.width * 100).toFixed(0)}%</p>
                    </div>
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-400 to-cyan-400 rounded-full"
                        animate={{ width: `${stats.width * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-[8px] text-slate-700">
                      {stats.width < 0.1 ? 'Nearly mono' :
                       stats.width < 0.3 ? 'Narrow stereo' :
                       stats.width < 0.6 ? 'Moderate stereo width' :
                       stats.width < 0.8 ? 'Wide stereo' :
                       'Very wide â€check mono compatibility'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Correlation */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <CorrelationMeter value={stats.correlation} />
              </div>

              {/* Advice */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 space-y-1.5">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Recommendations</p>
                {stats.correlation < 0.3 && (
                  <p className="text-[9px] text-red-400">âšPhase correlation is low â€the track may disappear when summed to mono. Check for phase-inverted channels or extreme stereo widening on bass.</p>
                )}
                {Math.abs(stats.peakL - stats.peakR) > 2 && (
                  <p className="text-[9px] text-amber-400">âšL/R balance is off by {Math.abs(stats.peakL - stats.peakR).toFixed(1)} dB. Check your pan law and any channel-specific processing.</p>
                )}
                {stats.width > 0.75 && stats.correlation > 0.5 && (
                  <p className="text-[9px] text-cyan-400">âœWide stereo with good mono compatibility â€nice work.</p>
                )}
                {stats.width < 0.15 && (
                  <p className="text-[9px] text-slate-500">â„Mix is quite narrow/mono. Consider adding stereo reverb sends or stereo widening on mid/high elements.</p>
                )}
                {stats.correlation > 0.7 && stats.width > 0.2 && (
                  <p className="text-[9px] text-emerald-400">âœStereo image looks healthy â€good phase coherence.</p>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
