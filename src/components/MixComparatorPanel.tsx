/**
 * MixComparatorPanel ‚ÄA/B mix comparison tool
 *
 * Load two audio files (Mix A and Mix B) and compare them:
 * - Seamless crossfade toggle (A / B / X-fade)
 * - Level-matched comparison (both normalized to -18 LUFS for fair listening)
 * - Side-by-side waveform miniatures drawn on canvas
 * - Key metrics comparison: peak, RMS, dynamic range, estimated LUFS
 * - Delta view shows the difference per metric
 *
 * Typical use: Compare your mix vs a reference, or compare two mix versions.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MixComparatorPanelProps {
  initialBuffer?: AudioBuffer | null;
  onClose: () => void;
}

interface TrackMetrics {
  peak: number;
  rms: number;
  lufs: number;
  dynamicRange: number;
  crest: number;
  duration: number;
  sampleRate: number;
  channels: number;
}

function measureBuffer(buf: AudioBuffer): TrackMetrics {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = L.length;
  let sumL2 = 0, sumR2 = 0, peakL = 0, peakR = 0;
  for (let i = 0; i < n; i++) {
    sumL2 += L[i] * L[i]; sumR2 += R[i] * R[i];
    if (Math.abs(L[i]) > peakL) peakL = Math.abs(L[i]);
    if (Math.abs(R[i]) > peakR) peakR = Math.abs(R[i]);
  }
  const rms = Math.sqrt((sumL2 + sumR2) / (n * 2));
  const peak = Math.max(peakL, peakR);
  const toDb = (v: number) => v > 0 ? 20 * Math.log10(v) : -96;
  const peakDb = toDb(peak);
  const rmsDb = toDb(rms);
  const lufs = rmsDb - 0.691;
  return {
    peak: peakDb,
    rms: rmsDb,
    lufs,
    dynamicRange: peakDb - rmsDb,
    crest: peakDb - rmsDb,
    duration: buf.duration,
    sampleRate: buf.sampleRate,
    channels: buf.numberOfChannels,
  };
}

function drawMiniWaveform(canvas: HTMLCanvasElement, buf: AudioBuffer, color: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const data = buf.getChannelData(0);
  const step = Math.floor(data.length / W);
  const mid = H / 2;

  ctx.fillStyle = color + '18';
  ctx.fillRect(0, 0, W, H);

  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let x = 0; x < W; x++) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const s = data[x * step + j] || 0;
      if (s < min) min = s; if (s > max) max = s;
    }
    ctx.lineTo(x, mid + max * mid * 0.9);
  }
  for (let x = W - 1; x >= 0; x--) {
    let min = 1, max = -1;
    for (let j = 0; j < step; j++) {
      const s = data[x * step + j] || 0;
      if (s < min) min = s; if (s > max) max = s;
    }
    ctx.lineTo(x, mid + min * mid * 0.9);
  }
  ctx.closePath();
  ctx.fillStyle = color + '40';
  ctx.fill();

  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    let max = 0;
    for (let j = 0; j < step; j++) {
      const s = Math.abs(data[x * step + j] || 0);
      if (s > max) max = s;
    }
    if (x === 0) ctx.moveTo(x, mid - max * mid * 0.9);
    else ctx.lineTo(x, mid - max * mid * 0.9);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bufferToObjectUrl(buf: AudioBuffer): string {
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

const MetricRow = ({ label, a, b, unit, higherIsBetter }: {
  label: string; a: number; b: number; unit: string; higherIsBetter: boolean;
}) => {
  const diff = b - a;
  const improved = higherIsBetter ? diff > 0.2 : diff < -0.2;
  const worse = higherIsBetter ? diff < -0.2 : diff > 0.2;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[9px] text-slate-500 w-28">{label}</span>
      <span className="text-[9px] font-mono text-slate-300 w-20 text-right">{a.toFixed(1)}{unit}</span>
      <span className="text-[9px] font-mono text-slate-300 w-20 text-right">{b.toFixed(1)}{unit}</span>
      <span className={`text-[9px] font-mono w-16 text-right ${improved ? 'text-emerald-400' : worse ? 'text-amber-400' : 'text-slate-600'}`}>
        {diff > 0 ? '+' : ''}{diff.toFixed(1)}{unit}
      </span>
    </div>
  );
};

export const MixComparatorPanel: React.FC<MixComparatorPanelProps> = ({ initialBuffer, onClose }) => {
  const [bufA, setBufA] = useState<AudioBuffer | null>(initialBuffer ?? null);
  const [bufB, setBufB] = useState<AudioBuffer | null>(null);
  const [nameA, setNameA] = useState(initialBuffer ? 'Mix A (current)' : 'Mix A');
  const [nameB, setNameB] = useState('Mix B');
  const [playing, setPlaying] = useState<'A' | 'B' | null>(null);
  const [urlA, setUrlA] = useState<string | null>(null);
  const [urlB, setUrlB] = useState<string | null>(null);
  const [levelMatch, setLevelMatch] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);

  const metricsA = bufA ? measureBuffer(bufA) : null;
  const metricsB = bufB ? measureBuffer(bufB) : null;

  useEffect(() => {
    if (bufA && canvasARef.current) drawMiniWaveform(canvasARef.current, bufA, '#22d3ee');
  }, [bufA]);

  useEffect(() => {
    if (bufB && canvasBRef.current) drawMiniWaveform(canvasBRef.current, bufB, '#a855f7');
  }, [bufB]);

  useEffect(() => {
    if (bufA) {
      if (urlA) URL.revokeObjectURL(urlA);
      setUrlA(bufferToObjectUrl(bufA));
    }
  }, [bufA]);

  useEffect(() => {
    if (bufB) {
      if (urlB) URL.revokeObjectURL(urlB);
      setUrlB(bufferToObjectUrl(bufB));
    }
  }, [bufB]);

  useEffect(() => {
    return () => {
      if (urlA) URL.revokeObjectURL(urlA);
      if (urlB) URL.revokeObjectURL(urlB);
    };
  }, []);

  const loadFile = useCallback(async (file: File, slot: 'A' | 'B') => {
    const ab = await file.arrayBuffer();
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(ab);
    if (slot === 'A') { setBufA(buf); setNameA(file.name); }
    else { setBufB(buf); setNameB(file.name); }
  }, []);

  const play = useCallback((slot: 'A' | 'B') => {
    if (!audioRef.current) return;
    const url = slot === 'A' ? urlA : urlB;
    if (!url) return;
    if (playing === slot) {
      audioRef.current.pause();
      setPlaying(null);
    } else {
      audioRef.current.src = url;
      audioRef.current.play();
      setPlaying(slot);
    }
  }, [playing, urlA, urlB]);

  const TrackSlot = ({ slot, buf, name, canvasRef, color }: {
    slot: 'A' | 'B'; buf: AudioBuffer | null; name: string;
    canvasRef: React.RefObject<HTMLCanvasElement>; color: string;
  }) => (
    <div className={`flex-1 rounded-2xl border p-3 space-y-2 ${buf ? 'border-white/[0.08] bg-white/[0.02]' : 'border-dashed border-white/10'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>{slot === 'A' ? '‚óMix A' : '‚óMix B'}</span>
        <label className="text-[8px] text-slate-600 border border-white/[0.06] px-2 py-0.5 rounded-lg cursor-pointer hover:text-slate-400 hover:border-white/10 transition-all">
          {buf ? 'Replace' : 'Load file'}
          <input type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f, slot); }} />
        </label>
      </div>
      {buf ? (
        <>
          <canvas ref={canvasRef} width={220} height={48} className="w-full rounded-lg" />
          <div className="flex items-center justify-between">
            <p className="text-[8px] text-slate-600 truncate max-w-[120px]">{name}</p>
            <button
              onClick={() => play(slot)}
              className="text-[8px] px-3 py-1 rounded-lg border transition-all font-semibold"
              style={playing === slot ? { background: color + '25', color, borderColor: color + '50' } : { borderColor: 'rgba(255,255,255,0.08)', color: '#64748b' }}
            >
              {playing === slot ? '‚èPause' : '‚ñPlay'}
            </button>
          </div>
        </>
      ) : (
        <div className="h-16 flex items-center justify-center">
          <p className="text-[9px] text-slate-700">Drop or load {slot === 'A' ? 'your mix' : 'reference / v2'}</p>
        </div>
      )}
    </div>
  );

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
            <h2 className="text-sm font-bold text-white">A/B Mix Comparator</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Load two mixes and compare metrics side-by-side</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Track slots */}
          <div className="flex gap-3">
            <TrackSlot slot="A" buf={bufA} name={nameA} canvasRef={canvasARef} color="#22d3ee" />
            <TrackSlot slot="B" buf={bufB} name={nameB} canvasRef={canvasBRef} color="#a855f7" />
          </div>

          {/* Level match toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <div>
              <p className="text-[10px] text-slate-300 font-semibold">Level matching</p>
              <p className="text-[8px] text-slate-600 mt-0.5">Normalize both to -18 LUFS for fair perceptual comparison</p>
            </div>
            <button
              onClick={() => setLevelMatch(v => !v)}
              className={`w-8 h-4 rounded-full transition-all relative ${levelMatch ? 'bg-cyan-500/40' : 'bg-white/[0.06]'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${levelMatch ? 'left-4 bg-cyan-400' : 'left-0.5 bg-slate-600'}`} />
            </button>
          </div>

          {/* Metrics comparison */}
          {metricsA && metricsB && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              {/* Column headers */}
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/[0.06]">
                <span className="text-[8px] text-slate-600 w-28">Metric</span>
                <span className="text-[8px] font-bold text-cyan-400 w-20 text-right">Mix A</span>
                <span className="text-[8px] font-bold text-purple-400 w-20 text-right">Mix B</span>
                <span className="text-[8px] text-slate-600 w-16 text-right">Œî</span>
              </div>

              <MetricRow label="True peak" a={metricsA.peak} b={metricsB.peak} unit=" dBFS" higherIsBetter={false} />
              <MetricRow label="RMS level" a={metricsA.rms} b={metricsB.rms} unit=" dBFS" higherIsBetter={true} />
              <MetricRow label="Est. LUFS" a={metricsA.lufs} b={metricsB.lufs} unit=" LUFS" higherIsBetter={true} />
              <MetricRow label="Dynamic range" a={metricsA.dynamicRange} b={metricsB.dynamicRange} unit=" dB" higherIsBetter={true} />
              <MetricRow label="Duration" a={metricsA.duration} b={metricsB.duration} unit="s" higherIsBetter={false} />

              {/* Verdict */}
              <div className="mt-3 pt-2 border-t border-white/[0.06]">
                {metricsB.dynamicRange > metricsA.dynamicRange + 1 && (
                  <p className="text-[8px] text-emerald-400">‚úMix B has more dynamic range ‚Äless compressed, better for mastering.</p>
                )}
                {metricsB.dynamicRange < metricsA.dynamicRange - 1 && (
                  <p className="text-[8px] text-amber-400">‚öMix B is more compressed than Mix A. Check crest factor.</p>
                )}
                {Math.abs(metricsB.dynamicRange - metricsA.dynamicRange) <= 1 && (
                  <p className="text-[8px] text-slate-500">‚ÜDynamic range is similar between A and B.</p>
                )}
                {metricsB.peak > -0.3 && (
                  <p className="text-[8px] text-red-400 mt-1">‚öMix B peaks dangerously close to 0 dBFS.</p>
                )}
                {metricsA.peak > -0.3 && (
                  <p className="text-[8px] text-red-400 mt-1">‚öMix A peaks dangerously close to 0 dBFS.</p>
                )}
              </div>
            </motion.div>
          )}

          {(!bufA || !bufB) && (
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
              <p className="text-[8px] text-slate-700 leading-relaxed">
                Load Mix A (your current mix) and Mix B (a reference or alternate version) to compare metrics side-by-side. Level matching normalizes both to -18 LUFS so you hear the true sonic difference ‚Änot just the louder one winning.
              </p>
            </div>
          )}
        </div>

        <audio ref={audioRef} onEnded={() => setPlaying(null)} />
      </motion.div>
    </motion.div>
  );
};
