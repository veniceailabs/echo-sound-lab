import React from 'react';
import type {
  ReplayAutomationLane,
  ReplayRegionState,
  ReplayTrackGroup,
  ReplayTrackState,
} from '../services/deterministicReplayService';

interface TrackHeaderProps {
  track: ReplayTrackState;
  regions: ReplayRegionState[];
  automationLanes: ReplayAutomationLane[];
  midiNoteCount?: number;
  trackGroups: ReplayTrackGroup[];
  isSelected: boolean;
  onSelect: (trackId: string) => void;
  onSetTrackGroup: (trackId: string, groupId: string) => void;
  onCreateTrackGroup?: (trackId: string, groupName: string) => void;
}

function TrackHeaderComponent({
  track,
  regions,
  automationLanes,
  midiNoteCount = 0,
  trackGroups,
  isSelected,
  onSelect,
  onSetTrackGroup,
  onCreateTrackGroup,
}: TrackHeaderProps) {
  const automationPointCount = automationLanes.reduce((total, lane) => total + lane.points.length, 0);
  const pluginCount = track.inserts?.length || 0;

  return (
    <div
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        isSelected
          ? 'border-cyan-400/60 bg-cyan-500/10'
          : 'border-white/10 bg-slate-950/40 hover:border-cyan-400/30'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(track.trackId)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <p className="truncate text-sm font-semibold text-slate-100">{track.trackName}</p>
        <span className="rounded bg-slate-900/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {track.kind}
        </span>
      </button>
      <p className="mt-2 text-[11px] text-slate-400">
        {regions.length} region{regions.length === 1 ? '' : 's'} • {midiNoteCount} MIDI note{midiNoteCount === 1 ? '' : 's'} • {automationPointCount} automation point{automationPointCount === 1 ? '' : 's'} • {pluginCount} insert{pluginCount === 1 ? '' : 's'}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
        Route {track.outputBusId || 'master'}{track.sends?.length ? ` • ${track.sends.length} aux` : ''}
      </p>
      <div className="mt-2">
        <label className="block text-[9px] uppercase tracking-[0.16em] text-slate-500">
          Group
        </label>
        <div className="mt-1 flex gap-2">
          <select
            value={track.groupId ?? ''}
            onChange={(event) => onSetTrackGroup(track.trackId, event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100"
          >
            <option value="">No group</option>
            {trackGroups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.name}
              </option>
            ))}
          </select>
          {onCreateTrackGroup && (
            <button
              type="button"
              onClick={() => {
                const suggested = `${track.trackName} Group`;
                const rawName = typeof window !== 'undefined'
                  ? window.prompt('Track group name', suggested)
                  : suggested;
                const groupName = rawName?.trim();
                if (!groupName) return;
                onCreateTrackGroup(track.trackId, groupName);
              }}
              className="shrink-0 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/20"
            >
              New
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const TrackHeader = React.memo(TrackHeaderComponent);

export default TrackHeader;
