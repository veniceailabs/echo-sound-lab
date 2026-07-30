import React from 'react';
import type { APLAutomationPlan } from '../services/aplAutomationPlanner';

interface APLAutomationPlanPanelProps {
  automationPlan?: APLAutomationPlan | null;
  targetTrackName?: string;
  isApplying?: boolean;
  onApplyAutomationPlan?: () => Promise<void> | void;
}

function formatAutomationValue(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}

const APLAutomationPlanPanel: React.FC<APLAutomationPlanPanelProps> = ({
  automationPlan,
  targetTrackName,
  isApplying = false,
  onApplyAutomationPlan,
}) => {
  if (!automationPlan) return null;

  const hasLanes = automationPlan.enabled && automationPlan.lanes.length > 0;

  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">APL Automation Plan</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">
            Section-aware motion for {targetTrackName || 'the current track'}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            The analysis engine generated deterministic automation lanes from arrangement shape, hook lift, ad-lib depth, and the perceptual field.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onApplyAutomationPlan?.()}
          disabled={!hasLanes || !onApplyAutomationPlan || isApplying}
          className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
        >
          {isApplying ? 'Applying…' : hasLanes ? 'Apply to Timeline' : 'No lanes to apply'}
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Status</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">{automationPlan.enabled ? 'Enabled' : 'Unavailable'}</p>
          <p className="mt-1 text-xs text-slate-400">{automationPlan.rationale[0] || 'No status available.'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Lanes</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">{automationPlan.lanes.length}</p>
          <p className="mt-1 text-xs text-slate-400">{automationPlan.sectionMap.length} arrangement section(s) mapped</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Perceptual Target</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            {automationPlan.lanes.some((lane) => lane.parameter === 'track_gain_db') ? 'Dynamic lead motion' : 'Section-aware motion'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Automation is derived from the APL perceptual field, not a static preset.</p>
        </div>
      </div>

      {automationPlan.rationale.length > 1 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Rationale</p>
          <ul className="mt-3 grid gap-2 text-sm text-slate-300">
            {automationPlan.rationale.map((item) => (
              <li key={item} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {automationPlan.lanes.map((lane) => {
          const firstPoint = lane.points[0];
          const lastPoint = lane.points[lane.points.length - 1];
          return (
            <article key={lane.laneId} className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">{lane.parameter}</p>
                  <h4 className="mt-1 text-sm font-semibold text-slate-100">{lane.rationale}</h4>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                  {lane.points.length} points
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="uppercase tracking-[0.14em] text-slate-500">Start</p>
                  <p className="mt-1 font-mono text-slate-200">
                    {firstPoint ? `${formatAutomationValue(firstPoint.value)} @ ${firstPoint.timeSec.toFixed(2)}s` : 'No points'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="uppercase tracking-[0.14em] text-slate-500">End</p>
                  <p className="mt-1 font-mono text-slate-200">
                    {lastPoint ? `${formatAutomationValue(lastPoint.value)} @ ${lastPoint.timeSec.toFixed(2)}s` : 'No points'}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {automationPlan.sectionMap.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/35 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Section Map</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {automationPlan.sectionMap.map((section) => (
              <div key={`${section.sectionName}-${section.startTimeSec}`} className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                <p className="text-sm font-semibold text-slate-100">{section.sectionName}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  {section.startTimeSec.toFixed(2)}s - {section.endTimeSec.toFixed(2)}s
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Energy {section.energy.toFixed(2)} • Density {section.density.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default APLAutomationPlanPanel;
