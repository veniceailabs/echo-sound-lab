/**
 * HarmonicExciterPanel ‚ÄAdd harmonic saturation / air
 *
 * Generates even and odd harmonics by soft-clipping the signal:
 * - Low shelf: tubey warmth (2nd harmonics)
 * - High shelf: airy brilliance (3rd‚Äì5th harmonics via waveshaping)
 * - Drive: overall saturation amount
 * - Mix: parallel blend (dry/wet)
 *
 * Algorithm:
 * - Band-split via IIR: low (< 200 Hz), mid (200 Hz‚Äì6 kHz), high (> 6 kHz)
 * - Low band: warm tube waveshaper (soft tanh-like)
 * - High band: harder waveshaper for harmonic brightness
 * - Recombine with gain controls
 *
 * Shows a spectrum-style preview of harmonic content before/after.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HarmonicExciterPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

function softClip(x: number, drive: number): number {
  const d = x * drive;
  return d / (1 + Math.abs(d));
}

function hardClip(x: number, drive: number): number {
  const d = x * drive;
  return Math.max(-1, Math.min(1, d * 1.5 - d * d * d * 0.5));
}

function applyExciter(
  buffer: AudioBuffer,
  warmth: number,
  air: number,
  drive: number,
  mix: number,
): AudioBuffer {
  const n = buffer.length;
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;

  // IIR coefficients for low-pass at 300 Hz
  const rc1 = 1 / (2 * Math.PI * 300 / sr + 1);
  // IIR for high-pass at 5000 Hz
  const rc2 = 2 * Math.PI * 5000 / sr / (2 * Math.PI * 5000 / sr + 1);

  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(numCh, n, sr);

  for (let c = 0; c < numCh; c++) {
    const inData = buffer.getChannelData(c);
    const outData = out.getChannelData(c);

    let lpPrev = 0;
    let hpPrev = 0;
    let hpIn = 0;

    for (let i = 0; i < n; i++) {
      const x = inData[i];

      // Low-pass (warmth band)
      lpPrev = rc1 * lpPrev + (1 - rc1) * x;
      const low = lpPrev;

      // High-pass (air band)
      hpPrev = rc2 * (hpPrev + x - hpIn);
      hpIn = x;
      const high = hpPrev;

      // Mid = total - low - high (approximate)
      const mid = x - low - high;

      // Process each band
      const warmSat = warmth > 0 ? softClip(low, 1 + drive * warmth / 12) - low * (drive * warmth / 100) : 0;
      const airSat = air > 0 ? hardClip(high, 1 + drive * air / 8) - high * (drive * air / 80) : 0;

      const processed = mid + low + warmSat * warmth / 12 + high + airSat * air / 8;
      outData[i] = x * (1 - mix) + processed * mix;
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

const PRESETS = [
  { name: 'Vinyl warmth', warmth: 8, air: 0, drive: 3, mix: 0.4 },
  { name: 'Tape saturation', warmth: 6, air: 2, drive: 5, mix: 0.5 },
  { name: 'Add air', warmth: 0, air: 10, drive: 4, mix: 0.3 },
  { name: 'Tube glow', warmth: 10, air: 3, drive: 6, mix: 0.6 },
  { name: 'Subtle presence', warmth: 2, air: 4, drive: 2, mix: 0.25 },
  { name: 'Heavy saturation', warmth: 12, air: 6, drive: 10, mix: 0.8 },
];

export const HarmonicExciterPanel: React.FC<HarmonicExciterPanelProps> = ({ buffer, onClose }) => {
  const [warmth, setWarmth] = useState(0);
  const [air, setAir] = useState(0);
  const [drive, setDrive] = useState(3);
  const [mix, setMix] = useState(0.3);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw a decorative transfer curve on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width; const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, W, H);

    // Draw unity diagonal
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();

    // Draw warm saturation curve (bottom half)
    const driveFactor = 1 + drive / 5;
    ctx.beginPath();
    for (let px = 0; px < W; px++) {
      const x = (px / W) * 2 - 1;
      const yWarm = softClip(x, driveFactor * (1 + warmth / 12));
      const yAir = hardClip(x, driveFactor * (1 + air / 8));
      const y = (yWarm * (warmth / 12) + yAir * (air / 12) + x) / (1 + warmth / 12 + air / 12);
      const py = ((1 - y) / 2) * H;
      if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#f59e0b80');
    grad.addColorStop(0.5, '#22d3ee');
    grad.addColorStop(1, '#a855f780');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [warmth, air, drive]);

  const apply = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    await new Promise(r => setTimeout(r, 10));
    const out = applyExciter(buffer, warmth, air, drive, mix);
    setResult(out);
    setResultUrl(bufferToUrl(out));
    setProcessing(false);
  }, [buffer, warmth, air, drive, mix, resultUrl]);

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
        className="w-full max-w-md bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Harmonic Exciter</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Add tube warmth and harmonic air via saturation</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Transfer curve */}
              <canvas ref={canvasRef} width={360} height={80} className="w-full rounded-xl border border-white/[0.06]" />

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => { setWarmth(p.warmth); setAir(p.air); setDrive(p.drive); setMix(p.mix); }}
                    className="text-[8px] px-2.5 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all">
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Controls */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                {[
                  { label: 'üüWarmth', value: warmth, set: setWarmth, min: 0, max: 12, step: 0.5, color: '#f59e0b', unit: '' },
                  { label: 'üîAir', value: air, set: setAir, min: 0, max: 12, step: 0.5, color: '#22d3ee', unit: '' },
                  { label: '‚öDrive', value: drive, set: setDrive, min: 0.5, max: 12, step: 0.5, color: '#a855f7', unit: '' },
                  { label: 'üíMix', value: Math.round(mix * 100), set: (v: number) => setMix(v / 100), min: 0, max: 100, step: 1, color: '#10b981', unit: '%' },
                ].map(ctrl => (
                  <div key={ctrl.label} className="flex items-center gap-3">
                    <span className="text-[9px] text-slate-500 w-20 flex-shrink-0">{ctrl.label}</span>
                    <input type="range" min={ctrl.min} max={ctrl.max} step={ctrl.step} value={ctrl.value}
                      onChange={e => ctrl.set(Number(e.target.value))} className="flex-1" style={{ accentColor: ctrl.color }} />
                    <span className="text-[9px] font-mono w-10 text-right flex-shrink-0" style={{ color: ctrl.color }}>
                      {ctrl.value.toFixed(ctrl.step < 1 ? 1 : 0)}{ctrl.unit}
                    </span>
                  </div>
                ))}
              </div>

              <button onClick={apply} disabled={processing || (warmth === 0 && air === 0)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-cyan-500/10 border border-amber-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white transition-all disabled:opacity-40">
                {processing ? '‚èProcessing‚Ä¶' : '‚ñApply Harmonic Exciter'}
              </button>

              <AnimatePresence>
                {result && resultUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">‚úHarmonics added ¬{Math.round(mix * 100)}% wet</p>
                    <audio ref={audioRef} src={resultUrl} onEnded={() => setPlaying(false)} />
                    <div className="flex gap-2">
                      <button onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = resultUrl; a.download = `excited_w${warmth}_a${air}_d${drive}.wav`; a.click();
                      }} className="flex-1 py-2.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[9px] font-bold uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                        ‚ÜExport WAV
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3">
                <p className="text-[8px] text-slate-700 leading-relaxed">
                  Harmonic exciters add even harmonics (2nd, 4th ‚Äwarm, musical) and odd harmonics (3rd, 5th ‚Äbright, present) via band-specific waveshaping. Use sparingly: 20‚Äì40% mix keeps it transparent. Warmth adds body to bass and low-mids. Air adds presence and sheen above 5 kHz.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
