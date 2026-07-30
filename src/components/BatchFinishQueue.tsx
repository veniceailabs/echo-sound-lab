import React from 'react';
import type { BatchState, AlbumCohesionProfile, CohesionTrackReport } from '../types';
import type { HarmonizePlan } from '../services/batchMasterService';

interface BatchFinishQueueProps {
  tracks: CohesionTrackReport[];
  profile: AlbumCohesionProfile | null;
  progress: BatchState['progress'];
  plan: HarmonizePlan | null;
  isBusy?: boolean;
  onQueueAlbumFinish?: () => void;
}

const statusTone: Record<'queued' | 'analyzing' | 'applying' | 'done' | 'failed', string> = {
  queued: 'bg-slate-700/70 text-slate-300',
  analyzing: 'bg-amber-500/15 text-amber-300',
  applying: 'bg-cyan-500/15 text-cyan-300',
  done: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-rose-500/15 text-rose-300',
};

const BatchFinishQueue: React.FC<BatchFinishQueueProps> = ({
  tracks,
  profile,
  progress,
  plan,
  isBusy = false,
  onQueueAlbumFinish,
}) => {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-950/55 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Batch queue</p>
          <h3 className="mt-2 text-lg font-bold text-white">Album export queue</h3>
        </div>
        <button
          type="button"
          onClick={onQueueAlbumFinish}
          disabled={isBusy || !profile || tracks.length < 2}
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
        >
          Queue Album Finish
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Tracks</div>
          <div className="mt-1 text-sm font-semibold text-white">{tracks.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Profile</div>
          <div className="mt-1 text-sm font-semibold text-white">{profile ? profile.name : 'Build the album DNA first'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Status</div>
          <div className="mt-1 text-sm font-semibold text-white">{plan ? `${plan.directives.length} directives ready` : 'No plan yet'}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {tracks.length === 0 && (
          <p className="text-sm text-slate-400">No tracks are in the album DNA queue yet.</p>
        )}
        {tracks.map((track) => (
          <div key={track.id} className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{track.trackName}</div>
                <div className="text-xs text-slate-400">LUFS {track.lufs.toFixed(1)} · vibe {track.humanIntentIndex ?? '--'}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${statusTone[progress[track.id] ?? 'queued']}`}>
                {progress[track.id] ?? 'queued'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {plan && plan.directives.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Directives</div>
          <div className="mt-3 space-y-3">
            {plan.directives.slice(0, 5).map((directive) => (
              <div key={directive.trackId} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{directive.trackName}</div>
                  <span className="text-xs text-slate-400">{directive.vibeMatch}% vibe</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Target gain {directive.targetGainDb >= 0 ? '+' : ''}{directive.targetGainDb.toFixed(1)} dB · harmonics {directive.harmonicsShift >= 0 ? '+' : ''}{directive.harmonicsShift.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchFinishQueue;
