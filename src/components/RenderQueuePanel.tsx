import React from 'react';

export type RenderQueueFormat = 'WAV' | 'MP3';

export interface RenderQueueJobView {
  id: string;
  name: string;
  format: RenderQueueFormat;
  status: 'queued' | 'rendering' | 'encoding' | 'done' | 'failed';
  progress: number;
  createdAt: number;
  error?: string | null;
  blob?: Blob | null;
}

interface RenderQueuePanelProps {
  jobs: RenderQueueJobView[];
  onQueue: (format: RenderQueueFormat) => void;
  onDownload: (jobId: string) => void;
  disabled?: boolean;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const RenderQueuePanel: React.FC<RenderQueuePanelProps> = ({
  jobs,
  onQueue,
  onDownload,
  disabled = false,
}) => {
  return (
    <div className="bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.34)] overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Background Render Queue</p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">Queue exports while you keep working</h3>
          <p className="mt-1 text-xs text-slate-400">Jobs run one-by-one in the background. No session interruption.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onQueue('WAV')}
            disabled={disabled}
            className="rounded-lg border border-sky-400/35 bg-sky-500/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200 transition-colors hover:bg-sky-500/18 disabled:opacity-40"
          >
            Queue WAV
          </button>
          <button
            type="button"
            onClick={() => onQueue('MP3')}
            disabled={disabled}
            className="rounded-lg border border-orange-400/35 bg-orange-500/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200 transition-colors hover:bg-orange-500/18 disabled:opacity-40"
          >
            Queue MP3
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {jobs.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-500">No jobs in queue.</p>
        ) : jobs.map((job) => (
          <div key={job.id} className="rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-200">{job.name} · {job.format}</p>
                <p className="text-[11px] text-slate-400">{job.status.toUpperCase()} · {formatClock(job.createdAt)}</p>
                {job.error ? <p className="text-[11px] text-rose-300">{job.error}</p> : null}
              </div>
              {job.status === 'done' && job.blob ? (
                <button
                  type="button"
                  onClick={() => onDownload(job.id)}
                  className="rounded-md border border-emerald-400/35 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200"
                >
                  Download
                </button>
              ) : null}
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-900/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-300 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RenderQueuePanel;
