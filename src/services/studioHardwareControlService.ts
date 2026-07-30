import type { AudioEngineSnapshot } from './audioEngine';
import type { BranchEntity } from './timelineBranchingService';
import type { ReplayState } from './deterministicReplayService';
import type { TimelineInterchangeParityReport } from './timelineInterchangeParityService';
import type { VendorInterchangeBridgeRuntimeSnapshot } from './vendorInterchangeBridgeRuntime';
import type { StudioParityActionPlan } from './studioParityActionPlanService';

export type StudioHardwareActionId =
  | 'transport.play'
  | 'transport.pause'
  | 'transport.stop'
  | 'transport.seek.zero'
  | 'timeline.prev-hotspot'
  | 'timeline.next-hotspot'
  | 'timeline.export-snapshot'
  | 'timeline.export-markers'
  | 'timeline.merge-compare'
  | 'timeline.open'
  | 'workspace.command-center'
  | 'workspace.timeline'
  | 'workspace.collaboration'
  | 'workspace.post-workflow'
  | 'comp.cycle-prev'
  | 'comp.cycle-next'
  | 'comp.audition'
  | 'comp.promote'
  | 'capture.flashback'
  | 'capture.restore.latest'
  | 'interchange.export-session'
  | 'interchange.export-aaf'
  | 'interchange.export-omf'
  | 'interchange.import-session';

export interface StudioHardwareControlBinding {
  control: string;
  actionId: StudioHardwareActionId;
  notes: string;
}

export interface StudioHardwareControlAction {
  actionId: StudioHardwareActionId;
  label: string;
  category: 'transport' | 'timeline' | 'workspace' | 'comping' | 'capture' | 'interchange';
  notes: string[];
  enabled: boolean;
}

export interface StudioHardwareControlProfile {
  generatedAt: number;
  sessionId: string;
  workspaceId: string;
  ready: boolean;
  runtimeMode: 'native' | 'hybrid' | 'app';
  controlSurfaceMode: string;
  availableActions: StudioHardwareControlAction[];
  bindings: StudioHardwareControlBinding[];
  quickActions: string[];
  notes: string[];
}

export interface StudioHardwareControlInput {
  timelineState: ReplayState;
  compareState: ReplayState | null;
  branches: BranchEntity[];
  engineSnapshot: AudioEngineSnapshot;
  parityReport: TimelineInterchangeParityReport;
  bridgeRuntime: VendorInterchangeBridgeRuntimeSnapshot;
  parityPlan?: StudioParityActionPlan | null;
  hasSessionPackage: boolean;
  hasTimelineInterchange: boolean;
  hasAafExport: boolean;
  hasOmfExport: boolean;
  hasMarkerExport: boolean;
  hasTimelineImportWizard: boolean;
  hasCompEditing: boolean;
  hasCompAudition: boolean;
  hasBranchReview: boolean;
  hasBranchMerge: boolean;
  hasCollaborationSurface: boolean;
  hasControlSurfaceProfile: boolean;
}

function countCompareHotspots(state: ReplayState | null, compareState: ReplayState | null): number {
  if (!state || !compareState) return 0;
  const currentLength = state.regions.length + (state.markers || []).length + state.automation.length;
  const compareLength = compareState.regions.length + (compareState.markers || []).length + compareState.automation.length;
  return Math.max(0, Math.round(Math.abs(currentLength - compareLength)));
}

function action(
  actionId: StudioHardwareActionId,
  label: string,
  category: StudioHardwareControlAction['category'],
  enabled: boolean,
  notes: string[]
): StudioHardwareControlAction {
  return { actionId, label, category, enabled, notes };
}

export function buildStudioHardwareControlProfile(
  input: StudioHardwareControlInput
): StudioHardwareControlProfile {
  const compareHotspots = countCompareHotspots(input.timelineState, input.compareState);
  const runtimeMode: StudioHardwareControlProfile['runtimeMode'] = input.bridgeRuntime.sdkReady
    ? 'native'
    : input.bridgeRuntime.nativeAdaptersRegistered > 0
      ? 'hybrid'
      : 'app';

  const availableActions: StudioHardwareControlAction[] = [
    action('transport.play', 'Play', 'transport', true, ['Resume transport playback.']),
    action('transport.pause', 'Pause', 'transport', true, ['Pause transport without losing position.']),
    action('transport.stop', 'Stop', 'transport', true, ['Stop transport and reset the playhead.']),
    action('transport.seek.zero', 'Seek to start', 'transport', true, ['Jump the playhead to the start of the session.']),
    action('timeline.prev-hotspot', 'Previous hotspot', 'timeline', input.hasBranchReview && compareHotspots > 0, ['Jump to the previous compare hotspot.']),
    action('timeline.next-hotspot', 'Next hotspot', 'timeline', input.hasBranchReview && compareHotspots > 0, ['Jump to the next compare hotspot.']),
    action('timeline.export-snapshot', 'Export compare snapshot', 'timeline', input.hasBranchReview, ['Write a review artifact for the current branch state.']),
    action('timeline.export-markers', 'Export markers', 'timeline', input.hasMarkerExport, ['Download marker JSON and CSV.']),
    action('timeline.merge-compare', 'Merge compare branch', 'timeline', input.hasBranchMerge && Boolean(input.compareState), ['Merge the compare branch into the active branch.']),
    action('timeline.open', 'Open timeline', 'workspace', true, ['Scroll to the timeline workspace section.']),
    action('workspace.command-center', 'Open command center', 'workspace', true, ['Scroll to the command center section.']),
    action('workspace.timeline', 'Open compare workspace', 'workspace', true, ['Scroll to the compare and branch review surface.']),
    action('workspace.collaboration', 'Open collaboration', 'workspace', input.hasCollaborationSurface, ['Open the collaboration surface.']),
    action('workspace.post-workflow', 'Open post workflow', 'workspace', true, ['Open the post-production handoff surface.']),
    action('comp.cycle-prev', 'Prev take', 'comping', input.hasCompEditing, ['Cycle the active comp lane backward.']),
    action('comp.cycle-next', 'Next take', 'comping', input.hasCompEditing, ['Cycle the active comp lane forward.']),
    action('comp.audition', 'Audition comp', 'comping', input.hasCompAudition, ['Audition the primary comp lane.']),
    action('comp.promote', 'Promote take', 'comping', input.hasCompEditing, ['Promote the current comp take.']),
    action('capture.flashback', 'Capture flashback', 'capture', true, ['Capture the current audio state into the flashback bank.']),
    action('capture.restore.latest', 'Restore latest capture', 'capture', true, ['Restore the latest flashback snapshot.']),
    action('interchange.export-session', 'Export session package', 'interchange', input.hasSessionPackage, ['Write the ESL session package.']),
    action('interchange.export-aaf', 'Export AAF', 'interchange', input.hasAafExport, ['Write the AAF adapter package.']),
    action('interchange.export-omf', 'Export OMF', 'interchange', input.hasOmfExport, ['Write the OMF adapter package.']),
    action('interchange.import-session', 'Import session package', 'interchange', input.hasTimelineImportWizard, ['Load an external interchange file.']),
  ];

  return {
    generatedAt: Date.now(),
    sessionId: input.timelineState.sessionId,
    workspaceId: input.timelineState.workspaceId,
    ready: input.hasControlSurfaceProfile || input.bridgeRuntime.sdkReady || (input.parityPlan?.overallScore ?? 0) > 50,
    runtimeMode,
    controlSurfaceMode: input.engineSnapshot.masteringQualityMode,
    availableActions,
    bindings: [
      { control: 'Space', actionId: 'transport.play', notes: 'Toggle playback from the current playhead.' },
      { control: 'Shift+Space', actionId: 'transport.stop', notes: 'Stop and return to zero.' },
      { control: 'Left / Right', actionId: 'timeline.prev-hotspot', notes: 'Navigate branch hotspots.' },
      { control: 'M', actionId: 'timeline.export-markers', notes: 'Export markers to JSON and CSV.' },
      { control: 'A', actionId: 'comp.cycle-prev', notes: 'Cycle the active comp lane backward.' },
      { control: 'D', actionId: 'comp.cycle-next', notes: 'Cycle the active comp lane forward.' },
      { control: 'P', actionId: 'workspace.post-workflow', notes: 'Open the post workflow surface.' },
      { control: 'S', actionId: 'timeline.export-snapshot', notes: 'Export a compare review snapshot.' },
      { control: 'I', actionId: 'interchange.import-session', notes: 'Import a session package.' },
      { control: 'F', actionId: 'capture.flashback', notes: 'Capture the current audio state.' },
      { control: 'R', actionId: 'capture.restore.latest', notes: 'Restore the latest flashback capture.' },
    ],
    quickActions: [
      'Play transport',
      'Stop transport',
      'Export compare snapshot',
      'Export markers',
      'Capture flashback',
      'Restore latest flashback',
      'Merge compare branch',
      'Open timeline workspace',
    ],
    notes: [
      `Parity score: ${input.parityReport.score}%`,
      `Bridge mode: ${input.bridgeRuntime.activeMode}`,
      `Compare hotspots: ${compareHotspots}`,
      input.parityPlan && input.parityPlan.missingFields.length > 0
        ? `Missing fields: ${input.parityPlan.missingFields.slice(0, 3).join(', ')}`
        : 'Parity action plan is clear.',
    ],
  };
}

export function serializeStudioHardwareControlProfileJson(profile: StudioHardwareControlProfile): string {
  return JSON.stringify(profile, null, 2);
}

export interface StudioHardwareControlBridge {
  profile: StudioHardwareControlProfile;
  invoke: (actionId: StudioHardwareActionId, payload?: Record<string, unknown>) => Promise<boolean>;
}

declare global {
  interface Window {
    __ESL_HARDWARE_CONTROL__?: StudioHardwareControlBridge;
  }
}
