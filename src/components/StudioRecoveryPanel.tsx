import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { downloadText } from '../services/cueSheetExporter';
import { buildTimelineBranchDiffSummary } from '../services/timelineBranchDiffService';
import {
  serializeStudioSessionRecoveryBundleJson,
  type StudioSessionRecoveryBundle,
} from '../services/studioSessionRecoveryService';
import type { ReplayState } from '../services/deterministicReplayService';

interface StudioRecoveryPanelProps {
  bundle: StudioSessionRecoveryBundle | null;
  currentTimelineState?: ReplayState | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
  onExportBundle: () => void;
  onRestoreBundle: () => Promise<void>;
  onMergeBundle?: () => Promise<void>;
  onImportBundle: (file: File) => Promise<void>;
  onClearBundle: () => Promise<void>;
}

const actionButtonClass = 'rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]';

export function StudioRecoveryPanel(props: StudioRecoveryPanelProps) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const bundleSummary = useMemo(() => {
    if (!props.bundle) return null;
    return {
      sessionName: props.bundle.currentFileName || props.bundle.sessionPackage.session.fileName || 'Untitled',
      branchId: props.bundle.activeTimelineBranchId || 'main',
      compareBranchId: props.bundle.timelineCompareBranchId || 'none',
      playhead: props.bundle.currentPlayheadSeconds,
    };
  }, [props.bundle]);

  const diffSummary = useMemo(() => {
    if (!props.bundle || !props.currentTimelineState) return null;
    return buildTimelineBranchDiffSummary(props.currentTimelineState, props.bundle.timelineState);
  }, [props.bundle, props.currentTimelineState]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,15,30,0.98),rgba(7,11,24,0.92))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-violet-300/80">Session Recovery</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Keep the full studio state alive.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This bundle captures session, timeline, compare, playback, and hardware context so ESL can recover after interruption or handoff.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Save status</div>
          <div className="mt-1 text-lg font-semibold capitalize text-white">{props.saveStatus}</div>
          <div className="mt-1 text-xs text-slate-400">
            {props.lastSavedAt ? `Saved ${new Date(props.lastSavedAt).toLocaleTimeString()}` : 'No recovery bundle saved yet.'}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={props.onExportBundle} className={actionButtonClass}>
          Export Recovery Bundle
        </button>
        <button type="button" onClick={() => void props.onRestoreBundle()} className={actionButtonClass}>
          Restore Current Bundle
        </button>
        {props.onMergeBundle && (
          <button type="button" onClick={() => void props.onMergeBundle?.()} className={actionButtonClass}>
            Merge Into Current
          </button>
        )}
        <button type="button" onClick={() => importRef.current?.click()} className={actionButtonClass}>
          Import Recovery Bundle
        </button>
        <button type="button" onClick={() => void props.onClearBundle()} className={actionButtonClass}>
          Clear Saved Bundle
        </button>
        <button
          type="button"
          onClick={() => {
            if (!props.bundle) return;
            downloadText(
              serializeStudioSessionRecoveryBundleJson(props.bundle),
              'studio-recovery-bundle.json',
              'application/json'
            );
          }}
          className={actionButtonClass}
        >
          Download JSON
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Bundle summary</p>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <p>Session: {bundleSummary?.sessionName || 'No bundle loaded'}</p>
            <p>Branch: {bundleSummary?.branchId || 'n/a'}</p>
            <p>Compare branch: {bundleSummary?.compareBranchId || 'n/a'}</p>
            <p>Playhead: {bundleSummary ? bundleSummary.playhead.toFixed(2) : 'n/a'} sec</p>
          </div>
          {props.bundle ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Recovery notes</p>
              <div className="mt-2 space-y-1">
                {props.bundle.notes.map((note) => (
                  <p key={note} className="text-[11px] text-slate-400">{note}</p>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">No recovery bundle is available in memory yet.</p>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recovery checklist</p>
          <div className="mt-3 space-y-2">
            {[
              'Session package is included',
              'Timeline state is captured',
              'Compare branch is captured',
              'Hardware and MIDI map are included',
              'Interchange parity metadata is included',
              'Ready to restore after interruption',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <p className="text-[11px] text-slate-300">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {diffSummary && (
        <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-950/15 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">Compare against current session</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Tracks changed', value: diffSummary.changedTracks + diffSummary.addedTracks + diffSummary.removedTracks },
              { label: 'Regions changed', value: diffSummary.changedRegions + diffSummary.addedRegions + diffSummary.removedRegions },
              { label: 'Markers changed', value: diffSummary.changedMarkers + diffSummary.addedMarkers + diffSummary.removedMarkers },
              { label: 'Automation lanes', value: diffSummary.changedAutomationLanes + diffSummary.addedAutomationLanes + diffSummary.removedAutomationLanes },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {diffSummary.bins
              .filter((bin) => bin.score > 0)
              .slice(0, 4)
              .map((bin) => (
                <div key={bin.index} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {bin.startSec.toFixed(1)}s - {bin.endSec.toFixed(1)}s
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">
                      {bin.currentHits} current / {bin.compareHits} compare
                    </p>
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    {bin.labels.slice(0, 2).join(' • ') || 'Structural difference detected'}
                  </div>
                </div>
              ))}
          </div>
          {props.onMergeBundle && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Merge assistant</p>
              <p className="mt-2 text-sm text-slate-300">
                Merge the recovered timeline into the current session when you want to keep the live work and recover the missing state.
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void props.onImportBundle(file);
            event.currentTarget.value = '';
          }
        }}
      />
    </motion.section>
  );
}

export default React.memo(StudioRecoveryPanel);
