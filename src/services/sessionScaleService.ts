import type { AudioEngineSnapshot } from './audioEngine';
import type { BranchEntity } from './timelineBranchingService';
import type { ReplayState } from './deterministicReplayService';

export interface SessionScaleProfile {
  generatedAt: number;
  trackCount: number;
  regionCount: number;
  markerCount: number;
  automationLaneCount: number;
  compLaneCount: number;
  branchCount: number;
  pluginInstanceCount: number;
  totalDurationSec: number;
  averageRegionsPerTrack: number;
  maxRegionsPerTrack: number;
  complexityScore: number;
  readinessScore: number;
  estimatedReplayCost: number;
  warnings: string[];
  recommendations: string[];
  renderPath: AudioEngineSnapshot['recommendedRenderPath'];
  masteringQualityMode: AudioEngineSnapshot['masteringQualityMode'];
}

export interface SessionScaleInput {
  timelineState: ReplayState;
  compareState: ReplayState | null;
  branches: BranchEntity[];
  engineSnapshot: AudioEngineSnapshot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function buildSessionScaleProfile(input: SessionScaleInput): SessionScaleProfile {
  const trackCount = input.timelineState.tracks.length;
  const regionCount = input.timelineState.regions.length;
  const markerCount = (input.timelineState.markers || []).length;
  const automationLaneCount = input.timelineState.automation.length;
  const compLaneCount = (input.timelineState.compLanes || []).length;
  const branchCount = input.branches.length;
  const pluginInstanceCount = input.timelineState.tracks.reduce(
    (total, track) => total + (track.inserts?.length || 0),
    0
  );
  const totalDurationSec = input.timelineState.regions.reduce(
    (max, region) => Math.max(max, region.startTimeSec + region.durationSec),
    0
  );
  const averageRegionsPerTrack = trackCount > 0 ? regionCount / trackCount : 0;
  const maxRegionsPerTrack = input.timelineState.tracks.reduce((max, track) => {
    const count = input.timelineState.regions.filter((region) => region.trackId === track.trackId).length;
    return Math.max(max, count);
  }, 0);

  const pressure =
    trackCount * 2.25 +
    regionCount * 1.15 +
    automationLaneCount * 4.75 +
    compLaneCount * 7.5 +
    branchCount * 4 +
    pluginInstanceCount * 1.75 +
    markerCount * 0.8 +
    Math.max(0, totalDurationSec / 30);

  const complexityScore = clamp(Math.round(pressure), 0, 100);
  const readinessScore = clamp(Math.round(100 - pressure), 0, 100);
  const estimatedReplayCost = round(
    trackCount * 0.8 +
    regionCount * 0.15 +
    automationLaneCount * 1.1 +
    compLaneCount * 0.85 +
    branchCount * 0.4 +
    pluginInstanceCount * 0.25
  );

  const warnings: string[] = [];
  if (trackCount > 48) warnings.push('Track count is entering heavy-session territory.');
  if (regionCount > 180) warnings.push('Region density is high enough to stress edit navigation.');
  if (automationLaneCount > 24) warnings.push('Automation lane count may slow deterministic replay and compare rendering.');
  if (compLaneCount > 12) warnings.push('Comp lane volume suggests the playlist surface needs more take hygiene.');
  if (branchCount > 4) warnings.push('Branch sprawl may complicate compare and merge review.');
  if (pluginInstanceCount > 32) warnings.push('Insert depth is high enough to make render-path choice important.');
  if (readinessScore < 60) warnings.push('Session needs a cleanup pass before it can be treated like a pro handoff.');

  const recommendations: string[] = [];
  if (compLaneCount > 0) recommendations.push('Promote and audition active takes before handoff.');
  if (markerCount > 0) recommendations.push('Export markers for cue, ADR, and picture-lock review.');
  if (automationLaneCount > 0) recommendations.push('Keep automation merged or mapped to existing lanes for import stability.');
  if (branchCount > 1) recommendations.push('Export a compare snapshot and review hotspots before merge.');
  if (totalDurationSec > 0) recommendations.push('Use the current timeline length as a conform anchor when importing external sessions.');
  if (pluginInstanceCount > 0) recommendations.push('Preserve the chain signature when exporting the session package.');

  return {
    generatedAt: Date.now(),
    trackCount,
    regionCount,
    markerCount,
    automationLaneCount,
    compLaneCount,
    branchCount,
    pluginInstanceCount,
    totalDurationSec: round(totalDurationSec),
    averageRegionsPerTrack: round(averageRegionsPerTrack),
    maxRegionsPerTrack,
    complexityScore,
    readinessScore,
    estimatedReplayCost,
    warnings,
    recommendations,
    renderPath: input.engineSnapshot.recommendedRenderPath,
    masteringQualityMode: input.engineSnapshot.masteringQualityMode,
  };
}

export function serializeSessionScaleProfileJson(profile: SessionScaleProfile): string {
  return JSON.stringify(profile, null, 2);
}
