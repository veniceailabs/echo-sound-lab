import type { BranchEntity } from './timelineBranchingService';
import type { ReplayState } from './deterministicReplayService';
import { buildStudioFutureStackReport, type StudioFutureStackInput, type StudioFutureStackReport } from './studioFutureStackService';
import {
  buildStudioCapturePlan,
  buildStudioContentCatalog,
  buildStudioControlSurfaceProfile,
  buildStudioPostWorkflowPackage,
  serializeStudioWorkflowProfileJson,
  type StudioCapturePlan,
  type StudioContentCatalog,
  type StudioControlSurfaceProfile,
  type StudioPostWorkflowPackage,
} from './studioWorkflowProfiles';
import { buildSessionScaleProfile, type SessionScaleProfile } from './sessionScaleService';

export interface StudioDawReadinessInput extends StudioFutureStackInput {
  activeBranchId: string | null;
  compareBranchId: string | null;
}

export interface StudioDawReadinessReport {
  generatedAt: number;
  futureStack: StudioFutureStackReport;
  scaleProfile: SessionScaleProfile;
  postWorkflow: StudioPostWorkflowPackage;
  controlSurface: StudioControlSurfaceProfile;
  contentCatalog: StudioContentCatalog;
  capturePlan: StudioCapturePlan;
  handoffChecklist: string[];
  recommendedNextActions: string[];
}

function buildHandOffChecklist(
  futureStack: StudioFutureStackReport,
  postWorkflow: StudioPostWorkflowPackage,
  scaleProfile: SessionScaleProfile,
  compareState: ReplayState | null
): string[] {
  const checklist = [
    'Export the current session package.',
    'Export AAF and OMF adapter envelopes.',
    'Export markers as JSON and CSV.',
    'Export the compare snapshot before merge.',
  ];

  if (futureStack.pillars.find((pillar) => pillar.id === 'interop' && pillar.score >= 70)) {
    checklist.push('Interchange layer is ready for external handoff review.');
  }
  if (postWorkflow.cues.length > 0) {
    checklist.push('Cue data is ready for ADR and post handoff.');
  }
  if (scaleProfile.readinessScore >= 70) {
    checklist.push('Session scale is within a safe pro handoff band.');
  }
  if (compareState) {
    checklist.push('Review structural hotspots before accepting the compare branch.');
  }

  return checklist;
}

function buildRecommendedNextActions(
  futureStack: StudioFutureStackReport,
  scaleProfile: SessionScaleProfile,
  postWorkflow: StudioPostWorkflowPackage
): string[] {
  const actions: string[] = [];
  actions.push('Open the timeline and verify compare hotspots.');
  actions.push('Cycle the active comp lane take and audition the current performance.');
  if (scaleProfile.readinessScore < 65) {
    actions.push('Reduce session pressure by collapsing branches or trimming duplicate takes.');
  }
  if (futureStack.pillars.some((pillar) => pillar.id === 'workflow' && pillar.score < 70)) {
    actions.push('Expand post handoff artifacts before picture-lock delivery.');
  }
  if (postWorkflow.reconformHints.length > 0) {
    actions.push('Review reconform hints before exporting the next handoff.');
  }
  return actions;
}

export function buildStudioDawReadinessReport(input: StudioDawReadinessInput): StudioDawReadinessReport {
  const futureStack = buildStudioFutureStackReport(input);
  const scaleProfile = buildSessionScaleProfile({
    timelineState: input.timelineState,
    compareState: input.compareState,
    branches: input.branches,
    engineSnapshot: input.engineSnapshot,
  });
  const postWorkflow = buildStudioPostWorkflowPackage(
    input.timelineState,
    input.compareState,
    input.branches,
    input.activeBranchId,
    input.compareBranchId
  );
  const controlSurface = buildStudioControlSurfaceProfile(input.engineSnapshot);
  const contentCatalog = buildStudioContentCatalog(input.serviceTemplates);
  const capturePlan = buildStudioCapturePlan(input.timelineState, input.hasSessionPackage);
  const handoffChecklist = buildHandOffChecklist(futureStack, postWorkflow, scaleProfile, input.compareState);
  const recommendedNextActions = buildRecommendedNextActions(futureStack, scaleProfile, postWorkflow);

  return {
    generatedAt: Date.now(),
    futureStack,
    scaleProfile,
    postWorkflow,
    controlSurface,
    contentCatalog,
    capturePlan,
    handoffChecklist,
    recommendedNextActions,
  };
}

export function serializeStudioDawReadinessReport(report: StudioDawReadinessReport): string {
  return JSON.stringify(report, null, 2);
}

export function serializeStudioDawSubreportJson(value: unknown): string {
  return serializeStudioWorkflowProfileJson(value);
}
