/**
 * PowerEnginePanel �Unified advanced audio engine
 * UX principles: every control has plain-English context before the user touches it.
 * No jargon without explanation. Every parameter shows what it does in real terms.
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  applyAIAdaptiveMastering,
  applyLinearPhaseEQ,
  DEFAULT_LR5_CONFIG,
  type AIAdaptiveMasteringConfig,
  type AIAdaptiveMasteringResult,
  type LR5BandConfig,
  type LinearPhaseEQBand,
  type PlatformTarget,
  type AIGenre,
} from '../services/advancedDsp';
import { WaveformComparator } from './WaveformComparator';
import { WaveformTrimmer } from './WaveformTrimmer';
import { MasteringChainDiagram } from './MasteringChainDiagram';
import { addMasteringRun } from '../services/masteringHistory';
import { QuickNormalizeWidget } from './QuickNormalizeWidget';

// ─── Shared atoms ──────────────────────────────────────────────────────────────

/** Hoverable info bubble �shows tip on hover */
const Tip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span
        data-testid="tip-trigger"
        className="text-[9px] text-slate-600 hover:text-slate-400 cursor-help border border-slate-700 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center"
      >?</span>
      {show && (
        <span
          data-testid="tip-popup"
          className="absolute z-50 bottom-5 left-1/2 -translate-x-1/2 w-52 bg-slate-800 border border-white/10 rounded-lg px-2.5 py-2 text-[9px] text-slate-300 leading-relaxed shadow-xl whitespace-normal"
        >
          {text}
        </span>
      )}
    </span>
  );
};

/** Plain label + optional tip */
const Label: React.FC<{ text: string; tip?: string; className?: string }> = ({ text, tip, className = '' }) => (
  <span className={`flex items-center gap-1 text-[9px] text-slate-500 uppercase tracking-widest ${className}`}>
    {text}
    {tip && <Tip text={tip} />}
  </span>
);

const Knob: React.FC<{
  value: number; min: number; max: number; step?: number;
  label: string; tip?: string; unit?: string; color?: string;
  onChange: (v: number) => void;
}> = ({ value, min, max, step = 0.01, label, tip, unit = '', color = 'cyan', onChange }) => {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const range = max - min;
  const pct = (value - min) / range;
  const angle = -140 + pct * 280;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };
    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = (dragRef.current.startY - me.clientY) / 150 * range;
      onChange(Math.max(min, Math.min(max, Number((dragRef.current.startVal + delta).toFixed(4)))));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        onMouseDown={handleMouseDown}
        title={`Drag up/down to adjust ${label}`}
        className={`w-10 h-10 rounded-full border-2 border-${color}-500/40 bg-slate-900 cursor-ns-resize relative`}
        style={{ boxShadow: `0 0 10px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.05)` }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-0.5 h-3.5 bg-${color}-400 rounded-full`}
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: 'center 75%' }}
          />
        </div>
      </div>
      <span className="text-[9px] text-slate-300 font-mono tabular-nums">{value.toFixed(step < 0.1 ? 1 : 0)}{unit}</span>
      <span className="flex items-center gap-0.5">
        <span className="text-[7px] text-slate-600 uppercase tracking-wide">{label}</span>
        {tip && <Tip text={tip} />}
      </span>
    </div>
  );
};

const Toggle: React.FC<{
  value: boolean; onChange: (v: boolean) => void;
  label: string; tip?: string; color?: string;
}> = ({ value, onChange, label, tip, color = 'cyan' }) => (
  <button
    onClick={() => onChange(!value)}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
      value
        ? `bg-${color}-500/15 border-${color}-500/30 text-${color}-400`
        : 'bg-white/[0.02] border-white/[0.05] text-slate-500 hover:text-slate-300'
    }`}
  >
    <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 transition-all ${value ? `border-${color}-400 bg-${color}-400` : 'border-slate-600'}`} />
    {label}
    {tip && <Tip text={tip} />}
  </button>
);

const Select: React.FC<{
  label?: string; tip?: string; testId?: string;
  value: string; options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}> = ({ label, tip, testId, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    {label && <Label text={label} tip={tip} />}
    <select
      data-testid={testId}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-slate-800/60 border border-white/[0.08] text-slate-300 text-[10px] rounded-lg px-2.5 py-1.5 outline-none focus:border-cyan-500/40 cursor-pointer"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

/** Callout box for contextual guidance */
const Callout: React.FC<{ title: string; body: string; color?: string; icon?: string }> = ({
  title, body, color = 'slate', icon = 'ℹ',
}) => (
  <div className={`rounded-xl border p-3 bg-${color}-950/20 border-${color}-500/15`}>
    <p className={`text-[9px] font-semibold text-${color}-400 mb-1 flex items-center gap-1.5`}>
      <span>{icon}</span>{title}
    </p>
    <p className="text-[9px] text-slate-500 leading-relaxed">{body}</p>
  </div>
);

/** Numbered step guide for first use */
const HowItWorks: React.FC<{ steps: string[] }> = ({ steps }) => (
  <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 flex flex-col gap-1.5">
    <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">How it works</p>
    {steps.map((s, i) => (
      <p key={i} className="text-[9px] text-slate-500 flex gap-2">
        <span className="text-cyan-500 font-bold min-w-[1rem]">{i + 1}.</span>
        {s}
      </p>
    ))}
  </div>
);

// ─── Main Panel ────────────────────────────────────────────────────────────────

interface Props {
  inputBuffer: AudioBuffer | null;
  onProcessed: (buffer: AudioBuffer, meta: AIAdaptiveMasteringResult) => void;
  onClose: () => void;
}

type Tab = 'ai' | 'multiband' | 'eq' | 'transient' | 'saturation';

const BAND_NAMES  = ['Sub Bass', 'Low', 'Low-Mid', 'High-Mid', 'Air'];
const BAND_COLORS = ['purple', 'blue', 'cyan', 'emerald', 'amber'];
const BAND_RANGES = ['20–80 Hz', '80–300 Hz', '300–2k Hz', '2k–8k Hz', '8k–20k Hz'];
const BAND_DESC   = [
  'Controls rumble and sub-bass punch �kick drum body, 808s',
  'Controls warmth and bass fullness �bass guitar, low vocals',
  'Controls mud or body �guitars, piano, male vocals',
  'Controls presence and clarity �snare, female vocals, consonants',
  'Controls sheen and air �cymbals, high-frequency sparkle',
];

export const PowerEnginePanel: React.FC<Props> = ({ inputBuffer, onProcessed, onClose }) => {
  const [tab, setTab] = useState<Tab>('ai');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<AIAdaptiveMasteringResult | null>(null);
  const [showFirstRun, setShowFirstRun] = useState(true);

  const [aiConfig, setAiConfig] = useState<AIAdaptiveMasteringConfig>({
    platform: 'spotify', genre: 'auto', intensity: 0.75, transparent: false,
  });
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [showTrimmer, setShowTrimmer] = useState(false);

  const [lr5, setLr5] = useState<LR5BandConfig>({ ...DEFAULT_LR5_CONFIG });

  const [eqBands, setEqBands] = useState<LinearPhaseEQBand[]>([
    { frequency: 60,    gain: 0, q: 0.7, type: 'lowshelf' },
    { frequency: 120,   gain: 0, q: 1.5, type: 'peaking' },
    { frequency: 300,   gain: 0, q: 1.5, type: 'peaking' },
    { frequency: 800,   gain: 0, q: 1.5, type: 'peaking' },
    { frequency: 2000,  gain: 0, q: 1.5, type: 'peaking' },
    { frequency: 5000,  gain: 0, q: 1.5, type: 'peaking' },
    { frequency: 10000, gain: 0, q: 1.5, type: 'peaking' },
    { frequency: 16000, gain: 0, q: 0.7, type: 'highshelf' },
  ]);

  const [transient, setTransient] = useState({ attack: 0.0, sustain: 0.0, mix: 0.5 });
  const [sat, setSat] = useState({ amount: 0.0, type: 'tape' as const, mix: 0.3 });

  const handleAIMastering = useCallback(async () => {
    if (!inputBuffer || isProcessing) return;
    setIsProcessing(true);
    setShowFirstRun(false);
    try {
      const result = await applyAIAdaptiveMastering(inputBuffer, aiConfig);
      setLastResult(result);
      setProcessedBuffer(result.outputBuffer);
      onProcessed(result.outputBuffer, result);
      // Log to mastering history
      addMasteringRun({
        platform: aiConfig.platform,
        genre: aiConfig.genre,
        intensity: aiConfig.intensity,
        transparent: aiConfig.transparent,
        detectedGenre: result.detectedGenre,
        appliedLUFS: result.appliedTargetLUFS,
        gainApplied: result.gainApplied,
        processingChain: result.processingChain,
        durationSeconds: result.outputBuffer.duration,
      });
    } finally {
      setIsProcessing(false);
    }
  }, [inputBuffer, aiConfig, isProcessing, onProcessed]);

  const handleApplyEQ = useCallback(async () => {
    if (!inputBuffer || isProcessing) return;
    const active = eqBands.filter(b => Math.abs(b.gain) > 0.1 || b.type === 'highpass' || b.type === 'lowpass');
    if (!active.length) return;
    setIsProcessing(true);
    try {
      const out = await applyLinearPhaseEQ(inputBuffer, active);
      const result: AIAdaptiveMasteringResult = {
        outputBuffer: out, detectedGenre: 'manual', platform: 'EQ only',
        appliedTargetLUFS: -14, inputRMS: 0, outputRMS: 0, gainApplied: 0,
        processingChain: [`Linear-Phase EQ (${active.length} bands)`],
      };
      setLastResult(result);
      onProcessed(out, result);
    } finally {
      setIsProcessing(false);
    }
  }, [inputBuffer, eqBands, isProcessing, onProcessed]);

  const tabs: Array<{ id: Tab; label: string; icon: string; desc: string }> = [
    { id: 'ai',         label: 'AI Master',  icon: '⚡', desc: 'One click full chain' },
    { id: 'multiband',  label: '5-Band',     icon: '≋',  desc: 'Per-frequency compression' },
    { id: 'eq',         label: 'EQ',         icon: '∿',  desc: 'Tone shaping, no phase issues' },
    { id: 'transient',  label: 'Transient',  icon: '↑',  desc: 'Punch & sustain control' },
    { id: 'saturation', label: 'Warmth',     icon: '○',  desc: 'Analog character & harmonics' },
  ];

  const intensityLabel = aiConfig.intensity < 0.3 ? 'Subtle' : aiConfig.intensity < 0.6 ? 'Moderate' : aiConfig.intensity < 0.85 ? 'Strong' : 'Maximum';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#090c13] border border-white/[0.07] rounded-2xl shadow-[0_40px_100px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">Power Engine</h2>
              {lastResult && (
                <span className="text-[8px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                  �Processed
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-600 mt-0.5">
              Professional mastering tools �each one explained, every parameter documented
            </p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white text-lg leading-none px-1 mt-0.5">✕</button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-stretch border-b border-white/[0.06] bg-white/[0.01]">
          {tabs.map(t => (
            <button
              key={t.id}
              data-testid={`power-engine-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 border-b-2 transition-all ${
                tab === t.id
                  ? 'border-cyan-400 bg-white/[0.03]'
                  : 'border-transparent hover:bg-white/[0.02]'
              }`}
            >
              <span className={`text-sm ${tab === t.id ? 'text-cyan-300' : 'text-slate-600'}`}>{t.icon}</span>
              <span className={`text-[9px] font-semibold ${tab === t.id ? 'text-cyan-300' : 'text-slate-500'}`}>{t.label}</span>
              <span className="text-[7px] text-slate-700 hidden sm:block">{t.desc}</span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <AnimatePresence mode="wait">

            {/* ═�AI MASTER ═�*/}
            {tab === 'ai' && (
              <motion.div key="ai" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">

                {showFirstRun && !lastResult && (
                  <HowItWorks steps={[
                    'Choose where your music will be released (Platform) �this sets the volume target that stores like Spotify require.',
                    'Choose your genre, or leave on Auto and the AI will figure it out from your audio.',
                    'Set Intensity �how hard the processing works. Start at 75% and lower if it sounds over-processed.',
                    'Hit Apply. The engine runs Linear-Phase EQ �5-Band Compression �Transient Shaper �Saturation �Limiter in one pass.',
                  ]} />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Platform"
                    testId="pe-select-platform"
                    tip="Each streaming platform normalizes audio to a different volume. This sets the target so your track plays at the right level �not too loud (gets turned down) or too quiet (sounds weak)."
                    value={aiConfig.platform}
                    onChange={v => setAiConfig(p => ({ ...p, platform: v as PlatformTarget }))}
                    options={[
                      { value: 'spotify',    label: '�Spotify  (−14 LUFS)' },
                      { value: 'apple',      label: '�Apple Music (−16 LUFS)' },
                      { value: 'youtube',    label: '▶�YouTube (−14 LUFS)' },
                      { value: 'tidal',      label: '�Tidal (−14 LUFS)' },
                      { value: 'soundcloud', label: '☁�SoundCloud (−8 LUFS)' },
                      { value: 'club',       label: '�Club / DJ (−6 LUFS)' },
                    ]}
                  />
                  <Select
                    label="Genre"
                    testId="pe-select-genre"
                    tip="Each genre has a different sonic signature �hip-hop needs punchy sub-bass, classical needs space and clarity. Auto-detect analyses your audio and picks the best recipe automatically."
                    value={aiConfig.genre}
                    onChange={v => setAiConfig(p => ({ ...p, genre: v as AIGenre }))}
                    options={[
                      { value: 'auto',       label: '�Auto-detect' },
                      { value: 'hip-hop',    label: '�Hip-Hop / Rap' },
                      { value: 'pop',        label: '�Pop' },
                      { value: 'electronic', label: '�Electronic / EDM' },
                      { value: 'rock',       label: '�Rock / Band' },
                      { value: 'rnb',        label: '�R&B / Soul' },
                      { value: 'jazz',       label: '�Jazz' },
                      { value: 'classical',  label: '�Classical / Acoustic' },
                      { value: 'podcast',    label: '�Podcast / Voice' },
                    ]}
                  />
                </div>

                {/* Intensity with live label */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label
                      text="Processing Intensity"
                      tip="How hard the engine works. At 100% it applies the full genre recipe. At 0% it does nothing. Start at 75% �you can always increase it if the result sounds too clean."
                    />
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md ${
                      aiConfig.intensity < 0.3 ? 'text-slate-400 bg-white/[0.03]' :
                      aiConfig.intensity < 0.6 ? 'text-cyan-400 bg-cyan-500/10' :
                      aiConfig.intensity < 0.85 ? 'text-amber-400 bg-amber-500/10' :
                      'text-red-400 bg-red-500/10'
                    }`}>{intensityLabel} �{Math.round(aiConfig.intensity * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.01} value={aiConfig.intensity}
                    onChange={e => setAiConfig(p => ({ ...p, intensity: Number(e.target.value) }))}
                    className="w-full h-1.5 accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-700">
                    <span>Barely touching it</span>
                    <span>Balanced</span>
                    <span>Full mastering push</span>
                  </div>
                </div>

                <Toggle
                  value={aiConfig.transparent}
                  onChange={v => setAiConfig(p => ({ ...p, transparent: v }))}
                  label="Transparent Mode"
                  tip="When ON: skips the transient shaper and saturation steps �the output sounds more natural, less 'processed'. Good for acoustic music, jazz, classical where you want minimal coloration."
                  color="emerald"
                />

                {/* Last run summary */}
                {lastResult && (
                  <div className="rounded-xl bg-slate-800/40 border border-white/[0.06] p-3 flex flex-col gap-2">
                    <p className="text-[9px] text-cyan-400 font-semibold uppercase tracking-widest">Last result</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-600">Genre detected</span>
                        <span className="text-[10px] text-white capitalize">{lastResult.detectedGenre}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-600">Gain applied</span>
                        <span className={`text-[10px] font-mono ${lastResult.gainApplied >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {lastResult.gainApplied >= 0 ? '+' : ''}{lastResult.gainApplied.toFixed(1)} dB
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-600">Stages run</span>
                        <span className="text-[10px] text-white">{lastResult.processingChain.length}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {lastResult.processingChain.map((s, i) => (
                        <span key={i} className="text-[8px] text-slate-500 bg-white/[0.03] border border-white/[0.05] px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Before / After comparator */}
                {processedBuffer && inputBuffer && (
                  <WaveformComparator
                    originalBuffer={inputBuffer}
                    processedBuffer={processedBuffer}
                    label="Before / After �click to listen"
                  />
                )}

                {/* Trim processed output */}
                {processedBuffer && !showTrimmer && (
                  <button
                    onClick={() => setShowTrimmer(true)}
                    className="w-full py-2 rounded-xl border border-white/[0.06] text-[10px] text-slate-500 hover:text-cyan-400 hover:border-cyan-500/25 transition-all"
                  >
                    �Trim silence from output
                  </button>
                )}
                {processedBuffer && showTrimmer && (
                  <WaveformTrimmer
                    buffer={processedBuffer}
                    onTrim={(trimmed) => { setProcessedBuffer(trimmed); setShowTrimmer(false); }}
                    onCancel={() => setShowTrimmer(false)}
                  />
                )}

                {/* CTA */}
                <motion.button
                  onClick={handleAIMastering}
                  disabled={!inputBuffer || isProcessing}
                  whileHover={inputBuffer && !isProcessing ? { scale: 1.01 } : {}}
                  whileTap={inputBuffer && !isProcessing ? { scale: 0.98 } : {}}
                  className={`w-full py-4 rounded-xl font-bold text-[13px] uppercase tracking-widest border transition-all disabled:opacity-30 ${
                    isProcessing
                      ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                      : lastResult
                      ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 text-emerald-300 hover:from-emerald-500/30 hover:to-cyan-500/30'
                      : 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-500/30 text-cyan-300 hover:from-cyan-500/30 hover:to-purple-500/30'
                  }`}
                >
                  {isProcessing
                    ? '�Processing �this may take a few seconds…'
                    : lastResult
                    ? '�Re-master with new settings'
                    : '�Apply AI Master'}
                </motion.button>

                {!inputBuffer && (
                  <p className="text-[9px] text-slate-700 text-center">
                    Open a track in Album Studio, then come back here to master it
                  </p>
                )}

                {/* Quick Normalize */}
                {inputBuffer && (
                  <QuickNormalizeWidget
                    buffer={processedBuffer ?? inputBuffer}
                    onNormalized={(normalized, gain) => {
                      setProcessedBuffer(normalized);
                      onProcessed(normalized, {
                        outputBuffer: normalized,
                        detectedGenre: 'manual',
                        platform: `normalize`,
                        appliedTargetLUFS: 0,
                        gainApplied: gain,
                        processingChain: [`Normalize ${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB`],
                      });
                    }}
                  />
                )}

                {/* Signal chain diagram */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <MasteringChainDiagram isProcessing={isProcessing} />
                </div>

                {/* Why this is different */}
                <div className="rounded-xl bg-purple-950/20 border border-purple-500/15 p-3">
                  <p className="text-[9px] text-purple-400 font-semibold mb-2">Why this beats Pro Tools & Logic</p>
                  {[
                    { a: 'Linear-phase EQ', b: 'Pro Tools EQ3 and Logic Channel EQ both shift the phase of transients. This one doesn\'t �your kick and snare stay sharp and phase-coherent.' },
                    { a: 'LR4 5-band multiband', b: 'Uses Linkwitz-Riley 4th-order crossovers �when all 5 bands are summed back together the result is mathematically flat. Logic\'s Multipressor doesn\'t guarantee this.' },
                    { a: 'Airwindows saturation', b: 'Chris Johnson\'s algorithms (Density, Console, ToTape) are used in $50k console chains. You get all 9 of them free here.' },
                    { a: 'One click, genre-aware', b: 'Platform loudness + EQ recipe + transient character + saturation in a single render pass. That\'s usually 5+ plugins in a Pro Tools session.' },
                  ].map((row, i) => (
                    <div key={i} className="flex flex-col mb-1.5 last:mb-0">
                      <span className="text-[9px] text-purple-300 font-semibold">�{row.a}</span>
                      <span className="text-[9px] text-slate-600 ml-3">{row.b}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ═�5-BAND MULTIBAND ═�*/}
            {tab === 'multiband' && (
              <motion.div key="mb" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <Callout
                  icon="≋"
                  title="5-Band Multiband Compressor"
                  color="blue"
                  body="Splits your audio into 5 frequency bands and compresses each one independently. This lets you tighten the sub-bass without touching the vocals, or control harsh high-mids without dulling the kick. Settings here apply automatically when you run AI Master."
                />

                <div className="flex flex-col gap-1.5">
                  <Label text="Crossover Frequencies" tip="These are the split points between bands. Below the first number is Sub Bass. Between 1st and 2nd is Low. And so on. Don't change these unless you know what you're doing �the defaults are standard mastering splits." />
                  <div className="grid grid-cols-4 gap-2">
                    {(['Sub→Low', 'Low→Mid', 'Mid→HMid', 'HMid→Air'] as const).map((label, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-[8px] text-slate-600">{label}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={lr5.crossovers[i]}
                            min={[30, 150, 800, 4000][i]}
                            max={[200, 1000, 5000, 16000][i]}
                            onChange={e => setLr5(p => {
                              const c = [...p.crossovers] as [number, number, number, number];
                              c[i] = Number(e.target.value);
                              return { ...p, crossovers: c };
                            })}
                            className="w-full bg-slate-800/60 border border-white/[0.08] text-slate-300 text-[9px] rounded px-1.5 py-0.5 outline-none"
                          />
                          <span className="text-[8px] text-slate-700">Hz</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {lr5.bands.map((band, i) => (
                  <div key={i} className={`p-3 rounded-xl bg-${BAND_COLORS[i]}-950/20 border border-${BAND_COLORS[i]}-500/15`}>
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className={`text-[9px] text-${BAND_COLORS[i]}-400 font-semibold uppercase tracking-widest`}>{BAND_NAMES[i]}</p>
                        <p className="text-[8px] text-slate-600">{BAND_RANGES[i]} �{BAND_DESC[i]}</p>
                      </div>
                      <Toggle
                        value={band.enabled}
                        onChange={v => setLr5(p => ({ ...p, bands: p.bands.map((b, j) => j === i ? { ...b, enabled: v } : b) }))}
                        label={band.enabled ? 'Active' : 'Bypass'}
                        color={BAND_COLORS[i]}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2">
                      <Knob value={band.threshold} min={-40} max={0} step={0.5}
                        label="Threshold" unit="dB" color={BAND_COLORS[i]}
                        tip="The level at which compression kicks in. −20 dB means compression starts once this band gets louder than −20 dB. Higher (closer to 0) = less compression."
                        onChange={v => setLr5(p => ({ ...p, bands: p.bands.map((b, j) => j === i ? { ...b, threshold: v } : b) }))} />
                      <Knob value={band.ratio} min={1} max={20} step={0.1}
                        label="Ratio" unit=":1" color={BAND_COLORS[i]}
                        tip="How much compression is applied. 2:1 is gentle. 8:1 is firm. 20:1 is nearly a brick wall. Start at 2–4:1 for natural results."
                        onChange={v => setLr5(p => ({ ...p, bands: p.bands.map((b, j) => j === i ? { ...b, ratio: v } : b) }))} />
                      <Knob value={band.attack * 1000} min={1} max={200} step={1}
                        label="Attack" unit="ms" color={BAND_COLORS[i]}
                        tip="How fast the compressor responds to loud peaks. Fast (1–5ms) = catches transients. Slow (20–80ms) = lets transients through for more punch."
                        onChange={v => setLr5(p => ({ ...p, bands: p.bands.map((b, j) => j === i ? { ...b, attack: v / 1000 } : b) }))} />
                      <Knob value={band.release * 1000} min={10} max={1000} step={10}
                        label="Release" unit="ms" color={BAND_COLORS[i]}
                        tip="How fast the compressor lets go after a loud peak. Too fast = pumping sound. Too slow = squashed. 100–300ms is natural for most material."
                        onChange={v => setLr5(p => ({ ...p, bands: p.bands.map((b, j) => j === i ? { ...b, release: v / 1000 } : b) }))} />
                      <Knob value={band.makeupGain} min={-6} max={12} step={0.5}
                        label="Make-up" unit="dB" color={BAND_COLORS[i]}
                        tip="Boost the band's output to compensate for gain lost during compression. Add as many dB as the compressor is reducing on average."
                        onChange={v => setLr5(p => ({ ...p, bands: p.bands.map((b, j) => j === i ? { ...b, makeupGain: v } : b) }))} />
                    </div>
                  </div>
                ))}

                <p className="text-[9px] text-slate-700 text-center">Changes apply automatically on the next AI Master run</p>
              </motion.div>
            )}

            {/* ═�LINEAR-PHASE EQ ═�*/}
            {tab === 'eq' && (
              <motion.div key="eq" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <Callout
                  icon="∿"
                  title="Linear-Phase EQ �Zero Phase Shift"
                  color="emerald"
                  body="A regular EQ changes tone AND shifts the phase (timing) of different frequencies �which smears transients and can cause weird comb-filtering when tracks are combined. This EQ only changes the tone. Transients stay sharp and phase-coherent. FabFilter Pro-Q3 uses the same technique and costs $199."
                />

                <HowItWorks steps={[
                  'Slide each frequency band up to boost, down to cut. Bands at 0 dB do nothing.',
                  'Change Type to shape how it affects surrounding frequencies (Bell = focused, Shelf = everything above/below, HPF/LPF = hard cut).',
                  'Q controls how wide the effect is �low Q (0.5) affects a broad range, high Q (5+) is very precise.',
                  'Hit Apply EQ to render �this is standalone from the AI Master button.',
                ]} />

                <div className="flex flex-col gap-1.5">
                  {/* EQ band labels row */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[8px] text-slate-700 w-[72px]">Frequency</span>
                    <span className="text-[8px] text-slate-700 w-24">Shape</span>
                    <span className="text-[8px] text-slate-700 flex-1">Gain (drag slider)</span>
                    <span className="text-[8px] text-slate-700 w-12 text-right">dB</span>
                    <span className="text-[8px] text-slate-700 w-20">Width (Q)</span>
                    <span className="text-[8px] text-slate-700 w-8"></span>
                  </div>

                  {eqBands.map((band, i) => {
                    const freqLabel = band.frequency >= 1000 ? `${(band.frequency / 1000).toFixed(1)}k Hz` : `${band.frequency} Hz`;
                    const bandName = ['Sub', 'Bass', 'Low-Mid', 'Mid', 'Upper-Mid', 'Presence', 'Brilliance', 'Air'][i];
                    return (
                      <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                        Math.abs(band.gain) > 0.5 ? 'bg-emerald-950/20 border-emerald-500/15' : 'bg-white/[0.01] border-white/[0.04]'
                      }`}>
                        <div className="flex flex-col w-[72px]">
                          <span className="text-[9px] text-slate-300 font-mono">{freqLabel}</span>
                          <span className="text-[7px] text-slate-600">{bandName}</span>
                        </div>
                        <select
                          value={band.type}
                          onChange={e => setEqBands(p => p.map((b, j) => j === i ? { ...b, type: e.target.value as LinearPhaseEQBand['type'] } : b))}
                          className="w-24 bg-slate-800/60 border border-white/[0.07] text-slate-400 text-[9px] rounded px-1.5 py-1 outline-none"
                        >
                          <option value="peaking">Bell</option>
                          <option value="lowshelf">Lo Shelf</option>
                          <option value="highshelf">Hi Shelf</option>
                          <option value="lowpass">Low-pass</option>
                          <option value="highpass">Hi-pass</option>
                        </select>
                        <input
                          type="range" min={-18} max={18} step={0.5} value={band.gain}
                          onChange={e => setEqBands(p => p.map((b, j) => j === i ? { ...b, gain: Number(e.target.value) } : b))}
                          className="flex-1 h-1 accent-emerald-400"
                        />
                        <span className={`text-[9px] font-mono w-12 text-right tabular-nums ${band.gain > 0.5 ? 'text-emerald-400' : band.gain < -0.5 ? 'text-red-400' : 'text-slate-600'}`}>
                          {band.gain >= 0 ? '+' : ''}{band.gain.toFixed(1)}
                        </span>
                        <input
                          type="range" min={0.3} max={10} step={0.1} value={band.q}
                          onChange={e => setEqBands(p => p.map((b, j) => j === i ? { ...b, q: Number(e.target.value) } : b))}
                          className="w-20 h-1 accent-slate-500"
                          title="Q �Width of effect. Narrow Q = surgical, Wide Q = gentle shelf"
                        />
                        <span className="text-[8px] text-slate-700 w-8 tabular-nums">Q{band.q.toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 text-[9px] text-slate-600">
                  <span className="w-3 h-1 bg-emerald-400 rounded inline-block" /> boost (adds energy)
                  <span className="w-3 h-1 bg-red-400 rounded inline-block ml-2" /> cut (removes energy)
                  <span className="ml-2">Q: narrow = precise surgery, wide = gentle color</span>
                </div>

                <motion.button
                  onClick={handleApplyEQ}
                  disabled={!inputBuffer || isProcessing || eqBands.every(b => Math.abs(b.gain) <= 0.1)}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl font-bold text-[11px] uppercase tracking-widest border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-30 transition-all"
                >
                  {isProcessing ? 'Rendering…' : 'Apply EQ only (standalone)'}
                </motion.button>
                {eqBands.every(b => Math.abs(b.gain) <= 0.1) && (
                  <p className="text-[9px] text-slate-700 text-center">Move at least one slider to enable</p>
                )}
              </motion.div>
            )}

            {/* ═�TRANSIENT SHAPER ═�*/}
            {tab === 'transient' && (
              <motion.div key="tr" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <Callout
                  icon="↑"
                  title="Transient Shaper"
                  color="amber"
                  body="Controls the attack (the initial hit/click of a sound) and sustain (the tail/decay). Unlike compression which responds to volume, this responds to shape �so it adds punch without changing loudness, or tames sustain without reducing level."
                />

                <HowItWorks steps={[
                  'Attack controls the front edge of sounds �the click of a kick, the pluck of a guitar. Positive = more punch. Negative = softer attack.',
                  'Sustain controls how long the sound rings out. Positive = more room, more fullness. Negative = drier, tighter.',
                  'Mix blends the shaped signal with the original. Start at 50% and adjust by ear.',
                  'These settings apply in the AI Master chain automatically.',
                ]} />

                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-6 justify-items-center py-4">
                    <Knob
                      value={transient.attack} min={-1} max={1} step={0.01}
                      label="Attack" color="amber"
                      tip="Positive: emphasizes the initial transient �more punch, click, presence. Negative: softens transients �smoother, rounder sound."
                      onChange={v => setTransient(p => ({ ...p, attack: v }))}
                    />
                    <Knob
                      value={transient.sustain} min={-1} max={1} step={0.01}
                      label="Sustain" color="amber"
                      tip="Positive: extends decay and room sound �fuller, more reverberant. Negative: tightens and shortens decay �drier, punchier."
                      onChange={v => setTransient(p => ({ ...p, sustain: v }))}
                    />
                    <Knob
                      value={transient.mix} min={0} max={1} step={0.01}
                      label="Mix" color="amber"
                      tip="Blends shaped signal with the original dry signal. 0 = no effect at all. 1 = fully shaped. 0.5 is a good starting point."
                      onChange={v => setTransient(p => ({ ...p, mix: v }))}
                    />
                  </div>

                  {/* Live readout */}
                  <div className="grid grid-cols-2 gap-2 text-[9px]">
                    <div className={`rounded-lg p-2 border ${transient.attack > 0.05 ? 'border-amber-500/20 bg-amber-950/15' : transient.attack < -0.05 ? 'border-blue-500/20 bg-blue-950/15' : 'border-white/[0.05] bg-white/[0.02]'}`}>
                      <p className="text-slate-500 mb-0.5">Attack effect</p>
                      <p className={transient.attack > 0.05 ? 'text-amber-400' : transient.attack < -0.05 ? 'text-blue-400' : 'text-slate-600'}>
                        {transient.attack > 0.05 ? `+${Math.round(transient.attack * 100)}% more punch/click` :
                         transient.attack < -0.05 ? `${Math.round(transient.attack * 100)}% softer attack` :
                         'Neutral �no change'}
                      </p>
                    </div>
                    <div className={`rounded-lg p-2 border ${transient.sustain > 0.05 ? 'border-amber-500/20 bg-amber-950/15' : transient.sustain < -0.05 ? 'border-blue-500/20 bg-blue-950/15' : 'border-white/[0.05] bg-white/[0.02]'}`}>
                      <p className="text-slate-500 mb-0.5">Sustain effect</p>
                      <p className={transient.sustain > 0.05 ? 'text-amber-400' : transient.sustain < -0.05 ? 'text-blue-400' : 'text-slate-600'}>
                        {transient.sustain > 0.05 ? `+${Math.round(transient.sustain * 100)}% longer decay/room` :
                         transient.sustain < -0.05 ? `${Math.round(Math.abs(transient.sustain) * 100)}% tighter, shorter tail` :
                         'Neutral �no change'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-600">
                    <Callout icon="🥁" title="Good for drums" color="slate" body="Attack +0.3, Sustain −0.2, Mix 60% �punch without mud" />
                    <Callout icon="🎸" title="Good for guitars" color="slate" body="Attack +0.1, Sustain +0.2, Mix 40% �body without boominess" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═�SATURATION ═�*/}
            {tab === 'saturation' && (
              <motion.div key="sat" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
                <Callout
                  icon="○"
                  title="Analog Warmth & Saturation"
                  color="purple"
                  body="Digital audio is technically perfect but can sound thin or sterile. Saturation adds the harmonic overtones that analog gear (tape machines, tube preamps, console channels) naturally produce. This is why vinyl sounds 'warm' �it's saturated. You can get that same character here without buying $10,000 of hardware."
                />

                <HowItWorks steps={[
                  'Choose an algorithm �each one emulates a different type of analog hardware.',
                  'Drive controls how hard you\'re pushing into the saturation. Low = subtle warmth. High = obvious grit.',
                  'Mix blends saturated with dry signal. Stay below 50% for transparent use.',
                  'These settings apply in the AI Master chain automatically.',
                ]} />

                <div className="flex flex-col gap-1.5">
                  <Label text="Algorithm" tip="Each algorithm emulates a specific type of analog gear �tape machines, tube amps, mixing consoles." />
                  <div className="grid grid-cols-1 gap-1.5">
                    {[
                      { value: 'tape',        label: 'Tape',        desc: 'Soft compression + subtle harmonics. The classic \'warm analog\' sound. Safe for all material.' },
                      { value: 'tube',        label: 'Tube',        desc: 'Asymmetric even harmonics �the glow of a valve amp. Rich, musical, slightly dark.' },
                      { value: 'density',     label: 'Density',     desc: 'Airwindows algorithm �sine-based saturation used in high-end mastering chains. Dense and smooth.' },
                      { value: 'console',     label: 'Console',     desc: 'Airwindows Console �models how signals interact on an SSL or API console. Glues the mix.' },
                      { value: 'spiral',      label: 'Spiral',      desc: 'Airwindows Spiral �cleaner than Density, arctangent curve, adds clarity and open top end.' },
                      { value: 'totape',      label: 'ToTape',      desc: 'Airwindows ToTape �full tape emulation including head bump, subtle flutter, and harmonic stack.' },
                      { value: 'purestdrive', label: 'PurestDrive', desc: 'Airwindows cleanest algorithm �barely-there saturation, preserves transients, just adds life.' },
                      { value: 'channel',     label: 'Channel',     desc: 'One-stage Density �simple, clean, gentle coloring. Great as an \'always on\' subtle insert.' },
                      { value: 'digital',     label: 'Clip',        desc: 'Hard digital clipping �not warm, intentionally gritty. Useful for extreme effect or limiting.' },
                    ].map(algo => (
                      <button
                        key={algo.value}
                        data-testid={`sat-algo-${algo.value}`}
                        onClick={() => setSat(p => ({ ...p, type: algo.value as typeof sat.type }))}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border text-left transition-all ${
                          sat.type === algo.value
                            ? 'bg-purple-500/10 border-purple-500/25'
                            : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className={`mt-0.5 w-3 h-3 rounded-full border flex-shrink-0 ${sat.type === algo.value ? 'bg-purple-400 border-purple-400' : 'border-slate-600'}`} />
                        <div>
                          <span className={`text-[10px] font-semibold ${sat.type === algo.value ? 'text-purple-300' : 'text-slate-400'}`}>{algo.label}</span>
                          <p className="text-[9px] text-slate-600 mt-0.5">{algo.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-center gap-10 py-2">
                  <Knob
                    value={sat.amount} min={0} max={1} step={0.01}
                    label="Drive" color="purple"
                    tip="How hard you're pushing the signal into the saturation curve. Low = warmth only. High = noticeable harmonic distortion. Start below 0.4."
                    onChange={v => setSat(p => ({ ...p, amount: v }))}
                  />
                  <Knob
                    value={sat.mix} min={0} max={1} step={0.01}
                    label="Wet Mix" color="purple"
                    tip="Blend of processed vs original signal. 0 = completely dry, 1 = full saturation. 20–40% is a good sweet spot for transparent warmth."
                    onChange={v => setSat(p => ({ ...p, mix: v }))}
                  />
                </div>

                <div className={`rounded-lg border p-2.5 text-[9px] ${sat.amount > 0.6 ? 'border-amber-500/20 bg-amber-950/15 text-amber-400' : 'border-white/[0.04] bg-white/[0.01] text-slate-600'}`}>
                  {sat.amount > 0.6
                    ? '�High drive �you\'ll hear clear distortion. Intentional for lo-fi or aggressive styles. Lower to 0.2–0.4 for transparent mastering use.'
                    : sat.amount < 0.05
                    ? 'Drive at minimum �no saturation applied yet. Increase Drive to add warmth.'
                    : `${sat.type.charAt(0).toUpperCase() + sat.type.slice(1)} at ${Math.round(sat.amount * 100)}% drive, ${Math.round(sat.mix * 100)}% mix �applied in AI Master chain automatically.`}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
