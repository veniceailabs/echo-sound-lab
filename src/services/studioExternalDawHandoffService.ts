import type { ReplayState } from './deterministicReplayService';
import {
  buildTimelineAafAdapterPackage,
  buildTimelineOmfAdapterPackage,
  serializeTimelineAafAdapterXml,
  serializeTimelineMarkersJson,
  exportTimelineMarkersCsv,
} from './timelineInterchangeService';
import {
  buildStudioDawReadinessReport,
  type StudioDawReadinessInput,
} from './studioDawReadinessService';
import {
  buildSessionBenchmarkPlan,
  type SessionBenchmarkPlan,
} from './sessionBenchmarkService';
import {
  buildTimelineInterchangeParityReport,
  type TimelineInterchangeParityReport,
} from './timelineInterchangeParityService';
import {
  buildVendorInterchangeBridgeManifest,
  type VendorInterchangeBridgeManifest,
} from './vendorInterchangeBridgeService';
import {
  buildVendorInterchangeBridgeRuntimeSnapshot,
  type VendorInterchangeBridgeRuntimeSnapshot,
} from './vendorInterchangeBridgeRuntime';
import {
  buildStudioParityActionPlan,
  type StudioParityActionPlan,
} from './studioParityActionPlanService';

export interface StudioExternalDawHandoffBundle {
  format: 'ESL-EXTERNAL-DAW-HANDOFF';
  version: 1;
  generatedAt: number;
  activeBranchId: string | null;
  compareBranchId: string | null;
  timeline: {
    sessionId: string;
    workspaceId: string;
    state: ReplayState;
  };
  aaf: ReturnType<typeof buildTimelineAafAdapterPackage>;
  omf: ReturnType<typeof buildTimelineOmfAdapterPackage>;
  markerJson: string;
  markerCsv: string;
  aafXml: string;
  readiness: ReturnType<typeof buildStudioDawReadinessReport>;
  benchmark: SessionBenchmarkPlan;
  parity: TimelineInterchangeParityReport;
  vendorBridge: VendorInterchangeBridgeManifest;
  bridgeRuntime: VendorInterchangeBridgeRuntimeSnapshot;
  parityPlan: StudioParityActionPlan;
  notes: string[];
}

export interface StudioExternalDawHandoffInput extends StudioDawReadinessInput {
  activeBranchId: string | null;
  compareBranchId: string | null;
}

export function buildStudioExternalDawHandoffBundle(
  input: StudioExternalDawHandoffInput
): StudioExternalDawHandoffBundle {
  const readiness = buildStudioDawReadinessReport(input);
  const aaf = buildTimelineAafAdapterPackage(input.timelineState);
  const omf = buildTimelineOmfAdapterPackage(input.timelineState);
  const markerJson = serializeTimelineMarkersJson(input.timelineState.markers || []);
  const markerCsv = exportTimelineMarkersCsv(input.timelineState.markers || []);
  const aafXml = serializeTimelineAafAdapterXml(input.timelineState);
  const benchmark = buildSessionBenchmarkPlan({
    timelineState: input.timelineState,
    compareState: input.compareState,
    branches: input.branches,
    scaleProfile: readiness.scaleProfile,
    engineSnapshot: input.engineSnapshot,
  });
  const parity = buildTimelineInterchangeParityReport(input.timelineState);
  const vendorBridge = buildVendorInterchangeBridgeManifest(input.timelineState, parity);
  const bridgeRuntime = buildVendorInterchangeBridgeRuntimeSnapshot(input.timelineState);
  const parityPlan = buildStudioParityActionPlan({
    readiness,
    benchmarkPlan: benchmark,
    parityReport: parity,
    vendorBridgeManifest: vendorBridge,
    bridgeRuntime,
  });

  const notes = [
    'Session interoperability bundle ready for external DAW review.',
    'Use the AAF / OMF payloads together with the marker exports and reconform checklist.',
    readiness.scaleProfile.readinessScore >= 70
      ? 'Session scale is in a safe handoff band.'
      : 'Session scale still benefits from a cleanup pass before handoff.',
  ];

  return {
    format: 'ESL-EXTERNAL-DAW-HANDOFF',
    version: 1,
    generatedAt: Date.now(),
    activeBranchId: input.activeBranchId,
    compareBranchId: input.compareBranchId,
    timeline: {
      sessionId: input.timelineState.sessionId,
      workspaceId: input.timelineState.workspaceId,
      state: JSON.parse(JSON.stringify(input.timelineState)) as ReplayState,
    },
    aaf,
    omf,
    markerJson,
    markerCsv,
    aafXml,
    readiness,
    benchmark,
    parity,
    vendorBridge,
    bridgeRuntime,
    parityPlan,
    notes,
  };
}

export function serializeStudioExternalDawHandoffBundleJson(bundle: StudioExternalDawHandoffBundle): string {
  return JSON.stringify(bundle, null, 2);
}
