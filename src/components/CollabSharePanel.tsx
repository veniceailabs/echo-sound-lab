/**
 * CollabSharePanel â€Generate a shareable session snapshot
 *
 * Creates a text/JSON summary of the current session that can be
 * copy-pasted, shared via link, or exported as a "session card":
 * - Track list with LUFS/peak readings
 * - Mastering settings applied
 * - Key/BPM if detected
 * - Notes from the Production Notes pad
 * - QR code for the shareable URL (if deployed)
 *
 * Primarily useful for sharing session state with a mix engineer,
 * or for posting a "session screenshot" on social media.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getMasteringHistory } from '../services/masteringHistory';
import { getMarkers } from '../services/waveformAnnotations';

interface TrackInfo {
  id: string;
  name: string;
  regions: Array<{ durationSec: number; takes: Array<{ blob: Blob }> }>;
}

interface CollabSharePanelProps {
  tracks: TrackInfo[];
  sessionName?: string;
  onClose: () => void;
}

function drawSessionCard(canvas: HTMLCanvasElement, data: {
  sessionName: string;
  tracks: string[];
  lastMaster?: { platform: string; genre: string; lufs: number };
  markerCount: number;
  date: string;
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#060a10');
  grad.addColorStop(1, '#0a0f1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Top accent line
  const accentGrad = ctx.createLinearGradient(0, 0, W, 0);
  accentGrad.addColorStop(0, '#22d3ee');
  accentGrad.addColorStop(0.5, '#a855f7');
  accentGrad.addColorStop(1, '#22d3ee');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(0, 0, W, 3);

  // Logo
  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ECHO SOUND LAB', 24, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '9px monospace';
  ctx.fillText('Professional Audio Mastering', 24, 44);

  // Session name
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(data.sessionName || 'My Session', 24, 90);

  // Date
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px monospace';
  ctx.fillText(data.date, 24, 108);

  // Track list
  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('TRACKS', 24, 140);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '10px sans-serif';
  data.tracks.slice(0, 6).forEach((track, i) => {
    ctx.fillText(`${i + 1}. ${track}`, 24, 158 + i * 18);
  });
  if (data.tracks.length > 6) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(`+ ${data.tracks.length - 6} more`, 24, 158 + 6 * 18);
  }

  // Master info box
  if (data.lastMaster) {
    const boxX = W - 180;
    const boxY = 130;
    ctx.fillStyle = 'rgba(34,211,238,0.08)';
    ctx.strokeStyle = 'rgba(34,211,238,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, 156, 100, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('LAST MASTER', W - 24, 148);

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '9px sans-serif';
    ctx.fillText(data.lastMaster.platform, W - 24, 168);
    ctx.fillText(data.lastMaster.genre, W - 24, 184);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`${data.lastMaster.lufs.toFixed(1)} LUFS`, W - 24, 208);
  }

  // Bottom stats row
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, H - 48, W, 48);

  ctx.textAlign = 'left';
  const statItems = [
    { label: 'TRACKS', value: data.tracks.length.toString() },
    { label: 'MARKERS', value: data.markerCount.toString() },
    { label: 'POWERED BY', value: 'Echo Sound Lab' },
  ];
  statItems.forEach((s, i) => {
    const x = 24 + i * 140;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '7px monospace';
    ctx.fillText(s.label, x, H - 30);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(s.value, x, H - 16);
  });
}

export const CollabSharePanel: React.FC<CollabSharePanelProps> = ({
  tracks, sessionName = 'My Session', onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const history = getMasteringHistory();
  const markers = getMarkers();
  const lastMaster = history[0];

  useEffect(() => {
    if (!canvasRef.current) return;
    drawSessionCard(canvasRef.current, {
      sessionName,
      tracks: tracks.map(t => t.name),
      lastMaster: lastMaster ? {
        platform: lastMaster.platform,
        genre: lastMaster.genre || lastMaster.detectedGenre || 'Auto',
        lufs: lastMaster.appliedLUFS ?? -14,
      } : undefined,
      markerCount: markers.length,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    });
  }, [tracks, sessionName, lastMaster, markers.length]);

  const sessionText = `
Echo Sound Lab â€Session Summary
==================================
Session: ${sessionName}
Date: ${new Date().toLocaleDateString()}

Tracks (${tracks.length}):
${tracks.map((t, i) => `  ${i + 1}. ${t.name}`).join('\n')}

${lastMaster ? `Last Mastering Run:
  Platform: ${lastMaster.platform}
  Genre: ${lastMaster.genre}
  LUFS: ${lastMaster.appliedLUFS?.toFixed(1) ?? 'â€”'} LUFS
  Gain: ${lastMaster.gainApplied != null ? (lastMaster.gainApplied > 0 ? '+' : '') + lastMaster.gainApplied.toFixed(1) + ' dB' : 'â€”'}
` : ''}
Markers: ${markers.length > 0 ? markers.map(m => `  ${Math.floor(m.time / 60)}:${String(Math.floor(m.time % 60)).padStart(2, '0')} â€${m.label}`).join('\n') : 'None'}

Powered by Echo Sound Lab Âhttps://echo-sound-lab.vercel.app
  `.trim();

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sessionText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [sessionText]);

  const downloadCard = useCallback(() => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName.replace(/\s+/g, '_')}_session_card.png`;
    a.click();
  }, [sessionName]);

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
        className="w-full max-w-lg bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Share Session</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Export a session card or copy session summary
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">âœ•</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Session card preview */}
          <div className="rounded-xl overflow-hidden border border-white/[0.06]">
            <canvas
              ref={canvasRef}
              width={480}
              height={280}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={downloadCard}
              className="py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[10px] text-slate-300 hover:bg-white/[0.06] transition-all font-semibold uppercase tracking-widest"
            >
              â†Download card (PNG)
            </button>
            <button
              onClick={copyText}
              className={`py-3 rounded-xl border transition-all font-semibold text-[10px] uppercase tracking-widest ${
                copied
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-300 hover:bg-cyan-500/10'
              }`}
            >
              {copied ? 'âœCopied!' : 'ðŸ“Copy text summary'}
            </button>
          </div>

          {/* Text preview */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-2">Text summary preview</p>
            <pre className="text-[8px] text-slate-500 font-mono whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-40">
              {sessionText}
            </pre>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
