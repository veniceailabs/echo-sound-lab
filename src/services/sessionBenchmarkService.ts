import type { AudioEngineSnapshot } from './audioEngine';
import type { BranchEntity } from './timelineBranchingService';
import { buildTimelineBranchDiffSummary } from './timelineBranchDiffService';
import type { ReplayMarker, ReplayState } from './deterministicReplayService';
import type { SessionScaleProfile } from './sessionScaleService';

export type SessionBenchmarkMode = 'speed' | 'balanced' | 'fidelity';

export interface SessionBenchmarkBin {
  index: number;
  startSec: number;
  endSec: number;
  score: number;
  intensity: number;
  regionCount: number;
  markerCount: number;
  automationCount: number;
  compareWeight: number;
  labels: string[];
}

export interface SessionBenchmarkSplitPoint {
  timeSec: number;
  label: string;
  reason: string;
  source: 'density' | 'compare-hotspot' | 'marker';
  severity: 'low' | 'medium' | 'high';
}

export interface SessionBenchmarkPlan {
  generatedAt: number;
  mode: SessionBenchmarkMode;
  durationSec: number;
  binCount: number;
  scaleProfile: SessionScaleProfile;
  bins: SessionBenchmarkBin[];
  splitPoints: SessionBenchmarkSplitPoint[];
  cleanupActions: string[];
  warnings: string[];
  recommendations: string[];
}

export interface SessionBenchmarkInput {
  timelineState: ReplayState;
  compareState: ReplayState | null;
  branches: BranchEntity[];
  scaleProfile: SessionScaleProfile;
  engineSnapshot: AudioEngineSnapshot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTimelineDuration(state: ReplayState): number {
  const regionEnd = state.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 0);
  const markerEnd = (state.markers || []).reduce((max, marker) => Math.max(max, marker.timeSec), 0);
  const automationEnd = state.automation.reduce((max, lane) => {
    const laneEnd = lane.points.reduce((innerMax, point) => Math.max(innerMax, point.timeSec), 0);
    return Math.max(max, laneEnd);
  }, 0);
  return Math.max(0, regionEnd, markerEnd, automationEnd);
}

function getMarkers(state: ReplayState): ReplayMarker[] {
  return [...(state.markers || [])].sort((left, right) => left.timeSec - right.timeSec);
}

function selectBenchmarkMode(scaleProfile: SessionScaleProfile, compareState: ReplayState | null, branches: BranchEntity[]): SessionBenchmarkMode {
  if (scaleProfile.readinessScore < 45 || scaleProfile.estimatedReplayCost > 45) {
    return 'speed';
  }
  if (scaleProfile.readinessScore < 72 || compareState || branches.length > 1) {
    return 'balanced';
  }
  return 'fidelity';
}

function overlapScore(startA: number, endA: number, startB: number, endB: number): number {
  const overlap = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  if (overlap <= 0) return 0;
  const span = Math.max(0.000001, endB - startB);
  return overlap / span;
}

function makeSplitSeverity(intensity: number): SessionBenchmarkSplitPoint['severity'] {
  if (intensity >= 0.8) return 'high';
  if (intensity >= 0.5) return 'medium';
  return 'low';
}

function dedupeSplitPoints(points: SessionBenchmarkSplitPoint[]): SessionBenchmarkSplitPoint[] {
  const seen = new Set<string>();
  const deduped: SessionBenchmarkSplitPoint[] = [];
  for (const point of points.sort((left, right) => left.timeSec - right.timeSec)) {
    const key = `${Math.round(point.timeSec * 2) / 2}:${point.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(point);
  }
  return deduped;
}

export function buildSessionBenchmarkPlan(input: SessionBenchmarkInput): SessionBenchmarkPlan {
  const durationSec = Math.max(getTimelineDuration(input.timelineState), input.scaleProfile.totalDurationSec);
  const mode = selectBenchmarkMode(input.scaleProfile, input.compareState, input.branches);
  const binCount = clamp(Math.round(24 + input.scaleProfile.branchCount * 2 + input.scaleProfile.compLaneCount), 24, 72);
  const binSizeSec = durationSec > 0 ? durationSec / binCount : 1;
  const bins: SessionBenchmarkBin[] = Array.from({ length: binCount }, (_, index) => ({
    index,
    startSec: index * binSizeSec,
    endSec: (index + 1) * binSizeSec,
    score: 0,
    intensity: 0,
    regionCount: 0,
    markerCount: 0,
    automationCount: 0,
    compareWeight: 0,
    labels: [],
  }));

  for (const region of input.timelineState.regions) {
    const start = region.startTimeSec;
    const end = region.startTimeSec + region.durationSec;
    for (const bin of bins) {
      const share = overlapScore(start, end, bin.startSec, bin.endSec);
      if (!share) continue;
      bin.regionCount += 1;
      bin.score += share * 2.2;
      if (region.compLaneId) {
        bin.score += 0.35 * share;
      }
      if (region.gainDb && Math.abs(region.gainDb) > 0.5) {
        bin.score += 0.1;
      }
      bin.labels.push(`Region ${region.regionId}`);
    }
  }

  for (const marker of getMarkers(input.timelineState)) {
    for (const bin of bins) {
      if (marker.timeSec < bin.startSec || marker.timeSec >= bin.endSec) continue;
      bin.markerCount += 1;
      bin.score += 1.4;
      bin.labels.push(`Marker ${marker.label}`);
    }
  }

  for (const lane of input.timelineState.automation) {
    const laneStart = lane.points[0]?.timeSec ?? 0;
    const laneEnd = lane.points[lane.points.length - 1]?.timeSec ?? laneStart;
    for (const bin of bins) {
      const share = overlapScore(laneStart, Math.max(laneEnd, laneStart + 0.001), bin.startSec, bin.endSec);
      if (!share) continue;
      bin.automationCount += 1;
      bin.score += share * 1.7;
      bin.labels.push(`Automation ${lane.parameter}`);
    }
  }

  if (input.compareState) {
    const compareHeatmap = buildTimelineBranchDiffSummary(input.timelineState, input.compareState);
    for (const bin of bins) {
      const compareBin = compareHeatmap.bins[bin.index];
      if (!compareBin) continue;
      bin.compareWeight = Number(compareBin.intensity.toFixed(3));
      bin.score += compareBin.intensity * 5.5;
      if (compareBin.labels.length > 0) {
        bin.labels.push(compareBin.labels[0]);
      }
    }
  }

  const maxScore = bins.reduce((max, bin) => Math.max(max, bin.score), 0);
  const normalizedBins = bins.map((bin) => ({
    ...bin,
    intensity: maxScore > 0 ? Math.min(1, bin.score / maxScore) : 0,
  }));

  const splitPoints: SessionBenchmarkSplitPoint[] = [];
  const markers = getMarkers(input.timelineState);
  for (const bin of normalizedBins) {
    if (bin.intensity < 0.5) continue;
    const reasonParts = [
      `${bin.regionCount} region${bin.regionCount === 1 ? '' : 's'}`,
      `${bin.markerCount} marker${bin.markerCount === 1 ? '' : 's'}`,
      `${bin.automationCount} automation lane${bin.automationCount === 1 ? '' : 's'}`,
    ];
    if (bin.compareWeight > 0.35) {
      reasonParts.push('compare hotspot');
    }
    const nearestMarker = markers.find((marker) => marker.timeSec >= bin.startSec && marker.timeSec < bin.endSec);
    splitPoints.push({
      timeSec: Number((nearestMarker?.timeSec ?? bin.startSec).toFixed(3)),
      label: nearestMarker?.label || `Split ${bin.index + 1}`,
      reason: reasonParts.join(' + '),
      source: nearestMarker ? 'marker' : (bin.compareWeight > 0.35 ? 'compare-hotspot' : 'density'),
      severity: makeSplitSeverity(bin.intensity),
    });
  }

  if (input.compareState) {
    const compareHeatmap = buildTimelineBranchDiffSummary(input.timelineState, input.compareState);
    const compareHotspots = [...compareHeatmap.bins]
      .sort((left, right) => right.intensity - left.intensity || right.score - left.score)
      .filter((bin) => bin.intensity >= 0.35)
      .slice(0, 4)
      .map((bin) => ({
        timeSec: Number(bin.startSec.toFixed(3)),
        label: bin.labels[0] || `Hotspot ${bin.index + 1}`,
        reason: 'Compare branch divergence',
        source: 'compare-hotspot' as const,
        severity: makeSplitSeverity(bin.intensity),
      }));
    splitPoints.push(...compareHotspots);
  }

  const cleanupActions: string[] = [];
  if (input.scaleProfile.trackCount > 48) cleanupActions.push('Split the session into track families before delivery.');
  if (input.scaleProfile.regionCount > 180) cleanupActions.push('Consolidate duplicate or silent regions to reduce edit load.');
  if (input.scaleProfile.automationLaneCount > 24) cleanupActions.push('Merge automation lanes or commit them into fewer review paths.');
  if (input.scaleProfile.compLaneCount > 12) cleanupActions.push('Freeze inactive takes and promote only the current comp lane.');
  if (input.scaleProfile.branchCount > 4) cleanupActions.push('Merge or archive stale branches before the next handoff.');
  if (input.scaleProfile.pluginInstanceCount > 32) cleanupActions.push('Print or freeze heavy inserts before the next diagnostic pass.');
  if (cleanupActions.length === 0) {
    cleanupActions.push('Session scale is manageable; keep the current layout and continue review.');
  }

  const warnings = [...input.scaleProfile.warnings];
  if (mode === 'speed') {
    warnings.push('Speed mode is recommended because the session is already heavy.');
  }
  if (splitPoints.length === 0) {
    warnings.push('No strong split points were found, so the session can stay intact for now.');
  }

  const recommendations: string[] = [];
  recommendations.push(mode === 'fidelity'
    ? 'Use fidelity mode and keep the session intact unless a review handoff requires splitting.'
    : 'Use benchmark split points to separate heavy review regions before handoff.');
  recommendations.push('Open the compare heatmap and check the highest intensity bins before merge.');
  if (input.engineSnapshot.recommendedRenderPath === 'custom-dsp') {
    recommendations.push('Prefer the custom DSP render path for the heaviest passes.');
  } else {
    recommendations.push('Prefer the lighter render path until the session is cleaned up.');
  }

  return {
    generatedAt: Date.now(),
    mode,
    durationSec: Number(durationSec.toFixed(3)),
    binCount,
    scaleProfile: input.scaleProfile,
    bins: normalizedBins,
    splitPoints: dedupeSplitPoints(splitPoints).slice(0, 8),
    cleanupActions,
    warnings,
    recommendations,
  };
}

export function serializeSessionBenchmarkPlanJson(plan: SessionBenchmarkPlan): string {
  return JSON.stringify(plan, null, 2);
}
