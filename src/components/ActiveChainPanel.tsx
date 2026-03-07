import React, { useMemo } from 'react';
import { ProcessingAction } from '../types';
import { useI18n } from '../context/I18nContext';

interface ActiveChainPanelProps {
  actions: ProcessingAction[];
  isVisible: boolean;
  onClear?: () => void;
}

const getActionLabel = (action: ProcessingAction): string => {
  const type = action.type.toLowerCase();
  if (type.includes('eq')) return `EQ: ${action.intensity ?? 50}%`;
  if (type.includes('compress')) return `Compression: ${action.intensity ?? 50}%`;
  if (type.includes('limit')) return `Limiter: ${action.intensity ?? 50}%`;
  if (type.includes('gate')) return `Gate: ${action.intensity ?? 50}%`;
  if (type.includes('expand')) return `Expander: ${action.intensity ?? 50}%`;
  if (type.includes('reverb')) return `Reverb: ${action.intensity ?? 50}%`;
  if (type.includes('delay')) return `Delay: ${action.intensity ?? 50}%`;
  if (type.includes('distort')) return `Distortion: ${action.intensity ?? 50}%`;
  if (type.includes('normalize')) return 'Loudness Normalize';
  if (type.includes('peak')) return 'Peak Limiting';
  if (type.includes('dynamics')) return 'Dynamics Processing';
  return type;
};

const getActionColor = (action: ProcessingAction): string => {
  const type = action.type.toLowerCase();
  if (type.includes('eq')) return 'from-blue-500/20 to-cyan-500/20 border-blue-500/30';
  if (type.includes('compress')) return 'from-amber-500/20 to-orange-500/20 border-amber-500/30';
  if (type.includes('limit')) return 'from-red-500/20 to-pink-500/20 border-red-500/30';
  if (type.includes('normalize')) return 'from-green-500/20 to-emerald-500/20 border-green-500/30';
  if (type.includes('reverb') || type.includes('delay')) return 'from-purple-500/20 to-pink-500/20 border-purple-500/30';
  return 'from-slate-500/20 to-slate-500/20 border-slate-500/30';
};

const getActionIcon = (action: ProcessingAction): string => {
  const type = action.type.toLowerCase();
  if (type.includes('eq')) return '🎛️';
  if (type.includes('compress')) return '📉';
  if (type.includes('limit')) return '🛑';
  if (type.includes('normalize')) return '📊';
  if (type.includes('reverb') || type.includes('delay')) return '🌊';
  if (type.includes('gate') || type.includes('expand')) return '🔊';
  return '⚙️';
};

export const ActiveChainPanel: React.FC<ActiveChainPanelProps> = ({
  actions,
  isVisible,
  onClear,
}) => {
  const { t } = useI18n();

  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => {
      const priority: Record<string, number> = {
        'eq': 1,
        'normalize': 2,
        'compress': 3,
        'limit': 4,
        'gate': 5,
        'expand': 5,
        'reverb': 6,
        'delay': 6,
        'distort': 7,
      };
      const aPriority = priority[a.type.toLowerCase()] ?? 8;
      const bPriority = priority[b.type.toLowerCase()] ?? 8;
      return aPriority - bPriority;
    });
  }, [actions]);

  if (!isVisible || sortedActions.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-gradient-to-br from-white/[0.05] to-white/[0.02] backdrop-blur-xl rounded-xl border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.2)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Active Chain</span>
          <span className="text-xs font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded">
            {sortedActions.length} processor{sortedActions.length !== 1 ? 's' : ''}
          </span>
        </div>
        {onClear && sortedActions.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline"
            title="Remove all processors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Chain */}
      <div className="p-3 space-y-2">
        {sortedActions.map((action, idx) => (
          <div key={`${action.id}-${idx}`} className="flex items-center gap-2">
            {/* Icon */}
            <span className="text-lg shrink-0">{getActionIcon(action)}</span>

            {/* Processor Chip */}
            <div
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r ${getActionColor(
                action
              )} border transition-all hover:shadow-[0_0_12px_rgba(255,255,255,0.1)]`}
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-100">{getActionLabel(action)}</span>
                {action.isSelected && (
                  <span className="text-emerald-400 text-[10px] font-bold">✓ Active</span>
                )}
              </div>
              {action.description && (
                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{action.description}</p>
              )}
            </div>

            {/* Arrow to next (except last) */}
            {idx < sortedActions.length - 1 && (
              <span className="text-slate-600 text-xs">→</span>
            )}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-white/5 bg-white/[0.01]">
        <p className="text-[10px] text-slate-500">
          Processing chain applied to current output. Each processor modifies the sound from left to right.
        </p>
      </div>
    </div>
  );
};
