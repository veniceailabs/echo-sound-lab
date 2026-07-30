import React, { useEffect, useMemo, useState } from 'react';
import {
  getLocalMarketReadinessPlan,
  getLocalProductReadiness,
  type LocalMarketReadinessPlan,
  type LocalProductReadinessResponse,
} from '../services/backendApi';

type GateStatus = 'red' | 'yellow' | 'green';

interface ReleaseGateCard {
  id: string;
  title: string;
  status: GateStatus;
  owner: string;
  summary: string;
  weaknesses: Array<{
    id: string;
    severity: string;
    title: string;
    summary: string;
  }>;
}

const gateTone: Record<GateStatus, string> = {
  red: 'border-red-400/20 bg-red-500/10 text-red-200',
  yellow: 'border-amber-400/20 bg-amber-500/10 text-amber-200',
  green: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
};

const gateLabel: Record<GateStatus, string> = {
  red: 'RED',
  yellow: 'YELLOW',
  green: 'GREEN',
};

const GATE_GROUPS = [
  {
    id: 'sonic-quality',
    title: 'Sonic Quality',
    owner: 'Audio core',
    summary: 'The processed result must sound clearly better, not merely louder.',
    weaknessIds: ['W-01', 'W-06', 'W-07'],
  },
  {
    id: 'vocal-quality',
    title: 'Vocal Quality',
    owner: 'Vocal engine',
    summary: 'Lead vocals must stay intelligible, natural, dimensional, and independently controlled.',
    weaknessIds: ['W-02', 'W-03', 'W-04', 'W-05'],
  },
  {
    id: 'arrangement-integrity',
    title: 'Arrangement Integrity',
    owner: 'Session integrity',
    summary: 'Uploads must render the correct song with no missing, shifted, doubled, or substituted audio.',
    weaknessIds: ['W-09'],
  },
  {
    id: 'render-reliability',
    title: 'Render Reliability',
    owner: 'Backend platform',
    summary: 'Jobs must survive retries, failures, and production load without drifting from the manifest.',
    weaknessIds: ['W-10', 'W-13'],
  },
  {
    id: 'preview-export-parity',
    title: 'Preview / Export Parity',
    owner: 'Playback and render',
    summary: 'What the artist hears before export must agree with the bounced result.',
    weaknessIds: ['W-12'],
  },
  {
    id: 'security',
    title: 'Security',
    owner: 'Platform and API',
    summary: 'Tenant isolation, signed access, upload validation, and deletion behavior need production proof.',
    weaknessIds: ['W-14'],
  },
  {
    id: 'billing',
    title: 'Billing',
    owner: 'Commercial workflow',
    summary: 'Payment, revision, and fulfillment must complete in one verified customer journey.',
    weaknessIds: ['W-16'],
  },
  {
    id: 'legal',
    title: 'Legal',
    owner: 'Policy and product',
    summary: 'Rights, consent, and learning boundaries must be explicit and enforced in code.',
    weaknessIds: ['W-15'],
  },
] as const;

function getGateStatus(
  weaknesses: ReleaseGateCard['weaknesses'],
): GateStatus {
  if (weaknesses.some((item) => item.severity === 'P0')) return 'red';
  if (weaknesses.length > 0) return 'yellow';
  return 'green';
}

const ReleaseGatesDashboard: React.FC = () => {
  const [readiness, setReadiness] = useState<LocalProductReadinessResponse['readiness'] | null>(null);
  const [plan, setPlan] = useState<LocalMarketReadinessPlan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError('');
      try {
        const [readinessResponse, planResponse] = await Promise.all([
          getLocalProductReadiness(),
          getLocalMarketReadinessPlan(),
        ]);
        if (cancelled) return;
        setReadiness(readinessResponse.readiness);
        setPlan(planResponse.plan);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load release gates.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const gateCards = useMemo<ReleaseGateCard[]>(() => {
    const weaknessMap = new Map((plan?.weaknesses ?? []).map((item) => [item.id, item]));
    return GATE_GROUPS.map((group) => {
      const weaknesses = group.weaknessIds
        .map((id) => weaknessMap.get(id))
        .filter((item): item is NonNullable<ReleaseGateCard['weaknesses'][0]> => Boolean(item));
      return {
        id: group.id,
        title: group.title,
        owner: group.owner,
        summary: group.summary,
        weaknesses,
        status: getGateStatus(weaknesses),
      };
    });
  }, [plan]);

  return (
    <main className="min-h-screen bg-[#070910] px-5 py-8 text-slate-200">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-300">Release Governance</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Release Gates</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Every public claim must survive these gates before it appears in the app, the landing page, or a pitch deck.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <button
              onClick={() => {
                window.location.href = '/admin';
              }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 hover:bg-white/[0.08]"
            >
              Admin Queue
            </button>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Current stage</p>
              <p className="mt-1 text-lg font-black text-white">
                {readiness?.release_stage?.replace(/_/g, ' ') ?? 'Loading'}
              </p>
              <p className="text-xs text-slate-400">
                {readiness?.market_ready ? 'Market ready' : 'Pre-market only'}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Total gates</p>
            <p className="mt-2 text-3xl font-black text-white">{gateCards.length}</p>
          </div>
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-red-200/70">Red</p>
            <p className="mt-2 text-3xl font-black text-red-100">
              {gateCards.filter((gate) => gate.status === 'red').length}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200/70">Yellow</p>
            <p className="mt-2 text-3xl font-black text-amber-100">
              {gateCards.filter((gate) => gate.status === 'yellow').length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-200/70">Green</p>
            <p className="mt-2 text-3xl font-black text-emerald-100">
              {gateCards.filter((gate) => gate.status === 'green').length}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {gateCards.map((gate) => (
            <article
              key={gate.id}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{gate.owner}</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{gate.title}</h2>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${gateTone[gate.status]}`}>
                  {gateLabel[gate.status]}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-400">{gate.summary}</p>
              <div className="mt-4 space-y-3">
                {gate.weaknesses.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    No blocking weaknesses are currently mapped to this gate.
                  </div>
                ) : (
                  gate.weaknesses.map((weakness) => (
                    <div key={weakness.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{weakness.id}: {weakness.title}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${weakness.severity === 'P0' ? gateTone.red : gateTone.yellow}`}>
                          {weakness.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">{weakness.summary}</p>
                    </div>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>

        {plan?.claim_registry && (
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Claim Registry</p>
            <h2 className="mt-2 text-2xl font-black text-white">Public language must match evidence</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {plan.claim_registry.map((claim) => (
                <div key={claim.claim} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{claim.claim}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                      claim.status === 'verified'
                        ? gateTone.green
                        : claim.status === 'beta'
                        ? gateTone.yellow
                        : 'border-red-400/20 bg-red-500/10 text-red-200'
                    }`}>
                      {claim.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{claim.evidence}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
};

export default ReleaseGatesDashboard;
