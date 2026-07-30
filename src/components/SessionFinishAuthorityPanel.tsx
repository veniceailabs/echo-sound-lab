import React from 'react';
import type { AlbumAuthorityAnalysis } from '../services/finishing/albumAuthorityEngine';
import type { ReferenceDeltaAnalysis } from '../services/finishing/referenceDeltaEngine';
import type { SessionFinishAuthorityAnalysis } from '../services/finishing/sessionFinishAuthority';

interface SessionFinishAuthorityPanelProps {
  albumAuthority?: AlbumAuthorityAnalysis | null;
  referenceDelta?: ReferenceDeltaAnalysis | null;
  sessionFinish?: SessionFinishAuthorityAnalysis | null;
}

const toneClass: Record<'low' | 'moderate' | 'high' | 'critical', string> = {
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  moderate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const SessionFinishAuthorityPanel: React.FC<SessionFinishAuthorityPanelProps> = ({
  albumAuthority,
  referenceDelta,
  sessionFinish,
}) => {
  if (!albumAuthority && !referenceDelta && !sessionFinish) return null;

  return (
    <div className="mt-5 rounded-2xl border border-slate-700/60 bg-slate-950/55 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Project center</p>
          <h3 className="mt-2 text-lg font-bold text-white">Album and reference authority</h3>
        </div>
        <p className="text-xs text-slate-400">Release-line signals for album consistency, reference delta, and session finish.</p>
      </div>

      {sessionFinish && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">Session finish authority</div>
            <span className="rounded-full border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              {sessionFinish.verdict.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-200">{sessionFinish.summary}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Authority</div>
              <div className="mt-1 text-sm font-semibold text-white">{sessionFinish.authorityScore}%</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Priorities</div>
              <div className="mt-1 text-sm font-semibold text-white">{sessionFinish.priorities.length}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-900/70 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Warnings</div>
              <div className="mt-1 text-sm font-semibold text-white">{sessionFinish.warnings.length}</div>
            </div>
          </div>
          {sessionFinish.recommendations.length > 0 && (
            <p className="mt-3 text-xs text-slate-400">{sessionFinish.recommendations[0]}</p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {albumAuthority && (
          <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">Album finisher</div>
              <span className="rounded-full border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                {albumAuthority.verdict.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-200">{albumAuthority.trackCount} tracks in the current album DNA profile.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-slate-500 uppercase tracking-[0.2em]">Consistency</div>
                <div className="mt-1 text-white font-semibold">{albumAuthority.consistencyScore}%</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-slate-500 uppercase tracking-[0.2em]">Vibe Match</div>
                <div className="mt-1 text-white font-semibold">{albumAuthority.currentTrackVibeMatch ?? '--'}{typeof albumAuthority.currentTrackVibeMatch === 'number' ? '%' : ''}</div>
              </div>
            </div>
            {albumAuthority.recommendations.length > 0 && <p className="mt-3 text-xs text-slate-400">{albumAuthority.recommendations[0]}</p>}
          </div>
        )}

        {referenceDelta && (
          <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">Reference delta</div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${toneClass[referenceDelta.loudness.severity]}`}>
                {referenceDelta.matchScore}%
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-200">{referenceDelta.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-slate-500 uppercase tracking-[0.2em]">Loudness Δ</div>
                <div className="mt-1 text-white font-semibold">{referenceDelta.loudness.delta.toFixed(1)} LUFS</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="text-slate-500 uppercase tracking-[0.2em]">Crest Δ</div>
                <div className="mt-1 text-white font-semibold">{referenceDelta.dynamics.delta.toFixed(1)} dB</div>
              </div>
            </div>
            {referenceDelta.recommendations.length > 0 && <p className="mt-3 text-xs text-slate-400">{referenceDelta.recommendations[0]}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionFinishAuthorityPanel;
