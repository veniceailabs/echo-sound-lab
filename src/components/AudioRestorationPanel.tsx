/**
 * AudioRestorationPanel �Fix damaged, noisy, or sibilant audio
 * UX goal: every tool explains what it fixes, what each knob does, and when to use it.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { applyRestoration, DEFAULT_RESTORATION } from '../services/audioRestoration';
import type { RestorationConfig } from '../services/audioRestoration';

interface Props {
  inputBuffer: AudioBuffer | null;
  onProcessed: (buffer: AudioBuffer) => void;
}

// ──�UI atoms ──────────────────────────────────────────────────────────────────

const Tip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span className="text-[9px] text-slate-600 hover:text-slate-400 cursor-help border border-slate-700 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center">?</span>
      {show && (
        <span className="absolute z-50 bottom-5 left-1/2 -translate-x-1/2 w-56 bg-slate-800 border border-white/10 rounded-lg px-2.5 py-2 text-[9px] text-slate-300 leading-relaxed shadow-xl whitespace-normal pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
};

const Slider: React.FC<{
  label: string;
  tip: string;
  value: number;
  min: number; max: number; step: number;
  unit?: string;
  lowLabel?: string;
  highLabel?: string;
  onChange: (v: number) => void;
  color?: string;
}> = ({ label, tip, value, min, max, step, unit = '', lowLabel, highLabel, onChange, color = 'cyan' }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-[9px] text-slate-500 uppercase tracking-widest">
        {label} <Tip text={tip} />
      </span>
      <span className={`text-[9px] font-mono text-${color}-400`}>
        {value.toFixed(step < 0.1 ? 2 : 0)}{unit}
      </span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={`h-1.5 w-full accent-${color}-400`}
    />
    {(lowLabel || highLabel) && (
      <div className="flex justify-between text-[8px] text-slate-700">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    )}
  </div>
);

const ToolCard: React.FC<{
  enabled: boolean;
  onToggle: (v: boolean) => void;
  title: string;
  tagline: string;
  whenToUse: string;
  color: string;
  icon: string;
  children?: React.ReactNode;
}> = ({ enabled, onToggle, title, tagline, whenToUse, color, icon, children }) => (
  <div className={`rounded-xl border transition-all ${enabled ? `bg-${color}-950/20 border-${color}-500/20` : 'bg-white/[0.01] border-white/[0.05]'}`}>
    {/* Header �always visible */}
    <button
      onClick={() => onToggle(!enabled)}
      className="w-full flex items-start gap-3 p-3 text-left"
    >
      <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base transition-all ${enabled ? `bg-${color}-500/20 text-${color}-400` : 'bg-white/[0.04] text-slate-600'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-[10px] font-semibold ${enabled ? `text-${color}-300` : 'text-slate-400'}`}>{title}</p>
          <span className={`text-[7px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${enabled ? `bg-${color}-500/15 text-${color}-400` : 'bg-white/[0.03] text-slate-600'}`}>
            {enabled ? 'ON' : 'OFF'}
          </span>
        </div>
        <p className="text-[9px] text-slate-500 mt-0.5">{tagline}</p>
      </div>
    </button>

    {/* Expanded controls */}
    <AnimatePresence>
      {enabled && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="px-3 pb-3 pt-0 flex flex-col gap-3">
            {/* When to use */}
            <div className={`rounded-lg p-2 bg-${color}-950/30 border border-${color}-500/10`}>
              <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">Best for</p>
              <p className="text-[9px] text-slate-400 leading-relaxed">{whenToUse}</p>
            </div>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// ──�Main component ────────────────────────────────────────────────────────────

export const AudioRestorationPanel: React.FC<Props> = ({ inputBuffer, onProcessed }) => {
  const [cfg, setCfg] = useState<RestorationConfig>(DEFAULT_RESTORATION());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  const updateNR = (patch: object) => setCfg(prev => ({ ...prev, noiseReduction: { ...prev.noiseReduction, ...patch } }));
  const updateDC = (patch: object) => setCfg(prev => ({ ...prev, deClicker: { ...prev.deClicker, ...patch } }));
  const updateDE = (patch: object) => setCfg(prev => ({ ...prev, deEsser: { ...prev.deEsser, ...patch } }));

  const noneEnabled = !cfg.noiseReduction.enabled && !cfg.deClicker.enabled && !cfg.deEsser.enabled;

  const handleProcess = useCallback(async () => {
    if (!inputBuffer || isProcessing || noneEnabled) return;
    setIsProcessing(true);
    setProcessed(false);
    try {
      const result = await applyRestoration(inputBuffer, cfg);
      onProcessed(result);
      setProcessed(true);
      setShowGuide(false);
    } finally {
      setIsProcessing(false);
    }
  }, [inputBuffer, cfg, isProcessing, noneEnabled, onProcessed]);

  return (
    <div className="flex flex-col gap-3">

      {/* Intro guide �hidden after first use */}
      {showGuide && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest">How to use</p>
            <button onClick={() => setShowGuide(false)} className="text-[8px] text-slate-700 hover:text-slate-500">dismiss</button>
          </div>
          <div className="flex flex-col gap-1">
            {[
              'Enable the tools that match your problem �each one fixes a different type of audio damage.',
              'Adjust the sliders if needed (defaults are good starting points for most recordings).',
              'Hit Apply �it renders a new clean version. You\'ll hear the result immediately.',
              'You can apply multiple tools in one pass �they run in sequence: NR first, then De-Click, then De-Ess.',
            ].map((s, i) => (
              <p key={i} className="text-[9px] text-slate-500 flex gap-2">
                <span className="text-cyan-500 font-bold">{i + 1}.</span>{s}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ─�Noise Reduction ─�*/}
      <ToolCard
        enabled={cfg.noiseReduction.enabled}
        onToggle={v => updateNR({ enabled: v })}
        title="Noise Reduction"
        tagline="Removes constant background hiss, hum, air conditioning, or room noise"
        whenToUse="Home recordings with mic noise or room hiss. Fan noise, AC hum, laptop fan captured in the mic. The tool samples the first 0.5 seconds of your audio as a 'noise profile' �so make sure the first half-second has only noise, no music."
        color="cyan"
        icon="〰"
      >
        <Slider
          label="Strength"
          tip="How aggressively noise is removed. Higher = more noise removed but risks making the audio sound watery or metallic. Start at 0.7. If you hear warbling artifacts, lower it."
          value={cfg.noiseReduction.strength ?? 0.7}
          min={0.1} max={1} step={0.05}
          lowLabel="Gentle (less artifacts)" highLabel="Aggressive (more removal)"
          color="cyan"
          onChange={v => updateNR({ strength: v })}
        />
        <Slider
          label="Smoothing"
          tip="How many frequency 'frames' to average together. Higher smoothing = gentler transitions, less metallic artifacts. Lower = faster response but may leave noise bursts. 5 is a safe default."
          value={cfg.noiseReduction.smoothFrames ?? 5}
          min={1} max={20} step={1}
          unit=" frames"
          lowLabel="Fast (responsive)" highLabel="Smooth (artifact-free)"
          color="cyan"
          onChange={v => updateNR({ smoothFrames: v })}
        />
        <div className="rounded-lg bg-cyan-950/30 border border-cyan-500/10 p-2">
          <p className="text-[9px] text-slate-500">�<span className="text-cyan-400">Tip:</span> Record 1–2 seconds of silence before playing anything. The tool uses that silence to learn what 'noise' sounds like and remove it.</p>
        </div>
      </ToolCard>

      {/* ─�De-Clicker ─�*/}
      <ToolCard
        enabled={cfg.deClicker.enabled}
        onToggle={v => updateDC({ enabled: v })}
        title="De-Clicker"
        tagline="Removes clicks, pops, and crackles �common in vinyl rips and condenser mics"
        whenToUse="Vinyl record rips or tapes with crackle. Condenser microphone pops from plosives (P, B, T sounds). Electrical interference causing clicks. Mouth sounds between words. It detects sudden amplitude spikes and smoothly interpolates over them."
        color="amber"
        icon="✦"
      >
        <Slider
          label="Sensitivity"
          tip="How many times louder than surrounding audio a spike must be before it's treated as a click. Lower = catches more clicks (including quiet ones) but may smear legitimate transients like drums. Higher = only catches very obvious pops. Start at 3.5."
          value={cfg.deClicker.threshold ?? 3.5}
          min={1.5} max={8} step={0.1}
          lowLabel="Sensitive (catches more)" highLabel="Conservative (clicks only)"
          color="amber"
          onChange={v => updateDC({ threshold: v })}
        />
        <Slider
          label="Max Click Width"
          tip="The longest click that will be repaired, measured in audio samples. 64 samples �1.3ms at 48kHz. Small values fix thin clicks. Larger values fix broader pops. Don't go too high or it will smooth real transients."
          value={cfg.deClicker.maxWidth ?? 64}
          min={8} max={256} step={8}
          unit=" samples"
          lowLabel="Thin clicks only" highLabel="Broad pops too"
          color="amber"
          onChange={v => updateDC({ maxWidth: v })}
        />
        <div className="rounded-lg bg-amber-950/30 border border-amber-500/10 p-2">
          <p className="text-[9px] text-slate-500">�<span className="text-amber-400">Tip:</span> If the de-clicker is dulling your drum transients, raise the Sensitivity value �it will only catch obvious pops and leave the drums alone.</p>
        </div>
      </ToolCard>

      {/* ─�De-Esser ─�*/}
      <ToolCard
        enabled={cfg.deEsser.enabled}
        onToggle={v => updateDE({ enabled: v })}
        title="De-Esser"
        tagline="Tames harsh S, SH, and T sounds in vocals �the sibilance problem"
        whenToUse="Vocals that make listeners wince on headphones. Harsh 'S' and 'SH' sounds that are fatiguing to listen to. Budget condenser microphones that over-emphasize high frequencies. The de-esser only reduces sibilance when it gets too loud �it doesn't affect the rest of the frequency range."
        color="purple"
        icon="S"
      >
        <Slider
          label="Sibilance Frequency"
          tip="The center frequency where sibilance lives in your vocal. For most voices this is 6kHz–9kHz. Bright, high-pitched voices tend to have sibilance higher (8–10kHz). Lower/darker voices tend lower (5–7kHz). Adjust until it targets the harsh 'S' sounds."
          value={cfg.deEsser.frequency ?? 7500}
          min={3000} max={12000} step={250}
          unit=" Hz"
          lowLabel="Lower/darker vocals" highLabel="Higher/brighter vocals"
          color="purple"
          onChange={v => updateDE({ frequency: v })}
        />
        <Slider
          label="Focus (Q)"
          tip="How wide a frequency band is affected. Low Q (0.5–1.0) = broad reduction across a wide range. High Q (4–8) = surgical, only a narrow band. Start around Q 2 and adjust if you're hearing too much or too little effect."
          value={cfg.deEsser.q ?? 2}
          min={0.5} max={8} step={0.5}
          lowLabel="Wide (gentle)" highLabel="Narrow (surgical)"
          color="purple"
          onChange={v => updateDE({ q: v })}
        />
        <Slider
          label="Threshold"
          tip="The volume level at which de-essing kicks in. −28 dB means only sibilance louder than −28 dB gets reduced. Lower (more negative) = more de-essing. Higher (closer to 0) = only the loudest sibilants get touched. −24 to −30 dB is typical for vocals."
          value={cfg.deEsser.thresholdDb ?? -28}
          min={-50} max={-10} step={1}
          unit=" dB"
          lowLabel="Aggressive (more reduction)" highLabel="Light touch"
          color="purple"
          onChange={v => updateDE({ thresholdDb: v })}
        />
        <Slider
          label="Ratio"
          tip="How much the sibilance is reduced once it crosses the threshold. 4:1 means for every 4 dB over the threshold, only 1 dB comes through. Higher ratio = more reduction. 3–6:1 is transparent. 8–10:1 is heavy."
          value={cfg.deEsser.ratio ?? 4}
          min={1.5} max={10} step={0.5}
          lowLabel="Gentle (transparent)" highLabel="Heavy (noticeable)"
          color="purple"
          onChange={v => updateDE({ ratio: v })}
        />
        <div className="rounded-lg bg-purple-950/30 border border-purple-500/10 p-2">
          <p className="text-[9px] text-slate-500">�<span className="text-purple-400">Tip:</span> Play your audio, find the exact moment a harsh 'S' hits, then adjust the Frequency until the de-esser targets that specific sound. Then set Threshold so it only fires on the harshest ones.</p>
        </div>
      </ToolCard>

      {/* ─�Apply button ─�*/}
      {!noneEnabled && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 text-[9px] text-slate-500">
          <p className="mb-1 text-slate-400 font-semibold">What will happen</p>
          <div className="flex flex-col gap-0.5">
            {cfg.noiseReduction.enabled && <p>�Noise Reduction: samples first 0.5s as noise profile, removes throughout</p>}
            {cfg.deClicker.enabled && <p>�De-Clicker: scans for amplitude spikes &gt;{(cfg.deClicker.threshold ?? 3.5).toFixed(1)}�neighbors, smooths them</p>}
            {cfg.deEsser.enabled && <p>�De-Esser: reduces sibilance around {cfg.deEsser.frequency ?? 7500} Hz below {cfg.deEsser.thresholdDb ?? -28} dB threshold</p>}
          </div>
        </div>
      )}

      <motion.button
        onClick={handleProcess}
        disabled={!inputBuffer || isProcessing || noneEnabled}
        whileHover={!noneEnabled && inputBuffer && !isProcessing ? { scale: 1.01 } : {}}
        whileTap={{ scale: 0.98 }}
        className={`w-full py-3 rounded-xl font-bold text-[11px] uppercase tracking-wider border transition-all disabled:opacity-30 ${
          processed
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : isProcessing
            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
            : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25'
        }`}
      >
        {isProcessing ? 'Restoring �this may take a few seconds…'
          : processed ? '�Applied �enable tools and click again to re-process'
          : noneEnabled ? 'Enable at least one tool above'
          : 'Apply Restoration'}
      </motion.button>

      {!inputBuffer && (
        <p className="text-[9px] text-slate-700 text-center">Upload or record audio in Album Studio to enable restoration</p>
      )}
    </div>
  );
};
