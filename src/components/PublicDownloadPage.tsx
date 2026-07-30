import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ProofPlayer from './ProofPlayer';
import StudioBrand from './StudioBrand';
import { loadCoreSession, recoverCoreSession } from '../services/coreApi';
import { stripeService } from '../services/stripeService';

interface PublicDownloadPageProps {
  jobId: string;
  onBackHome?: () => void;
}

type SessionPayload = Awaited<ReturnType<typeof loadCoreSession>>['session'];

const PUBLIC_PREVIEW_PRICE_LABEL = '$25';

const PublicDownloadPage: React.FC<PublicDownloadPageProps> = ({ jobId, onBackHome }) => {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackPreview, setFallbackPreview] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const checkoutState = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const value = new URLSearchParams(window.location.search).get('checkout');
    if (value === 'success' || value === 'cancelled') {
      return value;
    }
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setFallbackPreview(false);
      try {
        const response = await loadCoreSession(jobId);
        if (!cancelled) {
          setSession(response.session);
        }
      } catch (primaryError) {
        try {
          const recovered = await recoverCoreSession(jobId);
          if (!cancelled) {
            setSession(recovered.session);
          }
        } catch (fallbackError) {
          if (!cancelled) {
            if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
              setFallbackPreview(true);
              setError(null);
            } else {
              setError(primaryError instanceof Error ? primaryError.message : 'Could not load session');
            }
            setSession(null);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const proofSources = useMemo(() => {
    if (fallbackPreview || !session) {
      return { beforeSrc: undefined as string | undefined, afterSrc: undefined as string | undefined };
    }
    const audioPaths = (session?.audio_paths || {}) as Record<string, unknown>;
    const beforeSrc =
      (typeof audioPaths.unmixed_summed_audio === 'string' && audioPaths.unmixed_summed_audio) ||
      (typeof audioPaths.before_preview_url === 'string' && audioPaths.before_preview_url);
    const afterSrc =
      (typeof audioPaths.final_mastered_audio === 'string' && audioPaths.final_mastered_audio) ||
      (typeof audioPaths.after_preview_url === 'string' && audioPaths.after_preview_url);
    return { beforeSrc, afterSrc };
  }, [fallbackPreview, session]);

  const paymentStatus = session?.payment_status || 'unpaid';
  const downloadUrl = `/api/proxy/core/api/v1/process/download/${encodeURIComponent(jobId)}`;
  const deliverySummary = useMemo(() => {
    const delivery = (session?.workspace_sandbox_delivery || {}) as Record<string, unknown>;
    const vaultArchivePath =
      (typeof delivery.vault_archive_path === 'string' && delivery.vault_archive_path) ||
      (typeof session?.workspace_archive_path === 'string' && session.workspace_archive_path) ||
      (typeof session?.output_path === 'string' && session.output_path) ||
      null;
    const staged = typeof delivery.staged === 'boolean' ? delivery.staged : null;
    const reason = typeof delivery.reason === 'string' ? delivery.reason : null;
    return { vaultArchivePath, staged, reason };
  }, [session]);

  const handlePurchase = async () => {
    setCheckoutLoading(true);
    setError(null);
    try {
      await stripeService.redirectToExportCheckout(jobId);
    } catch (purchaseError) {
      setError(purchaseError instanceof Error ? purchaseError.message : 'Checkout failed');
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#03050a] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-xl">
          <StudioBrand />
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-300">
              Master complete
            </span>
            {onBackHome && (
              <button
                onClick={onBackHome}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Back home
              </button>
            )}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-5 py-5 backdrop-blur-xl">
          <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/80">Master complete</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Your preview is ready
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Job <span className="font-mono text-slate-200">{jobId}</span>
          </p>
          {checkoutState === 'success' && (
            <p className="mt-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-emerald-300">
              Checkout returned successfully
            </p>
          )}
          {checkoutState === 'cancelled' && (
            <p className="mt-3 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-300">
              Checkout cancelled. Preview remains available.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {error}
          </div>
        )}
        {fallbackPreview && !error && (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            Preview session not available in this environment. The proof view stays empty until a real session is loaded.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ProofPlayer
              beforeSrc={proofSources.beforeSrc}
              afterSrc={proofSources.afterSrc}
              beforeLabel="Before"
              afterLabel="After"
              title="A/B proof"
              subtitle="The preview plays the raw sum against the ESL master for the first 30 seconds so the value is obvious before payment."
              previewSeconds={30}
              previewBadge="30 second preview"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl"
          >
            <p className="text-[10px] uppercase tracking-[0.32em] text-orange-300/80">Export gate</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Download High-Res WAV & Distro-Ready ZIP</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              The preview is free. The archive stays locked until checkout clears.
            </p>

            <div className="mt-6 grid gap-3 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-400">Payment status</span>
                <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${
                  paymentStatus === 'paid'
                    ? 'bg-emerald-400/15 text-emerald-300'
                    : 'bg-amber-400/15 text-amber-300'
                }`}>
                  {paymentStatus}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-400">Route</span>
                <span className="font-mono text-slate-200">{downloadUrl}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-400">Public price</span>
                <span className="text-white">{PUBLIC_PREVIEW_PRICE_LABEL}</span>
              </div>
              {deliverySummary.vaultArchivePath && (
                <div className="space-y-2 border-t border-white/10 pt-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Vault archive</span>
                    <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${
                      deliverySummary.staged
                        ? 'bg-emerald-400/15 text-emerald-300'
                        : 'bg-slate-500/15 text-slate-300'
                    }`}>
                      {deliverySummary.staged ? 'staged' : 'pending'}
                    </span>
                  </div>
                  <p className="break-all font-mono text-[11px] leading-5 text-slate-300">
                    {deliverySummary.vaultArchivePath}
                  </p>
                  {deliverySummary.reason && (
                    <p className="text-xs leading-5 text-slate-500">{deliverySummary.reason}</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {paymentStatus === 'paid' ? (
                <a
                  href={downloadUrl}
                  className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_0_30px_rgba(52,211,153,0.18)] transition hover:translate-y-[-1px]"
                >
                  Download unlocked archive
                </a>
              ) : (
                <button
                  onClick={handlePurchase}
                  disabled={checkoutLoading || loading}
                  className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(249,115,22,0.18)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading ? 'Opening Stripe…' : `Purchase (${PUBLIC_PREVIEW_PRICE_LABEL})`}
                </button>
              )}
              <p className="text-xs leading-6 text-slate-500">
                The backend gates the final archive by job id, so the download only opens after payment is recorded.
              </p>
            </div>

            {loading && (
              <p className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-500">
                Loading session details…
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default PublicDownloadPage;
