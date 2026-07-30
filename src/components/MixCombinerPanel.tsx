/**
 * MixCombinerPanel
 *
 * "I have my vocals WAV and my beat WAV mix them together and master it."
 *
 * The most common independent artist workflow, solved in one panel:
 *   1. Drop vocal WAV
 *   2. Drop beat WAV
 *   3. Set vocal/beat level balance
 *   4. Hit Mix & Master returns a finished stereo master
 *
 * Uses the Python backend /api/proxy/mix/tracks route which:
 *   - Aligns durations (loops or trims beat to match vocal)
 *   - Applies vocal chain preprocessing
 *   - Balances levels (vocal_db / beat_db offsets)
 *   - Bounces to stereo
 *   - Runs abbreviated mastering chain
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { applyVocalDucking } from '../audio/dynamicDucker';

// ──Types ────────────────────────────────────────────────────────────────────

interface TrackSlot {
  file: File | null;
  name: string;
  duration: number | null;
  waveform: number[] | null;
}

type MixStatus = 'idle' | 'uploading' | 'mixing' | 'done' | 'error' | 'browser_fallback';

// ──Mini waveform renderer ───────────────────────────────────────────────────

function buildWaveform(buffer: AudioBuffer, bars = 40): number[] {
  const mono = buffer.getChannelData(0);
  const step = Math.floor(mono.length / bars);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    for (let j = 0; j < step; j++) {
      peak = Math.max(peak, Math.abs(mono[i * step + j] ?? 0));
    }
    out.push(peak);
  }
  const max = Math.max(...out, 0.001);
  return out.map(v => v / max);
}

const MiniWave: React.FC<{ data: number[]; color: string }> = ({ data, color }) => (
  <div className="flex items-center gap-px h-8">
    {data.map((v, i) => (
      <motion.div
        key={i}
        className="w-full rounded-sm flex-1"
        style={{ backgroundColor: color, opacity: 0.7 + v * 0.3 }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: v || 0.05 }}
        transition={{ duration: 0.3, delay: i * 0.008 }}
        style2={{ transformOrigin: 'center' }}
      />
    ))}
  </div>
);

// ──Drop Zone ────────────────────────────────────────────────────────────────

interface DropZoneProps {
  slot: TrackSlot;
  label: string;
  icon: string;
  color: string;
  accentColor: string;
  onFile: (file: File) => void;
}

const DropZone: React.FC<DropZoneProps> = ({
  slot, label, icon, color, accentColor, onFile
}) => {
  const [dragging, setDragging] = useState(false);
  const inputId = `${label.toLowerCase().replace(/\s+/g, '-')}-upload`;

  const handle = (file: File) => {
    if (file.type.startsWith('audio/') || /\.(wav|mp3|aiff?|flac|m4a)$/i.test(file.name)) {
      onFile(file);
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      className={`
        relative rounded-xl border-2 transition-all duration-200 overflow-hidden
        ${slot.file
          ? `border-${color}-500/30 bg-${color}-500/[0.06]`
          : dragging
            ? `border-${color}-400/60 bg-${color}-500/10`
            : `border-white/10 hover:border-white/20 hover:bg-white/[0.03]`}
      `}
      style={{
        borderColor: slot.file ? `${accentColor}44` : dragging ? `${accentColor}99` : undefined,
        backgroundColor: slot.file ? `${accentColor}11` : dragging ? `${accentColor}22` : undefined,
      }}
    >
      <input
        id={inputId}
        data-testid={inputId}
        type="file"
        accept="audio/*"
        className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }}
      />

      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{icon}</span>
          <div>
            <p className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">{label}</p>
            {slot.file && (
              <p className="text-[11px] text-white/70 mt-0.5 truncate max-w-[160px]">
                {slot.name}
              </p>
            )}
          </div>
          {slot.duration != null && (
            <span className="ml-auto text-[10px] text-white/30 tabular-nums">
              {slot.duration.toFixed(1)}s
            </span>
          )}
        </div>

        {/* Waveform or placeholder */}
        {slot.waveform ? (
          <div className="flex flex-col gap-1 mt-2">
            <MiniWave data={slot.waveform} color={accentColor} />
            <label 
              htmlFor={inputId}
              className="mt-1 block text-center text-[10px] text-white/40 cursor-pointer hover:text-white/70 transition-colors"
            >
              Replace File
            </label>
          </div>
        ) : (
          <label 
            htmlFor={inputId}
            className="mt-2 h-10 w-full rounded-lg bg-white/[0.04] border border-dashed border-white/20 hover:bg-white/[0.08] hover:border-white/40 transition-colors flex items-center justify-center cursor-pointer"
          >
            <span className="text-[11px] text-white/50 font-medium">
              {dragging ? 'Drop here' : 'Browse Files or Drop Audio'}
            </span>
          </label>
        )}
      </div>
    </div>
  );
};

// ──Level fader ──────────────────────────────────────────────────────────────

const Fader: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  color: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, color, onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] text-white/40">{label}</span>
      <span className="text-[10px] text-white/60 tabular-nums font-medium">
        {value >= 0 ? '+' : ''}{value.toFixed(1)} dB
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={0.5}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-1 rounded-full appearance-none cursor-pointer"
      style={{
        background: `linear-gradient(to right, ${color} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 0%)`,
      }}
    />
  </div>
);

// ──Main Component ───────────────────────────────────────────────────────────

interface MixCombinerPanelProps {
  onMixComplete?: (buffer: AudioBuffer, blob: Blob) => void;
}

interface MixEngineMeta {
  autoMix?: boolean;
  selfMaster?: boolean;
  targetIntensity?: number;
  referenceMatch?: number;
  referenceGap?: number;
  primaryFocus?: string;
  tonalBias?: string | null;
  vocalGainDb?: number;
  beatGainDb?: number;
}

export const MixCombinerPanel: React.FC<MixCombinerPanelProps> = ({
  onMixComplete,
}) => {
  const [vocal, setVocal] = useState<TrackSlot>({ file: null, name: '', duration: null, waveform: null });
  const [beat, setBeat]   = useState<TrackSlot>({ file: null, name: '', duration: null, waveform: null });
  const [vocalDb, setVocalDb] = useState(0);
  const [beatDb, setBeatDb]   = useState(-3);
  const [autoMix, setAutoMix] = useState(true);
  const [selfMaster, setSelfMaster] = useState(true);
  const [mixIntensity, setMixIntensity] = useState(1);
  const [mixStatus, setMixStatus] = useState<MixStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usedEngine, setUsedEngine] = useState<'python' | 'browser' | null>(null);
  const [mixMeta, setMixMeta] = useState<MixEngineMeta | null>(null);
  const [vocalPocketDepth, setVocalPocketDepth] = useState<number | null>(null);

  const loadSlot = useCallback(async (file: File, setter: typeof setVocal) => {
    const ab = await file.arrayBuffer();
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(ab);
    const waveform = buildWaveform(buf);
    setter({
      file,
      name: file.name,
      duration: buf.duration,
      waveform,
    });
  }, []);

  const handleVocalFile = useCallback((f: File) => {
    void loadSlot(f, setVocal);
  }, [loadSlot]);

  const handleBeatFile = useCallback((f: File) => {
    void loadSlot(f, setBeat);
  }, [loadSlot]);

  // Browser fallback: simple gain-based mix without server
  const browserMix = useCallback(async () => {
    if (!vocal.file) return;
    setMixStatus('browser_fallback');
    setProgress(20);

    const ctx = new AudioContext();
    const [vocalBuf, rawBeatBuf] = await Promise.all([
      vocal.file.arrayBuffer().then(ab => ctx.decodeAudioData(ab)),
      beat.file?.arrayBuffer().then(ab => ctx.decodeAudioData(ab)) ?? Promise.resolve(null),
    ]);
    
    let beatBuf = rawBeatBuf;
    if (vocalBuf && beatBuf) {
      setProgress(40);
      try {
        const { duckedBuffer, maxReductionDb } = await applyVocalDucking(beatBuf, vocalBuf);
        beatBuf = duckedBuffer;
        setVocalPocketDepth(maxReductionDb);
      } catch (err) {
        console.warn("Ducking failed, continuing without it.", err);
      }
    }
    
    setProgress(60);

    const vocalGain = Math.pow(10, vocalDb / 20);
    const beatGain  = beatBuf ? Math.pow(10, beatDb / 20) : 0;
    const length = Math.max(vocalBuf.length, beatBuf?.length ?? 0);
    const sr = vocalBuf.sampleRate;
    const nCh = Math.max(vocalBuf.numberOfChannels, beatBuf?.numberOfChannels ?? 1);

    const out = new AudioBuffer({ length, numberOfChannels: nCh, sampleRate: sr });
    for (let ch = 0; ch < nCh; ch++) {
      const dst = out.getChannelData(ch);
      const vSrc = vocalBuf.getChannelData(Math.min(ch, vocalBuf.numberOfChannels - 1));
      let bSrc: Float32Array | null = null;
      if (beatBuf) {
        bSrc = beatBuf.getChannelData(Math.min(ch, beatBuf.numberOfChannels - 1));
      }
      
      for (let i = 0; i < length; i++) {
        let v = 0;
        if (i < vocalBuf.length) {
          v += (vSrc[i] ?? 0) * vocalGain;
        }
        if (bSrc && i < beatBuf.length) {
          v += (bSrc[i] ?? 0) * beatGain;
        }
        
        // Soft-clip
        dst[i] = Math.tanh(v * 1.2) / 1.2;
      }
    }

    setProgress(90);
    // Encode to WAV blob
    const blob = await new Promise<Blob>(resolve => {
      // Use simple WAV encode
      const nSamples = out.length;
      const nChannels = out.numberOfChannels;
      const bps = 24;
      const bytesPS = bps / 8;
      const dataSize = nSamples * nChannels * bytesPS;
      const ab2 = new ArrayBuffer(44 + dataSize);
      const view = new DataView(ab2);
      const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      ws(0,'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8,'WAVE'); ws(12,'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, nChannels, true); view.setUint32(24, sr, true);
      view.setUint32(28, sr * nChannels * bytesPS, true); view.setUint16(32, nChannels * bytesPS, true);
      view.setUint16(34, bps, true); ws(36,'data'); view.setUint32(40, dataSize, true);
      let offset = 44;
      for (let i = 0; i < nSamples; i++) {
        for (let ch = 0; ch < nChannels; ch++) {
          const s = Math.max(-1, Math.min(1, out.getChannelData(ch)[i] ?? 0));
          const v = Math.round(s * 8388607);
          view.setUint8(offset,     v & 0xff);
          view.setUint8(offset + 1, (v >> 8) & 0xff);
          view.setUint8(offset + 2, (v >> 16) & 0xff);
          offset += 3;
        }
      }
      resolve(new Blob([ab2], { type: 'audio/wav' }));
    });

    const url = URL.createObjectURL(blob);
    setResultUrl(url);
    setUsedEngine('browser');
    setMixMeta({
      autoMix,
      selfMaster,
      targetIntensity: mixIntensity,
      vocalGainDb: vocalDb,
      beatGainDb: beatDb,
    });
    setMixStatus('done');
    setProgress(100);
    onMixComplete?.(out, blob);
  }, [vocal, beat, vocalDb, beatDb, autoMix, selfMaster, mixIntensity, onMixComplete]);

  const handleMix = useCallback(async () => {
    if (!vocal.file || mixStatus === 'mixing') return;
    setMixStatus('mixing');
    setProgress(10);
    setErrorMsg(null);
    setResultUrl(null);

    try {
      const form = new FormData();
      form.append('vocal', vocal.file, vocal.file.name);
      if (beat.file) form.append('beat', beat.file, beat.file.name);
      form.append('auto_mix', String(autoMix));
      form.append('self_master', String(selfMaster));
      form.append('vocal_db', String(vocalDb));
      form.append('beat_db', String(beatDb));
      form.append('mix_intensity', String(mixIntensity));
      form.append('target_lufs', '-14');
      form.append('ceiling_db', '-1.0');

      setProgress(30);
      const res = await fetch('/api/proxy/mix/tracks', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) throw new Error(`Server: ${res.status}`);
      setProgress(80);

      const blob = await res.blob();
      const ab = await blob.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(ab);
      const headerNumber = (name: string) => {
        const value = res.headers.get(name);
        if (value === null) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      };

      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setUsedEngine('python');
      setMixMeta({
        autoMix: res.headers.get('X-Auto-Mix') === '1',
        selfMaster: res.headers.get('X-Self-Master') === '1',
        targetIntensity: headerNumber('X-Mix-Target-Intensity'),
        referenceMatch: headerNumber('X-Mix-Reference-Match'),
        referenceGap: headerNumber('X-Mix-Reference-Gap'),
        primaryFocus: res.headers.get('X-Mix-Primary-Focus') ?? undefined,
        tonalBias: res.headers.get('X-Mix-Tonal-Bias') ?? null,
        vocalGainDb: headerNumber('X-Vocal-Gain-Db'),
        beatGainDb: headerNumber('X-Beat-Gain-Db'),
      });
      setMixStatus('done');
      setProgress(100);
      onMixComplete?.(decoded, blob);
    } catch (e) {
      // Fallback to browser mix
      console.warn('Backend mix failed, using browser:', e);
      await browserMix();
    }
  }, [vocal, beat, autoMix, selfMaster, vocalDb, beatDb, mixIntensity, mixStatus, browserMix, onMixComplete]);

  const handleDownload = useCallback(() => {
    if (!resultUrl) return;
    const base = (vocal.name || 'mix').replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `${base}—mixed-master.wav`;
    a.click();
  }, [resultUrl, vocal.name]);

  const handleReset = useCallback(() => {
    setVocal({ file: null, name: '', duration: null, waveform: null });
    setBeat({ file: null, name: '', duration: null, waveform: null });
    setMixStatus('idle');
    setProgress(0);
    setResultUrl(null);
    setErrorMsg(null);
    setUsedEngine(null);
    setMixMeta(null);
  }, []);

  const canMix = !!vocal.file && mixStatus === 'idle';
  const isBusy = mixStatus === 'mixing' || mixStatus === 'browser_fallback' || mixStatus === 'uploading';

  return (
    <div className="bg-[#12141a]/70 backdrop-blur-3xl rounded-[1.5rem] border border-white/[0.07] shadow-[0_16px_48px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            🎛
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white tracking-tight">
                Mix Combiner
              </span>
              {usedEngine && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  usedEngine === 'python'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/10 text-white/50'
                }`}>
                  {usedEngine === 'python' ? 'Python AI' : 'Browser Mix'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/35 mt-0.5">
              Drop your vocal + beat Get a mastered stereo bounce
            </p>
          </div>
        </div>
        {mixStatus === 'done' && (
          <button
            onClick={handleReset}
            className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Drop zones */}
        <div className="grid grid-cols-2 gap-3">
          <DropZone
            slot={vocal}
            label="Lead Vocal"
            icon="🎤"
            color="rose"
            accentColor="#F43F5E"
            onFile={handleVocalFile}
          />
          <DropZone
            slot={beat}
            label="Beat / Instrumental"
            icon="🥁"
            color="blue"
            accentColor="#3B82F6"
            onFile={handleBeatFile}
          />
        </div>

        {/* Mode + intensity */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-4 space-y-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Mix Mode</p>
              <p className="text-[11px] text-white/45">Manual faders stay visible. Autonomous mode sits next to them.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoMix(false)}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border transition-colors ${
                  !autoMix
                    ? 'border-white/25 bg-white/10 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70'
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => setAutoMix(true)}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border transition-colors ${
                  autoMix
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                    : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70'
                }`}
              >
                Autonomous
              </button>
              <button
                type="button"
                onClick={() => setSelfMaster(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest border transition-colors ${
                  selfMaster
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70'
                }`}
              >
                Self Master
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/40">Mix Intensity</span>
              <span className="text-[10px] text-white/60 tabular-nums font-medium">{mixIntensity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.70"
              max="1.30"
              step="0.01"
              value={mixIntensity}
              onChange={e => setMixIntensity(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>

        {/* Level faders */}
        <div className="grid grid-cols-2 gap-5 bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
          <Fader
            label="Vocal Level"
            value={vocalDb}
            min={-12}
            max={6}
            color="#F43F5E"
            onChange={setVocalDb}
          />
          <Fader
            label="Beat Level"
            value={beatDb}
            min={-18}
            max={0}
            color="#3B82F6"
            onChange={setBeatDb}
          />
        </div>

        {/* Progress / Mix button */}
        <AnimatePresence mode="wait">
          {isBusy ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-[10px] text-white/40">
                <span>
                  {mixStatus === 'browser_fallback' ? 'Browser mix…' : 'Python AI mixing…'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-purple-500 to-blue-500"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <p className="text-[9px] text-white/20 text-center">
                Vocal chain -&gt; level balance -&gt; stereo master
              </p>
            </motion.div>
          ) : mixStatus === 'done' ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownload}
                  className="flex-1 py-3 rounded-xl text-sm font-bold border border-emerald-500/20 text-emerald-300 bg-[linear-gradient(135deg,rgba(52,211,153,0.1),rgba(16,185,129,0.05))] hover:bg-emerald-500/20 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                  Download Mixed Master
                </motion.button>
                {resultUrl && (
                  <audio
                    src={resultUrl}
                    controls
                    className="flex-1 rounded-xl"
                    style={{ height: 40, minWidth: 0 }}
                  />
                )}
              </div>
              <p className="text-[9px] text-white/25 text-center">
                24-bit WAV -&gt; LUFS-normalized -&gt; true-peak limited
              </p>
              {mixMeta && (
                <div className="grid grid-cols-2 gap-2 text-[10px] text-white/45">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="uppercase tracking-widest text-white/30">Mode</p>
                    <p className="font-semibold text-white">{mixMeta.autoMix ? 'Autonomous' : 'Manual'}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="uppercase tracking-widest text-white/30">Self Master</p>
                    <p className="font-semibold text-white">{mixMeta.selfMaster ? 'Enabled' : 'Bypassed'}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="uppercase tracking-widest text-white/30">Focus</p>
                    <p className="font-semibold text-white capitalize">{mixMeta.primaryFocus?.replace(/_/g, ' ') ?? 'vocal'}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="uppercase tracking-widest text-white/30">Target Intensity</p>
                    <p className="font-semibold text-white">
                      {mixMeta.targetIntensity !== undefined ? `${mixMeta.targetIntensity.toFixed(2)}x` : 'n/a'}
                    </p>
                  </div>
                  {vocalPocketDepth !== null && (
                    <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 col-span-2">
                      <p className="uppercase tracking-widest text-orange-400/80">Vocal Pocket Depth</p>
                      <p className="font-semibold text-orange-400">
                        Instrumental mid-range ducked by {vocalPocketDepth.toFixed(1)} dB during vocal phrases
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.button
                id="mix-and-master-btn"
                data-testid="mix-master-btn"
                whileTap={{ scale: 0.97 }}
                onClick={() => void handleMix()}
                disabled={!canMix}
                className={`
                  w-full py-4 rounded-xl text-sm font-bold border tracking-wide transition-all duration-200
                  ${canMix
                    ? 'border-rose-500/20 text-white bg-[linear-gradient(135deg,rgba(244,63,94,0.15),rgba(59,130,246,0.15))] hover:bg-[linear-gradient(135deg,rgba(244,63,94,0.25),rgba(59,130,246,0.25))] shadow-[0_4px_16px_rgba(244,63,94,0.15),inset_0_1px_1px_rgba(255,255,255,0.1)] cursor-pointer'
                    : 'border-white/[0.06] text-white/20 cursor-not-allowed'}
                `}
              >
                {!vocal.file ? 'Drop your vocal WAV to begin' : autoMix ? 'Self Mix & Master →' : 'Mix & Master →'}
              </motion.button>
              <p className="text-[9px] text-white/20 text-center mt-1.5">
                {beat.file ? 'Vocal + beat → processed → mastered' : 'Beat optional → vocal-only mastering also works'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {errorMsg && (
          <p className="text-[10px] text-red-400/80 text-center">{errorMsg}</p>
        )}
      </div>
    </div>
  );
};

export default MixCombinerPanel;
