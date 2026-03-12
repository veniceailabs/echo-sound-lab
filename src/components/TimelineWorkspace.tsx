import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import type { ReplayState } from '../services/deterministicReplayService';
import { assetRegistry } from '../services/AssetRegistry';
import { TrackHeader } from './TrackHeader';
import { RegionLane } from './RegionLane';
import { AutomationLane } from './AutomationLane';
import PluginRack from './PluginRack';

type TimelineActionType = Extract<
  APLProposal['action']['type'],
  | 'ADD_TRACK'
  | 'ADD_REGION'
  | 'MOVE_REGION'
  | 'SPLIT_REGION'
  | 'SET_AUTOMATION_POINT'
  | 'ADD_PLUGIN'
  | 'SET_PLUGIN_PARAM'
>;

const AUDIO_FILE_EXTENSION_PATTERN = /\.(wav|mp3|aif|aiff|flac|m4a|ogg)$/i;

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  return AUDIO_FILE_EXTENSION_PATTERN.test(file.name);
}

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
  isReadOnly?: boolean;
  dispatchError?: string | null;
  onDispatchAction: (action: TimelineActionRequest) => void | Promise<void>;
  isTransportPlaying?: boolean;
  getTransportPlayheadSeconds?: () => number;
  transportTick?: number;
  isGeneratingIntent?: boolean;
  onGenerateIntent?: (intent: string, trackId: string) => void | Promise<void>;
}

function TimelineWorkspaceComponent({
  timelineState,
  outputStateHash,
  isDispatching = false,
  isReadOnly = false,
  dispatchError = null,
  onDispatchAction,
  isTransportPlaying = false,
  getTransportPlayheadSeconds,
  transportTick = 0,
  isGeneratingIntent = false,
  onGenerateIntent,
}: TimelineWorkspaceProps) {
  const [zoom, setZoom] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(timelineState.tracks[0]?.trackId || null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [intentPrompt, setIntentPrompt] = useState('');
  const timelineSurfaceRef = useRef<HTMLDivElement | null>(null);

  const maxEndSec = useMemo(() => {
    if (timelineState.regions.length === 0) return 16;
    return timelineState.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 16);
  }, [timelineState.regions]);

  const pxPerSec = Math.min(220, Math.max(20, 42 * zoom));
  const laneWidth = Math.min(6000, Math.max(900, maxEndSec * pxPerSec + 120));

  const updatePlayheadCss = useCallback(() => {
    if (!timelineSurfaceRef.current || !getTransportPlayheadSeconds) return;
    const sec = Math.max(0, getTransportPlayheadSeconds());
    const left = Math.max(0, Math.min(laneWidth, sec * pxPerSec));
    timelineSurfaceRef.current.style.setProperty('--timeline-playhead-left', `${left}px`);
  }, [getTransportPlayheadSeconds, laneWidth, pxPerSec]);

  useEffect(() => {
    updatePlayheadCss();
  }, [transportTick, updatePlayheadCss]);

  useEffect(() => {
    if (!isTransportPlaying || !getTransportPlayheadSeconds) return;
    let rafId = 0;
    const loop = () => {
      updatePlayheadCss();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [getTransportPlayheadSeconds, isTransportPlaying, updatePlayheadCss]);

  const handleDroppedFiles = useCallback(async (files: File[]) => {
    if (isReadOnly || isDispatching) return;
    if (!files.length) return;

    const targetTrackId = selectedTrackId || timelineState.tracks[0]?.trackId;
    if (!targetTrackId) return;
    const targetTrackName = timelineState.tracks.find((track) => track.trackId === targetTrackId)?.trackName || targetTrackId;

    const nowTag = Date.now().toString(36);
    let timelineAnchorSec = Math.max(
      0,
      ...timelineState.regions
        .filter((region) => region.trackId === targetTrackId)
        .map((region) => region.startTimeSec + region.durationSec)
    );

    const audioFiles = files.filter(isAudioFile);
    for (let index = 0; index < audioFiles.length; index += 1) {
      const file = audioFiles[index];
      const registration = await assetRegistry.registerFile(file);
      const decoded = await assetRegistry.ensureDecodedBuffer(registration.assetId);
      const durationSec = decoded?.duration && Number.isFinite(decoded.duration)
        ? Number(decoded.duration.toFixed(6))
        : 8;
      const regionId = `region-${targetTrackId}-${nowTag}-${index + 1}`;

      await onDispatchAction({
        actionType: 'ADD_REGION',
        trackId: targetTrackId,
        trackName: targetTrackName,
        description: `Add region from ${file.name}`,
        parameters: {
          trackId: targetTrackId,
          trackName: targetTrackName,
          regionId,
          assetId: registration.assetId,
          sourceId: registration.assetId,
          startTimeSec: Number(timelineAnchorSec.toFixed(3)),
          offsetSec: 0,
          durationSec,
          gainDb: 0,
        },
      });

      setSelectedRegionId(regionId);
      timelineAnchorSec += durationSec + 0.05;
    }
  }, [isDispatching, isReadOnly, onDispatchAction, selectedTrackId, timelineState.regions, timelineState.tracks]);

  return (
    <section
      className={`rounded-2xl border bg-slate-950/45 p-4 transition-colors ${
        isDragOver ? 'border-cyan-300/70' : 'border-white/10'
      }`}
      onDragOver={(event) => {
        if (isReadOnly || isDispatching) return;
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragEnter={(event) => {
        if (isReadOnly || isDispatching) return;
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setIsDragOver(false);
      }}
      onDrop={(event) => {
        if (isReadOnly || isDispatching) return;
        event.preventDefault();
        setIsDragOver(false);
        const dropped = Array.from(event.dataTransfer?.files || []);
        void handleDroppedFiles(dropped);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Deterministic Timeline</p>
          <p className="text-[11px] text-slate-400">
            Hash <span className="font-mono text-cyan-300">{outputStateHash.slice(0, 16)}</span>
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Drop audio files to ingest assets and append regions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={intentPrompt}
              onChange={(event) => setIntentPrompt(event.target.value)}
              placeholder="Describe intent (e.g., make vocals aggressive)"
              className="w-64 rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500"
              disabled={isDispatching || isReadOnly || isGeneratingIntent || !onGenerateIntent}
            />
            <button
              type="button"
              onClick={() => {
                if (!onGenerateIntent) return;
                const intent = intentPrompt.trim();
                if (!intent) return;
                const trackId = selectedTrackId || timelineState.tracks[0]?.trackId || 'track-main';
                void Promise.resolve(onGenerateIntent(intent, trackId)).then(() => {
                  setIntentPrompt('');
                });
              }}
              disabled={isDispatching || isReadOnly || isGeneratingIntent || !intentPrompt.trim() || !onGenerateIntent}
              className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingIntent ? 'Generating…' : 'AI Propose'}
            </button>
          </div>
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
            disabled={isDispatching || isReadOnly}
            className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Track
          </button>
        </div>
      </div>

      {isReadOnly && (
        <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Read-only preview mode. Jump to latest or restore this state before editing.
        </p>
      )}

      {dispatchError && (
        <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {dispatchError}
        </p>
      )}

      <div ref={timelineSurfaceRef} className="space-y-4">
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
                  <PluginRack
                    track={track}
                    isReadOnly={isReadOnly}
                    onAddPlugin={(manifestId) => {
                      const existingIds = new Set((track.inserts || []).map((insert) => insert.instanceId));
                      const suffix = manifestId.split('.').slice(-1)[0] || 'plugin';
                      let index = (track.inserts || []).filter((insert) => insert.manifestId === manifestId).length + 1;
                      let instanceId = `${track.trackId}-${suffix}-${index}`;
                      while (existingIds.has(instanceId)) {
                        index += 1;
                        instanceId = `${track.trackId}-${suffix}-${index}`;
                      }
                      void onDispatchAction({
                        actionType: 'ADD_PLUGIN',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Insert ${manifestId} on ${track.trackName}`,
                        parameters: {
                          trackId: track.trackId,
                          instanceId,
                          manifestId,
                        },
                      });
                    }}
                    onSetPluginParam={({ trackId, instanceId, paramId, value }) => {
                      void onDispatchAction({
                        actionType: 'SET_PLUGIN_PARAM',
                        trackId,
                        trackName: track.trackName,
                        description: `Set ${paramId} on ${instanceId}`,
                        parameters: {
                          trackId,
                          instanceId,
                          paramId,
                          value,
                        },
                      });
                    }}
                  />

                  <RegionLane
                    track={track}
                    regions={trackRegions}
                    pxPerSec={pxPerSec}
                    laneWidth={laneWidth}
                    isReadOnly={isReadOnly}
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
                    showPlayhead={Boolean(getTransportPlayheadSeconds)}
                  />

                  <AutomationLane
                    track={track}
                    lanes={trackAutomation}
                    pxPerSec={pxPerSec}
                    laneWidth={laneWidth}
                    isReadOnly={isReadOnly}
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
                    showPlayhead={Boolean(getTransportPlayheadSeconds)}
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
