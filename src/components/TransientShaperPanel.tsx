/**
 * TransientShaperPanel ‚ÄEnhance or soften attack transients
 *
 * Uses envelope-following to detect transients:
 * - Fast follower tracks attack (fast attack/release)
 * - Slow follower tracks sustain (slow attack/release)
 * - Difference = transient detection signal
 *
 * Attack knob: boosts or attenuates the transient burst
 * Sustain knob: boosts or attenuates the sustain tail
 *
 * Great for:
 * - Making drums punchier (+attack, -sustain)
 * - Making pads smoother (-attack, +sustain)
 * - Adding snap to a dull mix
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TransientShaperPanelProps {
  buffer: AudioBuffer | null;
  onClose: () => void;
}

function applyTransientShaper(
  buffer: AudioBuffer,
  attackGainDb: number,
  sustainGainDb: number,
  sensitivity: number,
): AudioBuffer {
  const n = buffer.length;
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;

  const attackGain = Math.pow(10, attackGainDb / 20);
  const sustainGain = Math.pow(10, sustainGainDb / 20);

  // Time constants
  const fastAttackSamples = Math.round(0.001 * sr);  // 1ms
  const fastReleaseSamples = Math.round(0.005 * sr); // 5ms
  const slowAttackSamples = Math.round(0.015 * sr);  // 15ms
  const slowReleaseSamples = Math.round(0.150 * sr); // 150ms

  const outCtx = new AudioContext();
  const out = outCtx.createBuffer(numCh, n, sr);

  for (let c = 0; c < numCh; c++) {
    const inData = buffer.getChannelData(c);
    const outData = out.getChannelData(c);

    let fastEnv = 0;
    let slowEnv = 0;

    for (let i = 0; i < n; i++) {
      const abs = Math.abs(inData[i]);

      // Fast envelope follower
      if (abs > fastEnv) fastEnv += (abs - fastEnv) / fastAttackSamples;
      else fastEnv += (abs - fastEnv) / fastReleaseSamples;

      // Slow envelope follower
      if (abs > slowEnv) slowEnv += (abs - slowEnv) / slowAttackSamples;
      else slowEnv += (abs - slowEnv) / slowReleaseSamples;

      // Transient = difference (fast ‚àslow), clamped to [0,1]
      const transient = Math.max(0, Math.min(1, (fastEnv - slowEnv) * sensitivity * 10));
      const sustain = 1 - transient;

      // Apply gains
      const totalGain = transient * attackGain + sustain * sustainGain;
      outData[i] = inData[i] * totalGain;
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
  { name: 'Punchier drums', attackGain: 6, sustainGain: -4, sensitivity: 1.0 },
  { name: 'Add snap', attackGain: 4, sustainGain: 0, sensitivity: 0.8 },
  { name: 'Smooth sustain', attackGain: -3, sustainGain: 3, sensitivity: 0.7 },
  { name: 'Transparent', attackGain: 0, sustainGain: 0, sensitivity: 1.0 },
  { name: 'Hard hit', attackGain: 10, sustainGain: -8, sensitivity: 1.2 },
  { name: 'Soft pad', attackGain: -6, sustainGain: 4, sensitivity: 0.5 },
];

export const TransientShaperPanel: React.FC<TransientShaperPanelProps> = ({ buffer, onClose }) => {
  const [attackGain, setAttackGain] = useState(0);
  const [sustainGain, setSustainGain] = useState(0);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AudioBuffer | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const apply = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    await new Promise(r => setTimeout(r, 10));
    const out = applyTransientShaper(buffer, attackGain, sustainGain, sensitivity);
    setResult(out);
    setResultUrl(bufferToUrl(out));
    setProcessing(false);
  }, [buffer, attackGain, sustainGain, sensitivity, resultUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }, [playing]);

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const attackColor = attackGain > 0 ? '#22d3ee' : attackGain < 0 ? '#ef4444' : '#64748b';
  const sustainColor = sustainGain > 0 ? '#a855f7' : sustainGain < 0 ? '#f59e0b' : '#64748b';

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
            <h2 className="text-sm font-bold text-white">Transient Shaper</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Shape attack punch and sustain tail independently</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">‚úï</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!buffer && <p className="text-amber-400 text-sm text-center py-6">Load a track first</p>}

          {buffer && (
            <>
              {/* Visual overview */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4">
                {/* Attack indicator */}
                <div className="flex-1 text-center">
                  <div className="w-8 h-8 mx-auto rounded-full border-2 flex items-center justify-center mb-1"
                    style={{ borderColor: attackColor, background: attackColor + '15' }}>
                    <span className="text-[10px] font-bold" style={{ color: attackColor }}>A</span>
                  </div>
                  <p className="text-[8px] text-slate-600">Attack</p>
                  <p className="text-[10px] font-mono font-bold" style={{ color: attackColor }}>
                    {attackGain > 0 ? '+' : ''}{attackGain} dB
                  </p>
                </div>

                {/* Envelope diagram */}
                <div className="flex-1">
                  <svg viewBox="0 0 80 40" className="w-full" style={{ height: 40 }}>
                    <polyline points="0,38 10,4 20,20 70,28 80,28" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6" />
                    <circle cx="10" cy="4" r="2" fill="#22d3ee" />
                    <circle cx="20" cy="20" r="2" fill="#a855f7" />
                    <text x="8" y="3" fill="#22d3ee" fontSize="4">ATK</text>
                    <text x="18" y="30" fill="#a855f7" fontSize="4">SUS</text>
                  </svg>
                </div>

                {/* Sustain indicator */}
                <div className="flex-1 text-center">
                  <div className="w-8 h-8 mx-auto rounded-full border-2 flex items-center justify-center mb-1"
                    style={{ borderColor: sustainColor, background: sustainColor + '15' }}>
                    <span className="text-[10px] font-bold" style={{ color: sustainColor }}>S</span>
                  </div>
                  <p className="text-[8px] text-slate-600">Sustain</p>
                  <p className="text-[10px] font-mono font-bold" style={{ color: sustainColor }}>
                    {sustainGain > 0 ? '+' : ''}{sustainGain} dB
                  </p>
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => {
                    setAttackGain(p.attackGain);
                    setSustainGain(p.sustainGain);
                    setSensitivity(p.sensitivity);
                  }}
                    className="text-[8px] px-2.5 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all">
                    {p.name}
                  </button>
                ))}
              </div>

              {/* Controls */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-slate-500">Attack gain</span>
                    <span className="text-[9px] font-mono" style={{ color: attackColor }}>{attackGain > 0 ? '+' : ''}{attackGain} dB</span>
                  </div>
                  <input type="range" min={-12} max={12} step={0.5} value={attackGain}
                    onChange={e => setAttackGain(Number(e.target.value))} className="w-full" style={{ accentColor: '#22d3ee' }} />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-slate-500">Sustain gain</span>
                    <span className="text-[9px] font-mono" style={{ color: sustainColor }}>{sustainGain > 0 ? '+' : ''}{sustainGain} dB</span>
                  </div>
                  <input type="range" min={-12} max={12} step={0.5} value={sustainGain}
                    onChange={e => setSustainGain(Number(e.target.value))} className="w-full" style={{ accentColor: '#a855f7' }} />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[9px] text-slate-500">Sensitivity</span>
                    <span className="text-[9px] font-mono text-slate-400">{sensitivity.toFixed(1)}√ó</span>
                  </div>
                  <input type="range" min={0.1} max={2.0} step={0.05} value={sensitivity}
                    onChange={e => setSensitivity(Number(e.target.value))} className="w-full accent-slate-400" />
                  <p className="text-[7px] text-slate-700">Lower = fewer transients detected, higher = more aggressive shaping</p>
                </div>
              </div>

              <button onClick={apply} disabled={processing || (attackGain === 0 && sustainGain === 0)}
                className="w-full py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest text-slate-200 hover:text-white hover:bg-cyan-500/15 transition-all disabled:opacity-40">
                {processing ? '‚èProcessing‚Ä¶' : '‚ñApply Shaper'}
              </button>

              <AnimatePresence>
                {result && resultUrl && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
                    <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest">‚úTransients shaped</p>
                    <audio ref={audioRef} src={resultUrl} onEnded={() => setPlaying(false)} />
                    <div className="flex gap-2">
                      <button onClick={togglePlay}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold uppercase tracking-widest hover:bg-emerald-500/25 transition-all">
                        {playing ? '‚èPause' : '‚ñPreview'}
                      </button>
                      <button onClick={() => {
                        const a = document.createElement('a');
                        a.href = resultUrl; a.download = `transient_shaped_atk${attackGain}_sus${sustainGain}.wav`; a.click();
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
