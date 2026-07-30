/**
 * BeatMachine �16-step drum sequencer with synthesized drums
 *
 * 8 drum instruments, all synthesized via WebAudio (no samples needed):
 *   Kick   �sine sweep 150→40Hz + short noise burst
 *   Snare  �white noise + 180Hz sine, tight envelope
 *   Hi-Hat �filtered white noise, very short decay
 *   Open HH�filtered white noise, longer decay
 *   Clap   �3 noise bursts with slight delay offsets
 *   Tom    �sine sweep 120→60Hz, medium decay
 *   Crash  �wide noise + shimmer, long release
 *   Rim    �short sine blip + noise click
 *
 * Features:
 *   - 16 steps per instrument
 *   - Step velocity (right-click or hold to set soft/medium/hard)
 *   - Swing control (0–50%)
 *   - Pattern presets (Trap, Rock, House, Reggaeton, Boom Bap)
 *   - Volume per instrument
 *   - Record-to-track: renders the pattern as an AudioBuffer
 *     and calls onBounce(blob, durationSec) for AlbumStudio
 *   - Live play syncs to AlbumStudio BPM
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

// ──�Types ─────────────────────────────────────────────────────────────────────
type Velocity = 0 | 1 | 2 | 3; // 0=off, 1=soft, 2=medium, 3=hard
type Pattern = Velocity[][];    // [instrument][step]

interface Instrument {
  id: string;
  name: string;
  color: string;
  volume: number; // 0–1
  muted: boolean;
}

const INSTRUMENTS: Instrument[] = [
  { id: 'kick',   name: 'Kick',   color: '#fb923c', volume: 0.9, muted: false },
  { id: 'snare',  name: 'Snare',  color: '#22d3ee', volume: 0.8, muted: false },
  { id: 'hihat',  name: 'Hi-Hat', color: '#fbbf24', volume: 0.65, muted: false },
  { id: 'openHH', name: 'Open HH',color: '#a78bfa', volume: 0.6, muted: false },
  { id: 'clap',   name: 'Clap',   color: '#f43f5e', volume: 0.7, muted: false },
  { id: 'tom',    name: 'Tom',    color: '#34d399', volume: 0.7, muted: false },
  { id: 'crash',  name: 'Crash',  color: '#60a5fa', volume: 0.5, muted: false },
  { id: 'rim',    name: 'Rim',    color: '#e879f9', volume: 0.6, muted: false },
];

const STEPS = 16;
const VEL_GAIN: Record<Velocity, number> = { 0: 0, 1: 0.4, 2: 0.75, 3: 1.0 };

// ──�Pattern Presets ───────────────────────────────────────────────────────────
function emptyPattern(): Pattern {
  return INSTRUMENTS.map(() => Array(STEPS).fill(0));
}

const PRESETS: Record<string, Pattern> = {
  'Trap': (() => {
    const p = emptyPattern();
    // Kick on 1, 3.5, 4.5
    [0,6,8,10,14].forEach(s => p[0][s] = 3);
    // Snare on 4 and 12
    [4,12].forEach(s => p[1][s] = 3);
    // Hi-hat every step
    Array.from({length:16},(_,i)=>i).forEach(s => p[2][s] = s%2===0?2:1);
    // 808 hi-hat pattern
    [2,5,7,9,11,13,15].forEach(s => p[3][s] = 1);
    p[4][4] = 2; // clap
    return p;
  })(),
  'Boom Bap': (() => {
    const p = emptyPattern();
    [0,6,10].forEach(s => p[0][s] = 3);
    [4,12].forEach(s => p[1][s] = 3);
    [0,2,4,6,8,10,12,14].forEach(s => p[2][s] = 2);
    [1,3,5,7,9,11,13,15].forEach(s => p[2][s] = 1);
    [4,12].forEach(s => p[4][s] = 2);
    [8].forEach(s => p[5][s] = 2);
    return p;
  })(),
  'House': (() => {
    const p = emptyPattern();
    [0,4,8,12].forEach(s => p[0][s] = 3);
    [4,12].forEach(s => p[1][s] = 3);
    Array.from({length:16},(_,i)=>i).forEach(s => p[2][s] = 2);
    [2,6,10,14].forEach(s => p[4][s] = 2);
    [0].forEach(s => p[6][s] = 2);
    return p;
  })(),
  'Rock': (() => {
    const p = emptyPattern();
    [0,4,6,8,12,14].forEach(s => p[0][s] = 3);
    [4,12].forEach(s => p[1][s] = 3);
    [2,6,10,14].forEach(s => p[1][s] = 2);
    [0,2,4,6,8,10,12,14].forEach(s => p[2][s] = 2);
    [0].forEach(s => p[6][s] = 2);
    [8].forEach(s => p[5][s] = 3);
    return p;
  })(),
  'Reggaeton': (() => {
    const p = emptyPattern();
    [0,3,4,7,8,11,12,15].forEach(s => p[0][s] = 3);
    [2,6,10,14].forEach(s => p[1][s] = 3);
    Array.from({length:16},(_,i)=>i).forEach(s => p[2][s] = s%4===0?3:2);
    [4,12].forEach(s => p[4][s] = 2);
    return p;
  })(),
};

// ──�Drum synthesis ────────────────────────────────────────────────────────────
function synthDrum(ctx: AudioContext | OfflineAudioContext, id: string, time: number, gain: number): void {
  const g = ctx.createGain();
  g.connect(ctx.destination);

  switch (id) {
    case 'kick': {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150 * gain + 60, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      og.gain.setValueAtTime(gain * 1.2, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
      // Noise click
      const bufSize = Math.floor(ctx.sampleRate * 0.01);
      const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const ns = ctx.createBufferSource();
      ns.buffer = nBuf;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(gain * 0.4, time);
      ns.connect(ng).connect(ctx.destination);
      ns.start(time);
      osc.connect(og).connect(ctx.destination);
      osc.start(time); osc.stop(time + 0.5);
      break;
    }
    case 'snare': {
      const bufSize = Math.floor(ctx.sampleRate * 0.2);
      const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.8;
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      ns.connect(f).connect(g); ns.start(time);
      const osc = ctx.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = 180;
      const og = ctx.createGain();
      og.gain.setValueAtTime(gain * 0.3, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      osc.connect(og).connect(ctx.destination);
      osc.start(time); osc.stop(time + 0.1);
      break;
    }
    case 'hihat': {
      const bufSize = Math.floor(ctx.sampleRate * 0.05);
      const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 9000;
      g.gain.setValueAtTime(gain * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      ns.connect(f).connect(g); ns.start(time);
      break;
    }
    case 'openHH': {
      const bufSize = Math.floor(ctx.sampleRate * 0.35);
      const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 7000;
      g.gain.setValueAtTime(gain * 0.45, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      ns.connect(f).connect(g); ns.start(time);
      break;
    }
    case 'clap': {
      [0, 0.008, 0.016].forEach(offset => {
        const bufSize = Math.floor(ctx.sampleRate * 0.08);
        const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const nd = nBuf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
        const ns = ctx.createBufferSource(); ns.buffer = nBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.5;
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(gain * 0.6, time + offset);
        lg.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.08);
        ns.connect(f).connect(lg).connect(ctx.destination);
        ns.start(time + offset);
      });
      break;
    }
    case 'tom': {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(60, time + 0.2);
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.connect(g); osc.start(time); osc.stop(time + 0.3);
      break;
    }
    case 'crash': {
      const bufSize = Math.floor(ctx.sampleRate * 1.5);
      const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 5000;
      g.gain.setValueAtTime(gain * 0.4, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
      ns.connect(f).connect(g); ns.start(time);
      break;
    }
    case 'rim': {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 1600;
      const og = ctx.createGain();
      og.gain.setValueAtTime(gain * 0.4, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
      osc.connect(og).connect(ctx.destination);
      osc.start(time); osc.stop(time + 0.03);
      const bufSize = Math.floor(ctx.sampleRate * 0.02);
      const nBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = nBuf;
      g.gain.setValueAtTime(gain * 0.3, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
      ns.connect(g); ns.start(time);
      break;
    }
  }
}

// ──�Component ─────────────────────────────────────────────────────────────────
interface Props {
  bpm: number;
  onBounce?: (blob: Blob, durationSec: number, bars: number) => void;
  onClose: () => void;
}

export const BeatMachine: React.FC<Props> = ({ bpm, onBounce, onClose }) => {
  const [pattern, setPattern] = useState<Pattern>(emptyPattern);
  const [instruments, setInstruments] = useState<Instrument[]>(INSTRUMENTS.map(i => ({ ...i })));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [swing, setSwing] = useState(0);   // 0–0.5
  const [bars, setBars] = useState(1);     // how many bars to render
  const [isBouncing, setIsBouncing] = useState(false);
  const [bounced, setBounced] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const stepRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext({ latencyHint: 'interactive' });
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const stepDuration = useCallback(() => (60 / bpm / 4), [bpm]);

  const fireStep = useCallback((step: number) => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    const swingOffset = step % 2 === 1 ? swing * stepDuration() : 0;
    const fireAt = now + swingOffset;

    pattern.forEach((instSteps, instrIdx) => {
      const vel = instSteps[step] as Velocity;
      if (!vel) return;
      const inst = instruments[instrIdx];
      if (!inst || inst.muted) return;
      synthDrum(ctx, inst.id, fireAt, VEL_GAIN[vel] * inst.volume);
    });
  }, [pattern, instruments, getCtx, swing, stepDuration]);

  // Sequencer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const ms = stepDuration() * 1000;
    timerRef.current = setInterval(() => {
      stepRef.current = (stepRef.current + 1) % STEPS;
      setCurrentStep(stepRef.current);
      fireStep(stepRef.current);
    }, ms);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, bpm, fireStep, stepDuration]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    ctxRef.current?.close();
  }, []);

  const toggleStep = useCallback((instrIdx: number, step: number, e: React.MouseEvent) => {
    e.preventDefault();
    setPattern(prev => {
      const next = prev.map(r => [...r]) as Pattern;
      const cur = next[instrIdx][step] as Velocity;
      if (e.type === 'contextmenu') {
        // Right-click: cycle velocity 3→2→1→0
        next[instrIdx][step] = (cur > 0 ? (cur - 1) : 3) as Velocity;
      } else {
        // Left-click: toggle on/off at hard velocity
        next[instrIdx][step] = (cur > 0 ? 0 : 3) as Velocity;
      }
      return next;
    });
  }, []);

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    if (p) { setPattern(p.map(r => [...r]) as Pattern); setActivePreset(name); }
  };

  const handleBounce = useCallback(async () => {
    setIsBouncing(true);
    setBounced(false);
    const totalSteps = STEPS * bars;
    const dur = stepDuration() * totalSteps;
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);

    for (let step = 0; step < totalSteps; step++) {
      const s = step % STEPS;
      const t = step * stepDuration();
      const swingOff = s % 2 === 1 ? swing * stepDuration() : 0;
      pattern.forEach((instSteps, instrIdx) => {
        const vel = instSteps[s] as Velocity;
        if (!vel) return;
        const inst = instruments[instrIdx];
        if (!inst || inst.muted) return;
        synthDrum(ctx as unknown as AudioContext, inst.id, t + swingOff, VEL_GAIN[vel] * inst.volume);
      });
    }

    const rendered = await ctx.startRendering();
    const nCh = 2, len = rendered.length;
    const blockAlign = nCh * 2;
    const ab = new ArrayBuffer(44 + len * blockAlign);
    const view = new DataView(ab);
    const wr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    wr(0,'RIFF'); view.setUint32(4,36+len*blockAlign,true); wr(8,'WAVE');
    wr(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
    view.setUint16(22,nCh,true); view.setUint32(24,sr,true);
    view.setUint32(28,sr*blockAlign,true); view.setUint16(32,blockAlign,true);
    view.setUint16(34,16,true); wr(36,'data'); view.setUint32(40,len*blockAlign,true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < nCh; ch++) {
        const s2 = Math.max(-1, Math.min(1, rendered.getChannelData(Math.min(ch,rendered.numberOfChannels-1))[i] ?? 0));
        view.setInt16(off, s2 < 0 ? s2 * 0x8000 : s2 * 0x7FFF, true); off += 2;
      }
    }
    const blob = new Blob([ab], { type: 'audio/wav' });
    onBounce?.(blob, dur, bars);
    setBounced(true);
    setIsBouncing(false);
  }, [pattern, instruments, bars, swing, stepDuration, onBounce]);

  const VEL_COLORS: Record<Velocity, string> = { 0:'', 1:'opacity-40', 2:'opacity-70', 3:'opacity-100' };

  return (
    <div className="flex flex-col gap-2 bg-slate-950/95 rounded-xl border border-white/[0.07] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] bg-slate-900/60 flex-wrap">
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Beat Machine</span>
        <span className="text-[9px] text-slate-600">{bpm} BPM</span>

        {/* Presets */}
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-slate-700 mr-0.5">Style:</span>
          {Object.keys(PRESETS).map(name => (
            <button key={name} onClick={() => applyPreset(name)}
              title={`Load ${name} drum pattern`}
              className={`px-2 py-0.5 rounded text-[8px] border transition-all ${activePreset===name ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/[0.03] text-slate-600 border-white/[0.05] hover:text-slate-300'}`}>
              {name}
            </button>
          ))}
          <button onClick={() => { setPattern(emptyPattern()); setActivePreset(null); }}
            title="Clear all steps"
            className="px-2 py-0.5 rounded text-[8px] text-slate-700 border border-white/[0.05] hover:text-slate-400 transition-colors">
            Clear
          </button>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Swing */}
          <span className="text-[8px] text-slate-600">SWING</span>
          <input type="range" min={0} max={0.45} step={0.01} value={swing}
            onChange={e => setSwing(Number(e.target.value))}
            className="w-16 h-0.5 accent-amber-400" />
          <span className="text-[8px] text-slate-500 w-6 font-mono">{Math.round(swing*100)}%</span>

          {/* Bars to bounce */}
          <span className="text-[8px] text-slate-600 ml-2">BARS</span>
          <select value={bars} onChange={e => setBars(Number(e.target.value))}
            className="bg-black/30 border border-white/[0.06] rounded px-1 py-0.5 text-[9px] text-slate-400 focus:outline-none">
            {[1,2,4,8].map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* Play/Stop */}
          <motion.button onClick={() => { setIsPlaying(p => !p); if (isPlaying) { setCurrentStep(-1); stepRef.current = -1; } }}
            whileTap={{ scale: 0.9 }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center ml-1 transition-all ${isPlaying ? 'bg-orange-500/25 text-orange-400 border border-orange-500/30' : 'bg-white/[0.06] text-slate-400 hover:bg-white/10'}`}>
            {isPlaying
              ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              : <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </motion.button>

          {/* Bounce to track */}
          <motion.button onClick={handleBounce} disabled={isBouncing} whileTap={{ scale: 0.95 }}
            className={`px-2 py-1 rounded text-[8px] font-bold uppercase tracking-wider border transition-all disabled:opacity-40 ${bounced ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25 hover:bg-cyan-500/25'}`}>
            {isBouncing ? '⏳' : bounced ? '�Sent' : '�Add to Track'}
          </motion.button>

          <button onClick={onClose} className="text-slate-700 hover:text-slate-400 text-xs ml-1 transition-colors">✕</button>
        </div>
      </div>

      {/* Grid */}
      <div className="px-3 pb-3 overflow-x-auto">
        {/* Step numbers */}
        <div className="flex mb-1 ml-[72px] gap-px">
          {Array.from({length: STEPS}, (_,i) => (
            <div key={i} className="flex-1 text-center text-[7px] text-slate-700 font-mono"
              style={{ minWidth: 22 }}>
              {i+1}
            </div>
          ))}
        </div>

        {instruments.map((inst, instrIdx) => (
          <div key={inst.id} className="flex items-center gap-1.5 mb-1">
            {/* Instrument label */}
            <div className="flex items-center gap-1 w-[72px] flex-shrink-0">
              <button onClick={() => setInstruments(prev => prev.map((x,j) => j===instrIdx ? {...x, muted:!x.muted} : x))}
                className={`w-3 h-3 rounded-sm border flex-shrink-0 transition-all ${inst.muted ? 'bg-white/[0.05] border-white/[0.08]' : ''}`}
                style={!inst.muted ? { backgroundColor: inst.color + '40', borderColor: inst.color + '60' } : {}}
                title={inst.muted ? 'Unmute' : 'Mute'} />
              <span className="text-[9px] font-semibold truncate" style={{ color: inst.muted ? '#475569' : inst.color }}>
                {inst.name}
              </span>
            </div>

            {/* Steps */}
            <div className="flex gap-px flex-1">
              {Array.from({length: STEPS}, (_,step) => {
                const vel = pattern[instrIdx]?.[step] as Velocity ?? 0;
                const isCurrent = currentStep === step && isPlaying;
                const isBarStart = step % 4 === 0;
                return (
                  <button
                    key={step}
                    onClick={e => toggleStep(instrIdx, step, e)}
                    onContextMenu={e => { e.preventDefault(); toggleStep(instrIdx, step, e); }}
                    className={`h-6 rounded-sm transition-all ${isBarStart ? 'ml-0.5' : ''} ${
                      isCurrent ? 'ring-1 ring-white/40' : ''
                    } ${vel > 0 ? VEL_COLORS[vel] : 'opacity-100'}`}
                    style={{
                      flex: 1, minWidth: 22,
                      backgroundColor: vel > 0
                        ? inst.color + (vel === 3 ? 'cc' : vel === 2 ? '88' : '44')
                        : isCurrent ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    }}
                  />
                );
              })}
            </div>

            {/* Volume */}
            <input type="range" min={0} max={1} step={0.01} value={inst.volume}
              onChange={e => setInstruments(prev => prev.map((x,j) => j===instrIdx ? {...x, volume:Number(e.target.value)} : x))}
              className="w-12 h-0.5 flex-shrink-0"
              style={{ accentColor: inst.color }}
              title={`${inst.name} volume`} />
          </div>
        ))}

        {/* Controls guide �always visible, plain English */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 pt-2 border-t border-white/[0.04]">
          <span className="text-[8px] text-slate-600 font-semibold uppercase tracking-widest">How to use</span>
          <span className="text-[8px] text-slate-600"><span className="text-slate-400">Left-click</span> a square = toggle on/off</span>
          <span className="text-[8px] text-slate-600"><span className="text-slate-400">Right-click</span> = cycle velocity: soft �medium �hard �off</span>
          <span className="text-[8px] text-slate-600"><span className="text-slate-400">Colored square</span> = hit; faint = soft, bright = hard</span>
          <span className="text-[8px] text-slate-600"><span className="text-slate-400">Swing</span> = push off-beats slightly late for groove</span>
          <span className="text-[8px] text-slate-600"><span className="text-slate-400">Bars</span> = how many times the pattern repeats in the clip</span>
          <span className="text-[8px] text-slate-600"><span className="text-orange-400">�Add to Track</span> = renders {bars} bar{bars>1?'s':''} of audio and drops it into your Album Studio Drums track</span>
        </div>

        {/* Velocity legend */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[8px] text-slate-700 uppercase tracking-wider">Velocity:</span>
          {([1,2,3] as Velocity[]).map(v => (
            <div key={v} className="flex items-center gap-1">
              <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: `#fb923c${v===3?'cc':v===2?'88':'44'}` }} />
              <span className="text-[8px] text-slate-600">{v===1?'Soft':v===2?'Medium':'Hard'}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-sm bg-white/[0.04]" />
            <span className="text-[8px] text-slate-700">Off</span>
          </div>
        </div>
      </div>
    </div>
  );
};
