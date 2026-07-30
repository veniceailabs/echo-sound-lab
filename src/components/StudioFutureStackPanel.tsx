import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  buildStudioFutureStackReport,
  serializeStudioFutureStackReport,
  type StudioFutureStackInput,
  type StudioFutureStackReport,
} from '../services/studioFutureStackService';
import { downloadText } from '../services/cueSheetExporter';
import {
  buildStudioCapturePlan,
  buildStudioContentCatalog,
  buildStudioControlSurfaceProfile,
  buildStudioPostWorkflowPackage,
  serializeStudioWorkflowProfileJson,
} from '../services/studioWorkflowProfiles';

interface StudioFutureStackPanelProps extends StudioFutureStackInput {
  activeBranchId: string | null;
  compareBranchId: string | null;
  onExportSessionPackage: () => void;
  onImportSessionPackage: (file: File) => Promise<void>;
  onExportAafAdapter: () => void;
  onExportOmfAdapter: () => void;
  onExportMarkers: () => void;
  onExportReviewPackage: () => void;
}

const statusStyles: Record<StudioFutureStackReport['pillars'][number]['status'], string> = {
  ready: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  partial: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  missing: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
};

function scrollToSection(name: string): void {
  const target = document.querySelector<HTMLElement>(`[data-studio-section="${name}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function StudioFutureStackPanel(props: StudioFutureStackPanelProps) {
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
  const postWorkflow = useMemo(
    () => buildStudioPostWorkflowPackage(
      props.timelineState,
      props.compareState,
      props.branches,
      props.activeBranchId,
      props.compareBranchId
    ),
    [props.activeBranchId, props.branches, props.compareBranchId, props.compareState, props.timelineState]
  );
  const controlSurface = useMemo(
    () => buildStudioControlSurfaceProfile(props.engineSnapshot),
    [props.engineSnapshot]
  );
  const contentCatalog = useMemo(
    () => buildStudioContentCatalog(props.serviceTemplates),
    [props.serviceTemplates]
  );
  const capturePlan = useMemo(
    () => buildStudioCapturePlan(props.timelineState, props.hasSessionPackage),
    [props.hasSessionPackage, props.timelineState]
  );

  const exportReport = () => {
    downloadText(serializeStudioFutureStackReport(report), 'studio-future-stack-audit.json', 'application/json');
  };

  const exportPostWorkflow = () => {
    downloadText(serializeStudioWorkflowProfileJson(postWorkflow), 'studio-post-handoff.json', 'application/json');
  };

  const exportControlProfile = () => {
    downloadText(serializeStudioWorkflowProfileJson(controlSurface), 'studio-control-profile.json', 'application/json');
  };

  const exportContentCatalog = () => {
    downloadText(serializeStudioWorkflowProfileJson(contentCatalog), 'studio-content-catalog.json', 'application/json');
  };

  const exportCapturePlan = () => {
    downloadText(serializeStudioWorkflowProfileJson(capturePlan), 'studio-capture-plan.json', 'application/json');
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.9))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300/80">Future Stack</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            The ten missing DAW pillars, unified in one operating surface.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This panel turns interoperability, timeline editing, routing, latency, composition, automation, safety, plugins,
            workflow, and scale into a measurable studio system with direct actions into the existing app surfaces.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => scrollToSection('pro-console')}
            className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
          >
            Open Pro Console
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('capture-lab')}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Open Capture Lab
          </button>
          <button
            type="button"
            onClick={exportReport}
            className="rounded border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20"
          >
            Export Audit
          </button>
          <button
            type="button"
            onClick={() => props.onExportReviewPackage()}
            className="rounded border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20"
          >
            Export Review Package
          </button>
          <button
            type="button"
            onClick={() => props.onExportSessionPackage()}
            className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
          >
            Export Session Package
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Import Session Package
          </button>
          <button
            type="button"
            onClick={exportPostWorkflow}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Post Handoff
          </button>
          <button
            type="button"
            onClick={exportControlProfile}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Control Profile
          </button>
          <button
            type="button"
            onClick={exportContentCatalog}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Content Catalog
          </button>
          <button
            type="button"
            onClick={exportCapturePlan}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Capture Plan
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void props.onImportSessionPackage(file);
              event.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {report.pillars.map((pillar) => (
          <div key={pillar.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{pillar.title}</p>
                <p className="mt-1 text-lg font-semibold text-white">{pillar.score}%</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${statusStyles[pillar.status]}`}>
                {pillar.status}
              </span>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-200">{pillar.summary}</p>

            <div className="mt-3 space-y-1">
              {pillar.evidence.slice(0, 3).map((line) => (
                <p key={line} className="text-[11px] text-slate-500">
                  {line}
                </p>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {pillar.id === 'interop' && (
                <>
                  <button
                    type="button"
                    onClick={() => props.onExportAafAdapter()}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export AAF
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onExportOmfAdapter()}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export OMF
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onExportMarkers()}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Markers
                  </button>
                </>
              )}
              {pillar.id === 'timeline' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('timeline')}
                  className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                >
                  Open Timeline
                </button>
              )}
              {pillar.id === 'routing' && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection('pro-console')}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Open Routing Console
                  </button>
                  <button
                    type="button"
                    onClick={exportControlProfile}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Routing Profile
                  </button>
                </>
              )}
              {pillar.id === 'latency' && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection('pro-console')}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Open Latency View
                  </button>
                  <button
                    type="button"
                    onClick={exportControlProfile}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Control Profile
                  </button>
                </>
              )}
              {pillar.id === 'composition' && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection('album')}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Open Composition Lab
                  </button>
                  <button
                    type="button"
                    onClick={exportContentCatalog}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Catalog
                  </button>
                </>
              )}
              {pillar.id === 'automation' && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection('timeline')}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Open Automation
                  </button>
                  <button
                    type="button"
                    onClick={exportCapturePlan}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Plan
                  </button>
                </>
              )}
              {pillar.id === 'safety' && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection('recovery')}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Open Recovery
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onExportSessionPackage()}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Session
                  </button>
                </>
              )}
              {pillar.id === 'plugins' && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToSection('pro-console')}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Open Plugins
                  </button>
                  <button
                    type="button"
                    onClick={exportControlProfile}
                    className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                  >
                    Export Chain
                  </button>
                </>
              )}
              {pillar.id === 'workflow' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('collaboration')}
                  className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                >
                  Open Workflow
                </button>
              )}
              {pillar.id === 'scale' && (
                <button
                  type="button"
                  onClick={() => scrollToSection('timeline')}
                  className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                >
                  Inspect Scale
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Tracks</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.summary.tracks}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Regions</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.summary.regions}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Branches</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.summary.branches}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Overall</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.overallScore}%</p>
        </div>
      </div>
    </motion.section>
  );
}

export default React.memo(StudioFutureStackPanel);
