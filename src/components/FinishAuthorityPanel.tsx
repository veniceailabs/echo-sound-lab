import React from 'react';
import { AnalysisResult } from '../types';

interface FinishAuthorityPanelProps {
  analysisResult: AnalysisResult;
}

const systemLabels: Record<'iphone' | 'car' | 'earbuds' | 'club', string> = {
  iphone: 'iPhone',
  car: 'Car',
  earbuds: 'Earbuds',
  club: 'Club',
};

const severityTone: Record<'low' | 'moderate' | 'high' | 'critical', string> = {
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  moderate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  critical: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const FinishAuthorityPanel: React.FC<FinishAuthorityPanelProps> = ({ analysisResult }) => {
  const narrative = analysisResult.sessionNarrativeAnalysis;
  const consequences = analysisResult.perceptualConsequenceAnalysis;

  if (!narrative && !consequences) {
    return null;
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-950/60 p-5 sm:p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Finish authority</p>
          <h3 className="mt-2 text-lg font-bold text-white">Listener Consequences</h3>
        </div>
        <p className="text-xs text-slate-400">
          Narrative and playback risk cues for the finishing stage.
        </p>
      </div>

      {narrative && (
        <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Narrative arc</span>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {narrative.overallArc.replace(/_/g, ' ')}
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              {narrative.analysisFingerprint.slice(0, 8)}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-200">{narrative.rationale}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Energy</div>
              <div className="mt-1 text-sm font-semibold text-white">{Math.round(narrative.continuity.energy * 100)}%</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Tone</div>
              <div className="mt-1 text-sm font-semibold text-white">{Math.round(narrative.continuity.tonal * 100)}%</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Pacing</div>
              <div className="mt-1 text-sm font-semibold text-white">{Math.round(narrative.continuity.pacing * 100)}%</div>
            </div>
          </div>
          {narrative.decisions.length > 0 && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {narrative.decisions.slice(0, 4).map((decision) => (
                <div key={`${decision.sectionName}-${decision.startTime}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{decision.sectionName}</div>
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {decision.action.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{decision.listenerConsequence}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {consequences && (
        <div className="mt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {consequences.targets.map((target) => (
              <div key={target.system} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{systemLabels[target.system]}</div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${severityTone[target.severity]}`}>
                    {target.riskType.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-200">{target.listenerImpact}</p>
                <p className="mt-2 text-xs text-slate-400">{target.recommendation}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-slate-700/60 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Summary</div>
            <p className="mt-2 text-sm text-slate-200">{consequences.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinishAuthorityPanel;
