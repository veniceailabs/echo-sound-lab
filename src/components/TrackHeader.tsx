import React from 'react';
import type { ReplayAutomationLane, ReplayRegionState, ReplayTrackState } from '../services/deterministicReplayService';

interface TrackHeaderProps {
  track: ReplayTrackState;
  regions: ReplayRegionState[];
  automationLanes: ReplayAutomationLane[];
  isSelected: boolean;
  onSelect: (trackId: string) => void;
}

function TrackHeaderComponent({
  track,
  regions,
  automationLanes,
  isSelected,
  onSelect,
}: TrackHeaderProps) {
  const automationPointCount = automationLanes.reduce((total, lane) => total + lane.points.length, 0);

  return (
    <button
      type="button"
      onClick={() => onSelect(track.trackId)}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        isSelected
          ? 'border-cyan-400/60 bg-cyan-500/10'
          : 'border-white/10 bg-slate-950/40 hover:border-cyan-400/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-100">{track.trackName}</p>
        <span className="rounded bg-slate-900/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {track.kind}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {regions.length} region{regions.length === 1 ? '' : 's'} • {automationPointCount} automation point{automationPointCount === 1 ? '' : 's'}
      </p>
    </button>
  );
}

export const TrackHeader = React.memo(TrackHeaderComponent);

export default TrackHeader;
