/**
 * SpectralBalanceAnalyzer �Real-time frequency balance vs genre targets
 *
 * Analyzes the loaded buffer's average spectral energy per octave band
 * and compares it against genre-specific target curves.
 *
 * Bands: Sub (20-60), Bass (60-250), Low-mid (250-500), Mid (500-2k),
 *        Upper-mid (2k-6k), Presence (6k-12k), Air (12k-20k)
 *
 * Genres: Pop, Hip-Hop, Electronic/EDM, Rock, Jazz, Classical, Lo-Fi
 *
 * Shows:
 * - Horizontal bar chart comparing mix vs target per band
 * - Difference arrows (too much / too little)
 * - Suggested EQ moves
 * - Overall balance score 0-100
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SpectralBalanceAnalyzerProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

interface Band {
  name: string;
  low: number;
  high: number;
  color: string;
}

const BANDS: Band[] = [
  { name: 'Sub', low: 20, high: 60, color: '#7c3aed' },
  { name: 'Bass', low: 60, high: 250, color: '#2563eb' },
  { name: 'Low-mid', low: 250, high: 500, color: '#0891b2' },
  { name: 'Mid', low: 500, high: 2000, color: '#059669' },
  { name: 'Upper-mid', low: 2000, high: 6000, color: '#d97706' },
  { name: 'Presence', low: 6000, high: 12000, color: '#dc2626' },
  { name: 'Air', low: 12000, high: 20000, color: '#db2777' },
];

// Normalized target energy per band (relative, sums to 1 roughly)
const GENRE_TARGETS: Record<string, number[]> = {
  'Pop':         [0.06, 0.20, 0.14, 0.22, 0.20, 0.12, 0.06],
  'Hip-Hop':     [0.10, 0.28, 0.14, 0.18, 0.16, 0.09, 0.05],
  'EDM':         [0.12, 0.26, 0.12, 0.18, 0.18, 0.09, 0.05],
  'Rock':        [0.05, 0.18, 0.16, 0.24, 0.22, 0.10, 0.05],
  'Jazz':        [0.04, 0.14, 0.18, 0.26, 0.22, 0.11, 0.05],
  'Classical':   [0.03, 0.12, 0.17, 0.26, 0.24, 0.13, 0.05],
  'Lo-Fi':       [0.07, 0.22, 0.16, 0.22, 0.17, 0.10, 0.06],
  'R&B':         [0.08, 0.24, 0.15, 0.20, 0.18, 0.10, 0.05],
  'Country':     [0.04, 0.16, 0.17, 0.25, 0.22, 0.11, 0.05],
};

async function analyzeBands(buffer: AudioBuffer): Promise<number[]> {
  const fftSize = 8192;
  const offCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const src = offCtx.createBufferSource();
  src.buffer = buffer;

  const analyser = offCtx.createAnalyser();
  analyser.fftSize = fftSize;
  src.connect(analyser);
  analyser.connect(offCtx.destination);
  src.start(0);

  await offCtx.startRendering();

  const data = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(data);

  const sr = buffer.sampleRate;
  const binWidth = sr / fftSize;

  const bandEnergies = BANDS.map(band => {
    const lowBin = Math.floor(band.low / binWidth);
    const highBin = Math.min(Math.ceil(band.high / binWidth), data.length - 1);
    let sum = 0; let count = 0;
    for (let i = lowBin; i <= highBin; i++) {
      const linear = Math.pow(10, data[i] / 20);
      sum += linear; count++;
    }
    return count > 0 ? sum / count : 0;
  });

  // Normalize to 0-1
  const total = bandEnergies.reduce((a, b) => a + b, 0) || 1;
  return bandEnergies.map(e => e / total);
}

function EQSuggestion({ band, mixLevel, targetLevel, key }: { band: Band; mixLevel: number; targetLevel: number; key?: React.Key }) {
  const diff = mixLevel - targetLevel;
  const absDiff = Math.abs(diff);
  if (absDiff < 0.02) return null;

  const tooMuch = diff > 0;
  const dbEst = (absDiff / 0.1 * 3).toFixed(1);
  const color = tooMuch ? '#f59e0b' : '#22d3ee';
  const arrow = tooMuch ? '↓' : '↑';

  return (
    <div className="flex items-start gap-2 py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-[9px] font-mono flex-shrink-0" style={{ color }}>{arrow}</span>
      <p className="text-[8px] text-slate-500 leading-relaxed">
        <span style={{ color }}>{band.name}</span> is {tooMuch ? 'too loud' : 'too quiet'} �try {tooMuch ? 'cutting' : 'boosting'} ~{dbEst} dB around {band.low < 1000 ? `${band.low}–${band.high}Hz` : `${(band.low / 1000).toFixed(0)}–${(band.high / 1000).toFixed(0)}kHz`}
      </p>
    </div>
  );
}

export const SpectralBalanceAnalyzer: React.FC<SpectralBalanceAnalyzerProps> = ({ buffer, onClose }) => {
  const [genre, setGenre] = useState('Pop');
  const [mixLevels, setMixLevels] = useState<number[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const targets = GENRE_TARGETS[genre];

  const drawBars = useCallback((mix: number[], tgt: number[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width; const H = canvas.height;
    ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);

    const barW = Math.floor((W - 16) / BANDS.length);
    const gap = 4;

    BANDS.forEach((band, i) => {
      const x = 8 + i * barW;
      const maxH = H - 30;

      // Background
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x + gap, 4, barW - gap * 2, maxH);

      // Target bar (ghost)
      const tgtH = tgt[i] * maxH * 3;
      ctx.fillStyle = band.color + '25';
      ctx.fillRect(x + gap, 4 + maxH - Math.min(tgtH, maxH), barW - gap * 2, Math.min(tgtH, maxH));

      // Mix bar
      const mixH = mix[i] * maxH * 3;
      ctx.fillStyle = band.color + 'aa';
      ctx.fillRect(x + gap + 4, 4 + maxH - Math.min(mixH, maxH), barW - gap * 2 - 8, Math.min(mixH, maxH));

      // Difference indicator
      const diff = mix[i] - tgt[i];
      if (Math.abs(diff) > 0.01) {
        ctx.fillStyle = diff > 0 ? '#f59e0b' : '#22d3ee';
        ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(diff > 0 ? '▲' : '▼', x + barW / 2, diff > 0 ? 12 : 10);
      }

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '6px monospace'; ctx.textAlign = 'center';
      ctx.fillText(band.name.toUpperCase(), x + barW / 2, H - 4);
    });

    // Legend
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '6px monospace'; ctx.textAlign = 'right';
    ctx.fillText('░ target ��mix', W - 8, H - 4);
  }, []);

  useEffect(() => {
    if (mixLevels) drawBars(mixLevels, targets);
  }, [mixLevels, targets, drawBars]);

  const analyze = useCallback(async () => {
    if (!buffer) return;
    setAnalyzing(true);
    const levels = await analyzeBands(buffer);
    setMixLevels(levels);
    setAnalyzing(false);
  }, [buffer]);

  // Balance score: 100 - average normalized deviation
  const score = mixLevels ? Math.round(100 - targets.reduce((s, t, i) => {
    return s + Math.abs((mixLevels[i] - t) / t) * 100;
  }, 0) / BANDS.length) : null;

  const scoreColor = score == null ? '#64748b' : score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

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
            <h2 className="text-sm font-bold text-white">Spectral Balance</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Compare mix energy per band vs genre target curves</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Genre selector */}
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(GENRE_TARGETS).map(g => (
                  <button key={g} onClick={() => setGenre(g)}
                    className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${genre === g ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                    {g}
                  </button>
                ))}
              </div>

              <button onClick={analyze} disabled={analyzing}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/15 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {analyzing ? '�Analyzing spectrum…' : `�Analyze vs ${genre}`}
              </button>

              {/* Bar chart */}
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <canvas ref={canvasRef} width={460} height={140} className="w-full" style={{ background: '#0a0f1a' }} />
              </div>

              <AnimatePresence>
                {mixLevels && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    {/* Score */}
                    <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="text-center">
                        <p className="text-[7px] text-slate-600 uppercase tracking-widest">Balance score</p>
                        <p className="text-3xl font-bold font-mono" style={{ color: scoreColor }}>{Math.max(0, score ?? 0)}</p>
                        <p className="text-[7px] mt-0.5" style={{ color: scoreColor }}>
                          {(score ?? 0) >= 80 ? 'Excellent' : (score ?? 0) >= 60 ? 'Good' : 'Needs work'}
                        </p>
                      </div>
                      <div className="flex-1 space-y-1">
                        {BANDS.map((band, i) => {
                          const diff = mixLevels[i] - targets[i];
                          return (
                            <div key={band.name} className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: band.color }} />
                              <span className="text-[7px] text-slate-600 w-16">{band.name}</span>
                              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${Math.min(100, mixLevels[i] / targets[i] * 100)}%`,
                                  background: Math.abs(diff) < 0.02 ? '#10b981' : diff > 0 ? '#f59e0b' : '#22d3ee',
                                }} />
                              </div>
                              <span className="text-[7px] font-mono w-8 text-right" style={{ color: Math.abs(diff) < 0.02 ? '#64748b' : diff > 0 ? '#f59e0b' : '#22d3ee' }}>
                                {diff > 0.005 ? '↑' : diff < -0.005 ? '↓' : '✓'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* EQ suggestions */}
                    {BANDS.some((band, i) => Math.abs(mixLevels[i] - targets[i]) >= 0.02) && (
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-0">
                        <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-2">Suggested EQ moves</p>
                        {BANDS.map((band, i) => (
                          <EQSuggestion key={band.name} band={band} mixLevel={mixLevels[i]} targetLevel={targets[i]} />
                        ))}
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
