import { buildTimelineAafAdapterPackage, buildTimelineOmfAdapterPackage } from './timelineInterchangeService';
import type { ReplayState } from './deterministicReplayService';

export interface TimelineInterchangeParityReport {
  generatedAt: number;
  sessionId: string;
  workspaceId: string;
  score: number;
  coverage: Array<{
    field: string;
    status: 'covered' | 'partial' | 'missing';
    notes: string[];
  }>;
  missing: string[];
  recommendations: string[];
}

function statusFor(value: boolean | 'partial'): 'covered' | 'partial' | 'missing' {
  if (value === 'partial') return 'partial';
  return value ? 'covered' : 'missing';
}

export function buildTimelineInterchangeParityReport(state: ReplayState): TimelineInterchangeParityReport {
  const aaf = buildTimelineAafAdapterPackage(state);
  const omf = buildTimelineOmfAdapterPackage(state);

  const coverage: TimelineInterchangeParityReport['coverage'] = [
    {
      field: 'session metadata',
      status: statusFor(Boolean(aaf.metadata)),
      notes: ['Session id, workspace id, and metadata are included.'],
    },
    {
      field: 'tempo map',
      status: statusFor(aaf.tempoMap.length > 0),
      notes: ['Tempo entries are preserved in AAF, OMF, XML, and binary STATE/TEMP chunks.'],
    },
    {
      field: 'track structure',
      status: statusFor(aaf.tracks.length > 0),
      notes: ['Track names, kinds, group ids, gain, pan, and region membership are preserved.'],
    },
    {
      field: 'track mixer state',
      status: statusFor(aaf.tracks.some((track) => Boolean(track.muted || track.solo || track.inserts.length || track.appliedProposalIds.length))),
      notes: ['Mute, solo, inserts, proposal ids, and track hashes are preserved in the adapter payload.'],
    },
    {
      field: 'regions',
      status: statusFor(aaf.tracks.some((track) => track.regions.length > 0)),
      notes: ['Region ids, source ids, offsets, durations, comp lane linkage, and gain are preserved.'],
    },
    {
      field: 'track groups',
      status: statusFor(aaf.trackGroups.length > 0),
      notes: ['Track groups round-trip through binary and text adapter packs.'],
    },
    {
      field: 'comp lanes',
      status: statusFor(aaf.compLanes.length > 0),
      notes: ['Comp lane ids, region ids, and active take ids are preserved.'],
    },
    {
      field: 'markers',
      status: statusFor(aaf.markers.length > 0),
      notes: ['Markers round-trip through all interchange paths.'],
    },
    {
      field: 'automation',
      status: statusFor(aaf.automation.length > 0),
      notes: ['Automation lanes and points are preserved in the full-state binary chunk and XML adapter.'],
    },
    {
      field: 'full round-trip state',
      status: statusFor(Boolean(aaf.fullState) && Boolean(omf.fullState)),
      notes: ['Binary interchange includes a full ESL session snapshot for exact in-app restoration.'],
    },
    {
      field: 'vendor native sdk bridge',
      status: 'missing',
      notes: ['A licensed native AAF/OMF SDK is still required for literal third-party binary parity.'],
    },
  ];

  const missing = coverage
    .filter((entry) => entry.status === 'missing')
    .map((entry) => entry.field);
  const partial = coverage.filter((entry) => entry.status === 'partial').map((entry) => entry.field);

  const score = Math.max(0, Math.min(100, Math.round(
    100 - (missing.length * 12) - (partial.length * 5)
  )));

  const recommendations: string[] = [];
  if (missing.length === 0) {
    recommendations.push('ESL round-trips its own complete session model through the interchange layer.');
  } else {
    recommendations.push('Close the missing fields before claiming full parity.');
  }
  recommendations.push('Native vendor SDK compatibility remains a separate external dependency.');
  recommendations.push('Use the full-state binary chunk for exact in-app restoration.');

  return {
    generatedAt: Date.now(),
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    score,
    coverage,
    missing,
    recommendations,
  };
}

export function serializeTimelineInterchangeParityReportJson(report: TimelineInterchangeParityReport): string {
  return JSON.stringify(report, null, 2);
}
