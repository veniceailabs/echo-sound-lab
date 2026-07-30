import React, { useCallback, useEffect, useState } from 'react';
import { getCoreAdminQueue, type CoreAdminJob } from '../services/coreApi';

const formatScore = (score: number | null | undefined): string => {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'Pending';
  return `${score.toFixed(score > 1 ? 1 : 3)}${score > 1 ? '%' : ''}`;
};

const formatDate = (epoch: number | undefined): string => {
  if (!epoch) return 'Not stamped';
  return new Date(epoch * 1000).toLocaleString();
};

const JobCard: React.FC<{ job: CoreAdminJob }> = ({ job }) => (
  <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">{job.status || 'pending'}</p>
        <h3 className="mt-1 font-mono text-sm text-slate-100">{job.job_id}</h3>
        <p className="mt-1 font-mono text-[11px] text-slate-500">{job.client_uuid || 'no-client-uuid'}</p>
      </div>
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-right">
        <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-200/70">Match</p>
        <p className="text-lg font-bold text-emerald-200">{formatScore(job.match_score)}</p>
      </div>
    </div>
    <div className="mt-4 grid gap-2 text-xs text-slate-400">
      <p><span className="text-slate-600">Profile:</span> {job.profile_name || 'default'}</p>
      <p><span className="text-slate-600">Updated:</span> {formatDate(job.updated_at_epoch)}</p>
      <p className="break-all"><span className="text-slate-600">Distro ZIP:</span> {job.workspace_archive_path || 'Not packaged yet'}</p>
      <p className="break-all"><span className="text-slate-600">Output:</span> {job.output_path || job.download_url || 'Not rendered yet'}</p>
    </div>
  </article>
);

const AdminQueueDashboard: React.FC = () => {
  const [jobs, setJobs] = useState<CoreAdminJob[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  const loadQueue = useCallback(() => {
    setStatus('loading');
    getCoreAdminQueue()
      .then((queue) => {
        setJobs(queue.jobs || []);
        setStatus('ready');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Admin queue unavailable');
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem('esl.adminToken')) {
      const token = window.prompt('Owner admin token, if configured. Leave blank for local dev.');
      if (token) window.localStorage.setItem('esl.adminToken', token);
    }
    loadQueue();
    const timer = window.setInterval(loadQueue, 15000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  const active = jobs.filter(job => ['processing', 'active', 'running'].includes(String(job.status || '').toLowerCase()));
  const completed = jobs.filter(job => String(job.status || '').toLowerCase() === 'completed');
  const pending = jobs.length - active.length - completed.length;

  return (
    <main className="min-h-screen bg-[#070910] px-6 py-8 text-slate-200">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-300">Echo Sound Lab Owner</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Fiverr Job Board</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Live queue visibility for isolated client workspaces, match scores, and secure Distro ZIP delivery paths.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                window.location.href = '/admin/release-gates';
              }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 hover:bg-white/[0.08]"
            >
              Release Gates
            </button>
            <button
              onClick={loadQueue}
              className="rounded-xl border border-orange-400/30 bg-orange-500/15 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-200 hover:bg-orange-500/25"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ['Total', jobs.length],
            ['Active', active.length],
            ['Pending', pending],
            ['Completed', completed.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-black text-white">{value}</p>
            </div>
          ))}
        </div>

        {status === 'error' && (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {status === 'loading' && jobs.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-sm text-slate-500">Loading queue...</div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-sm text-slate-500">No client jobs recorded yet.</div>
          ) : (
            jobs.map(job => <JobCard key={`${job.client_uuid}-${job.job_id}`} job={job} />)
          )}
        </div>
      </section>
    </main>
  );
};

export default AdminQueueDashboard;
