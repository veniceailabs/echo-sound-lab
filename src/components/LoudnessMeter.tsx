/**
 * LoudnessMeter ‚ÄITU-R BS.1770-4 live loudness display
 *
 * Shows three loudness windows simultaneously:
 *   Momentary  (M)   ‚Ä400ms sliding window
 *   Short-term (S)   ‚Ä3-second sliding window
 *   Integrated (I)   ‚Äfull file measurement
 *
 * Plus:
 *   LRA    ‚ÄLoudness Range (dynamic spread)
 *   TP     ‚ÄTrue peak (max observed)
 *   Level  ‚ÄAnimated vertical bargraph for M-LUFS
 *
 * All numbers come from offline analysis of the buffer (not real-time WebAudio),
 * so readings are identical to what the mastering engine produces.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoudnessMeterProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const NOTE_COLORS = {
  good:    '#10b981',  // LUFS within ¬±1 of -14 target
  warn:    '#f59e0b',  // within ¬±3
  bad:     '#ef4444',  // outside ¬±3
  neutral: '#64748b',
};

// K-weighting filter: high-shelf pre-filter + RLB high-pass
function kWeightChannel(input: Float32Array, sr: number): Float32Array {
  const out = new Float32Array(input.length);

  // Stage 1: High-shelf pre-filter (Vh=10^(4/20), fc=1500Hz)
  const Vh = Math.pow(10, 4.0 / 20);
  const fc1 = 1500;
  const K1 = Math.tan(Math.PI * fc1 / sr);
  const Vb = Math.sqrt(Vh);
  const a0hs = 1 + Vb / 0.7072 * K1 + Vh * K1 * K1;
  const b0hs = (Vh + Vh / 0.7072 * K1 + K1 * K1) / a0hs;
  const b1hs = 2 * (K1 * K1 - Vh) / a0hs;
  const b2hs = (Vh - Vh / 0.7072 * K1 + K1 * K1) / a0hs;
  const a1hs = 2 * (K1 * K1 - 1) / a0hs;
  const a2hs = (1 - Vb / 0.7072 * K1 + K1 * K1) / a0hs;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0hs * x0 + b1hs * x1 + b2hs * x2 - a1hs * y1 - a2hs * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }

  // Stage 2: RLB high-pass (fc=38.135Hz, 2nd-order Butterworth, Q=0.5012)
  const fc2 = 38.135;
  const K2 = Math.tan(Math.PI * fc2 / sr);
  const Q2 = 0.5012;
  const a0hp = 1 + K2 / Q2 + K2 * K2;
  const b0hp = 1 / a0hp;
  const b1hp = -2 / a0hp;
  const b2hp = 1 / a0hp;
  const a1hp = 2 * (K2 * K2 - 1) / a0hp;
  const a2hp = (1 - K2 / Q2 + K2 * K2) / a0hp;

  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  for (let i = 0; i < out.length; i++) {
    const x0 = out[i];
    const y0 = b0hp * x0 + b1hp * x1 + b2hp * x2 - a1hp * y1 - a2hp * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }

  return out;
}

interface LoudnessResult {
  momentaryLufs: number[];   // one per 100ms step
  shortTermLufs: number[];   // one per 100ms step (3s window)
  integratedLufs: number;
  lra: number;
  truePeak: number;
  duration: number;
}

function analyzeLoudness(buffer: AudioBuffer): LoudnessResult {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;

  // K-weight
  const kL = kWeightChannel(L, sr);
  const kR = kWeightChannel(R, sr);

  // Compute MS-squared at each sample
  const msq = new Float32Array(kL.length);
  for (let i = 0; i < msq.length; i++) {
    msq[i] = kL[i] * kL[i] + kR[i] * kR[i];
  }

  const stepSamples  = Math.floor(0.1  * sr); // 100ms step
  const mWindow      = Math.floor(0.4  * sr); // 400ms momentary
  const sWindow      = Math.floor(3.0  * sr); // 3s short-term
  const nSteps       = Math.ceil(msq.length / stepSamples);

  const momentaryLufs: number[] = [];
  const shortTermLufs: number[] = [];

  for (let step = 0; step < nSteps; step++) {
    const end = Math.min((step + 1) * stepSamples, msq.length);

    // Momentary: 400ms window ending at `end`
    const mStart = Math.max(0, end - mWindow);
    let mSum = 0;
    for (let i = mStart; i < end; i++) mSum += msq[i];
    const mMean = mSum / (end - mStart);
    momentaryLufs.push(mMean > 0 ? -0.691 + 10 * Math.log10(mMean) : -70);

    // Short-term: 3s window
    const sStart = Math.max(0, end - sWindow);
    let sSum = 0;
    for (let i = sStart; i < end; i++) sSum += msq[i];
    const sMean = sSum / (end - sStart);
    shortTermLufs.push(sMean > 0 ? -0.691 + 10 * Math.log10(sMean) : -70);
  }

  // Integrated LUFS with gating (absolute gate at -70 LUFS, relative at -10 LU above mean)
  const blockSamples = Math.floor(0.4 * sr);
  const hopSamples   = Math.floor(0.1 * sr);
  const blocks: number[] = [];
  for (let start = 0; start + blockSamples <= msq.length; start += hopSamples) {
    let sum = 0;
    for (let i = start; i < start + blockSamples; i++) sum += msq[i];
    const mean = sum / blockSamples;
    const lufs = mean > 0 ? -0.691 + 10 * Math.log10(mean) : -Infinity;
    if (lufs > -70) blocks.push(mean);
  }
  let intLufs = -70;
  if (blocks.length > 0) {
    const firstPassMean = blocks.reduce((a, b) => a + b, 0) / blocks.length;
    const firstPassLufs = -0.691 + 10 * Math.log10(firstPassMean);
    const relThresh = firstPassLufs - 10;
    const relThreshLin = Math.pow(10, (relThresh + 0.691) / 10);
    const gated = blocks.filter(m => m >= relThreshLin);
    if (gated.length > 0) {
      const gatedMean = gated.reduce((a, b) => a + b, 0) / gated.length;
      intLufs = -0.691 + 10 * Math.log10(gatedMean);
    }
  }

  // LRA: 10th-95th percentile of short-term blocks above -70
  const validST = shortTermLufs.filter(v => v > -70).sort((a, b) => a - b);
  let lra = 0;
  if (validST.length >= 4) {
    const p10 = validST[Math.floor(validST.length * 0.10)];
    const p95 = validST[Math.floor(validST.length * 0.95)];
    lra = Math.max(0, p95 - p10);
  }

  // True peak (max abs)
  let tp = 0;
  for (let i = 0; i < L.length; i++) {
    if (Math.abs(L[i]) > tp) tp = Math.abs(L[i]);
    if (Math.abs(R[i]) > tp) tp = Math.abs(R[i]);
  }
  const tpDb = tp > 0 ? 20 * Math.log10(tp) : -100;

  return {
    momentaryLufs,
    shortTermLufs,
    integratedLufs: intLufs,
    lra,
    truePeak: tpDb,
    duration: buffer.duration,
  };
}

function drawMeter(
  canvas: HTMLCanvasElement,
  momentaryLufs: number[],
  shortTermLufs: number[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, W, H);

  const PAD = { t: 16, b: 24, l: 40, r: 12 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const N = momentaryLufs.length;

  const MIN_LUFS = -40, MAX_LUFS = 0;
  const lufsToY = (v: number) => PAD.t + (1 - (v - MIN_LUFS) / (MAX_LUFS - MIN_LUFS)) * cH;
  const idxToX = (i: number) => PAD.l + (i / Math.max(1, N - 1)) * cW;

  // Grid
  [-3, -9, -14, -18, -23, -35].forEach(db => {
    const y = lufsToY(db);
    if (y < PAD.t || y > PAD.t + cH) return;
    ctx.strokeStyle = db === -14 ? 'rgba(34,211,238,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = db === -14 ? 1 : 0.5;
    ctx.setLineDash(db === -14 ? [4, 3] : []);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = db === -14 ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.18)';
    ctx.font = '7px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${db}`, PAD.l - 4, y + 3);
  });

  // Target label
  ctx.fillStyle = 'rgba(34,211,238,0.4)';
  ctx.font = '6px monospace'; ctx.textAlign = 'left';
  ctx.fillText('target', PAD.l + 2, lufsToY(-14) - 3);

  // Short-term fill
  if (shortTermLufs.length > 1) {
    ctx.beginPath();
    ctx.moveTo(idxToX(0), lufsToY(Math.max(MIN_LUFS, shortTermLufs[0])));
    for (let i = 1; i < N; i++) {
      ctx.lineTo(idxToX(i), lufsToY(Math.max(MIN_LUFS, shortTermLufs[i])));
    }
    ctx.lineTo(idxToX(N - 1), PAD.t + cH);
    ctx.lineTo(idxToX(0), PAD.t + cH);
    ctx.closePath();
    const stGrad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
    stGrad.addColorStop(0, 'rgba(168,85,247,0.3)');
    stGrad.addColorStop(1, 'rgba(168,85,247,0.0)');
    ctx.fillStyle = stGrad;
    ctx.fill();
  }

  // Momentary line
  if (momentaryLufs.length > 1) {
    ctx.beginPath();
    ctx.moveTo(idxToX(0), lufsToY(Math.max(MIN_LUFS, momentaryLufs[0])));
    for (let i = 1; i < N; i++) {
      ctx.lineTo(idxToX(i), lufsToY(Math.max(MIN_LUFS, momentaryLufs[i])));
    }
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Time axis labels
  if (N > 0) {
    [0, 0.25, 0.5, 0.75, 1].forEach(pct => {
      const x = PAD.l + pct * cW;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '7px monospace'; ctx.textAlign = 'center';
      // approximate time
    });
  }
}

function lufsColor(lufs: number, target = -14): string {
  const diff = Math.abs(lufs - target);
  if (diff <= 1) return NOTE_COLORS.good;
  if (diff <= 3) return NOTE_COLORS.warn;
  return NOTE_COLORS.bad;
}

export const LoudnessMeter: React.FC<LoudnessMeterProps> = ({ buffer, onClose }) => {
  const [result, setResult] = useState<LoudnessResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analyze = useCallback(async () => {
    if (!buffer) return;
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 10));
    const res = analyzeLoudness(buffer);
    setResult(res);
    setAnalyzing(false);
  }, [buffer]);

  useEffect(() => {
    if (result && canvasRef.current) {
      drawMeter(canvasRef.current, result.momentaryLufs, result.shortTermLufs);
    }
  }, [result]);

  const i = result?.integratedLufs ?? -70;
  const s = result ? result.shortTermLufs[result.shortTermLufs.length - 1] ?? -70 : -70;
  const m = result ? result.momentaryLufs[result.momentaryLufs.length - 1] ?? -70 : -70;

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
            <h2 className="text-sm font-bold text-white">Loudness Meter</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">ITU-R BS.1770-4 ‚Ämomentary / short-term / integrated ¬LRA ¬true peak</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}
          {buffer && (
            <>
              <button onClick={analyze} disabled={analyzing}
                className="w-full py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {analyzing ? '‚èMeasuring loudness‚Ä¶' : 'üìMeasure Loudness'}
              </button>

              {/* Chart */}
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <canvas ref={canvasRef} width={460} height={160} className="w-full" style={{ background: '#0a0f1a' }} />
              </div>
              {result && (
                <p className="text-[7px] text-slate-700 text-center -mt-2">
                  Cyan = momentary (400ms) ¬Purple fill = short-term (3s) ¬Dashed = -14 LUFS target
                </p>
              )}

              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    {/* Main readouts */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Integrated', value: i, suffix: 'LUFS' },
                        { label: 'Short-term', value: s, suffix: 'LUFS' },
                        { label: 'Momentary',  value: m, suffix: 'LUFS' },
                      ].map(({ label, value, suffix }) => (
                        <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                          <p className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</p>
                          <p className="text-xl font-bold font-mono" style={{ color: lufsColor(value) }}>
                            {value > -69 ? value.toFixed(1) : '‚Äî'}
                          </p>
                          <p className="text-[7px] text-slate-700">{suffix}</p>
                        </div>
                      ))}
                    </div>

                    {/* Secondary stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Loudness Range (LRA)</p>
                        <p className="text-xl font-bold font-mono text-white">{result.lra.toFixed(1)} LU</p>
                        <p className="text-[7px] mt-0.5" style={{ color: result.lra > 15 ? '#f59e0b' : result.lra < 4 ? '#ef4444' : '#10b981' }}>
                          {result.lra > 15 ? 'Very dynamic' : result.lra < 4 ? 'Over-compressed' : 'Good range'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">True Peak</p>
                        <p className="text-xl font-bold font-mono" style={{ color: result.truePeak > -1 ? '#ef4444' : '#10b981' }}>
                          {result.truePeak.toFixed(1)} dBTP
                        </p>
                        <p className="text-[7px] mt-0.5" style={{ color: result.truePeak > -1 ? '#ef4444' : '#64748b' }}>
                          {result.truePeak > -1 ? 'Above -1 dBTP limit' : 'Compliant'}
                        </p>
                      </div>
                    </div>

                    {/* Target comparison */}
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                      <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-3">Platform compliance</p>
                      {[
                        { name: 'Spotify',      target: -14 },
                        { name: 'Apple Music',  target: -16 },
                        { name: 'YouTube',      target: -14 },
                        { name: 'SoundCloud',   target: -11 },
                      ].map(({ name, target }) => {
                        const diff = i - target;
                        const compliant = Math.abs(diff) <= 1;
                        return (
                          <div key={name} className="flex items-center gap-3">
                            <span className="text-[8px] text-slate-500 w-20">{name}</span>
                            <span className="text-[8px] font-mono text-slate-600 w-10">{target} L</span>
                            <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{
                                width: `${Math.min(100, (1 - Math.min(1, Math.abs(diff) / 6)) * 100)}%`,
                                background: compliant ? '#10b981' : Math.abs(diff) <= 3 ? '#f59e0b' : '#ef4444',
                              }} />
                            </div>
                            <span className="text-[8px] font-mono w-14 text-right" style={{ color: compliant ? '#10b981' : '#f59e0b' }}>
                              {diff > 0.05 ? `+${diff.toFixed(1)} LU` : diff < -0.05 ? `${diff.toFixed(1)} LU` : '‚úOK'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
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
