import { deterministicId } from './deterministicJson';
import {
  buildTimelineReconformPlan,
  type TimelineReconformStrategy,
} from './timelineReconformService';
import type {
  ReplayAutomationLane,
  ReplayCompLane,
  ReplayMarker,
  ReplayRegionState,
  ReplayState,
  ReplayTrackGroup,
  ReplayTrackState,
} from './deterministicReplayService';

export type TimelineImportMode = 'replace' | 'merge';

export interface TimelineImportOptions {
  mode: TimelineImportMode;
  trackNamePrefix: string;
  importMarkers: boolean;
  importGroups: boolean;
  importCompLanes: boolean;
  importTempo: boolean;
  conformToCurrentTempo: boolean;
  importAutomation: boolean;
  mergeAutomationIntoExisting: boolean;
  reconformStrategy: TimelineReconformStrategy;
  anchorMarkerId: string | null;
  manualOffsetSeconds: number | null;
  trackMappings: TimelineTrackMapping[];
  offsetSeconds?: number;
}

export interface TimelineTrackMapping {
  importedTrackId: string;
  targetTrackId: string | null;
}

export interface TimelineTrackMappingSuggestion {
  importedTrackId: string;
  importedTrackName: string;
  importedTrackKind: string;
  targetTrackId: string | null;
  targetTrackName: string | null;
  confidence: number;
  reason: string;
}

export interface TimelineTempoMetadata {
  bpm: number | null;
  timeSignature: string | null;
  timeSignatureNumerator: number | null;
  timeSignatureDenominator: number | null;
}

export interface TimelineImportSummary {
  sessionId: string;
  workspaceId: string;
  tracks: number;
  regions: number;
  markers: number;
  groups: number;
  compLanes: number;
  automation: number;
}

export function summarizeTimelineState(state: ReplayState): TimelineImportSummary {
  return {
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    tracks: state.tracks.length,
    regions: state.regions.length,
    markers: (state.markers || []).length,
    groups: (state.trackGroups || []).length,
    compLanes: (state.compLanes || []).length,
    automation: state.automation.length,
  };
}

export function readTimelineTempoMetadata(metadata?: Record<string, unknown> | null): TimelineTempoMetadata {
  const bpmRaw = metadata?.tempoBpm ?? metadata?.bpm;
  const numeratorRaw = metadata?.timeSignatureNumerator;
  const denominatorRaw = metadata?.timeSignatureDenominator;
  const timeSignatureRaw = metadata?.timeSignature;

  const bpm = typeof bpmRaw === 'number' && Number.isFinite(bpmRaw)
    ? bpmRaw
    : typeof bpmRaw === 'string' && Number.isFinite(Number(bpmRaw))
      ? Number(bpmRaw)
      : null;
  const numerator = typeof numeratorRaw === 'number' && Number.isFinite(numeratorRaw)
    ? numeratorRaw
    : typeof numeratorRaw === 'string' && Number.isFinite(Number(numeratorRaw))
      ? Number(numeratorRaw)
      : null;
  const denominator = typeof denominatorRaw === 'number' && Number.isFinite(denominatorRaw)
    ? denominatorRaw
    : typeof denominatorRaw === 'string' && Number.isFinite(Number(denominatorRaw))
      ? Number(denominatorRaw)
      : null;
  const timeSignature = typeof timeSignatureRaw === 'string' && timeSignatureRaw.trim()
    ? timeSignatureRaw.trim()
    : numerator && denominator
      ? `${numerator}/${denominator}`
      : null;

  return {
    bpm,
    timeSignature,
    timeSignatureNumerator: numerator,
    timeSignatureDenominator: denominator,
  };
}

function cloneState(state: ReplayState): ReplayState {
  return JSON.parse(JSON.stringify(state)) as ReplayState;
}

function safePrefix(prefix: string): string {
  return prefix.trim() || 'Imported';
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenizeName(value: string): string[] {
  return normalizeName(value).split(/\s+/).filter(Boolean);
}

function scoreTrackMatch(importedTrack: ReplayTrackState, currentTrack: ReplayTrackState): { confidence: number; reason: string } {
  const importedName = normalizeName(importedTrack.trackName);
  const currentName = normalizeName(currentTrack.trackName);
  if (importedName && importedName === currentName) {
    return { confidence: 1, reason: 'Exact track name match' };
  }

  const importedTokens = new Set(tokenizeName(importedTrack.trackName));
  const currentTokens = tokenizeName(currentTrack.trackName);
  const overlap = currentTokens.filter((token) => importedTokens.has(token)).length;
  const coverage = currentTokens.length > 0 ? overlap / currentTokens.length : 0;
  const kindBoost = importedTrack.kind === currentTrack.kind ? 0.12 : 0;
  const prefixBoost = importedName && currentName && (importedName.startsWith(currentName) || currentName.startsWith(importedName)) ? 0.1 : 0;
  const confidence = Math.max(0, Math.min(1, coverage * 0.78 + kindBoost + prefixBoost));

  if (confidence >= 0.8) {
    return { confidence, reason: 'Strong name and kind overlap' };
  }
  if (confidence >= 0.5) {
    return { confidence, reason: 'Partial name overlap' };
  }
  if (currentTrack.kind === importedTrack.kind) {
    return { confidence, reason: 'Kind match only' };
  }
  return { confidence, reason: 'No strong match' };
}

export function buildTimelineTrackMappingSuggestions(
  currentTracks: ReplayTrackState[],
  importedTracks: ReplayTrackState[]
): TimelineTrackMappingSuggestion[] {
  return importedTracks.map((importedTrack) => {
    const candidates = currentTracks
      .map((candidate) => ({
        candidate,
        score: scoreTrackMatch(importedTrack, candidate),
      }))
      .sort((left, right) => right.score.confidence - left.score.confidence);
    const best = candidates[0];
    return {
      importedTrackId: importedTrack.trackId,
      importedTrackName: importedTrack.trackName,
      importedTrackKind: importedTrack.kind,
      targetTrackId: best && best.score.confidence >= 0.45 ? best.candidate.trackId : null,
      targetTrackName: best && best.score.confidence >= 0.45 ? best.candidate.trackName : null,
      confidence: best ? best.score.confidence : 0,
      reason: best ? best.score.reason : 'No current tracks available',
    };
  });
}

function buildTrackMappingLookup(mappings: TimelineTrackMapping[]): Map<string, string | null> {
  return new Map(mappings.map((mapping) => [mapping.importedTrackId, mapping.targetTrackId]));
}

function mapAutomationLaneId(prefix: string, lane: ReplayAutomationLane, trackId: string, suffix: string): string {
  return deterministicId('import-auto', { prefix, laneId: lane.laneId, trackId, parameter: lane.parameter, suffix }).slice(0, 16);
}

function mapTrackId(prefix: string, track: ReplayTrackState, index: number): string {
  return deterministicId('import-track', { prefix, trackId: track.trackId, index }).slice(0, 16);
}

function mapGroupId(prefix: string, groupId: string, index: number): string {
  return deterministicId('import-group', { prefix, groupId, index }).slice(0, 16);
}

function mapRegionId(prefix: string, region: ReplayRegionState, index: number): string {
  return deterministicId('import-region', { prefix, regionId: region.regionId, index }).slice(0, 16);
}

function mapMarkerId(prefix: string, marker: ReplayMarker, index: number): string {
  return deterministicId('import-marker', { prefix, markerId: marker.id, index }).slice(0, 16);
}

function mapCompLaneId(prefix: string, lane: ReplayCompLane, index: number): string {
  return deterministicId('import-comp-lane', { prefix, laneId: lane.laneId, index }).slice(0, 16);
}

function scaleTime(value: number, ratio: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(ratio) || ratio === 1) {
    return Number(value.toFixed(3));
  }
  return Number((value * ratio).toFixed(3));
}

export function mergeTimelineStates(
  current: ReplayState,
  imported: ReplayState,
  options: TimelineImportOptions,
  context?: {
    compareState?: ReplayState | null;
  }
): ReplayState {
  if (options.mode === 'replace') {
    const replaced = cloneState(imported);
    replaced.sessionId = imported.sessionId || `timeline-session-${Date.now()}`;
    replaced.workspaceId = imported.workspaceId || `timeline-workspace-${Date.now()}`;
    return replaced;
  }

  const prefix = safePrefix(options.trackNamePrefix);
  const base = cloneState(current);
  const source = cloneState(imported);
  const reconformPlan = buildTimelineReconformPlan({
    currentState: base,
    importedState: source,
    compareState: context?.compareState || null,
    options: {
      strategy: options.reconformStrategy,
      anchorMarkerId: options.anchorMarkerId,
      manualOffsetSeconds: options.manualOffsetSeconds,
      importTempo: options.importTempo,
      conformToCurrentTempo: options.conformToCurrentTempo,
    },
  });
  const trackMappingLookup = buildTrackMappingLookup(options.trackMappings || []);
  const currentTempo = options.importTempo ? readTimelineTempoMetadata(base.metadata || null) : null;
  const importedTempo = options.importTempo ? readTimelineTempoMetadata(source.metadata || null) : null;
  const tempoRatio = reconformPlan.tempoRatio;
  const offsetSeconds = typeof options.offsetSeconds === 'number' && Number.isFinite(options.offsetSeconds)
    ? options.offsetSeconds
    : reconformPlan.offsetSeconds;

  const trackIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  const regionIdMap = new Map<string, string>();
  const markerIdMap = new Map<string, string>();
  const compLaneIdMap = new Map<string, string>();

  source.tracks.forEach((track, index) => {
    trackIdMap.set(track.trackId, mapTrackId(prefix, track, index));
  });
  (source.trackGroups || []).forEach((group, index) => {
    groupIdMap.set(group.groupId, mapGroupId(prefix, group.groupId, index));
  });
  source.regions.forEach((region, index) => {
    regionIdMap.set(region.regionId, mapRegionId(prefix, region, index));
  });
  (source.markers || []).forEach((marker, index) => {
    markerIdMap.set(marker.id, mapMarkerId(prefix, marker, index));
  });
  (source.compLanes || []).forEach((lane, index) => {
    compLaneIdMap.set(lane.laneId, mapCompLaneId(prefix, lane, index));
  });

  const importedTracks: ReplayTrackState[] = [];
  for (const track of source.tracks) {
    const mappedTargetTrackId = trackMappingLookup.get(track.trackId);
    if (mappedTargetTrackId && base.tracks.some((entry) => entry.trackId === mappedTargetTrackId)) {
      trackIdMap.set(track.trackId, mappedTargetTrackId);
      continue;
    }

    const nextTrackId = trackIdMap.get(track.trackId) || track.trackId;
    const nextGroupId = track.groupId ? groupIdMap.get(track.groupId) || null : null;
    importedTracks.push({
      ...track,
      trackId: nextTrackId,
      trackName: `${prefix} ${track.trackName}`.trim(),
      groupId: nextGroupId,
      appliedProposalIds: [],
      trackStateHash: '',
    });
  }

  const importedGroups = options.importGroups
    ? (source.trackGroups || []).map((group) => ({
        ...group,
        groupId: groupIdMap.get(group.groupId) || group.groupId,
        name: `${prefix} ${group.name}`.trim(),
        trackIds: group.trackIds.map((trackId) => trackIdMap.get(trackId) || trackId),
      }) satisfies ReplayTrackGroup)
    : [];

  const importedRegions = source.regions.map((region) => ({
    ...region,
    regionId: regionIdMap.get(region.regionId) || region.regionId,
    trackId: trackIdMap.get(region.trackId) || region.trackId,
    startTimeSec: scaleTime(region.startTimeSec, tempoRatio) + offsetSeconds,
    durationSec: scaleTime(region.durationSec, tempoRatio),
    compLaneId: options.importCompLanes && region.compLaneId
      ? compLaneIdMap.get(region.compLaneId) || null
      : null,
  }) satisfies ReplayRegionState);

  const importedMarkers = options.importMarkers
    ? (source.markers || []).map((marker) => ({
        ...marker,
        id: markerIdMap.get(marker.id) || marker.id,
        timeSec: Number((marker.timeSec + offsetSeconds).toFixed(3)),
        label: `${prefix} ${marker.label}`.trim(),
      }) satisfies ReplayMarker)
    : [];

  const importedCompLanes = options.importCompLanes
    ? (source.compLanes || []).map((lane) => {
        const nextLaneId = compLaneIdMap.get(lane.laneId) || lane.laneId;
        return {
          ...lane,
          laneId: nextLaneId,
          trackId: trackIdMap.get(lane.trackId) || lane.trackId,
          name: `${prefix} ${lane.name}`.trim(),
          regionIds: lane.regionIds.map((regionId) => regionIdMap.get(regionId) || regionId),
          activeRegionId: regionIdMap.get(lane.activeRegionId) || lane.activeRegionId,
        } satisfies ReplayCompLane;
      })
    : [];

  const importedAutomation: ReplayAutomationLane[] = [];
  if (options.importAutomation) {
    for (const lane of source.automation) {
      const targetTrackId = trackIdMap.get(lane.trackId) || lane.trackId;
      const nextPoints = lane.points.map((point) => ({
        ...point,
        pointId: deterministicId('import-auto-pt', {
          prefix,
          laneId: lane.laneId,
          pointId: point.pointId,
          timeSec: point.timeSec,
          value: point.value,
        }).slice(0, 16),
        timeSec: scaleTime(point.timeSec, tempoRatio) + offsetSeconds,
      }));
      const existingLane = options.mergeAutomationIntoExisting
        ? base.automation.find((entry) => entry.trackId === targetTrackId && entry.parameter === lane.parameter)
        : null;
      if (existingLane) {
        const existingPointIds = new Set(existingLane.points.map((point) => point.pointId));
        for (const point of nextPoints) {
          if (!existingPointIds.has(point.pointId)) {
            existingLane.points.push(point);
          }
        }
        existingLane.points.sort((a, b) => (a.timeSec === b.timeSec ? a.pointId.localeCompare(b.pointId) : a.timeSec - b.timeSec));
        continue;
      }

      importedAutomation.push({
        ...lane,
        laneId: mapAutomationLaneId(prefix, lane, targetTrackId, options.mergeAutomationIntoExisting ? 'merged' : 'new'),
        trackId: targetTrackId,
        points: nextPoints,
      });
    }
  }

  base.tracks = [...base.tracks, ...importedTracks];
  base.regions = [...base.regions, ...importedRegions];
  base.automation = [...base.automation, ...importedAutomation];
  if (options.importGroups) {
    base.trackGroups = [...(base.trackGroups || []), ...importedGroups];
  }
  if (options.importMarkers) {
    base.markers = [...(base.markers || []), ...importedMarkers];
  }
  if (options.importCompLanes) {
    base.compLanes = [...(base.compLanes || []), ...importedCompLanes];
  }

  base.sessionId = `timeline-session-merged-${Date.now().toString(36)}`;
  base.workspaceId = current.workspaceId || imported.workspaceId || base.workspaceId;
  const mergedTempo = options.importTempo
    ? (options.conformToCurrentTempo && currentTempo?.bpm !== null
        ? currentTempo
        : importedTempo)
    : null;
  base.metadata = {
    ...(base.metadata || {}),
    importedFromSessionId: imported.sessionId,
    importedWorkspaceId: imported.workspaceId,
    importMode: 'merge',
    reconformStrategy: options.reconformStrategy,
    reconformAnchorLabel: reconformPlan.anchor.label,
    reconformAnchorTimeSec: reconformPlan.anchor.timeSec,
    reconformOffsetSeconds: reconformPlan.offsetSeconds,
    reconformMatchedMarkerCount: reconformPlan.matchedMarkers.length,
    reconformWarnings: reconformPlan.warnings,
    importOffsetSeconds: offsetSeconds,
    conformToCurrentTempo: options.conformToCurrentTempo,
    conformTempoRatio: tempoRatio,
    conformSourceBpm: importedTempo?.bpm ?? null,
    conformTargetBpm: currentTempo?.bpm ?? null,
    ...(mergedTempo?.bpm !== null ? { tempoBpm: mergedTempo.bpm, bpm: mergedTempo.bpm } : {}),
    ...(mergedTempo?.timeSignature ? { timeSignature: mergedTempo.timeSignature } : {}),
    ...(mergedTempo?.timeSignatureNumerator !== null ? { timeSignatureNumerator: mergedTempo.timeSignatureNumerator } : {}),
    ...(mergedTempo?.timeSignatureDenominator !== null ? { timeSignatureDenominator: mergedTempo.timeSignatureDenominator } : {}),
    importAutomation: options.importAutomation,
    mergeAutomationIntoExisting: options.mergeAutomationIntoExisting,
  };
  return base;
}
