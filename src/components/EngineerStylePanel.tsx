/**
 * EngineerStylePanel
 *
 * Displays 4 engineer profile cards. When user selects one and has an audio
 * buffer loaded, runs StyleMatchingEngine.matchToProfile() and surfaces the
 * resulting APLStyleProposal for the parent to apply.
 */

import React, { useState, useCallback } from 'react';
import { ENGINEER_PROFILES, styleMatchingEngine, APLStyleProposal } from '../services/engineerStyleEngine';
import type { ProcessingConfig } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface EngineerStylePanelProps {
  /** The currently loaded (possibly processed) audio buffer */
  audioBuffer: AudioBuffer | null;
  /** Called when user clicks "Apply" with the resulting ProcessingConfig */
  onApplyStyle: (config: ProcessingConfig, engineerName: string) => void;
  /** Whether global processing is in progress */
  isProcessing?: boolean;
}

// ─── Static metadata for display ─────────────────────────────────────────────

const PROFILE_DISPLAY: Record<string, { genre: string; clients: string; color: string; accentBg: string }> = {
  mixedbyali: {
    genre: 'Hip-Hop / R&B',
    clients: 'Kendrick Lamar, SZA, Travis Scott',
    color: 'from-violet-500 to-purple-600',
    accentBg: 'bg-violet-500/10 border-violet-500/30',
  },
  '40': {
    genre: 'Atmospheric R&B',
    clients: 'Drake, PARTYNEXTDOOR, dvsn',
    color: 'from-slate-500 to-slate-700',
    accentBg: 'bg-slate-500/10 border-slate-500/30',
  },
  rianlewis: {
    genre: 'Pop / Singer-Songwriter',
    clients: 'Ed Sheeran, Sam Smith, Lewis Capaldi',
    color: 'from-sky-400 to-blue-500',
    accentBg: 'bg-sky-400/10 border-sky-400/30',
  },
  mannymarroquin: {
    genre: 'Rock / Pop',
    clients: 'Kanye West, Rihanna, Maroon 5',
    color: 'from-orange-500 to-red-500',
    accentBg: 'bg-orange-500/10 border-orange-500/30',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

const EngineerStylePanel: React.FC<EngineerStylePanelProps> = ({
  audioBuffer,
  onApplyStyle,
  isProcessing = false,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [proposal, setProposal] = useState<APLStyleProposal | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const profileIds = Object.keys(ENGINEER_PROFILES);

  const handleSelectProfile = useCallback(async (id: string) => {
    setSelectedId(id);
    setProposal(null);
    setErrorMsg(null);

    if (!audioBuffer) {
      // Profile selected but no audio yet — just highlight
      return;
    }

    setStatus('loading');
    try {
      const result = await styleMatchingEngine.matchToProfile(audioBuffer, id);
      setProposal(result);
      setStatus('ready');
    } catch (err: any) {
      console.error('[EngineerStylePanel] matchToProfile error:', err);
      setErrorMsg(err.message ?? 'Style matching failed.');
      setStatus('error');
    }
  }, [audioBuffer]);

  const handleApply = useCallback(() => {
    if (!proposal) return;
    onApplyStyle(proposal.processingConfig, proposal.engineerName);
  }, [proposal, onApplyStyle]);

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 sm:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Engineer Style Match</p>
          <h3 className="mt-1 text-base font-bold text-white">Match a world-class mix aesthetic</h3>
        </div>
        {!audioBuffer && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Load audio first
          </span>
        )}
      </div>

      {/* Profile cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {profileIds.map((id) => {
          const profile = ENGINEER_PROFILES[id];
          const display = PROFILE_DISPLAY[id];
          const isSelected = selectedId === id;

          return (
            <button
              key={id}
              onClick={() => void handleSelectProfile(id)}
              disabled={isProcessing || status === 'loading'}
              className={[
                'relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200',
                'hover:scale-[1.01] hover:shadow-lg',
                isSelected
                  ? `${display.accentBg} shadow-md`
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
                'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100',
              ].join(' ')}
            >
              {/* Accent gradient stripe */}
              <div className={`absolute left-0 top-0 h-full w-1 rounded-l-xl bg-gradient-to-b ${display.color}`} />

              <div className="pl-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-white">{profile.name}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{display.genre}</p>
                  </div>
                  {isSelected && (
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r ${display.color} text-white`}>
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-slate-400">
                  {display.clients}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Status / Result */}
      {selectedId && (
        <div className="mt-4">
          {status === 'loading' && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
              <span className="text-xs text-slate-300">
                Analyzing mix against {ENGINEER_PROFILES[selectedId].name}&apos;s signature…
              </span>
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-300">Style match failed</p>
              <p className="mt-1 text-[10px] text-red-400">{errorMsg}</p>
            </div>
          )}

          {status === 'ready' && proposal && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-400">
                    Style proposal ready
                  </p>
                  <p className="mt-1 text-xs font-semibold text-white">{proposal.engineerName}</p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                  {Math.round(proposal.confidence * 100)}% match
                </span>
              </div>

              {/* Gemini rationale */}
              <p className="text-[11px] leading-relaxed text-slate-300 italic">
                &ldquo;{proposal.geminiRationale}&rdquo;
              </p>

              {/* Gap summary chips */}
              <div className="flex flex-wrap gap-2">
                {Math.abs(proposal.styleGap.lufsGap) > 0.5 && (
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] text-slate-300">
                    LUFS {proposal.styleGap.lufsGap > 0 ? '+' : ''}{proposal.styleGap.lufsGap.toFixed(1)} dB
                  </span>
                )}
                {Math.abs(proposal.styleGap.widthGap) > 0.04 && (
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] text-slate-300">
                    Width {proposal.styleGap.widthGap > 0 ? '+' : ''}{(proposal.styleGap.widthGap * 100).toFixed(0)}%
                  </span>
                )}
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] text-slate-300">
                  {proposal.styleGap.saturationTarget.character} saturation
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] text-slate-300">
                  {proposal.styleGap.reverbTarget.decay}s reverb
                </span>
              </div>

              {/* Apply button */}
              <button
                onClick={handleApply}
                disabled={isProcessing}
                className="mt-1 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-xs font-bold text-black transition-all hover:from-orange-400 hover:to-orange-500 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                Apply {proposal.engineerName} Style
              </button>
            </div>
          )}

          {status === 'idle' && audioBuffer && selectedId && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-slate-400" />
              <span className="text-xs text-slate-400">Select a profile above to begin analysis.</span>
            </div>
          )}
        </div>
      )}

      {/* No audio nudge */}
      {!audioBuffer && (
        <p className="mt-4 text-center text-[10px] text-slate-500">
          Upload a mix above to enable engineer style matching.
        </p>
      )}
    </div>
  );
};

export default EngineerStylePanel;
