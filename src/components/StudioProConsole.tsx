import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import type { StudioFutureStackInput, StudioFutureStackReport } from '../services/studioFutureStackService';
import { buildStudioFutureStackReport, serializeStudioFutureStackReport } from '../services/studioFutureStackService';
import { buildTimelineBranchDiffSummary } from '../services/timelineBranchDiffService';
import { downloadText } from '../services/cueSheetExporter';
import StudioPostWorkflowPanel from './StudioPostWorkflowPanel';

type ConsoleSection = 'command-center' | 'timeline' | 'collaboration' | 'post-workflow';

interface StudioProConsoleProps extends StudioFutureStackInput {
  activeBranchId: string | null;
  compareBranchId: string | null;
  onOpenSection: (section: ConsoleSection) => void;
  onExportSessionPackage: () => void;
  onImportSessionPackage: (file: File) => Promise<void>;
  onExportAafAdapter: () => void;
  onExportOmfAdapter: () => void;
  onExportMarkers: () => void;
  onExportCompareSnapshot: () => void;
  onExportReviewPackage: () => void;
  onCreateCompLane?: (trackId: string, trackName: string, regionIds: string[]) => void;
  onCycleCompLaneTake?: (trackId: string, laneId: string, direction: 'prev' | 'next') => void;
  onCollapseCompLaneToActive?: (trackId: string, laneId: string) => void;
  onAuditionCompLane?: (trackId: string, laneId: string) => void;
}

const iconBase = 'h-10 w-10 rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-cyan-200';

function SessionIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 4v16M16 4v16M4 8h16M4 16h16" />
    </svg>
  );
}

function CompIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M5 7h14M5 12h10M5 17h12" />
      <path d="M15 10l4 2-4 2v-4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PostIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function HardwareIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8 8v8M12 6v12M16 10v4" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 17h16" />
      <path d="M6 17V7h4v10M14 17V11h4v6" />
    </svg>
  );
}

function ContentIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M5 6h14v12H5z" />
      <path d="M8 9h8M8 12h6M8 15h5" />
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CollaborationIcon() {
  return (
    <svg className={iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="7" cy="7" r="2.2" />
      <circle cx="17" cy="7" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M9 8.5l2.5 6M15 8.5l-2.5 6M9 7h6" />
    </svg>
  );
}

const pillarIcon: Record<StudioFutureStackReport['pillars'][number]['id'], React.ReactNode> = {
  interop: <SessionIcon />,
  timeline: <CompIcon />,
  routing: <HardwareIcon />,
  latency: <HardwareIcon />,
  composition: <ContentIcon />,
  automation: <CaptureIcon />,
  safety: <PostIcon />,
  plugins: <HardwareIcon />,
  workflow: <CollaborationIcon />,
  scale: <ScaleIcon />,
};

const statusTone: Record<StudioFutureStackReport['pillars'][number]['status'], string> = {
  ready: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  partial: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  missing: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
};

const actionButtonClass = 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-200 hover:bg-white/[0.08]';

export function StudioProConsole(props: StudioProConsoleProps) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const report = useMemo(
    () =>
      buildStudioFutureStackReport({
        engineSnapshot: props.engineSnapshot,
        serviceTemplates: props.serviceTemplates,
        analysisResult: props.analysisResult,
        originalMetrics: props.originalMetrics,
        processedMetrics: props.processedMetrics,
        currentConfig: props.currentConfig,
        timelineState: props.timelineState,
        compareState: props.compareState,
        branches: props.branches,
        hasSessionPackage: props.hasSessionPackage,
        hasTimelineInterchange: props.hasTimelineInterchange,
        hasAafExport: props.hasAafExport,
        hasOmfExport: props.hasOmfExport,
        hasMarkerExport: props.hasMarkerExport,
        hasTimelineImportWizard: props.hasTimelineImportWizard,
        hasConformWorkflow: props.hasConformWorkflow,
        hasReconformWorkflow: props.hasReconformWorkflow,
        hasCompEditing: props.hasCompEditing,
        hasCompAudition: props.hasCompAudition,
        hasPostTools: props.hasPostTools,
        hasPostHandoffProfile: props.hasPostHandoffProfile,
        hasMidiSurface: props.hasMidiSurface,
        hasBeatLibrary: props.hasBeatLibrary,
        hasStemSplitter: props.hasStemSplitter,
        hasTempoTools: props.hasTempoTools,
        hasCaptureTools: props.hasCaptureTools,
        hasCapturePlan: props.hasCapturePlan,
        hasCollaborationSurface: props.hasCollaborationSurface,
        hasControlSurfaceProfile: props.hasControlSurfaceProfile,
        hasContentCatalog: props.hasContentCatalog,
        hasBranchReview: props.hasBranchReview,
        hasBranchMerge: props.hasBranchMerge,
      }),
    [props]
  );
  const heatmap = useMemo(
    () => buildTimelineBranchDiffSummary(props.timelineState, props.compareState),
    [props.compareState, props.timelineState]
  );
  const hotspotBins = heatmap.bins.filter((bin) => bin.intensity >= 0.25 || bin.score >= heatmap.maxScore * 0.4);
  const hotspotCount = hotspotBins.length;
  const readyCount = report.pillars.filter((pillar) => pillar.status === 'ready').length;
  const missingCount = report.pillars.filter((pillar) => pillar.status === 'missing').length;
  const gapScore = Math.max(0, 100 - report.overallScore);
  const primaryTrack = props.timelineState.tracks[0] || null;
  const primaryTrackRegions = primaryTrack
    ? props.timelineState.regions.filter((region) => region.trackId === primaryTrack.trackId)
    : [];
  const primaryTrackCompLanes = primaryTrack
    ? (props.timelineState.compLanes || []).filter((lane) => lane.trackId === primaryTrack.trackId)
    : [];
  const primaryCompLane = primaryTrackCompLanes[0] || null;

  const exportReport = () => {
    downloadText(serializeStudioFutureStackReport(report), 'studio-pro-console-audit.json', 'application/json');
  };

  const exportHotspots = () => {
    downloadText(
      JSON.stringify(
        {
          generatedAt: Date.now(),
          activeBranchId: props.activeBranchId,
          compareBranchId: props.compareBranchId,
          durationSec: heatmap.durationSec,
          binSizeSec: heatmap.binSizeSec,
          maxScore: heatmap.maxScore,
          totalScore: heatmap.totalScore,
          hotspotCount,
          bins: hotspotBins,
        },
        null,
        2
      ),
      'studio-branch-hotspots.json',
      'application/json'
    );
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      data-studio-section="pro-console"
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(3,7,18,0.98),rgba(10,15,30,0.95))] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.48)]"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">Pro Studio Console</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            The missing DAW pillars, surfaced as operating controls.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Session interchange, timeline, routing, latency, composition, automation, safety, plugins, workflow, and scale are now exposed
            as a single control surface instead of a pile of hidden panels.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Readiness</div>
            <div className="mt-1 text-lg font-semibold text-white">{report.overallScore}%</div>
            <div className="mt-1 text-xs text-slate-400">{readyCount} pillars ready</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Gap</div>
            <div className="mt-1 text-lg font-semibold text-white">{gapScore}%</div>
            <div className="mt-1 text-xs text-slate-400">{missingCount} pillars still partial or missing</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Hotspots</div>
            <div className="mt-1 text-lg font-semibold text-white">{hotspotCount}</div>
            <div className="mt-1 text-xs text-slate-400">{heatmap.totalScore.toFixed(1)} total diff score</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Branches</div>
            <div className="mt-1 text-lg font-semibold text-white">{props.branches.length}</div>
            <div className="mt-1 text-xs text-slate-400">
              {props.activeBranchId ?? 'active'} vs {props.compareBranchId ?? 'compare'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={actionButtonClass} onClick={() => props.onOpenSection('command-center')}>
          Open command center
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onOpenSection('timeline')}>
          Open timeline
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onOpenSection('collaboration')}>
          Open collaboration
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onOpenSection('post-workflow')}>
          Open post workflow
        </button>
        <button type="button" className={actionButtonClass} onClick={exportReport}>
          Export audit
        </button>
        <button type="button" className={actionButtonClass} onClick={exportHotspots}>
          Export hotspots
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onExportSessionPackage()}>
          Export session
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onExportAafAdapter()}>
          Export AAF
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onExportOmfAdapter()}>
          Export OMF
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onExportMarkers()}>
          Export markers
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onExportCompareSnapshot()}>
          Export compare snapshot
        </button>
        <button type="button" className={actionButtonClass} onClick={() => props.onExportReviewPackage()}>
          Export review package
        </button>
        <button type="button" className={actionButtonClass} onClick={() => importRef.current?.click()}>
          Import session
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json,.xml,.csv,.aaf,.omf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void props.onImportSessionPackage(file);
            event.currentTarget.value = '';
          }}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Branch heatmap</p>
            <p className="mt-1 text-sm text-slate-300">Click the timeline panel to review the strongest change zones.</p>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {heatmap.maxScore > 0 ? `${Math.round((hotspotCount / heatmap.bins.length) * 100)}% hotspot density` : 'No compare branch'}
          </div>
        </div>
        <div className="mt-3 flex h-5 gap-[2px] overflow-hidden rounded-full border border-white/10 bg-black/20">
          {heatmap.bins.map((bin) => (
            <div
              key={bin.index}
              className="flex-1"
              style={{
                backgroundColor:
                  bin.score <= 0
                    ? 'rgba(148,163,184,0.12)'
                    : bin.intensity >= 0.7
                      ? 'rgba(251,146,60,0.9)'
                      : bin.intensity >= 0.4
                        ? 'rgba(34,211,238,0.7)'
                        : 'rgba(99,102,241,0.5)',
              }}
              title={`${bin.startSec.toFixed(1)}s - ${bin.endSec.toFixed(1)}s`}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">Comp Toolkit</p>
            {primaryTrack ? (
              <>
                <p className="mt-1 text-sm font-semibold text-slate-100">{primaryTrack.trackName}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {primaryTrackRegions.length} regions, {primaryTrackCompLanes.length} comp lanes
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-slate-100">No track selected yet</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Open the timeline to start building comp lanes and playlist-style takes.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!props.onCreateCompLane || !primaryTrack || primaryTrackRegions.length < 2}
              onClick={() => primaryTrack && props.onCreateCompLane?.(primaryTrack.trackId, primaryTrack.trackName, primaryTrackRegions.map((region) => region.regionId))}
              className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Comp Lane
            </button>
            <button
              type="button"
              disabled={!props.onCycleCompLaneTake || !primaryCompLane || !primaryTrack}
              onClick={() => primaryTrack && primaryCompLane && props.onCycleCompLaneTake?.(primaryTrack.trackId, primaryCompLane.laneId, 'next')}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next Take
            </button>
            <button
              type="button"
              disabled={!props.onCollapseCompLaneToActive || !primaryCompLane || !primaryTrack}
              onClick={() => primaryTrack && primaryCompLane && props.onCollapseCompLaneToActive?.(primaryTrack.trackId, primaryCompLane.laneId)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Keep Active Only
            </button>
            <button
              type="button"
              disabled={!props.onAuditionCompLane || !primaryCompLane || !primaryTrack}
              onClick={() => primaryTrack && primaryCompLane && props.onAuditionCompLane?.(primaryTrack.trackId, primaryCompLane.laneId)}
              className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Audition Lane
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <StudioPostWorkflowPanel
          timelineState={props.timelineState}
          compareState={props.compareState}
          branches={props.branches}
          activeBranchId={props.activeBranchId}
          compareBranchId={props.compareBranchId}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {report.pillars.map((pillar) => (
          <div key={pillar.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0">{pillarIcon[pillar.id]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">{pillar.title}</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${statusTone[pillar.status]}`}>
                    {pillar.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{pillar.score}%</p>
              </div>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-200">{pillar.summary}</p>

            <div className="mt-3 space-y-1">
              {pillar.actions.slice(0, 2).map((action) => (
                <p key={action} className="text-xs text-slate-500">
                  {action}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

export default React.memo(StudioProConsole);
