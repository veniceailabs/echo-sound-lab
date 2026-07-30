/**
 * NoiseGatePanel ‚ÄNoise gate / downward expander
 *
 * Applies a noise gate to the audio buffer:
 * - Threshold: gate opens when signal exceeds threshold
 * - Attack: how fast the gate opens (ms)
 * - Release: how fast the gate closes after signal drops below threshold (ms)
 * - Hold: minimum time gate stays open after signal drops (ms)
 * - Floor: how much to attenuate when gate is closed (dB, not full cut)
 * - Lookahead: reads ahead so gate opens before the transient (ms)
 *
 * Shows before/after waveform and reports how much silence was gated.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NoiseGatePanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

interface GateSettings {
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
  holdMs: number;
  floorDb: number;
}

const DEFAULTS: GateSettings = {
  thresholdDb: -40,
  attackMs: 5,
  releaseMs: 150,
  holdMs: 50,
  floorDb: -80,
};

const PRESETS: Array<{ name: string; settings: GateSettings }> = [
  { name: 'Light cleanup', settings: { thresholdDb: -50, attackMs: 5, releaseMs: 200, holdMs: 50, floorDb: -60 } },
  { name: 'Drum gate', settings: { thresholdDb: -30, attackMs: 1, releaseMs: 80, holdMs: 20, floorDb: -80 } },
  { name: 'Vocal cleanup', settings: { thresholdDb: -45, attackMs: 10, releaseMs: 300, holdMs: 100, floorDb: -80 } },
  { name: 'Aggressive', settings: { thresholdDb: -20, attackMs: 1, releaseMs: 50, holdMs: 10, floorDb: -80 } },
  { name: 'Noise floor', settings: { thresholdDb: -55, attackMs: 20, releaseMs: 500, holdMs: 200, floorDb: -80 } },
];

function applyGate(buffer: AudioBuffer, settings: GateSettings): { output: AudioBuffer; gatedPct: number } {
  const { thresholdDb, attackMs, releaseMs, holdMs, floorDb } = settings;
  const threshold = Math.pow(10, thresholdDb / 20);
  const floor = Math.pow(10, floorDb / 20);
  const sr = buffer.sampleRate;
  const attackSamples = Math.round(attackMs * sr / 1000);
  const releaseSamples = Math.round(releaseMs * sr / 1000);
  const holdSamples = Math.round(holdMs * sr / 1000);
  const n = buffer.length;
  const numCh = buffer.numberOfChannels;

  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(numCh, n, sr);

  // Compute envelope from first channel
  const env = new Float32Array(n);
  const ch0 = buffer.getChannelData(0);
  // Peak follower
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(ch0[i]);
    if (abs > peak) peak = abs;
    else peak *= (1 - 1 / releaseSamples);
    env[i] = peak;
  }

  // Gate state machine
  const gainEnv = new Float32Array(n);
  let gateOpen = false;
  let holdCount = 0;
  let currentGain = floor;
  let gatedSamples = 0;

  for (let i = 0; i < n; i++) {
    const above = env[i] >= threshold;
    if (above) {
      gateOpen = true;
      holdCount = holdSamples;
    } else if (holdCount > 0) {
      holdCount--;
    } else {
      gateOpen = false;
    }

    const targetGain = gateOpen ? 1.0 : floor;
    if (targetGain > currentGain) {
      currentGain += (targetGain - currentGain) / attackSamples;
    } else {
      currentGain += (targetGain - currentGain) / releaseSamples;
    }
    gainEnv[i] = currentGain;
    if (currentGain < 0.5) gatedSamples++;
  }

  for (let c = 0; c < numCh; c++) {
    const inData = buffer.getChannelData(c);
    const outData = out.getChannelData(c);
    for (let i = 0; i < n; i++) {
      outData[i] = inData[i] * gainEnv[i];
    }
  }

  return { output: out, gatedPct: (gatedSamples / n) * 100 };
}

function drawWaveformComparison(
  canvas: HTMLCanvasElement,
  before: AudioBuffer,
  after: AudioBuffer,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width; const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const drawHalf = (buf: AudioBuffer, yOffset: number, height: number, color: string) => {
    const data = buf.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const mid = yOffset + height / 2;

    ctx.fillStyle = color + '15';
    ctx.fillRect(0, yOffset, W, height);

    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const s = Math.abs(data[x * step + j] || 0);
        if (s > max) max = s;
      }
      const h2 = max * (height / 2) * 0.9;
      if (x === 0) {
        ctx.moveTo(x, mid - h2);
      } else {
        ctx.lineTo(x, mid - h2);
      }
    }
    for (let x = W - 1; x >= 0; x--) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const s = Math.abs(data[x * step + j] || 0);
        if (s > max) max = s;
      }
      const h2 = max * (height / 2) * 0.9;
      ctx.lineTo(x, mid + h2);
    }
    ctx.closePath();
    ctx.fillStyle = color + '35';
    ctx.fill();

    // Outline
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const s = Math.abs(data[x * step + j] || 0);
        if (s > max) max = s;
      }
      const h2 = max * (height / 2) * 0.9;
      if (x === 0) ctx.moveTo(x, mid - h2); else ctx.lineTo(x, mid - h2);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(color === '#22d3ee' ? 'BEFORE' : 'AFTER', 4, yOffset + 9);
  };

  const half = H / 2 - 2;
  drawHalf(before, 0, half, '#22d3ee');
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, half, W, 4);
  drawHalf(after, half + 4, half, '#10b981');
}

function bufferToUrl(buf: AudioBuffer): string {
  const numCh = buf.numberOfChannels; const len = buf.length; const rate = buf.sampleRate;
  const ab = new ArrayBuffer(44+len*numCh*2); const view = new DataView(ab);
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

const Slider = ({ label, value, min, max, step, unit, onChange, color = '#22d3ee' }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; color?: string;
}) => (
  <div className="flex items-center gap-3">
    <span className="text-[8px] text-slate-500 w-20 flex-shrink-0">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="flex-1" style={{ accentColor: color }} />
    <span className="text-[9px] font-mono w-16 text-right flex-shrink-0" style={{ color }}>
      {value > 0 ? '+' : ''}{value}{unit}
    </span>
  </div>
);

export const NoiseGatePanel: React.FC<NoiseGatePanelProps> = ({ buffer, onClose }) => {
  const [settings, setSettings] = useState<GateSettings>(DEFAULTS);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [gatedPct, setGatedPct] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);

  const set = (k: keyof GateSettings) => (v: number) => setSettings(prev => ({ ...prev, [k]: v }));

  const apply = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    await new Promise(r => setTimeout(r, 10));
    const { output, gatedPct: pct } = applyGate(buffer, settings);
    setResult(output);
    setGatedPct(pct);
    const url = bufferToUrl(output);
    setResultUrl(url);
    if (waveRef.current) drawWaveformComparison(waveRef.current, buffer, output);
    setProcessing(false);
  }, [buffer, settings, resultUrl]);

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
            <h2 className="text-sm font-bold text-white">Noise Gate</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Attenuate signals below threshold ¬before/after comparison</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Waveform comparison */}
              <canvas ref={waveRef} width={400} height={100} className="w-full rounded-xl border border-white/[0.06] bg-slate-900" />

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => setSettings(p.settings)}
                    className="text-[8px] px-2.5 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all">
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Controls */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2.5">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">Parameters</p>
                <Slider label="Threshold" value={settings.thresholdDb} min={-80} max={0} step={1} unit=" dB" onChange={set('thresholdDb')} color="#ef4444" />
                <Slider label="Attack" value={settings.attackMs} min={0.1} max={100} step={0.1} unit=" ms" onChange={set('attackMs')} color="#22d3ee" />
                <Slider label="Hold" value={settings.holdMs} min={0} max={500} step={5} unit=" ms" onChange={set('holdMs')} color="#a855f7" />
                <Slider label="Release" value={settings.releaseMs} min={1} max={2000} step={1} unit=" ms" onChange={set('releaseMs')} color="#f59e0b" />
                <Slider label="Floor" value={settings.floorDb} min={-80} max={-6} step={1} unit=" dB" onChange={set('floorDb')} color="#10b981" />
              </div>

              {gatedPct != null && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex items-center justify-between">
                  <span className="text-[9px] text-slate-500">Audio gated</span>
                  <span className={`text-[9px] font-mono font-bold ${gatedPct > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{gatedPct.toFixed(1)}%</span>
                </div>
              )}

              <button
                onClick={apply}
                disabled={processing}
                className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white hover:bg-red-500/15 transition-all disabled:opacity-40"
              >
                {processing ? '‚èProcessing‚Ä¶' : '‚ñApply Gate'}
              </button>

              <AnimatePresence>
                {result && resultUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">‚úGate applied ¬{gatedPct?.toFixed(1)}% reduced</p>
                    <audio ref={audioRef} src={resultUrl} onEnded={() => setPlaying(false)} />
                    <div className="flex gap-2">
                      <button onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = resultUrl; a.download = `noise_gated_${settings.thresholdDb}dB.wav`; a.click();
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-all">
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
