import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayAutomationLane, ReplayTrackState } from '../services/deterministicReplayService';
import { pluginRegistry } from '../services/plugins/pluginRegistry';

interface AutomationLaneProps {
  track: ReplayTrackState;
  lanes: ReplayAutomationLane[];
  pxPerSec: number;
  laneWidth: number;
  isReadOnly?: boolean;
  onAddPoint: (trackId: string, parameter: string, timeSec: number, value: number) => void;
  onSetPoint?: (trackId: string, parameter: string, pointId: string, timeSec: number, value: number) => void;
  showPlayhead?: boolean;
  compareLanes?: ReplayAutomationLane[];
}

interface AutomationTarget {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
}

const AUTOMATION_LANE_HEIGHT_PX = 72;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snapToStep(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function humanizeParameterName(parameter: string): string {
  return parameter
    .replace(/^plugin:/, '')
    .replace(/[:_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getYForValue(value: number, target: AutomationTarget): number {
  const range = Math.max(0.000001, target.max - target.min);
  const normalized = clamp((value - target.min) / range, 0, 1);
  return clamp((1 - normalized) * (AUTOMATION_LANE_HEIGHT_PX - 8) + 4, 2, AUTOMATION_LANE_HEIGHT_PX - 6);
}

function getValueForY(y: number, target: AutomationTarget): number {
  const normalized = clamp(1 - y / AUTOMATION_LANE_HEIGHT_PX, 0, 1);
  const raw = target.min + normalized * (target.max - target.min);
  const snapped = snapToStep(raw, target.step);
  return Number(clamp(snapped, target.min, target.max).toFixed(6));
}

function AutomationLaneComponent({
  track,
  lanes,
  pxPerSec,
  laneWidth,
  isReadOnly = false,
  onAddPoint,
  onSetPoint,
  showPlayhead = false,
  compareLanes = [],
}: AutomationLaneProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(lanes[0]?.parameter || 'volumeDb');
  const laneBodyRef = useRef<HTMLDivElement | null>(null);
  const dragPointRef = useRef<{ pointId: string; parameter: string; startClientX: number; startClientY: number } | null>(null);

  const endDrag = useCallback(() => {
    dragPointRef.current = null;
  }, []);

  const automationTargets = useMemo<AutomationTarget[]>(() => {
    const baseTargets: AutomationTarget[] = [
      {
        id: 'volumeDb',
        label: 'Track Volume',
        min: -60,
        max: 12,
        step: 0.1,
        defaultValue: 0,
        unit: 'dB',
      },
      {
        id: 'pan',
        label: 'Track Pan',
        min: -1,
        max: 1,
        step: 0.01,
        defaultValue: 0,
      },
    ];

    if (track.kind === 'master') {
      baseTargets.push(
        {
          id: 'master:normalizedTargetLUFS',
          label: 'Master Target LUFS',
          min: -24,
          max: -6,
          step: 0.1,
          defaultValue: -14,
          unit: 'LUFS',
        },
        {
          id: 'master:limiterThresholdDb',
          label: 'Master Limiter Threshold',
          min: -12,
          max: 0,
          step: 0.1,
          defaultValue: -0.1,
          unit: 'dB',
        }
      );
    }

    const sendTargets: AutomationTarget[] = (track.sends || []).flatMap((send) => ([
      {
        id: `send:${send.sendId}:levelDb`,
        label: `Send ${send.targetTrackId === 'master' ? 'Master' : send.targetTrackId} Level`,
        min: -60,
        max: 12,
        step: 0.1,
        defaultValue: send.levelDb,
        unit: 'dB',
      },
      {
        id: `send:${send.sendId}:enabled`,
        label: `Send ${send.targetTrackId === 'master' ? 'Master' : send.targetTrackId} Enable`,
        min: 0,
        max: 1,
        step: 1,
        defaultValue: send.enabled ? 1 : 0,
      },
    ]));

    const pluginTargets: AutomationTarget[] = [];
    for (const insert of track.inserts || []) {
      const manifest = pluginRegistry.getManifest(insert.manifestId);
      if (!manifest) continue;
      for (const param of manifest.parameters) {
        if (param.type !== 'float' && param.type !== 'int') continue;
        const min = typeof param.min === 'number' ? param.min : 0;
        const max = typeof param.max === 'number' ? param.max : 1;
        if (max <= min) continue;
        const defaultValue = typeof param.defaultValue === 'number'
          ? param.defaultValue
          : min;
        pluginTargets.push({
          id: `plugin:${insert.instanceId}:${param.id}`,
          label: `${manifest.displayName} -> ${param.label}`,
          min,
          max,
          step: typeof param.step === 'number' ? param.step : param.type === 'int' ? 1 : 0.01,
          defaultValue,
          unit: param.unit,
        });
      }
    }
    const knownTargetIds = new Set([...baseTargets, ...sendTargets, ...pluginTargets].map((target) => target.id));
    const customTargets: AutomationTarget[] = [];
    for (const lane of lanes) {
      if (knownTargetIds.has(lane.parameter)) continue;
      if (customTargets.some((target) => target.id === lane.parameter)) continue;
      const values = lane.points.map((point) => point.value);
      const minValue = values.length > 0 ? Math.min(...values) : 0;
      const maxValue = values.length > 0 ? Math.max(...values) : 1;
      const spread = Math.max(0.1, maxValue - minValue);
      customTargets.push({
        id: lane.parameter,
        label: `APL ${humanizeParameterName(lane.parameter)}`,
        min: Number((minValue - spread * 0.25).toFixed(3)),
        max: Number((maxValue + spread * 0.25).toFixed(3)),
        step: Math.abs(maxValue) >= 1 || Math.abs(minValue) >= 1 ? 0.1 : 0.01,
        defaultValue: lane.points[0]?.value ?? 0,
      });
    }
    return [...baseTargets, ...sendTargets, ...pluginTargets, ...customTargets];
  }, [lanes, track.inserts, track.sends]);

  useEffect(() => {
    if (automationTargets.length === 0) return;
    if (!automationTargets.some((target) => target.id === selectedTargetId)) {
      setSelectedTargetId(automationTargets[0].id);
    }
  }, [automationTargets, selectedTargetId]);

  const selectedTarget = automationTargets.find((target) => target.id === selectedTargetId) || automationTargets[0];

  const selectedLane = useMemo<ReplayAutomationLane>(() => {
    if (!selectedTarget) {
      return {
        laneId: `${track.trackId}:volumeDb`,
        trackId: track.trackId,
        parameter: 'volumeDb',
        points: [],
      };
    }
    const existing = lanes.find((lane) => lane.parameter === selectedTarget.id);
    if (existing) return existing;
    return {
      laneId: `${track.trackId}:${selectedTarget.id}`,
      trackId: track.trackId,
      parameter: selectedTarget.id,
      points: [],
    };
  }, [lanes, selectedTarget, track.trackId]);
  const compareLane = useMemo(() => compareLanes.find((lane) => lane.parameter === selectedLane.parameter), [compareLanes, selectedLane.parameter]);
  const comparePointsById = useMemo(() => new Map((compareLane?.points || []).map((point) => [point.pointId, point])), [compareLane]);
  const compareLaneStatus = compareLane
    ? compareLane.trackId !== selectedLane.trackId || compareLane.parameter !== selectedLane.parameter || compareLane.points.length !== selectedLane.points.length
      ? 'changed'
      : 'unchanged'
    : 'added';

  const sortedPoints = useMemo(() => {
    return [...selectedLane.points].sort((a, b) => (a.timeSec === b.timeSec ? a.value - b.value : a.timeSec - b.timeSec));
  }, [selectedLane.points]);

  const pathPoints = useMemo(() => {
    if (!selectedTarget || sortedPoints.length === 0) return '';
    return sortedPoints
      .map((point) => {
        const x = clamp(point.timeSec * pxPerSec, 0, laneWidth);
        const y = getYForValue(point.value, selectedTarget);
        return `${x},${y}`;
      })
      .join(' ');
  }, [laneWidth, pxPerSec, selectedTarget, sortedPoints]);

  const handleAddAutomationPoint = (timeSec: number, value: number) => {
    if (!selectedTarget) return;
    onAddPoint(track.trackId, selectedTarget.id, Number(timeSec.toFixed(3)), value);
  };

  const beginPointDrag = useCallback((event: React.PointerEvent, parameter: string, pointId: string) => {
    if (isReadOnly || !onSetPoint) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = laneBodyRef.current?.getBoundingClientRect() || null;
    if (!bounds) return;
    dragPointRef.current = {
      pointId,
      parameter,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    const activeTarget = automationTargets.find((target) => target.id === parameter) || selectedTarget;
    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragPointRef.current;
      if (!drag || !activeTarget) return;
      const timeSec = Math.max(0, (moveEvent.clientX - bounds.left) / pxPerSec);
      const localY = clamp(moveEvent.clientY - bounds.top, 0, bounds.height);
      const value = getValueForY(localY, activeTarget);
      onSetPoint(track.trackId, parameter, pointId, Number(timeSec.toFixed(3)), value);
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
  }, [automationTargets, endDrag, isReadOnly, onSetPoint, pxPerSec, selectedTarget, track.trackId]);

  return (
    <div ref={laneBodyRef} className="rounded-xl border border-white/10 bg-slate-950/50 p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Automation</p>
        <div className="flex items-center gap-1">
          {compareLane && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] ${
              compareLaneStatus === 'changed'
                ? 'border-amber-300/50 bg-amber-500/15 text-amber-100'
                : 'border-white/10 bg-white/[0.04] text-slate-300'
            }`}>
              {compareLaneStatus}
            </span>
          )}
          <select
            value={selectedTarget?.id || 'volumeDb'}
            onChange={(event) => setSelectedTargetId(event.target.value)}
            disabled={isReadOnly}
            className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-[10px] text-slate-200"
          >
            {automationTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (!selectedTarget) return;
              const nextTime = sortedPoints.length > 0 ? sortedPoints[sortedPoints.length - 1].timeSec + 1 : 0;
              const nextValue = sortedPoints.length > 0
                ? sortedPoints[sortedPoints.length - 1].value
                : selectedTarget.defaultValue;
              handleAddAutomationPoint(nextTime, Number(clamp(nextValue, selectedTarget.min, selectedTarget.max).toFixed(6)));
            }}
            disabled={isReadOnly || !selectedTarget}
            className="rounded bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Point
          </button>
        </div>
      </div>

      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
        <p>{selectedTarget?.label || selectedLane.parameter}</p>
        {selectedTarget && (
          <p className="font-mono">
            {selectedTarget.min.toFixed(2)} → {selectedTarget.max.toFixed(2)}{selectedTarget.unit ? ` ${selectedTarget.unit}` : ''}
          </p>
        )}
      </div>
      <div
        className={`relative overflow-hidden rounded-lg border border-white/5 bg-slate-900/70 ${isReadOnly ? '' : 'cursor-crosshair'}`}
        style={{ width: `${laneWidth}px`, minHeight: `${AUTOMATION_LANE_HEIGHT_PX}px` }}
        onClick={(event) => {
          if (isReadOnly || !selectedTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const localX = clamp(event.clientX - bounds.left, 0, bounds.width);
          const localY = clamp(event.clientY - bounds.top, 0, bounds.height);
          const timeSec = localX / pxPerSec;
          const value = getValueForY(localY, selectedTarget);
          handleAddAutomationPoint(timeSec, value);
        }}
      >
        {showPlayhead && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-cyan-300/80"
            style={{ left: 'var(--timeline-playhead-left, 0px)' }}
          />
        )}
        {pathPoints && (
          <svg
            width={laneWidth}
            height={AUTOMATION_LANE_HEIGHT_PX}
            className="pointer-events-none absolute inset-0 z-0"
          >
            <polyline
              points={pathPoints}
              fill="none"
              stroke="rgba(56, 189, 248, 0.9)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        )}
        {sortedPoints.map((point) => {
          const left = clamp(point.timeSec * pxPerSec, 0, laneWidth);
          const top = selectedTarget ? getYForValue(point.value, selectedTarget) : AUTOMATION_LANE_HEIGHT_PX / 2;
          const comparePoint = comparePointsById.get(point.pointId);
          const pointStatus = comparePoint
            ? comparePoint.timeSec !== point.timeSec || comparePoint.value !== point.value || comparePoint.curve !== point.curve
              ? 'changed'
              : 'unchanged'
            : 'added';
          return (
            <div
              key={point.pointId}
              className={`absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                pointStatus === 'changed'
                  ? 'border-amber-200/80 bg-amber-400/70'
                  : pointStatus === 'added'
                    ? 'border-emerald-200/80 bg-emerald-400/70'
                    : 'border-cyan-200/80 bg-cyan-400/60'
              }`}
              style={{ left: `${left}px`, top: `${top}px` }}
              title={`${selectedLane.parameter} ${point.value.toFixed(3)} @ ${point.timeSec.toFixed(3)}s`}
              onPointerDown={(event) => beginPointDrag(event, selectedLane.parameter, point.pointId)}
            />
          );
        })}
        {compareLane && compareLane.points.map((point) => {
          const activePoint = selectedLane.points.find((entry) => entry.pointId === point.pointId);
          if (activePoint) return null;
          const left = clamp(point.timeSec * pxPerSec, 0, laneWidth);
          const top = selectedTarget ? getYForValue(point.value, selectedTarget) : AUTOMATION_LANE_HEIGHT_PX / 2;
          return (
            <div
              key={`compare-${point.pointId}`}
              className="absolute z-[5] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-200/80 bg-fuchsia-400/50"
              style={{ left: `${left}px`, top: `${top}px` }}
              title={`Compare point ${point.value.toFixed(3)} @ ${point.timeSec.toFixed(3)}s`}
            />
          );
        })}
      </div>
    </div>
  );
}

export const AutomationLane = React.memo(AutomationLaneComponent);

export default AutomationLane;
