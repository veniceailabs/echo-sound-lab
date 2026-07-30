/**
 * MsDynamicEqPanel �Mid/Side Dynamic EQ
 *
 * Process mid and side channels independently with threshold-triggered
 * gain control per frequency band. Enables mastering moves impossible
 * with standard EQ: mono bass enforcement, center de-essing, side air boost.
 *
 * UI:
 *   - Preset selector (De-mud, De-ess, Mono bass, Air sides, Full vocal)
 *   - Band editor: freq / Q / channel / threshold / maxGain / attack / release
 *   - Before/after waveform comparison
 *   - Preview export as WAV
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { applyMsDynamicEq, MS_DYNAMIC_EQ_PRESETS, MsDynamicEqBand } from '../services/midSideDynamicEq';

interface MsDynamicEqPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

function cloneBuffer(src: AudioBuffer): AudioBuffer {
  const dst = new AudioBuffer({
    length: src.length,
    numberOfChannels: src.numberOfChannels,
    sampleRate: src.sampleRate,
  });
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    dst.getChannelData(ch).set(src.getChannelData(ch));
  }
  return dst;
}

function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const numCh = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const n = buf.length;
  const byteLen = 44 + n * numCh * 2;
  const ab = new ArrayBuffer(byteLen);
  const view = new DataView(ab);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, byteLen - 8, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, n * numCh * 2, true);
  const interleaved = new Int16Array(n * numCh);
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(ch)[i]));
      interleaved[i * numCh + ch] = s < 0 ? s * 32768 : s * 32767;
    }
  }
  new Int16Array(ab, 44).set(interleaved);
  return ab;
}

function drawWaveform(canvas: HTMLCanvasElement, buf: AudioBuffer, color: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0f1a'; ctx.fillRect(0, 0, W, H);
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / W));
  ctx.fillStyle = color + '99';
  for (let x = 0; x < W; x++) {
    let max = 0;
    for (let i = x * step; i < (x + 1) * step && i < data.length; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    const h = max * (H / 2);
    ctx.fillRect(x, H / 2 - h, 1, h * 2);
  }
}

const PRESET_NAMES = Object.keys(MS_DYNAMIC_EQ_PRESETS);
const CHANNEL_OPTIONS: Array<{ value: MsDynamicEqBand['channel']; label: string }> = [
  { value: 'mid',  label: 'Mid' },
  { value: 'side', label: 'Side' },
  { value: 'both', label: 'Both' },
];

export const MsDynamicEqPanel: React.FC<MsDynamicEqPanelProps> = ({ buffer, onClose }) => {
  const [preset, setPreset] = useState<string | null>(null);
  const [bands, setBands] = useState<MsDynamicEqBand[]>([{
    frequency: 350, Q: 0.8, channel: 'mid',
    threshold: -30, maxGainDb: -3, attackMs: 8, releaseMs: 100,
  }]);
  const [mix, setMix] = useState(1.0);
  const [processing, setProcessing] = useState(false);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef  = useRef<HTMLCanvasElement>(null);

  const loadPreset = useCallback((name: string) => {
    setPreset(name);
    setBands([...MS_DYNAMIC_EQ_PRESETS[name].bands]);
    setMix(MS_DYNAMIC_EQ_PRESETS[name].mix ?? 1.0);
    setProcessedBuffer(null);
  }, []);

  const process = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    await new Promise(r => setTimeout(r, 10));
    const copy = cloneBuffer(buffer);
    applyMsDynamicEq(copy, { bands, mix });
    setProcessedBuffer(copy);
    if (beforeRef.current) drawWaveform(beforeRef.current, buffer, '#64748b');
    if (afterRef.current)  drawWaveform(afterRef.current,  copy,   '#22d3ee');
    setProcessing(false);
  }, [buffer, bands, mix]);

  const exportWav = useCallback(() => {
    if (!processedBuffer) return;
    const ab = encodeWav(processedBuffer);
    const blob = new Blob([ab], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ms_dynamic_eq.wav'; a.click();
    URL.revokeObjectURL(url);
  }, [processedBuffer]);

  const updateBand = useCallback((idx: number, key: keyof MsDynamicEqBand, value: number | string) => {
    setBands(prev => prev.map((b, i) => i === idx ? { ...b, [key]: value } : b));
    setProcessedBuffer(null);
  }, []);

  const addBand = useCallback(() => {
    setBands(prev => [...prev, { frequency: 1000, Q: 1.0, channel: 'mid', threshold: -30, maxGainDb: -2, attackMs: 5, releaseMs: 80 }]);
  }, []);

  const removeBand = useCallback((idx: number) => {
    setBands(prev => prev.filter((_, i) => i !== idx));
    setProcessedBuffer(null);
  }, []);

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
            <h2 className="text-sm font-bold text-white">M/S Dynamic EQ</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Threshold-triggered EQ on mid and side channels independently</p>
          </div>
          <div className="flex gap-2">
            {processedBuffer && (
              <button onClick={exportWav} className="text-[9px] text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500/10 transition-all">�WAV</button>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}
          {buffer && (
            <>
              {/* Presets */}
              <div>
                <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-2">Presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_NAMES.map(name => (
                    <button key={name} onClick={() => loadPreset(name)}
                      className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${preset === name ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Band editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[8px] text-slate-600 uppercase tracking-widest">Bands</p>
                  <button onClick={addBand} className="text-[8px] text-slate-600 hover:text-cyan-400 transition-colors">+ Add band</button>
                </div>
                {bands.map((band, idx) => (
                  <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-mono text-slate-500">Band {idx + 1}</span>
                      {bands.length > 1 && (
                        <button onClick={() => removeBand(idx)} className="text-[8px] text-slate-700 hover:text-red-400 transition-colors">✕</button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {/* Freq */}
                      <div>
                        <label className="text-[7px] text-slate-700 block mb-1">Freq (Hz)</label>
                        <input type="number" min="20" max="20000" step="10" value={band.frequency}
                          onChange={e => updateBand(idx, 'frequency', Number(e.target.value))}
                          className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-2 py-1 font-mono" />
                      </div>
                      {/* Q */}
                      <div>
                        <label className="text-[7px] text-slate-700 block mb-1">Q</label>
                        <input type="number" min="0.1" max="10" step="0.1" value={band.Q}
                          onChange={e => updateBand(idx, 'Q', Number(e.target.value))}
                          className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-2 py-1 font-mono" />
                      </div>
                      {/* Channel */}
                      <div>
                        <label className="text-[7px] text-slate-700 block mb-1">Channel</label>
                        <select value={band.channel}
                          onChange={e => updateBand(idx, 'channel', e.target.value as MsDynamicEqBand['channel'])}
                          className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-2 py-1">
                          {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      {/* Threshold */}
                      <div>
                        <label className="text-[7px] text-slate-700 block mb-1">Threshold (dB)</label>
                        <input type="number" min="-60" max="0" step="1" value={band.threshold}
                          onChange={e => updateBand(idx, 'threshold', Number(e.target.value))}
                          className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-2 py-1 font-mono" />
                      </div>
                      {/* Max gain */}
                      <div>
                        <label className="text-[7px] text-slate-700 block mb-1">Max gain (dB)</label>
                        <input type="number" min="-12" max="6" step="0.5" value={band.maxGainDb}
                          onChange={e => updateBand(idx, 'maxGainDb', Number(e.target.value))}
                          className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-2 py-1 font-mono" />
                      </div>
                      {/* Atk/Rel */}
                      <div>
                        <label className="text-[7px] text-slate-700 block mb-1">Atk / Rel (ms)</label>
                        <div className="flex gap-1">
                          <input type="number" min="1" max="100" step="1" value={band.attackMs}
                            onChange={e => updateBand(idx, 'attackMs', Number(e.target.value))}
                            className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-1 py-1 font-mono" />
                          <input type="number" min="10" max="1000" step="10" value={band.releaseMs}
                            onChange={e => updateBand(idx, 'releaseMs', Number(e.target.value))}
                            className="w-full bg-white/[0.04] border border-white/[0.06] rounded text-[9px] text-white px-1 py-1 font-mono" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mix slider */}
              <div className="flex items-center gap-3">
                <span className="text-[8px] text-slate-600 w-12">Dry/Wet</span>
                <input type="range" min="0" max="1" step="0.01" value={mix}
                  onChange={e => { setMix(Number(e.target.value)); setProcessedBuffer(null); }}
                  className="flex-1 accent-cyan-400 h-1" />
                <span className="text-[8px] font-mono text-slate-400 w-8">{Math.round(mix * 100)}%</span>
              </div>

              {/* Process button */}
              <button onClick={process} disabled={processing}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/15 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {processing ? '⏳ Processing…' : '�Apply M/S Dynamic EQ'}
              </button>

              {/* Before / after waveforms */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl overflow-hidden border border-white/[0.06] space-y-1">
                  <p className="text-[7px] text-slate-700 px-2 pt-2">Before</p>
                  <canvas ref={beforeRef} width={220} height={48} className="w-full" style={{ background: '#0a0f1a' }} />
                </div>
                <div className="rounded-xl overflow-hidden border border-white/[0.06] space-y-1">
                  <p className="text-[7px] text-slate-700 px-2 pt-2">After</p>
                  <canvas ref={afterRef} width={220} height={48} className="w-full" style={{ background: '#0a0f1a' }} />
                </div>
              </div>

              {/* Explanatory note */}
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <p className="text-[8px] text-slate-700 leading-relaxed">
                  <span className="text-slate-500">Mid</span> = L+R (center: vocals, kick, bass, snare) ·{' '}
                  <span className="text-slate-500">Side</span> = L−R (stereo content: reverb, panning, width) ·{' '}
                  Gain only triggers when band energy exceeds threshold.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
