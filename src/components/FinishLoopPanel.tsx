import React from 'react';
import type { FinishLoopAnalysis } from '../services/finishing/finishLoopEngine';

interface FinishLoopPanelProps {
  finishLoop?: FinishLoopAnalysis | null;
}

const verdictTone: Record<'PASS' | 'BORDERLINE' | 'FAIL', string> = {
  PASS: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  BORDERLINE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  FAIL: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const deviceLabels: Record<'mono' | 'phone' | 'car' | 'airpods', string> = {
  mono: 'Mono',
  phone: 'Phone',
  car: 'Car',
  airpods: 'AirPods',
};

const FinishLoopPanel: React.FC<FinishLoopPanelProps> = ({ finishLoop }) => {
  if (!finishLoop) return null;

  const translation = finishLoop.translationAuthority;

  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-950/60 p-5 sm:p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Finish loop</p>
          <h3 className="mt-2 text-lg font-bold text-white">Hard Finish Score</h3>
        </div>
        <p className="text-xs text-slate-400">Analyze → apply → recheck → compare → lock.</p>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${verdictTone[finishLoop.verdict]}`}>
            {finishLoop.verdict}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
            {finishLoop.analysisFingerprint.slice(0, 8)}
          </span>
          <span className="text-sm font-semibold text-white">{finishLoop.finishScore.toFixed(1)} / 10</span>
        </div>
        <p className="mt-3 text-sm text-slate-200">{finishLoop.summary}</p>
        <p className="mt-2 text-xs text-slate-400">{finishLoop.rationale}</p>
        <p className="mt-2 text-xs text-slate-500">{finishLoop.translationAuthority.hardStop}</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Iterations</div>
          <div className="mt-1 text-sm font-semibold text-white">{finishLoop.iterationsSuggested} suggested</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Blockers</div>
          <div className="mt-1 text-sm font-semibold text-white">{finishLoop.blockers.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Translation</div>
          <div className="mt-1 text-sm font-semibold text-white">{translation.verdict}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {translation.targets.map((target) => (
          <div key={target.device} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{deviceLabels[target.device]}</div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${verdictTone[target.verdict === 'pass' ? 'PASS' : target.verdict === 'borderline' ? 'BORDERLINE' : 'FAIL']}`}>
                {target.verdict}
              </span>
            </div>
            <div className="mt-3 text-sm text-slate-200">{target.score.toFixed(2)} score</div>
            <p className="mt-2 text-xs text-slate-400">{target.recommendation}</p>
            {target.blocker && <p className="mt-2 text-xs text-rose-300">{target.blocker}</p>}
          </div>
        ))}
      </div>

      {finishLoop.blockers.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-rose-300">Blockers</div>
          <ul className="mt-2 space-y-2 text-sm text-rose-100">
            {finishLoop.blockers.slice(0, 4).map((blocker) => (
              <li key={blocker}>• {blocker}</li>
            ))}
          </ul>
        </div>
      )}

      {finishLoop.recommendations.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Next actions</div>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {finishLoop.recommendations.slice(0, 4).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {finishLoop.loopPlan.map((step) => (
          <div key={step.step} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{step.step}</div>
            <p className="mt-2 text-xs text-slate-200">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FinishLoopPanel;
