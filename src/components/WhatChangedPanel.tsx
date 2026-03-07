import React, { useState } from 'react';
import { AudioMetrics } from '../types';
import { useI18n } from '../context/I18nContext';

interface WhatChangedPanelProps {
  before: AudioMetrics | null;
  after: AudioMetrics | null;
  isVisible: boolean;
  onDismiss: () => void;
  onToggleAB?: () => void;
}

const formatNumber = (value: number | undefined): string => {
  if (value === undefined) return '—';
  return value.toFixed(1);
};

const describeLufsChange = (before: number | undefined, after: number | undefined): string => {
  if (!before || !after) return 'Unable to measure change';
  const change = after - before;
  if (Math.abs(change) < 0.1) return 'Loudness unchanged';
  if (change > 0) return `Louder by ${formatNumber(Math.abs(change))} LUFS`;
  return `Quieter by ${formatNumber(Math.abs(change))} LUFS`;
};

const describePeakChange = (before: number | undefined, after: number | undefined): string => {
  if (!before || !after) return 'Unable to measure change';
  const change = after - before;
  if (Math.abs(change) < 0.1) return 'Peak unchanged';
  if (change > 0) return `Higher peak by ${formatNumber(Math.abs(change))} dBTP`;
  return `Lower peak by ${formatNumber(Math.abs(change))} dBTP`;
};

const describeDynamicsChange = (before: number | undefined, after: number | undefined): string => {
  if (!before || !after) return 'Unable to measure change';
  const change = after - before;
  if (Math.abs(change) < 0.1) return 'Dynamics unchanged';
  if (change > 0) return `More dynamic range (${formatNumber(Math.abs(change))} LU)`;
  return `More compressed (less dynamic, ${formatNumber(Math.abs(change))} LU reduction)`;
};

export const WhatChangedPanel: React.FC<WhatChangedPanelProps> = ({
  before,
  after,
  isVisible,
  onDismiss,
  onToggleAB,
}) => {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  if (!isVisible || !before || !after) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">What Changed</h2>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {/* Plain Language Summary */}
          <div className="space-y-3">
            <p className="text-sm text-slate-300 font-medium">Here's what we changed:</p>

            <div className="space-y-2 text-sm text-slate-200">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>{describeLufsChange(before.lufs?.integrated, after.lufs?.integrated)}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-amber-400 font-bold mt-0.5">•</span>
                <span>{describePeakChange(before.lufs?.truePeak, after.lufs?.truePeak)}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold mt-0.5">•</span>
                <span>{describeDynamicsChange(before.lufs?.loudnessRange, after.lufs?.loudnessRange)}</span>
              </div>
            </div>
          </div>

          {/* Technical Details (Optional) */}
          {showDetails && (
            <div className="mt-6 pt-4 border-t border-white/5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Technical Details</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-slate-500 font-medium mb-1">Loudness (LUFS)</p>
                  <p className="text-slate-200 font-mono">Before: {formatNumber(before.lufs?.integrated)}</p>
                  <p className="text-slate-200 font-mono">After: {formatNumber(after.lufs?.integrated)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-slate-500 font-medium mb-1">Peak (dBTP)</p>
                  <p className="text-slate-200 font-mono">Before: {formatNumber(before.lufs?.truePeak)}</p>
                  <p className="text-slate-200 font-mono">After: {formatNumber(after.lufs?.truePeak)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-slate-500 font-medium mb-1">Range (LU)</p>
                  <p className="text-slate-200 font-mono">Before: {formatNumber(before.lufs?.loudnessRange)}</p>
                  <p className="text-slate-200 font-mono">After: {formatNumber(after.lufs?.loudnessRange)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Toggle Details Button */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-slate-400 hover:text-slate-300 transition-colors underline"
          >
            {showDetails ? 'Hide technical details' : 'Show technical details'}
          </button>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex gap-2 justify-end">
          {onToggleAB && (
            <button
              onClick={onToggleAB}
              className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
            >
              Compare Audio
            </button>
          )}
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
