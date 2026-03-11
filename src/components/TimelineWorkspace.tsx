import React, { useMemo, useState } from 'react';
import type { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import type { ReplayState } from '../services/deterministicReplayService';
import { TrackHeader } from './TrackHeader';
import { RegionLane } from './RegionLane';
import { AutomationLane } from './AutomationLane';

type TimelineActionType = Extract<
  APLProposal['action']['type'],
  'ADD_TRACK' | 'MOVE_REGION' | 'SPLIT_REGION' | 'SET_AUTOMATION_POINT'
>;

export interface TimelineActionRequest {
  actionType: TimelineActionType;
  trackId: string;
  trackName?: string;
  description?: string;
  parameters: Record<string, unknown>;
}

interface TimelineWorkspaceProps {
  timelineState: ReplayState;
  outputStateHash: string;
  isDispatching?: boolean;
  dispatchError?: string | null;
  onDispatchAction: (action: TimelineActionRequest) => void | Promise<void>;
}

function TimelineWorkspaceComponent({
  timelineState,
  outputStateHash,
  isDispatching = false,
  dispatchError = null,
  onDispatchAction,
}: TimelineWorkspaceProps) {
  const [zoom, setZoom] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(timelineState.tracks[0]?.trackId || null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const maxEndSec = useMemo(() => {
    if (timelineState.regions.length === 0) return 16;
    return timelineState.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 16);
  }, [timelineState.regions]);

  const pxPerSec = Math.min(220, Math.max(20, 42 * zoom));
  const laneWidth = Math.min(6000, Math.max(900, maxEndSec * pxPerSec + 120));

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Deterministic Timeline</p>
          <p className="text-[11px] text-slate-400">
            Hash <span className="font-mono text-cyan-300">{outputStateHash.slice(0, 16)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            Zoom
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="accent-cyan-400"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const nextIndex = timelineState.tracks.length + 1;
              const trackId = `track-${nextIndex}`;
              void onDispatchAction({
                actionType: 'ADD_TRACK',
                trackId,
                trackName: `Track ${nextIndex}`,
                description: `Add track ${nextIndex}`,
                parameters: {
                  trackId,
                  trackName: `Track ${nextIndex}`,
                  trackType: 'audio',
                },
              });
            }}
            disabled={isDispatching}
            className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Track
          </button>
        </div>
      </div>

      {dispatchError && (
        <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {dispatchError}
        </p>
      )}

      <div className="space-y-4">
        {timelineState.tracks.map((track) => {
          const trackRegions = timelineState.regions.filter((region) => region.trackId === track.trackId);
          const trackAutomation = timelineState.automation.filter((lane) => lane.trackId === track.trackId);

          return (
            <div key={track.trackId} className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr]">
              <TrackHeader
                track={track}
                regions={trackRegions}
                automationLanes={trackAutomation}
                isSelected={selectedTrackId === track.trackId}
                onSelect={setSelectedTrackId}
              />

              <div className="overflow-x-auto rounded-xl border border-white/5 p-2">
                <div style={{ width: `${laneWidth}px` }} className="space-y-2">
                  <RegionLane
                    track={track}
                    regions={trackRegions}
                    pxPerSec={pxPerSec}
                    laneWidth={laneWidth}
                    selectedRegionId={selectedRegionId}
                    onSelectRegion={setSelectedRegionId}
                    onMoveRegion={(region, nextStartSec) => {
                      void onDispatchAction({
                        actionType: 'MOVE_REGION',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Move ${region.regionId} to ${nextStartSec}s`,
                        parameters: {
                          regionId: region.regionId,
                          targetTrackId: track.trackId,
                          startTimeSec: nextStartSec,
                        },
                      });
                    }}
                    onSplitRegion={(region, splitTimeSec) => {
                      void onDispatchAction({
                        actionType: 'SPLIT_REGION',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Split ${region.regionId} at ${splitTimeSec}s`,
                        parameters: {
                          regionId: region.regionId,
                          splitTimeSec,
                          newRegionId: `${region.regionId}-r`,
                        },
                      });
                    }}
                  />

                  <AutomationLane
                    track={track}
                    lanes={trackAutomation}
                    pxPerSec={pxPerSec}
                    laneWidth={laneWidth}
                    onAddPoint={(targetTrackId, parameter, timeSec, value) => {
                      void onDispatchAction({
                        actionType: 'SET_AUTOMATION_POINT',
                        trackId: targetTrackId,
                        trackName: track.trackName,
                        description: `Set automation point ${parameter}`,
                        parameters: {
                          trackId: targetTrackId,
                          parameter,
                          timeSec,
                          value,
                        },
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const TimelineWorkspace = React.memo(TimelineWorkspaceComponent);

export default TimelineWorkspace;
