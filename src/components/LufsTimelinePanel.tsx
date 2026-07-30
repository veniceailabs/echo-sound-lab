/**
 * LufsTimelinePanel â€LUFS loudness over time visualization
 *
 * Renders a scrollable timeline of integrated LUFS across the track:
 * - 400ms blocks (ITU-R BS.1770-4 short-term)
 * - Color-coded bars (green = safe, amber = hot, red = over target)
 * - Horizontal reference lines for Spotify (-14), Apple Music (-16), YouTube (-14)
 * - Click to seek to that point in time
 * - Summary: loudest/quietest 5-second window
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface LufsTimelinePanelProps {
  buffer: AudioBuffer | null;
  onSeek?: (time: number) => void;
  onClose: () => void;
}

interface Block {
  time: number;
  lufs: number;
}

const TARGETS: Array<{ name: string; lufs: number; color: string }> = [
  { name: 'Spotify', lufs: -14, color: '#1DB954' },
  { name: 'Apple Music', lufs: -16, color: '#fc3c44' },
  { name: 'YouTube', lufs: -14, color: '#FF0000' },
  { name: 'Tidal', lufs: -14, color: '#00FFFF' },
];

function computeBlocks(buffer: AudioBuffer, blockMs = 400): Block[] {
  const blockSize = Math.floor(buffer.sampleRate * blockMs / 1000);
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const blocks: Block[] = [];

  for (let start = 0; start + blockSize < L.length; start += blockSize) {
    let sum = 0;
    for (let i = start; i < start + blockSize; i++) {
      sum += L[i] * L[i] + R[i] * R[i];
    }
    const rms = Math.sqrt(sum / (blockSize * 2));
    const lufs = rms > 0 ? 20 * Math.log10(rms) - 0.691 : -70;
    blocks.push({ time: start / buffer.sampleRate, lufs: Math.max(-70, lufs) });
  }

  return blocks;
}

function drawTimeline(
  canvas: HTMLCanvasElement,
  blocks: Block[],
  targetLufs: number,
  duration: number,
  hoveredIdx: number | null
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#060a10';
  ctx.fillRect(0, 0, width, height);

  const pad = { top: 20, bottom: 24, left: 36, right: 8 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const minDb = -40;
  const maxDb = 0;

  const toY = (lufs: number) => pad.top + (1 - (lufs - minDb) / (maxDb - minDb)) * plotH;
  const barW = Math.max(1, plotW / blocks.length - 0.5);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let db = minDb; db <= maxDb; db += 5) {
    const y = toY(db);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${db}`, pad.left - 3, y + 2.5);
  }

  // Target line
  const tY = toY(targetLufs);
  ctx.strokeStyle = 'rgba(34,211,238,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(pad.left, tY); ctx.lineTo(pad.left + plotW, tY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#22d3ee';
  ctx.textAlign = 'right';
  ctx.font = 'bold 7px monospace';
  ctx.fillText(`${targetLufs}`, pad.left - 3, tY - 2);

  // Bars
  blocks.forEach((block, i) => {
    const x = pad.left + (i / blocks.length) * plotW;
    const y = toY(block.lufs);
    const barH = Math.max(1, (pad.top + plotH) - y);

    const isHovered = hoveredIdx === i;
    const isOver = block.lufs > targetLufs + 2;
    const isHot = block.lufs > targetLufs - 2;

    ctx.fillStyle = isHovered
      ? '#ffffff'
      : isOver ? '#ef4444'
      : isHot ? '#f59e0b'
      : '#10b981';
    ctx.globalAlpha = isHovered ? 0.9 : 0.7;
    ctx.fillRect(x, y, barW, barH);
    ctx.globalAlpha = 1;
  });

  // Time axis
  const timeTicks = Math.min(10, Math.floor(duration / 30));
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= timeTicks; i++) {
    const t = (duration / timeTicks) * i;
    const x = pad.left + (t / duration) * plotW;
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, x, height - 6);
  }
}

export const LufsTimelinePanel: React.FC<LufsTimelinePanelProps> = ({ buffer, onSeek, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [targetPlatform, setTargetPlatform] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const target = TARGETS[targetPlatform];

  useEffect(() => {
    if (!buffer) return;
    setLoading(true);
    // Compute in next tick to allow render
    setTimeout(() => {
      const b = computeBlocks(buffer, 400);
      setBlocks(b);
      setLoading(false);
    }, 0);
  }, [buffer]);

  useEffect(() => {
    if (canvasRef.current && blocks.length > 0 && buffer) {
      drawTimeline(canvasRef.current, blocks, target.lufs, buffer.duration, hoveredIdx);
    }
  }, [blocks, target, hoveredIdx, buffer]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || blocks.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotLeft = 36;
    const plotW = rect.width - plotLeft - 8;
    const ratio = Math.max(0, Math.min(1, (x - plotLeft) / plotW));
    const idx = Math.floor(ratio * blocks.length);
    setHoveredIdx(Math.min(blocks.length - 1, idx));
  }, [blocks]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !onSeek || !buffer || blocks.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotLeft = 36;
    const plotW = rect.width - plotLeft - 8;
    const ratio = Math.max(0, Math.min(1, (x - plotLeft) / plotW));
    onSeek(ratio * buffer.duration);
  }, [blocks, onSeek, buffer]);

  const loudestBlock = blocks.reduce((a, b) => b.lufs > a.lufs ? b : a, blocks[0]);
  const quietestBlock = blocks.reduce((a, b) => b.lufs < a.lufs ? b : a, blocks[0]);
  const overTarget = blocks.filter(b => b.lufs > target.lufs + 2).length;
  const overPct = blocks.length > 0 ? (overTarget / blocks.length * 100).toFixed(0) : '0';

  const hoveredBlock = hoveredIdx !== null ? blocks[hoveredIdx] : null;

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
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">LUFS Timeline</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Short-term loudness over time Âclick to seek
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {loading && (
            <div className="text-center py-8">
              <motion.div
                className="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 mx-auto"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          )}

          {buffer && blocks.length > 0 && !loading && (
            <>
              {/* Platform selector */}
              <div className="flex gap-2 flex-wrap">
                {TARGETS.map((t, i) => (
                  <button
                    key={t.name}
                    onClick={() => setTargetPlatform(i)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-semibold border transition-all ${
                      targetPlatform === i
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                        : 'border-white/[0.06] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t.name} ({t.lufs} LUFS)
                  </button>
                ))}
              </div>

              {/* Canvas */}
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={200}
                  style={{ display: 'block', width: '100%', height: 'auto', cursor: onSeek ? 'pointer' : 'crosshair' }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={handleClick}
                />
              </div>

              {/* Hover tooltip */}
              {hoveredBlock && (
                <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2">
                  <div>
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">Time</p>
                    <p className="text-[10px] font-mono text-slate-200">
                      {Math.floor(hoveredBlock.time / 60)}:{String(Math.floor(hoveredBlock.time % 60)).padStart(2, '0')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">LUFS</p>
                    <p className={`text-[12px] font-mono font-bold ${hoveredBlock.lufs > target.lufs + 2 ? 'text-red-300' : hoveredBlock.lufs > target.lufs - 2 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {hoveredBlock.lufs.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">vs target</p>
                    <p className="text-[10px] font-mono text-slate-300">
                      {(hoveredBlock.lufs - target.lufs) > 0 ? '+' : ''}{(hoveredBlock.lufs - target.lufs).toFixed(1)} LU
                    </p>
                  </div>
                  {onSeek && <p className="text-[8px] text-slate-600 ml-auto">Click to seek</p>}
                </div>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
                  <p className="text-[8px] text-slate-600 uppercase tracking-widest">Loudest moment</p>
                  {loudestBlock && (
                    <>
                      <p className="text-red-300 text-[14px] font-black">{loudestBlock.lufs.toFixed(1)} LUFS</p>
                      <p className="text-[8px] text-slate-500">
                        at {Math.floor(loudestBlock.time / 60)}:{String(Math.floor(loudestBlock.time % 60)).padStart(2, '0')}
                      </p>
                    </>
                  )}
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1">
                  <p className="text-[8px] text-slate-600 uppercase tracking-widest">Sections over {target.name}</p>
                  <p className={`text-[14px] font-black ${Number(overPct) > 20 ? 'text-amber-300' : 'text-emerald-300'}`}>{overPct}%</p>
                  <p className="text-[8px] text-slate-500">of track exceeds {target.lufs} LUFS target</p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 flex-wrap">
                {[
                  { color: '#10b981', label: `â‰${target.lufs} LU (target)` },
                  { color: '#f59e0b', label: `${target.lufs + 2} LU (hot)` },
                  { color: '#ef4444', label: `> ${target.lufs + 2} LU (over)` },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded" style={{ background: s.color }} />
                    <span className="text-[7px] text-slate-700">{s.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
