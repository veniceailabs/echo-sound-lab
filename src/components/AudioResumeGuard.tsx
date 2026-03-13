import React from 'react';

type AudioContextRuntimeState = AudioContextState | 'interrupted' | string;

function isContextRunning(state: AudioContextRuntimeState) {
  return String(state) === 'running';
}

interface AudioResumeGuardProps {
  contextState: AudioContextRuntimeState;
  playIntent: boolean;
  isPlaying: boolean;
  onResume: () => Promise<void>;
  onCancel: () => void;
}

export const AudioResumeGuard: React.FC<AudioResumeGuardProps> = ({
  contextState,
  playIntent,
  isPlaying,
  onResume,
  onCancel,
}) => {
  const running = isContextRunning(contextState);
  const needsResume = playIntent && !isPlaying && !running;

  if (!needsResume) return null;

  return (
    <div className="absolute inset-0 z-[120] flex items-center justify-center rounded-xl bg-slate-950/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.10] to-white/[0.04] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] text-orange-300/90">
              Audio Permission
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-100">
              Tap to enable playback
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              iOS pauses audio until you resume it with a tap.
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="h-9 w-9 flex-shrink-0 rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-100 active:bg-white/10"
            aria-label="Cancel playback"
            title="Cancel"
          >
            <span className="block text-lg leading-none">×</span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // keep this a clean user gesture for iOS
              void onResume();
            }}
            className="flex-1 rounded-full border border-orange-400/25 bg-orange-400/15 px-4 py-2 text-sm font-semibold text-orange-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition-colors hover:bg-orange-400/20 active:bg-orange-400/25"
          >
            Enable Audio
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <div className="h-2 w-2 rounded-full bg-orange-300/80 animate-pulse" />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
          <p className="text-[11px] text-slate-400">
            State: <span className="font-mono text-slate-300">{String(contextState)}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

