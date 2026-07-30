import React from 'react';
import type { ReferenceWorldAnalysis } from '../services/finishing/referenceWorldEngine';

interface ReferenceWorldPanelProps {
  analysis?: ReferenceWorldAnalysis | null;
}

const tone: Record<'good' | 'warn' | 'info', string> = {
  good: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  info: 'bg-slate-700/60 text-slate-200 border-slate-700/60',
};

const ReferenceWorldPanel: React.FC<ReferenceWorldPanelProps> = ({ analysis }) => {
  if (!analysis) return null;

  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-950/60 p-5 sm:p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Benchmark worlds</p>
          <h3 className="mt-2 text-lg font-bold text-white">Reference world match</h3>
        </div>
        <p className="text-xs text-slate-400">Target-world scoring for lane-specific finish decisions.</p>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            {analysis.bestProfile.label}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
            {analysis.analysisFingerprint.slice(0, 8)}
          </span>
          <span className="text-sm font-semibold text-white">{analysis.profileScores[0]?.score ?? 0}/100</span>
        </div>
        <p className="mt-3 text-sm text-slate-200">{analysis.summary}</p>
        <p className="mt-2 text-xs text-slate-400">{analysis.rationale}</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {analysis.profileScores.map((score) => (
          <div key={score.profileId} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{score.label}</div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${score.score >= 88 ? tone.good : score.score >= 78 ? tone.warn : tone.info}`}>
                {score.score}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{score.summary}</p>
            <p className="mt-2 text-xs text-slate-500">{score.recommendation}</p>
          </div>
        ))}
      </div>

      {analysis.bestProfile.studioNotes.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Studio notes</div>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {analysis.bestProfile.studioNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ReferenceWorldPanel;

