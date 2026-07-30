import React, { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import type { StudioFutureStackInput } from '../services/studioFutureStackService';
import { downloadText } from '../services/cueSheetExporter';
import {
  buildStudioDawReadinessReport,
  serializeStudioDawReadinessReport,
  serializeStudioDawSubreportJson,
  type StudioDawReadinessReport,
} from '../services/studioDawReadinessService';
import {
  buildStudioExternalDawHandoffBundle,
  serializeStudioExternalDawHandoffBundleJson,
} from '../services/studioExternalDawHandoffService';
import { serializeSessionScaleProfileJson } from '../services/sessionScaleService';
import {
  buildTimelineReconformPlan,
  serializeTimelineReconformPlanJson,
} from '../services/timelineReconformService';
import {
  buildSessionBenchmarkPlan,
  serializeSessionBenchmarkPlanJson,
} from '../services/sessionBenchmarkService';
import {
  buildTimelineInterchangeParityReport,
  serializeTimelineInterchangeParityReportJson,
} from '../services/timelineInterchangeParityService';
import {
  buildVendorInterchangeBridgeManifest,
  serializeVendorInterchangeBridgeManifestJson,
} from '../services/vendorInterchangeBridgeService';
import {
  buildVendorInterchangeBridgeRuntimeSnapshot,
  serializeVendorInterchangeBridgeRuntimeSnapshotJson,
} from '../services/vendorInterchangeBridgeRuntime';
import {
  buildStudioParityActionPlan,
  serializeStudioParityActionPlanJson,
} from '../services/studioParityActionPlanService';

interface StudioDawReadinessPanelProps extends StudioFutureStackInput {
  activeBranchId: string | null;
  compareBranchId: string | null;
  onExportSessionPackage: () => void;
  onImportSessionPackage: (file: File) => Promise<void>;
  onExportAafAdapter: () => void;
  onExportOmfAdapter: () => void;
  onExportMarkers: () => void;
}

const pillarStyles: Record<StudioDawReadinessReport['futureStack']['pillars'][number]['status'], string> = {
  ready: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  partial: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  missing: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
};

function scrollToSection(name: string): void {
  const target = document.querySelector<HTMLElement>(`[data-studio-section="${name}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function StudioDawReadinessPanel(props: StudioDawReadinessPanelProps) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const report = useMemo(
    () =>
      buildStudioDawReadinessReport({
        engineSnapshot: props.engineSnapshot,
        serviceTemplates: props.serviceTemplates,
        analysisResult: props.analysisResult,
        originalMetrics: props.originalMetrics,
        processedMetrics: props.processedMetrics,
        currentConfig: props.currentConfig,
        timelineState: props.timelineState,
        compareState: props.compareState,
        branches: props.branches,
        activeBranchId: props.activeBranchId,
        compareBranchId: props.compareBranchId,
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
  const benchmarkPlan = useMemo(
    () =>
      buildSessionBenchmarkPlan({
        timelineState: props.timelineState,
        compareState: props.compareState,
        branches: props.branches,
        scaleProfile: report.scaleProfile,
        engineSnapshot: props.engineSnapshot,
      }),
    [props.branches, props.compareState, props.engineSnapshot, props.timelineState, report.scaleProfile]
  );
  const parityReport = useMemo(
    () => buildTimelineInterchangeParityReport(props.timelineState),
    [props.timelineState]
  );
  const vendorBridgeManifest = useMemo(
    () => buildVendorInterchangeBridgeManifest(props.timelineState, parityReport),
    [parityReport, props.timelineState]
  );
  const bridgeRuntime = useMemo(
    () => buildVendorInterchangeBridgeRuntimeSnapshot(props.timelineState),
    [props.timelineState]
  );
  const parityActionPlan = useMemo(
    () =>
      buildStudioParityActionPlan({
        readiness: report,
        benchmarkPlan,
        parityReport,
        vendorBridgeManifest,
        bridgeRuntime,
      }),
    [benchmarkPlan, bridgeRuntime, parityReport, report, vendorBridgeManifest]
  );

  const exportReport = () => {
    downloadText(serializeStudioDawReadinessReport(report), 'studio-daw-readiness.json', 'application/json');
  };

  const exportScaleProfile = () => {
    downloadText(
      serializeSessionScaleProfileJson(report.scaleProfile),
      'studio-session-scale.json',
      'application/json'
    );
  };

  const exportPostWorkflow = () => {
    downloadText(
      serializeStudioDawSubreportJson(report.postWorkflow),
      'studio-post-handoff.json',
      'application/json'
    );
  };

  const exportControlProfile = () => {
    downloadText(
      serializeStudioDawSubreportJson(report.controlSurface),
      'studio-control-profile.json',
      'application/json'
    );
  };

  const exportContentCatalog = () => {
    downloadText(
      serializeStudioDawSubreportJson(report.contentCatalog),
      'studio-content-catalog.json',
      'application/json'
    );
  };

  const exportBenchmarkPlan = () => {
    downloadText(
      serializeSessionBenchmarkPlanJson(benchmarkPlan),
      'studio-session-benchmark.json',
      'application/json'
    );
  };

  const exportParityReport = () => {
    downloadText(
      serializeTimelineInterchangeParityReportJson(parityReport),
      'studio-interchange-parity.json',
      'application/json'
    );
  };

  const exportVendorBridgeManifest = () => {
    downloadText(
      serializeVendorInterchangeBridgeManifestJson(vendorBridgeManifest),
      'studio-vendor-interchange-bridge.json',
      'application/json'
    );
  };

  const exportBridgeRuntime = () => {
    downloadText(
      serializeVendorInterchangeBridgeRuntimeSnapshotJson(bridgeRuntime),
      'studio-vendor-interchange-runtime.json',
      'application/json'
    );
  };

  const exportParityActionPlan = () => {
    downloadText(
      serializeStudioParityActionPlanJson(parityActionPlan),
      'studio-parity-action-plan.json',
      'application/json'
    );
  };

  const exportCapturePlan = () => {
    downloadText(
      serializeStudioDawSubreportJson(report.capturePlan),
      'studio-capture-plan.json',
      'application/json'
    );
  };

  const exportReconformGuide = () => {
    const plan = buildTimelineReconformPlan({
      currentState: props.timelineState,
      importedState: props.compareState || props.timelineState,
      compareState: props.compareState,
      options: {
        strategy: props.compareState ? 'compare-hotspot' : 'current-end',
        anchorMarkerId: props.timelineState.markers?.[0]?.id || null,
        manualOffsetSeconds: 0,
        importTempo: true,
        conformToCurrentTempo: true,
      },
    });
    downloadText(serializeTimelineReconformPlanJson(plan), 'studio-reconform-guide.json', 'application/json');
  };

  const exportExternalHandoff = () => {
    const bundle = buildStudioExternalDawHandoffBundle({
      engineSnapshot: props.engineSnapshot,
      serviceTemplates: props.serviceTemplates,
      analysisResult: props.analysisResult,
      originalMetrics: props.originalMetrics,
      processedMetrics: props.processedMetrics,
      currentConfig: props.currentConfig,
      timelineState: props.timelineState,
      compareState: props.compareState,
      branches: props.branches,
      activeBranchId: props.activeBranchId,
      compareBranchId: props.compareBranchId,
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
    });
    downloadText(
      serializeStudioExternalDawHandoffBundleJson(bundle),
      'studio-external-daw-handoff.json',
      'application/json'
    );
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-5 rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.92))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">DAW Readiness</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Session interoperability, timeline, routing, latency, composition, automation, safety, plugins, workflow, scale.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This is the operational layer for beating a conventional DAW: not more panels, but better handoff, faster review,
            tighter comping, and a clearer path from capture to delivery.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportReport}
            className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
          >
            Export DAW Report
          </button>
          <button
            type="button"
            onClick={() => props.onExportSessionPackage()}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
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
            onClick={exportScaleProfile}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Scale Profile
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
          <button
            type="button"
            onClick={exportBenchmarkPlan}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Benchmark Plan
          </button>
          <button
            type="button"
            onClick={exportParityReport}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Parity Report
          </button>
          <button
            type="button"
            onClick={exportVendorBridgeManifest}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Bridge Manifest
          </button>
          <button
            type="button"
            onClick={exportBridgeRuntime}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Bridge Runtime
          </button>
          <button
            type="button"
            onClick={exportParityActionPlan}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Parity Plan
          </button>
          <button
            type="button"
            onClick={exportReconformGuide}
            className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
          >
            Export Reconform Guide
          </button>
          <button
            type="button"
            onClick={exportExternalHandoff}
            className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
          >
            Export Handoff Bundle
          </button>
        </div>
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {report.futureStack.pillars.map((pillar) => (
          <div key={pillar.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{pillar.title}</p>
                <p className="mt-1 text-lg font-semibold text-white">{pillar.score}%</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${pillarStyles[pillar.status]}`}>
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

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Session Scale</p>
            <p className="text-lg font-semibold text-white">{report.scaleProfile.readinessScore}% ready</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Tracks</span>{report.scaleProfile.trackCount}</div>
            <div><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Regions</span>{report.scaleProfile.regionCount}</div>
            <div><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Automation</span>{report.scaleProfile.automationLaneCount}</div>
            <div><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Comp Lanes</span>{report.scaleProfile.compLaneCount}</div>
            <div><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Branches</span>{report.scaleProfile.branchCount}</div>
            <div><span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Plugins</span>{report.scaleProfile.pluginInstanceCount}</div>
          </div>
          <div className="mt-3 space-y-2">
            {report.scaleProfile.warnings.slice(0, 3).map((warning) => (
              <p key={warning} className="text-[11px] text-amber-200/80">{warning}</p>
            ))}
            {report.scaleProfile.recommendations.slice(0, 3).map((recommendation) => (
              <p key={recommendation} className="text-[11px] text-cyan-100/80">{recommendation}</p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Handoff Checklist</p>
          <div className="mt-3 space-y-2">
            {report.handoffChecklist.map((item) => (
              <p key={item} className="text-[11px] text-slate-300">{item}</p>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">Recommended Next Actions</p>
          <div className="mt-2 space-y-2">
            {report.recommendedNextActions.map((item) => (
              <p key={item} className="text-[11px] text-slate-300">{item}</p>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">Benchmark Split Points</p>
          <div className="mt-2 space-y-2">
            {benchmarkPlan.splitPoints.slice(0, 4).map((point) => (
              <div key={`${point.label}-${point.timeSec}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <p className="text-[11px] text-slate-200">{point.label} @ {point.timeSec.toFixed(2)}s</p>
                <p className="mt-1 text-[10px] text-slate-500">{point.reason} · {point.source}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Benchmark Mode</p>
            <p className="text-lg font-semibold text-white">{benchmarkPlan.mode}</p>
          </div>
          <div className="mt-3 space-y-2">
            {benchmarkPlan.cleanupActions.slice(0, 4).map((action) => (
              <p key={action} className="text-[11px] text-slate-300">{action}</p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Benchmark Warnings</p>
          <div className="mt-3 space-y-2">
            {benchmarkPlan.warnings.slice(0, 4).map((warning) => (
              <p key={warning} className="text-[11px] text-amber-200/80">{warning}</p>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">Benchmark Recommendations</p>
          <div className="mt-2 space-y-2">
            {benchmarkPlan.recommendations.slice(0, 4).map((item) => (
              <p key={item} className="text-[11px] text-slate-300">{item}</p>
            ))}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-slate-500">Interchange Parity</p>
          <p className="mt-2 text-2xl font-semibold text-white">{parityReport.score}%</p>
          <div className="mt-2 space-y-2">
            {parityReport.coverage.slice(0, 4).map((entry) => (
              <p key={entry.field} className="text-[11px] text-slate-300">
                {entry.field}: {entry.status}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Bridge Runtime</p>
            <p className="text-lg font-semibold text-white">{bridgeRuntime.activeMode}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Native Adapters</span>
              {bridgeRuntime.nativeAdaptersRegistered}
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">SDK Ready</span>
              {bridgeRuntime.sdkReady ? 'yes' : 'no'}
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">AAF</span>
              {bridgeRuntime.activeAdapters.AAF.label}
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">OMF</span>
              {bridgeRuntime.activeAdapters.OMF.label}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {bridgeRuntime.notes.slice(0, 3).map((note) => (
              <p key={note} className="text-[11px] text-slate-300">{note}</p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Parity Action Plan</p>
            <p className="text-lg font-semibold text-white">{parityActionPlan.overallScore}%</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Critical</span>
              {parityActionPlan.summary.critical}
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">High</span>
              {parityActionPlan.summary.high}
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Bridge Mode</span>
              {parityActionPlan.bridgeMode}
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Benchmark</span>
              {parityActionPlan.benchmarkMode}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {parityActionPlan.nextBuildOrder.slice(0, 4).map((item) => (
              <p key={item} className="text-[11px] text-slate-300">{item}</p>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {parityActionPlan.missingFields.slice(0, 3).map((field) => (
              <p key={field} className="text-[11px] text-amber-200/80">{field}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Overall</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.futureStack.overallScore}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Readiness</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.scaleProfile.readinessScore}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Branches</p>
          <p className="mt-1 text-2xl font-semibold text-white">{props.branches.length}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Duration</p>
          <p className="mt-1 text-2xl font-semibold text-white">{report.scaleProfile.totalDurationSec.toFixed(1)}s</p>
        </div>
      </div>
    </motion.section>
  );
}

export default React.memo(StudioDawReadinessPanel);
