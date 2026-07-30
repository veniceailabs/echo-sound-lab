import React from 'react';
import type { AlbumAuthorityAnalysis } from '../services/finishing/albumAuthorityEngine';
import type { FinishLoopAnalysis } from '../services/finishing/finishLoopEngine';
import type { ReferenceDeltaAnalysis } from '../services/finishing/referenceDeltaEngine';
import type { SessionFinishAuthorityAnalysis } from '../services/finishing/sessionFinishAuthority';
import type { BatchState, AlbumCohesionProfile, CohesionTrackReport } from '../types';
import type { HarmonizePlan } from '../services/batchMasterService';
import BatchFinishQueue from './BatchFinishQueue';

interface FinalDeliverablesPanelProps {
  finishLoop?: FinishLoopAnalysis | null;
  albumAuthority?: AlbumAuthorityAnalysis | null;
  referenceDelta?: ReferenceDeltaAnalysis | null;
  sessionFinish?: SessionFinishAuthorityAnalysis | null;
  batchState: BatchState;
  cohesionTracks: CohesionTrackReport[];
  albumPlan: HarmonizePlan | null;
  albumProfile: AlbumCohesionProfile | null;
  isBusy?: boolean;
  onQueueAlbumFinish?: () => void;
  onExportCurrentMasterWav?: () => void;
  onExportCurrentMasterMp3?: () => void;
  onExportAltLoudnessVariants?: () => void;
  onExportComplianceReport?: () => void;
}

const FinalDeliverablesPanel: React.FC<FinalDeliverablesPanelProps> = ({
  finishLoop,
  albumAuthority,
  referenceDelta,
  sessionFinish,
  batchState,
  cohesionTracks,
  albumPlan,
  albumProfile,
  isBusy = false,
  onQueueAlbumFinish,
  onExportCurrentMasterWav,
  onExportCurrentMasterMp3,
  onExportAltLoudnessVariants,
  onExportComplianceReport,
}) => {
  if (!finishLoop && !albumAuthority && !referenceDelta && !sessionFinish) {
    return null;
  }

  const releaseBadge = finishLoop?.verdict ?? sessionFinish?.verdict ?? 'BORDERLINE';

  return (
    <div className="mt-6 rounded-2xl border border-slate-700/60 bg-slate-950/60 p-5 sm:p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-orange-300">Deliverables</p>
          <h3 className="mt-2 text-lg font-bold text-white">Finish exports and release pack</h3>
        </div>
        <p className="text-xs text-slate-400">Export masters, alt-loudness versions, and compliance artifacts from one place.</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Finish Gate</div>
          <div className="mt-1 text-sm font-semibold text-white">{releaseBadge}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Album DNA</div>
          <div className="mt-1 text-sm font-semibold text-white">{albumProfile ? albumProfile.name : 'Not built yet'}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Album Tracks</div>
          <div className="mt-1 text-sm font-semibold text-white">{cohesionTracks.length}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={onExportCurrentMasterWav}
          disabled={isBusy}
          className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Export</div>
          <div className="mt-1 text-sm font-semibold text-white">Current Master WAV</div>
        </button>
        <button
          type="button"
          onClick={onExportCurrentMasterMp3}
          disabled={isBusy}
          className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Export</div>
          <div className="mt-1 text-sm font-semibold text-white">Current Master MP3</div>
        </button>
        <button
          type="button"
          onClick={onExportAltLoudnessVariants}
          disabled={isBusy}
          className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Export</div>
          <div className="mt-1 text-sm font-semibold text-white">Alt Loudness Variants</div>
        </button>
        <button
          type="button"
          onClick={onExportComplianceReport}
          disabled={isBusy}
          className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Export</div>
          <div className="mt-1 text-sm font-semibold text-white">Compliance Report</div>
        </button>
      </div>

      <div className="mt-5">
        <BatchFinishQueue
          tracks={cohesionTracks}
          profile={albumProfile}
          progress={batchState.progress}
          plan={albumPlan}
          isBusy={isBusy}
          onQueueAlbumFinish={onQueueAlbumFinish}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {sessionFinish && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Session</div>
            <div className="mt-1 text-sm font-semibold text-white">{sessionFinish.verdict.replace(/_/g, ' ')}</div>
          </div>
        )}
        {albumAuthority && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Album</div>
            <div className="mt-1 text-sm font-semibold text-white">{albumAuthority.verdict.replace(/_/g, ' ')}</div>
          </div>
        )}
        {referenceDelta && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Reference</div>
            <div className="mt-1 text-sm font-semibold text-white">{referenceDelta.matchScore}% match</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinalDeliverablesPanel;
