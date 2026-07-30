import type { SessionBenchmarkPlan } from './sessionBenchmarkService';
import type { StudioDawReadinessReport } from './studioDawReadinessService';
import type { TimelineInterchangeParityReport } from './timelineInterchangeParityService';
import type { VendorInterchangeBridgeManifest } from './vendorInterchangeBridgeService';
import type { VendorInterchangeBridgeRuntimeSnapshot } from './vendorInterchangeBridgeRuntime';
import type { StudioFuturePillarId } from './studioFutureStackService';

export interface StudioParityActionItem {
  id: string;
  pillarId: StudioFuturePillarId | 'vendor-sdk' | 'session-scale';
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'missing' | 'partial' | 'ready';
  evidence: string[];
  deliverables: string[];
}

export interface StudioParityActionPlan {
  generatedAt: number;
  readinessScore: number;
  parityScore: number;
  benchmarkMode: SessionBenchmarkPlan['mode'];
  bridgeMode: VendorInterchangeBridgeRuntimeSnapshot['activeMode'];
  overallScore: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    ready: number;
  };
  missingFields: string[];
  nextBuildOrder: string[];
  items: StudioParityActionItem[];
}

export interface StudioParityActionPlanInput {
  readiness: StudioDawReadinessReport;
  benchmarkPlan: SessionBenchmarkPlan;
  parityReport: TimelineInterchangeParityReport;
  vendorBridgeManifest: VendorInterchangeBridgeManifest;
  bridgeRuntime: VendorInterchangeBridgeRuntimeSnapshot;
}

const pillarPriority: Record<StudioFuturePillarId, StudioParityActionItem['priority']> = {
  interop: 'critical',
  timeline: 'high',
  routing: 'critical',
  latency: 'critical',
  composition: 'medium',
  automation: 'high',
  safety: 'critical',
  plugins: 'high',
  workflow: 'high',
  scale: 'high',
};

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

export function buildStudioParityActionPlan(input: StudioParityActionPlanInput): StudioParityActionPlan {
  const items: StudioParityActionItem[] = [];

  for (const pillar of input.readiness.futureStack.pillars) {
    if (pillar.status === 'ready') continue;
    items.push({
      id: `pillar-${pillar.id}`,
      pillarId: pillar.id,
      title: `${pillar.title} gap`,
      priority: pillarPriority[pillar.id],
      status: pillar.status,
      evidence: uniqueLines([
        pillar.summary,
        ...pillar.evidence,
      ]),
      deliverables: uniqueLines(pillar.actions),
    });
  }

  if (input.parityReport.missing.includes('vendor native sdk bridge') || !input.bridgeRuntime.sdkReady) {
    items.push({
      id: 'vendor-sdk-bridge',
      pillarId: 'vendor-sdk',
      title: 'Native vendor SDK bridge',
      priority: 'critical',
      status: 'missing',
      evidence: uniqueLines([
        ...input.vendorBridgeManifest.notes,
        ...input.bridgeRuntime.notes,
      ]),
      deliverables: uniqueLines([
        'Attach licensed AAF SDK adapter',
        'Attach licensed OMF SDK adapter',
        'Validate binary round-trip against external DAWs',
      ]),
    });
  }

  if (input.benchmarkPlan.mode !== 'fidelity' || input.readiness.scaleProfile.readinessScore < 70) {
    items.push({
      id: 'session-scale-validation',
      pillarId: 'session-scale',
      title: 'Large-session confidence validation',
      priority: input.readiness.scaleProfile.readinessScore < 50 ? 'critical' : 'high',
      status: input.readiness.scaleProfile.readinessScore >= 70 ? 'ready' : 'partial',
      evidence: uniqueLines([
        `Benchmark mode: ${input.benchmarkPlan.mode}`,
        `${input.readiness.scaleProfile.trackCount} tracks`,
        `${input.readiness.scaleProfile.regionCount} regions`,
        `${input.readiness.scaleProfile.branchCount} branches`,
      ]),
      deliverables: uniqueLines([
        'Run stress benchmarks on the heaviest session bins',
        'Validate split points before handoff',
        'Trim or freeze duplicate regions and inactive branches',
      ]),
    });
  }

  const summary = items.reduce(
    (acc, item) => {
      acc[item.priority] += 1;
      if (item.status === 'ready') acc.ready += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, ready: 0 }
  );

  const missingFields = uniqueLines([
    ...input.parityReport.missing,
    ...(input.vendorBridgeManifest.fieldMappings
      .filter((entry) => entry.status === 'external')
      .map((entry) => entry.field)),
  ]);

  const nextBuildOrder = items
    .slice()
    .sort((left, right) => {
      const order: Record<StudioParityActionItem['priority'], number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return order[left.priority] - order[right.priority] || left.title.localeCompare(right.title);
    })
    .map((item) => item.title);

  return {
    generatedAt: Date.now(),
    readinessScore: input.readiness.scaleProfile.readinessScore,
    parityScore: input.parityReport.score,
    benchmarkMode: input.benchmarkPlan.mode,
    bridgeMode: input.bridgeRuntime.activeMode,
    overallScore: Math.max(
      0,
      Math.min(100, Math.round(
        (input.readiness.futureStack.overallScore + input.readiness.scaleProfile.readinessScore + input.parityReport.score) / 3
      ))
    ),
    summary,
    missingFields,
    nextBuildOrder,
    items,
  };
}

export function serializeStudioParityActionPlanJson(plan: StudioParityActionPlan): string {
  return JSON.stringify(plan, null, 2);
}
