/**
 * AudioIntelligencePanel �BPM, Key, Chromagram, and Loudness Timeline
 *
 * A single panel that shows everything you need to know about a track
 * before you start working on it. Runs in seconds, no external APIs.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeAudio, FullAnalysisResult, LoudnessBlock } from '../services/audioAnalysis';

interface AudioIntelligencePanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Colour for LUFS value
function lufsColor(lufs: number): string {
  if (lufs > -8) return '#f87171';   // too hot
  if (lufs > -14) return '#fbbf24';  // loud
  if (lufs > -23) return '#22d3ee';  // good range
  return '#6b7280';                   // quiet
}

// ─── Chromagram component ─────────────────────────────────────────────────────
function Chromagram({ chroma, root }: { chroma: number[]; root: string }) {
  const rootIdx = NOTE_NAMES.indexOf(root);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {chroma.map((val, i) => {
        const isRoot = i === rootIdx;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <motion.div
              className="w-full rounded-t"
              style={{
                height: `${Math.max(2, val * 36)}px`,
                background: isRoot
                  ? 'linear-gradient(to top, #22d3ee, #a855f7)'
                  : 'rgba(255,255,255,0.12)',
              }}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, val * 36)}px` }}
              transition={{ delay: i * 0.03, duration: 0.4, ease: 'easeOut' }}
            />
            <span
              className={`text-[7px] leading-none ${isRoot ? 'text-cyan-400 font-bold' : 'text-slate-700'}`}
            >
              {NOTE_NAMES[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Loudness Timeline canvas ─────────────────────────────────────────────────
function LoudnessTimeline({ blocks, duration }: { blocks: LoudnessBlock[]; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || blocks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Grid lines at -6, -14, -23 LUFS
    const lufsToY = (lufs: number) => {
      const clamped = Math.max(-60, Math.min(0, lufs));
      return ((0 - clamped) / 60) * height;
    };

    // Background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, width, height);

    // Reference lines
    [{ lufs: -6, color: 'rgba(248,113,113,0.2)', label: '-6' },
     { lufs: -14, color: 'rgba(34,211,238,0.2)', label: '-14' },
     { lufs: -23, color: 'rgba(107,114,128,0.2)', label: '-23' }].forEach(({ lufs, color, label }) => {
      const y = lufsToY(lufs);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color.replace('0.2', '0.5');
      ctx.font = '8px monospace';
      ctx.fillText(label, 4, y - 2);
    });

    // Loudness bars
    const barW = Math.max(1, width / blocks.length);
    blocks.forEach((block, i) => {
      const x = (i / blocks.length) * width;
      const y0 = lufsToY(0);
      const y1 = lufsToY(block.lufs);
      const h = Math.abs(y0 - y1);
      ctx.fillStyle = lufsColor(block.lufs);
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x, Math.min(y0, y1), barW - 0.5, h);
    });
    ctx.globalAlpha = 1;
  }, [blocks]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[9px] text-slate-600 uppercase tracking-widest">Loudness over time</p>
        <div className="flex gap-3">
          {[{ label: 'Too hot', color: '#f87171' }, { label: 'Streaming range', color: '#22d3ee' }, { label: 'Quiet', color: '#6b7280' }].map(d => (
            <div key={d.label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
              <span className="text-[8px] text-slate-600">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={560}
        height={80}
        className="w-full rounded-xl border border-white/[0.04]"
        style={{ height: 80 }}
      />
      <div className="flex justify-between text-[8px] text-slate-700 font-mono">
        <span>0:00</span>
        <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span>
      </div>
    </div>
  );
}

// ─── BPM Tap Tempo ────────────────────────────────────────────────────────────
function TapTempo({ detected }: { detected: number }) {
  const [taps, setTaps] = useState<number[]>([]);
  const [tapBPM, setTapBPM] = useState<number | null>(null);

  const handleTap = useCallback(() => {
    const now = performance.now();
    setTaps(prev => {
      const recent = [...prev, now].filter(t => now - t < 3000);
      if (recent.length >= 2) {
        const intervals = recent.slice(1).map((t, i) => t - recent[i]);
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        setTapBPM(Math.round(60000 / avgInterval));
      }
      return recent.slice(-8);
    });
  }, []);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleTap}
        className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-[10px] text-slate-400 hover:text-white hover:border-cyan-500/30 transition-all active:scale-95"
      >
        Tap
      </button>
      {tapBPM && (
        <span className="text-[11px] font-mono text-cyan-400">{tapBPM} BPM (tapped)</span>
      )}
      {!tapBPM && (
        <span className="text-[10px] text-slate-700">Tap to verify detected BPM</span>
      )}
    </div>
  );
}

// ─── Confidence Pill ─────────────────────────────────────────────────────────
function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : pct >= 45 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-slate-500 bg-white/[0.03] border-white/[0.06]';
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded border font-semibold ${color}`}>
      {pct}% confident
    </span>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export const AudioIntelligencePanel: React.FC<AudioIntelligencePanelProps> = ({ buffer, onClose }) => {
  const [result, setResult] = useState<FullAnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!buffer) return;
    setRunning(true);
    setError(null);
    try {
      setProgress('Detecting tempo…');
      await new Promise(r => setTimeout(r, 20)); // let UI update
      setProgress('Finding musical key…');
      await new Promise(r => setTimeout(r, 20));
      setProgress('Building loudness map…');
      const r = await analyzeAudio(buffer);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setRunning(false);
      setProgress('');
    }
  }, [buffer]);

  // Auto-run on mount if buffer is available
  useEffect(() => {
    if (buffer) runAnalysis();
  }, [buffer, runAnalysis]);

  const bpmColor = result
    ? result.bpm.confidence > 0.6 ? 'text-cyan-300' : 'text-amber-300'
    : 'text-slate-500';

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
            <h2 className="text-sm font-bold text-white">Audio Intelligence</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              BPM �Musical key �Loudness map �extracted from the audio, no guessing
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {running && (
            <div className="text-center py-10 space-y-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                className="w-8 h-8 mx-auto border-2 border-cyan-500/30 border-t-cyan-400 rounded-full"
              />
              <p className="text-[11px] text-slate-400">{progress || 'Analysing…'}</p>
            </div>
          )}

          {!buffer && !running && (
            <div className="text-center py-8">
              <p className="text-amber-400 text-sm">Load a track first</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={runAnalysis} className="mt-3 px-4 py-1.5 rounded-lg bg-white/[0.05] text-slate-400 text-xs hover:text-white transition-all">
                Retry
              </button>
            </div>
          )}

          {result && !running && (
            <>
              {/* BPM + Key row */}
              <div className="grid grid-cols-2 gap-4">
                {/* BPM */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">Tempo</p>
                    <ConfidencePill confidence={result.bpm.confidence} />
                  </div>
                  <motion.p
                    className={`text-5xl font-black tabular-nums leading-none ${bpmColor}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {result.bpm.bpm.toFixed(1)}
                  </motion.p>
                  <p className="text-[10px] text-slate-500">BPM</p>

                  {/* Alternates */}
                  {result.bpm.candidates.length > 1 && (
                    <div className="flex gap-2 pt-1">
                      <p className="text-[9px] text-slate-700">Also possible:</p>
                      {result.bpm.candidates.slice(1, 3).map((c, i) => (
                        <span key={i} className="text-[9px] font-mono text-slate-600">{c}</span>
                      ))}
                    </div>
                  )}

                  <TapTempo detected={result.bpm.bpm} />
                </div>

                {/* Key */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">Musical Key</p>
                    <ConfidencePill confidence={result.key.confidence} />
                  </div>
                  <motion.p
                    className="text-4xl font-black text-white leading-none"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    {result.key.root}
                  </motion.p>
                  <p className="text-[11px] text-slate-400 capitalize">
                    {result.key.mode === 'major' ? '�Major' : '�Minor'}
                  </p>

                  {/* Relative key */}
                  <p className="text-[9px] text-slate-700">
                    {result.key.mode === 'major'
                      ? `Relative minor: ${NOTE_NAMES[(NOTE_NAMES.indexOf(result.key.root) + 9) % 12]} minor`
                      : `Relative major: ${NOTE_NAMES[(NOTE_NAMES.indexOf(result.key.root) + 3) % 12]} major`}
                  </p>

                  {/* Common scales */}
                  <p className="text-[9px] text-slate-700">
                    Compatible keys: {
                      [3, 5, 7, -5, -3].map(offset => {
                        const idx = (NOTE_NAMES.indexOf(result.key.root) + offset + 12) % 12;
                        return NOTE_NAMES[idx];
                      }).join(' �')
                    }
                  </p>
                </div>
              </div>

              {/* Chromagram */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">
                  Pitch class energy (chromagram) �highlighted: root note {result.key.root}
                </p>
                <Chromagram chroma={result.key.chromagram} root={result.key.root} />
                <p className="text-[9px] text-slate-700 leading-relaxed">
                  Shows how much of each of the 12 musical notes appears in the track. Tall bars = that note is used a lot.
                  The cyan bar is the root note of the detected key.
                </p>
              </div>

              {/* Loudness Timeline */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <LoudnessTimeline blocks={result.loudnessTimeline} duration={result.duration} />
                <p className="text-[9px] text-slate-700 leading-relaxed">
                  Each bar is 400ms of audio. Streaming platforms normalize tracks to around −14 LUFS (cyan zone).
                  Red bars are louder than most platforms allow �they'll be turned down automatically.
                </p>
              </div>

              {/* Summary stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  {
                    label: 'Duration',
                    value: `${Math.floor(result.duration / 60)}:${String(Math.floor(result.duration % 60)).padStart(2, '0')}`,
                  },
                  {
                    label: 'Sample Rate',
                    value: `${(result.sampleRate / 1000).toFixed(1)}kHz`,
                  },
                  {
                    label: 'Avg LUFS',
                    value: (() => {
                      const valid = result.loudnessTimeline.filter(b => b.lufs > -60);
                      if (!valid.length) return '—';
                      const avg = valid.reduce((s, b) => s + b.lufs, 0) / valid.length;
                      return `${avg.toFixed(1)}`;
                    })(),
                  },
                  {
                    label: 'Peak LUFS',
                    value: (() => {
                      const maxBlock = result.loudnessTimeline.reduce((a, b) => b.lufs > a.lufs ? b : a, { lufs: -70, timeMs: 0 });
                      return `${maxBlock.lufs.toFixed(1)}`;
                    })(),
                  },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                    <p className="text-[8px] text-slate-700 uppercase tracking-widest">{stat.label}</p>
                    <p className="text-sm font-mono text-slate-300 mt-1">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Re-analyse */}
              <button
                onClick={runAnalysis}
                className="w-full py-2 rounded-xl border border-white/[0.06] text-[10px] text-slate-600 hover:text-slate-300 transition-all"
              >
                Re-analyse
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
