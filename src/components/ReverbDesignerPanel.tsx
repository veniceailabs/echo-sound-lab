/**
 * ReverbDesignerPanel �Algorithmic reverb with presets and custom controls
 *
 * Lets users add reverb to their mix with real-time parameter control
 * and platform-optimized presets. Renders offline for lossless export.
 */
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  applyReverb,
  ReverbConfig,
  ReverbPreset,
  REVERB_PRESETS,
  PRESET_DESCRIPTIONS,
} from '../services/algorithmicReverb';
import { WaveformComparator } from './WaveformComparator';

interface ReverbDesignerPanelProps {
  buffer: AudioBuffer | null;
  onProcessed: (result: AudioBuffer) => void;
  onClose: () => void;
}

const PRESET_ICONS: Record<ReverbPreset, string> = {
  small_room: '🏠',
  medium_room: '🏢',
  large_room: '🏛',
  hall: '🎭',
  cathedral: '⛪',
  plate: '🔵',
  spring: '🌀',
  ambience: '☁️',
};

const PRESET_LABELS: Record<ReverbPreset, string> = {
  small_room: 'Small Room',
  medium_room: 'Medium Room',
  large_room: 'Large Room',
  hall: 'Concert Hall',
  cathedral: 'Cathedral',
  plate: 'Plate',
  spring: 'Spring',
  ambience: 'Ambience',
};

function Knob({
  label, value, min, max, step, onChange, unit = '', tip,
}: {
  label: string; value: number; min: number; max: number;
  step: number; onChange: (v: number) => void; unit?: string; tip?: string;
}) {
  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270;

  return (
    <div className="flex flex-col items-center gap-1.5 group relative">
      {/* SVG knob */}
      <div className="relative w-12 h-12 cursor-ns-resize select-none">
        <svg viewBox="0 0 48 48" className="absolute inset-0 w-full h-full">
          {/* Track arc */}
          <path
            d="M 9 38 A 20 20 0 1 1 39 38"
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d="M 9 38 A 20 20 0 1 1 39 38"
            fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${pct * 188} 188`}
            opacity={0.7}
          />
          {/* Pointer */}
          <line
            x1="24" y1="24"
            x2={24 + 14 * Math.sin(angle * Math.PI / 180)}
            y2={24 - 14 * Math.cos(angle * Math.PI / 180)}
            stroke="white" strokeWidth="2" strokeLinecap="round" opacity={0.9}
          />
        </svg>
        {/* Drag handler */}
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize"
          style={{ writingMode: 'horizontal-tb' }}
        />
      </div>
      <p className="text-[8px] text-slate-500 uppercase tracking-widest text-center leading-tight">{label}</p>
      <p className="text-[10px] font-mono text-slate-400">{value.toFixed(step < 1 ? 2 : 0)}{unit}</p>
      {tip && (
        <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 w-36 rounded-lg border border-white/10 bg-slate-900 p-2 text-[9px] text-slate-400 shadow-xl text-center">
          {tip}
        </div>
      )}
    </div>
  );
}

export const ReverbDesignerPanel: React.FC<ReverbDesignerPanelProps> = ({
  buffer, onProcessed, onClose,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<ReverbPreset>('plate');
  const [config, setConfig] = useState<ReverbConfig>({ ...REVERB_PRESETS.plate });
  const [processing, setProcessing] = useState(false);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);

  const patch = useCallback((key: keyof ReverbConfig, value: number | string) => {
    setConfig(c => ({ ...c, [key]: value }));
  }, []);

  const selectPreset = useCallback((preset: ReverbPreset) => {
    setSelectedPreset(preset);
    setConfig({ ...REVERB_PRESETS[preset] });
  }, []);

  const handleApply = useCallback(async () => {
    if (!buffer) return;
    setProcessing(true);
    try {
      const result = await applyReverb(buffer, config);
      setProcessedBuffer(result);
      onProcessed(result);
    } finally {
      setProcessing(false);
    }
  }, [buffer, config, onProcessed]);

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
        className="w-full max-w-2xl bg-slate-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-sm font-bold text-white">Reverb Designer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Schroeder/Moorer algorithmic reverb �8 presets, full parameter control
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.05] text-slate-500 hover:text-white hover:bg-white/10 transition-all text-xs">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {!buffer && (
            <p className="text-amber-400 text-sm text-center py-6">Load a track to add reverb</p>
          )}

          {buffer && (
            <>
              {/* Preset grid */}
              <div className="space-y-2">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest">Space preset</p>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(REVERB_PRESETS) as ReverbPreset[]).map(preset => (
                    <button
                      key={preset}
                      onClick={() => selectPreset(preset)}
                      className={`rounded-xl border p-2.5 text-center transition-all ${
                        selectedPreset === preset
                          ? 'border-cyan-500/40 bg-cyan-500/10'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                      }`}
                    >
                      <span className="text-lg block">{PRESET_ICONS[preset]}</span>
                      <p className={`text-[9px] font-semibold mt-1 leading-tight ${selectedPreset === preset ? 'text-cyan-300' : 'text-slate-500'}`}>
                        {PRESET_LABELS[preset]}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-600 leading-relaxed px-1">
                  {PRESET_DESCRIPTIONS[selectedPreset]}
                </p>
              </div>

              {/* Knobs */}
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-4">Parameters</p>
                <div className="flex items-start justify-around flex-wrap gap-4">
                  <Knob
                    label="Room Size" value={config.roomSize} min={0} max={1} step={0.01}
                    onChange={v => patch('roomSize', v)}
                    tip="How large the simulated space is. Larger = longer decay tail."
                  />
                  <Knob
                    label="Damping" value={config.damping} min={0} max={1} step={0.01}
                    onChange={v => patch('damping', v)}
                    tip="High-frequency absorption. High damping = warmer, darker reverb (like a room with carpet)."
                  />
                  <Knob
                    label="Wet" value={config.wetLevel} min={0} max={1} step={0.01}
                    onChange={v => patch('wetLevel', v)}
                    tip="Amount of reverb signal in the mix. 0 = dry, 1 = all reverb."
                  />
                  <Knob
                    label="Dry" value={config.dryLevel} min={0} max={1} step={0.01}
                    onChange={v => patch('dryLevel', v)}
                    tip="Amount of original dry signal kept. Usually keep this at 0.7–1.0."
                  />
                  <Knob
                    label="Pre-Delay" value={config.preDelayMs} min={0} max={100} step={1}
                    onChange={v => patch('preDelayMs', v)} unit="ms"
                    tip="Delay before reverb starts. Higher values separate the dry signal from the reverb, adding depth and clarity."
                  />
                  <Knob
                    label="Diffusion" value={config.diffusion} min={0} max={1} step={0.01}
                    onChange={v => patch('diffusion', v)}
                    tip="How scattered the reflections are. High diffusion = smooth, dense reverb. Low = distinct echoes."
                  />
                  <Knob
                    label="Width" value={config.stereoWidth} min={0} max={1} step={0.01}
                    onChange={v => patch('stereoWidth', v)}
                    tip="Stereo spread of the reverb tail. 0 = mono reverb, 1 = maximum stereo spread."
                  />
                </div>
              </div>

              {/* Before/After */}
              {processedBuffer && (
                <WaveformComparator
                  originalBuffer={buffer}
                  processedBuffer={processedBuffer}
                  label="Before / After reverb"
                />
              )}

              {/* Apply button */}
              <motion.button
                onClick={handleApply}
                disabled={processing}
                whileHover={!processing ? { scale: 1.01 } : {}}
                whileTap={!processing ? { scale: 0.98 } : {}}
                className={`w-full py-4 rounded-xl font-bold text-[13px] uppercase tracking-widest border transition-all disabled:opacity-40 ${
                  processing
                    ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                    : processedBuffer
                    ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 text-emerald-300 hover:from-emerald-500/30 hover:to-cyan-500/30'
                    : 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-500/30 text-cyan-300 hover:from-cyan-500/30 hover:to-purple-500/30'
                }`}
              >
                {processing ? '�Rendering reverb…' : processedBuffer ? '�Re-apply with new settings' : `�Apply ${PRESET_LABELS[selectedPreset]}`}
              </motion.button>

              <p className="text-[9px] text-slate-700 text-center">
                Rendered offline �full quality, no real-time CPU cost
              </p>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
