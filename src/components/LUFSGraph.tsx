import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface LUFSDataPoint {
  time: number; // seconds into processing
  original: number; // LUFS
  processed: number; // LUFS
}

interface LUFSGraphProps {
  data: LUFSDataPoint[];
  width?: number;
  height?: number;
  isLive?: boolean;
}

export const LUFSGraph: React.FC<LUFSGraphProps> = ({
  data,
  width = 400,
  height = 150,
  isLive = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Y-axis labels (LUFS range typically -30 to -10)
    const minLUFS = -30;
    const maxLUFS = -10;
    const range = maxLUFS - minLUFS;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const lufs = minLUFS + (range / 4) * i;
      const y = height - (height / 4) * i;
      ctx.fillText(lufs.toFixed(0) + ' dB', 30, y + 3);
    }

    // X-axis labels (time in seconds)
    ctx.textAlign = 'center';
    const maxTime = data[data.length - 1].time;
    for (let i = 0; i <= 4; i++) {
      const t = (maxTime / 4) * i;
      const x = 50 + (width - 60) * (t / maxTime);
      ctx.fillText(Math.round(t) + 's', x, height - 5);
    }

    // Helper to convert LUFS to pixel Y
    const lufsToY = (lufs: number): number => {
      const normalized = (lufs - minLUFS) / range;
      return height - normalized * height;
    };

    // Draw original trace (gray)
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = 50 + (width - 60) * (data[i].time / maxTime);
      const y = lufsToY(data[i].original);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw processed trace (cyan)
    ctx.strokeStyle = 'rgba(34, 211, 238, 1)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = 50 + (width - 60) * (data[i].time / maxTime);
      const y = lufsToY(data[i].processed);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw live indicator dot
    if (isLive && data.length > 0) {
      const lastPoint = data[data.length - 1];
      const x = 50 + (width - 60) * (lastPoint.time / maxTime);
      const y = lufsToY(lastPoint.processed);

      ctx.fillStyle = 'rgba(34, 211, 238, 1)';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing ring
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Legend
    const legendY = 10;
    const legendX = width - 140;

    ctx.fillStyle = 'rgba(100, 116, 139, 0.6)';
    ctx.fillRect(legendX - 10, legendY - 8, 20, 4);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Original', legendX + 15, legendY - 2);

    ctx.fillStyle = 'rgba(34, 211, 238, 1)';
    ctx.fillRect(legendX - 10, legendY + 8, 20, 4);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
    ctx.fillText('Mastered', legendX + 15, legendY + 14);
  }, [data, width, height, isLive]);

  return (
    <motion.div
      className="space-y-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-widest text-slate-400">LUFS Progression</h4>
        {isLive && (
          <motion.div
            className="flex items-center gap-1 text-xs text-cyan-400"
            animate={{ opacity: [0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            Processing...
          </motion.div>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="w-full border border-cyan-500/30 rounded-lg bg-slate-950"
        style={{ height: `${height}px` }}
        aria-label="LUFS progression graph"
      />
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div className="text-center">
          <p className="text-slate-600">Original</p>
          <p className="text-cyan-400/60 font-mono">
            {data.length > 0 ? data[0].original.toFixed(1) : '-'} dB
          </p>
        </div>
        <div className="text-center">
          <p className="text-slate-600">Current</p>
          <p className="text-cyan-400 font-mono font-bold">
            {data.length > 0 ? data[data.length - 1].processed.toFixed(1) : '-'} dB
          </p>
        </div>
        <div className="text-center">
          <p className="text-slate-600">Improvement</p>
          <p className="text-emerald-400 font-mono">
            {data.length > 0
              ? Math.abs(data[data.length - 1].processed - data[0].original).toFixed(1)
              : '-'} dB
          </p>
        </div>
      </div>
    </motion.div>
  );
};
