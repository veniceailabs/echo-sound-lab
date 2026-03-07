import React, { useMemo } from 'react';
import { useI18n } from '../context/I18nContext';

export interface FriendlyWizardPanelProps {
  currentStep: 'upload' | 'analyze' | 'mix' | 'master' | 'video';
  progress: {
    analyzed: boolean;
    mixed: boolean;
    mastered: boolean;
    videoOpened: boolean;
  };
  canAnalyze: boolean;
  canMix: boolean;
  canMaster: boolean;
  canVideo: boolean;
  onStepClick: (step: 'upload' | 'analyze' | 'mix' | 'master' | 'video') => void;
  reasonAnalyzeDisabled?: string;
  reasonMixDisabled?: string;
  reasonMasterDisabled?: string;
  reasonVideoDisabled?: string;
}

const steps: Array<{
  id: 'upload' | 'analyze' | 'mix' | 'master' | 'video';
  label: string;
  description: string;
  icon: string;
}> = [
  { id: 'upload', label: 'Record or Upload', description: 'Add your audio', icon: '🎤' },
  { id: 'analyze', label: 'Analyze', description: 'Understand the sound', icon: '📊' },
  { id: 'mix', label: 'Mix', description: 'Balance and blend', icon: '🎚️' },
  { id: 'master', label: 'Master', description: 'Final polish', icon: '✨' },
  { id: 'video', label: 'Video', description: 'Create video', icon: '🎬' },
];

export const FriendlyWizardPanel: React.FC<FriendlyWizardPanelProps> = ({
  currentStep,
  progress,
  canAnalyze,
  canMix,
  canMaster,
  canVideo,
  onStepClick,
  reasonAnalyzeDisabled,
  reasonMixDisabled,
  reasonMasterDisabled,
  reasonVideoDisabled,
}) => {
  const { t } = useI18n();

  const stepStates = useMemo(() => ({
    upload: { enabled: true, completed: true, reason: null },
    analyze: { enabled: canAnalyze, completed: progress.analyzed, reason: reasonAnalyzeDisabled },
    mix: { enabled: canMix, completed: progress.mixed, reason: reasonMixDisabled },
    master: { enabled: canMaster, completed: progress.mastered, reason: reasonMasterDisabled },
    video: { enabled: canVideo, completed: progress.videoOpened, reason: reasonVideoDisabled },
  }), [canAnalyze, canMix, canMaster, canVideo, progress, reasonAnalyzeDisabled, reasonMixDisabled, reasonMasterDisabled, reasonVideoDisabled]);

  return (
    <div className="w-full bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
        <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 font-semibold">Guided Journey</p>
        <p className="mt-1 text-sm text-slate-300">Complete each step in order to create your masterpiece</p>
      </div>

      {/* Step Grid */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const state = stepStates[step.id];
          const isActive = currentStep === step.id;
          const isCompleted = state.completed;
          const isEnabled = state.enabled;

          return (
            <button
              key={step.id}
              onClick={() => isEnabled && onStepClick(step.id)}
              disabled={!isEnabled}
              title={!isEnabled && state.reason ? state.reason : `Go to ${step.label}`}
              className={`relative p-4 rounded-xl transition-all border text-center ${
                isActive
                  ? 'bg-emerald-500/20 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : isCompleted
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                    : isEnabled
                      ? 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                      : 'bg-white/3 border-white/5 opacity-50 cursor-not-allowed'
              }`}
            >
              {/* Completion Badge */}
              {isCompleted && (
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center text-xs font-bold text-white">
                  ✓
                </div>
              )}

              {/* Icon */}
              <div className="text-2xl mb-2">{step.icon}</div>

              {/* Label */}
              <p className="text-xs font-semibold text-slate-200 leading-tight">{step.label}</p>

              {/* Description */}
              <p className="text-[10px] text-slate-400 mt-1">{step.description}</p>

              {/* Disabled Reason Tooltip */}
              {!isEnabled && state.reason && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/95 text-xs text-slate-200 px-2 py-1 rounded-md border border-slate-700 z-20 pointer-events-none">
                  {state.reason}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <span>Progress:</span>
          <span className="font-mono font-bold">
            {[progress.analyzed, progress.mixed, progress.mastered, progress.videoOpened].filter(Boolean).length} / 4
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
            style={{
              width: `${([progress.analyzed, progress.mixed, progress.mastered, progress.videoOpened].filter(Boolean).length / 4) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
