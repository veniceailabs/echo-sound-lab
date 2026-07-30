/**
 * SubscriptionPage â€Pricing and tier management
 *
 * Shows all tiers, pricing, features, and upgrade buttons.
 * Redirects to Stripe Checkout on click.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useUserTier, type SubscriptionTier } from '../context/UserTierContext';
import { stripeService } from '../services/stripeService';
import { exportQuotaService } from '../services/exportQuotaService';

export const SubscriptionPage: React.FC = () => {
  const { tier, setTier } = useUserTier();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tiers = stripeService.getPricingInfo();
  const quota = exportQuotaService.getUsageInfo(tier);

  const handleUpgrade = async (targetTier: Exclude<SubscriptionTier, 'free'>) => {
    setIsLoading(true);
    setError(null);

    try {
      await stripeService.redirectToCheckout(targetTier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-white p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-12">
        <h1 className="text-4xl font-bold mb-3">Echo Sound Lab Plans</h1>
        <p className="text-white/60 text-lg">
          Choose your plan and unlock professional mastering tools
        </p>
      </div>

      {/* Current tier badge */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="inline-block px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
          <p className="text-sm text-blue-300">
            Current plan: <strong>{tier.charAt(0).toUpperCase() + tier.slice(1)}</strong>
          </p>
          {tier === 'free' && quota.remaining !== null && (
            <p className="text-xs text-blue-200 mt-1">
              {quota.remaining} exports remaining this month
            </p>
          )}
        </div>
      </div>

      {/* Pricing cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Free tier (always shown but not upgradeable) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8"
        >
          <h3 className="text-2xl font-bold mb-2">Free</h3>
          <p className="text-white/60 mb-6">Getting started</p>
          <div className="text-4xl font-bold mb-6">$0<span className="text-lg text-white/60">/mo</span></div>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-white/80">âœ5 exports per month</li>
            <li className="text-sm text-white/80">âœBasic 16-bit export</li>
            <li className="text-sm text-white/80">âœLUFS metering</li>
            <li className="text-sm text-white/80">âœBasic EQ & compression</li>
          </ul>
          {tier === 'free' && (
            <button className="w-full px-4 py-2.5 rounded-lg bg-white/20 text-white font-medium cursor-default opacity-50">
              Current Plan
            </button>
          )}
        </motion.div>

        {/* Paid tiers */}
        {tiers.map((plan) => (
          <motion.div
            key={plan.tier}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
              rounded-2xl border p-8 transition-all duration-200
              ${
                tier === plan.tier
                  ? 'border-blue-500/50 bg-gradient-to-br from-blue-500/20 to-blue-500/5 ring-2 ring-blue-500/30'
                  : 'border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:border-white/20'
              }
            `}
          >
            <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
            <p className="text-white/60 mb-6">For {plan.tier === 'artist' ? 'indie artists' : plan.tier === 'engineer' ? 'engineers' : 'studios'}</p>

            <div className="text-4xl font-bold mb-6">
              ${plan.price}<span className="text-lg text-white/60">/mo</span>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, i) => (
                <li key={i} className="text-sm text-white/80">
                  {feature}
                </li>
              ))}
            </ul>

            {tier === plan.tier ? (
              <button className="w-full px-4 py-2.5 rounded-lg bg-white/20 text-white font-medium cursor-default opacity-50">
                Current Plan
              </button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => handleUpgrade(plan.tier)}
                disabled={isLoading}
                className={`
                  w-full px-4 py-2.5 rounded-lg font-medium transition-all duration-150 border
                  ${
                    isLoading
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                  }
                `}
              >
                {isLoading ? 'Loading...' : 'Upgrade'}
              </motion.button>
            )}
          </motion.div>
        ))}
      </div>

      {/* FAQ / Info */}
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
          <h2 className="text-2xl font-bold mb-6">FAQ</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Can I cancel anytime?</h3>
              <p className="text-white/60 text-sm">
                Yes, cancel your subscription at any time. You'll keep access until the end of your billing cycle.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
              <p className="text-white/60 text-sm">
                We accept all major credit cards via Stripe. Payments are secure and encrypted.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Do you offer discounts?</h3>
              <p className="text-white/60 text-sm">
                Annual billing comes with a 20% discount. Contact support@echo-sound-lab.com for enterprise pricing.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Can I upgrade/downgrade anytime?</h3>
              <p className="text-white/60 text-sm">
                Yes! Changes take effect immediately. We'll prorate charges based on your billing cycle.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="max-w-6xl mx-auto mt-8 p-4 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200">
          {error}
        </div>
      )}
    </div>
  );
};

export default SubscriptionPage;
