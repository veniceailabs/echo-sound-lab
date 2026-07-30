import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { buildStudioPostWorkflowPackage, serializeStudioWorkflowProfileJson } from '../services/studioWorkflowProfiles';
import { downloadText } from '../services/cueSheetExporter';
import type { BranchEntity } from '../services/timelineBranchingService';
import type { ReplayState } from '../services/deterministicReplayService';

interface StudioPostWorkflowPanelProps {
  timelineState: ReplayState;
  compareState?: ReplayState | null;
  branches: BranchEntity[];
  activeBranchId: string | null;
  compareBranchId: string | null;
}

const actionButtonClass =
  'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-200 hover:bg-white/[0.08]';

export function StudioPostWorkflowPanel(props: StudioPostWorkflowPanelProps) {
  const workflow = useMemo(
    () =>
      buildStudioPostWorkflowPackage(
        props.timelineState,
        props.compareState ?? null,
        props.branches,
        props.activeBranchId,
        props.compareBranchId
      ),
    [props.activeBranchId, props.branches, props.compareBranchId, props.compareState, props.timelineState]
  );

  const exportWorkflow = () => {
    downloadText(serializeStudioWorkflowProfileJson(workflow), 'studio-post-workflow.json', 'application/json');
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      data-studio-section="post-workflow"
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(3,7,18,0.98),rgba(10,15,30,0.95))] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.48)]"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.32em] text-emerald-300/80">Post Workflow</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Reconstruct cue, reconform, and handoff without leaving ESL.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            ESL now turns markers, branch diff hotspots, and session scale into a concrete post-production package for
            cueing, dialogue, and picture-lock review.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={actionButtonClass} onClick={exportWorkflow}>
            Export post handoff
          </button>
          <button
            type="button"
            className={actionButtonClass}
            onClick={() => document.querySelector<HTMLElement>('[data-studio-section="timeline"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Open timeline
          </button>
          <button
            type="button"
            className={actionButtonClass}
            onClick={() => document.querySelector<HTMLElement>('[data-studio-section="collaboration"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Open collaboration
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Cue Count</p>
          <p className="mt-2 text-2xl font-bold text-white">{workflow.cueCount}</p>
          <p className="mt-1 text-xs text-slate-400">Markers and branch hotspots combined.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Reconform</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {workflow.reconformChecklist.length} checklist items
          </p>
          <p className="mt-1 text-xs text-slate-400">Ready for picture-lock review and handoff.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Dialogue Log</p>
          <p className="mt-2 text-sm font-semibold text-white">{workflow.dialogueLog.length} cues logged</p>
          <p className="mt-1 text-xs text-slate-400">Marker labels become cue notes automatically.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Video Handoff</p>
          <p className="mt-2 text-sm font-semibold text-white">{workflow.videoHandoff.ready ? 'Ready' : 'Building'}</p>
          <p className="mt-1 text-xs text-slate-400">Session package, markers, cue sheet, compare snapshot.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Reconform Hints</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {workflow.reconformHints.map((hint) => (
              <li key={hint} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                {hint}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Checklist</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {workflow.reconformChecklist.map((item) => (
              <li key={item} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Dialogue Log</p>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
            {workflow.dialogueLog.map((item) => (
              <div key={item.cueId} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  {item.timeSec.toFixed(2)}s · {item.cueId}
                </p>
                <p className="mt-1 text-xs text-slate-400">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Video Handoff</p>
          <div className="mt-3 space-y-2">
            {workflow.videoHandoff.notes.map((note) => (
              <p key={note} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
                {note}
              </p>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-slate-500">Asset Checklist</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {workflow.videoHandoff.assetChecklist.map((asset) => (
              <span key={asset} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">
                {asset}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default StudioPostWorkflowPanel;
