/**
 * StereoImagerPanel ‚ÄMid/Side stereo width control
 *
 * Uses M/S (Mid/Side) encoding to independently control
 * the mono center and stereo side signals:
 * - Mid = (L + R) / 2 ‚Äthe shared center content
 * - Side = (L - R) / 2 ‚Äthe stereo difference
 *
 * Width control: multiply Side by a factor (0 = mono, 1 = original, 2 = wide)
 * M gain: boost/cut the center (e.g., for vocal presence)
 * S gain: boost/cut the sides (e.g., for stereo widening/narrowing)
 *
 * Shows a Lissajous-style correlation meter updated in real time
 * and outputs a processed AudioBuffer for preview/export.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StereoImagerPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

function processMS(buffer: AudioBuffer, widthFactor: number, midGainDb: number, sideGainDb: number): AudioBuffer {
  const n = buffer.length;
  const rate = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;

  const midGain = Math.pow(10, midGainDb / 20);
  const sideGain = Math.pow(10, sideGainDb / 20) * widthFactor;

  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(2, n, rate);
  const outL = out.getChannelData(0);
  const outR = out.getChannelData(1);

  for (let i = 0; i < n; i++) {
    const mid = (L[i] + R[i]) * 0.5 * midGain;
    const side = (L[i] - R[i]) * 0.5 * sideGain;
    outL[i] = mid + side;
    outR[i] = mid - side;
  }

  return out;
}

function measureCorrelation(L: Float32Array, R: Float32Array, n: number): number {
  let sumLR = 0, sumL2 = 0, sumR2 = 0;
  for (let i = 0; i < n; i++) {
    sumLR += L[i] * R[i];
    sumL2 += L[i] * L[i];
    sumR2 += R[i] * R[i];
  }
  const denom = Math.sqrt(sumL2 * sumR2);
  return denom > 0 ? sumLR / denom : 0;
}

function drawLissajous(canvas: HTMLCanvasElement, L: Float32Array, R: Float32Array, downsample = 8) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width; const H = canvas.height;
  const cx = W / 2; const cy = H / 2;
  const r = Math.min(cx, cy) - 4;

  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, W, H);

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

  // Diagonal guide
  ctx.strokeStyle = 'rgba(34,211,238,0.06)';
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();

  // Plot
  const total = Math.floor(L.length / downsample);
  for (let i = 0; i < total; i++) {
    const l = L[i * downsample];
    const rr = R[i * downsample];
    const x = cx + rr * r;
    const y = cy - l * r;
    const alpha = Math.min(0.6, 0.1 + Math.abs(l) * 0.5);
    ctx.fillStyle = `rgba(34,211,238,${alpha})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function bufferToUrl(buf: AudioBuffer): string {
  const numCh = buf.numberOfChannels;
  const len = buf.length;
  const rate = buf.sampleRate;
  const ab = new ArrayBuffer(44 + len * numCh * 2);
  const view = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,'RIFF'); view.setUint32(4,36+len*numCh*2,true); ws(8,'WAVE'); ws(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,numCh,true);
  view.setUint32(24,rate,true); view.setUint32(28,rate*numCh*2,true);
  view.setUint16(32,numCh*2,true); view.setUint16(34,16,true);
  ws(36,'data'); view.setUint32(40,len*numCh*2,true);
  const chs = Array.from({length:numCh},(_,c)=>buf.getChannelData(c));
  let off = 44;
  for(let i=0;i<len;i++) for(let c=0;c<numCh;c++){
    const s=Math.max(-1,Math.min(1,chs[c][i]));
    view.setInt16(off,s<0?s*0x8000:s*0x7FFF,true); off+=2;
  }
  return URL.createObjectURL(new Blob([ab],{type:'audio/wav'}));
}

const WIDTH_PRESETS = [
  { label: 'Mono', value: 0 },
  { label: 'Narrow', value: 0.5 },
  { label: 'Natural', value: 1.0 },
  { label: 'Wide', value: 1.4 },
  { label: 'Ultra', value: 2.0 },
];

export const StereoImagerPanel: React.FC<StereoImagerPanelProps> = ({ buffer, onClose }) => {
  const [width, setWidth] = useState(1.0);
  const [midGain, setMidGain] = useState(0);
  const [sideGain, setSideGain] = useState(0);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lissajousRef = useRef<HTMLCanvasElement>(null);
  const [correlation, setCorrelation] = useState<number | null>(null);
  const [origCorrelation, setOrigCorrelation] = useState<number | null>(null);

  // Draw original Lissajous and measure correlation on mount
  useEffect(() => {
    if (!buffer || !lissajousRef.current) return;
    const L = buffer.getChannelData(0);
    const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const sampleN = Math.min(L.length, 44100 * 4); // 4 seconds
    const Ls = L.slice(0, sampleN);
    const Rs = R.slice(0, sampleN);
    drawLissajous(lissajousRef.current, Ls, Rs);
    setOrigCorrelation(measureCorrelation(Ls, Rs, sampleN));
  }, [buffer]);

  const apply = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResult(null); setResultUrl(null);
    await new Promise(r => setTimeout(r, 10));
    const out = processMS(buffer, width, midGain, sideGain);
    // Draw processed lissajous
    if (lissajousRef.current) {
      const L = out.getChannelData(0);
      const R = out.getChannelData(1);
      const sampleN = Math.min(L.length, 44100 * 4);
      drawLissajous(lissajousRef.current, L.slice(0, sampleN), R.slice(0, sampleN));
      setCorrelation(measureCorrelation(L.slice(0, sampleN), R.slice(0, sampleN), sampleN));
    }
    const url = bufferToUrl(out);
    setResult(out);
    setResultUrl(url);
    setProcessing(false);
  }, [buffer, width, midGain, sideGain, resultUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }, [playing]);

  const corrDisplay = correlation ?? origCorrelation;
  const corrColor = corrDisplay == null ? '#64748b' : corrDisplay > 0.7 ? '#10b981' : corrDisplay > 0 ? '#22d3ee' : '#ef4444';
  const corrLabel = corrDisplay == null ? '‚Äî' : corrDisplay.toFixed(2);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-md bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Stereo Imager</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Mid/Side width control ¬Lissajous phase meter</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Lissajous + correlation */}
              <div className="flex gap-4 items-center">
                <canvas ref={lissajousRef} width={120} height={120} className="rounded-xl border border-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Phase correlation</p>
                    <p className="text-2xl font-bold font-mono" style={{ color: corrColor }}>{corrLabel}</p>
                    <p className="text-[8px] mt-1" style={{ color: corrColor }}>
                      {corrDisplay == null ? '' : corrDisplay > 0.7 ? 'Healthy stereo' : corrDisplay > 0 ? 'Wide / some cancellation' : 'Phase cancellation risk'}
                    </p>
                  </div>
                  <p className="text-[8px] text-slate-700 leading-relaxed">+1 = pure mono. 0 = wide. -1 = phase cancellation. Aim for 0.3‚Äì0.8 for most genres.</p>
                </div>
              </div>

              {/* Width */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Stereo width</p>
                  <span className="text-[9px] font-mono text-cyan-400">{(width * 100).toFixed(0)}%</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {WIDTH_PRESETS.map(p => (
                    <button key={p.value} onClick={() => setWidth(p.value)}
                      className={`text-[8px] px-2.5 py-1 rounded-lg border transition-all ${width === p.value ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-white/[0.02] text-slate-600 border-white/[0.06] hover:text-slate-400'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <input type="range" min={0} max={2} step={0.01} value={width}
                  onChange={e => setWidth(Number(e.target.value))} className="w-full accent-cyan-400" />
              </div>

              {/* Mid / Side gains */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest">M/S gain trim</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[8px] text-slate-500 w-12">Mid</span>
                    <input type="range" min={-12} max={12} step={0.5} value={midGain}
                      onChange={e => setMidGain(Number(e.target.value))} className="flex-1 accent-emerald-400" />
                    <span className="text-[9px] font-mono text-emerald-400 w-12 text-right">{midGain > 0 ? '+' : ''}{midGain} dB</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[8px] text-slate-500 w-12">Side</span>
                    <input type="range" min={-12} max={12} step={0.5} value={sideGain}
                      onChange={e => setSideGain(Number(e.target.value))} className="flex-1 accent-purple-400" />
                    <span className="text-[9px] font-mono text-purple-400 w-12 text-right">{sideGain > 0 ? '+' : ''}{sideGain} dB</span>
                  </div>
                </div>
              </div>

              <button
                onClick={apply}
                disabled={processing}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40"
              >
                {processing ? '‚èProcessing‚Ä¶' : '‚ñApply M/S Processing'}
              </button>

              <AnimatePresence>
                {result && resultUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">‚úProcessed</p>
                    <audio ref={audioRef} src={resultUrl} onEnded={() => setPlaying(false)} />
                    <div className="flex gap-2">
                      <button onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = resultUrl; a.download = `stereo_imaged_w${Math.round(width*100)}.wav`; a.click();
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all">
                        ‚ÜExport WAV
                      </button>
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
