/**
 * ClickRepairPanel ‚ÄDetect and repair clicks/pops/dropouts
 *
 * Uses a two-pass algorithm:
 * 1. Detection: find samples where the signal jumps by more than
 *    a threshold relative to local RMS (click signature)
 * 2. Repair: replace flagged samples with linear interpolation
 *    from their neighbors (cubic spline-like restoration)
 *
 * Shows:
 * - Number of clicks detected
 * - A marker list of click positions
 * - Before/after waveform view
 * - Sensitivity and max repair length sliders
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ClickRepairPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

interface ClickInfo {
  time: number;
  amplitude: number;
  length: number;
}

function detectAndRepair(
  buffer: AudioBuffer,
  sensitivity: number,
  maxRepairSamples: number,
): { output: AudioBuffer; clicks: ClickInfo[] } {
  const numCh = buffer.numberOfChannels;
  const n = buffer.length;
  const sr = buffer.sampleRate;
  const windowSize = 256;

  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(numCh, n, sr);
  const allClicks: ClickInfo[] = [];

  for (let c = 0; c < numCh; c++) {
    const inData = buffer.getChannelData(c);
    const outData = out.getChannelData(c);

    // Copy
    for (let i = 0; i < n; i++) outData[i] = inData[i];

    // Compute local RMS in windows
    const localRms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - windowSize / 2);
      const end = Math.min(n, i + windowSize / 2);
      let sum = 0;
      for (let j = start; j < end; j++) sum += inData[j] * inData[j];
      localRms[i] = Math.sqrt(sum / (end - start));
    }

    // Detect clicks: sample-to-sample delta >> local RMS * sensitivity
    let i = 1;
    while (i < n - 1) {
      const delta = Math.abs(inData[i] - inData[i - 1]);
      const rms = localRms[i] || 0.0001;
      const threshold = rms * sensitivity * 10;

      if (delta > threshold && delta > 0.01) {
        // Found a click ‚Ädetermine repair length
        let repairLen = 1;
        while (repairLen < maxRepairSamples && i + repairLen < n) {
          const nextDelta = Math.abs(inData[i + repairLen] - inData[i + repairLen - 1]);
          if (nextDelta < threshold * 0.5) break;
          repairLen++;
        }

        // Linear interpolation repair
        const before = outData[i - 1];
        const after = i + repairLen < n ? inData[i + repairLen] : before;
        for (let j = 0; j < repairLen; j++) {
          outData[i + j] = before + (after - before) * ((j + 1) / (repairLen + 1));
        }

        if (c === 0) {
          allClicks.push({
            time: i / sr,
            amplitude: delta,
            length: repairLen,
          });
        }

        i += repairLen + 1;
      } else {
        i++;
      }
    }
  }

  // Deduplicate clicks by merging those within 5ms
  const deduped: ClickInfo[] = [];
  for (const click of allClicks.sort((a, b) => a.time - b.time)) {
    if (deduped.length === 0 || click.time - deduped[deduped.length - 1].time > 0.005) {
      deduped.push(click);
    }
  }

  return { output: out, clicks: deduped };
}

function drawComparisonWaveform(
  canvas: HTMLCanvasElement,
  before: AudioBuffer,
  after: AudioBuffer,
  clicks: ClickInfo[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width; const H = canvas.height;
  ctx.fillStyle = '#0a0f1a';
  ctx.fillRect(0, 0, W, H);

  const drawWave = (buf: AudioBuffer, yOff: number, h: number, color: string) => {
    const data = buf.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const mid = yOff + h / 2;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let j = 0; j < step; j++) { const s = Math.abs(data[x * step + j] || 0); if (s > max) max = s; }
      if (x === 0) ctx.moveTo(x, mid - max * h * 0.45); else ctx.lineTo(x, mid - max * h * 0.45);
    }
    for (let x = W - 1; x >= 0; x--) {
      let max = 0;
      for (let j = 0; j < step; j++) { const s = Math.abs(data[x * step + j] || 0); if (s > max) max = s; }
      ctx.lineTo(x, mid + max * h * 0.45);
    }
    ctx.closePath();
    ctx.fillStyle = color + '30'; ctx.fill();
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let j = 0; j < step; j++) { const s = Math.abs(data[x * step + j] || 0); if (s > max) max = s; }
      if (x === 0) ctx.moveTo(x, mid - max * h * 0.45); else ctx.lineTo(x, mid - max * h * 0.45);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  };

  const half = H / 2 - 2;
  drawWave(before, 0, half, '#22d3ee');
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, half, W, 4);
  drawWave(after, half + 4, half, '#10b981');

  // Mark clicks on top half
  const dur = before.duration;
  for (const click of clicks.slice(0, 100)) {
    const x = (click.time / dur) * W;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 0.5, 0, 1, half);
  }

  // Labels
  ctx.fillStyle = '#22d3ee'; ctx.font = '7px monospace'; ctx.textAlign = 'left';
  ctx.fillText('BEFORE', 4, 9);
  ctx.fillStyle = '#10b981';
  ctx.fillText('AFTER', 4, half + 13);
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

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toFixed(3);
  return `${m}:${ss.padStart(6, '0')}`;
}

export const ClickRepairPanel: React.FC<ClickRepairPanelProps> = ({ buffer, onClose }) => {
  const [sensitivity, setSensitivity] = useState(3);
  const [maxRepair, setMaxRepair] = useState(8);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [clicks, setClicks] = useState<ClickInfo[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const analyze = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    await new Promise(r => setTimeout(r, 10));
    const { output, clicks: detected } = detectAndRepair(buffer, sensitivity, maxRepair);
    setResult(output);
    setClicks(detected);
    const url = bufferToUrl(output);
    setResultUrl(url);
    if (canvasRef.current) drawComparisonWaveform(canvasRef.current, buffer, output, detected);
    setProcessing(false);
  }, [buffer, sensitivity, maxRepair, resultUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }, [playing]);

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const severityColor = (amp: number) => amp > 0.3 ? '#ef4444' : amp > 0.1 ? '#f59e0b' : '#64748b';

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
            <h2 className="text-sm font-bold text-white">Click Repair</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Detect and interpolate clicks, pops, and digital dropouts</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Waveform */}
              <canvas ref={canvasRef} width={400} height={100} className="w-full rounded-xl border border-white/[0.06] bg-slate-900" />

              {/* Controls */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-slate-500">Sensitivity</span>
                    <span className="text-[9px] font-mono text-cyan-400">{sensitivity.toFixed(1)}√ó</span>
                  </div>
                  <input type="range" min={1} max={10} step={0.1} value={sensitivity}
                    onChange={e => setSensitivity(Number(e.target.value))} className="w-full accent-cyan-400" />
                  <p className="text-[7px] text-slate-700">Higher = more clicks detected (may catch musical transients too)</p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-slate-500">Max repair length</span>
                    <span className="text-[9px] font-mono text-purple-400">{maxRepair} samples ({(maxRepair / (buffer.sampleRate / 1000)).toFixed(2)} ms)</span>
                  </div>
                  <input type="range" min={2} max={64} step={1} value={maxRepair}
                    onChange={e => setMaxRepair(Number(e.target.value))} className="w-full accent-purple-400" />
                  <p className="text-[7px] text-slate-700">Max contiguous samples to interpolate per click</p>
                </div>
              </div>

              <button onClick={analyze} disabled={processing}
                className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white hover:bg-red-500/15 transition-all disabled:opacity-40">
                {processing ? '‚èAnalyzing & repairing‚Ä¶' : 'üîDetect & Repair Clicks'}
              </button>

              {/* Click list */}
              {clicks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-slate-600 uppercase tracking-widest">{clicks.length} click{clicks.length !== 1 ? 's' : ''} detected</p>
                    <p className="text-[8px] text-slate-700">Red lines on waveform</p>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {clicks.slice(0, 50).map((c, i) => (
                      <div key={i} className="flex items-center gap-3 px-2 py-1 rounded-lg border border-white/[0.04] bg-white/[0.01]">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: severityColor(c.amplitude) }} />
                        <span className="text-[8px] font-mono text-slate-500 w-20">{formatTime(c.time)}</span>
                        <span className="text-[8px] text-slate-600 flex-1">{c.length} sample{c.length !== 1 ? 's' : ''}</span>
                        <span className="text-[8px] font-mono" style={{ color: severityColor(c.amplitude) }}>Œî{c.amplitude.toFixed(3)}</span>
                      </div>
                    ))}
                    {clicks.length > 50 && <p className="text-[8px] text-slate-700 text-center">+{clicks.length - 50} more</p>}
                  </div>
                </div>
              )}

              {clicks.length === 0 && result && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-center">
                  <p className="text-[10px] text-emerald-300">‚úNo clicks detected at this sensitivity level</p>
                </div>
              )}

              <AnimatePresence>
                {result && resultUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">
                      ‚ú{clicks.length} click{clicks.length !== 1 ? 's' : ''} repaired
                    </p>
                    <audio ref={audioRef} src={resultUrl} onEnded={() => setPlaying(false)} />
                    <div className="flex gap-2">
                      <button onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = resultUrl; a.download = `click_repaired_${clicks.length}fixes.wav`; a.click();
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
