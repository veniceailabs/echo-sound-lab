import type { AnalysisResult, AudioMetrics, ProcessingConfig } from '../types';
import type { AudioEngineSnapshot } from './audioEngine';
import type { BranchEntity } from './timelineBranchingService';
import type { ReplayState } from './deterministicReplayService';
import type { ServiceTemplate } from './ServiceTemplates';

export type StudioFuturePillarId =
  | 'interop'
  | 'timeline'
  | 'routing'
  | 'latency'
  | 'composition'
  | 'automation'
  | 'safety'
  | 'plugins'
  | 'workflow'
  | 'scale';

export interface StudioFuturePillar {
  id: StudioFuturePillarId;
  title: string;
  status: 'ready' | 'partial' | 'missing';
  score: number;
  summary: string;
  evidence: string[];
  actions: string[];
}

export interface StudioFutureStackInput {
  engineSnapshot: AudioEngineSnapshot;
  serviceTemplates: ServiceTemplate[];
  analysisResult: AnalysisResult | null;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  currentConfig: ProcessingConfig;
  timelineState: ReplayState;
  compareState: ReplayState | null;
  branches: BranchEntity[];
  hasSessionPackage: boolean;
  hasTimelineInterchange: boolean;
  hasAafExport: boolean;
  hasOmfExport: boolean;
  hasMarkerExport: boolean;
  hasTimelineImportWizard: boolean;
  hasConformWorkflow: boolean;
  hasReconformWorkflow: boolean;
  hasCompEditing: boolean;
  hasCompAudition: boolean;
  hasPostTools: boolean;
  hasPostHandoffProfile: boolean;
  hasMidiSurface: boolean;
  hasBeatLibrary: boolean;
  hasStemSplitter: boolean;
  hasTempoTools: boolean;
  hasCaptureTools: boolean;
  hasCapturePlan: boolean;
  hasCollaborationSurface: boolean;
  hasControlSurfaceProfile: boolean;
  hasContentCatalog: boolean;
  hasBranchReview: boolean;
  hasBranchMerge: boolean;
}

export interface StudioFutureStackReport {
  generatedAt: number;
  overallScore: number;
  pillars: StudioFuturePillar[];
  summary: {
    tracks: number;
    regions: number;
    markers: number;
    automationLanes: number;
    compLanes: number;
    branches: number;
    templates: number;
    activeStages: number;
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pillarStatus(score: number): StudioFuturePillar['status'] {
  if (score >= 80) return 'ready';
  if (score >= 55) return 'partial';
  return 'missing';
}

function buildPillar(
  id: StudioFuturePillarId,
  title: string,
  score: number,
  summary: string,
  evidence: string[],
  actions: string[]
): StudioFuturePillar {
  return {
    id,
    title,
    status: pillarStatus(score),
    score: clampScore(score),
    summary,
    evidence,
    actions,
  };
}

export function buildStudioFutureStackReport(input: StudioFutureStackInput): StudioFutureStackReport {
  const tracks = input.timelineState.tracks.length;
  const regions = input.timelineState.regions.length;
  const markers = (input.timelineState.markers || []).length;
  const automationLanes = input.timelineState.automation.length;
  const compLanes = (input.timelineState.compLanes || []).length;
  const branchCount = input.branches.length;
  const templateCount = input.serviceTemplates.length;
  const activeStages = Object.values(input.currentConfig).filter(Boolean).length;
  const activeLocalPlugins = input.engineSnapshot.routingGraph.pluginCount;
  const baseLatencyMs = input.engineSnapshot.latency.baseLatencyMs ?? 0;
  const outputLatencyMs = input.engineSnapshot.latency.outputLatencyMs ?? baseLatencyMs;
  const totalLatencyMs = Math.max(0, baseLatencyMs + outputLatencyMs);

  const interopScore =
    30 +
    (input.hasSessionPackage ? 15 : 0) +
    (input.hasTimelineInterchange ? 15 : 0) +
    (input.hasAafExport ? 12 : 0) +
    (input.hasOmfExport ? 12 : 0) +
    (input.hasMarkerExport ? 8 : 0) +
    (input.hasTimelineImportWizard ? 8 : 0) +
    (input.hasConformWorkflow ? 10 : 0) +
    (input.hasReconformWorkflow ? 6 : 0);

  const timelineScore =
    25 +
    Math.min(30, compLanes * 12) +
    Math.min(20, tracks * 2) +
    (input.hasCompEditing ? 15 : 0) +
    (input.hasCompAudition ? 10 : 0);

  const routingScore =
    20 +
    (input.engineSnapshot.activeFlags.localPlugins ? 20 : 0) +
    (input.engineSnapshot.activeFlags.wamPlugins ? 20 : 0) +
    (input.engineSnapshot.chainSignature ? 10 : 0) +
    Math.min(20, activeLocalPlugins * 4) +
    (input.hasControlSurfaceProfile ? 10 : 0) +
    (input.hasPostTools ? 10 : 0);

  const latencyScore =
    20 +
    (input.engineSnapshot.recommendedRenderPath === 'native' ? 20 : 0) +
    (input.engineSnapshot.recommendedRenderPath === 'custom-dsp' ? 12 : 0) +
    (totalLatencyMs > 0 && totalLatencyMs < 24 ? 20 : 0) +
    (totalLatencyMs > 0 && totalLatencyMs < 48 ? 10 : 0) +
    (input.hasCaptureTools ? 10 : 0) +
    (input.hasControlSurfaceProfile ? 10 : 0);

  const scalePressure = tracks * 3 + regions * 1.1 + automationLanes * 5 + markers * 1.8 + compLanes * 9 + branchCount * 4;
  const scaleScore = clampScore(100 - Math.min(100, scalePressure));

  const compositionScore =
    20 +
    Math.min(30, templateCount * 8) +
    (input.hasBeatLibrary ? 15 : 0) +
    (input.hasStemSplitter ? 15 : 0) +
    (input.hasTempoTools ? 10 : 0) +
    (input.hasMidiSurface ? 10 : 0) +
    (input.hasContentCatalog ? 8 : 0);

  const automationScore =
    20 +
    Math.min(25, automationLanes * 8) +
    (input.hasCapturePlan ? 10 : 0) +
    (input.hasControlSurfaceProfile ? 10 : 0) +
    (activeStages > 0 ? 10 : 0) +
    (input.originalMetrics ? 5 : 0) +
    (input.processedMetrics ? 5 : 0);

  const safetyScore =
    25 +
    (input.hasSessionPackage ? 20 : 0) +
    (input.hasTimelineInterchange ? 10 : 0) +
    (input.hasMarkerExport ? 10 : 0) +
    (input.hasBranchReview ? 10 : 0) +
    (input.hasBranchMerge ? 10 : 0) +
    (input.hasCapturePlan ? 5 : 0);

  const pluginsScore =
    20 +
    (input.engineSnapshot.activeFlags.localPlugins ? 20 : 0) +
    (input.engineSnapshot.activeFlags.wamPlugins ? 20 : 0) +
    (input.serviceTemplates.length > 0 ? 10 : 0) +
    (input.engineSnapshot.chainSignature ? 10 : 0);

  const workflowScore =
    25 +
    (input.hasCollaborationSurface ? 15 : 0) +
    (input.hasBranchReview ? 15 : 0) +
    (input.hasBranchMerge ? 15 : 0) +
    (input.hasPostTools ? 10 : 0) +
    (input.hasPostHandoffProfile ? 10 : 0) +
    (branchCount > 1 ? 10 : 0) +
    (input.compareState ? 5 : 0);

  const pillars = [
    buildPillar(
      'interop',
      'Session Interoperability',
      interopScore,
      input.hasTimelineInterchange
        ? 'ESL now ships with a native interchange layer, binary adapters, and staged import flow.'
        : 'Interchange is still in progress.',
      [
        `${input.hasSessionPackage ? 'Session package export' : 'Session package missing'}`,
      `${input.hasTimelineInterchange ? 'Timeline interchange layer active' : 'Timeline interchange missing'}`,
      `${input.hasAafExport ? 'AAF adapter export present' : 'AAF adapter missing'}`,
      `${input.hasOmfExport ? 'OMF adapter export present' : 'OMF adapter missing'}`,
      `${input.hasConformWorkflow ? 'Tempo conform workflow present' : 'Tempo conform workflow missing'}`,
    ],
      [
        'Export and import the current session package',
        'Use staged session import for merge/replace review',
        'Keep AAF / OMF adapter envelopes in the handoff loop',
      ]
    ),
    buildPillar(
      'timeline',
      'Timeline Editing',
      timelineScore,
      compLanes > 0
        ? 'Comp lanes, take audition, and lane reordering are already in the timeline.'
        : 'Timeline editing still needs a deeper comping and region workflow.',
      [
        `${compLanes} comp lanes`,
        `${tracks} timeline tracks`,
        `${input.hasCompEditing ? 'Region split and reorder actions enabled' : 'Comp edit actions incomplete'}`,
      ],
      [
        'Open the timeline shell and work in comp lanes',
        'Audition takes from the lane surface',
        'Extend playlist-style take navigation next',
      ]
    ),
    buildPillar(
      'routing',
      'Signal Routing',
      routingScore,
      input.engineSnapshot.routingGraph.nodeCount > 0
        ? 'The engine can inspect its routing graph, plugin order, and active graph density.'
        : 'Routing inspection still needs a visible graph and more explicit signal flow controls.',
      [
        `${input.engineSnapshot.routingGraph.nodeCount} routing nodes`,
        `${input.engineSnapshot.routingGraph.edgeCount} routing edges`,
        `${input.engineSnapshot.routingGraph.pluginCount} active plugins`,
      ],
      [
        'Expose plugin order and signal flow together',
        'Use the command center to inspect route density',
        'Prefer explicit buses and inserts over implicit wiring',
      ]
    ),
    buildPillar(
      'latency',
      'Low-Latency Monitoring',
      latencyScore,
      totalLatencyMs > 0
        ? `Estimated monitoring latency is ${totalLatencyMs.toFixed(1)}ms, with render path ${input.engineSnapshot.recommendedRenderPath}.`
        : 'Latency reporting is still missing hard numbers from the audio engine.',
      [
        `${input.engineSnapshot.latency.baseLatencyMs ?? 0} ms base latency`,
        `${input.engineSnapshot.latency.outputLatencyMs ?? 0} ms output latency`,
        `${input.engineSnapshot.recommendedRenderPath} render path`,
    ],
      [
        'Keep monitoring predictable before adding more polish',
        'Prefer interactive contexts for live input and audition',
        'Surface latency budgets next to transport controls',
      ]
    ),
    buildPillar(
      'composition',
      'Composition and MIDI',
      compositionScore,
      input.hasMidiSurface
        ? 'MIDI synth, beat tools, stem splitter, and tempo tools are already forming a composition surface.'
        : 'Composition support is present but the MIDI and beat workflow still needs deeper navigation.',
      [
        `${templateCount} service templates`,
        `${input.hasBeatLibrary ? 'Beat library available' : 'Beat library missing'}`,
        `${input.hasMidiSurface ? 'MIDI surface present' : 'MIDI surface not yet surfaced'}`,
      ],
      [
        'Use beat, loop, and MIDI surfaces to sketch faster',
        'Keep tempo and key tools one click away',
        'Grow the composition surface without breaking the edit flow',
      ]
    ),
    buildPillar(
      'automation',
      'Automation System',
      automationScore,
      automationLanes > 0
        ? 'Automation lanes, capture plans, and control-surface mapping are already part of the timeline.'
        : 'Automation depth still needs lane editing, write modes, and more explicit control.',
      [
        `${automationLanes} automation lanes`,
        `${input.hasCapturePlan ? 'Capture plan available' : 'Capture plan missing'}`,
        `${input.hasControlSurfaceProfile ? 'Control profile surfaced' : 'Control profile missing'}`,
    ],
      [
        'Make write/touch/latch modes obvious in the UI',
        'Keep automation lanes reviewable and reversible',
        'Surface automation density before the mix gets crowded',
      ]
    ),
    buildPillar(
      'safety',
      'Session Safety',
      safetyScore,
      input.hasSessionPackage
        ? 'Recovery bundles, session packages, markers, and branch review give the session a safe rollback path.'
        : 'Safety is still missing durable recovery and versioned rollback coverage.',
      [
      `${input.hasSessionPackage ? 'Session package available' : 'Session package missing'}`,
      `${input.hasBranchReview ? 'Branch review active' : 'Branch review missing'}`,
      `${input.hasMarkerExport ? 'Marker export available' : 'Marker export missing'}`,
    ],
      [
        'Keep autosave, undo, and recovery bundles in sync',
        'Make rollback paths visible before every risky action',
        'Treat the recovery bundle as part of the product, not a sidecar',
      ]
    ),
    buildPillar(
      'plugins',
      'Plugin Ecosystem',
      pluginsScore,
      activeLocalPlugins > 0
        ? 'The studio can load local and WAM plugins, track them in the engine snapshot, and report active counts.'
        : 'Plugin inspection exists, but the ecosystem still needs better visibility and coverage.',
      [
        `${input.engineSnapshot.activeFlags.localPlugins ? 'Local plugins active' : 'No local plugins active'}`,
        `${input.engineSnapshot.activeFlags.wamPlugins ? 'WAM plugins active' : 'No WAM plugins active'}`,
        `${input.engineSnapshot.chainSignature ? 'Chain signature available' : 'Chain signature missing'}`,
      ],
      [
        'Show inserts, order, and bypass state in one place',
        'Keep the plugin chain deterministic and reviewable',
        'Expose enough inspection to trust the path on every load',
      ]
    ),
    buildPillar(
      'workflow',
      'Workflow Trust',
      workflowScore,
      branchCount > 1 || input.hasCollaborationSurface
        ? 'Collaboration, versioning, handoff, and review controls are turning the studio into an explainable workflow.'
        : 'Workflow trust still needs more explicit approval, comparison, and manual override surfaces.',
      [
        `${branchCount} branches`,
        `${input.compareState ? 'Compare branch loaded' : 'No compare branch loaded'}`,
        `${input.hasPostHandoffProfile ? 'Post handoff profile present' : 'Post handoff profile missing'}`,
      ],
      [
        'Keep autonomous actions interruptible and reversible',
        'Put compare, comments, and approvals in the foreground',
        'Make manual mode visible whenever the system can step in',
      ]
    ),
    buildPillar(
      'scale',
      'Large-Session Scale',
      scaleScore,
      scalePressure > 80
        ? 'Current timeline density is high enough to justify scale auditing and performance proofing.'
        : 'Session scale is light right now, but the audit system is ready to track it as it grows.',
      [
        `${tracks} tracks`,
        `${regions} regions`,
        `${automationLanes} automation lanes`,
        `${branchCount} branches`,
      ],
      [
        'Use the future stack audit to watch scale pressure',
        'Keep branch histories compact and reviewable',
        'Benchmark large edits before pushing session growth',
      ]
    ),
  ];

  const overallScore = clampScore(pillars.reduce((sum, pillar) => sum + pillar.score, 0) / pillars.length);
  return {
    generatedAt: Date.now(),
    overallScore,
    pillars,
    summary: {
      tracks,
      regions,
      markers,
      automationLanes,
      compLanes,
      branches: branchCount,
      templates: templateCount,
      activeStages,
    },
  };
}

export function serializeStudioFutureStackReport(report: StudioFutureStackReport): string {
  return JSON.stringify(report, null, 2);
}
