import React, { useEffect, useState } from 'react';
import type { BranchEntity, MergeStrategy } from '../services/timelineBranchingService';
import type { ReplayState } from '../services/deterministicReplayService';
import { downloadText } from '../services/cueSheetExporter';
import { buildTimelineBranchDiffSummary } from '../services/timelineBranchDiffService';
import {
  buildTimelineCompareSnapshot,
  serializeTimelineCompareSnapshotJson,
  serializeTimelineCompareSnapshotSvg,
} from '../services/timelineCompareSnapshotService';

interface TimelineBranchComparePanelProps {
  branches: BranchEntity[];
  activeBranchId: string | null;
  compareBranchId: string | null;
  activeState: ReplayState;
  compareState: ReplayState | null;
  activeHash: string;
  compareHash: string | null;
  onSelectCompareBranch: (branchId: string | null) => void;
  onOpenMerge?: () => void;
  onMergeCompareIntoActive?: (strategy: MergeStrategy) => void | Promise<void>;
  onSeekToTime?: (timeSec: number) => void;
  currentTimeSec?: number;
  compareLabel?: string;
}

function diffCount(left: number, right: number): string {
  const delta = right - left;
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function difference<T extends string>(left: T[], right: T[]): { added: T[]; removed: T[] } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    added: right.filter((value) => !leftSet.has(value)),
    removed: left.filter((value) => !rightSet.has(value)),
  };
}

function TimelineBranchComparePanelComponent({
  branches,
  activeBranchId,
  compareBranchId,
  activeState,
  compareState,
  activeHash,
  compareHash,
  onSelectCompareBranch,
  onOpenMerge,
  onMergeCompareIntoActive,
  onSeekToTime,
  currentTimeSec = 0,
  compareLabel,
}: TimelineBranchComparePanelProps) {
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('THEIRS');
  const activeTrackIds = activeState.tracks.map((track) => track.trackId);
  const compareTrackIds = compareState?.tracks.map((track) => track.trackId) || [];
  const activeRegionIds = activeState.regions.map((region) => region.regionId);
  const compareRegionIds = compareState?.regions.map((region) => region.regionId) || [];
  const activeMarkerIds = (activeState.markers || []).map((marker) => marker.id);
  const compareMarkerIds = (compareState?.markers || []).map((marker) => marker.id);
  const activeGroupIds = (activeState.trackGroups || []).map((group) => group.groupId);
  const compareGroupIds = (compareState?.trackGroups || []).map((group) => group.groupId);
  const activeCompLaneIds = (activeState.compLanes || []).map((lane) => lane.laneId);
  const compareCompLaneIds = (compareState?.compLanes || []).map((lane) => lane.laneId);
  const heatmap = buildTimelineBranchDiffSummary(activeState, compareState);
  const hotspotBins = heatmap.bins.filter((bin) => bin.intensity >= 0.25 || bin.score >= heatmap.maxScore * 0.4);
  const previousHotspot = hotspotBins
    .filter((bin) => bin.endSec <= currentTimeSec)
    .sort((left, right) => right.endSec - left.endSec)[0] || null;
  const nextHotspot = hotspotBins
    .filter((bin) => bin.startSec > currentTimeSec)
    .sort((left, right) => left.startSec - right.startSec)[0] || null;
  const strongestHotspot = [...hotspotBins].sort((left, right) => right.score - left.score)[0] || heatmap.bins[0] || null;

  const comparison = compareState
    ? {
        tracks: diffCount(activeState.tracks.length, compareState.tracks.length),
        regions: diffCount(activeState.regions.length, compareState.regions.length),
        markers: diffCount((activeState.markers || []).length, (compareState.markers || []).length),
        groups: diffCount((activeState.trackGroups || []).length, (compareState.trackGroups || []).length),
        compLanes: diffCount((activeState.compLanes || []).length, (compareState.compLanes || []).length),
        trackDelta: difference(activeTrackIds, compareTrackIds),
        regionDelta: difference(activeRegionIds, compareRegionIds),
        markerDelta: difference(activeMarkerIds, compareMarkerIds),
        groupDelta: difference(activeGroupIds, compareGroupIds),
        compLaneDelta: difference(activeCompLaneIds, compareCompLaneIds),
      }
    : null;

  const exportReport = () => {
    if (!compareState) return;
    const report = {
      format: 'ESL-TIMELINE-COMPARE',
      version: 1,
      generatedAt: Date.now(),
      activeBranchId,
      compareBranchId,
      compareLabel: compareLabel || null,
      activeHash,
      compareHash,
      summary: {
        tracks: comparison?.tracks || '0',
        regions: comparison?.regions || '0',
        markers: comparison?.markers || '0',
        groups: comparison?.groups || '0',
        compLanes: comparison?.compLanes || '0',
      },
      deltas: {
        tracks: comparison?.trackDelta,
        regions: comparison?.regionDelta,
        markers: comparison?.markerDelta,
        groups: comparison?.groupDelta,
        compLanes: comparison?.compLaneDelta,
      },
      heatmap: {
        durationSec: heatmap.durationSec,
        binSizeSec: heatmap.binSizeSec,
        totalScore: heatmap.totalScore,
        maxScore: heatmap.maxScore,
        changedTracks: heatmap.changedTracks,
        changedRegions: heatmap.changedRegions,
        changedMarkers: heatmap.changedMarkers,
        changedAutomationLanes: heatmap.changedAutomationLanes,
        addedTracks: heatmap.addedTracks,
        removedTracks: heatmap.removedTracks,
        addedRegions: heatmap.addedRegions,
        removedRegions: heatmap.removedRegions,
        addedMarkers: heatmap.addedMarkers,
        removedMarkers: heatmap.removedMarkers,
        addedAutomationLanes: heatmap.addedAutomationLanes,
        removedAutomationLanes: heatmap.removedAutomationLanes,
      },
    };
    downloadText(JSON.stringify(report, null, 2), 'timeline-compare-report.json', 'application/json');
  };

  const exportSnapshot = () => {
    if (!compareState) return;
    const snapshot = buildTimelineCompareSnapshot(activeState, compareState, heatmap, {
      activeBranchId,
      compareBranchId,
      compareLabel: compareLabel || null,
      activeHash,
      compareHash,
    });
    downloadText(serializeTimelineCompareSnapshotJson(snapshot), 'timeline-compare-snapshot.json', 'application/json');
    downloadText(serializeTimelineCompareSnapshotSvg(snapshot), 'timeline-compare-snapshot.svg', 'image/svg+xml');
  };

  useEffect(() => {
    if (!compareState || !onSeekToTime) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;

      const key = event.key.toLowerCase();
      if (key === '[') {
        event.preventDefault();
        onSeekToTime(previousHotspot?.startSec ?? strongestHotspot?.startSec ?? 0);
      } else if (key === ']') {
        event.preventDefault();
        onSeekToTime(nextHotspot?.startSec ?? strongestHotspot?.startSec ?? 0);
      } else if (key === 's') {
        event.preventDefault();
        exportSnapshot();
      } else if (key === 'm' && onMergeCompareIntoActive) {
        event.preventDefault();
        void onMergeCompareIntoActive(mergeStrategy);
      } else if (key === 'o' && onOpenMerge) {
        event.preventDefault();
        onOpenMerge();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    compareState,
    exportSnapshot,
    mergeStrategy,
    nextHotspot,
    onMergeCompareIntoActive,
    onOpenMerge,
    onSeekToTime,
    previousHotspot,
    strongestHotspot,
  ]);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Branch compare</p>
          <p className="text-[11px] text-slate-400">
            Active <span className="font-mono text-cyan-300">{activeHash.slice(0, 12)}</span>
            {' '}vs compare {compareHash ? <span className="font-mono text-fuchsia-300">{compareHash.slice(0, 12)}</span> : 'none'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {compareState && (
            <button
              type="button"
              onClick={exportReport}
              className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20"
            >
              Export Review
            </button>
          )}
          {compareState && (
            <button
              type="button"
              onClick={exportSnapshot}
              className="rounded border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20"
              >
                Export Snapshot
              </button>
            )}
          {compareState && onMergeCompareIntoActive && (
            <>
              <select
                value={mergeStrategy}
                onChange={(event) => setMergeStrategy(event.target.value as MergeStrategy)}
                className="rounded border border-white/15 bg-slate-900 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-100"
                title="Choose how compare-branch changes should resolve when merged into the active branch."
              >
                <option value="THEIRS">Compare wins</option>
                <option value="OURS">Active wins</option>
              </select>
              <button
                type="button"
                onClick={() => void onMergeCompareIntoActive(mergeStrategy)}
                className="rounded border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/20"
              >
                Merge Compare
              </button>
            </>
          )}
          {compareState && onOpenMerge && (
            <button
              type="button"
              onClick={onOpenMerge}
              className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
            >
              Manual Merge
            </button>
          )}
          {compareState && onSeekToTime && (
            <>
              <button
                type="button"
                onClick={() => onSeekToTime(previousHotspot?.startSec ?? strongestHotspot?.startSec ?? 0)}
                disabled={!previousHotspot && !strongestHotspot}
                className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev Hotspot
              </button>
              <button
                type="button"
                onClick={() => onSeekToTime(nextHotspot?.startSec ?? strongestHotspot?.startSec ?? 0)}
                disabled={!nextHotspot && !strongestHotspot}
                className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next Hotspot
              </button>
            </>
          )}
          <select
            value={compareBranchId || ''}
            onChange={(event) => onSelectCompareBranch(event.target.value || null)}
            className="rounded border border-white/15 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="">No compare</option>
            {branches
              .filter((branch) => branch.id !== activeBranchId)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {comparison ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Tracks</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{comparison.tracks}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Regions</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{comparison.regions}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Markers</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{comparison.markers}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Groups</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{comparison.groups}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Comp lanes</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{comparison.compLanes}</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80">Branch Diff Heatmap</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Structural change intensity across the timeline. Hotter bins indicate more edit activity.
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                Peak {heatmap.maxScore.toFixed(2)} · Total {heatmap.totalScore.toFixed(2)}
              </p>
            </div>
            <div className="mt-3 flex h-10 overflow-hidden rounded-lg border border-white/5 bg-black/20">
              {heatmap.bins.map((bin) => {
                const opacity = Math.max(0.08, 0.12 + bin.intensity * 0.88);
                const hue = 210 - Math.round(bin.intensity * 170);
                return (
                  <div
                    key={bin.index}
                    className="group relative flex-1 border-r border-black/30 last:border-r-0"
                    title={`${bin.startSec.toFixed(2)}s - ${bin.endSec.toFixed(2)}s\n${bin.labels.length ? bin.labels.join('\n') : 'No edits'}`}
                    style={{ background: `hsla(${hue}, 90%, 62%, ${opacity})` }}
                  >
                    <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/20" />
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-white/10" />
                    {bin.labels.length > 0 && (
                      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="absolute bottom-0 left-0 right-0 rounded-t bg-slate-950/90 px-2 py-1 text-[10px] text-slate-100">
                          {bin.labels[0]}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              <span className="rounded-full border border-white/10 px-2 py-1">Added regions {heatmap.addedRegions}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Removed regions {heatmap.removedRegions}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Changed regions {heatmap.changedRegions}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Added markers {heatmap.addedMarkers}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Removed markers {heatmap.removedMarkers}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Changed markers {heatmap.changedMarkers}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Added automation {heatmap.addedAutomationLanes}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Removed automation {heatmap.removedAutomationLanes}</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Changed automation {heatmap.changedAutomationLanes}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-500">
          Pick a branch to compare structure, head hash, and lane inventory.
        </p>
      )}
    </section>
  );
}

const TimelineBranchComparePanel = React.memo(TimelineBranchComparePanelComponent);

export default TimelineBranchComparePanel;
