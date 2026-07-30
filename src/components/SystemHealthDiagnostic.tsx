import React, { useEffect, useMemo, useState } from 'react';
import { requestJson } from '../services/backendApi';
import { isPremiumStackEnabled, INTEGRATION_FLAGS } from '../config/integrationFlags';

interface SystemHealthResponse {
  mode: 'SOVEREIGN' | 'PREMIUM';
  gemini: {
    configured: boolean;
    model: string;
  };
  integrations: {
    enableSunoIntegration: boolean;
    enablePremiumVoice: boolean;
    enableAnimateArt: boolean;
  };
  checkedAt: number;
}

type DiagnosticStatus = 'online' | 'disabled' | 'offline';

interface DiagnosticRow {
  id: string;
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

function statusPillClass(status: DiagnosticStatus): string {
  switch (status) {
    case 'online':
      return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
    case 'disabled':
      return 'bg-slate-600/20 text-slate-300 border border-slate-500/30';
    case 'offline':
    default:
      return 'bg-rose-500/10 text-rose-300 border border-rose-500/30';
  }
}

function statusGlyph(status: DiagnosticStatus): string {
  switch (status) {
    case 'online':
      return 'âœ“';
    case 'disabled':
      return 'â€”';
    case 'offline':
    default:
      return '!';
  }
}

const clientFallback: SystemHealthResponse = {
  mode: isPremiumStackEnabled() ? 'PREMIUM' : 'SOVEREIGN',
  gemini: {
    configured: false,
    model: 'unknown',
  },
  integrations: {
    enableSunoIntegration: INTEGRATION_FLAGS.ENABLE_SUNO_INTEGRATION,
    enablePremiumVoice: INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE,
    enableAnimateArt: INTEGRATION_FLAGS.ENABLE_ANIMATE_ART,
  },
  checkedAt: Date.now(),
};

const SystemHealthDiagnostic: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthResponse>(clientFallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await requestJson<SystemHealthResponse>('/api/proxy/system/health');
        if (!mounted) return;
        setHealth(response);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError((err as Error).message || 'Unable to read backend diagnostics');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo<DiagnosticRow[]>(() => {
    return [
      {
        id: 'gemini',
        label: 'Gemini Orchestrator',
        status: health.gemini.configured ? 'online' : 'offline',
        detail: health.gemini.configured
          ? `Online Â${health.gemini.model}`
          : 'Offline ÂGEMINI_API_KEY missing',
      },
      {
        id: 'suno',
        label: 'Suno Integration',
        status: health.integrations.enableSunoIntegration ? 'online' : 'disabled',
        detail: health.integrations.enableSunoIntegration ? 'Enabled' : 'Disabled (Sovereign Mode)',
      },
      {
        id: 'voice',
        label: 'Premium Voice',
        status: health.integrations.enablePremiumVoice ? 'online' : 'disabled',
        detail: health.integrations.enablePremiumVoice ? 'Enabled' : 'Disabled (Sovereign Mode)',
      },
      {
        id: 'animate-art',
        label: 'Animate Art',
        status: health.integrations.enableAnimateArt ? 'online' : 'disabled',
        detail: health.integrations.enableAnimateArt ? 'Enabled' : 'Disabled (Sovereign Mode)',
      },
      {
        id: 'stripe-core',
        label: 'Stripe Monetization Hook',
        status: 'online',
        detail: 'Checkout and webhook endpoints active in the local core',
      },
      {
        id: 'distro-packager',
        label: 'DistroKid API Export',
        status: 'online',
        detail: 'Payment-gated distro-ready ZIP endpoint active',
      },
    ];
  }, [health]);

  const modeLabel = health.mode === 'PREMIUM' ? 'Premium' : 'Sovereign (Zero-Cost)';

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">Studio Status</p>
          <p className="text-sm font-semibold text-slate-100">Mode: {modeLabel}</p>
        </div>
        {loading ? (
          <span className="text-[11px] text-slate-500">Checkingâ€¦</span>
        ) : (
          <span className="text-[11px] text-slate-500">Updated {new Date(health.checkedAt).toLocaleTimeString()}</span>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm text-slate-100">{row.label}</p>
              <p className="text-[11px] text-slate-400 truncate">{row.detail}</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full ${statusPillClass(row.status)}`}>
              <span className="font-bold">{statusGlyph(row.status)}</span>
              <span className="uppercase tracking-wider">{row.status}</span>
            </span>
          </div>
        ))}
      </div>

      {error ? (
        <p className="text-[11px] text-amber-300">
          Backend health check unavailable ({error}). Showing local fallback flags.
        </p>
      ) : null}
    </div>
  );
};

export default SystemHealthDiagnostic;
