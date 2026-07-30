import React, { useEffect, useMemo, useState } from 'react';
import {
  getLocalMarketReadinessPlan,
  getLocalProductReadiness,
  type LocalMarketReadinessPlan,
  type LocalProductReadinessResponse,
} from '../services/backendApi';
import {
  createCoreRevision,
  getCoreAnalytics,
  getCoreReleaseBenchmark,
  getCoreProductCapabilities,
  getCoreReleaseAudit,
  getCoreReleaseReadiness,
  getCoreProofReport,
  getCoreRevisions,
  validateCoreUpload,
  type CoreAnalyticsResponse,
  type CoreProductCapability,
  type CoreReleaseBenchmarkResponse,
  type CoreReleaseAuditResponse,
  type CoreReleaseReadinessResponse,
  type CoreProofReportResponse,
  type CoreRevision,
} from '../services/coreApi';
import SystemHealthDiagnostic from './SystemHealthDiagnostic';
import { ProofTrainerPanel } from './ProofTrainerPanel';

const badgeClasses: Record<string, string> = {
  api_ready: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
  frontend_existing: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
  partial: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  planned: 'border-slate-500/25 bg-slate-500/10 text-slate-300',
};

const severityClasses: Record<string, string> = {
  P0: 'border-red-400/20 bg-red-500/10 text-red-200',
  P1: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
};

const ProductOpsDashboard: React.FC = () => {
  const [capabilities, setCapabilities] = useState<CoreProductCapability[]>([]);
  const [summary, setSummary] = useState({
    total_capabilities: 0,
    implemented_weighted: 0,
    implementation_progress_percent: 0,
    market_ready: false,
    release_stage: 'pre_market',
  });
  const [readiness, setReadiness] = useState<CoreReleaseReadinessResponse['readiness'] | null>(null);
  const [localReadiness, setLocalReadiness] = useState<LocalProductReadinessResponse['readiness'] | null>(null);
  const [localPlan, setLocalPlan] = useState<LocalMarketReadinessPlan | null>(null);
  const [audit, setAudit] = useState<CoreReleaseAuditResponse['audit'] | null>(null);
  const [benchmark, setBenchmark] = useState<CoreReleaseBenchmarkResponse['benchmark'] | null>(null);
  const [analytics, setAnalytics] = useState<CoreAnalyticsResponse['analytics'] | null>(null);
  const [proof, setProof] = useState<CoreProofReportResponse | null>(null);
  const [revisions, setRevisions] = useState<CoreRevision[]>([]);
  const [jobId, setJobId] = useState('album-studio-current');
  const [clientUuid, setClientUuid] = useState('');
  const [revisionText, setRevisionText] = useState('Increase vocal presence and tighten low-mid mud.');
  const [filePath, setFilePath] = useState('');
  const [validation, setValidation] = useState<null | Awaited<ReturnType<typeof validateCoreUpload>>>(null);
  const [error, setError] = useState('');

  const loadAll = async () => {
    setError('');
    try {
      const [capResp, analyticsResp, readinessResp, auditResp, benchmarkResp] = await Promise.all([
        getCoreProductCapabilities(),
        getCoreAnalytics(),
        getCoreReleaseReadiness(),
        getCoreReleaseAudit(),
        getCoreReleaseBenchmark(),
      ]);
      setCapabilities(capResp.capabilities);
      setSummary(capResp.summary);
      setReadiness(readinessResp.readiness);
      setAudit(auditResp.audit);
      setBenchmark(benchmarkResp.benchmark);
      setAnalytics(analyticsResp.analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load product ops data.');
    }

    try {
      const [readinessResp, planResp] = await Promise.all([
        getLocalProductReadiness(),
        getLocalMarketReadinessPlan(),
      ]);
      setLocalReadiness(readinessResp.readiness);
      setLocalPlan(planResp.plan);
    } catch {
      setLocalReadiness(null);
      setLocalPlan(null);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const groupedCapabilities = useMemo(() => {
    const groups = new Map<string, CoreProductCapability[]>();
    for (const capability of capabilities) {
      const list = groups.get(capability.category) || [];
      list.push(capability);
      groups.set(capability.category, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [capabilities]);

  const marketPlan = localPlan ?? localReadiness?.market_readiness_plan ?? readiness?.market_readiness_plan;
  const executiveDecision = marketPlan?.executive_decision ?? marketPlan?.release_promise ?? [];
  const currentStrengths = marketPlan?.current_strengths ?? [];
  const launchScopeIn = marketPlan?.launch_scope?.in_scope ?? [];
  const launchScopeOut = marketPlan?.launch_scope?.out_of_scope ?? [];
  const benchmarkDataset = marketPlan?.benchmark_program?.dataset ?? [];
  const benchmarkTechnicalGates = marketPlan?.benchmark_program?.technical_gates ?? [];
  const releaseScorecard = marketPlan?.release_scorecard ?? [];
  const claimRegistry = marketPlan?.claim_registry ?? [];
  const priorityOrder = marketPlan?.priority_order ?? [];

  const loadProof = async () => {
    setError('');
    try {
      setProof(await getCoreProofReport(jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load proof report.');
    }
  };

  const loadRevisions = async () => {
    setError('');
    try {
      setRevisions((await getCoreRevisions(jobId)).revisions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load revisions.');
    }
  };

  const createRevision = async () => {
    setError('');
    try {
      const result = await createCoreRevision({
        job_id: jobId,
        request_text: revisionText,
        client_uuid: clientUuid || undefined,
        change_log: { request_text: revisionText },
      });
      setRevisions(prev => [result.revision, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create revision.');
    }
  };

  const runValidation = async () => {
    setError('');
    try {
      setValidation(await validateCoreUpload(filePath));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload validation failed.');
    }
  };

  return (
    <main className="min-h-screen bg-[#070910] px-5 py-8 text-slate-200">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-300">Product OS</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white">ESL 32-Feature Control Room</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Capability registry, proof reports, revisions, analytics, and upload validation. This is the layer that turns the platform into a product system.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/admin/release-gates"
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100 hover:bg-cyan-500/20"
            >
              Release Gates
            </a>
            <button
              onClick={loadAll}
              className="rounded-xl border border-orange-400/30 bg-orange-500/15 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-200 hover:bg-orange-500/25"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">System Health</p>
            <h2 className="mt-2 text-2xl font-black text-white">Protected diagnostics</h2>
            <p className="mt-2 text-sm text-slate-400">
              The public app stays clean. Operational diagnostics live here.
            </p>
            <div className="mt-4">
              <SystemHealthDiagnostic />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Proof Trainer</p>
            <h2 className="mt-2 text-2xl font-black text-white">MixVault review</h2>
            <p className="mt-2 text-sm text-slate-400">
              Upload, render, and quarantine proof materials inside the ops dashboard.
            </p>
            <div className="mt-4">
              <ProofTrainerPanel />
            </div>
          </div>
        </div>

        {marketPlan && (
          <div className="rounded-3xl border border-orange-400/20 bg-gradient-to-br from-orange-500/10 via-white/[0.03] to-cyan-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-orange-200">Market Readiness Plan</p>
                <h2 className="mt-2 text-2xl font-black text-white">Truth reset, launch scope, and moat build</h2>
                <p className="mt-2 max-w-4xl text-sm text-slate-300">
                  {marketPlan.plan_document_path}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-right">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Release stage</p>
                <p className="mt-1 text-lg font-black text-white">
                  {marketPlan.status.replace(/_/g, ' ')} / {localReadiness?.release_stage ?? readiness?.release_stage ?? 'pre_market'}
                </p>
                <p className="text-xs text-slate-400">
                  {localReadiness?.market_ready ? 'Market ready' : 'Pre-market only'} • {marketPlan.weakness_counts.p0} P0 / {marketPlan.weakness_counts.p1} P1
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">Executive decision</p>
                <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-200">
                  {executiveDecision.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Current strengths</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
                  {currentStrengths.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Launch scope</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">In scope</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-200">
                  {launchScopeIn.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">Out of scope</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
                  {launchScopeOut.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">Benchmark program</p>
                <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Dataset</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-200">
                  {benchmarkDataset.slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">Technical gates</p>
                <p className="mt-2 text-sm text-slate-300">
                  {benchmarkTechnicalGates.length} enforced checks including clipping, timing drift, mono, and determinism.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Release scorecard</p>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    {releaseScorecard.reduce((sum, row) => sum + row.weight, 0)}% total
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {releaseScorecard.map((row) => (
                    <div key={row.category} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{row.category}</p>
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">{row.weight}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{row.result}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Public claim registry</p>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{claimRegistry.length} claims</span>
                </div>
                <div className="mt-3 space-y-2">
                  {claimRegistry.map((entry) => (
                    <div key={entry.claim} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{entry.claim}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
                          entry.status === 'verified'
                            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                            : entry.status === 'beta'
                              ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
                              : 'border-red-400/25 bg-red-500/10 text-red-200'
                        }`}>
                          {entry.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{entry.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">Immediate 30-day priorities</p>
                <ol className="mt-3 space-y-2 text-sm text-slate-200">
                  {priorityOrder.map((item, index) => (
                    <li key={item} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">0{index + 1}</span>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}

        {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Capabilities</p>
            <p className="mt-2 text-3xl font-black text-white">{summary.total_capabilities}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Weighted</p>
            <p className="mt-2 text-3xl font-black text-white">{summary.implemented_weighted.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Release Stage</p>
            <p className="mt-2 text-2xl font-black capitalize text-white">{summary.release_stage.replace(/_/g, ' ')}</p>
            <p className="mt-1 text-xs text-slate-400">
              {summary.market_ready ? 'Market ready' : 'Pre-market only'} • {summary.implementation_progress_percent.toFixed(1)}% implementation
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">P0 Blockers</p>
            <p className="mt-2 text-3xl font-black text-white">{readiness?.gate_counts.blocked ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">
              {marketPlan ? `${marketPlan.weakness_counts.p0} P0 / ${marketPlan.weakness_counts.p1} P1` : 'Loading plan...'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Benchmarked</p>
            <p className="mt-2 text-3xl font-black text-white">{benchmark?.session_counts.evaluated ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">
              avg match {benchmark?.average_match_score != null ? benchmark.average_match_score.toFixed(1) : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Analytics Events</p>
            <p className="mt-2 text-3xl font-black text-white">
              {analytics ? Object.values(analytics.counts as Record<string, number>).reduce((sum, value) => sum + value, 0) : 0}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">Capability Registry</h2>
                <p className="text-sm text-slate-400">Implementation progress, not launch readiness.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              <div className="font-semibold">Readiness verdict</div>
              <div className="mt-1">
                {readiness ? `Pre-market with ${readiness.gate_counts.blocked} blocked P0 gates.` : 'Loading readiness gate report...'}
              </div>
              {marketPlan && (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-200">
                  <div className="font-semibold text-white">Release promise</div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-300">
                    {marketPlan.release_promise.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {marketPlan && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Moat blockers</h3>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{marketPlan.status}</span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {marketPlan.weaknesses.map((weakness) => (
                    <div key={weakness.id} className={`rounded-xl border p-3 ${severityClasses[weakness.severity] || severityClasses.P1}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">{weakness.id}</p>
                        <span className="text-[10px] uppercase tracking-[0.18em]">{weakness.severity}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{weakness.title}</p>
                      <p className="mt-1 text-xs text-slate-200/90">{weakness.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {audit && (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
                <div className="font-semibold">Session audit</div>
                <div className="mt-1">
                  {audit.session_counts.approved} approved, {audit.session_counts.pending} pending, {audit.session_counts.total} total sessions in the ledger.
                </div>
                <div className="mt-2 text-xs text-cyan-50/80">{audit.purpose}</div>
              </div>
            )}
            {marketPlan && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Execution phases</h3>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{marketPlan.plan_document_path}</span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {marketPlan.phases.slice(0, 4).map((phase) => (
                    <div key={phase.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-300">Phase {phase.id}</p>
                      <p className="mt-1 text-sm font-semibold text-white">{phase.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{phase.exit_gate}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {groupedCapabilities.map(([category, items]) => (
                <div key={category} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-300">{category}</p>
                  <div className="mt-3 space-y-2">
                    {items.map(item => (
                      <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{item.label}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{item.proof}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${badgeClasses[item.status] || badgeClasses.planned}`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400">Next: {item.next_gate}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {readiness && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Top P0 blockers</h3>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{readiness.updated_at}</span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {readiness.gates
                    .filter((gate) => gate.severity === 'P0' && gate.status !== 'passing')
                    .slice(0, 6)
                    .map((gate) => (
                      <div key={gate.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">{gate.id}</p>
                          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{gate.severity}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">{gate.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{gate.evidence}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {audit && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">Ledger evidence</h3>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{audit.ledger_path}</span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {audit.gates.map((gate) => (
                    <div key={gate.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">{gate.id}</p>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{gate.status}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{gate.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{gate.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-xl font-bold text-white">Proof Report</h2>
              <div className="mt-3 flex gap-2">
                <input
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  placeholder="Job ID"
                  className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
                <button onClick={loadProof} className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
                  Load
                </button>
              </div>
              {proof?.proof_report ? (
                <div className="mt-4 space-y-3 text-sm">
                  <p className="text-slate-300">{String(proof.proof_report.summary || '')}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ['Before', proof.proof_report.score_before],
                      ['After', proof.proof_report.score_after],
                      ['Gain', proof.proof_report.improvement_points],
                      ['Translation', proof.proof_report.translation_score],
                      ['LU Delta', proof.proof_report.loudness_delta_lu],
                      ['Peak Delta', proof.proof_report.true_peak_delta_db],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
                        <p className="mt-1 text-lg font-bold text-white">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Load a saved job to show before/after proof.</p>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-xl font-bold text-white">Revisions</h2>
              <div className="mt-3 space-y-2">
                <input
                  value={clientUuid}
                  onChange={(e) => setClientUuid(e.target.value)}
                  placeholder="Client UUID"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
                <textarea
                  value={revisionText}
                  onChange={(e) => setRevisionText(e.target.value)}
                  rows={3}
                  placeholder="Describe the change request..."
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
                <div className="flex gap-2">
                  <button onClick={createRevision} className="rounded-xl border border-orange-400/30 bg-orange-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-200">
                    Create
                  </button>
                  <button onClick={loadRevisions} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300">
                    Refresh
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {revisions.length === 0 ? (
                  <p className="text-sm text-slate-500">No revisions loaded yet.</p>
                ) : (
                  revisions.map((revision) => (
                    <div key={revision.revision_id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">{revision.status}</p>
                        <span className="text-[10px] font-mono text-slate-500">{revision.revision_id.slice(0, 8)}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{revision.request_text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h2 className="text-xl font-bold text-white">Upload Validation</h2>
              <div className="mt-3 space-y-2">
                <input
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/path/to/audio.wav"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
                <button onClick={runValidation} className="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                  Validate
                </button>
              </div>
              {validation && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                  <p className="text-slate-300">Sample rate: {validation.metadata.sample_rate}</p>
                  <p className="text-slate-300">Channels: {validation.metadata.num_channels}</p>
                  <p className="text-slate-300">Duration: {validation.metadata.duration_seconds.toFixed(2)}s</p>
                  <p className="mt-2 text-emerald-300">Standardized: {validation.standardized_path}</p>
                  {validation.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-amber-200">
                      {validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-xl font-bold text-white">Analytics Funnel</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {analytics?.ordered_funnel.map((item) => (
              <div key={item.event} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{item.event}</p>
                <p className="mt-2 text-3xl font-black text-white">{item.count}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default ProductOpsDashboard;
