/**
 * DynamicRangeEnhancerPanel ‚ÄRestore punch to over-compressed mixes
 *
 * Uses downward expansion to increase dynamic range without changing peak level.
 * Shows before/after LU comparison and waveform.
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { applyDynamicRangeEnhancement, DRE_PRESETS, DynamicRangeEnhancerOptions } from '../services/dynamicRangeEnhancer';

interface Props { buffer: AudioBuffer | null; onClose: () => void; }

function cloneBuffer(src: AudioBuffer): AudioBuffer {
  const dst = new AudioBuffer({ length: src.length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let ch = 0; ch < src.numberOfChannels; ch++) dst.getChannelData(ch).set(src.getChannelData(ch));
  return dst;
}

function rmsLufs(buf: AudioBuffer): number {
  const L = buf.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < L.length; i++) sum += L[i] * L[i];
  const rms = Math.sqrt(sum / L.length);
  return rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -70;
}

function drawWave(canvas: HTMLCanvasElement, buf: AudioBuffer, color: string) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  ctx.fillStyle = color + '99';
  for (let x = 0; x < W; x++) {
    let max = 0;
    for (let i = x * step; i < (x + 1) * step && i < data.length; i++) if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    const h = max * H / 2;
    ctx.fillRect(x, H / 2 - h, 1, h * 2);
  }
}

function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const nc = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const ab = new ArrayBuffer(44 + n * nc * 2); const v = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, ab.byteLength - 8, true); ws(8, 'WAVE');
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, n * nc * 2, true);
  const out = new Int16Array(ab, 44);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < nc; ch++) {
    const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i]));
    out[i * nc + ch] = s < 0 ? s * 32768 : s * 32767;
  }
  return ab;
}

export const DynamicRangeEnhancerPanel: React.FC<Props> = ({ buffer, onClose }) => {
  const [preset, setPreset] = useState<string>('Gentle restore');
  const [opts, setOpts] = useState<DynamicRangeEnhancerOptions>(DRE_PRESETS['Gentle restore']);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ buf: AudioBuffer; gainLu: number; expandedPct: number } | null>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef  = useRef<HTMLCanvasElement>(null);

  const loadPreset = useCallback((name: string) => {
    setPreset(name);
    setOpts({ ...DRE_PRESETS[name] });
    setResult(null);
  }, []);

  const process = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    await new Promise(r => setTimeout(r, 10));
    const copy = cloneBuffer(buffer);
    const res = applyDynamicRangeEnhancement(copy, opts);
    setResult({ buf: copy, gainLu: res.dynamicRangeGainLu, expandedPct: res.expandedPct });
    if (beforeRef.current) drawWave(beforeRef.current, buffer, '#64748b');
    if (afterRef.current)  drawWave(afterRef.current, copy, '#22d3ee');
    setProcessing(false);
  }, [buffer, opts]);

  const exportWav = useCallback(() => {
    if (!result) return;
    const ab = encodeWav(result.buf);
    const blob = new Blob([ab], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'enhanced_dynamics.wav'; a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const beforeLufs = buffer ? rmsLufs(buffer) : null;
  const afterLufs  = result ? rmsLufs(result.buf) : null;

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
            <h2 className="text-sm font-bold text-white">Dynamic Range Enhancer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Upward expansion ‚Ärestore punch to over-compressed mixes</p>
          </div>
          <div className="flex gap-2">
            {result && <button onClick={exportWav} className="text-[9px] text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500/10 transition-all">‚ÜWAV</button>}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}
          {buffer && (
            <>
              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(DRE_PRESETS).map(name => (
                  <button key={name} onClick={() => loadPreset(name)}
                    className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${preset === name ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                    {name}
                  </button>
                ))}
              </div>

              {/* Controls */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                {[
                  { key: 'threshold', label: 'Threshold (dBFS)', min: -40, max: -6,  step: 1,   fmt: (v: number) => `${v} dB` },
                  { key: 'ratio',     label: 'Expansion ratio',  min: 1.0, max: 3.0, step: 0.1, fmt: (v: number) => `1:${v.toFixed(1)}` },
                  { key: 'attackMs',  label: 'Attack (ms)',      min: 1,   max: 50,  step: 1,   fmt: (v: number) => `${v} ms` },
                  { key: 'releaseMs', label: 'Release (ms)',     min: 20,  max: 500, step: 10,  fmt: (v: number) => `${v} ms` },
                  { key: 'mix',       label: 'Dry/wet',          min: 0,   max: 1,   step: 0.05,fmt: (v: number) => `${Math.round(v * 100)}%` },
                ].map(({ key, label, min, max, step, fmt }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[8px] text-slate-600 w-24 flex-shrink-0">{label}</span>
                    <input type="range" min={min} max={max} step={step}
                      value={(opts as Record<string, number>)[key] ?? min}
                      onChange={e => { setOpts(o => ({ ...o, [key]: Number(e.target.value) })); setResult(null); }}
                      className="flex-1 accent-cyan-400 h-1" />
                    <span className="text-[8px] font-mono text-slate-400 w-12 text-right">
                      {fmt((opts as Record<string, number>)[key] ?? min)}
                    </span>
                  </div>
                ))}
                {/* Band selector */}
                <div className="flex items-center gap-3">
                  <span className="text-[8px] text-slate-600 w-24 flex-shrink-0">Bands</span>
                  <div className="flex gap-1.5">
                    {(['all', 'bass', 'mid', 'high'] as const).map(b => (
                      <button key={b} onClick={() => { setOpts(o => ({ ...o, bands: b })); setResult(null); }}
                        className={`text-[8px] px-2 py-0.5 rounded border transition-all ${opts.bands === b ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={process} disabled={processing}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/15 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {processing ? '‚è≥ Enhancing dynamics‚Ä¶' : 'üíEnhance Dynamic Range'}
              </button>

              {/* Waveform comparison */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { ref: beforeRef, label: 'Before', lufs: beforeLufs },
                  { ref: afterRef,  label: 'After',  lufs: afterLufs  },
                ].map(({ ref, label, lufs }) => (
                  <div key={label} className="rounded-xl overflow-hidden border border-white/[0.06]">
                    <div className="px-2 pt-1.5 pb-0.5 flex items-center justify-between">
                      <p className="text-[7px] text-slate-700">{label}</p>
                      {lufs && <p className="text-[7px] font-mono text-slate-600">{lufs.toFixed(1)} LUFS</p>}
                    </div>
                    <canvas ref={ref} width={220} height={48} className="w-full" style={{ background: '#0a0f1a' }} />
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-center">
                      <p className="text-[7px] text-emerald-600 uppercase tracking-widest">DR gained</p>
                      <p className="text-2xl font-bold text-emerald-400">+{result.gainLu} LU</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                      <p className="text-[7px] text-slate-600 uppercase tracking-widest">Expanded</p>
                      <p className="text-2xl font-bold text-white">{result.expandedPct}%</p>
                      <p className="text-[7px] text-slate-700">of signal</p>
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
