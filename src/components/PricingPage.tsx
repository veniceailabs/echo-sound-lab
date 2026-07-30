import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface PricingTier {
  name: string;
  price: number;
  billing: 'monthly' | 'annual';
  description: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

interface PricingPageProps {
  onBack?: () => void;
}

const PRICING_TIERS: Record<'monthly' | 'annual', PricingTier[]> = {
  monthly: [
    {
      name: 'Free',
      price: 0,
      billing: 'monthly',
      description: 'Hear what the workflow can do before you commit.',
      features: [
        '3 masters per month',
        'EQ, compression, and limiting',
        'LUFS metering for major platforms',
        'Watermarked 16-bit WAV export',
        'Mixing advice - 5 queries per month',
      ],
      cta: 'Start free',
    },
    {
      name: 'Artist',
      price: 19,
      billing: 'monthly',
      description: 'For serious independent artists and fast-moving releases.',
      features: [
        'Unlimited masters',
        '24-bit and 32-bit float WAV export',
        'FLAC lossless export',
        'Clean export without watermark',
        'Sidechain compression for kick-bass ducking',
        'Reference track matching',
        'Genre-optimized mastering',
        'Platform compliance reports',
        'Unlimited mixing advice',
      ],
      cta: 'Start 7-day trial',
      highlight: true,
    },
    {
      name: 'Engineer',
      price: 49,
      billing: 'monthly',
      description: 'Pro tools for mixing engineers and technical producers.',
      features: [
        'Everything in Artist',
        'Engineer style matching',
        'Real stem separation for vocals, drums, bass, and other',
        'Analog saturation models',
        'Linear-phase mastering EQ',
        'Hardware emulation for SSL, Neve, and API-style workflows',
        'MIDI stem export and piano roll',
        'Session collaboration',
        'Batch processing for unlimited tracks',
        'WAM plugin rack',
        'Blind A/B testing',
      ],
      cta: 'Start trial',
    },
    {
      name: 'Studio',
      price: 199,
      billing: 'monthly',
      description: 'For studios, labels, and teams that ship every week.',
      features: [
        'Everything in Engineer',
        '10 team seats',
        'Cryptographic render provenance',
        'Bulk stem separation',
        'White-label export with custom branding',
        'API access',
        'Custom engineer style profiles',
        'Priority cloud processing',
        'Dedicated support and SLA',
      ],
      cta: 'Contact sales',
    },
  ],
  annual: [
    {
      name: 'Free',
      price: 0,
      billing: 'annual',
      description: 'Hear what the workflow can do before you commit.',
      features: [
        '3 masters per month',
        'EQ, compression, and limiting',
        'LUFS metering for major platforms',
        'Watermarked 16-bit WAV export',
        'Mixing advice - 5 queries per month',
      ],
      cta: 'Start free',
    },
    {
      name: 'Artist',
      price: 190,
      billing: 'annual',
      description: 'For serious independent artists and fast-moving releases.',
      features: [
        'Unlimited masters',
        '24-bit and 32-bit float WAV export',
        'FLAC lossless export',
        'Clean export without watermark',
        'Sidechain compression for kick-bass ducking',
        'Reference track matching',
        'Genre-optimized mastering',
        'Platform compliance reports',
        'Unlimited mixing advice',
        '2 months free vs monthly',
      ],
      cta: 'Start 7-day trial',
      highlight: true,
    },
    {
      name: 'Engineer',
      price: 490,
      billing: 'annual',
      description: 'Pro tools for mixing engineers and technical producers.',
      features: [
        'Everything in Artist',
        'Engineer style matching',
        'Real stem separation for vocals, drums, bass, and other',
        'Analog saturation models',
        'Linear-phase mastering EQ',
        'Hardware emulation for SSL, Neve, and API-style workflows',
        'MIDI stem export and piano roll',
        'Session collaboration',
        'Batch processing for unlimited tracks',
        'WAM plugin rack',
        'Blind A/B testing',
        '2 months free vs monthly',
      ],
      cta: 'Start trial',
    },
    {
      name: 'Studio',
      price: 1990,
      billing: 'annual',
      description: 'For studios, labels, and teams that ship every week.',
      features: [
        'Everything in Engineer',
        '10 team seats',
        'Cryptographic render provenance',
        'Bulk stem separation',
        'White-label export with custom branding',
        'API access',
        'Custom engineer style profiles',
        'Priority cloud processing',
        'Dedicated support and SLA',
        '2 months free vs monthly',
      ],
      cta: 'Contact sales',
    },
  ],
};

const PricingPage: React.FC<PricingPageProps> = ({ onBack }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const tiers = PRICING_TIERS[billingCycle];

  return (
    <motion.div
      className="relative min-h-screen overflow-hidden bg-[#03050a] px-4 py-8 text-slate-100 sm:px-6 lg:px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(168,85,247,0.14),_transparent_24%),linear-gradient(180deg,_rgba(2,6,23,0.82),_rgba(3,5,10,1))]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      <div className="relative mx-auto max-w-7xl space-y-12">
        <div className="flex items-center justify-between gap-4">
          <div>
            {onBack && (
              <button
                onClick={onBack}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Back to studio
              </button>
            )}
          </div>

          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-300">
            Validation-only pricing
          </div>
        </div>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div className="space-y-5">
            <p className="text-[10px] uppercase tracking-[0.34em] text-cyan-300/75">Pricing</p>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              Validation pricing for a product that is still proving the workflow.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
              This page documents draft tiers for pre-market validation. It is not a launch
              promise, and it should not be read as proof of market readiness.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.18)]">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['8', 'analysis layers'],
                ['12', 'export targets'],
                ['1', 'guided flow'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-3xl font-black text-white">{value}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.22em] text-cyan-300">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex justify-center">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
            <motion.button
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-cyan-500/25 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Monthly
            </motion.button>
            <motion.button
              onClick={() => setBillingCycle('annual')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                billingCycle === 'annual'
                  ? 'bg-cyan-500/25 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Annual
            </motion.button>
          </div>
        </div>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier, index) => (
            <motion.div
              key={tier.name}
              className={`rounded-[1.75rem] border p-6 backdrop-blur-xl ${
                tier.highlight
                  ? 'border-cyan-400/40 bg-gradient-to-br from-cyan-400/12 to-blue-500/12 shadow-[0_24px_80px_rgba(34,211,238,0.18)]'
                  : 'border-white/10 bg-white/[0.04] shadow-[0_18px_60px_rgba(0,0,0,0.15)]'
              }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: index * 0.08 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold text-white">{tier.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{tier.description}</p>
                </div>
                {tier.highlight && (
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-200">
                    Best value
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tight text-white">${tier.price}</span>
                <span className="text-sm uppercase tracking-[0.24em] text-slate-400">
                  {tier.price > 0 ? `/${billingCycle === 'monthly' ? 'mo' : 'yr'}` : 'forever'}
                </span>
              </div>

              {tier.price === 0 && (
                <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                  No credit card required
                </p>
              )}

              <motion.button
                className={`mt-6 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  tier.highlight
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                    : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {tier.cta}
              </motion.button>

              <div className="mt-6 space-y-3 border-t border-white/8 pt-5">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <span className="mt-0.5 text-cyan-300">✓</span>
                    <span className="text-sm leading-6 text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </section>

        <section className="grid gap-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/75">
              Delivery proof
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
              Built for artists, engineers, and teams that need fewer surprises.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              The pricing model mirrors the app: start light, step up when the session becomes
              a system, and keep the output aligned to the platform you are shipping to.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              'Fast setup',
              'Clean exports',
              'Reference matching',
              'Batch delivery',
              'Client proofs',
              'Team seats',
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default PricingPage;
