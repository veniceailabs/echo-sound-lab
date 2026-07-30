import type { ReplayMarker, ReplayState } from './deterministicReplayService';
import type { TimelineBranchDiffSummary, TimelineHeatmapBin } from './timelineBranchDiffService';

export interface TimelineCompareSnapshotMarker {
  id: string;
  label: string;
  timeSec: number;
  color: string;
  note: string;
  source: 'active' | 'compare';
  status: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface TimelineCompareSnapshot {
  format: 'ESL-TIMELINE-COMPARE-SNAPSHOT';
  version: 1;
  generatedAt: number;
  activeBranchId: string | null;
  compareBranchId: string | null;
  compareLabel: string | null;
  activeHash: string;
  compareHash: string | null;
  activeSummary: {
    tracks: number;
    regions: number;
    markers: number;
    groups: number;
    compLanes: number;
    automation: number;
  };
  compareSummary: {
    tracks: number;
    regions: number;
    markers: number;
    groups: number;
    compLanes: number;
    automation: number;
  } | null;
  heatmap: TimelineBranchDiffSummary;
  markerHighlights: TimelineCompareSnapshotMarker[];
  regionHighlights: Array<{
    id: string;
    trackId: string;
    startSec: number;
    durationSec: number;
    source: 'active' | 'compare';
    status: 'added' | 'removed' | 'changed' | 'unchanged';
  }>;
  notes: string[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function markerStatus(activeMarker: ReplayMarker | undefined, compareMarker: ReplayMarker | undefined): 'added' | 'removed' | 'changed' | 'unchanged' {
  if (activeMarker && !compareMarker) return 'added';
  if (!activeMarker && compareMarker) return 'removed';
  if (!activeMarker || !compareMarker) return 'unchanged';
  if (
    activeMarker.timeSec !== compareMarker.timeSec ||
    activeMarker.label !== compareMarker.label ||
    activeMarker.color !== compareMarker.color ||
    (activeMarker.note || '') !== (compareMarker.note || '')
  ) {
    return 'changed';
  }
  return 'unchanged';
}

function regionStatus(
  activeRegion: { regionId: string; startTimeSec: number; durationSec: number; trackId: string; fadeInSec?: number | null; fadeOutSec?: number | null } | undefined,
  compareRegion: { regionId: string; startTimeSec: number; durationSec: number; trackId: string; fadeInSec?: number | null; fadeOutSec?: number | null } | undefined
): 'added' | 'removed' | 'changed' | 'unchanged' {
  if (activeRegion && !compareRegion) return 'added';
  if (!activeRegion && compareRegion) return 'removed';
  if (!activeRegion || !compareRegion) return 'unchanged';
  if (
    activeRegion.startTimeSec !== compareRegion.startTimeSec ||
    activeRegion.durationSec !== compareRegion.durationSec ||
    activeRegion.trackId !== compareRegion.trackId ||
    activeRegion.fadeInSec !== compareRegion.fadeInSec ||
    activeRegion.fadeOutSec !== compareRegion.fadeOutSec
  ) {
    return 'changed';
  }
  return 'unchanged';
}

function buildMarkerHighlights(activeState: ReplayState, compareState: ReplayState | null): TimelineCompareSnapshotMarker[] {
  const compareMarkersById = new Map((compareState?.markers || []).map((marker) => [marker.id, marker]));
  const activeMarkersById = new Map((activeState.markers || []).map((marker) => [marker.id, marker]));
  const ids = new Set<string>([
    ...activeMarkersById.keys(),
    ...compareMarkersById.keys(),
  ]);
  return [...ids]
    .map((id) => {
      const activeMarker = activeMarkersById.get(id);
      const compareMarker = compareMarkersById.get(id);
      const status = markerStatus(activeMarker, compareMarker);
      if (activeMarker) {
        return {
          id: activeMarker.id,
          label: activeMarker.label,
          timeSec: activeMarker.timeSec,
          color: activeMarker.color,
          note: activeMarker.note || '',
          source: 'active' as const,
          status,
        };
      }
      if (compareMarker) {
        return {
          id: compareMarker.id,
          label: compareMarker.label,
          timeSec: compareMarker.timeSec,
          color: compareMarker.color,
          note: compareMarker.note || '',
          source: 'compare' as const,
          status,
        };
      }
      return null;
    })
    .filter((marker): marker is TimelineCompareSnapshotMarker => Boolean(marker))
    .sort((left, right) => left.timeSec - right.timeSec);
}

function buildRegionHighlights(activeState: ReplayState, compareState: ReplayState | null): TimelineCompareSnapshot['regionHighlights'] {
  const compareRegionsById = new Map((compareState?.regions || []).map((region) => [region.regionId, region]));
  const activeRegionsById = new Map(activeState.regions.map((region) => [region.regionId, region]));
  const ids = new Set<string>([
    ...activeRegionsById.keys(),
    ...compareRegionsById.keys(),
  ]);
  return [...ids]
    .map((id) => {
      const activeRegion = activeRegionsById.get(id);
      const compareRegion = compareRegionsById.get(id);
      const status = regionStatus(activeRegion, compareRegion);
      if (activeRegion) {
        return {
          id: activeRegion.regionId,
          trackId: activeRegion.trackId,
          startSec: activeRegion.startTimeSec,
          durationSec: activeRegion.durationSec,
          source: 'active' as const,
          status,
        };
      }
      if (compareRegion) {
        return {
          id: compareRegion.regionId,
          trackId: compareRegion.trackId,
          startSec: compareRegion.startTimeSec,
          durationSec: compareRegion.durationSec,
          source: 'compare' as const,
          status,
        };
      }
      return null;
    })
    .filter((region): region is NonNullable<typeof region> => Boolean(region))
    .sort((left, right) => left.startSec - right.startSec);
}

function heatmapToSvg(heatmap: TimelineBranchDiffSummary, width = 1400, height = 280): string {
  const topPad = 18;
  const heatmapHeight = 82;
  const timelineY = topPad + 26;
  const barsY = topPad + 48;
  const bins = heatmap.bins;
  const binWidth = width / Math.max(1, bins.length);
  const laneBlocks = bins.map((bin) => {
    const intensity = Math.max(0.06, 0.14 + bin.intensity * 0.86);
    const hue = 210 - Math.round(bin.intensity * 170);
    const rectHeight = Math.max(8, heatmapHeight * Math.max(0.08, bin.intensity));
    return `
      <rect x="${(bin.index * binWidth).toFixed(2)}" y="${(barsY + (heatmapHeight - rectHeight)).toFixed(2)}" width="${(binWidth - 1).toFixed(2)}" height="${rectHeight.toFixed(2)}" rx="3" fill="hsla(${hue}, 90%, 60%, ${intensity})" />
    `;
  }).join('');

  const labels = bins
    .filter((bin) => bin.labels.length > 0)
    .slice(0, 12)
    .map((bin, index) => `
      <text x="${Math.min(width - 8, 12 + index * 112)}" y="${height - 18}" fill="rgba(226,232,240,0.78)" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escapeXml(bin.labels[0]).slice(0, 42)}</text>
    `)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020617" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
  <text x="18" y="28" fill="#f8fafc" font-size="18" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700">ESL Branch Compare Snapshot</text>
  <text x="18" y="48" fill="rgba(226,232,240,0.72)" font-size="11" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">Duration ${heatmap.durationSec.toFixed(2)}s · Peak ${heatmap.maxScore.toFixed(2)} · Total ${heatmap.totalScore.toFixed(2)}</text>
  <rect x="18" y="${timelineY}" width="${width - 36}" height="14" rx="7" fill="rgba(255,255,255,0.06)" />
  ${laneBlocks}
  <g filter="url(#softGlow)">
    <rect x="18" y="126" width="${width - 36}" height="86" rx="16" fill="rgba(15,23,42,0.76)" stroke="rgba(255,255,255,0.08)" />
    <text x="34" y="154" fill="#e2e8f0" font-size="12" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="600">Hotspots</text>
    <text x="34" y="175" fill="rgba(226,232,240,0.72)" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">Regions + markers + automation changes are collapsed into structural bins.</text>
    <text x="34" y="195" fill="rgba(226,232,240,0.72)" font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">This SVG is the branch review artifact exported by ESL.</text>
  </g>
  ${labels}
</svg>`;
}

export function buildTimelineCompareSnapshot(
  activeState: ReplayState,
  compareState: ReplayState | null,
  heatmap: TimelineBranchDiffSummary,
  options: {
    activeBranchId: string | null;
    compareBranchId: string | null;
    compareLabel?: string | null;
    activeHash: string;
    compareHash: string | null;
  }
): TimelineCompareSnapshot {
  return {
    format: 'ESL-TIMELINE-COMPARE-SNAPSHOT',
    version: 1,
    generatedAt: Date.now(),
    activeBranchId: options.activeBranchId,
    compareBranchId: options.compareBranchId,
    compareLabel: options.compareLabel || null,
    activeHash: options.activeHash,
    compareHash: options.compareHash,
    activeSummary: {
      tracks: activeState.tracks.length,
      regions: activeState.regions.length,
      markers: (activeState.markers || []).length,
      groups: (activeState.trackGroups || []).length,
      compLanes: (activeState.compLanes || []).length,
      automation: activeState.automation.length,
    },
    compareSummary: compareState ? {
      tracks: compareState.tracks.length,
      regions: compareState.regions.length,
      markers: (compareState.markers || []).length,
      groups: (compareState.trackGroups || []).length,
      compLanes: (compareState.compLanes || []).length,
      automation: compareState.automation.length,
    } : null,
    heatmap,
    markerHighlights: buildMarkerHighlights(activeState, compareState),
    regionHighlights: buildRegionHighlights(activeState, compareState),
    notes: [
      'Exported from ESL compare review.',
      compareState ? 'Includes active and compare branch structural context.' : 'No compare branch was selected.',
    ],
  };
}

export function serializeTimelineCompareSnapshotJson(snapshot: TimelineCompareSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function serializeTimelineCompareSnapshotSvg(snapshot: TimelineCompareSnapshot): string {
  return heatmapToSvg(snapshot.heatmap);
}
