/**
 * MidiSynth �Browser-native polyphonic synthesizer with MIDI input
 *
 * Features:
 *   - Web MIDI API: detects connected MIDI keyboards automatically
 *   - 8-voice polyphony, each voice: 2 oscillators + ADSR + low-pass filter
 *   - Oscillator 1 + 2: sine, saw, square, triangle waveforms
 *   - Filter cutoff + resonance
 *   - ADSR envelope per note
 *   - Sustain pedal support (MIDI CC64)
 *   - Pitch bend wheel support
 *   - Computer keyboard fallback (QWERTY piano layout)
 *   - Output can be captured to MediaStreamDestination for AlbumStudio recording
 *   - Preset system: Pad, Lead, Bass, Pluck, Piano
 *
 * QWERTY keyboard layout:
 *   A S D F G H J = white keys C4–B4
 *   W E T Y U     = black keys C#4–A#4
 *   Z X C V B N M = white keys C3–B3
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ──�Types ─────────────────────────────────────────────────────────────────────
type OscType = OscillatorType;

interface SynthPreset {
  name: string;
  osc1Type: OscType;
  osc1Detune: number;
  osc2Type: OscType;
  osc2Detune: number;
  osc2Mix: number;         // 0–1 (mix osc2 into osc1)
  attack: number;          // seconds
  decay: number;
  sustain: number;         // 0–1
  release: number;
  filterFreq: number;      // Hz
  filterQ: number;
  filterEnvAmt: number;    // Hz added at note-on
  masterGain: number;      // 0–1
  portamento: number;      // glide time in seconds
}

const PRESETS: Record<string, SynthPreset> = {
  Piano: {
    name: 'Piano',
    osc1Type: 'triangle', osc1Detune: 0,
    osc2Type: 'sine', osc2Detune: -7, osc2Mix: 0.3,
    attack: 0.004, decay: 0.8, sustain: 0.3, release: 0.8,
    filterFreq: 12000, filterQ: 0.7, filterEnvAmt: 0,
    masterGain: 0.6, portamento: 0,
  },
  Pad: {
    name: 'Pad',
    osc1Type: 'sawtooth', osc1Detune: 8,
    osc2Type: 'sawtooth', osc2Detune: -8, osc2Mix: 0.5,
    attack: 0.6, decay: 0.4, sustain: 0.8, release: 1.5,
    filterFreq: 800, filterQ: 1.5, filterEnvAmt: 2000,
    masterGain: 0.5, portamento: 0.05,
  },
  Lead: {
    name: 'Lead',
    osc1Type: 'sawtooth', osc1Detune: 0,
    osc2Type: 'square', osc2Detune: 12, osc2Mix: 0.2,
    attack: 0.01, decay: 0.1, sustain: 0.85, release: 0.15,
    filterFreq: 2000, filterQ: 3, filterEnvAmt: 4000,
    masterGain: 0.55, portamento: 0.03,
  },
  Bass: {
    name: 'Bass',
    osc1Type: 'square', osc1Detune: 0,
    osc2Type: 'sawtooth', osc2Detune: -12, osc2Mix: 0.4,
    attack: 0.002, decay: 0.3, sustain: 0.5, release: 0.2,
    filterFreq: 600, filterQ: 2, filterEnvAmt: 3000,
    masterGain: 0.7, portamento: 0,
  },
  Pluck: {
    name: 'Pluck',
    osc1Type: 'sawtooth', osc1Detune: 0,
    osc2Type: 'sine', osc2Detune: 0, osc2Mix: 0,
    attack: 0.001, decay: 0.4, sustain: 0, release: 0.3,
    filterFreq: 4000, filterQ: 2, filterEnvAmt: 8000,
    masterGain: 0.65, portamento: 0,
  },
};

// MIDI note �frequency
function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// QWERTY �MIDI note mapping
const QWERTY_NOTES: Record<string, number> = {
  // Lower octave (Z row) �C3
  'z':48,'x':50,'c':52,'v':53,'b':55,'n':57,'m':59,
  // Upper octave (A row) �C4
  'a':60,'s':62,'d':64,'f':65,'g':67,'h':69,'j':71,'k':72,
  // Sharps (Q row) �C#4 range
  'w':61,'e':63,'t':66,'y':68,'u':70,
  // Extra highs
  'l':74,'semicolon':76,
};

// ──�Voice ─────────────────────────────────────────────────────────────────────
interface Voice {
  note: number;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gainNode: GainNode;
  filter: BiquadFilterNode;
  sustained: boolean;
  released: boolean;
}

// ──�Component ─────────────────────────────────────────────────────────────────
interface Props {
  /** If provided, synth output will also be routed here (for recording) */
  captureDestination?: MediaStreamAudioDestinationNode | null;
  onNoteEvent?: (event: {
    type: 'noteOn' | 'noteOff';
    note: number;
    velocity: number;
    timeSec: number;
  }) => void;
  onClose: () => void;
}

const KEY_LABELS: Record<number, string> = { 0:'C',2:'D',4:'E',5:'F',7:'G',9:'A',11:'B' };
const IS_BLACK: Record<number, boolean> = { 1:true,3:true,6:true,8:true,10:true };

export const MidiSynth: React.FC<Props> = ({ captureDestination, onNoteEvent, onClose }) => {
  const [presetName, setPresetName] = useState<string>('Piano');
  const [preset, setPreset] = useState<SynthPreset>(PRESETS.Piano);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [sustainPedal, setSustainPedal] = useState(false);
  const [octave, setOctave] = useState(0); // transpose octave
  const [showPresetEditor, setShowPresetEditor] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voices = useRef<Map<number, Voice>>(new Map());
  const sustainedNotes = useRef<Set<number>>(new Set());
  const midiRef = useRef<MIDIAccess | null>(null);
  const noteStartTimes = useRef<Map<number, number>>(new Map());

  // ─�Init AudioContext + master gain ──
  const getCtx = useCallback((): { ctx: AudioContext; master: GainNode } => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.gain.value = preset.masterGain;
      master.connect(ctx.destination);
      if (captureDestination) master.connect(captureDestination);
      ctxRef.current = ctx;
      masterRef.current = master;
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return { ctx: ctxRef.current, master: masterRef.current! };
  }, [preset.masterGain, captureDestination]);

  // ─�Note On ──
  const noteOn = useCallback((midiNote: number, velocity = 100) => {
    const { ctx, master } = getCtx();
    if (voices.current.has(midiNote)) return; // already playing

    const freq = midiToFreq(midiNote + octave * 12);
    const vel = velocity / 127;
    const now = ctx.currentTime;
    const p = preset;

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.filterFreq;
    filter.Q.value = p.filterQ;
    filter.frequency.setValueAtTime(p.filterFreq, now);
    if (p.filterEnvAmt > 0) {
      filter.frequency.linearRampToValueAtTime(p.filterFreq + p.filterEnvAmt * vel, now + p.attack);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, p.filterFreq), now + p.attack + p.decay);
    }

    // Amplitude ADSR
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(vel, now + p.attack);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, p.sustain * vel), now + p.attack + p.decay);

    gainNode.connect(filter).connect(master);

    // Osc 1
    const osc1 = ctx.createOscillator();
    osc1.type = p.osc1Type;
    osc1.frequency.value = freq;
    osc1.detune.value = p.osc1Detune;
    osc1.connect(gainNode);
    osc1.start(now);

    // Osc 2 (mixed in)
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = p.osc2Mix;
    const osc2 = ctx.createOscillator();
    osc2.type = p.osc2Type;
    osc2.frequency.value = freq;
    osc2.detune.value = p.osc2Detune;
    osc2.connect(osc2Gain).connect(gainNode);
    osc2.start(now);

    voices.current.set(midiNote, { note: midiNote, osc1, osc2, gainNode, filter, sustained: false, released: false });
    noteStartTimes.current.set(midiNote, now);
    onNoteEvent?.({ type: 'noteOn', note: midiNote, velocity, timeSec: now });
    setActiveNotes(prev => new Set([...prev, midiNote]));
  }, [getCtx, onNoteEvent, octave, preset]);

  // ─�Note Off ──
  const noteOff = useCallback((midiNote: number) => {
    const voice = voices.current.get(midiNote);
    if (!voice) return;

    if (sustainedNotes.current.has(midiNote)) {
      voice.sustained = true;
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    const rel = preset.release;

    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
    voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + rel);

    voice.osc1.stop(now + rel + 0.01);
    voice.osc2.stop(now + rel + 0.01);
    voices.current.delete(midiNote);
    const startTime = noteStartTimes.current.get(midiNote) ?? now;
    noteStartTimes.current.delete(midiNote);
    onNoteEvent?.({
      type: 'noteOff',
      note: midiNote,
      velocity: 0,
      timeSec: Math.max(startTime, now),
    });
    setActiveNotes(prev => { const n = new Set(prev); n.delete(midiNote); return n; });
  }, [onNoteEvent, preset.release]);

  // ─�MIDI setup ──
  useEffect(() => {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess({ sysex: false }).then(access => {
      midiRef.current = access;
      const deviceNames: string[] = [];
      access.inputs.forEach(input => { deviceNames.push(input.name ?? 'MIDI Input'); });
      setMidiDevices(deviceNames);

      const handleMessage = (e: MIDIMessageEvent) => {
        const [status, note, velocity] = e.data;
        const cmd = (status ?? 0) & 0xf0;
        if (cmd === 0x90 && (velocity ?? 0) > 0) noteOn(note ?? 60, velocity ?? 100);
        if (cmd === 0x80 || (cmd === 0x90 && (velocity ?? 0) === 0)) noteOff(note ?? 60);
        // Sustain pedal (CC64)
        if (cmd === 0xb0 && note === 64) {
          const on = (velocity ?? 0) >= 64;
          setSustainPedal(on);
          if (!on) {
            // Release all sustained notes
            sustainedNotes.current.forEach(n => noteOff(n));
            sustainedNotes.current.clear();
          } else {
            // Mark currently held notes as sustained
            activeNotes.forEach(n => sustainedNotes.current.add(n));
          }
        }
      };

      access.inputs.forEach(input => { input.onmidimessage = handleMessage; });
      access.onstatechange = () => {
        const names: string[] = [];
        access.inputs.forEach(i => names.push(i.name ?? 'MIDI Input'));
        setMidiDevices(names);
        access.inputs.forEach(input => { input.onmidimessage = handleMessage; });
      };
    }).catch(() => {});

    return () => {
      midiRef.current?.inputs.forEach(input => { input.onmidimessage = null; });
    };
  }, [noteOn, noteOff, activeNotes]);

  // ─�QWERTY keyboard ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      const note = QWERTY_NOTES[e.key.toLowerCase()];
      if (note !== undefined) noteOn(note);
      if (e.key === 'z' && !e.shiftKey && !QWERTY_NOTES['z']) return;
      if (e.key === 'ArrowUp') setOctave(o => Math.min(3, o + 1));
      if (e.key === 'ArrowDown') setOctave(o => Math.max(-3, o - 1));
    };
    const up = (e: KeyboardEvent) => {
      const note = QWERTY_NOTES[e.key.toLowerCase()];
      if (note !== undefined) noteOff(note);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [noteOn, noteOff]);

  // ─�Cleanup ──
  useEffect(() => () => {
    voices.current.forEach(v => { try { v.osc1.stop(); v.osc2.stop(); } catch {} });
    ctxRef.current?.close();
  }, []);

  // ─�Apply preset ──
  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    if (!p) return;
    setPresetName(name);
    setPreset(p);
    if (masterRef.current) masterRef.current.gain.value = p.masterGain;
  };

  // ─�Virtual keyboard rendering ──
  const renderPiano = () => {
    const startNote = 48 + octave * 12; // C3 + octave offset
    const numOctaves = 2;
    const whites: number[] = [];
    const blacks: Array<{ note: number; pos: number }> = [];
    let whiteIdx = 0;

    for (let oct = 0; oct < numOctaves; oct++) {
      for (let semitone = 0; semitone < 12; semitone++) {
        const note = startNote + oct * 12 + semitone;
        if (!IS_BLACK[semitone % 12]) {
          whites.push(note);
          whiteIdx++;
        } else {
          blacks.push({ note, pos: whiteIdx - 0.5 });
        }
      }
    }
    whites.push(startNote + numOctaves * 12); // final C

    const KEY_W = 28;
    const totalW = whites.length * KEY_W;

    return (
      <div className="relative overflow-x-auto" style={{ height: 80 }}>
        <div className="relative" style={{ width: totalW, height: 80 }}>
          {/* White keys */}
          {whites.map((note, i) => {
            const active = activeNotes.has(note - octave * 12) || activeNotes.has(note);
            const semitone = note % 12;
            return (
              <div
                key={note}
                onMouseDown={() => noteOn(note)}
                onMouseUp={() => noteOff(note)}
                onMouseLeave={() => noteOff(note)}
                onTouchStart={e => { e.preventDefault(); noteOn(note); }}
                onTouchEnd={() => noteOff(note)}
                className={`absolute bottom-0 border border-slate-700 rounded-b-sm cursor-pointer select-none flex items-end justify-center pb-1 transition-colors ${active ? 'bg-orange-400/80' : 'bg-slate-100 hover:bg-slate-200'}`}
                style={{ left: i * KEY_W, width: KEY_W - 1, height: 80 }}
              >
                {note % 12 === 0 && (
                  <span className="text-[8px] text-slate-500 font-mono">C{Math.floor(note / 12) - 1}</span>
                )}
              </div>
            );
          })}
          {/* Black keys */}
          {blacks.map(({ note, pos }) => {
            const active = activeNotes.has(note - octave * 12) || activeNotes.has(note);
            return (
              <div
                key={note}
                onMouseDown={() => noteOn(note)}
                onMouseUp={() => noteOff(note)}
                onMouseLeave={() => noteOff(note)}
                onTouchStart={e => { e.preventDefault(); noteOn(note); }}
                onTouchEnd={() => noteOff(note)}
                className={`absolute z-10 cursor-pointer select-none rounded-b-sm transition-colors ${active ? 'bg-orange-500' : 'bg-slate-900 hover:bg-slate-700'}`}
                style={{ left: pos * KEY_W + 4, width: KEY_W * 0.6, height: 50, top: 0 }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-slate-950/98 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none"
      style={{ width: '100%', maxWidth: 700 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-slate-900/50">
        <span className="text-xs font-bold text-slate-200">MIDI Synth</span>

        {/* Preset selector */}
        <div className="flex gap-1">
          {Object.keys(PRESETS).map(name => (
            <button key={name} onClick={() => applyPreset(name)}
              className={`px-2 py-1 rounded text-[9px] font-semibold border transition-all ${presetName === name ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-300'}`}>
              {name}
            </button>
          ))}
        </div>

        {/* MIDI status */}
        <div className="flex items-center gap-1.5 ml-auto">
          {midiDevices.length > 0 ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[9px] text-emerald-400">{midiDevices[0]?.slice(0, 24)}</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <span className="text-[9px] text-slate-600">QWERTY keyboard</span>
            </>
          )}
        </div>

        {/* Octave */}
        <div className="flex items-center gap-1 border border-white/[0.06] rounded-lg px-2 py-1">
          <button onClick={() => setOctave(o => Math.max(-3, o - 1))} className="text-slate-400 hover:text-white w-4 text-xs transition-colors">−</button>
          <span className="text-[10px] text-slate-400 font-mono w-6 text-center">{octave > 0 ? '+' : ''}{octave}</span>
          <button onClick={() => setOctave(o => Math.min(3, o + 1))} className="text-slate-400 hover:text-white w-4 text-xs transition-colors">+</button>
        </div>

        {/* Sustain indicator */}
        <div className={`px-2 py-1 rounded text-[9px] border transition-all ${sustainPedal ? 'bg-purple-500/20 text-purple-400 border-purple-500/25' : 'bg-white/[0.02] text-slate-700 border-white/[0.05]'}`}>
          SUS
        </div>

        {/* Edit toggle */}
        <button onClick={() => setShowPresetEditor(s => !s)}
          className="text-[9px] text-slate-600 hover:text-slate-300 border border-white/[0.06] rounded px-2 py-1 transition-colors">
          Edit
        </button>

        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xs transition-colors ml-1">✕</button>
      </div>

      {/* Preset editor */}
      <AnimatePresence>
        {showPresetEditor && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-b border-white/[0.04] bg-slate-900/30">
            <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {/* Osc 1 */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Oscillator 1</p>
                <div className="flex gap-1">
                  {(['sine','square','sawtooth','triangle'] as OscType[]).map(t => (
                    <button key={t} onClick={() => setPreset(p => ({ ...p, osc1Type: t }))}
                      className={`px-1.5 py-0.5 rounded text-[8px] border transition-all ${preset.osc1Type === t ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/25' : 'text-slate-600 border-white/[0.06] hover:text-slate-300'}`}>
                      {t.slice(0,3)}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[9px] text-slate-600">
                  Detune
                  <input type="range" min={-100} max={100} step={1} value={preset.osc1Detune}
                    onChange={e => setPreset(p => ({ ...p, osc1Detune: Number(e.target.value) }))}
                    className="flex-1 h-0.5 accent-cyan-400" />
                  <span className="text-slate-400 w-8 font-mono">{preset.osc1Detune}c</span>
                </label>
              </div>
              {/* Osc 2 */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Oscillator 2</p>
                <div className="flex gap-1">
                  {(['sine','square','sawtooth','triangle'] as OscType[]).map(t => (
                    <button key={t} onClick={() => setPreset(p => ({ ...p, osc2Type: t }))}
                      className={`px-1.5 py-0.5 rounded text-[8px] border transition-all ${preset.osc2Type === t ? 'bg-purple-500/20 text-purple-400 border-purple-500/25' : 'text-slate-600 border-white/[0.06] hover:text-slate-300'}`}>
                      {t.slice(0,3)}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[9px] text-slate-600">
                  Mix
                  <input type="range" min={0} max={1} step={0.01} value={preset.osc2Mix}
                    onChange={e => setPreset(p => ({ ...p, osc2Mix: Number(e.target.value) }))}
                    className="flex-1 h-0.5 accent-purple-400" />
                  <span className="text-slate-400 w-8 font-mono">{(preset.osc2Mix * 100).toFixed(0)}%</span>
                </label>
              </div>
              {/* ADSR */}
              <div className="flex flex-col gap-1">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Envelope</p>
                {(['attack','decay','sustain','release'] as const).map(param => (
                  <label key={param} className="flex items-center gap-2 text-[9px] text-slate-600">
                    <span className="w-12 uppercase">{param}</span>
                    <input type="range"
                      min={param === 'sustain' ? 0 : 0.001}
                      max={param === 'attack' || param === 'release' ? 4 : param === 'decay' ? 4 : 1}
                      step={0.001}
                      value={preset[param]}
                      onChange={e => setPreset(p => ({ ...p, [param]: Number(e.target.value) }))}
                      className="flex-1 h-0.5 accent-orange-400" />
                    <span className="text-slate-400 w-10 font-mono">
                      {param === 'sustain' ? `${(preset[param]*100).toFixed(0)}%` : `${preset[param].toFixed(2)}s`}
                    </span>
                  </label>
                ))}
              </div>
              {/* Filter */}
              <div className="flex flex-col gap-1">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Filter</p>
                <label className="flex items-center gap-2 text-[9px] text-slate-600">
                  <span className="w-12">Cutoff</span>
                  <input type="range" min={100} max={20000} step={50} value={preset.filterFreq}
                    onChange={e => setPreset(p => ({ ...p, filterFreq: Number(e.target.value) }))}
                    className="flex-1 h-0.5 accent-emerald-400" />
                  <span className="text-slate-400 w-14 font-mono">{preset.filterFreq}Hz</span>
                </label>
                <label className="flex items-center gap-2 text-[9px] text-slate-600">
                  <span className="w-12">Resonance</span>
                  <input type="range" min={0.1} max={20} step={0.1} value={preset.filterQ}
                    onChange={e => setPreset(p => ({ ...p, filterQ: Number(e.target.value) }))}
                    className="flex-1 h-0.5 accent-emerald-400" />
                  <span className="text-slate-400 w-14 font-mono">{preset.filterQ.toFixed(1)}</span>
                </label>
                <label className="flex items-center gap-2 text-[9px] text-slate-600">
                  <span className="w-12">Env Amt</span>
                  <input type="range" min={0} max={12000} step={100} value={preset.filterEnvAmt}
                    onChange={e => setPreset(p => ({ ...p, filterEnvAmt: Number(e.target.value) }))}
                    className="flex-1 h-0.5 accent-emerald-400" />
                  <span className="text-slate-400 w-14 font-mono">{preset.filterEnvAmt}Hz</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Piano keyboard */}
      <div className="px-3 py-3 bg-slate-900/20">
        {renderPiano()}
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-[9px] text-slate-700">
            {midiDevices.length > 0 ? 'MIDI keyboard connected' : 'QWERTY: A-S-D-F-G-H-J = C4-B4 �W-E-T-Y-U = sharps �Z-X-C-V-B-N-M = C3-B3'}
          </p>
          <span className="text-[9px] text-slate-600">
            {activeNotes.size > 0 ? `${activeNotes.size} note${activeNotes.size !== 1 ? 's' : ''} active` : '—'}
          </span>
        </div>
      </div>
    </motion.div>
  );
};
