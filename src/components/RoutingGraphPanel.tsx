import React, { useMemo, useState } from 'react';
import type { ReplayTrackSend, ReplayTrackState } from '../services/deterministicReplayService';

interface RoutingGraphPanelProps {
  tracks: ReplayTrackState[];
  isReadOnly?: boolean;
  estimatedLatencyByTrackId?: Record<string, { estimatedLatencyMs: number; compensationMs: number }>;
  onSetTrackRouting: (trackId: string, outputBusId: string | null) => void;
  onSetTrackSend: (trackId: string, send: ReplayTrackSend) => void;
  onRemoveTrackSend: (trackId: string, sendId: string) => void;
}

const columnOrder = ['source', 'bus', 'master'] as const;
const nodeWidth = 228;
const nodeHeight = 112;
const colGap = 30;
const rowGap = 18;

function getColumn(track: ReplayTrackState): number {
  if (track.kind === 'master') return 2;
  if (track.kind === 'bus') return 1;
  return 0;
}

function getLabel(track: ReplayTrackState): string {
  return `${track.trackName} • ${track.kind}`;
}

export default function RoutingGraphPanel({
  tracks,
  isReadOnly = false,
  estimatedLatencyByTrackId = {},
  onSetTrackRouting,
  onSetTrackSend,
  onRemoveTrackSend,
}: RoutingGraphPanelProps) {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(tracks[0]?.trackId || null);

  const nodeLayout = useMemo(() => {
    const columns = new Map<number, ReplayTrackState[]>();
    for (const track of tracks) {
      const column = getColumn(track);
      if (!columns.has(column)) columns.set(column, []);
      columns.get(column)!.push(track);
    }
    for (const column of columns.values()) {
      column.sort((left, right) => left.trackName.localeCompare(right.trackName));
    }

    const positions = new Map<string, { x: number; y: number; column: number }>();
    let maxRows = 0;
    for (const columnIndex of columnOrder.map((_, index) => index)) {
      const columnTracks = columns.get(columnIndex) || [];
      maxRows = Math.max(maxRows, columnTracks.length);
      columnTracks.forEach((track, row) => {
        positions.set(track.trackId, {
          x: columnIndex * (nodeWidth + colGap),
          y: row * (nodeHeight + rowGap),
          column: columnIndex,
        });
      });
    }

    return {
      positions,
      width: columnOrder.length * nodeWidth + (columnOrder.length - 1) * colGap,
      height: Math.max(nodeHeight, maxRows * (nodeHeight + rowGap) - rowGap),
    };
  }, [tracks]);

  const selectedTrack = tracks.find((track) => track.trackId === selectedTrackId) || tracks[0] || null;
  const selectedTargets = useMemo(
    () => tracks.filter((candidate) => candidate.trackId !== selectedTrack?.trackId && (candidate.kind === 'bus' || candidate.kind === 'master')),
    [selectedTrack, tracks]
  );
  const getSendTargets = (send: ReplayTrackSend): ReplayTrackState[] => (
    send.mode === 'sidechain'
      ? tracks.filter((candidate) => candidate.trackId !== selectedTrack?.trackId)
      : selectedTargets
  );

  const edges = useMemo(() => {
    const lines: Array<{
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      dashed?: boolean;
      color: string;
      label: string;
    }> = [];
    for (const track of tracks) {
      const from = nodeLayout.positions.get(track.trackId);
      if (!from) continue;
      const fromX = from.x + nodeWidth;
      const fromY = from.y + nodeHeight / 2;
      const sourceLatency = estimatedLatencyByTrackId[track.trackId];

      const outputTargetId = track.outputBusId && track.outputBusId !== track.trackId ? track.outputBusId : 'master';
      const outputTarget = tracks.find((candidate) => candidate.trackId === outputTargetId);
      const to = outputTarget ? nodeLayout.positions.get(outputTarget.trackId) : null;
      if (to) {
        const targetLatency = estimatedLatencyByTrackId[outputTarget.trackId];
        lines.push({
          key: `main-${track.trackId}-${outputTarget.trackId}`,
          x1: fromX,
          y1: fromY,
          x2: to.x,
          y2: to.y + nodeHeight / 2,
          color: track.kind === 'bus' ? '#67e8f9' : '#22c55e',
          label: `${(sourceLatency?.estimatedLatencyMs ?? 0).toFixed(2)}ms → ${(targetLatency?.estimatedLatencyMs ?? 0).toFixed(2)}ms`,
        });
      }

      for (const send of track.sends || []) {
        const targetTrack = send.targetTrackId && send.targetTrackId !== 'master'
          ? tracks.find((candidate) => candidate.trackId === send.targetTrackId) || null
          : tracks.find((candidate) => candidate.kind === 'master') || null;
        const targetPos = targetTrack ? nodeLayout.positions.get(targetTrack.trackId) : null;
        if (!targetPos) continue;
        const targetLatency = estimatedLatencyByTrackId[targetTrack.trackId];
        const isSidechain = send.mode === 'sidechain';
        lines.push({
          key: `send-${track.trackId}-${send.sendId}`,
          x1: fromX,
          y1: fromY + 10,
          x2: targetPos.x,
          y2: targetPos.y + nodeHeight / 2 + 10,
          dashed: isSidechain,
          color: isSidechain
            ? (send.enabled ? '#f59e0b' : '#64748b')
            : (send.enabled ? '#c084fc' : '#475569'),
          label: isSidechain
            ? `SC ${send.levelDb.toFixed(1)}dB • ${(sourceLatency?.estimatedLatencyMs ?? 0).toFixed(2)}ms → ${(targetLatency?.estimatedLatencyMs ?? 0).toFixed(2)}ms`
            : `${send.levelDb.toFixed(1)}dB • ${(sourceLatency?.estimatedLatencyMs ?? 0).toFixed(2)}ms → ${(targetLatency?.estimatedLatencyMs ?? 0).toFixed(2)}ms`,
        });
      }
    }
    return lines;
  }, [nodeLayout.positions, tracks]);

  const fieldClass = 'rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100';

  return (
    <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">Routing Graph</p>
          <p className="mt-1 text-sm font-semibold text-white">Signal topology and node editor</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
          {tracks.length} node{tracks.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-xl border border-white/10 bg-slate-950/80 p-4">
        <div className="relative" style={{ width: `${nodeLayout.width}px`, height: `${nodeLayout.height}px` }}>
          <svg className="absolute inset-0 pointer-events-none" width={nodeLayout.width} height={nodeLayout.height}>
            {edges.map((edge) => (
              <g key={edge.key}>
                <path
                  d={`M ${edge.x1} ${edge.y1} C ${edge.x1 + 50} ${edge.y1}, ${edge.x2 - 50} ${edge.y2}, ${edge.x2} ${edge.y2}`}
                  stroke={edge.color}
                  strokeDasharray={edge.dashed ? '6 4' : undefined}
                  strokeWidth={2}
                  fill="none"
                  opacity={0.82}
                />
                <text
                  x={(edge.x1 + edge.x2) / 2}
                  y={(edge.y1 + edge.y2) / 2 - 4}
                  textAnchor="middle"
                  className="fill-slate-200"
                  fontSize="9"
                >
                  {edge.label}
                </text>
              </g>
            ))}
          </svg>

          {tracks.map((track) => {
            const position = nodeLayout.positions.get(track.trackId);
            if (!position) return null;
            const latency = estimatedLatencyByTrackId[track.trackId];
            const isSelected = selectedTrackId === track.trackId;
            return (
              <button
                key={track.trackId}
                type="button"
                onClick={() => setSelectedTrackId(track.trackId)}
                className={`absolute rounded-xl border p-3 text-left shadow-lg transition-colors ${
                  isSelected
                    ? 'border-cyan-300/70 bg-cyan-500/15'
                    : 'border-white/10 bg-slate-900/85 hover:border-cyan-300/40'
                }`}
                style={{
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  width: `${nodeWidth}px`,
                  height: `${nodeHeight}px`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{getLabel(track)}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      Route {track.outputBusId || 'master'}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-300">
                    {track.sends?.length || 0} aux
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                    {latency ? `${latency.estimatedLatencyMs.toFixed(2)} ms path` : '0.00 ms path'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
                    {latency ? `${latency.compensationMs.toFixed(2)} ms PDC` : '0.00 ms PDC'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedTrack && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Selected Node</p>
              <p className="mt-1 text-sm font-semibold text-white">{selectedTrack.trackName}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">
              {selectedTrack.kind}
            </span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.1fr]">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Output bus</span>
              <select
                value={selectedTrack.outputBusId ?? ''}
                disabled={isReadOnly || selectedTrack.kind === 'master'}
                onChange={(event) => onSetTrackRouting(selectedTrack.trackId, event.target.value || null)}
                className={`mt-1 w-full ${fieldClass}`}
              >
                <option value="">Master</option>
                {selectedTargets.map((candidate) => (
                  <option key={candidate.trackId} value={candidate.trackId}>
                    {candidate.trackName} ({candidate.kind})
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Aux sends</span>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => {
                    const fallbackTarget = selectedTargets[0]?.trackId || 'master';
                    onSetTrackSend(selectedTrack.trackId, {
                      sendId: `send-${selectedTrack.trackId}-${Date.now().toString(36)}`,
                      targetTrackId: fallbackTarget,
                      levelDb: -12,
                      preFader: false,
                      enabled: true,
                      mode: 'aux',
                    });
                  }}
                  className="rounded-md border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add send
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {(selectedTrack.sends || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No aux sends.</p>
                ) : (selectedTrack.sends || []).map((send) => (
                  <div key={send.sendId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={send.targetTrackId}
                        disabled={isReadOnly}
                        onChange={(event) => onSetTrackSend(selectedTrack.trackId, { ...send, targetTrackId: event.target.value })}
                        className={`${fieldClass} flex-1 min-w-[160px]`}
                      >
                        <option value="master">Master</option>
                        {getSendTargets(send).map((candidate) => (
                          <option key={candidate.trackId} value={candidate.trackId}>
                            {candidate.trackName} ({candidate.kind})
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        <input
                          type="checkbox"
                          checked={send.preFader}
                          disabled={isReadOnly}
                          onChange={(event) => onSetTrackSend(selectedTrack.trackId, { ...send, preFader: event.target.checked })}
                        />
                        Pre
                      </label>
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        <input
                          type="checkbox"
                          checked={send.enabled}
                          disabled={isReadOnly}
                          onChange={(event) => onSetTrackSend(selectedTrack.trackId, { ...send, enabled: event.target.checked })}
                        />
                        On
                      </label>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => onSetTrackSend(selectedTrack.trackId, { ...send, mode: send.mode === 'sidechain' ? 'aux' : 'sidechain' })}
                        className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                          send.mode === 'sidechain'
                            ? 'border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                            : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {send.mode === 'sidechain' ? 'SC' : 'Aux'}
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => onRemoveTrackSend(selectedTrack.trackId, send.sendId)}
                        className="rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={-36}
                        max={12}
                        step={0.1}
                        value={send.levelDb}
                        disabled={isReadOnly}
                        onChange={(event) => onSetTrackSend(selectedTrack.trackId, { ...send, levelDb: Number(event.target.value) })}
                        className="flex-1 accent-cyan-400"
                      />
                      <span className="w-14 text-right font-mono text-[10px] text-slate-300">
                        {send.levelDb.toFixed(1)} dB
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
