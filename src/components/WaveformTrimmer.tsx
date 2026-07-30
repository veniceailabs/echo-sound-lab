/**
 * WaveformTrimmer — Drag-handle audio trimmer
 *
 * Shows the full waveform as a canvas. Two draggable handles (IN and OUT)
 * let you set the trim region. Includes auto-trim that detects silence at
 * the start/end and snaps the handles in automatically.
 *
 * Returns the trimmed AudioBuffer via onTrim callback.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface WaveformTrimmerProps {
  buffer: AudioBuffer;
  onTrim: (trimmed: AudioBuffer) => void;
  onCancel: () => void;
}

const CANVAS_H = 80;
const HANDLE_W = 10;
const SILENCE_THRESHOLD = 0.008; // RMS per block to count as silence
const SILENCE_BLOCK_SIZE = 1024;

function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  inPct: number,
  outPct: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const mid = height / 2;

  // Draw waveform
  for (let x = 0; x < width; x++) {
    const pct = x / width;
    const inRegion = pct >= inPct && pct <= outPct;
    let max = 0;
    const start = x * step;
    for (let i = start; i < start + step && i < data.length; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    const h = max * mid * 0.9;
    ctx.fillStyle = inRegion ? 'rgba(34,211,238,0.7)' : 'rgba(100,116,139,0.3)';
    ctx.fillRect(x, mid - h, 1, h * 2);
  }

  // Dimmed overlay outside trim region
  const inX = inPct * width;
  const outX = outPct * width;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if (inX > 0) ctx.fillRect(0, 0, inX, height);
  if (outX < width) ctx.fillRect(outX, 0, width - outX, height);

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();

  // IN handle line
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inX, 0);
  ctx.lineTo(inX, height);
  ctx.stroke();

  // OUT handle line
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(outX, 0);
  ctx.lineTo(outX, height);
  ctx.stroke();
}

function detectSilenceBounds(buffer: AudioBuffer): { inPct: number; outPct: number } {
  const data = buffer.getChannelData(0);
  const total = data.length;
  const blocks = Math.floor(total / SILENCE_BLOCK_SIZE);

  let startBlock = 0;
  let endBlock = blocks - 1;

  // Find first non-silent block
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    for (let i = 0; i < SILENCE_BLOCK_SIZE; i++) sum += data[b * SILENCE_BLOCK_SIZE + i] ** 2;
    if (Math.sqrt(sum / SILENCE_BLOCK_SIZE) > SILENCE_THRESHOLD) { startBlock = b; break; }
  }

  // Find last non-silent block
  for (let b = blocks - 1; b >= 0; b--) {
    let sum = 0;
    for (let i = 0; i < SILENCE_BLOCK_SIZE; i++) sum += data[b * SILENCE_BLOCK_SIZE + i] ** 2;
    if (Math.sqrt(sum / SILENCE_BLOCK_SIZE) > SILENCE_THRESHOLD) { endBlock = b; break; }
  }

  // Give a tiny bit of pre-roll (2 blocks) and post-roll
  const inPct = Math.max(0, (startBlock - 2) / blocks);
  const outPct = Math.min(1, (endBlock + 3) / blocks);
  return { inPct, outPct };
}

async function trimBuffer(buffer: AudioBuffer, inPct: number, outPct: number): Promise<AudioBuffer> {
  const sampleRate = buffer.sampleRate;
  const inSample = Math.floor(inPct * buffer.length);
  const outSample = Math.ceil(outPct * buffer.length);
  const length = outSample - inSample;

  const ctx = new OfflineAudioContext(buffer.numberOfChannels, length, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start(0, inSample / sampleRate, length / sampleRate);
  return ctx.startRendering();
}

export const WaveformTrimmer: React.FC<WaveformTrimmerProps> = ({ buffer, onTrim, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inPct, setInPct] = useState(0);
  const [outPct, setOutPct] = useState(1);
  const [dragging, setDragging] = useState<'in' | 'out' | null>(null);
  const [autoTrimmed, setAutoTrimmed] = useState(false);
  const [trimming, setTrimming] = useState(false);

  // Draw whenever handles change
  useEffect(() => {
    if (canvasRef.current) drawWaveform(canvasRef.current, buffer, inPct, outPct);
  }, [buffer, inPct, outPct]);

  // Auto-trim on mount
  useEffect(() => {
    const bounds = detectSilenceBounds(buffer);
    setInPct(bounds.inPct);
    setOutPct(bounds.outPct);
    setAutoTrimmed(bounds.inPct > 0.002 || bounds.outPct < 0.998);
  }, [buffer]);

  const pctFromEvent = useCallback((e: MouseEvent | React.MouseEvent): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pct = pctFromEvent(e);
    const distIn = Math.abs(pct - inPct);
    const distOut = Math.abs(pct - outPct);
    setDragging(distIn < distOut ? 'in' : 'out');
  }, [inPct, outPct, pctFromEvent]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const pct = pctFromEvent(e);
      if (dragging === 'in') setInPct(Math.min(pct, outPct - 0.02));
      else setOutPct(Math.max(pct, inPct + 0.02));
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, inPct, outPct, pctFromEvent]);

  const handleApply = useCallback(async () => {
    setTrimming(true);
    try {
      const trimmed = await trimBuffer(buffer, inPct, outPct);
      onTrim(trimmed);
    } finally {
      setTrimming(false);
    }
  }, [buffer, inPct, outPct, onTrim]);

  const duration = buffer.duration;
  const inTime = inPct * duration;
  const outTime = outPct * duration;
  const trimmedDuration = outTime - inTime;

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="rounded-2xl border border-white/[0.08] bg-slate-950/95 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div>
          <p className="text-[11px] font-bold text-white">Trim Audio</p>
          <p className="text-[9px] text-slate-500 mt-0.5">
            Drag the cyan (IN) and orange (OUT) handles to set the trim region
          </p>
        </div>
        {autoTrimmed && (
          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
            Auto-trimmed silence
          </span>
        )}
      </div>

      {/* Waveform canvas */}
      <div
        ref={containerRef}
        className="relative select-none cursor-col-resize px-0"
        onMouseDown={handleMouseDown}
      >
        <canvas
          ref={canvasRef}
          width={800}
          height={CANVAS_H}
          className="w-full"
          style={{ height: CANVAS_H }}
        />

        {/* IN label */}
        <div
          className="absolute top-1 text-[8px] font-bold text-cyan-400 pointer-events-none"
          style={{ left: `calc(${inPct * 100}% + 4px)` }}
        >
          IN {fmt(inTime)}
        </div>

        {/* OUT label */}
        <div
          className="absolute top-1 text-[8px] font-bold text-orange-400 pointer-events-none"
          style={{ left: `calc(${outPct * 100}% - 48px)` }}
        >
          OUT {fmt(outTime)}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
        <div className="text-[10px] text-slate-500">
          <span className="text-slate-300 font-mono">{fmt(trimmedDuration)}</span>
          {' '}of{' '}
          <span className="font-mono">{fmt(duration)}</span>
          {' '}selected
          {duration - trimmedDuration > 0.1 && (
            <span className="text-amber-500 ml-2">
              ({fmt(duration - trimmedDuration)} removed)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setInPct(0); setOutPct(1); }}
            className="px-3 py-1.5 rounded-lg border border-white/[0.06] text-[9px] text-slate-500 hover:text-slate-300 transition-all"
          >
            Reset
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-white/[0.06] text-[9px] text-slate-500 hover:text-slate-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={trimming || (inPct === 0 && outPct === 1)}
            className="px-4 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-[9px] font-semibold hover:bg-cyan-500/30 transition-all disabled:opacity-40"
          >
            {trimming ? 'Trimming…' : 'Apply Trim'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
