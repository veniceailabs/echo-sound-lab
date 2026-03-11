import React from 'react';
import type { ReplayAutomationLane, ReplayTrackState } from '../services/deterministicReplayService';

interface AutomationLaneProps {
  track: ReplayTrackState;
  lanes: ReplayAutomationLane[];
  pxPerSec: number;
  laneWidth: number;
  isReadOnly?: boolean;
  onAddPoint: (trackId: string, parameter: string, timeSec: number, value: number) => void;
  showPlayhead?: boolean;
}

function AutomationLaneComponent({
  track,
  lanes,
  pxPerSec,
  laneWidth,
  isReadOnly = false,
  onAddPoint,
  showPlayhead = false,
}: AutomationLaneProps) {
  const normalizedLanes = lanes.length > 0
    ? lanes
    : [{ laneId: `${track.trackId}:volumeDb`, trackId: track.trackId, parameter: 'volumeDb', points: [] }];

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Automation</p>
        <button
          type="button"
          onClick={() => onAddPoint(track.trackId, 'volumeDb', 0, 0)}
          disabled={isReadOnly}
          className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Point
        </button>
      </div>

      {normalizedLanes.map((lane) => {
        const nextTime = lane.points.length > 0 ? lane.points[lane.points.length - 1].timeSec + 1 : 0;
        const nextValue = lane.points.length > 0 ? lane.points[lane.points.length - 1].value : 0;

        return (
          <div key={lane.laneId} className="mb-2 last:mb-0">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] text-slate-400">{lane.parameter}</p>
              <button
                type="button"
                onClick={() => onAddPoint(track.trackId, lane.parameter, Number(nextTime.toFixed(3)), Number(nextValue.toFixed(3)))}
                disabled={isReadOnly}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add @ {nextTime.toFixed(2)}s
              </button>
            </div>
            <div
              className="relative overflow-hidden rounded-lg border border-white/5 bg-slate-900/70"
              style={{ width: `${laneWidth}px`, minHeight: '32px' }}
            >
              {showPlayhead && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-cyan-300/80"
                  style={{ left: 'var(--timeline-playhead-left, 0px)' }}
                />
              )}
              {lane.points.map((point) => {
                const left = Math.max(0, point.timeSec * pxPerSec);
                return (
                  <div
                    key={point.pointId}
                    className="absolute top-2 h-4 w-4 -translate-x-1/2 rounded-full border border-cyan-200/60 bg-cyan-400/30"
                    style={{ left: `${left}px` }}
                    title={`${lane.parameter} ${point.value.toFixed(2)} @ ${point.timeSec.toFixed(2)}s`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const AutomationLane = React.memo(AutomationLaneComponent);

export default AutomationLane;
