/**
 * WaveformComparator â€Side-by-side before/after audio comparison
 *
 * Shows two waveforms (original vs processed) drawn on canvas.
 * Play either one, or use the toggle to flip between them.
 * Used inside PowerEnginePanel and AlbumStudio Restoration panel.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface Props {
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;
  label?: string;
}

// Draw waveform onto canvas
function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  color: string,
  bgColor: string,
  playheadPct: number = 0
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Get mono mix of all channels
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const mid = height / 2;

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, color + '80');
  grad.addColorStop(0.5, color + 'cc');
  grad.addColorStop(1, color + '80');

  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let x = 0; x < width; x++) {
    let max = 0;
    const start = x * step;
    for (let i = start; i < start + step && i < data.length; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    const h = max * mid * 0.95;
    ctx.lineTo(x, mid - h);
  }
  for (let x = width - 1; x >= 0; x--) {
    let max = 0;
    const start = x * step;
    for (let i = start; i < start + step && i < data.length; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    const h = max * mid * 0.95;
    ctx.lineTo(x, mid + h);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Center line
  ctx.strokeStyle = color + '40';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  // Playhead
  if (playheadPct > 0) {
    const px = playheadPct * width;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }
}

export const WaveformComparator: React.FC<Props> = ({ originalBuffer, processedBuffer, label }) => {
  const origCanvas = useRef<HTMLCanvasElement>(null);
  const procCanvas = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [playing, setPlaying] = useState<'original' | 'processed' | null>(null);
  const [playheadPct, setPlayheadPct] = useState(0);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Draw both waveforms on mount / buffer change
  useEffect(() => {
    const drawAll = () => {
      if (origCanvas.current && originalBuffer) {
        drawWaveform(origCanvas.current, originalBuffer, '#6366f1', '#0f1117', 0);
      }
      if (procCanvas.current && processedBuffer) {
        drawWaveform(procCanvas.current, processedBuffer, '#22d3ee', '#060a10', 0);
      }
    };
    drawAll();
  }, [originalBuffer, processedBuffer]);

  // Animate playhead
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPlayheadPct(0);
      return;
    }
    const animate = () => {
      if (!audioCtxRef.current || !playing) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      const pct = Math.min(elapsed / durationRef.current, 1);
      setPlayheadPct(pct);
      const buf = playing === 'original' ? originalBuffer : processedBuffer;
      if (buf) {
        const canvas = playing === 'original' ? origCanvas.current : procCanvas.current;
        if (canvas) drawWaveform(canvas, buf, playing === 'original' ? '#6366f1' : '#22d3ee', playing === 'original' ? '#0f1117' : '#060a10', pct);
      }
      if (pct < 1) rafRef.current = requestAnimationFrame(animate);
      else stopPlayback();
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  const stopPlayback = useCallback(() => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
    setPlaying(null);
    setPlayheadPct(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Redraw without playhead
    if (origCanvas.current && originalBuffer) drawWaveform(origCanvas.current, originalBuffer, '#6366f1', '#0f1117', 0);
    if (procCanvas.current && processedBuffer) drawWaveform(procCanvas.current, processedBuffer, '#22d3ee', '#060a10', 0);
  }, [originalBuffer, processedBuffer]);

  const playBuffer = useCallback((buf: AudioBuffer, which: 'original' | 'processed') => {
    if (playing === which) { stopPlayback(); return; }
    if (playing) stopPlayback();

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    src.onended = () => { if (playing === which) stopPlayback(); };

    sourceRef.current = src;
    startTimeRef.current = ctx.currentTime;
    durationRef.current = buf.duration;
    setPlaying(which);
  }, [playing, stopPlayback]);

  const hasOriginal = !!originalBuffer;
  const hasProcessed = !!processedBuffer;
  const hasBoth = hasOriginal && hasProcessed;

  if (!hasOriginal && !hasProcessed) return null;

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-[9px] text-slate-500 uppercase tracking-widest">{label}</p>}

      {hasBoth && (
        <p className="text-[9px] text-slate-600 leading-relaxed">
          Listen to the original vs. the processed version. Click the play buttons below each waveform to compare. The difference should be audible â€more controlled, warmer, or louder depending on what processing was applied.
        </p>
      )}

      <div className={`grid gap-3 ${hasBoth ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Original */}
        {hasOriginal && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] text-slate-600 uppercase tracking-widest">Original</span>
              {playing === 'original' && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-[8px] text-indigo-400"
                >â—Playing</motion.span>
              )}
            </div>
            <div className="relative rounded-lg overflow-hidden cursor-pointer" onClick={() => playBuffer(originalBuffer!, 'original')}>
              <canvas ref={origCanvas} width={300} height={60} className="w-full h-[60px]" />
              {playing !== 'original' && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/30 border border-indigo-400/50 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-indigo-300 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => playing === 'original' ? stopPlayback() : playBuffer(originalBuffer!, 'original')}
              className={`py-1 rounded-lg text-[9px] font-semibold border transition-all ${
                playing === 'original'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:text-slate-300'
              }`}
            >
              {playing === 'original' ? 'â–Stop' : 'â–Play Original'}
            </button>
          </div>
        )}

        {/* Processed */}
        {hasProcessed && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] text-cyan-500 uppercase tracking-widest">Processed</span>
              {playing === 'processed' && (
                <motion.span
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-[8px] text-cyan-400"
                >â—Playing</motion.span>
              )}
            </div>
            <div className="relative rounded-lg overflow-hidden cursor-pointer" onClick={() => playBuffer(processedBuffer!, 'processed')}>
              <canvas ref={procCanvas} width={300} height={60} className="w-full h-[60px]" />
              {playing !== 'processed' && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/30 border border-cyan-400/50 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-cyan-300 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => playing === 'processed' ? stopPlayback() : playBuffer(processedBuffer!, 'processed')}
              className={`py-1 rounded-lg text-[9px] font-semibold border transition-all ${
                playing === 'processed'
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-500 hover:text-slate-300'
              }`}
            >
              {playing === 'processed' ? 'â–Stop' : 'â–Play Processed'}
            </button>
          </div>
        )}
      </div>

      {hasBoth && (
        <div className="flex gap-2">
          <button
            disabled={playing !== null}
            onClick={() => {
              // Play original then processed sequentially
              playBuffer(originalBuffer!, 'original');
            }}
            className="flex-1 py-1.5 rounded-lg text-[9px] font-semibold border border-white/[0.06] text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-all"
          >
            A/B â€play original first, then click processed
          </button>
        </div>
      )}
    </div>
  );
};
