/**
 * MasteringChainDiagram â€Animated signal flow for the mastering chain
 *
 * Shows the full processing chain as a horizontal signal-flow diagram
 * with animated signal bars, plain-English descriptions, and real-time
 * stage activity indicators.
 *
 * Used inside PowerEnginePanel to show users what's happening to their audio.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChainStage {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: string;
  bgColor: string;
  icon: string;
  active: boolean;
  gain?: number;  // dB of gain applied (positive = boost, negative = cut)
}

interface MasteringChainDiagramProps {
  stages?: Partial<ChainStage>[];
  isProcessing?: boolean;
}

const DEFAULT_STAGES: ChainStage[] = [
  {
    id: 'input',
    name: 'Input',
    shortName: 'IN',
    description: 'Raw mix from your session â€unprocessed audio entering the chain',
    color: '#6b7280',
    bgColor: 'rgba(107,114,128,0.1)',
    icon: 'â–¶',
    active: true,
  },
  {
    id: 'eq',
    name: 'Linear-Phase EQ',
    shortName: 'EQ',
    description: 'Zero-phase-shift EQ â€boosts or cuts frequencies without smearing transients',
    color: '#22d3ee',
    bgColor: 'rgba(34,211,238,0.1)',
    icon: 'â‰‹',
    active: true,
    gain: 0,
  },
  {
    id: 'multiband',
    name: '5-Band Multiband',
    shortName: 'MB',
    description: 'Splits audio into 5 bands and compresses each independently â€controls sub, bass, mids, highs separately',
    color: '#a855f7',
    bgColor: 'rgba(168,85,247,0.1)',
    icon: 'â‰¡',
    active: true,
    gain: -2,
  },
  {
    id: 'transient',
    name: 'Transient Shaper',
    shortName: 'TR',
    description: 'Controls attack (snap of drums, picks) and sustain (decay and room) independently',
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.1)',
    icon: 'âš¡',
    active: true,
    gain: 0,
  },
  {
    id: 'saturation',
    name: 'Analog Warmth',
    shortName: 'SAT',
    description: 'Adds harmonic distortion that mimics tape and tube gear â€makes digital audio feel warmer and more alive',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,0.1)',
    icon: 'â—‰',
    active: true,
    gain: 1,
  },
  {
    id: 'limiter',
    name: 'Transparent Limiter',
    shortName: 'LIM',
    description: 'Final brick-wall ceiling â€catches any peaks above the target loudness without squashing the mix',
    color: '#10b981',
    bgColor: 'rgba(16,185,129,0.1)',
    icon: 'â–Œ',
    active: true,
    gain: -3,
  },
  {
    id: 'output',
    name: 'Output',
    shortName: 'OUT',
    description: 'Final mastered audio â€stream-ready, loudness-normalized, true-peak limited',
    color: '#22d3ee',
    bgColor: 'rgba(34,211,238,0.15)',
    icon: 'â–¶â–¶',
    active: true,
  },
];

// Animated signal level bar
function SignalBar({ color, active, processing }: { color: string; active: boolean; processing: boolean }) {
  const [level, setLevel] = useState(0.6);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!processing) {
      setLevel(0.6);
      return;
    }
    const animate = () => {
      setLevel(0.3 + Math.random() * 0.65);
      rafRef.current = requestAnimationFrame(animate) as unknown as number;
    };
    const timeout = setTimeout(() => {
      rafRef.current = requestAnimationFrame(animate) as unknown as number;
    }, Math.random() * 200);
    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [processing]);

  if (!active) return null;

  return (
    <div className="flex items-end gap-px justify-center" style={{ height: 20 }}>
      {[0.4, 0.7, 1.0, 0.7, 0.4].map((scale, i) => (
        <motion.div
          key={i}
          className="w-0.5 rounded-t"
          style={{
            background: color,
            height: `${Math.max(2, level * scale * 20)}px`,
            opacity: 0.7,
          }}
          animate={{ height: `${Math.max(2, level * scale * 20)}px` }}
          transition={{ duration: 0.08, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

// Arrow connector between stages
function Arrow({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center w-6 shrink-0">
      <div
        className="h-px flex-1"
        style={{ background: `linear-gradient(to right, ${color}60, ${color}20)` }}
      />
      <div
        className="border-t-4 border-b-4 border-l-4 border-transparent"
        style={{ borderLeftColor: `${color}40`, width: 0, height: 0 }}
      />
    </div>
  );
}

export const MasteringChainDiagram: React.FC<MasteringChainDiagramProps> = ({
  stages: stagePatch,
  isProcessing = false,
}) => {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  const stages: ChainStage[] = DEFAULT_STAGES.map(s => ({
    ...s,
    ...(stagePatch?.find(p => p.id === s.id) ?? {}),
  }));

  const selected = stages.find(s => s.id === selectedStage);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] text-slate-600 uppercase tracking-widest">Signal flow</p>
        {isProcessing && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="text-[9px] text-cyan-400"
          >
            â—Processing
          </motion.span>
        )}
      </div>

      {/* Chain diagram */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-stretch gap-0 min-w-max">
          {stages.map((stage, i) => (
            <React.Fragment key={stage.id}>
              {/* Stage block */}
              <motion.button
                onClick={() => setSelectedStage(selectedStage === stage.id ? null : stage.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                  selectedStage === stage.id
                    ? 'border-opacity-60 shadow-lg'
                    : 'border-opacity-20'
                }`}
                style={{
                  borderColor: stage.color,
                  background: selectedStage === stage.id ? stage.bgColor : 'rgba(255,255,255,0.02)',
                  minWidth: 64,
                }}
              >
                {/* Icon */}
                <span className="text-base leading-none" style={{ color: stage.color }}>
                  {stage.icon}
                </span>

                {/* Signal bars */}
                <SignalBar color={stage.color} active={stage.active} processing={isProcessing} />

                {/* Label */}
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: stage.color }}>
                  {stage.shortName}
                </p>

                {/* Gain indicator */}
                {stage.gain !== undefined && stage.gain !== 0 && (
                  <p className="text-[7px] font-mono" style={{ color: stage.gain > 0 ? '#10b981' : '#f87171' }}>
                    {stage.gain > 0 ? '+' : ''}{stage.gain}dB
                  </p>
                )}
              </motion.button>

              {/* Arrow */}
              {i < stages.length - 1 && (
                <Arrow color={stages[i + 1].color} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Description panel for selected stage */}
      <AnimatePresenceWrapper>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-xl border p-3 space-y-1"
            style={{ borderColor: `${selected.color}30`, background: selected.bgColor }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: selected.color }}>{selected.icon}</span>
              <p className="text-[11px] font-bold text-white">{selected.name}</p>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: `${selected.color}cc` }}>
              {selected.description}
            </p>
            {selected.gain !== undefined && selected.gain !== 0 && (
              <p className="text-[9px]" style={{ color: selected.gain > 0 ? '#10b981' : '#f87171' }}>
                Applied gain: {selected.gain > 0 ? '+' : ''}{selected.gain} dB
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresenceWrapper>

      {!selectedStage && (
        <p className="text-[9px] text-slate-700">Tap any stage to see what it does</p>
      )}
    </div>
  );
};

function AnimatePresenceWrapper({ children }: { children: React.ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}
