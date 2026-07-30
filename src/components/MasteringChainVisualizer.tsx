/**
 * MasteringChainVisualizer â€Live EQ curve of what the mastering chain actually does
 *
 * Shows the cumulative frequency response added by the mastering chain for
 * the selected genre: genre-adaptive EQ + dynamic EQ envelope + psychoacoustic
 * enhancement. Drawn as a smooth SVG curve on a logarithmic frequency axis.
 *
 * Bands visualized:
 *   20Hz â†20kHz, 512 log-spaced points
 *
 * Color coding:
 *   Boost = cyan glow    Cut = amber glow    Neutral = white dim
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface MasteringChainVisualizerProps {
  genre?: string;
  targetLufs?: number;
  onClose: () => void;
}

// Match the GENRE_EQ_CURVES from grammyMasterService
const GENRE_EQ_CURVES: Record<string, [number, number, number, number]> = {
  hip_hop:    [ 2.5, -2.5, 380, 1.0],
  trap:       [ 3.0, -2.0, 350, 0.5],
  pop:        [ 1.5, -1.5, 330, 1.5],
  rnb:        [ 2.0, -1.5, 350, 1.0],
  rock:       [ 1.0, -2.0, 400, 1.5],
  electronic: [ 2.0, -1.0, 300, 2.0],
  jazz:       [ 0.5, -1.0, 300, 0.5],
  classical:  [ 0.0, -0.5, 280, 0.5],
  default:    [ 1.5, -1.5, 330, 1.0],
};

const GENRE_LABELS: Record<string, string> = {
  hip_hop: 'Hip-Hop', trap: 'Trap', pop: 'Pop', rnb: 'R&B',
  rock: 'Rock', electronic: 'EDM', jazz: 'Jazz', classical: 'Classical', default: 'Default',
};

/** Evaluate a shelving EQ at frequency f */
function lowShelfResponse(f: number, fc: number, gainDb: number): number {
  if (gainDb === 0) return 0;
  // Magnitude approximation: 1st-order shelf
  const ratio = f / fc;
  const A = Math.pow(10, gainDb / 20);
  // Approximate magnitude (not exact biquad, but visually faithful)
  const mag = gainDb > 0
    ? gainDb * (1 / (1 + ratio * ratio))
    : gainDb * (1 / (1 + 1 / (ratio * ratio)));
  return mag;
}

function highShelfResponse(f: number, fc: number, gainDb: number): number {
  if (gainDb === 0) return 0;
  const ratio = fc / f;
  const mag = gainDb > 0
    ? gainDb * (1 / (1 + ratio * ratio))
    : gainDb * (1 / (1 + 1 / (ratio * ratio)));
  return mag;
}

function peakResponse(f: number, fc: number, gainDb: number, Q: number): number {
  if (gainDb === 0) return 0;
  // Simple peak magnitude approximation
  const ratio = f / fc;
  const denom = 1 + Q * Q * (ratio - 1 / ratio) * (ratio - 1 / ratio);
  return gainDb / denom;
}

function computeCurve(genre: string, _targetLufs: number): Float32Array {
  const key = genre.toLowerCase().replace(/[^a-z_]/g, '') || 'default';
  const [bassBoost, midCut, midFreq, airGain] = GENRE_EQ_CURVES[key] ?? GENRE_EQ_CURVES.default;

  const N = 512;
  const curve = new Float32Array(N);
  const minF = 20, maxF = 20000;

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const f = minF * Math.pow(maxF / minF, t);

    let db = 0;

    // Genre-adaptive bass shelf (~80Hz)
    db += lowShelfResponse(f, 80, bassBoost);

    // Genre-adaptive mid cut (~midFreq)
    db += peakResponse(f, midFreq, midCut, 0.8);

    // Genre-adaptive air shelf (~8kHz)
    db += highShelfResponse(f, 8000, airGain * 0.6);

    // Dynamic EQ de-mud region (250-500Hz, up to -1.5dB)
    db += peakResponse(f, 375, -1.5, 1.2);

    // Dynamic EQ de-harsh region (4kHz, up to -1dB)
    db += peakResponse(f, 4000, -1.0, 1.5);

    // Psychoacoustic sub-bass (+1.5dB at 60Hz â€moderate depth assumption)
    db += lowShelfResponse(f, 60, 1.5);

    // Psychoacoustic presence (+0.8dB at 3.5kHz)
    db += peakResponse(f, 3500, 0.8, 1.5);

    // Psychoacoustic air (+0.5dB at 12kHz)
    db += highShelfResponse(f, 12000, 0.5);

    curve[i] = db;
  }

  return curve;
}

function drawCurve(
  canvas: HTMLCanvasElement,
  curve: Float32Array,
  genre: string,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, W, H);

  const N = curve.length;
  const PAD = { t: 20, b: 30, l: 40, r: 16 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const DB_RANGE = 8; // Â±8dB display range
  const dbToY = (db: number) => PAD.t + (1 - (db + DB_RANGE) / (DB_RANGE * 2)) * cH;
  const idxToX = (i: number) => PAD.l + (i / (N - 1)) * cW;

  // Grid lines
  ctx.lineWidth = 0.5;
  [-6, -3, 0, 3, 6].forEach(db => {
    const y = dbToY(db);
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '8px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, PAD.l - 4, y + 3);
  });

  // Frequency gridlines
  [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => {
    const i = Math.round((Math.log(f / 20) / Math.log(1000)) * (N - 1));
    const x = idxToX(Math.max(0, Math.min(N - 1, i)));
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - PAD.b + 10);
  });

  // 0dB line label
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '7px monospace'; ctx.textAlign = 'left';
  ctx.fillText('Hz', W - PAD.r, H - PAD.b + 10);

  // Fill below/above 0dB
  const zeroY = dbToY(0);

  // Positive fill (boost = cyan)
  ctx.beginPath();
  ctx.moveTo(idxToX(0), zeroY);
  for (let i = 0; i < N; i++) {
    ctx.lineTo(idxToX(i), dbToY(Math.max(0, curve[i])));
  }
  ctx.lineTo(idxToX(N - 1), zeroY);
  ctx.closePath();
  const boostGrad = ctx.createLinearGradient(0, PAD.t, 0, zeroY);
  boostGrad.addColorStop(0, 'rgba(34,211,238,0.3)');
  boostGrad.addColorStop(1, 'rgba(34,211,238,0.0)');
  ctx.fillStyle = boostGrad;
  ctx.fill();

  // Negative fill (cut = amber)
  ctx.beginPath();
  ctx.moveTo(idxToX(0), zeroY);
  for (let i = 0; i < N; i++) {
    ctx.lineTo(idxToX(i), dbToY(Math.min(0, curve[i])));
  }
  ctx.lineTo(idxToX(N - 1), zeroY);
  ctx.closePath();
  const cutGrad = ctx.createLinearGradient(0, zeroY, 0, H - PAD.b);
  cutGrad.addColorStop(0, 'rgba(245,158,11,0.0)');
  cutGrad.addColorStop(1, 'rgba(245,158,11,0.25)');
  ctx.fillStyle = cutGrad;
  ctx.fill();

  // Main curve line
  ctx.beginPath();
  ctx.moveTo(idxToX(0), dbToY(curve[0]));
  for (let i = 1; i < N; i++) {
    ctx.lineTo(idxToX(i), dbToY(curve[i]));
  }
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Genre label
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
  ctx.fillText(GENRE_LABELS[genre] ?? genre.toUpperCase(), PAD.l + 4, PAD.t + 10);
}

const ALL_GENRES = Object.keys(GENRE_EQ_CURVES);

export const MasteringChainVisualizer: React.FC<MasteringChainVisualizerProps> = ({
  genre: initialGenre = 'default',
  targetLufs = -14,
  onClose,
}) => {
  const [genre, setGenre] = useState(initialGenre);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    const curve = computeCurve(genre, targetLufs);
    drawCurve(canvasRef.current, curve, genre);
  }, [genre, targetLufs]);

  useEffect(() => { redraw(); }, [redraw]);

  const curve = computeCurve(genre, targetLufs);
  const peakBoostDb = Math.max(...Array.from(curve)).toFixed(1);
  const peakCutDb   = Math.min(...Array.from(curve)).toFixed(1);
  const maxFreq = 20 * Math.pow(1000, Array.from(curve).indexOf(Math.max(...Array.from(curve))) / 511);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Mastering Chain EQ Curve</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Cumulative response: genre EQ + dynamic EQ + psychoacoustic enhancement</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Genre selector */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_GENRES.map(g => (
              <button key={g} onClick={() => setGenre(g)}
                className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${genre === g ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                {GENRE_LABELS[g] ?? g}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div className="rounded-xl overflow-hidden border border-white/[0.06]">
            <canvas ref={canvasRef} width={520} height={180} className="w-full" style={{ background: '#0a0f1a' }} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 text-center">
              <p className="text-[7px] text-cyan-600 uppercase tracking-widest">Peak boost</p>
              <p className="text-lg font-bold font-mono text-cyan-300">+{peakBoostDb} dB</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-center">
              <p className="text-[7px] text-amber-600 uppercase tracking-widest">Max cut</p>
              <p className="text-lg font-bold font-mono text-amber-300">{peakCutDb} dB</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
              <p className="text-[7px] text-slate-600 uppercase tracking-widest">LUFS target</p>
              <p className="text-lg font-bold font-mono text-white">{targetLufs}</p>
            </div>
          </div>

          {/* Legend */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-3">What each stage adds</p>
            {[
              ['Genre-adaptive EQ', 'Bass shelf + mid cut + air shelf tuned to the selected genre target curve.', '#22d3ee'],
              ['Dynamic EQ', 'Proportional de-muddying at 250-500Hz and de-harshening at 3-6kHz. Cuts only.', '#f59e0b'],
              ['Psychoacoustic EQ', 'Fletcher-Munson compensation: restores sub-bass and presence lost at lower volumes.', '#a855f7'],
            ].map(([title, desc, color]) => (
              <div key={title} className="flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: color }} />
                <div>
                  <p className="text-[9px] font-medium text-slate-400">{title}</p>
                  <p className="text-[8px] text-slate-600 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
