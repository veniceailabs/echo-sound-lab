import React from 'react';
import type { ReplayRegionState, ReplayTrackState } from '../services/deterministicReplayService';

interface RegionLaneProps {
  track: ReplayTrackState;
  regions: ReplayRegionState[];
  pxPerSec: number;
  laneWidth: number;
  isReadOnly?: boolean;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onMoveRegion: (region: ReplayRegionState, nextStartSec: number) => void;
  onSplitRegion: (region: ReplayRegionState, splitTimeSec: number) => void;
  showPlayhead?: boolean;
}

function RegionLaneComponent({
  track,
  regions,
  pxPerSec,
  laneWidth,
  isReadOnly = false,
  selectedRegionId,
  onSelectRegion,
  onMoveRegion,
  onSplitRegion,
  showPlayhead = false,
}: RegionLaneProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Regions</p>
        <p className="text-[10px] text-slate-500">{track.trackId}</p>
      </div>
      <div
        className="relative overflow-hidden rounded-lg border border-white/5 bg-slate-900/70"
        style={{ width: `${laneWidth}px`, minHeight: '54px' }}
      >
        {showPlayhead && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-cyan-300/80"
            style={{ left: 'var(--timeline-playhead-left, 0px)' }}
          />
        )}
        {regions.map((region) => {
          const left = Math.max(0, region.startTimeSec * pxPerSec);
          const width = Math.max(36, region.durationSec * pxPerSec);
          const splitTimeSec = region.startTimeSec + Math.max(region.durationSec / 2, 0.25);
          const isSelected = selectedRegionId === region.regionId;

          return (
            <div
              key={region.regionId}
              className={`absolute top-2 rounded-lg border px-2 py-1 shadow-sm ${
                isSelected
                  ? 'border-cyan-300/70 bg-cyan-500/20'
                  : 'border-orange-300/40 bg-orange-500/15'
              }`}
              style={{ left: `${left}px`, width: `${width}px` }}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelectRegion(region.regionId)}
              >
                <p className="truncate text-[11px] font-semibold text-slate-100">{region.regionId}</p>
                <p className="text-[10px] text-slate-300">
                  {region.startTimeSec.toFixed(2)}s → {(region.startTimeSec + region.durationSec).toFixed(2)}s
                </p>
              </button>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => onMoveRegion(region, Number((region.startTimeSec + 1).toFixed(3)))}
                  disabled={isReadOnly}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +1s
                </button>
                <button
                  type="button"
                  onClick={() => onSplitRegion(region, Number(splitTimeSec.toFixed(3)))}
                  disabled={isReadOnly}
                  className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Split
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const RegionLane = React.memo(RegionLaneComponent);

export default RegionLane;
