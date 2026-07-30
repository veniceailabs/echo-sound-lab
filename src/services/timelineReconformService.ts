import { buildTimelineBranchDiffSummary } from './timelineBranchDiffService';
import type {
  ReplayMarker,
  ReplayState,
} from './deterministicReplayService';

export type TimelineReconformStrategy =
  | 'current-end'
  | 'shared-marker'
  | 'selected-marker'
  | 'compare-hotspot'
  | 'manual';

export interface TimelineReconformOptions {
  strategy: TimelineReconformStrategy;
  anchorMarkerId?: string | null;
  manualOffsetSeconds?: number | null;
  importTempo: boolean;
  conformToCurrentTempo: boolean;
}

export interface TimelineReconformMatch {
  currentMarkerId: string;
  importedMarkerId: string;
  label: string;
  currentTimeSec: number;
  importedTimeSec: number;
  offsetSeconds: number;
  confidence: number;
}

export interface TimelineReconformAnchor {
  type: TimelineReconformStrategy | 'fallback';
  label: string;
  timeSec: number;
}

export interface TimelineReconformPlan {
  generatedAt: number;
  strategy: TimelineReconformStrategy;
  anchor: TimelineReconformAnchor;
  offsetSeconds: number;
  tempoRatio: number;
  importedStartSec: number;
  currentAnchorSec: number;
  currentTempoBpm: number | null;
  importedTempoBpm: number | null;
  matchedMarkers: TimelineReconformMatch[];
  warnings: string[];
  recommendations: string[];
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function tokenizeLabel(value: string): string[] {
  return normalizeLabel(value).split(/\s+/).filter(Boolean);
}

function getTimelineEndSec(state: ReplayState): number {
  const regionEnd = state.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 0);
  const markerEnd = (state.markers || []).reduce((max, marker) => Math.max(max, marker.timeSec), 0);
  const automationEnd = state.automation.reduce((max, lane) => {
    const laneEnd = lane.points.reduce((innerMax, point) => Math.max(innerMax, point.timeSec), 0);
    return Math.max(max, laneEnd);
  }, 0);
  return Math.max(0, regionEnd, markerEnd, automationEnd);
}

function getTimelineStartSec(state: ReplayState): number {
  const regionStart = state.regions.reduce((min, region) => Math.min(min, region.startTimeSec), Number.POSITIVE_INFINITY);
  const markerStart = (state.markers || []).reduce((min, marker) => Math.min(min, marker.timeSec), Number.POSITIVE_INFINITY);
  const automationStart = state.automation.reduce((min, lane) => {
    const laneStart = lane.points.reduce((innerMin, point) => Math.min(innerMin, point.timeSec), Number.POSITIVE_INFINITY);
    return Math.min(min, laneStart);
  }, Number.POSITIVE_INFINITY);
  const rawStart = Math.min(regionStart, markerStart, automationStart);
  return Number.isFinite(rawStart) ? Math.max(0, rawStart) : 0;
}

function readTimelineTempoMetadata(metadata?: Record<string, unknown> | null): {
  bpm: number | null;
  timeSignature: string | null;
} {
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
  };
}

function scaleTime(value: number, ratio: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(ratio) || ratio === 1) {
    return Number(value.toFixed(3));
  }
  return Number((value * ratio).toFixed(3));
}

function buildMarkerIndex(state: ReplayState): Map<string, ReplayMarker> {
  return new Map((state.markers || []).map((marker) => [marker.id, marker]));
}

function scoreMarkerMatch(current: ReplayMarker, imported: ReplayMarker): number {
  const currentLabel = normalizeLabel(current.label);
  const importedLabel = normalizeLabel(imported.label);
  if (!currentLabel || !importedLabel) return 0;
  if (currentLabel === importedLabel) return 1;

  const currentTokens = tokenizeLabel(current.label);
  const importedTokens = tokenizeLabel(imported.label);
  const overlap = currentTokens.filter((token) => importedTokens.includes(token)).length;
  if (overlap === 0) return 0;
  const coverage = overlap / Math.max(currentTokens.length, importedTokens.length);
  return Math.min(0.95, coverage);
}

function collectSharedMarkerMatches(currentState: ReplayState, importedState: ReplayState): TimelineReconformMatch[] {
  const currentMarkers = currentState.markers || [];
  const importedMarkers = importedState.markers || [];
  const matches: TimelineReconformMatch[] = [];

  for (const importedMarker of importedMarkers) {
    let bestCurrent: ReplayMarker | null = null;
    let bestScore = 0;
    for (const currentMarker of currentMarkers) {
      const score = scoreMarkerMatch(currentMarker, importedMarker);
      if (score > bestScore) {
        bestScore = score;
        bestCurrent = currentMarker;
      }
    }
    if (!bestCurrent || bestScore < 0.5) continue;
    matches.push({
      currentMarkerId: bestCurrent.id,
      importedMarkerId: importedMarker.id,
      label: bestCurrent.label.trim() || importedMarker.label.trim() || 'Marker',
      currentTimeSec: bestCurrent.timeSec,
      importedTimeSec: importedMarker.timeSec,
      offsetSeconds: Number((bestCurrent.timeSec - importedMarker.timeSec).toFixed(3)),
      confidence: Number(bestScore.toFixed(3)),
    });
  }

  matches.sort((left, right) => right.confidence - left.confidence || Math.abs(left.offsetSeconds) - Math.abs(right.offsetSeconds));
  return matches.slice(0, 6);
}

function pickCompareHotspotTime(currentState: ReplayState, compareState: ReplayState | null): { timeSec: number; label: string } | null {
  if (!compareState) return null;
  const summary = buildTimelineBranchDiffSummary(currentState, compareState);
  const hotspot = [...summary.bins]
    .sort((left, right) => right.intensity - left.intensity || right.score - left.score)
    .find((bin) => bin.score > 0);
  if (!hotspot) return null;
  return {
    timeSec: Number(hotspot.startSec.toFixed(3)),
    label: hotspot.labels[0] || `Hotspot ${hotspot.index + 1}`,
  };
}

export interface TimelineReconformPlanInput {
  currentState: ReplayState;
  importedState: ReplayState;
  compareState?: ReplayState | null;
  options: TimelineReconformOptions;
}

export function buildTimelineReconformPlan(input: TimelineReconformPlanInput): TimelineReconformPlan {
  const currentTempo = readTimelineTempoMetadata(input.currentState.metadata || null);
  const importedTempo = readTimelineTempoMetadata(input.importedState.metadata || null);
  const tempoRatio = input.options.importTempo && input.options.conformToCurrentTempo && currentTempo.bpm && importedTempo.bpm && currentTempo.bpm > 0
    ? importedTempo.bpm / currentTempo.bpm
    : 1;
  const importedStartSec = getTimelineStartSec(input.importedState);
  const currentEndSec = getTimelineEndSec(input.currentState);
  const currentAnchorCandidates = buildMarkerIndex(input.currentState);
  const sharedMatches = collectSharedMarkerMatches(input.currentState, input.importedState);
  const compareHotspot = pickCompareHotspotTime(input.currentState, input.compareState || null);
  const anchorGapSec = 0.25;

  let currentAnchorSec = currentEndSec + anchorGapSec;
  let anchor: TimelineReconformAnchor = {
    type: 'current-end',
    label: 'Current timeline end',
    timeSec: currentAnchorSec,
  };
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const matchedMarkers = sharedMatches;

  switch (input.options.strategy) {
    case 'manual': {
      currentAnchorSec = Number((input.options.manualOffsetSeconds ?? 0).toFixed(3));
      anchor = {
        type: 'manual',
        label: 'Manual offset',
        timeSec: currentAnchorSec,
      };
      recommendations.push('Verify the manual offset against picture lock or slate timecode.');
      break;
    }
    case 'selected-marker': {
      const selectedMarker = input.options.anchorMarkerId ? currentAnchorCandidates.get(input.options.anchorMarkerId) || null : null;
      if (selectedMarker) {
        const normalized = normalizeLabel(selectedMarker.label);
        const importedMatch = (input.importedState.markers || []).find((marker) => normalizeLabel(marker.label) === normalized)
          || (input.importedState.markers || []).find((marker) => tokenizeLabel(marker.label).some((token) => tokenizeLabel(selectedMarker.label).includes(token)))
          || (input.importedState.markers || [])[0]
          || null;
        const importedAnchorSec = importedMatch ? importedMatch.timeSec : importedStartSec;
        currentAnchorSec = selectedMarker.timeSec;
        anchor = {
          type: 'selected-marker',
          label: `Selected marker: ${selectedMarker.label}`,
          timeSec: currentAnchorSec,
        };
        const offsetSeconds = Number((currentAnchorSec - scaleTime(importedAnchorSec, tempoRatio)).toFixed(3));
        recommendations.push('Use the selected marker as the reconform anchor for external session handoff.');
        if (!importedMatch) warnings.push('No imported marker matched the selected current marker; falling back to the imported session start.');
        return {
          generatedAt: Date.now(),
          strategy: input.options.strategy,
          anchor,
          offsetSeconds,
          tempoRatio,
          importedStartSec,
          currentAnchorSec,
          currentTempoBpm: currentTempo.bpm,
          importedTempoBpm: importedTempo.bpm,
          matchedMarkers,
          warnings,
          recommendations,
        };
      }
      warnings.push('Selected-marker reconform requested but no current marker was available.');
      recommendations.push('Choose a current marker or switch to shared-marker alignment.');
      break;
    }
    case 'shared-marker': {
      if (matchedMarkers.length > 0) {
        const weightedOffset = matchedMarkers.reduce(
          (total, match) => total + match.offsetSeconds * Math.max(0.25, match.confidence),
          0
        );
        const totalWeight = matchedMarkers.reduce((total, match) => total + Math.max(0.25, match.confidence), 0);
        const currentTime = matchedMarkers.reduce(
          (total, match) => total + match.currentTimeSec * Math.max(0.25, match.confidence),
          0
        ) / Math.max(0.0001, totalWeight);
        currentAnchorSec = Number(currentTime.toFixed(3));
        anchor = {
          type: 'shared-marker',
          label: `${matchedMarkers.length} shared marker match${matchedMarkers.length === 1 ? '' : 'es'}`,
          timeSec: currentAnchorSec,
        };
        const offsetSeconds = Number((weightedOffset / Math.max(0.0001, totalWeight)).toFixed(3));
        recommendations.push('Shared markers provide the best reconform anchor for session handoff.');
        return {
          generatedAt: Date.now(),
          strategy: input.options.strategy,
          anchor,
          offsetSeconds,
          tempoRatio,
          importedStartSec,
          currentAnchorSec,
          currentTempoBpm: currentTempo.bpm,
          importedTempoBpm: importedTempo.bpm,
          matchedMarkers,
          warnings,
          recommendations,
        };
      }
      warnings.push('No shared markers were found between current and imported sessions.');
      recommendations.push('Use current-end or manual offset until marker labels are aligned.');
      break;
    }
    case 'compare-hotspot': {
      if (compareHotspot) {
        currentAnchorSec = compareHotspot.timeSec;
        anchor = {
          type: 'compare-hotspot',
          label: compareHotspot.label,
          timeSec: currentAnchorSec,
        };
        recommendations.push('Compare hotspot reconform is useful when picture lock changed between revisions.');
        break;
      }
      warnings.push('Compare-hotspot reconform requested without a compare branch.');
      recommendations.push('Switch to shared-marker or current-end alignment.');
      break;
    }
    case 'current-end':
    default: {
      recommendations.push('Align the imported session after the current timeline end to avoid collisions.');
      break;
    }
  }

  const offsetSeconds = Number((currentAnchorSec - scaleTime(importedStartSec, tempoRatio)).toFixed(3));
  if (input.options.importTempo && input.options.conformToCurrentTempo) {
    recommendations.push('Imported timing will be scaled to the current session tempo before merge.');
  }
  if (!input.compareState && input.options.strategy === 'compare-hotspot') {
    warnings.push('Compare-hotspot alignment is unavailable without a compare branch.');
  }
  if (input.options.strategy === 'current-end' && importedStartSec <= 0) {
    recommendations.push('Imported content starts at zero, so the offset is driven entirely by the live session end.');
  }
  return {
    generatedAt: Date.now(),
    strategy: input.options.strategy,
    anchor,
    offsetSeconds,
    tempoRatio,
    importedStartSec,
    currentAnchorSec,
    currentTempoBpm: currentTempo.bpm,
    importedTempoBpm: importedTempo.bpm,
    matchedMarkers,
    warnings,
    recommendations,
  };
}

export function serializeTimelineReconformPlanJson(plan: TimelineReconformPlan): string {
  return JSON.stringify(plan, null, 2);
}
