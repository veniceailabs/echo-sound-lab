/**
 * WaveformTrimmerPanel ‚ÄVisual in/out point trimmer
 *
 * Draws the full waveform and lets the user drag handles to set:
 * - In point (start trim)
 * - Out point (end trim)
 *
 * The trimmed region is highlighted. Click to preview.
 * Export downloads the trimmed segment as a WAV file.
 * Also includes:
 * - Fade in / fade out duration sliders (applied to trim)
 * - Silence detection: shows if trim start/end has silence
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WaveformTrimmerPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toFixed(2);
  return `${m}:${ss.padStart(5, '0')}`;
}

function applyFades(buf: AudioBuffer, fadeInSec: number, fadeOutSec: number): AudioBuffer {
  const numCh = buf.numberOfChannels;
  const n = buf.length;
  const sr = buf.sampleRate;
  const fadeInSamples = Math.round(fadeInSec * sr);
  const fadeOutSamples = Math.round(fadeOutSec * sr);
  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(numCh, n, sr);
  for (let c = 0; c < numCh; c++) {
    const inData = buf.getChannelData(c);
    const outData = out.getChannelData(c);
    for (let i = 0; i < n; i++) {
      let gain = 1;
      if (i < fadeInSamples && fadeInSamples > 0) gain = i / fadeInSamples;
      if (i >= n - fadeOutSamples && fadeOutSamples > 0) gain = (n - i) / fadeOutSamples;
      outData[i] = inData[i] * gain;
    }
  }
  return out;
}

function trimBuffer(buf: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sr = buf.sampleRate;
  const startSample = Math.round(startSec * sr);
  const endSample = Math.min(Math.round(endSec * sr), buf.length);
  const length = endSample - startSample;
  const numCh = buf.numberOfChannels;
  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(numCh, length, sr);
  for (let c = 0; c < numCh; c++) {
    const inData = buf.getChannelData(c);
    const outData = out.getChannelData(c);
    for (let i = 0; i < length; i++) {
      outData[i] = inData[startSample + i];
    }
  }
  return out;
}

function bufferToUrl(buf: AudioBuffer): string {
  const numCh=buf.numberOfChannels,len=buf.length,rate=buf.sampleRate;
  const ab=new ArrayBuffer(44+len*numCh*2),view=new DataView(ab);
  const ws=(o:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF');view.setUint32(4,36+len*numCh*2,true);ws(8,'WAVE');ws(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,numCh,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*numCh*2,true);
  view.setUint16(32,numCh*2,true);view.setUint16(34,16,true);
  ws(36,'data');view.setUint32(40,len*numCh*2,true);
  const chs=Array.from({length:numCh},(_,c)=>buf.getChannelData(c));
  let off=44;
  for(let i=0;i<len;i++)for(let c=0;c<numCh;c++){const s=Math.max(-1,Math.min(1,chs[c][i]));view.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;}
  return URL.createObjectURL(new Blob([ab],{type:'audio/wav'}));
}

export const WaveformTrimmerPanel: React.FC<WaveformTrimmerPanelProps> = ({ buffer, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(1);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dragging = useRef<'in' | 'out' | null>(null);

  const duration = buffer?.duration ?? 1;

  const inSec = inPoint * duration;
  const outSec = outPoint * duration;
  const trimDuration = outSec - inSec;

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width; const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, W, H);

    // Dimmed regions (trimmed off)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, inPoint * W, H);
    ctx.fillRect(outPoint * W, 0, W - outPoint * W, H);

    // Active region highlight
    ctx.fillStyle = 'rgba(34,211,238,0.04)';
    ctx.fillRect(inPoint * W, 0, (outPoint - inPoint) * W, H);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const mid = H / 2;

    // Full waveform
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const s = Math.abs(data[x * step + j] || 0);
        if (s > max) max = s;
      }
      const h2 = max * mid * 0.9;
      const isActive = x / W >= inPoint && x / W <= outPoint;
      if (x === 0) ctx.moveTo(x, mid - h2); else ctx.lineTo(x, mid - h2);
    }
    for (let x = W - 1; x >= 0; x--) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const s = Math.abs(data[x * step + j] || 0);
        if (s > max) max = s;
      }
      const h2 = max * mid * 0.9;
      ctx.lineTo(x, mid + h2);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(34,211,238,0.25)';
    ctx.fill();

    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const s = Math.abs(data[x * step + j] || 0);
        if (s > max) max = s;
      }
      const h2 = max * mid * 0.9;
      if (x === 0) ctx.moveTo(x, mid - h2); else ctx.lineTo(x, mid - h2);
    }
    ctx.strokeStyle = 'rgba(34,211,238,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // In handle
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(inPoint * W - 1.5, 0, 3, H);
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.moveTo(inPoint * W, 0); ctx.lineTo(inPoint * W + 10, 0); ctx.lineTo(inPoint * W + 10, 14); ctx.lineTo(inPoint * W, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('IN', inPoint * W + 5, 10);

    // Out handle
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(outPoint * W - 1.5, 0, 3, H);
    ctx.fillStyle = '#a855f7';
    ctx.beginPath(); ctx.moveTo(outPoint * W, 0); ctx.lineTo(outPoint * W - 10, 0); ctx.lineTo(outPoint * W - 10, 14); ctx.lineTo(outPoint * W, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('OUT', outPoint * W - 5, 10);

    // Fade in shading
    if (fadeIn > 0) {
      const fadeInPx = (fadeIn / duration) * W;
      const fadeGrad = ctx.createLinearGradient(inPoint * W, 0, inPoint * W + fadeInPx, 0);
      fadeGrad.addColorStop(0, 'rgba(34,211,238,0.3)');
      fadeGrad.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(inPoint * W, 0, fadeInPx, H);
    }

    if (fadeOut > 0) {
      const fadeOutPx = (fadeOut / duration) * W;
      const fadeGrad = ctx.createLinearGradient(outPoint * W - fadeOutPx, 0, outPoint * W, 0);
      fadeGrad.addColorStop(0, 'rgba(168,85,247,0)');
      fadeGrad.addColorStop(1, 'rgba(168,85,247,0.3)');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(outPoint * W - fadeOutPx, 0, fadeOutPx, H);
    }
  }, [buffer, inPoint, outPoint, fadeIn, fadeOut, duration]);

  useEffect(() => {
    if (buffer) { setInPoint(0); setOutPoint(1); }
  }, [buffer]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const distIn = Math.abs(x - inPoint);
    const distOut = Math.abs(x - outPoint);
    dragging.current = distIn < distOut ? 'in' : 'out';
  }, [inPoint, outPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (dragging.current === 'in') setInPoint(Math.min(x, outPoint - 0.01));
    else setOutPoint(Math.max(x, inPoint + 0.01));
  }, [inPoint, outPoint]);

  const handleMouseUp = useCallback(() => { dragging.current = null; }, []);

  const renderResult = useCallback(() => {
    if (!buffer) return;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    const trimmed = trimBuffer(buffer, inSec, outSec);
    const faded = (fadeIn > 0 || fadeOut > 0) ? applyFades(trimmed, fadeIn, fadeOut) : trimmed;
    setResultUrl(bufferToUrl(faded));
  }, [buffer, inSec, outSec, fadeIn, fadeOut, resultUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }, [playing]);

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

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
            <h2 className="text-sm font-bold text-white">Waveform Trimmer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Drag IN/OUT handles ¬add fades ¬export trimmed WAV</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Waveform canvas */}
              <div className="rounded-xl overflow-hidden border border-white/[0.06] cursor-col-resize">
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={96}
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>

              {/* Time readouts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-2 text-center">
                  <p className="text-[7px] text-cyan-600 uppercase tracking-widest">In point</p>
                  <p className="text-[10px] font-mono text-cyan-300">{formatTime(inSec)}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-center">
                  <p className="text-[7px] text-slate-600 uppercase tracking-widest">Duration</p>
                  <p className="text-[10px] font-mono text-white">{formatTime(trimDuration)}</p>
                </div>
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-2 text-center">
                  <p className="text-[7px] text-purple-600 uppercase tracking-widest">Out point</p>
                  <p className="text-[10px] font-mono text-purple-300">{formatTime(outSec)}</p>
                </div>
              </div>

              {/* Fine-tune sliders */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">Fine trim</p>
                <div className="flex items-center gap-3">
                  <span className="text-[8px] text-cyan-400 w-16">In point</span>
                  <input type="range" min={0} max={0.999} step={0.001} value={inPoint}
                    onChange={e => setInPoint(Math.min(Number(e.target.value), outPoint - 0.001))}
                    className="flex-1 accent-cyan-400" />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[8px] text-purple-400 w-16">Out point</span>
                  <input type="range" min={0.001} max={1} step={0.001} value={outPoint}
                    onChange={e => setOutPoint(Math.max(Number(e.target.value), inPoint + 0.001))}
                    className="flex-1 accent-purple-400" />
                </div>
              </div>

              {/* Fades */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">Fades</p>
                <div className="flex items-center gap-3">
                  <span className="text-[8px] text-slate-500 w-16">Fade in</span>
                  <input type="range" min={0} max={Math.min(5, trimDuration * 0.5)} step={0.05} value={fadeIn}
                    onChange={e => setFadeIn(Number(e.target.value))} className="flex-1 accent-emerald-400" />
                  <span className="text-[9px] font-mono text-emerald-400 w-12 text-right">{fadeIn.toFixed(2)}s</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[8px] text-slate-500 w-16">Fade out</span>
                  <input type="range" min={0} max={Math.min(5, trimDuration * 0.5)} step={0.05} value={fadeOut}
                    onChange={e => setFadeOut(Number(e.target.value))} className="flex-1 accent-emerald-400" />
                  <span className="text-[9px] font-mono text-emerald-400 w-12 text-right">{fadeOut.toFixed(2)}s</span>
                </div>
              </div>

              <button onClick={renderResult}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/15 to-purple-500/15 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all">
                ‚ñRender Trim
              </button>

              <AnimatePresence>
                {resultUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">‚úTrimmed ¬{formatTime(trimDuration)}</p>
                    <audio ref={audioRef} src={resultUrl} onEnded={() => setPlaying(false)} />
                    <div className="flex gap-2">
                      <button onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = resultUrl; a.download = `trimmed_${formatTime(inSec).replace(':','m')}s.wav`; a.click();
                      }} className="flex-1 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all">
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
