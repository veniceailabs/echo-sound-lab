/**
 * TapeSaturationPanel ‚ÄAnalog tape machine emulation UI
 *
 * Controls: drive, even/odd harmonics, HF rolloff, head bump, flutter, mix.
 * Shows before/after waveform, harmonic level, saturation meter.
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { applyTapeSaturation, TAPE_PRESETS, TapeSaturationOptions, TapeResult } from '../services/tapeSaturation';

interface Props { buffer: AudioBuffer | null; onClose: () => void; }

function cloneBuffer(src: AudioBuffer): AudioBuffer {
  const dst = new AudioBuffer({ length: src.length, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let ch = 0; ch < src.numberOfChannels; ch++) dst.getChannelData(ch).set(src.getChannelData(ch));
  return dst;
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

export const TapeSaturationPanel: React.FC<Props> = ({ buffer, onClose }) => {
  const [preset, setPreset] = useState('Vintage tape');
  const [opts, setOpts] = useState<TapeSaturationOptions>({ ...TAPE_PRESETS['Vintage tape'] });
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ buf: AudioBuffer; stats: TapeResult } | null>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef  = useRef<HTMLCanvasElement>(null);

  const loadPreset = useCallback((name: string) => {
    setPreset(name);
    setOpts({ ...TAPE_PRESETS[name] });
    setResult(null);
  }, []);

  const process = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    await new Promise(r => setTimeout(r, 16));
    const copy = cloneBuffer(buffer);
    const stats = applyTapeSaturation(copy, opts);
    setResult({ buf: copy, stats });
    if (beforeRef.current) drawWave(beforeRef.current, buffer, '#64748b');
    if (afterRef.current)  drawWave(afterRef.current, copy, '#f59e0b');
    setProcessing(false);
  }, [buffer, opts]);

  const exportWav = useCallback(() => {
    if (!result) return;
    const blob = new Blob([encodeWav(result.buf)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tape_saturated.wav'; a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const controls: Array<{ key: keyof TapeSaturationOptions; label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = [
    { key: 'drive',         label: 'Drive',              min: 0.5, max: 8,   step: 0.1, fmt: v => v.toFixed(1) },
    { key: 'evenHarmonics', label: '2nd Harmonic',       min: 0,   max: 0.3, step: 0.01,fmt: v => `${Math.round(v * 100)}%` },
    { key: 'oddHarmonics',  label: '3rd Harmonic',       min: 0,   max: 0.2, step: 0.01,fmt: v => `${Math.round(v * 100)}%` },
    { key: 'hfRolloff',     label: 'HF Rolloff',         min: 0,   max: 1,   step: 0.05,fmt: v => `${Math.round(v * 100)}%` },
    { key: 'headBumpDb',    label: 'Head Bump (80Hz)',   min: 0,   max: 4,   step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
    { key: 'flutterRate',   label: 'Flutter Rate',       min: 0,   max: 4,   step: 0.1, fmt: v => v === 0 ? 'Off' : `${v.toFixed(1)} Hz` },
    { key: 'outputGainDb',  label: 'Output Gain',        min: -6,  max: 6,   step: 0.5, fmt: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB` },
    { key: 'mix',           label: 'Dry / Wet',          min: 0,   max: 1,   step: 0.05,fmt: v => `${Math.round(v * 100)}%` },
  ];

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
            <h2 className="text-sm font-bold text-white">Tape Saturation</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Analog tape emulation ¬sigmoid saturation ¬harmonics ¬flutter</p>
          </div>
          <div className="flex gap-2">
            {result && <button onClick={exportWav} className="text-[9px] text-amber-400 border border-amber-500/30 px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-all">‚ÜWAV</button>}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first.</p>}
          {buffer && (
            <>
              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(TAPE_PRESETS).map(name => (
                  <button key={name} onClick={() => loadPreset(name)}
                    className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${preset === name ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                    {name}
                  </button>
                ))}
              </div>

              {/* Controls */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                {controls.map(({ key, label, min, max, step, fmt }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[8px] text-slate-600 w-28 flex-shrink-0">{label}</span>
                    <input type="range" min={min} max={max} step={step}
                      value={(opts[key] as number) ?? min}
                      onChange={e => { setOpts(o => ({ ...o, [key]: Number(e.target.value) })); setResult(null); }}
                      className="flex-1 accent-amber-400 h-1" />
                    <span className="text-[8px] font-mono text-slate-400 w-14 text-right">
                      {fmt((opts[key] as number) ?? min)}
                    </span>
                  </div>
                ))}
              </div>

              <button onClick={process} disabled={processing}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/15 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {processing ? '‚è≥ Processing‚Ä¶' : 'üéApply Tape Saturation'}
              </button>

              {/* Waveform comparison */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { ref: beforeRef, label: 'Before', active: true },
                  { ref: afterRef,  label: 'After',  active: !!result },
                ].map(({ ref, label, active }) => (
                  <div key={label} className="rounded-xl overflow-hidden border border-white/[0.06]">
                    <p className="text-[7px] text-slate-700 px-2 pt-1.5">{label}</p>
                    <canvas ref={ref} width={220} height={48} className="w-full" style={{ background: '#0a0f1a' }} />
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {result && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-center">
                      <p className="text-[7px] text-amber-600 uppercase tracking-widest">Saturation</p>
                      <p className="text-xl font-bold text-amber-400">{Math.round(result.stats.saturationLevel * 100)}%</p>
                    </div>
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-3 text-center">
                      <p className="text-[7px] text-orange-600 uppercase tracking-widest">Harmonics</p>
                      <p className="text-xl font-bold text-orange-300">{result.stats.harmonicsAdded.toFixed(0)} dB</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                      <p className="text-[7px] text-slate-600 uppercase tracking-widest">Output Peak</p>
                      <p className="text-xl font-bold text-white">{result.stats.outputPeak.toFixed(1)}</p>
                      <p className="text-[7px] text-slate-700">dBFS</p>
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
