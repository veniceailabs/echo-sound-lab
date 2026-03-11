import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { deterministicId, sha256Hex, stableStringify } from './deterministicJson';

export interface ReplayTrackState {
  trackId: string;
  trackName: string;
  gainDb: number;
  limiterThresholdDb: number | null;
  normalizedTargetLUFS: number | null;
  dcRemovalHz: number | null;
  appliedProposalIds: string[];
  trackStateHash: string;
}

export interface ReplayState {
  sessionId: string;
  workspaceId: string;
  tracks: Record<string, ReplayTrackState>;
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

function ensureTrack(state: ReplayState, trackId: string, trackName: string): ReplayTrackState {
  const existing = state.tracks[trackId];
  if (existing) return existing;
  const created: ReplayTrackState = {
    trackId,
    trackName,
    gainDb: 0,
    limiterThresholdDb: null,
    normalizedTargetLUFS: null,
    dcRemovalHz: null,
    appliedProposalIds: [],
    trackStateHash: '',
  };
  state.tracks[trackId] = created;
  return created;
}

function updateTrackHash(track: ReplayTrackState): void {
  track.trackStateHash = deterministicId('track-state', {
    trackId: track.trackId,
    gainDb: round6(track.gainDb),
    limiterThresholdDb: track.limiterThresholdDb,
    normalizedTargetLUFS: track.normalizedTargetLUFS,
    dcRemovalHz: track.dcRemovalHz,
    appliedProposalIds: track.appliedProposalIds,
  });
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

function cloneReplayState(baseState: ReplayState, context: DeterministicReplayContext): ReplayState {
  const cloned = JSON.parse(stableStringify(baseState)) as ReplayState;
  if (!cloned.workspaceId) {
    cloned.workspaceId = context.workspaceId;
  }
  if (!cloned.tracks) {
    cloned.tracks = {};
  }
  for (const track of Object.values(cloned.tracks)) {
    updateTrackHash(track);
  }
  return cloned;
}

function applyProposalToState(state: ReplayState, proposal: APLProposal): void {
  const trackId = proposal.trackId || 'track-main';
  const trackName = proposal.trackName || proposal.trackId || 'Main';
  const track = ensureTrack(state, trackId, trackName);
  const params = proposal.action.parameters || {};

  switch (proposal.action.type) {
    case 'GAIN_ADJUSTMENT': {
      const gainDelta = toNumber((params as Record<string, unknown>).gainDb ?? (params as Record<string, unknown>).value, 0);
      track.gainDb = round6(track.gainDb + gainDelta);
      break;
    }
    case 'NORMALIZATION': {
      const gainDelta = toNumber((params as Record<string, unknown>).gainDB ?? (params as Record<string, unknown>).gainDb, 0);
      if (gainDelta !== 0) {
        track.gainDb = round6(track.gainDb + gainDelta);
      }
      const target = (params as Record<string, unknown>).targetLUFS;
      if (target !== undefined) {
        track.normalizedTargetLUFS = round6(toNumber(target, -14));
      }
      break;
    }
    case 'LIMITING': {
      const threshold = (params as Record<string, unknown>).threshold ?? (params as Record<string, unknown>).thresholdDb;
      track.limiterThresholdDb = round6(toNumber(threshold, -0.1));
      break;
    }
    case 'DC_REMOVAL': {
      const frequency = (params as Record<string, unknown>).frequency ?? (params as Record<string, unknown>).cornerFrequency;
      track.dcRemovalHz = round6(toNumber(frequency, 20));
      break;
    }
    default:
      break;
  }

  track.appliedProposalIds.push(proposal.proposalId);
  updateTrackHash(track);
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

  const replayState = cloneReplayState(baseState, context);
  const canonicalBaseState = stableStringify(baseState);
  const canonicalProposalSequence = stableStringify(canonicalizeProposalSequence(proposals));
  const baseStateHash = await sha256Hex(canonicalBaseState);
  const aplSequenceHash = await sha256Hex(canonicalProposalSequence);
  const inputDigest = await sha256Hex(`${baseStateHash}:${aplSequenceHash}`);

  const rng = createSeededRng(context.seed);
  const events: ReplayEvent[] = [];

  proposals.forEach((proposal, index) => {
    const trackId = proposal.trackId || 'track-main';
    const trackBefore = ensureTrack(replayState, trackId, proposal.trackName || 'Main');
    const beforeTrackHash = trackBefore.trackStateHash;

    applyProposalToState(replayState, proposal);

    const trackAfter = replayState.tracks[trackId];
    const afterTrackHash = trackAfter.trackStateHash;

    const entropy = Math.floor(rng() * 0xffffffff);
    const eventId = `evt-${index.toString().padStart(3, '0')}-${entropy.toString(16).padStart(8, '0')}`;
    const timestamp = context.clockStartMs + index * context.clockStepMs;
    events.push({
      index,
      eventId,
      timestamp,
      proposalId: proposal.proposalId,
      actionType: proposal.action.type,
      trackId,
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
