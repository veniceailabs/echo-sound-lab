import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { deterministicId, sha256Hex, stableStringify } from './deterministicJson';
import { EchoPluginInstance } from './plugins/echoPlugin';
import { pluginRegistry } from './plugins/pluginRegistry';

export type ReplayTrackKind = 'audio' | 'midi' | 'bus' | 'master';
export type ReplayPluginInstance = EchoPluginInstance;

export interface ReplayTrackSend {
  sendId: string;
  targetTrackId: string;
  levelDb: number;
  preFader: boolean;
  enabled: boolean;
  mode?: 'aux' | 'sidechain';
}

export interface ReplayTrackState {
  trackId: string;
  trackName: string;
  kind: ReplayTrackKind;
  groupId?: string | null;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  limiterThresholdDb: number | null;
  normalizedTargetLUFS: number | null;
  dcRemovalHz: number | null;
  inserts?: ReplayPluginInstance[];
  outputBusId?: string | null;
  sends?: ReplayTrackSend[];
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
  gainDb?: number;
  compLaneId?: string | null;
  compTakeIndex?: number | null;
  fadeInSec?: number | null;
  fadeOutSec?: number | null;
}

export interface ReplayMidiNote {
  noteId: string;
  trackId: string;
  startTimeSec: number;
  durationSec: number;
  pitch: number;
  velocity: number;
  channel?: number | null;
}

export interface ReplayTrackGroup {
  groupId: string;
  name: string;
  color: string;
  trackIds: string[];
}

export interface ReplayMarker {
  id: string;
  timeSec: number;
  label: string;
  color: string;
  note?: string;
}

export interface ReplayCompLane {
  laneId: string;
  trackId: string;
  name: string;
  regionIds: string[];
  activeRegionId: string;
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
  midiNotes?: ReplayMidiNote[];
  automation: ReplayAutomationLane[];
  trackGroups?: ReplayTrackGroup[];
  markers?: ReplayMarker[];
  compLanes?: ReplayCompLane[];
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

function toBoolean(input: unknown, fallback = false): boolean {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return input !== 0;
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') return false;
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

function compareTracks(a: ReplayTrackState, b: ReplayTrackState): number {
  return a.trackId.localeCompare(b.trackId);
}

function compareTrackGroups(a: ReplayTrackGroup, b: ReplayTrackGroup): number {
  return a.groupId.localeCompare(b.groupId);
}

function compareRegions(a: ReplayRegionState, b: ReplayRegionState): number {
  if (a.startTimeSec !== b.startTimeSec) return a.startTimeSec - b.startTimeSec;
  return a.regionId.localeCompare(b.regionId);
}

function compareMidiNotes(a: ReplayMidiNote, b: ReplayMidiNote): number {
  if (a.startTimeSec !== b.startTimeSec) return a.startTimeSec - b.startTimeSec;
  if (a.pitch !== b.pitch) return a.pitch - b.pitch;
  return a.noteId.localeCompare(b.noteId);
}

function compareAutomationPoints(a: ReplayAutomationPoint, b: ReplayAutomationPoint): number {
  if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
  return a.pointId.localeCompare(b.pointId);
}

function compareAutomationLanes(a: ReplayAutomationLane, b: ReplayAutomationLane): number {
  return a.laneId.localeCompare(b.laneId);
}

function compareMarkers(a: ReplayMarker, b: ReplayMarker): number {
  if (a.timeSec !== b.timeSec) return a.timeSec - b.timeSec;
  return a.id.localeCompare(b.id);
}

function compareCompLanes(a: ReplayCompLane, b: ReplayCompLane): number {
  return a.laneId.localeCompare(b.laneId);
}

function normalizeTrack(input: Partial<ReplayTrackState> & { trackId: string }): ReplayTrackState {
  const rawInserts = Array.isArray(input.inserts) ? input.inserts : [];
  const inserts = rawInserts.map((insert, index) => ({
    instanceId: insert.instanceId || deterministicId('plugin-inst', { trackId: input.trackId, index }),
    manifestId: insert.manifestId,
    enabled: toBoolean(insert.enabled, true),
    mix: round6(Math.max(0, Math.min(1, toNumber(insert.mix, 1)))),
    parameters: { ...(insert.parameters || {}) },
  }));
  const rawSends = Array.isArray(input.sends) ? input.sends : [];
  const sends: ReplayTrackSend[] = rawSends.map((send, index): ReplayTrackSend => ({
    sendId: send.sendId || deterministicId('send', { trackId: input.trackId, index }),
    targetTrackId: send.targetTrackId || 'master',
    levelDb: round6(toNumber(send.levelDb, -12)),
    preFader: toBoolean(send.preFader, false),
    enabled: toBoolean(send.enabled, true),
    mode: send.mode === 'sidechain' ? 'sidechain' : 'aux',
  })).sort((left, right) => left.sendId.localeCompare(right.sendId));

  return {
    trackId: input.trackId,
    trackName: input.trackName || input.trackId,
    kind: (input.kind || 'audio') as ReplayTrackKind,
    groupId: input.groupId ?? null,
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
    inserts,
    outputBusId: input.outputBusId ?? null,
    sends,
    appliedProposalIds: Array.isArray(input.appliedProposalIds) ? [...input.appliedProposalIds] : [],
    trackStateHash: '',
  };
}

function normalizeMidiNote(input: Partial<ReplayMidiNote> & { noteId: string; trackId: string }): ReplayMidiNote {
  return {
    noteId: input.noteId,
    trackId: input.trackId,
    startTimeSec: round6(Math.max(0, toNumber(input.startTimeSec, 0))),
    durationSec: round6(Math.max(0.01, toNumber(input.durationSec, 0.5))),
    pitch: Math.max(0, Math.min(127, Math.round(toNumber(input.pitch, 60)))),
    velocity: Math.max(0, Math.min(127, Math.round(toNumber(input.velocity, 96)))),
    channel: input.channel === null || input.channel === undefined ? null : Math.max(0, Math.min(15, Math.round(toNumber(input.channel, 0)))),
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
    compLaneId: input.compLaneId ?? null,
    compTakeIndex: input.compTakeIndex ?? null,
    fadeInSec: input.fadeInSec === null || input.fadeInSec === undefined ? null : round6(Math.max(0, toNumber(input.fadeInSec, 0))),
    fadeOutSec: input.fadeOutSec === null || input.fadeOutSec === undefined ? null : round6(Math.max(0, toNumber(input.fadeOutSec, 0))),
  };
}

function normalizeTrackGroup(input: Partial<ReplayTrackGroup> & { groupId: string }): ReplayTrackGroup {
  return {
    groupId: input.groupId,
    name: input.name || input.groupId,
    color: input.color || '#38bdf8',
    trackIds: Array.isArray(input.trackIds) ? [...new Set(input.trackIds)] : [],
  };
}

function normalizeMarker(input: Partial<ReplayMarker> & { id: string }): ReplayMarker {
  return {
    id: input.id,
    timeSec: round6(toNumber(input.timeSec, 0)),
    label: input.label || input.id,
    color: input.color || 'cyan',
    note: input.note || undefined,
  };
}

function normalizeCompLane(input: Partial<ReplayCompLane> & { laneId: string; trackId: string }): ReplayCompLane {
  return {
    laneId: input.laneId,
    trackId: input.trackId,
    name: input.name || input.laneId,
    regionIds: Array.isArray(input.regionIds) ? [...new Set(input.regionIds)] : [],
    activeRegionId: input.activeRegionId || input.regionIds?.[0] || '',
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
    midiNotes: Array.isArray((cloned as ReplayState).midiNotes)
      ? (cloned as ReplayState).midiNotes.map((note) => normalizeMidiNote(note as Partial<ReplayMidiNote> & { noteId: string; trackId: string }))
      : [],
    automation: Array.isArray((cloned as ReplayState).automation)
      ? (cloned as ReplayState).automation.map((lane) => normalizeAutomationLane(lane))
      : [],
    trackGroups: Array.isArray((cloned as ReplayState).trackGroups)
      ? (cloned as ReplayState).trackGroups.map((group) => normalizeTrackGroup(group))
      : [],
    markers: Array.isArray((cloned as ReplayState).markers)
      ? (cloned as ReplayState).markers.map((marker) => normalizeMarker(marker))
      : [],
    compLanes: Array.isArray((cloned as ReplayState).compLanes)
      ? (cloned as ReplayState).compLanes.map((lane) => normalizeCompLane(lane))
      : [],
    metadata: (cloned as ReplayState).metadata ? { ...(cloned as ReplayState).metadata } : undefined,
  };

  normalized.tracks.sort(compareTracks);
  normalized.regions.sort(compareRegions);
  normalized.midiNotes?.sort(compareMidiNotes);
  normalized.automation.sort(compareAutomationLanes);
  normalized.trackGroups?.sort(compareTrackGroups);
  normalized.markers?.sort(compareMarkers);
  normalized.compLanes?.sort(compareCompLanes);

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

function ensureTrackGroup(state: ReplayState, groupId: string, name?: string, color?: string): ReplayTrackGroup {
  state.trackGroups ||= [];
  const existing = state.trackGroups.find((group) => group.groupId === groupId);
  if (existing) {
    if (name) existing.name = name;
    if (color) existing.color = color;
    return existing;
  }
  const created = normalizeTrackGroup({ groupId, name, color, trackIds: [] });
  state.trackGroups.push(created);
  state.trackGroups.sort(compareTrackGroups);
  return created;
}

function ensureCompLane(state: ReplayState, laneId: string, trackId: string, name?: string): ReplayCompLane {
  state.compLanes ||= [];
  const existing = state.compLanes.find((lane) => lane.laneId === laneId);
  if (existing) {
    if (name) existing.name = name;
    existing.trackId = trackId;
    return existing;
  }
  const created = normalizeCompLane({ laneId, trackId, name, regionIds: [], activeRegionId: '' });
  state.compLanes.push(created);
  state.compLanes.sort(compareCompLanes);
  return created;
}

function getTrackSnapshot(state: ReplayState, trackId: string): unknown {
  const track = getTrack(state, trackId);
  if (!track) return null;

  const regions = state.regions
    .filter((region) => region.trackId === trackId)
    .map((region) => ({
      regionId: region.regionId,
      trackId,
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

  const midiNotes = (state.midiNotes || [])
    .filter((note) => note.trackId === trackId)
    .map((note) => ({
      noteId: note.noteId,
      trackId: note.trackId,
      startTimeSec: note.startTimeSec,
      durationSec: note.durationSec,
      pitch: note.pitch,
      velocity: note.velocity,
      channel: note.channel ?? null,
    }))
    .sort(compareMidiNotes);

  const markers = (state.markers || [])
    .filter((marker) => marker.timeSec >= 0)
    .map((marker) => ({
      id: marker.id,
      timeSec: marker.timeSec,
      label: marker.label,
      color: marker.color,
      note: marker.note,
    }))
    .sort(compareMarkers);

  const trackGroup = track.groupId
    ? state.trackGroups?.find((group) => group.groupId === track.groupId) ?? null
    : null;

  const compLanes = (state.compLanes || [])
    .filter((lane) => lane.trackId === trackId)
    .map((lane) => ({
      laneId: lane.laneId,
      trackId: lane.trackId,
      name: lane.name,
      regionIds: [...lane.regionIds].sort(),
      activeRegionId: lane.activeRegionId,
    }))
    .sort(compareCompLanes);

  const inserts = [...(track.inserts || [])].map((insert) => ({
    instanceId: insert.instanceId,
    manifestId: insert.manifestId,
    enabled: insert.enabled,
    mix: round6(Math.max(0, Math.min(1, toNumber(insert.mix, 1)))),
    parameters: { ...(insert.parameters || {}) },
  }));
  const sends = [...(track.sends || [])].map((send) => ({
    sendId: send.sendId,
    targetTrackId: send.targetTrackId,
    levelDb: round6(toNumber(send.levelDb, -12)),
    preFader: Boolean(send.preFader),
    enabled: send.enabled !== false,
  })).sort((left, right) => left.sendId.localeCompare(right.sendId));

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
    groupId: track.groupId ?? null,
    outputBusId: track.outputBusId ?? null,
    inserts,
    sends,
    appliedProposalIds: track.appliedProposalIds,
    regions,
    automation,
    markers,
    trackGroup,
    compLanes,
    midiNotes,
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
      const kind: ReplayTrackKind = trackType === 'bus' || trackType === 'master' || trackType === 'midi' ? trackType : 'audio';
      const groupId = getParameterString(params as Record<string, unknown>, 'groupId', '');
      ensureTrack(state, trackId, trackName, kind);
      if (groupId) {
        ensureTrackGroup(
          state,
          groupId,
          getParameterString(params as Record<string, unknown>, 'groupName', groupId),
          getParameterString(params as Record<string, unknown>, 'groupColor', '#38bdf8')
        );
        const track = getTrack(state, trackId);
        if (track) {
          track.groupId = groupId;
          const group = ensureTrackGroup(state, groupId);
          if (!group.trackIds.includes(trackId)) {
            group.trackIds.push(trackId);
            group.trackIds.sort();
          }
        }
      }
      impactedTrackIds.add(trackId);
      break;
    }
    case 'ADD_MIDI_NOTE':
    case 'SET_MIDI_NOTE': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const trackName = getParameterString(params as Record<string, unknown>, 'trackName', trackId);
      const trackType = getParameterString(params as Record<string, unknown>, 'trackType', 'midi');
      ensureTrack(state, trackId, trackName, trackType === 'midi' ? 'midi' : primaryTrack.kind);
      const noteId = getParameterString(
        params as Record<string, unknown>,
        'noteId',
        deterministicId('midi-note', {
          trackId,
          pitch: toNumber((params as Record<string, unknown>).pitch, 60),
          startTimeSec: round6(toNumber((params as Record<string, unknown>).startTimeSec, 0)),
        })
      );
      const nextNote = normalizeMidiNote({
        noteId,
        trackId,
        startTimeSec: toNumber((params as Record<string, unknown>).startTimeSec, 0),
        durationSec: toNumber((params as Record<string, unknown>).durationSec, 0.5),
        pitch: toNumber((params as Record<string, unknown>).pitch, 60),
        velocity: toNumber((params as Record<string, unknown>).velocity, 96),
        channel: (params as Record<string, unknown>).channel as number | null | undefined,
      });
      state.midiNotes = (state.midiNotes || []).filter((note) => note.noteId !== noteId);
      state.midiNotes.push(nextNote);
      state.midiNotes.sort(compareMidiNotes);
      impactedTrackIds.add(trackId);
      break;
    }
    case 'REMOVE_MIDI_NOTE': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const noteId = getParameterString(params as Record<string, unknown>, 'noteId', '');
      if (noteId) {
        state.midiNotes = (state.midiNotes || []).filter((note) => note.noteId !== noteId);
        impactedTrackIds.add(trackId);
      }
      break;
    }
    case 'ADD_REGION': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const trackName = getParameterString(params as Record<string, unknown>, 'trackName', trackId);
      ensureTrack(state, trackId, trackName);

      const regionId = getParameterString(
        params as Record<string, unknown>,
        'regionId',
        deterministicId('region', { proposalId: proposal.proposalId, trackId })
      );
      const sourceId = getParameterString(
        params as Record<string, unknown>,
        'assetId',
        getParameterString(params as Record<string, unknown>, 'sourceId', regionId)
      );
      const startTimeSec = round6(Math.max(0, toNumber((params as Record<string, unknown>).startTimeSec, 0)));
      const offsetSec = round6(Math.max(0, toNumber((params as Record<string, unknown>).offsetSec, 0)));
      const durationSec = round6(Math.max(0.001, toNumber((params as Record<string, unknown>).durationSec, 1)));
      const gainDb = round6(toNumber((params as Record<string, unknown>).gainDb, 0));
      const compLaneId = getParameterString(params as Record<string, unknown>, 'compLaneId', '');
      const compTakeIndex = params && typeof (params as Record<string, unknown>).compTakeIndex === 'number'
        ? Math.trunc((params as Record<string, unknown>).compTakeIndex as number)
        : undefined;

      state.regions = state.regions.filter((region) => region.regionId !== regionId);
      state.regions.push(normalizeRegion({
        regionId,
        trackId,
        sourceId,
        startTimeSec,
        offsetSec,
        durationSec,
        gainDb,
        compLaneId: compLaneId || null,
        compTakeIndex: compTakeIndex ?? null,
      }));
      state.regions.sort(compareRegions);
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
    case 'TRIM_REGION': {
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const side = getParameterString(params as Record<string, unknown>, 'side', 'right');
      const amountSec = Math.max(0, toNumber((params as Record<string, unknown>).amountSec, 0));
      const region = state.regions.find((entry) => entry.regionId === regionId);
      if (region && amountSec > 0) {
        const trimAmount = Math.min(amountSec, Math.max(0, region.durationSec - 0.001));
        if (side === 'left') {
          region.startTimeSec = round6(region.startTimeSec + trimAmount);
          region.offsetSec = round6(region.offsetSec + trimAmount);
        }
        region.durationSec = round6(Math.max(0.001, region.durationSec - trimAmount));
        impactedTrackIds.add(region.trackId);
      }
      break;
    }
    case 'SLIP_REGION': {
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const amountSec = toNumber((params as Record<string, unknown>).amountSec, 0);
      const region = state.regions.find((entry) => entry.regionId === regionId);
      if (region && amountSec !== 0) {
        region.offsetSec = round6(Math.max(0, region.offsetSec + amountSec));
        impactedTrackIds.add(region.trackId);
      }
      break;
    }
    case 'APPLY_CROSSFADE': {
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const region = state.regions.find((entry) => entry.regionId === regionId);
      if (region) {
        region.fadeInSec = round6(Math.max(0, toNumber((params as Record<string, unknown>).fadeInSec, region.fadeInSec ?? 0)));
        region.fadeOutSec = round6(Math.max(0, toNumber((params as Record<string, unknown>).fadeOutSec, region.fadeOutSec ?? 0)));
        impactedTrackIds.add(region.trackId);
      }
      break;
    }
    case 'SET_REGION_GAIN': {
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const nextGainDb = round6(toNumber((params as Record<string, unknown>).gainDb, 0));
      if (!regionId) break;
      state.regions = state.regions.map((region) => (
        region.regionId === regionId
          ? { ...region, gainDb: nextGainDb }
          : region
      ));
      impactedTrackIds.add(getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId));
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
          compLaneId: region.compLaneId ?? null,
          compTakeIndex: region.compTakeIndex ?? null,
        });
          state.regions.push(rightRegion);
          state.regions.sort(compareRegions);
          impactedTrackIds.add(region.trackId);
        }
      }
      break;
    }
    case 'SET_TRACK_GROUP': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const groupId = getParameterString(params as Record<string, unknown>, 'groupId', '');
      const trackName = getParameterString(params as Record<string, unknown>, 'trackName', trackId);
      const track = ensureTrack(state, trackId, trackName);
      if (!groupId) {
        track.groupId = null;
        impactedTrackIds.add(trackId);
        break;
      }
      const group = ensureTrackGroup(
        state,
        groupId,
        getParameterString(params as Record<string, unknown>, 'groupName', groupId),
        getParameterString(params as Record<string, unknown>, 'groupColor', '#38bdf8')
      );
      track.groupId = group.groupId;
      if (!group.trackIds.includes(trackId)) {
        group.trackIds.push(trackId);
        group.trackIds.sort();
      }
      impactedTrackIds.add(trackId);
      break;
    }
    case 'ADD_MARKER': {
      const markerId = getParameterString(params as Record<string, unknown>, 'markerId', deterministicId('marker', { proposalId: proposal.proposalId }));
      const marker = normalizeMarker({
        id: markerId,
        timeSec: toNumber((params as Record<string, unknown>).timeSec, 0),
        label: getParameterString(params as Record<string, unknown>, 'label', markerId),
        color: getParameterString(params as Record<string, unknown>, 'color', 'cyan'),
        note: getParameterString(params as Record<string, unknown>, 'note', ''),
      });
      state.markers = (state.markers || []).filter((entry) => entry.id !== marker.id);
      state.markers.push(marker);
      state.markers.sort(compareMarkers);
      break;
    }
    case 'UPDATE_MARKER': {
      const markerId = getParameterString(params as Record<string, unknown>, 'markerId', '');
      if (!markerId) break;
      state.markers = (state.markers || []).map((marker) => {
        if (marker.id !== markerId) return marker;
        return normalizeMarker({
          id: markerId,
          timeSec: params.timeSec !== undefined ? toNumber(params.timeSec, marker.timeSec) : marker.timeSec,
          label: getParameterString(params as Record<string, unknown>, 'label', marker.label),
          color: getParameterString(params as Record<string, unknown>, 'color', marker.color),
          note: getParameterString(params as Record<string, unknown>, 'note', marker.note || ''),
        });
      });
      state.markers.sort(compareMarkers);
      break;
    }
    case 'REMOVE_MARKER': {
      const markerId = getParameterString(params as Record<string, unknown>, 'markerId', '');
      if (!markerId) break;
      state.markers = (state.markers || []).filter((marker) => marker.id !== markerId);
      break;
    }
    case 'CREATE_COMP_LANE': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const laneId = getParameterString(params as Record<string, unknown>, 'laneId', deterministicId('comp-lane', { proposalId: proposal.proposalId, trackId }));
      const laneName = getParameterString(params as Record<string, unknown>, 'name', laneId);
      const regionIds = Array.isArray(params.regionIds)
        ? (params.regionIds as unknown[]).map((regionId) => String(regionId)).filter(Boolean)
        : [];
      const activeRegionId = getParameterString(params as Record<string, unknown>, 'activeRegionId', regionIds[0] || '');
      const lane = ensureCompLane(state, laneId, trackId, laneName);
      lane.regionIds = [...new Set(regionIds)];
      lane.activeRegionId = activeRegionId;
      lane.trackId = trackId;
      for (const region of state.regions) {
        if (lane.regionIds.includes(region.regionId)) {
          region.compLaneId = lane.laneId;
          region.compTakeIndex = lane.regionIds.indexOf(region.regionId);
        }
      }
      impactedTrackIds.add(trackId);
      break;
    }
    case 'SET_COMP_LANE_ACTIVE': {
      const laneId = getParameterString(params as Record<string, unknown>, 'laneId', '');
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const lane = state.compLanes?.find((entry) => entry.laneId === laneId);
      if (lane && regionId) {
        lane.activeRegionId = regionId;
        lane.regionIds = Array.from(new Set([regionId, ...lane.regionIds]));
        for (const region of state.regions) {
          if (region.compLaneId === laneId) {
            region.compTakeIndex = lane.regionIds.indexOf(region.regionId);
          }
        }
        impactedTrackIds.add(lane.trackId);
      }
      break;
    }
    case 'RENAME_COMP_LANE': {
      const laneId = getParameterString(params as Record<string, unknown>, 'laneId', '');
      const name = getParameterString(params as Record<string, unknown>, 'name', '');
      const lane = state.compLanes?.find((entry) => entry.laneId === laneId);
      if (lane && name) {
        lane.name = name;
        impactedTrackIds.add(lane.trackId);
      }
      break;
    }
    case 'REORDER_COMP_LANE_TAKE': {
      const laneId = getParameterString(params as Record<string, unknown>, 'laneId', '');
      const regionId = getParameterString(params as Record<string, unknown>, 'regionId', '');
      const direction = getParameterString(params as Record<string, unknown>, 'direction', 'up');
      const lane = state.compLanes?.find((entry) => entry.laneId === laneId);
      if (lane && regionId && lane.regionIds.includes(regionId)) {
        const currentIndex = lane.regionIds.indexOf(regionId);
        const nextIndex = direction === 'down' ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex >= 0 && nextIndex < lane.regionIds.length) {
          const reordered = [...lane.regionIds];
          reordered.splice(currentIndex, 1);
          reordered.splice(nextIndex, 0, regionId);
          lane.regionIds = reordered;
          lane.activeRegionId = lane.activeRegionId || reordered[0] || '';
          for (const region of state.regions) {
            if (region.compLaneId === laneId) {
              region.compTakeIndex = lane.regionIds.indexOf(region.regionId);
            }
          }
          impactedTrackIds.add(lane.trackId);
        }
      }
      break;
    }
    case 'COLLAPSE_COMP_LANE_TO_ACTIVE': {
      const laneId = getParameterString(params as Record<string, unknown>, 'laneId', '');
      const lane = state.compLanes?.find((entry) => entry.laneId === laneId);
      if (lane && lane.activeRegionId) {
        lane.regionIds = [lane.activeRegionId];
        for (const region of state.regions) {
          if (region.compLaneId === laneId) {
            region.compTakeIndex = region.regionId === lane.activeRegionId ? 0 : null;
          }
        }
        impactedTrackIds.add(lane.trackId);
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
    case 'SET_AUTOMATION_MODE': {
      const mode = getParameterString(params as Record<string, unknown>, 'mode', 'read');
      state.metadata = {
        ...(state.metadata || {}),
        automationMode: mode,
      };
      impactedTrackIds.add(primaryTrack.trackId);
      break;
    }
    case 'ADD_PLUGIN': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const track = ensureTrack(state, trackId, getParameterString(params as Record<string, unknown>, 'trackName', trackId));
      const manifestId = getParameterString(params as Record<string, unknown>, 'manifestId', '');
      if (!manifestId) break;

      try {
        pluginRegistry.ensureManifest(manifestId);
      } catch {
        break;
      }

      const instanceId = getParameterString(
        params as Record<string, unknown>,
        'instanceId',
        deterministicId('plugin-inst', { proposalId: proposal.proposalId, trackId, manifestId, index: (track.inserts || []).length })
      );
      const enabled = toBoolean((params as Record<string, unknown>).enabled, true);
      const mix = round6(Math.max(0, Math.min(1, toNumber((params as Record<string, unknown>).mix, 1))));
      const rawParams = ((params as Record<string, unknown>).parameters || {}) as Record<string, unknown>;
      const sanitizedParameters = pluginRegistry.sanitizeParameters(manifestId, rawParams);

      track.inserts = (track.inserts || []).filter((entry) => entry.instanceId !== instanceId);
      track.inserts.push({
        instanceId,
        manifestId,
        enabled,
        mix,
        parameters: sanitizedParameters,
      });
      impactedTrackIds.add(trackId);
      break;
    }
    case 'SET_TRACK_ROUTING': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const outputBusId = getParameterString(params as Record<string, unknown>, 'outputBusId', '');
      const track = getTrack(state, trackId);
      if (track) {
        track.outputBusId = outputBusId || null;
        impactedTrackIds.add(trackId);
      }
      break;
    }
    case 'SET_TRACK_SEND': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const sendId = getParameterString(params as Record<string, unknown>, 'sendId', '');
      const targetTrackId = getParameterString(params as Record<string, unknown>, 'targetTrackId', 'master');
      const levelDb = round6(toNumber((params as Record<string, unknown>).levelDb, -12));
      const preFader = toBoolean((params as Record<string, unknown>).preFader, false);
      const enabled = toBoolean((params as Record<string, unknown>).enabled, true);
      const mode = getParameterString(params as Record<string, unknown>, 'mode', 'aux');
      const track = getTrack(state, trackId);
      if (track) {
        const nextSendId = sendId || deterministicId('send', { trackId, targetTrackId, index: (track.sends || []).length });
        const sends = (track.sends || []).filter((send) => send.sendId !== nextSendId);
        sends.push({
          sendId: nextSendId,
          targetTrackId,
          levelDb,
          preFader,
          enabled,
          mode: mode === 'sidechain' ? 'sidechain' : 'aux',
        });
        track.sends = sends.sort((left, right) => left.sendId.localeCompare(right.sendId));
        impactedTrackIds.add(trackId);
      }
      break;
    }
    case 'REMOVE_TRACK_SEND': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const sendId = getParameterString(params as Record<string, unknown>, 'sendId', '');
      const track = getTrack(state, trackId);
      if (track && sendId) {
        track.sends = (track.sends || []).filter((send) => send.sendId !== sendId);
        impactedTrackIds.add(trackId);
      }
      break;
    }
    case 'REMOVE_PLUGIN': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const instanceId = getParameterString(params as Record<string, unknown>, 'instanceId', '');
      const track = getTrack(state, trackId);
      if (track && instanceId) {
        track.inserts = (track.inserts || []).filter((entry) => entry.instanceId !== instanceId);
        impactedTrackIds.add(trackId);
      }
      break;
    }
    case 'REORDER_PLUGIN': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const instanceId = getParameterString(params as Record<string, unknown>, 'instanceId', '');
      const toIndex = Math.trunc(toNumber((params as Record<string, unknown>).toIndex, 0));
      const track = getTrack(state, trackId);
      if (track && instanceId) {
        const inserts = [...(track.inserts || [])];
        const currentIndex = inserts.findIndex((entry) => entry.instanceId === instanceId);
        if (currentIndex >= 0) {
          const [plugin] = inserts.splice(currentIndex, 1);
          const boundedIndex = Math.max(0, Math.min(toIndex, inserts.length));
          inserts.splice(boundedIndex, 0, plugin);
          track.inserts = inserts;
          impactedTrackIds.add(trackId);
        }
      }
      break;
    }
    case 'SET_PLUGIN_PARAM': {
      const trackId = getParameterString(params as Record<string, unknown>, 'trackId', primaryTrack.trackId);
      const instanceId = getParameterString(params as Record<string, unknown>, 'instanceId', '');
      const paramId = getParameterString(params as Record<string, unknown>, 'paramId', '');
      const rawValue = (params as Record<string, unknown>).value;
      const track = getTrack(state, trackId);
      if (track && instanceId && paramId) {
        const plugin = (track.inserts || []).find((entry) => entry.instanceId === instanceId);
        if (plugin) {
          try {
            const sanitized = pluginRegistry.sanitizeParamValue(plugin.manifestId, paramId, rawValue);
            plugin.parameters = {
              ...plugin.parameters,
              [paramId]: sanitized,
            };
            impactedTrackIds.add(trackId);
          } catch {
            // Unknown manifest/parameter: deterministic no-op
          }
        }
      }
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
