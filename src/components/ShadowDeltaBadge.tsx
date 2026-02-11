import React from 'react';

interface ShadowDeltaBadgeProps {
  delta?: number;
  confidence?: number;
  quantumScore?: number;
  humanIntentIndex?: number;
  intentCoreActive?: boolean;
}

const normalizeConfidence = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
};

const ShadowDeltaBadge: React.FC<ShadowDeltaBadgeProps> = ({
  delta,
  confidence,
  quantumScore,
  humanIntentIndex,
  intentCoreActive,
}) => {
  if (!Number.isFinite(delta) || !Number.isFinite(confidence) || !Number.isFinite(quantumScore)) return null;
  const normalizedConfidence = normalizeConfidence(confidence);
  const rounded = Math.round(delta * 10) / 10;
  const isActive = intentCoreActive ?? normalizedConfidence > 0.805;
  if (!isActive && rounded > 0) {
    return (
      <div
        className="bg-slate-800 text-slate-400 px-2 py-1 rounded text-[10px] border border-slate-700 font-bold uppercase tracking-wide cursor-help"
        title="AI Boost detected, but confidence is still warming up. Match Score stays on the classical baseline."
      >
        AI Boost (Inert) +{rounded.toFixed(1)}
      </div>
    );
  }

  const styles = isActive
    ? rounded >= 3
      ? { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: `Magic Added +${rounded}` }
      : rounded <= -1
        ? { bg: 'bg-amber-500/20', text: 'text-amber-400', label: `Magic Added ${rounded}` }
        : { bg: 'bg-slate-500/20', text: 'text-slate-300', label: `Magic Added ±${Math.abs(rounded)}` }
    : { bg: 'bg-slate-700/40', text: 'text-slate-300', label: 'AI Boost Paused' };

  return (
    <div
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles.bg} ${styles.text} border border-current/20 cursor-help`}
      title={`AI Boost telemetry. Match Score=${Number.isFinite(humanIntentIndex) ? Math.round(humanIntentIndex as number) : 'N/A'}. AI Boost (Q-C)=${rounded >= 0 ? '+' : ''}${rounded}. AI Confidence=${normalizedConfidence.toFixed(2)}.`}
    >
      {styles.label}
    </div>
  );
};

export default ShadowDeltaBadge;
