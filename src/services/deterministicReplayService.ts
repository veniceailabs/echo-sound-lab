import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { deterministicId, sha256Hex, stableStringify } from './deterministicJson';

export type ReplayTrackKind = 'audio' | 'bus' | 'master';

export interface ReplayTrackState {
  trackId: string;
  trackName: string;
  kind: ReplayTrackKind;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  limiterThresholdDb: number | null;
  normalizedTargetLUFS: number | null;
  dcRemovalHz: number | null;
  appliedProposalIds: string[];
  trackStateHash: string;
}

export interface ReplayRegionState {
  regionId: string;
  trackId: string;
  sourceId: string;
  startTimeSec: number;
  offsetSec: number;
  durationSec: number;
  gainDb: number;
}

export interface ReplayAutomationPoint {
  pointId: string;
  timeSec: number;
  value: number;
  curve?: 'step' | 'linear' | 'bezier';
}

export interface ReplayAutomationLane {
  laneId: string;
  trackId: string;
  parameter: string;
  points: ReplayAutomationPoint[];
}

export interface ReplayState {
  sessionId: string;
  workspaceId: string;
  tracks: ReplayTrackState[];
  regions: ReplayRegionState[];
  automation: ReplayAutomationLane[];
  metadata?: Record<string, unknown>;
}

export interface DeterministicReplayContext {
  seed: number;
  clockStartMs: number;
  clockStepMs: number;
  engineVersion: string;
  workspaceId: string;
}

export interface ReplayEvent {
  index: number;
  eventId: string;
  timestamp: number;
  proposalId: string;
  actionType: string;
  trackId: string;
  beforeTrackHash: string;
  afterTrackHash: string;
}

export interface ReplayAuditArtifact {
  replayVersion: 'esl-replay-v1';
  engineVersion: string;
  seed: number;
  workspaceId: string;
  inputDigest: string;
  outputStateHash: string;
  eventCount: number;
  events: ReplayEvent[];
}

export interface DeterministicReplayResult {
  baseStateHash: string;
  aplSequenceHash: string;
  outputStateHash: string;
  outputState: ReplayState;
  auditArtifact: ReplayAuditArtifact;
}

const DEFAULT_REPLAY_CONTEXT: DeterministicReplayContext = {
  seed: 7331,
  clockStartMs: 1735689600000, // 2025-01-01T00:00:00.000Z
  clockStepMs: 17,
  engineVersion: 'esl-replay-v1',
  workspaceId: 'workspace-main',
};

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function toNumber(input: unknown, fallback = 0): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toStringValue(input: unknown, fallback: string): string {
  if (typeof input === 'string' && input.trim()) return input;
  if (typeof input === 'number' && Number.isFinite(input)) return String(input);
  return fallback;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function compareTracks(a: ReplayTrackState, b: ReplayTrackState): number {
  return a.trackId.localeCompare(b.trackId);
}

function compareRegions(a: ReplayRegionState, b: ReplayRegionState): number {
  if (a.startTimeSec !== b.startTimeSec) return a.startTimeSec - b.startTimeSec;
  return a.regionId.localeCompare(b.regionId);
}

function compareAutomationPoints(a: ReplayAutomationPoint, b: ReplayAutomationPoint): number {
  if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
  return a.pointId.localeCompare(b.pointId);
}

function compareAutomationLanes(a: ReplayAutomationLane, b: ReplayAutomationLane): number {
  return a.laneId.localeCompare(b.laneId);
}

function normalizeTrack(input: Partial<ReplayTrackState> & { trackId: string }): ReplayTrackState {
  return {
    trackId: input.trackId,
    trackName: input.trackName || input.trackId,
    kind: (input.kind || 'audio') as ReplayTrackKind,
    gainDb: round6(toNumber(input.gainDb, 0)),
    pan: round6(toNumber(input.pan, 0)),
    muted: Boolean(input.muted),
    solo: Boolean(input.solo),
    limiterThresholdDb: input.limiterThresholdDb === null || input.limiterThresholdDb === undefined
      ? null
      : round6(toNumber(input.limiterThresholdDb, -0.1)),
    normalizedTargetLUFS: input.normalizedTargetLUFS === null || input.normalizedTargetLUFS === undefined
      ? null
      : round6(toNumber(input.normalizedTargetLUFS, -14)),
    dcRemovalHz: input.dcRemovalHz === null || input.dcRemovalHz === undefined
      ? null
      : round6(toNumber(input.dcRemovalHz, 20)),
    appliedProposalIds: Array.isArray(input.appliedProposalIds) ? [...input.appliedProposalIds] : [],
    trackStateHash: '',
  };
}

function normalizeRegion(input: Partial<ReplayRegionState> & { regionId: string; trackId: string }): ReplayRegionState {
  return {
    regionId: input.regionId,
    trackId: input.trackId,
    sourceId: input.sourceId || input.regionId,
    startTimeSec: round6(toNumber(input.startTimeSec, 0)),
    offsetSec: round6(toNumber(input.offsetSec, 0)),
    durationSec: round6(Math.max(0, toNumber(input.durationSec, 0))),
    gainDb: round6(toNumber(input.gainDb, 0)),
  };
}

function normalizeAutomationLane(input: ReplayAutomationLane): ReplayAutomationLane {
  const points = (input.points || []).map((point) => ({
    pointId: point.pointId || deterministicId('auto-pt', { t: toNumber(point.timeSec, 0), v: toNumber(point.value, 0) }),
    timeSec: round6(toNumber(point.timeSec, 0)),
    value: round6(toNumber(point.value, 0)),
    curve: point.curve || 'linear',
  }));
  points.sort(compareAutomationPoints);
  return {
    laneId: input.laneId,
    trackId: input.trackId,
    parameter: input.parameter,
    points,
  };
}

function normalizeReplayState(baseState: ReplayState, context: DeterministicReplayContext): ReplayState {
  const cloned = JSON.parse(stableStringify(baseState)) as ReplayState & { tracks: ReplayState['tracks'] | Record<string, ReplayTrackState> };

  const trackArray = Array.isArray(cloned.tracks)
    ? cloned.tracks
    : Object.values(cloned.tracks || {});

  const normalized: ReplayState = {
    sessionId: cloned.sessionId || 'session-main',
    workspaceId: cloned.workspaceId || context.workspaceId,
    tracks: trackArray.map((track) => normalizeTrack(track as Partial<ReplayTrackState> & { trackId: string })),
    regions: Array.isArray((cloned as ReplayState).regions)
      ? (cloned as ReplayState).regions.map((region) => normalizeRegion(region))
      : [],
    automation: Array.isArray((cloned as ReplayState).automation)
      ? (cloned as ReplayState).automation.map((lane) => normalizeAutomationLane(lane))
      : [],
    metadata: (cloned as ReplayState).metadata ? { ...(cloned as ReplayState).metadata } : undefined,
  };

  normalized.tracks.sort(compareTracks);
  normalized.regions.sort(compareRegions);
  normalized.automation.sort(compareAutomationLanes);

  updateAllTrackHashes(normalized);
  return normalized;
}

function getTrack(state: ReplayState, trackId: string): ReplayTrackState | undefined {
  return state.tracks.find((track) => track.trackId === trackId);
}

function ensureTrack(
  state: ReplayState,
  trackId: string,
  trackName: string,
  kind: ReplayTrackKind = 'audio'
): ReplayTrackState {
  const existing = getTrack(state, trackId);
  if (existing) return existing;
  const created = normalizeTrack({
    trackId,
    trackName,
    kind,
  });
  state.tracks.push(created);
  state.tracks.sort(compareTracks);
  return created;
}

function getTrackSnapshot(state: ReplayState, trackId: string): unknown {
  const track = getTrack(state, trackId);
  if (!track) return null;

  const regions = state.regions
    .filter((region) => region.trackId === trackId)
    .map((region) => ({
      regionId: region.regionId,
      sourceId: region.sourceId,
      startTimeSec: region.startTimeSec,
      offsetSec: region.offsetSec,
      durationSec: region.durationSec,
      gainDb: region.gainDb,
    }))
    .sort(compareRegions);

  const automation = state.automation
    .filter((lane) => lane.trackId === trackId)
    .map((lane) => ({
      laneId: lane.laneId,
      parameter: lane.parameter,
      points: [...lane.points].sort(compareAutomationPoints),
    }))
    .sort(compareAutomationLanes);

  return {
    trackId: track.trackId,
    trackName: track.trackName,
    kind: track.kind,
    gainDb: track.gainDb,
    pan: track.pan,
    muted: track.muted,
    solo: track.solo,
    limiterThresholdDb: track.limiterThresholdDb,
    normalizedTargetLUFS: track.normalizedTargetLUFS,
    dcRemovalHz: track.dcRemovalHz,
    appliedProposalIds: track.appliedProposalIds,
    regions,
    automation,
  };
}

function updateTrackHash(state: ReplayState, trackId: string): void {
  const track = getTrack(state, trackId);
  if (!track) return;
  track.trackStateHash = deterministicId('track-state', getTrackSnapshot(state, trackId));
}

function updateAllTrackHashes(state: ReplayState): void {
  for (const track of state.tracks) {
    updateTrackHash(state, track.trackId);
  }
}

function canonicalizeProposalSequence(proposals: APLProposal[]): unknown[] {
  return proposals.map((proposal, index) => ({
    index,
    proposalId: proposal.proposalId,
    trackId: proposal.trackId,
    trackName: proposal.trackName,
    action: {
      type: proposal.action.type,
      description: proposal.action.description,
      parameters: proposal.action.parameters,
    },
    evidence: proposal.evidence,
    confidence: proposal.confidence,
    provenance: proposal.provenance,
  }));
}

function getParameterString(params: Record<string, unknown>, key: string, fallback: string): string {
  return toStringValue(params[key], fallback);
}

function applyProposalToState(state: ReplayState, proposal: APLProposal): string[] {
  const params = proposal.action.parameters || {};
  const fallbackTrackId = proposal.trackId || 'track-main';
  const fallbackTrackName = proposal.trackName || fallbackTrackId;
  const impactedTrackIds = new Set<string>();

  const primaryTrack = ensureTrack(state, fallbackTrackId, fallbackTrackName);
  impactedTrackIds.add(primaryTrack.trackId);

  switch (proposal.action.type) {
    case 'GAIN_ADJUSTMENT': {
      const gainDelta = toNumber((params as Record<string, unknown>).gainDb ?? (params as Record<string, unknown>).value, 0);
      primaryTrack.gainDb = round6(primaryTrack.gainDb + gainDelta);
      break;
    }
    case 'NORMALIZATION': {
      const gainDelta = toNumber((params as Record<string, unknown>).gainDB ?? (params as Record<string, unknown>).gainDb, 0);
      if (gainDelta !== 0) {
        primaryTrack.gainDb = round6(primaryTrack.gainDb + gainDelta);
      }
      const target = (params as Record<string, unknown>).targetLUFS;
      if (target !== undefined) {
        primaryTrack.normalizedTargetLUFS = round6(toNumber(target, -14));
      }
      break;
    }
    case 'LIMITING': {
      const threshold = (params as Record<string, unknown>).threshold ?? (params as Record<string, unknown>).thresholdDb;
      primaryTrack.limiterThresholdDb = round6(toNumber(threshold, -0.1));
      break;
    }
    case 'DC_REMOVAL': {
      const frequency = (params as Record<string, unknown>).frequency ?? (params as Record<string, unknown>).cornerFrequency;
      primaryTrack.dcRemovalHz = round6(toNumber(frequency, 20));
      break;
    }
    case 'ADD_TRACK': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', deterministicId('track', { proposalId: proposal.proposalId }));
      const trackName = getParameterString(params as Record<string, unknown>, 'trackName', trackId);
      const trackType = getParameterString(params as Record<string, unknown>, 'trackType', 'audio');
      const kind: ReplayTrackKind = trackType === 'bus' || trackType === 'master' ? trackType : 'audio';
      ensureTrack(state, trackId, trackName, kind);
      impactedTrackIds.add(trackId);
      break;
    }
    case 'MOVE_REGION': {
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const region = state.regions.find((entry) => entry.regionId === regionId);
      if (region) {
        const originalTrackId = region.trackId;
        const targetTrackId = getParameterString(params as Record<string, unknown>, 'targetTrackId', originalTrackId);
        const targetTrackName = getParameterString(params as Record<string, unknown>, 'targetTrackName', targetTrackId);
        ensureTrack(state, targetTrackId, targetTrackName);
        region.trackId = targetTrackId;
        if ((params as Record<string, unknown>).startTimeSec !== undefined) {
          region.startTimeSec = round6(toNumber((params as Record<string, unknown>).startTimeSec, region.startTimeSec));
        }
        if ((params as Record<string, unknown>).offsetSec !== undefined) {
          region.offsetSec = round6(Math.max(0, toNumber((params as Record<string, unknown>).offsetSec, region.offsetSec)));
        }
        if ((params as Record<string, unknown>).durationSec !== undefined) {
          region.durationSec = round6(Math.max(0, toNumber((params as Record<string, unknown>).durationSec, region.durationSec)));
        }
        state.regions.sort(compareRegions);
        impactedTrackIds.add(originalTrackId);
        impactedTrackIds.add(targetTrackId);
      }
      break;
    }
    case 'SPLIT_REGION': {
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const splitTimeSec = toNumber((params as Record<string, unknown>).splitTimeSec, Number.NaN);
      const region = state.regions.find((entry) => entry.regionId === regionId);
      if (region && Number.isFinite(splitTimeSec)) {
        const regionStart = region.startTimeSec;
        const regionEnd = round6(region.startTimeSec + region.durationSec);
        if (splitTimeSec > regionStart && splitTimeSec < regionEnd) {
          const leftDuration = round6(splitTimeSec - regionStart);
          const rightDuration = round6(regionEnd - splitTimeSec);
          region.durationSec = leftDuration;
          const splitRegionId = getParameterString(
            params as Record<string, unknown>,
            'newRegionId',
            `${region.regionId}-split-${proposal.proposalId}`
          );
          const rightRegion = normalizeRegion({
            regionId: splitRegionId,
            trackId: region.trackId,
            sourceId: region.sourceId,
            startTimeSec: splitTimeSec,
            offsetSec: round6(region.offsetSec + leftDuration),
            durationSec: rightDuration,
            gainDb: region.gainDb,
          });
          state.regions.push(rightRegion);
          state.regions.sort(compareRegions);
          impactedTrackIds.add(region.trackId);
        }
      }
      break;
    }
    case 'SET_AUTOMATION_POINT': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const parameter = getParameterString(params as Record<string, unknown>, 'parameter', 'volumeDb');
      const timeSec = round6(toNumber((params as Record<string, unknown>).timeSec, 0));
      const value = round6(toNumber((params as Record<string, unknown>).value, 0));
      const laneId = getParameterString(params as Record<string, unknown>, 'laneId', `${trackId}:${parameter}`);
      const pointId = getParameterString(
        params as Record<string, unknown>,
        'pointId',
        deterministicId('auto-pt', { laneId, timeSec, value })
      );

      ensureTrack(state, trackId, getParameterString(params as Record<string, unknown>, 'trackName', trackId));
      let lane = state.automation.find((entry) => entry.laneId === laneId);
      if (!lane) {
        lane = { laneId, trackId, parameter, points: [] };
        state.automation.push(lane);
      }

      const existingIdx = lane.points.findIndex((point) => point.pointId === pointId || point.timeSec === timeSec);
      const nextPoint: ReplayAutomationPoint = {
        pointId,
        timeSec,
        value,
        curve: getParameterString(params as Record<string, unknown>, 'curve', 'linear') as ReplayAutomationPoint['curve'],
      };
      if (existingIdx >= 0) {
        lane.points[existingIdx] = nextPoint;
      } else {
        lane.points.push(nextPoint);
      }
      lane.points.sort(compareAutomationPoints);
      state.automation.sort(compareAutomationLanes);
      impactedTrackIds.add(trackId);
      break;
    }
    default:
      break;
  }

  primaryTrack.appliedProposalIds.push(proposal.proposalId);
  updateAllTrackHashes(state);
  return Array.from(impactedTrackIds).sort();
}

export async function runDeterministicReplay(
  baseState: ReplayState,
  proposals: APLProposal[],
  partialContext: Partial<DeterministicReplayContext> = {}
): Promise<DeterministicReplayResult> {
  const context: DeterministicReplayContext = {
    ...DEFAULT_REPLAY_CONTEXT,
    ...partialContext,
  };

  const replayState = normalizeReplayState(baseState, context);
  const canonicalBaseState = stableStringify(replayState);
  const canonicalProposalSequence = stableStringify(canonicalizeProposalSequence(proposals));
  const baseStateHash = await sha256Hex(canonicalBaseState);
  const aplSequenceHash = await sha256Hex(canonicalProposalSequence);
  const inputDigest = await sha256Hex(`${baseStateHash}:${aplSequenceHash}`);

  const rng = createSeededRng(context.seed);
  const events: ReplayEvent[] = [];

  proposals.forEach((proposal, index) => {
    const preTrackId = proposal.trackId || 'track-main';
    ensureTrack(replayState, preTrackId, proposal.trackName || preTrackId);
    const beforeTrackHash = getTrack(replayState, preTrackId)?.trackStateHash || '';

    const impactedTrackIds = applyProposalToState(replayState, proposal);
    const eventTrackId = impactedTrackIds[0] || preTrackId;
    const afterTrackHash = getTrack(replayState, eventTrackId)?.trackStateHash || '';

    const entropy = Math.floor(rng() * 0xffffffff);
    const eventId = `evt-${index.toString().padStart(3, '0')}-${entropy.toString(16).padStart(8, '0')}`;
    const timestamp = context.clockStartMs + index * context.clockStepMs;
    events.push({
      index,
      eventId,
      timestamp,
      proposalId: proposal.proposalId,
      actionType: proposal.action.type,
      trackId: eventTrackId,
      beforeTrackHash,
      afterTrackHash,
    });
  });

  const outputStateHash = await sha256Hex(stableStringify(replayState));
  const auditArtifact: ReplayAuditArtifact = {
    replayVersion: 'esl-replay-v1',
    engineVersion: context.engineVersion,
    seed: context.seed,
    workspaceId: context.workspaceId,
    inputDigest,
    outputStateHash,
    eventCount: events.length,
    events,
  };

  return {
    baseStateHash,
    aplSequenceHash,
    outputStateHash,
    outputState: replayState,
    auditArtifact,
  };
}
