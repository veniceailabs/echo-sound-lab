/**
 * MasteringCertificate
 *
 * A shareable visual certificate generated after every Grammy Master run.
 * Renders to a Canvas, downloads as PNG.
 *
 * Producers and engineers will share this on social media.
 * "My track just hit Platinum-grade mastering" that's the moment.
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { GrammyMasterResult } from '../services/grammyMasterService';

interface CertificateData {
  trackName?: string;
  artistName?: string;
  gradeLabel: string;
  gradeEmoji: string;
  lufs: number;
  truePeak?: number;
  genre?: string;
  engine: 'flagship' | 'python' | 'browser';
  date: Date;
  dynamicRange?: number;
}

interface MasteringCertificateProps {
  data: CertificateData;
  onClose?: () => void;
}

// ──Canvas renderer ───────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, [string, string]> = {
  'Platinum': ['#E8E8FF', '#A8A8FF'],
  'Gold':     ['#FFE566', '#FFB800'],
  'A+':       ['#88FF99', '#00CC44'],
  'A':        ['#88EEFF', '#0099CC'],
  'B+':       ['#FFCC88', '#FF8800'],
  'B':        ['#FFBBCC', '#FF4466'],
};

function getGradeColors(grade: string): [string, string] {
  for (const [key, colors] of Object.entries(GRADE_COLORS)) {
    if (grade.includes(key)) return colors;
  }
  return ['#CCDDFF', '#4466AA'];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderCertificate(canvas: HTMLCanvasElement, data: CertificateData) {
  const W = 800, H = 400;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const [gradLight, gradDark] = getGradeColors(data.gradeLabel);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0A0B10');
  bg.addColorStop(0.5, '#0D0F18');
  bg.addColorStop(1, '#080910');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Glow orb behind grade
  const glow = ctx.createRadialGradient(160, 200, 0, 160, 200, 120);
  glow.addColorStop(0, `${gradDark}44`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Left grade block
  roundRect(ctx, 40, 60, 220, 280, 20);
  const gradeGrad = ctx.createLinearGradient(40, 60, 260, 340);
  gradeGrad.addColorStop(0, `${gradDark}33`);
  gradeGrad.addColorStop(1, `${gradDark}11`);
  ctx.fillStyle = gradeGrad;
  ctx.fill();
  ctx.strokeStyle = `${gradDark}66`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Grade emoji
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.gradeEmoji, 150, 165);

  // Grade label
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = gradLight;
  ctx.textAlign = 'center';
  ctx.fillText(data.gradeLabel, 150, 210);

  // "MASTERED" sub-label
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.letterSpacing = '3px';
  ctx.fillText('MASTERED', 150, 235);

  // Engine badge
  const engineLabel = data.engine === 'flagship' ? 'Flagship AI' : data.engine === 'python' ? 'Python AI' : 'Browser DSP';
  const engineColor = data.engine === 'flagship' ? '#22d3ee' : data.engine === 'python' ? '#44FF88' : '#8888AA';
  roundRect(ctx, 100, 260, 100, 22, 11);
  ctx.fillStyle = data.engine === 'flagship' ? 'rgba(34,211,238,0.15)' : data.engine === 'python' ? 'rgba(68,255,136,0.15)' : 'rgba(100,100,150,0.15)';
  ctx.fill();
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = engineColor;
  ctx.textAlign = 'center';
  ctx.fillText(engineLabel, 150, 276);

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(290, 60); ctx.lineTo(290, 340);
  ctx.stroke();

  // Right content
  const rx = 320;

  // Title area
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.letterSpacing = '2px';
  ctx.fillText('ECHO SOUND LAB', rx, 90);

  const trackName = data.trackName?.replace(/\.[^.]+$/, '') ?? 'Untitled Track';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.letterSpacing = '0px';
  // Truncate if too long
  const maxTrackWidth = W - rx - 50;
  let truncated = trackName;
  while (ctx.measureText(truncated).width > maxTrackWidth && truncated.length > 4) {
    truncated = truncated.slice(0, -1);
  }
  if (truncated !== trackName) truncated += '…';
  ctx.fillText(truncated, rx, 125);

  if (data.artistName) {
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(data.artistName, rx, 150);
  }

  // Stats grid
  const stats = [
    { label: 'INTEGRATED LUFS', value: `${data.lufs.toFixed(1)} LUFS` },
    { label: 'TRUE PEAK', value: data.truePeak != null ? `${data.truePeak.toFixed(1)} dBTP` : '—' },
    { label: 'DYNAMIC RANGE', value: data.dynamicRange != null ? `${data.dynamicRange.toFixed(1)} LU` : '—' },
    { label: 'GENRE', value: data.genre ? data.genre.replace('_', ' ').toUpperCase() : '—' },
  ];

  const statY = data.artistName ? 180 : 165;
  const statCols = 2;
  stats.forEach((s, i) => {
    const col = i % statCols;
    const row = Math.floor(i / statCols);
    const sx = rx + col * 200;
    const sy = statY + row * 65;

    // Stat card
    roundRect(ctx, sx, sy, 180, 52, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.letterSpacing = '1.5px';
    ctx.fillText(s.label, sx + 12, sy + 18);

    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.letterSpacing = '0px';
    ctx.fillText(s.value, sx + 12, sy + 40);
  });

  // Platform compliance row
  const platforms = [
    { name: 'Spotify',    target: -14 },
    { name: 'Apple',      target: -16 },
    { name: 'YouTube',    target: -14 },
    { name: 'Tidal',      target: -14 },
  ];

  const pY = statY + 140;
  ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('PLATFORM COMPLIANCE', rx, pY);

  platforms.forEach((p, i) => {
    const px = rx + i * 110;
    const compliant = Math.abs(data.lufs - p.target) <= 1.5;
    const color = compliant ? '#44FF88' : '#FF6644';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = color;
    ctx.letterSpacing = '0px';
    ctx.fillText(`${compliant ? '✓' : '×'} ${p.name}`, px, pY + 18);
  });

  // Footer
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(40, H - 55); ctx.lineTo(W - 40, H - 55);
  ctx.stroke();

  ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
  ctx.fillText('echo-sound-lab.com', 40, H - 30);

  ctx.textAlign = 'right';
  ctx.fillText(data.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), W - 40, H - 30);
}

// ──Component ────────────────────────────────────────────────────────────────

export const MasteringCertificate: React.FC<MasteringCertificateProps> = ({
  data,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      renderCertificate(canvasRef.current, data);
    }
  }, [data]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const safe = (data.trackName ?? 'master').replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/\.[^.]+$/, '');
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}-mastering-certificate.png`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    }, 'image/png');
  }, [data]);

  const [gradLight] = getGradeColors(data.gradeLabel);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <span className="text-sm">{data.gradeEmoji}</span>
          <div>
            <span className="text-xs font-semibold text-white">Mastering Certificate</span>
            <p className="text-[10px] text-white/30 mt-0.5">Share to show your engineer-level work</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 px-1.5 py-1 rounded-lg hover:bg-white/[0.06] transition-colors text-base leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Canvas preview */}
      <div className="px-4 py-3">
        <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <canvas
            ref={canvasRef}
            className="w-full h-auto block"
            style={{ maxHeight: 240 }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleDownload}
          className={`
            flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all duration-150
            ${downloaded
              ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
              : 'border-white/15 text-white/80 bg-white/[0.08] hover:bg-white/[0.14] hover:text-white'}
          `}
          style={!downloaded ? { borderColor: `${gradLight}44` } : undefined}
        >
          {downloaded ? 'Saved to Downloads' : 'Download PNG'}
        </motion.button>
        <button
          onClick={() => {
            if (canvasRef.current) {
              canvasRef.current.toBlob(blob => {
                if (!blob) return;
                void navigator.share?.({
                  title: `${data.gradeLabel} Master ${data.trackName ?? 'Track'}`,
                  text: `Just got a ${data.gradeLabel} grade on my master with Echo Sound Lab 🎵`,
                  files: [new File([blob], 'certificate.png', { type: 'image/png' })],
                });
              }, 'image/png');
            }
          }}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
        >
          Share
        </button>
      </div>
    </motion.div>
  );
};

export default MasteringCertificate;
