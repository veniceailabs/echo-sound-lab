import type { AudioEngineSnapshot } from './audioEngine';
import type { BranchEntity } from './timelineBranchingService';
import type { ReplayState } from './deterministicReplayService';
import type { ServiceTemplate } from './ServiceTemplates';
import { buildTimelineBranchDiffSummary } from './timelineBranchDiffService';

export interface StudioPostCue {
  id: string;
  timeSec: number;
  label: string;
  note: string;
  source: 'marker' | 'branch';
}

export interface StudioPostWorkflowPackage {
  generatedAt: number;
  sessionId: string;
  activeBranchId: string | null;
  compareBranchId: string | null;
  cueCount: number;
  markers: number;
  regions: number;
  reconformHints: string[];
  reconformChecklist: string[];
  dialogueLog: Array<{
    cueId: string;
    label: string;
    timeSec: number;
    note: string;
  }>;
  videoHandoff: {
    ready: boolean;
    notes: string[];
    assetChecklist: string[];
  };
  cues: StudioPostCue[];
}

export interface StudioControlSurfaceMapping {
  group: string;
  bindings: Array<{ control: string; action: string; notes: string }>;
}

export interface StudioControlSurfaceProfile {
  generatedAt: number;
  engineMode: string;
  renderPath: string;
  ready: boolean;
  mappings: StudioControlSurfaceMapping[];
  quickActions: string[];
}

export interface StudioContentCatalog {
  generatedAt: number;
  templateCount: number;
  categories: Array<{
    name: string;
    count: number;
  }>;
  starterActions: string[];
  featuredTemplates: Array<{
    templateId: string;
    name: string;
    category: string;
    summary: string;
  }>;
}

export interface StudioCapturePlan {
  generatedAt: number;
  trackCount: number;
  regionCount: number;
  markerCount: number;
  steps: string[];
  takeFolderSteps: string[];
  monitoringChecklist: string[];
}

function escapeLabel(value: string): string {
  return value.trim() || 'Untitled';
}

export function buildStudioPostWorkflowPackage(
  activeState: ReplayState,
  compareState: ReplayState | null,
  branches: BranchEntity[],
  activeBranchId: string | null,
  compareBranchId: string | null
): StudioPostWorkflowPackage {
  const heatmap = buildTimelineBranchDiffSummary(activeState, compareState);
  const cues: StudioPostCue[] = [
    ...(activeState.markers || []).map((marker) => ({
      id: marker.id,
      timeSec: marker.timeSec,
      label: escapeLabel(marker.label),
      note: marker.note || '',
      source: 'marker' as const,
    })),
  ];

  for (const bin of heatmap.bins.filter((bin) => bin.intensity >= 0.45).slice(0, 8)) {
    cues.push({
      id: `hotspot-${bin.index}`,
      timeSec: bin.startSec,
      label: `Hotspot ${bin.index + 1}`,
      note: bin.labels[0] || 'Structural branch difference',
      source: 'branch',
    });
  }

  const reconformHints: string[] = [];
  if (compareState) {
    reconformHints.push('Compare branch contains structural divergence that should be reviewed before picture lock.');
  }
  if (branches.length > 1) {
    reconformHints.push('Use branch compare export and snapshot review before handoff.');
  }
  if ((activeState.markers || []).length > 0) {
    reconformHints.push('Marker export is ready for cue and ADR handoff.');
  }

  const dialogueLog = (activeState.markers || [])
    .slice(0, 12)
    .map((marker) => ({
      cueId: marker.id,
      label: marker.label,
      timeSec: marker.timeSec,
      note: marker.note || 'Marker ready for dialogue or cue handoff.',
    }));

  const reconformChecklist = [
    'Confirm branch compare hotspots before picture lock.',
    'Export markers, cue sheet, and session package together.',
    'Validate tempo metadata if the session was conform-merged.',
    'Reopen the compare snapshot if later notes change structural timing.',
  ];

  const videoHandoff = {
    ready: Boolean(compareState || (activeState.markers || []).length > 0),
    notes: [
      compareState ? 'Branch compare data included.' : 'No compare branch selected.',
      (activeState.markers || []).length > 0 ? 'Marker density is sufficient for cue handoff.' : 'Add markers for a stronger post handoff.',
    ],
    assetChecklist: [
      'Session package',
      'Markers JSON / CSV',
      'Cue sheet export',
      'Compare snapshot JSON / SVG',
    ],
  };

  return {
    generatedAt: Date.now(),
    sessionId: activeState.sessionId,
    activeBranchId,
    compareBranchId,
    cueCount: cues.length,
    markers: (activeState.markers || []).length,
    regions: activeState.regions.length,
    reconformHints,
    reconformChecklist,
    dialogueLog,
    videoHandoff,
    cues,
  };
}

export function buildStudioControlSurfaceProfile(
  engineSnapshot: AudioEngineSnapshot
): StudioControlSurfaceProfile {
  return {
    generatedAt: Date.now(),
    engineMode: engineSnapshot.masteringQualityMode,
    renderPath: engineSnapshot.recommendedRenderPath,
    ready: true,
    mappings: [
      {
        group: 'Transport',
        bindings: [
          { control: 'Play', action: 'Toggle playback', notes: 'Spacebar equivalent' },
          { control: 'Stop', action: 'Stop and reset', notes: 'Return to zero' },
          { control: 'Seek wheel', action: 'Scrub timeline', notes: 'Use timeline seek handler' },
        ],
      },
      {
        group: 'Review',
        bindings: [
          { control: 'Prev hotspot', action: 'Jump to previous diff hotspot', notes: 'Branch compare navigation' },
          { control: 'Next hotspot', action: 'Jump to next diff hotspot', notes: 'Branch compare navigation' },
          { control: 'Snapshot', action: 'Export compare snapshot', notes: 'Shareable review artifact' },
        ],
      },
      {
        group: 'Comping',
        bindings: [
          { control: 'Take prev', action: 'Cycle comp lane take backward', notes: 'Playlist-style take navigation' },
          { control: 'Take next', action: 'Cycle comp lane take forward', notes: 'Playlist-style take navigation' },
          { control: 'Promote take', action: 'Set active comp lane take', notes: 'Promote the focused region' },
        ],
      },
      {
        group: 'Markers',
        bindings: [
          { control: 'Add marker', action: 'Create cue marker', notes: 'Post and edit handoff' },
          { control: 'Export markers', action: 'Download marker JSON / CSV', notes: 'Cue and ADR handoff' },
          { control: 'Import markers', action: 'Merge marker set', notes: 'External timeline import' },
        ],
      },
      {
        group: 'Capture',
        bindings: [
          { control: 'Arm', action: 'Prepare track for recording', notes: 'Low-latency capture' },
          { control: 'Punch', action: 'Toggle punch in/out', notes: 'Comping and overdub flow' },
          { control: 'Count-in', action: 'Start with metronome count', notes: 'Record-ready start' },
        ],
      },
      {
        group: 'Finishing',
        bindings: [
          { control: 'Quality', action: 'Switch mastering quality mode', notes: engineSnapshot.masteringQualityMode },
          { control: 'Render', action: 'Choose render path', notes: engineSnapshot.recommendedRenderPath },
          { control: 'Export', action: 'Open platform export', notes: 'Delivery handoff' },
        ],
      },
    ],
    quickActions: [
      'Open timeline compare',
      'Export session package',
      'Export compare snapshot',
      'Open post handoff report',
    ],
  };
}

export function buildStudioContentCatalog(serviceTemplates: ServiceTemplate[]): StudioContentCatalog {
  const categories = new Map<string, number>();
  for (const template of serviceTemplates) {
    categories.set(template.category, (categories.get(template.category) || 0) + 1);
  }
  return {
    generatedAt: Date.now(),
    templateCount: serviceTemplates.length,
    categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })),
    starterActions: [
      'Open beat creation and loop tools',
      'Open stem splitter for source material',
      'Open midi synth for capture and sketching',
      'Open song arranger for structure-first starts',
      'Open the AI Studio for voice-driven idea generation',
    ],
    featuredTemplates: serviceTemplates.map((template) => ({
      templateId: template.templateId,
      name: template.name,
      category: template.category,
      summary: template.summary,
    })),
  };
}

export function buildStudioCapturePlan(
  state: ReplayState,
  hasSessionPackage: boolean
): StudioCapturePlan {
  const markerCount = (state.markers || []).length;
  return {
    generatedAt: Date.now(),
    trackCount: state.tracks.length,
    regionCount: state.regions.length,
    markerCount,
    steps: [
      'Arm the target track and monitor the input path.',
      'Use count-in and looping for take capture.',
      'Add markers for fixes and cue points during the pass.',
      hasSessionPackage ? 'Save the session package after the take.' : 'Export a session package after capture.',
    ],
    takeFolderSteps: [
      'Record alternate takes into the same lane.',
      'Split and audition the best phrase segments.',
      'Promote the active take before comping.',
      'Normalize clip gain before final export.',
    ],
    monitoringChecklist: [
      'Confirm low-latency monitoring is engaged.',
      'Verify the input device and sample rate before recording.',
      'Keep headroom on the recorded signal for later comping and tuning.',
    ],
  };
}

export function serializeStudioWorkflowProfileJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
