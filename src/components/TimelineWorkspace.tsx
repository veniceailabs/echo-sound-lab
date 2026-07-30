import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import type { ReplayCompLane, ReplayMidiNote, ReplayState, ReplayTrackSend } from '../services/deterministicReplayService';
import { assetRegistry } from '../services/AssetRegistry';
import { estimatePluginLatencyMs } from '../services/plugins/pluginRegistry';
import { TrackHeader } from './TrackHeader';
import { RegionLane } from './RegionLane';
import { AutomationLane } from './AutomationLane';
import MidiPianoRollPanel from './MidiPianoRollPanel';
import RoutingGraphPanel from './RoutingGraphPanel';
import PluginRack from './PluginRack';
import TrackRoutingPanel from './TrackRoutingPanel';
import { buildTimelineBranchDiffSummary } from '../services/timelineBranchDiffService';

type TimelineActionType = Extract<
  APLProposal['action']['type'],
  | 'ADD_TRACK'
  | 'ADD_REGION'
  | 'MOVE_REGION'
  | 'TRIM_REGION'
  | 'SLIP_REGION'
  | 'APPLY_CROSSFADE'
  | 'SET_TRACK_GROUP'
  | 'SET_REGION_GAIN'
  | 'ADD_MARKER'
  | 'UPDATE_MARKER'
  | 'REMOVE_MARKER'
  | 'CREATE_COMP_LANE'
  | 'SET_COMP_LANE_ACTIVE'
  | 'COLLAPSE_COMP_LANE_TO_ACTIVE'
  | 'RENAME_COMP_LANE'
  | 'REORDER_COMP_LANE_TAKE'
  | 'SPLIT_REGION'
  | 'SET_AUTOMATION_POINT'
  | 'SET_AUTOMATION_MODE'
  | 'ADD_MIDI_NOTE'
  | 'SET_MIDI_NOTE'
  | 'REMOVE_MIDI_NOTE'
  | 'ADD_PLUGIN'
  | 'SET_TRACK_ROUTING'
  | 'SET_TRACK_SEND'
  | 'REMOVE_TRACK_SEND'
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
  compareState?: ReplayState | null;
  outputStateHash: string;
  isDispatching?: boolean;
  isReadOnly?: boolean;
  dispatchError?: string | null;
  onDispatchAction: (action: TimelineActionRequest) => void | Promise<void>;
  onCreateTrackGroup?: (trackId: string, groupName: string) => void;
  isTransportPlaying?: boolean;
  getTransportPlayheadSeconds?: () => number;
  transportTick?: number;
  isGeneratingIntent?: boolean;
  onGenerateIntent?: (intent: string, trackId: string) => void | Promise<void>;
  onApplyAutomationPlan?: () => void | Promise<void>;
  isApplyingAutomationPlan?: boolean;
  onExportAafAdapter?: () => void;
  onExportOmfAdapter?: () => void;
  onImportTimelinePackage?: (file: File) => Promise<void>;
  onExportMarkers?: () => void;
  onImportMarkers?: (file: File) => Promise<void>;
  onAuditionCompLane?: (trackId: string, laneId: string) => void;
  onReorderCompLaneTake?: (trackId: string, laneId: string, regionId: string, direction: 'up' | 'down') => void;
  onCycleCompLaneTake?: (trackId: string, laneId: string, direction: 'prev' | 'next') => void;
  onCollapseCompLaneToActive?: (trackId: string, laneId: string) => void;
  onSeekToTime?: (timeSec: number) => void;
  onReorderTrackPlugin?: (trackId: string, instanceId: string, direction: 'left' | 'right') => void;
  onRemoveTrackPlugin?: (trackId: string, instanceId: string) => void;
  onSetTrackRouting?: (trackId: string, outputBusId: string | null) => void;
  onSetTrackSend?: (trackId: string, send: ReplayTrackSend) => void;
  onRemoveTrackSend?: (trackId: string, sendId: string) => void;
}

function TimelineWorkspaceComponent({
  timelineState,
  compareState = null,
  outputStateHash,
  isDispatching = false,
  isReadOnly = false,
  dispatchError = null,
  onDispatchAction,
  onCreateTrackGroup,
  isTransportPlaying = false,
  getTransportPlayheadSeconds,
  transportTick = 0,
  isGeneratingIntent = false,
  onGenerateIntent,
  onApplyAutomationPlan,
  isApplyingAutomationPlan = false,
  onExportAafAdapter,
  onExportOmfAdapter,
  onImportTimelinePackage,
  onExportMarkers,
  onImportMarkers,
  onAuditionCompLane,
  onReorderCompLaneTake,
  onCycleCompLaneTake,
  onCollapseCompLaneToActive,
  onSeekToTime,
  onReorderTrackPlugin,
  onRemoveTrackPlugin,
  onSetTrackRouting,
  onSetTrackSend,
  onRemoveTrackSend,
}: TimelineWorkspaceProps) {
  const [zoom, setZoom] = useState(1);
  const [newTrackType, setNewTrackType] = useState<'audio' | 'midi' | 'bus'>('audio');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(timelineState.tracks[0]?.trackId || null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('esl.timeline.snapToGrid');
    return stored === null ? true : stored !== 'false';
  });
  const [snapStepSec, setSnapStepSec] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.25;
    const stored = Number(window.localStorage.getItem('esl.timeline.snapStepSec'));
    return Number.isFinite(stored) && stored > 0 ? stored : 0.25;
  });
  const [intentPrompt, setIntentPrompt] = useState('');
  const timelineSurfaceRef = useRef<HTMLDivElement | null>(null);
  const markerImportRef = useRef<HTMLInputElement | null>(null);
  const interchangeImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void assetRegistry.whenReady().catch(() => {});
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('esl.timeline.snapToGrid', String(snapToGrid));
      window.localStorage.setItem('esl.timeline.snapStepSec', String(snapStepSec));
    } catch {}
  }, [snapStepSec, snapToGrid]);

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

  const sortedMarkers = useMemo(() => {
    return [...(timelineState.markers || [])].sort((a, b) => a.timeSec - b.timeSec);
  }, [timelineState.markers]);

  const trackGroups = timelineState.trackGroups || [];
  const compLanes = timelineState.compLanes || [];
  const automationMode = String((timelineState.metadata as Record<string, unknown> | undefined)?.automationMode || 'read');
  const selectedTrack = useMemo(
    () => timelineState.tracks.find((track) => track.trackId === selectedTrackId) || timelineState.tracks[0] || null,
    [selectedTrackId, timelineState.tracks]
  );
  const midiNotesByTrackId = useMemo(() => {
    const map = new Map<string, ReplayMidiNote[]>();
    for (const note of timelineState.midiNotes || []) {
      if (!map.has(note.trackId)) map.set(note.trackId, []);
      map.get(note.trackId)!.push(note);
    }
    for (const notes of map.values()) {
      notes.sort((left, right) => (left.startTimeSec === right.startTimeSec
        ? left.pitch - right.pitch
        : left.startTimeSec - right.startTimeSec));
    }
    return map;
  }, [timelineState.midiNotes]);
  const trackLatencyById = useMemo(() => {
    const trackById = new Map(timelineState.tracks.map((track) => [track.trackId, track]));
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    const resolveLocalLatency = (trackId: string): number => {
      const track = trackById.get(trackId);
      if (!track) return 0;
      return (track.inserts || []).reduce((total, insert) => total + estimatePluginLatencyMs(insert.manifestId, insert.parameters || {}), 0);
    };

    const resolvePathLatency = (trackId: string): number => {
      const cached = memo.get(trackId);
      if (cached !== undefined) return cached;
      if (visiting.has(trackId)) return 0;
      visiting.add(trackId);

      const track = trackById.get(trackId);
      let total = resolveLocalLatency(trackId);
      const nextId = track?.outputBusId && track.outputBusId !== trackId ? track.outputBusId : null;
      if (nextId) {
        total += resolvePathLatency(nextId);
      }

      visiting.delete(trackId);
      memo.set(trackId, total);
      return total;
    };

    let maxLatency = 0;
    for (const track of timelineState.tracks) {
      maxLatency = Math.max(maxLatency, resolvePathLatency(track.trackId));
    }

    const result: Record<string, { estimatedLatencyMs: number; compensationMs: number }> = {};
    for (const track of timelineState.tracks) {
      const estimatedLatencyMs = resolvePathLatency(track.trackId);
      result[track.trackId] = {
        estimatedLatencyMs,
        compensationMs: Math.max(0, maxLatency - estimatedLatencyMs),
      };
    }
    return result;
  }, [timelineState.tracks]);
  const selectedTrackRegions = useMemo(
    () => (selectedTrack ? timelineState.regions.filter((region) => region.trackId === selectedTrack.trackId) : []),
    [selectedTrack, timelineState.regions]
  );
  const selectedTrackCompLanes = useMemo(
    () => (selectedTrack ? compLanes.filter((lane) => lane.trackId === selectedTrack.trackId) : []),
    [compLanes, selectedTrack]
  );
  const compareRegionsById = useMemo(() => new Map((compareState?.regions || []).map((region) => [region.regionId, region])), [compareState]);
  const compareMarkersById = useMemo(() => new Map((compareState?.markers || []).map((marker) => [marker.id, marker])), [compareState]);
  const compareHeatmap = useMemo(() => buildTimelineBranchDiffSummary(timelineState, compareState), [compareState, timelineState]);
  const compareStripWidth = Math.max(laneWidth, compareState ? Math.max(900, compareState.regions.reduce((max, region) => Math.max(max, region.startTimeSec + region.durationSec), 16) * pxPerSec + 120) : laneWidth);
  const selectedRegion = useMemo(
    () => timelineState.regions.find((region) => region.regionId === selectedRegionId) || null,
    [selectedRegionId, timelineState.regions]
  );
  const selectedRegionTrack = useMemo(
    () => selectedRegion ? timelineState.tracks.find((track) => track.trackId === selectedRegion.trackId) || null : null,
    [selectedRegion, timelineState.tracks]
  );

  const getRegionCompareStatus = useCallback((regionId: string) => {
    const compareRegion = compareRegionsById.get(regionId);
    const currentRegion = timelineState.regions.find((region) => region.regionId === regionId);
    if (!currentRegion) return 'removed' as const;
    if (!compareRegion) return 'added' as const;
    if (
      compareRegion.trackId !== currentRegion.trackId ||
      compareRegion.startTimeSec !== currentRegion.startTimeSec ||
      compareRegion.durationSec !== currentRegion.durationSec ||
      compareRegion.offsetSec !== currentRegion.offsetSec ||
      compareRegion.gainDb !== currentRegion.gainDb ||
      compareRegion.compLaneId !== currentRegion.compLaneId ||
      compareRegion.compTakeIndex !== currentRegion.compTakeIndex ||
      compareRegion.fadeInSec !== currentRegion.fadeInSec ||
      compareRegion.fadeOutSec !== currentRegion.fadeOutSec
    ) {
      return 'changed' as const;
    }
    return 'unchanged' as const;
  }, [compareRegionsById, timelineState.regions]);

  const getMarkerCompareStatus = useCallback((markerId: string) => {
    const compareMarker = compareMarkersById.get(markerId);
    const currentMarker = (timelineState.markers || []).find((marker) => marker.id === markerId);
    if (!currentMarker) return 'removed' as const;
    if (!compareMarker) return 'added' as const;
    if (
      compareMarker.timeSec !== currentMarker.timeSec ||
      compareMarker.label !== currentMarker.label ||
      compareMarker.color !== currentMarker.color ||
      (compareMarker.note || '') !== (currentMarker.note || '')
    ) {
      return 'changed' as const;
    }
    return 'unchanged' as const;
  }, [compareMarkersById, timelineState.markers]);

  const dispatchRegionAction = useCallback((actionType: TimelineActionType, description: string, parameters: Record<string, unknown>, trackId?: string, trackName?: string) => {
    const resolvedTrackId = trackId || selectedRegionTrack?.trackId || selectedTrack?.trackId || timelineState.tracks[0]?.trackId || 'track-main';
    const resolvedTrackName = trackName || selectedRegionTrack?.trackName || selectedTrack?.trackName || resolvedTrackId;
    void onDispatchAction({
      actionType,
      trackId: resolvedTrackId,
      trackName: resolvedTrackName,
      description,
      parameters,
    });
  }, [onDispatchAction, selectedRegionTrack, selectedTrack, timelineState.tracks]);

  const nudgeSelectedRegion = useCallback((direction: -1 | 1, multiplier = 1) => {
    if (!selectedRegion || !selectedRegionTrack) return;
    const step = Math.max(0.01, snapStepSec * multiplier);
    const nextStart = Number(Math.max(0, selectedRegion.startTimeSec + direction * step).toFixed(3));
    dispatchRegionAction('MOVE_REGION', `Nudge ${selectedRegion.regionId}`, {
      regionId: selectedRegion.regionId,
      targetTrackId: selectedRegion.trackId,
      startTimeSec: nextStart,
    }, selectedRegionTrack.trackId, selectedRegionTrack.trackName);
  }, [dispatchRegionAction, selectedRegion, selectedRegionTrack, snapStepSec]);

  const trimSelectedRegion = useCallback((side: 'left' | 'right', direction: -1 | 1) => {
    if (!selectedRegion || !selectedRegionTrack) return;
    const step = Math.max(0.01, snapStepSec);
    dispatchRegionAction('TRIM_REGION', `Trim ${side} ${selectedRegion.regionId}`, {
      regionId: selectedRegion.regionId,
      side,
      amountSec: Number(Math.max(0.01, step * direction).toFixed(3)),
    }, selectedRegionTrack.trackId, selectedRegionTrack.trackName);
  }, [dispatchRegionAction, selectedRegion, selectedRegionTrack, snapStepSec]);

  const splitSelectedRegion = useCallback(() => {
    if (!selectedRegion || !selectedRegionTrack) return;
    const splitTimeSec = Math.max(
      selectedRegion.startTimeSec + 0.05,
      Math.min(
        selectedRegion.startTimeSec + selectedRegion.durationSec - 0.05,
        snapToGrid
          ? Math.round((selectedRegion.startTimeSec + selectedRegion.durationSec / 2) / snapStepSec) * snapStepSec
          : selectedRegion.startTimeSec + selectedRegion.durationSec / 2
      )
    );
    dispatchRegionAction('SPLIT_REGION', `Split ${selectedRegion.regionId}`, {
      regionId: selectedRegion.regionId,
      splitTimeSec: Number(splitTimeSec.toFixed(3)),
      newRegionId: `${selectedRegion.regionId}-split-${Date.now().toString(36)}`,
    }, selectedRegionTrack.trackId, selectedRegionTrack.trackName);
  }, [dispatchRegionAction, selectedRegion, selectedRegionTrack, snapStepSec, snapToGrid]);

  const duplicateSelectedRegion = useCallback(() => {
    if (!selectedRegion || !selectedRegionTrack) return;
    dispatchRegionAction('ADD_REGION', `Duplicate ${selectedRegion.regionId}`, {
      trackId: selectedRegion.trackId,
      trackName: selectedRegionTrack.trackName,
      regionId: `${selectedRegion.regionId}-copy-${Date.now().toString(36)}`,
      sourceId: selectedRegion.sourceId,
      startTimeSec: Number((selectedRegion.startTimeSec + selectedRegion.durationSec + snapStepSec).toFixed(3)),
      offsetSec: selectedRegion.offsetSec,
      durationSec: selectedRegion.durationSec,
      gainDb: selectedRegion.gainDb ?? 0,
      compLaneId: selectedRegion.compLaneId ?? null,
      compTakeIndex: selectedRegion.compTakeIndex ?? null,
    }, selectedRegionTrack.trackId, selectedRegionTrack.trackName);
  }, [dispatchRegionAction, selectedRegion, selectedRegionTrack, snapStepSec]);

  const selectAdjacentRegion = useCallback((direction: -1 | 1) => {
    const trackId = selectedRegion?.trackId || selectedTrack?.trackId;
    if (!trackId) return;
    const regions = timelineState.regions
      .filter((region) => region.trackId === trackId)
      .sort((left, right) => left.startTimeSec === right.startTimeSec
        ? left.regionId.localeCompare(right.regionId)
        : left.startTimeSec - right.startTimeSec);
    if (!regions.length) return;
    const currentIndex = Math.max(0, regions.findIndex((region) => region.regionId === selectedRegionId));
    const nextIndex = Math.max(0, Math.min(regions.length - 1, currentIndex + direction));
    setSelectedRegionId(regions[nextIndex]?.regionId || null);
  }, [selectedRegion, selectedRegionId, selectedTrack, timelineState.regions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = Boolean(target?.isContentEditable) || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isEditable || isReadOnly || isDispatching) return;

      const key = event.key.toLowerCase();
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && key === 'z') return;

      if (key === 'arrowup') {
        event.preventDefault();
        selectAdjacentRegion(-1);
        return;
      }

      if (key === 'arrowdown') {
        event.preventDefault();
        selectAdjacentRegion(1);
        return;
      }

      if (event.altKey && key === 'arrowleft') {
        event.preventDefault();
        if (event.shiftKey) trimSelectedRegion('left', -1);
        else nudgeSelectedRegion(-1, event.metaKey || event.ctrlKey ? 4 : 1);
        return;
      }

      if (event.altKey && key === 'arrowright') {
        event.preventDefault();
        if (event.shiftKey) trimSelectedRegion('right', 1);
        else nudgeSelectedRegion(1, event.metaKey || event.ctrlKey ? 4 : 1);
        return;
      }

      if (key === 's') {
        event.preventDefault();
        splitSelectedRegion();
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        duplicateSelectedRegion();
        return;
      }

      if (key === 'f') {
        event.preventDefault();
        if (!selectedRegion || !selectedRegionTrack) return;
        dispatchRegionAction('APPLY_CROSSFADE', `Crossfade ${selectedRegion.regionId}`, {
          regionId: selectedRegion.regionId,
          fadeInSec: 0.15,
          fadeOutSec: 0.15,
        }, selectedRegionTrack.trackId, selectedRegionTrack.trackName);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duplicateSelectedRegion, dispatchRegionAction, isDispatching, isReadOnly, nudgeSelectedRegion, selectAdjacentRegion, selectedRegion, selectedRegionTrack, splitSelectedRegion, trimSelectedRegion]);

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
              title="Describe the mix move you want the AI to propose."
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
              title={onGenerateIntent ? 'Generate deterministic APL proposals from your intent.' : 'Intent generation is not available yet.'}
              className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-indigo-200 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingIntent ? 'Generating…' : 'AI Propose'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const markerId = `marker-${Date.now().toString(36)}`;
                const timeSec = Math.max(0, getTransportPlayheadSeconds ? Number(getTransportPlayheadSeconds().toFixed(3)) : 0);
                const baseTrackId = selectedTrackId || timelineState.tracks[0]?.trackId || 'track-main';
                const baseTrackName = timelineState.tracks.find((track) => track.trackId === baseTrackId)?.trackName || baseTrackId;
                void onDispatchAction({
                  actionType: 'ADD_MARKER',
                  trackId: baseTrackId,
                  trackName: baseTrackName,
                  description: `Add marker at ${timeSec.toFixed(2)}s`,
                  parameters: {
                    markerId,
                    timeSec,
                    label: `Marker ${sortedMarkers.length + 1}`,
                    color: 'cyan',
                  },
                });
              }}
              disabled={isDispatching || isReadOnly}
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Marker
            </button>
            {onExportMarkers && (
              <button
                type="button"
                onClick={onExportMarkers}
                className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20"
              >
                Export Markers
              </button>
            )}
            {onImportMarkers && (
              <>
                <button
                  type="button"
                  onClick={() => markerImportRef.current?.click()}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08]"
                >
                  Import Markers
                </button>
                <input
                  ref={markerImportRef}
                  type="file"
                  accept=".json,application/json,.csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void onImportMarkers(file);
                    event.currentTarget.value = '';
                  }}
                />
              </>
            )}
            {onImportTimelinePackage && (
              <>
                <button
                  type="button"
                  onClick={() => interchangeImportRef.current?.click()}
                  className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20"
                >
                  Import Session
                </button>
                <input
                  ref={interchangeImportRef}
                  type="file"
                  accept=".aaf,.omf,.xml,.json,.csv,application/octet-stream,application/json,application/xml,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void onImportTimelinePackage(file);
                    event.currentTarget.value = '';
                  }}
                />
              </>
            )}
            {onExportAafAdapter && (
              <button
                type="button"
                onClick={onExportAafAdapter}
                className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20"
              >
                Export AAF
              </button>
            )}
            {onExportOmfAdapter && (
              <button
                type="button"
                onClick={onExportOmfAdapter}
                className="rounded-lg border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-orange-100 hover:bg-orange-500/20"
              >
                Export OMF
              </button>
            )}
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
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1">
            <select
              value={newTrackType}
              onChange={(event) => setNewTrackType(event.target.value as 'audio' | 'midi' | 'bus')}
              className="rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-slate-200"
            >
              <option value="audio">Audio</option>
              <option value="midi">MIDI</option>
              <option value="bus">Bus</option>
            </select>
            <button
              type="button"
              onClick={() => {
                const nextIndex = timelineState.tracks.length + 1;
                const trackId = `${newTrackType}-track-${nextIndex}`;
                void onDispatchAction({
                  actionType: 'ADD_TRACK',
                  trackId,
                  trackName: `${newTrackType.toUpperCase()} ${nextIndex}`,
                  description: `Add ${newTrackType} track ${nextIndex}`,
                  parameters: {
                    trackId,
                    trackName: `${newTrackType.toUpperCase()} ${nextIndex}`,
                    trackType: newTrackType,
                  },
                });
              }}
              disabled={isDispatching || isReadOnly}
              title={`Add a new ${newTrackType} track to the deterministic timeline.`}
              className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Track
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Automation</span>
        {(['read', 'touch', 'latch', 'write'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (isReadOnly || isDispatching) return;
              const track = selectedTrack || timelineState.tracks[0];
              if (!track) return;
              void onDispatchAction({
                actionType: 'SET_AUTOMATION_MODE',
                trackId: track.trackId,
                trackName: track.trackName,
                description: `Set automation mode to ${mode}`,
                parameters: {
                  mode,
                },
              });
            }}
            disabled={isReadOnly || isDispatching}
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em] ${
              automationMode === mode
                ? 'border-cyan-300/50 bg-cyan-500/20 text-cyan-100'
                : 'border-white/10 bg-black/20 text-slate-300 hover:bg-white/[0.08]'
            }`}
          >
            {mode}
          </button>
        ))}
        {onApplyAutomationPlan && (
          <button
            type="button"
            onClick={() => void onApplyAutomationPlan()}
            disabled={isReadOnly || isDispatching || isApplyingAutomationPlan}
            className="rounded-full border border-cyan-300/40 bg-cyan-500/15 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            title="Apply the section-aware automation plan generated from analysis."
          >
            {isApplyingAutomationPlan ? 'Applying Plan' : 'Apply APL Plan'}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Timeline snap</span>
        <button
          type="button"
          onClick={() => setSnapToGrid((value) => !value)}
          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em] ${
            snapToGrid
              ? 'border-cyan-300/50 bg-cyan-500/20 text-cyan-100'
              : 'border-white/10 bg-black/20 text-slate-400 hover:bg-white/[0.08]'
          }`}
        >
          {snapToGrid ? 'Snap On' : 'Snap Off'}
        </button>
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
          Grid
          <select
            value={snapStepSec}
            onChange={(event) => setSnapStepSec(Number(event.target.value))}
            className="rounded-md border border-white/10 bg-slate-900/80 px-2 py-1 text-[10px] text-slate-200 focus:outline-none"
          >
            <option value={0.125}>1/32</option>
            <option value={0.25}>1/16</option>
            <option value={0.5}>1/8</option>
            <option value={1}>1/4</option>
          </select>
        </label>
        <span className="text-[10px] text-slate-500">
          Keys: ↑/↓ select region · Alt+←/→ nudge · Alt+Shift+←/→ trim · S split · D duplicate · F crossfade
        </span>
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

      {selectedTrack && (
        <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">Comp Toolkit</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{selectedTrack.trackName}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {selectedTrackRegions.length} regions, {selectedTrackCompLanes.length} comp lanes
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isDispatching || isReadOnly || selectedTrackRegions.length < 2}
                onClick={() => {
                  const laneId = `comp-${selectedTrack.trackId}-${Date.now().toString(36)}`;
                  void onDispatchAction({
                    actionType: 'CREATE_COMP_LANE',
                    trackId: selectedTrack.trackId,
                    trackName: selectedTrack.trackName,
                    description: `Create comp lane for ${selectedTrack.trackName}`,
                    parameters: {
                      trackId: selectedTrack.trackId,
                      laneId,
                      name: `${selectedTrack.trackName} Comp`,
                      regionIds: selectedTrackRegions.map((region) => region.regionId),
                      activeRegionId: selectedTrackRegions[0]?.regionId || '',
                    },
                  });
                }}
                className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create Comp Lane
              </button>
              <button
                type="button"
                disabled={isDispatching || isReadOnly || selectedTrackCompLanes.length === 0}
                onClick={() => {
                  const lane = selectedTrackCompLanes[0];
                  if (!lane) return;
                  void onDispatchAction({
                    actionType: 'SET_COMP_LANE_ACTIVE',
                    trackId: selectedTrack.trackId,
                    trackName: selectedTrack.trackName,
                    description: `Set active take in ${lane.name}`,
                    parameters: {
                      laneId: lane.laneId,
                      regionId: lane.activeRegionId || lane.regionIds[0] || '',
                    },
                  });
                }}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Focus Active Take
              </button>
              <button
                type="button"
                disabled={isDispatching || isReadOnly || selectedTrackCompLanes.length === 0}
                onClick={() => onCycleCompLaneTake?.(selectedTrack.trackId, selectedTrackCompLanes[0]?.laneId || '', 'next')}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next Take
              </button>
              <button
                type="button"
                disabled={isDispatching || isReadOnly || selectedTrackCompLanes.length === 0}
                onClick={() => onCollapseCompLaneToActive?.(selectedTrack.trackId, selectedTrackCompLanes[0]?.laneId || '')}
                className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Keep Active Only
              </button>
              <button
                type="button"
                disabled={isDispatching || isReadOnly || selectedTrackCompLanes.length === 0}
                onClick={() => {
                  const lane = selectedTrackCompLanes[0];
                  if (!lane) return;
                  void onAuditionCompLane?.(selectedTrack.trackId, lane.laneId);
                }}
                className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Audition Lane
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={timelineSurfaceRef} className="space-y-4">
        {compareState && (
          <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80">Branch compare strip</p>
              <p className="text-[10px] text-slate-400">
                Current <span className="text-cyan-300">{timelineState.regions.length}</span> regions • Compare <span className="text-fuchsia-300">{compareState.regions.length}</span>
              </p>
            </div>
            <div className="mt-2 space-y-2 overflow-x-auto">
              <div className="flex h-4 overflow-hidden rounded-lg border border-white/5 bg-black/20" style={{ width: `${compareStripWidth}px` }}>
                {compareHeatmap.bins.map((bin) => {
                  const opacity = Math.max(0.08, 0.12 + bin.intensity * 0.88);
                  const hue = 210 - Math.round(bin.intensity * 170);
                  return (
                    <div
                      key={`heat-${bin.index}`}
                      className={`flex-1 border-r border-black/30 last:border-r-0 ${onSeekToTime ? 'cursor-pointer' : ''}`}
                      title={`${bin.startSec.toFixed(2)}s - ${bin.endSec.toFixed(2)}s\n${bin.labels.length ? bin.labels.join('\n') : 'No edits'}`}
                      style={{ background: `hsla(${hue}, 90%, 62%, ${opacity})` }}
                      onClick={() => onSeekToTime?.(bin.startSec)}
                    />
                  );
                })}
              </div>
              <div className="relative h-14 rounded-lg border border-white/5 bg-slate-950/70" style={{ width: `${compareStripWidth}px` }}>
                {timelineState.regions.map((region) => {
                  const left = Math.max(0, region.startTimeSec * pxPerSec);
                  const width = Math.max(36, region.durationSec * pxPerSec);
                  const compareRegion = compareRegionsById.get(region.regionId);
                  const changed = !compareRegion ||
                    compareRegion.startTimeSec !== region.startTimeSec ||
                    compareRegion.durationSec !== region.durationSec ||
                    compareRegion.trackId !== region.trackId;
                  return (
                    <div
                      key={`current-${region.regionId}`}
                      className={`absolute top-2 h-4 rounded ${changed ? 'bg-cyan-400/70' : 'bg-cyan-400/35'}`}
                      style={{ left: `${left}px`, width: `${width}px` }}
                      title={`Current ${region.regionId}`}
                    />
                  );
                })}
                {compareState.regions.map((region) => (
                  <div
                    key={`compare-${region.regionId}`}
                    className="absolute top-7 h-3 rounded bg-fuchsia-400/35"
                    style={{ left: `${Math.max(0, region.startTimeSec * pxPerSec)}px`, width: `${Math.max(36, region.durationSec * pxPerSec)}px` }}
                    title={`Compare ${region.regionId}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <span className="rounded-full border border-white/10 px-2 py-1">Added regions {compareHeatmap.addedRegions}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Removed regions {compareHeatmap.removedRegions}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Changed regions {compareHeatmap.changedRegions}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Added markers {compareHeatmap.addedMarkers}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Removed markers {compareHeatmap.removedMarkers}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Changed markers {compareHeatmap.changedMarkers}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Added MIDI notes {compareHeatmap.addedMidiNotes}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Removed MIDI notes {compareHeatmap.removedMidiNotes}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">Changed MIDI notes {compareHeatmap.changedMidiNotes}</span>
              </div>
            </div>
          </div>
        )}
        <RoutingGraphPanel
          tracks={timelineState.tracks}
          isReadOnly={isReadOnly}
          estimatedLatencyByTrackId={trackLatencyById}
          onSetTrackRouting={(trackId, outputBusId) => {
            onSetTrackRouting?.(trackId, outputBusId);
          }}
          onSetTrackSend={(trackId, send) => {
            onSetTrackSend?.(trackId, send);
          }}
          onRemoveTrackSend={(trackId, sendId) => {
            onRemoveTrackSend?.(trackId, sendId);
          }}
        />
        {timelineState.tracks.map((track) => {
          const trackRegions = timelineState.regions.filter((region) => region.trackId === track.trackId);
          const trackAutomation = timelineState.automation.filter((lane) => lane.trackId === track.trackId);
          const compareAutomationLanes = compareState?.automation.filter((lane) => lane.trackId === track.trackId) || [];
          const compareTrackRegions = compareState?.regions.filter((region) => region.trackId === track.trackId) || [];

          return (
            <div key={track.trackId} className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr]">
              <TrackHeader
                track={track}
                regions={trackRegions}
                automationLanes={trackAutomation}
                midiNoteCount={midiNotesByTrackId.get(track.trackId)?.length || 0}
                trackGroups={trackGroups}
                isSelected={selectedTrackId === track.trackId}
                onSelect={setSelectedTrackId}
                onCreateTrackGroup={onCreateTrackGroup}
                onSetTrackGroup={(trackId, groupId) => {
                  void onDispatchAction({
                    actionType: 'SET_TRACK_GROUP',
                    trackId,
                    trackName: track.trackName,
                    description: `Set group for ${track.trackName}`,
                    parameters: {
                      trackId,
                      trackName: track.trackName,
                      groupId,
                    },
                  });
                }}
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
                    onMovePlugin={onReorderTrackPlugin ? (instanceId, direction) => {
                      onReorderTrackPlugin(track.trackId, instanceId, direction);
                    } : undefined}
                    onRemovePlugin={onRemoveTrackPlugin ? (instanceId) => {
                      onRemoveTrackPlugin(track.trackId, instanceId);
                    } : undefined}
                  />

                  {(onSetTrackRouting || onSetTrackSend || onRemoveTrackSend) && (
                    <TrackRoutingPanel
                      track={track}
                      tracks={timelineState.tracks}
                      isReadOnly={isReadOnly}
                      estimatedLatencyMs={trackLatencyById[track.trackId]?.estimatedLatencyMs ?? 0}
                      onSetOutputBus={(trackId, outputBusId) => {
                        onSetTrackRouting?.(trackId, outputBusId);
                      }}
                      onSetSend={(trackId, send) => {
                        onSetTrackSend?.(trackId, send);
                      }}
                      onRemoveSend={(trackId, sendId) => {
                        onRemoveTrackSend?.(trackId, sendId);
                      }}
                    />
                  )}

                  {(track.kind === 'midi' || track.trackId === selectedTrackId || (midiNotesByTrackId.get(track.trackId) || []).length > 0) && (
                    <MidiPianoRollPanel
                      track={track}
                      notes={midiNotesByTrackId.get(track.trackId) || []}
                      pxPerSec={pxPerSec}
                      laneWidth={laneWidth}
                      isReadOnly={isReadOnly}
                      playheadSeconds={getTransportPlayheadSeconds ? getTransportPlayheadSeconds() : null}
                      onAddNote={(trackId, note) => {
                        void onDispatchAction({
                          actionType: 'ADD_MIDI_NOTE',
                          trackId,
                          trackName: track.trackName,
                          description: `Add MIDI note to ${track.trackName}`,
                          parameters: {
                            trackId,
                            trackName: track.trackName,
                            noteId: note.noteId,
                            startTimeSec: note.startTimeSec,
                            durationSec: note.durationSec,
                            pitch: note.pitch,
                            velocity: note.velocity,
                            channel: note.channel,
                            trackType: track.kind === 'midi' ? 'midi' : 'audio',
                          },
                        });
                      }}
                      onSetNote={(trackId, noteId, patch) => {
                        void onDispatchAction({
                          actionType: 'SET_MIDI_NOTE',
                          trackId,
                          trackName: track.trackName,
                          description: `Update MIDI note on ${track.trackName}`,
                          parameters: {
                            trackId,
                            trackName: track.trackName,
                            noteId,
                            ...patch,
                          },
                        });
                      }}
                      onRemoveNote={(trackId, noteId) => {
                        void onDispatchAction({
                          actionType: 'REMOVE_MIDI_NOTE',
                          trackId,
                          trackName: track.trackName,
                          description: `Remove MIDI note from ${track.trackName}`,
                          parameters: {
                            trackId,
                            trackName: track.trackName,
                            noteId,
                          },
                        });
                      }}
                    />
                  )}

                <RegionLane
                  track={track}
                  regions={trackRegions}
                  pxPerSec={pxPerSec}
                  laneWidth={laneWidth}
                  snapToGrid={snapToGrid}
                  snapStepSec={snapStepSec}
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
                    onTrimRegion={(region, side, amountSec) => {
                      void onDispatchAction({
                        actionType: 'TRIM_REGION',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Trim ${side} of ${region.regionId}`,
                        parameters: {
                          regionId: region.regionId,
                          side,
                          amountSec,
                        },
                      });
                    }}
                    onSlipRegion={(region, amountSec) => {
                      void onDispatchAction({
                        actionType: 'SLIP_REGION',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Slip ${region.regionId} by ${amountSec}s`,
                        parameters: {
                          regionId: region.regionId,
                          amountSec,
                        },
                      });
                    }}
                    onApplyCrossfade={(region, fadeInSec, fadeOutSec) => {
                      void onDispatchAction({
                        actionType: 'APPLY_CROSSFADE',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Apply crossfade to ${region.regionId}`,
                        parameters: {
                          regionId: region.regionId,
                          fadeInSec,
                          fadeOutSec,
                        },
                      });
                    }}
                    onDuplicateRegion={(region) => {
                      void onDispatchAction({
                        actionType: 'ADD_REGION',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Duplicate ${region.regionId}`,
                        parameters: {
                          trackId: track.trackId,
                          trackName: track.trackName,
                          regionId: `${region.regionId}-copy-${Date.now().toString(36)}`,
                          sourceId: region.sourceId,
                          startTimeSec: Number((region.startTimeSec + region.durationSec + 0.05).toFixed(3)),
                          offsetSec: region.offsetSec,
                          durationSec: region.durationSec,
                          gainDb: region.gainDb ?? 0,
                        },
                      });
                    }}
                    onSetRegionGain={(region, gainDb) => {
                      void onDispatchAction({
                        actionType: 'SET_REGION_GAIN',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Set gain for ${region.regionId}`,
                        parameters: {
                          trackId: track.trackId,
                          regionId: region.regionId,
                          gainDb,
                        },
                      });
                    }}
                    compLanes={compLanes as ReplayCompLane[]}
                    onCreateCompLane={(trackId, regionIds) => {
                      const laneId = `comp-${trackId}-${Date.now().toString(36)}`;
                      void onDispatchAction({
                        actionType: 'CREATE_COMP_LANE',
                        trackId,
                        trackName: track.trackName,
                        description: `Create comp lane for ${track.trackName}`,
                        parameters: {
                          trackId,
                          laneId,
                          name: `${track.trackName} Comp`,
                          regionIds,
                          activeRegionId: regionIds[0],
                        },
                      });
                    }}
                    onRenameCompLane={(laneId, name) => {
                      const lane = compLanes.find((entry) => entry.laneId === laneId);
                      if (!lane) return;
                      void onDispatchAction({
                        actionType: 'RENAME_COMP_LANE',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: `Rename comp lane ${lane.name}`,
                        parameters: {
                          laneId,
                          name,
                        },
                      });
                    }}
                    onReorderCompLaneTake={onReorderCompLaneTake ? (laneId, regionId, direction) => {
                      onReorderCompLaneTake(track.trackId, laneId, regionId, direction);
                    } : undefined}
                    onSetCompLaneActive={(laneId, regionId) => {
                      void onDispatchAction({
                        actionType: 'SET_COMP_LANE_ACTIVE',
                        trackId: track.trackId,
                        trackName: track.trackName,
                        description: 'Set comp lane active take',
                        parameters: {
                          laneId,
                          regionId,
                        },
                      });
                    }}
                    onAuditionCompLane={(lane) => {
                      onAuditionCompLane?.(track.trackId, lane.laneId);
                    }}
                    compareRegionStatus={Object.fromEntries(
                      trackRegions.map((region) => [region.regionId, getRegionCompareStatus(region.regionId)])
                    )}
                    compareRegions={compareTrackRegions}
                    playheadSeconds={getTransportPlayheadSeconds ? getTransportPlayheadSeconds() : null}
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
                    onCollapseCompLaneToActive={onCollapseCompLaneToActive ? (laneId) => {
                      onCollapseCompLaneToActive(track.trackId, laneId);
                    } : undefined}
                    onCycleCompLaneTake={onCycleCompLaneTake ? (laneId, direction) => {
                      onCycleCompLaneTake(track.trackId, laneId, direction);
                    } : undefined}
                    showPlayhead={Boolean(getTransportPlayheadSeconds)}
                  />

                  <AutomationLane
                    track={track}
                    lanes={trackAutomation}
                    pxPerSec={pxPerSec}
                    laneWidth={laneWidth}
                    isReadOnly={isReadOnly}
                    compareLanes={compareAutomationLanes}
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
                    onSetPoint={(targetTrackId, parameter, pointId, timeSec, value) => {
                      void onDispatchAction({
                        actionType: 'SET_AUTOMATION_POINT',
                        trackId: targetTrackId,
                        trackName: track.trackName,
                        description: `Move automation point ${parameter}`,
                        parameters: {
                          trackId: targetTrackId,
                          parameter,
                          pointId,
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
        {compareState && compareState.tracks
          .filter((track) => !timelineState.tracks.some((current) => current.trackId === track.trackId))
          .map((track) => {
            const compareTrackRegions = compareState.regions.filter((region) => region.trackId === track.trackId);
            const compareAutomationLanes = compareState.automation.filter((lane) => lane.trackId === track.trackId);
            return (
              <div key={`compare-only-${track.trackId}`} className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr] opacity-90">
                <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80">Compare-only Track</p>
                  <h4 className="mt-2 text-sm font-semibold text-slate-100">{track.trackName}</h4>
                  <p className="mt-1 text-[11px] text-fuchsia-100/80">
                    Present in the compare branch but not in the active branch.
                  </p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-fuchsia-400/10 bg-fuchsia-500/5 p-2">
                  <div style={{ width: `${laneWidth}px` }} className="space-y-2">
                    <RegionLane
                      track={track}
                      regions={[]}
                      compareRegions={compareTrackRegions}
                      pxPerSec={pxPerSec}
                      laneWidth={laneWidth}
                      snapToGrid={snapToGrid}
                      snapStepSec={snapStepSec}
                      isReadOnly
                      selectedRegionId={null}
                      onSelectRegion={() => {}}
                    onMoveRegion={() => {}}
                    onSplitRegion={() => {}}
                    onTrimRegion={() => {}}
                    onSlipRegion={() => {}}
                    onApplyCrossfade={() => {}}
                    compLanes={compareState.compLanes || []}
                      compareRegionStatus={Object.fromEntries(compareTrackRegions.map((region) => [region.regionId, 'removed' as const]))}
                      playheadSeconds={getTransportPlayheadSeconds ? getTransportPlayheadSeconds() : null}
                      showPlayhead={Boolean(getTransportPlayheadSeconds)}
                      onCycleCompLaneTake={onCycleCompLaneTake ? (laneId, direction) => {
                        onCycleCompLaneTake(track.trackId, laneId, direction);
                      } : undefined}
                    />
                    <AutomationLane
                      track={track}
                      lanes={[]}
                      compareLanes={compareAutomationLanes}
                      pxPerSec={pxPerSec}
                      laneWidth={laneWidth}
                      isReadOnly
                      onAddPoint={() => {}}
                      onSetPoint={() => {}}
                      showPlayhead={Boolean(getTransportPlayheadSeconds)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {sortedMarkers.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Markers</p>
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{sortedMarkers.length}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {sortedMarkers.map((marker) => {
              const compareStatus = getMarkerCompareStatus(marker.id);
              return (
              <div
                key={marker.id}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-200 ${
                  compareStatus === 'added'
                    ? 'border-emerald-300/40 bg-emerald-500/15'
                    : compareStatus === 'changed'
                      ? 'border-amber-300/40 bg-amber-500/15'
                      : 'border-white/10 bg-black/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isReadOnly || isDispatching) return;
                    const rawLabel = typeof window !== 'undefined'
                      ? window.prompt('Marker label', marker.label)
                      : marker.label;
                    const label = rawLabel?.trim();
                    if (!label) return;
                    const rawTime = typeof window !== 'undefined'
                      ? window.prompt('Marker time (seconds)', `${marker.timeSec.toFixed(3)}`)
                      : `${marker.timeSec.toFixed(3)}`;
                    const nextTime = Number(rawTime);
                    if (!Number.isFinite(nextTime)) return;
                    const rawColor = typeof window !== 'undefined'
                      ? window.prompt('Marker color', marker.color)
                      : marker.color;
                    const color = rawColor?.trim() || marker.color;
                    const rawNote = typeof window !== 'undefined'
                      ? window.prompt('Marker note', marker.note || '')
                      : (marker.note || '');
                    void onDispatchAction({
                      actionType: 'UPDATE_MARKER',
                      trackId: selectedTrackId || timelineState.tracks[0]?.trackId || 'track-main',
                      trackName: timelineState.tracks.find((track) => track.trackId === (selectedTrackId || timelineState.tracks[0]?.trackId))?.trackName || 'Track',
                      description: `Edit marker ${marker.label}`,
                      parameters: {
                        markerId: marker.id,
                        label,
                        color,
                        timeSec: nextTime,
                        note: rawNote || '',
                      },
                    });
                  }}
                  className="text-left hover:text-cyan-200"
                >
                  {marker.label} @ {marker.timeSec.toFixed(2)}s
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isReadOnly || isDispatching) return;
                    void onDispatchAction({
                      actionType: 'REMOVE_MARKER',
                      trackId: selectedTrackId || timelineState.tracks[0]?.trackId || 'track-main',
                      trackName: timelineState.tracks.find((track) => track.trackId === (selectedTrackId || timelineState.tracks[0]?.trackId))?.trackName || 'Track',
                      description: `Remove marker ${marker.label}`,
                      parameters: {
                        markerId: marker.id,
                      },
                    });
                  }}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-red-200 hover:bg-red-500/10"
                >
                  Del
                </button>
                {compareStatus !== 'unchanged' && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em]">
                    {compareStatus}
                  </span>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

const TimelineWorkspace = React.memo(TimelineWorkspaceComponent);

export default TimelineWorkspace;
