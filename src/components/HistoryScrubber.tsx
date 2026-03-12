import React from 'react';
import { useTranslation } from 'react-i18next';

export interface HistoryScrubberEvent {
  proposalId: string;
  actionType: string;
  actorId: string;
  timestamp: number;
}

interface HistoryScrubberProps {
  totalSteps: number;
  currentIndex: number;
  currentHash: string;
  isPreviewMode: boolean;
  canBranchFromState?: boolean;
  isBusy?: boolean;
  hydrationDurationMs?: number;
  replayedActionCount?: number;
  fromSnapshotIndex?: number;
  frameBudgetMs?: number;
  events: HistoryScrubberEvent[];
  onChangeIndex: (index: number) => void;
  onJumpLatest: () => void;
  onRestoreToIndex: (index: number) => void;
  onBranchFromState?: (index: number) => void;
}

function HistoryScrubberComponent({
  totalSteps,
  currentIndex,
  currentHash,
  isPreviewMode,
  canBranchFromState = false,
  isBusy = false,
  hydrationDurationMs,
  replayedActionCount,
  fromSnapshotIndex,
  frameBudgetMs = 16,
  events,
  onChangeIndex,
  onJumpLatest,
  onRestoreToIndex,
  onBranchFromState,
}: HistoryScrubberProps) {
  const { t } = useTranslation();
  const selectedEvent = currentIndex > 0 ? events[currentIndex - 1] : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {t('history.title', { defaultValue: 'Visual Time-Travel' })}
          </p>
          <p className="text-[11px] text-slate-400">
            {t('history.stateLine', {
              current: currentIndex,
              total: totalSteps,
              defaultValue: 'State {{current}} / {{total}}',
            })}{' '}
            • {t('history.hashLabel', { defaultValue: 'hash' })}{' '}
            <span className="font-mono text-cyan-300">{currentHash.slice(0, 16)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onBranchFromState?.(currentIndex)}
            disabled={!canBranchFromState || isBusy || !onBranchFromState}
            className="rounded border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('history.branchFromHere', { defaultValue: 'Branch from Here' })}
          </button>
          <button
            type="button"
            onClick={onJumpLatest}
            disabled={currentIndex === totalSteps || isBusy}
            className="rounded border border-white/15 bg-slate-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('history.latest', { defaultValue: 'Latest' })}
          </button>
          <button
            type="button"
            onClick={() => onRestoreToIndex(currentIndex)}
            disabled={!isPreviewMode || isBusy}
            className="rounded border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('history.restore', { defaultValue: 'Restore' })}
          </button>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={totalSteps}
        value={currentIndex}
        disabled={isBusy}
        onChange={(event) => onChangeIndex(Number(event.target.value))}
        className="w-full accent-cyan-400"
      />

      {typeof hydrationDurationMs === 'number' && (
        <p className={`mt-2 text-[11px] ${hydrationDurationMs > frameBudgetMs ? 'text-amber-300' : 'text-emerald-300'}`}>
          {t('history.hydration', {
            duration: hydrationDurationMs.toFixed(2),
            count: replayedActionCount ?? 0,
            defaultValue: 'Hydration {{duration}}ms • replayed {{count}} actions',
          })}
          {typeof fromSnapshotIndex === 'number'
            ? t('history.snapshotSuffix', {
                index: fromSnapshotIndex,
                defaultValue: ' from snapshot {{index}}',
              })
            : ''}
        </p>
      )}

      {selectedEvent ? (
        <p className="mt-2 text-[11px] text-slate-400">
          {selectedEvent.actionType} by {selectedEvent.actorId} • {new Date(selectedEvent.timestamp).toLocaleTimeString()}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">
          {t('history.baseState', { defaultValue: 'Base state (no applied actions)' })}
        </p>
      )}
    </section>
  );
}

const HistoryScrubber = React.memo(HistoryScrubberComponent);

export default HistoryScrubber;
