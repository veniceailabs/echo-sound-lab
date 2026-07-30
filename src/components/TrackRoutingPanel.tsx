import React, { useCallback, useMemo } from 'react';
import type { ReplayTrackSend, ReplayTrackState } from '../services/deterministicReplayService';

interface TrackRoutingPanelProps {
  track: ReplayTrackState;
  tracks: ReplayTrackState[];
  isReadOnly?: boolean;
  estimatedLatencyMs?: number | null;
  onSetOutputBus: (trackId: string, outputBusId: string | null) => void;
  onSetSend: (trackId: string, send: ReplayTrackSend) => void;
  onRemoveSend: (trackId: string, sendId: string) => void;
}

const fieldClass = 'rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100';

export default function TrackRoutingPanel({
  track,
  tracks,
  isReadOnly = false,
  estimatedLatencyMs,
  onSetOutputBus,
  onSetSend,
  onRemoveSend,
}: TrackRoutingPanelProps) {
  const availableTargets = useMemo(
    () => tracks.filter((candidate) => candidate.trackId !== track.trackId && (candidate.kind === 'bus' || candidate.kind === 'master')),
    [track.trackId, tracks]
  );
  const getSendTargets = useCallback(
    (send: ReplayTrackSend) => (send.mode === 'sidechain'
      ? tracks.filter((candidate) => candidate.trackId !== track.trackId)
      : availableTargets),
    [availableTargets, track.trackId, tracks]
  );
  const routeTarget = track.outputBusId ?? '';
  const sends = track.sends || [];

  return (
    <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">Routing</p>
          <p className="mt-1 text-sm font-semibold text-white">Signal path and aux returns</p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
          {estimatedLatencyMs != null ? `${estimatedLatencyMs.toFixed(2)} ms est. latency` : 'Latency estimate unavailable'}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_1fr]">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Output bus</span>
          <select
            value={routeTarget}
            disabled={isReadOnly}
            onChange={(event) => onSetOutputBus(track.trackId, event.target.value || null)}
            className={`mt-1 w-full ${fieldClass}`}
          >
            <option value="">Master</option>
            {availableTargets.map((candidate) => (
              <option key={candidate.trackId} value={candidate.trackId}>
                {candidate.trackName} ({candidate.kind})
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Aux sends</span>
            <button
              type="button"
              disabled={isReadOnly}
                onClick={() => {
                  const fallbackTarget = availableTargets[0]?.trackId || 'master';
                  const sendId = `send-${track.trackId}-${Date.now().toString(36)}`;
                  onSetSend(track.trackId, {
                    sendId,
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
                {sends.length === 0 ? (
                  <p className="text-xs text-slate-500">No aux sends yet.</p>
                ) : sends.map((send) => (
                  <div key={send.sendId} className="rounded-lg border border-white/10 bg-slate-950/70 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={send.targetTrackId}
                        disabled={isReadOnly}
                        onChange={(event) => onSetSend(track.trackId, { ...send, targetTrackId: event.target.value })}
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
                      onChange={(event) => onSetSend(track.trackId, { ...send, preFader: event.target.checked })}
                    />
                    Pre
                  </label>
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        <input
                          type="checkbox"
                          checked={send.enabled}
                          disabled={isReadOnly}
                          onChange={(event) => onSetSend(track.trackId, { ...send, enabled: event.target.checked })}
                        />
                        On
                      </label>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => onSetSend(track.trackId, { ...send, mode: send.mode === 'sidechain' ? 'aux' : 'sidechain' })}
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
                        onClick={() => onRemoveSend(track.trackId, send.sendId)}
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
                    onChange={(event) => onSetSend(track.trackId, { ...send, levelDb: Number(event.target.value) })}
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

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">Output: {routeTarget || 'master'}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">{sends.length} send{sends.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}
