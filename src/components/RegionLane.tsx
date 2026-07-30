import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ReplayCompLane, ReplayRegionState, ReplayTrackState } from '../services/deterministicReplayService';
import { assetRegistry } from '../services/AssetRegistry';

interface RegionLaneProps {
  track: ReplayTrackState;
  regions: ReplayRegionState[];
  compareRegions?: ReplayRegionState[];
  pxPerSec: number;
  laneWidth: number;
  snapToGrid?: boolean;
  snapStepSec?: number;
  isReadOnly?: boolean;
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
  onMoveRegion: (region: ReplayRegionState, nextStartSec: number) => void;
  onSplitRegion: (region: ReplayRegionState, splitTimeSec: number) => void;
  onTrimRegion?: (region: ReplayRegionState, side: 'left' | 'right', amountSec: number) => void;
  onSlipRegion?: (region: ReplayRegionState, amountSec: number) => void;
  onApplyCrossfade?: (region: ReplayRegionState, fadeInSec: number, fadeOutSec: number) => void;
  onDuplicateRegion?: (region: ReplayRegionState) => void;
  onSetRegionGain?: (region: ReplayRegionState, gainDb: number) => void;
  compLanes?: ReplayCompLane[];
  onCreateCompLane?: (trackId: string, regionIds: string[]) => void;
  onSetCompLaneActive?: (laneId: string, regionId: string) => void;
  onRenameCompLane?: (laneId: string, name: string) => void;
  onAuditionCompLane?: (lane: ReplayCompLane) => void;
  onReorderCompLaneTake?: (laneId: string, regionId: string, direction: 'up' | 'down') => void;
  onCycleCompLaneTake?: (laneId: string, direction: 'prev' | 'next') => void;
  onCollapseCompLaneToActive?: (laneId: string) => void;
  compareRegionStatus?: Record<string, 'added' | 'removed' | 'changed' | 'unchanged'>;
  playheadSeconds?: number | null;
  showPlayhead?: boolean;
}

interface RegionWaveformProps {
  assetId: string;
  width: number;
  height: number;
}

function RegionWaveform({ assetId, width, height }: RegionWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(() => assetRegistry.getWaveformPeaks(assetId, 192));

  useEffect(() => {
    let cancelled = false;
    const cached = assetRegistry.getWaveformPeaks(assetId, 192);
    if (cached) {
      setPeaks(cached);
      return () => {
        cancelled = true;
      };
    }

    void assetRegistry.ensureDecodedBuffer(assetId).then(() => {
      if (cancelled) return;
      setPeaks(assetRegistry.getWaveformPeaks(assetId, 192));
    });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawWidth = Math.max(1, Math.floor(width));
    const drawHeight = Math.max(1, Math.floor(height));
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(drawWidth * dpr);
    canvas.height = Math.floor(drawHeight * dpr);
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, drawWidth, drawHeight);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, 0, drawWidth, drawHeight);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1;

    const centerY = drawHeight / 2;
    if (!peaks || peaks.length === 0) {
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(drawWidth, centerY);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < peaks.length; i += 1) {
      const x = peaks.length > 1 ? (i / (peaks.length - 1)) * drawWidth : 0;
      const amp = Math.max(0, Math.min(1, peaks[i]));
      const y = centerY - amp * (drawHeight * 0.45);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = peaks.length - 1; i >= 0; i -= 1) {
      const x = peaks.length > 1 ? (i / (peaks.length - 1)) * drawWidth : 0;
      const amp = Math.max(0, Math.min(1, peaks[i]));
      const y = centerY + amp * (drawHeight * 0.45);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();
    ctx.stroke();
  }, [height, peaks, width]);

  return (
    <canvas
      ref={canvasRef}
      className="mt-1 rounded border border-white/10 bg-slate-900/80"
      aria-label={`waveform-${assetId}`}
    />
  );
}

function RegionLaneComponent({
  track,
  regions,
  pxPerSec,
  laneWidth,
  snapToGrid = true,
  snapStepSec = 0.25,
  isReadOnly = false,
  selectedRegionId,
  onSelectRegion,
  onMoveRegion,
  onSplitRegion,
  onTrimRegion,
  onSlipRegion,
  onApplyCrossfade,
  onDuplicateRegion,
  onSetRegionGain,
  compLanes = [],
  compareRegions = [],
  onCreateCompLane,
  onSetCompLaneActive,
  onRenameCompLane,
  onAuditionCompLane,
  onReorderCompLaneTake,
  onCycleCompLaneTake,
  onCollapseCompLaneToActive,
  compareRegionStatus = {},
  playheadSeconds = null,
  showPlayhead = false,
}: RegionLaneProps) {
  const trackCompLanes = compLanes.filter((lane) => lane.trackId === track.trackId);
  const dragRef = useRef<{
    mode: 'move' | 'trim-left' | 'trim-right' | 'slip';
    region: ReplayRegionState;
    startClientX: number;
    originalStart: number;
    originalDuration: number;
    originalOffset: number;
  } | null>(null);
  const [dragRegionId, setDragRegionId] = useState<string | null>(null);

  const snapValue = useCallback((value: number): number => {
    if (!snapToGrid || !Number.isFinite(snapStepSec) || snapStepSec <= 0) return Number(value.toFixed(3));
    return Number((Math.round(value / snapStepSec) * snapStepSec).toFixed(3));
  }, [snapStepSec, snapToGrid]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragRegionId(null);
  }, []);

  const beginDrag = useCallback((event: React.PointerEvent, region: ReplayRegionState, mode: 'move' | 'trim-left' | 'trim-right' | 'slip') => {
    if (isReadOnly) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      region,
      startClientX: event.clientX,
      originalStart: region.startTimeSec,
      originalDuration: region.durationSec,
      originalOffset: region.offsetSec,
    };
    setDragRegionId(region.regionId);
    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaSec = (moveEvent.clientX - drag.startClientX) / pxPerSec;
      if (drag.mode === 'move') {
        const nextStart = Math.max(0, drag.originalStart + deltaSec);
        onMoveRegion(drag.region, snapValue(nextStart));
      } else if (drag.mode === 'trim-left') {
        const amount = Math.max(0, deltaSec);
        onTrimRegion?.(drag.region, 'left', snapValue(amount));
      } else if (drag.mode === 'trim-right') {
        const amount = Math.max(0, -deltaSec);
        onTrimRegion?.(drag.region, 'right', snapValue(amount));
      } else if (drag.mode === 'slip') {
        onSlipRegion?.(drag.region, snapValue(deltaSec));
      }
    };
    const handleUp = (upEvent: PointerEvent) => {
      handleMove(upEvent);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      endDrag();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }, [endDrag, isReadOnly, onMoveRegion, onSlipRegion, onTrimRegion, pxPerSec, snapValue]);
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Regions</p>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-slate-500">{track.trackId}</p>
          {onCreateCompLane && regions.length > 1 && (
            <button
              type="button"
              onClick={() => onCreateCompLane(track.trackId, regions.map((region) => region.regionId))}
              disabled={isReadOnly}
              className="rounded bg-fuchsia-500/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Comp Lane
            </button>
          )}
        </div>
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
          const splitTimeSec = snapValue(region.startTimeSec + Math.max(region.durationSec / 2, 0.25));
          const isSelected = selectedRegionId === region.regionId;
          const compareStatus = compareRegionStatus[region.regionId] || 'unchanged';
          const compareStyle = compareStatus === 'added'
            ? 'border-emerald-300/70 bg-emerald-500/20'
            : compareStatus === 'changed'
              ? 'border-amber-300/70 bg-amber-500/18'
              : isSelected
                ? 'border-cyan-300/70 bg-cyan-500/20'
                : 'border-orange-300/40 bg-orange-500/15';

          return (
            <div
              key={region.regionId}
              className={`absolute top-2 rounded-lg border px-2 py-1 shadow-sm ${compareStyle} ${dragRegionId === region.regionId ? 'ring-2 ring-cyan-300/70' : ''}`}
              style={{ left: `${left}px`, width: `${width}px` }}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelectRegion(region.regionId)}
                onPointerDown={(event) => beginDrag(event, region, 'move')}
              >
                <p className="truncate text-[11px] font-semibold text-slate-100">{region.regionId}</p>
                <p className="text-[10px] text-slate-300">
                  {region.startTimeSec.toFixed(2)}s → {(region.startTimeSec + region.durationSec).toFixed(2)}s
                </p>
              </button>
              <div className="mt-1 flex items-center justify-between gap-1 text-[9px] uppercase tracking-[0.12em] text-slate-400">
                <button
                  type="button"
                  disabled={isReadOnly}
                  onPointerDown={(event) => beginDrag(event, region, 'trim-left')}
                  className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 hover:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Drag to trim the left edge"
                >
                  Trim L
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onPointerDown={(event) => beginDrag(event, region, 'slip')}
                  className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 hover:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Drag to slip the audio inside the clip"
                >
                  Slip
                </button>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onPointerDown={(event) => beginDrag(event, region, 'trim-right')}
                  className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 hover:border-cyan-300/40 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Drag to trim the right edge"
                >
                  Trim R
                </button>
              </div>
              {compareStatus !== 'unchanged' && (
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-100">
                  {compareStatus}
                </p>
              )}
              <RegionWaveform
                assetId={region.sourceId}
                width={Math.max(24, width - 16)}
                height={18}
              />
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => onMoveRegion(region, snapValue(region.startTimeSec + 1))}
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
                {onTrimRegion && (
                  <>
                  <button
                      type="button"
                      onClick={() => onTrimRegion(region, 'left', snapValue(0.25))}
                      disabled={isReadOnly}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Trim L
                    </button>
                  <button
                      type="button"
                      onClick={() => onTrimRegion(region, 'right', snapValue(0.25))}
                      disabled={isReadOnly}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Trim R
                    </button>
                  </>
                )}
                {onSlipRegion && (
                  <>
                    <button
                      type="button"
                      onClick={() => onSlipRegion(region, -snapValue(0.25))}
                      disabled={isReadOnly}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Slip -
                    </button>
                    <button
                      type="button"
                      onClick={() => onSlipRegion(region, snapValue(0.25))}
                      disabled={isReadOnly}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Slip +
                    </button>
                  </>
                )}
                {onApplyCrossfade && (
                  <button
                    type="button"
                    onClick={() => onApplyCrossfade(region, 0.15, 0.15)}
                    disabled={isReadOnly}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    XFade
                  </button>
                )}
                {onDuplicateRegion && (
                  <button
                    type="button"
                    onClick={() => onDuplicateRegion(region)}
                    disabled={isReadOnly}
                    className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Dup
                  </button>
                )}
              </div>
              {typeof onSetRegionGain === 'function' && (
                <div className="mt-1">
                  <input
                    type="range"
                    min={-24}
                    max={12}
                    step={0.5}
                    value={region.gainDb ?? 0}
                    onChange={(event) => onSetRegionGain(region, Number(event.target.value))}
                    disabled={isReadOnly}
                    className="w-full accent-cyan-400"
                    aria-label={`Gain for ${region.regionId}`}
                  />
                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                  Clip gain {Number(region.gainDb ?? 0).toFixed(1)} dB
                </p>
              </div>
              )}
            </div>
          );
        })}
        {compareRegions
          .filter((region) => !regions.some((current) => current.regionId === region.regionId))
          .map((region) => {
            const left = Math.max(0, region.startTimeSec * pxPerSec);
            const width = Math.max(36, region.durationSec * pxPerSec);
            const compareStatus = compareRegionStatus[region.regionId] || 'removed';
            return (
              <div
                key={`compare-${region.regionId}`}
                className={`absolute top-2 rounded-lg border px-2 py-1 shadow-sm border-fuchsia-300/50 bg-fuchsia-500/10`}
                style={{ left: `${left}px`, width: `${width}px` }}
              >
                <p className="truncate text-[11px] font-semibold text-fuchsia-100">{region.regionId}</p>
                <p className="text-[10px] text-fuchsia-100/80">
                  {region.startTimeSec.toFixed(2)}s → {(region.startTimeSec + region.durationSec).toFixed(2)}s
                </p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-fuchsia-100/90">
                  {compareStatus}
                </p>
                <div className="mt-1 opacity-60">
                  <RegionWaveform
                    assetId={region.sourceId}
                    width={Math.max(24, width - 16)}
                    height={18}
                  />
                </div>
              </div>
            );
          })}
      </div>
      {trackCompLanes.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Comp Lanes</p>
          {trackCompLanes.map((lane) => (
            <div key={lane.laneId} className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/5 p-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-fuchsia-100">{lane.name}</p>
                  <p className="text-[10px] text-slate-400">{lane.regionIds.length} regions</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="rounded-full border border-fuchsia-400/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-fuchsia-100">
                    Active: {lane.activeRegionId || 'none'}
                  </span>
                  {onCycleCompLaneTake && lane.regionIds.length > 1 && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onCycleCompLaneTake(lane.laneId, 'prev')}
                        disabled={isReadOnly}
                        className="rounded bg-slate-800 px-1.5 py-1 text-[9px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => onCycleCompLaneTake(lane.laneId, 'next')}
                        disabled={isReadOnly}
                        className="rounded bg-slate-800 px-1.5 py-1 text-[9px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}
                  {onRenameCompLane && (
                    <button
                      type="button"
                      onClick={() => {
                        const suggested = `${lane.name} (edited)`;
                        const rawName = typeof window !== 'undefined'
                          ? window.prompt('Comp lane name', suggested)
                          : suggested;
                        const nextName = rawName?.trim();
                        if (!nextName) return;
                        onRenameCompLane(lane.laneId, nextName);
                      }}
                      disabled={isReadOnly}
                      className="rounded bg-slate-800 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Rename
                    </button>
                  )}
                  {lane.activeRegionId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onAuditionCompLane) {
                          onAuditionCompLane(lane);
                          return;
                        }
                        onSetCompLaneActive?.(lane.laneId, lane.activeRegionId);
                        onSelectRegion(lane.activeRegionId);
                      }}
                      disabled={isReadOnly}
                      className="rounded bg-fuchsia-500/15 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                      Audition
                    </button>
                  )}
                  {lane.activeRegionId && onCollapseCompLaneToActive && (
                    <button
                      type="button"
                      onClick={() => onCollapseCompLaneToActive(lane.laneId)}
                      disabled={isReadOnly}
                      className="rounded bg-cyan-500/15 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Keep Active
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {lane.regionIds.map((regionId, index) => (
                  <div
                    key={regionId}
                    className="flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-1 py-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSetCompLaneActive?.(lane.laneId, regionId)}
                      disabled={isReadOnly}
                      className={`rounded px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
                        lane.activeRegionId === regionId
                          ? 'bg-fuchsia-400/20 text-fuchsia-50'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {regionId}
                    </button>
                    {onReorderCompLaneTake && (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onReorderCompLaneTake(lane.laneId, regionId, 'up')}
                          disabled={isReadOnly || index === 0}
                          className="rounded bg-slate-800 px-1.5 py-1 text-[9px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => onReorderCompLaneTake(lane.laneId, regionId, 'down')}
                          disabled={isReadOnly || index === lane.regionIds.length - 1}
                          className="rounded bg-slate-800 px-1.5 py-1 text-[9px] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {onSplitRegion && lane.activeRegionId && typeof playheadSeconds === 'number' && lane.regionIds.includes(lane.activeRegionId) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                    Playhead {playheadSeconds.toFixed(2)}s
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const activeRegion = regions.find((region) => region.regionId === lane.activeRegionId);
                      if (!activeRegion) return;
                      const splitTimeSec = Math.max(
                        activeRegion.startTimeSec + 0.01,
                        Math.min(activeRegion.startTimeSec + activeRegion.durationSec - 0.01, playheadSeconds)
                      );
                      onSplitRegion(activeRegion, Number(splitTimeSec.toFixed(3)));
                    }}
                    disabled={isReadOnly}
                    className="rounded bg-fuchsia-500/10 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Split @ Playhead
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const RegionLane = React.memo(RegionLaneComponent);

export default RegionLane;
