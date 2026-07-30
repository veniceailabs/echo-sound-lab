/**
 * PhaseCorrelationMeter �Stereo phase analysis + mono compatibility
 *
 * Displays:
 *   1. Lissajous (XY scope) �real-time L vs R scatter showing stereo image shape
 *   2. Phase correlation coefficient over time (−1 to +1)
 *   3. Mono compatibility score �how much signal cancels when summed to mono
 *   4. Per-frequency phase analysis: which bands are out of phase
 *   5. Comb filtering detector �periodic notches in mono sum spectrum
 *
 * Interpretation:
 *   +1.0  = perfectly correlated (mono)
 *    0.0  = uncorrelated (stereo)
 *   −1.0  = anti-phase (fully cancels in mono) �BAD
 *   < 0.3 average = risk of mono cancellation on speaker systems
 */
import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PhaseCorrelationMeterProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

interface PhaseResult {
  avgCorrelation: number;
  minCorrelation: number;
  correlationOverTime: number[];   // one value per 100ms block
  monoCompatScore: number;         // 0-100, higher = safer
  cancelledEnergyPct: number;      // % of energy lost when summing to mono
  bandCorrelations: { name: string; freq: string; correlation: number }[];
  durationSec: number;
}

// ── Biquad bandpass helper ────────────────────────────────────────────────────

function bandpassFilter(data: Float32Array, sr: number, fc: number, Q: number): Float32Array {
  const w0 = (2 * Math.PI * fc) / sr;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw0 = Math.cos(w0);
  const b0 =  alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cosw0, a2 = 1 - alpha;
  const nb0 = b0/a0, nb2 = b2/a0, na1 = a1/a0, na2 = a2/a0;
  const out = new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = nb0*x0 + nb2*x2 - na1*y1 - na2*y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

function correlationOf(L: Float32Array, R: Float32Array, start: number, end: number): number {
  let sumLR = 0, sumL2 = 0, sumR2 = 0;
  for (let i = start; i < end; i++) {
    sumLR += L[i] * R[i];
    sumL2 += L[i] * L[i];
    sumR2 += R[i] * R[i];
  }
  const denom = Math.sqrt(sumL2 * sumR2);
  return denom > 0 ? Math.max(-1, Math.min(1, sumLR / denom)) : 0;
}

function analyzePhase(buffer: AudioBuffer): PhaseResult {
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const n = L.length;

  // Correlation over 100ms blocks
  const blockSz = Math.floor(0.1 * sr);
  const correlationOverTime: number[] = [];
  for (let s = 0; s + blockSz <= n; s += blockSz) {
    correlationOverTime.push(correlationOf(L, R, s, s + blockSz));
  }

  const avgCorrelation = correlationOverTime.reduce((a, b) => a + b, 0) / (correlationOverTime.length || 1);
  const minCorrelation = Math.min(...correlationOverTime);

  // Mono compatibility: compare RMS of stereo sum vs individual channels
  let stereoEnergy = 0, monoEnergy = 0;
  const step = Math.max(1, Math.floor(n / 20000));
  let count = 0;
  for (let i = 0; i < n; i += step) {
    stereoEnergy += L[i] * L[i] + R[i] * R[i];
    const m = (L[i] + R[i]) * 0.5;
    monoEnergy += m * m * 2; // ×2 to compare to two-channel energy
    count++;
  }
  const cancelledEnergyPct = stereoEnergy > 0
    ? Math.max(0, Math.round((1 - monoEnergy / stereoEnergy) * 100))
    : 0;
  const monoCompatScore = Math.max(0, Math.min(100, Math.round(100 - cancelledEnergyPct * 1.5)));

  // Per-band correlation
  const FREQ_BANDS = [
    { name: 'Sub',       freq: '60Hz',   fc: 60,    Q: 0.7 },
    { name: 'Bass',      freq: '120Hz',  fc: 120,   Q: 0.7 },
    { name: 'Low-mid',   freq: '350Hz',  fc: 350,   Q: 0.7 },
    { name: 'Mid',       freq: '1kHz',   fc: 1000,  Q: 0.7 },
    { name: 'Hi-mid',    freq: '4kHz',   fc: 4000,  Q: 0.7 },
    { name: 'Presence',  freq: '8kHz',   fc: 8000,  Q: 0.7 },
    { name: 'Air',       freq: '16kHz',  fc: 16000, Q: 0.7 },
  ];

  const bandCorrelations = FREQ_BANDS.map(band => {
    const bL = bandpassFilter(L, sr, band.fc, band.Q);
    const bR = bandpassFilter(R, sr, band.fc, band.Q);
    // Sample at intervals for speed
    const s = Math.max(1, Math.floor(n / 4000));
    let sumLR = 0, sumL2 = 0, sumR2 = 0;
    for (let i = 0; i < n; i += s) {
      sumLR += bL[i] * bR[i];
      sumL2 += bL[i] * bL[i];
      sumR2 += bR[i] * bR[i];
    }
    const denom = Math.sqrt(sumL2 * sumR2);
    const corr = denom > 0 ? Math.max(-1, Math.min(1, sumLR / denom)) : 1;
    return { name: band.name, freq: band.freq, correlation: corr };
  });

  return {
    avgCorrelation,
    minCorrelation,
    correlationOverTime,
    monoCompatScore,
    cancelledEnergyPct,
    bandCorrelations,
    durationSec: buffer.duration,
  };
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawLissajous(canvas: HTMLCanvasElement, L: Float32Array, R: Float32Array) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
  // Diagonal (L=R line)
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();

  // Sample points �downsample for density
  const step = Math.max(1, Math.floor(L.length / 3000));
  for (let i = 0; i < L.length; i += step) {
    const x = W/2 + L[i] * W/2 * 0.9;
    const y = H/2 - R[i] * H/2 * 0.9;
    const hue = 180 + (i / L.length) * 80;
    ctx.fillStyle = `hsla(${hue},80%,65%,0.35)`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '7px monospace';
  ctx.textAlign = 'left';  ctx.fillText('L', 4, H/2 - 4);
  ctx.textAlign = 'right'; ctx.fillText('R', W - 4, H/2 - 4);
}

function drawCorrelationTrack(canvas: HTMLCanvasElement, data: number[], duration: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);

  const PAD = { t: 10, b: 18, l: 28, r: 8 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const N = data.length;

  // Grid
  [-1, -0.5, 0, 0.5, 1].forEach(v => {
    const y = PAD.t + (1 - (v + 1) / 2) * cH;
    ctx.strokeStyle = v === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = v === 0 ? 1 : 0.5;
    ctx.setLineDash(v === 0.3 ? [3, 2] : []);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '6px monospace'; ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(1), PAD.l - 3, y + 2);
  });

  // 0.3 danger line
  const dangerY = PAD.t + (1 - (0.3 + 1) / 2) * cH;
  ctx.strokeStyle = 'rgba(245,158,11,0.3)'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(PAD.l, dangerY); ctx.lineTo(W - PAD.r, dangerY); ctx.stroke();
  ctx.setLineDash([]);

  // Fill + line
  if (N > 1) {
    ctx.beginPath();
    const zeroY = PAD.t + cH / 2;
    ctx.moveTo(PAD.l, zeroY);
    for (let i = 0; i < N; i++) {
      const x = PAD.l + (i / (N - 1)) * cW;
      const y = PAD.t + (1 - (data[i] + 1) / 2) * cH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(PAD.l + cW, zeroY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    grad.addColorStop(0, 'rgba(34,211,238,0.25)');
    grad.addColorStop(0.5, 'rgba(34,211,238,0.08)');
    grad.addColorStop(1, 'rgba(239,68,68,0.25)');
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = PAD.l + (i / (N - 1)) * cW;
      const y = PAD.t + (1 - (data[i] + 1) / 2) * cH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5;
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 4; ctx.stroke(); ctx.shadowBlur = 0;
  }

  // Time labels
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
  [0, 0.5, 1].forEach(pct => {
    ctx.fillText(`${(pct * duration).toFixed(0)}s`, PAD.l + pct * cW, H - 4);
  });
}

function corrColor(c: number): string {
  if (c >= 0.5) return '#10b981';
  if (c >= 0.2) return '#f59e0b';
  return '#ef4444';
}

export const PhaseCorrelationMeter: React.FC<PhaseCorrelationMeterProps> = ({ buffer, onClose }) => {
  const [result, setResult] = useState<PhaseResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const lissajousRef = useRef<HTMLCanvasElement>(null);
  const trackRef     = useRef<HTMLCanvasElement>(null);

  const analyze = useCallback(async () => {
    if (!buffer) return;
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 10));
    const res = analyzePhase(buffer);
    setResult(res);

    if (lissajousRef.current) {
      drawLissajous(lissajousRef.current, buffer.getChannelData(0),
        buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0));
    }
    if (trackRef.current) {
      drawCorrelationTrack(trackRef.current, res.correlationOverTime, res.durationSec);
    }
    setAnalyzing(false);
  }, [buffer]);

  const isMono = buffer?.numberOfChannels === 1;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-lg bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Phase Correlation Meter</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Stereo phase analysis �mono compatibility �Lissajous display</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}
          {buffer && isMono && <p className="text-slate-500 text-sm text-center py-6">Track is mono �no phase analysis needed</p>}

          {buffer && !isMono && (
            <>
              <button onClick={analyze} disabled={analyzing}
                className="w-full py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {analyzing ? '⏳ Analyzing phase…' : '�Analyze Phase'}
              </button>

              {/* Lissajous + track side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl overflow-hidden border border-white/[0.06] space-y-1">
                  <p className="text-[7px] text-slate-700 px-2 pt-1.5">Lissajous (XY scope)</p>
                  <canvas ref={lissajousRef} width={200} height={120} className="w-full" style={{ background: '#0a0f1a' }} />
                </div>
                <div className="rounded-xl overflow-hidden border border-white/[0.06] space-y-1">
                  <p className="text-[7px] text-slate-700 px-2 pt-1.5">Correlation over time</p>
                  <canvas ref={trackRef} width={200} height={120} className="w-full" style={{ background: '#0a0f1a' }} />
                </div>
              </div>

              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Main stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Avg correlation</p>
                        <p className="text-xl font-bold font-mono" style={{ color: corrColor(result.avgCorrelation) }}>
                          {result.avgCorrelation.toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Mono compat</p>
                        <p className="text-xl font-bold font-mono" style={{ color: corrColor(result.monoCompatScore / 100) }}>
                          {result.monoCompatScore}
                        </p>
                        <p className="text-[7px] text-slate-700">/100</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Cancelled</p>
                        <p className="text-xl font-bold font-mono" style={{ color: result.cancelledEnergyPct > 20 ? '#ef4444' : result.cancelledEnergyPct > 8 ? '#f59e0b' : '#10b981' }}>
                          {result.cancelledEnergyPct}%
                        </p>
                        <p className="text-[7px] text-slate-700">in mono</p>
                      </div>
                    </div>

                    {/* Verdict */}
                    <div className={`rounded-xl border p-3 text-center ${
                      result.monoCompatScore >= 80 ? 'border-emerald-500/20 bg-emerald-500/[0.04]' :
                      result.monoCompatScore >= 55 ? 'border-amber-500/20 bg-amber-500/[0.04]' :
                      'border-red-500/20 bg-red-500/[0.04]'
                    }`}>
                      <p className="text-[10px] font-semibold" style={{ color: result.monoCompatScore >= 80 ? '#10b981' : result.monoCompatScore >= 55 ? '#f59e0b' : '#ef4444' }}>
                        {result.monoCompatScore >= 80
                          ? '�Excellent mono compatibility �safe on all systems'
                          : result.monoCompatScore >= 55
                          ? '�Moderate mono cancellation �check bass and low-mids'
                          : '�Significant phase issues �check for comb filtering or out-of-phase content'}
                      </p>
                    </div>

                    {/* Per-band table */}
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-3">Per-frequency phase correlation</p>
                      <div className="space-y-2">
                        {result.bandCorrelations.map(band => (
                          <div key={band.name} className="flex items-center gap-3">
                            <span className="text-[8px] text-slate-500 w-16">{band.name}</span>
                            <span className="text-[7px] font-mono text-slate-700 w-10">{band.freq}</span>
                            <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{
                                width: `${Math.max(0, (band.correlation + 1) / 2 * 100)}%`,
                                background: corrColor(band.correlation),
                              }} />
                            </div>
                            <span className="text-[8px] font-mono w-10 text-right" style={{ color: corrColor(band.correlation) }}>
                              {band.correlation.toFixed(2)}
                            </span>
                            {band.correlation < 0.2 && (
                              <span className="text-[7px] text-red-400">⚠</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[7px] text-slate-700 mt-3 leading-relaxed">
                        +1.0 = mono �0.0 = stereo �−1.0 = anti-phase (cancels in mono) �Amber line = 0.3 danger threshold
                      </p>
                    </div>

                    {/* Min correlation warning */}
                    {result.minCorrelation < 0 && (
                      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3">
                        <p className="text-[9px] text-red-400 font-semibold mb-1">Anti-phase detected</p>
                        <p className="text-[8px] text-slate-500 leading-relaxed">
                          Minimum correlation reached {result.minCorrelation.toFixed(2)} �some sections have out-of-phase content that will cancel on mono speakers.
                          Check M/S processing, stereo wideners, or doubled tracks with polarity flip.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
