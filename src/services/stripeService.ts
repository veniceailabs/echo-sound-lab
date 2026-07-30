/**
 * Stripe Service — Subscription payment integration
 *
 * Pricing:
 *   artist: $19/mo
 *   engineer: $49/mo
 *   studio: $99/mo
 */

import { SubscriptionTier } from '../context/UserTierContext';
import { createCoreCheckout } from './coreApi';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_demo';

const PRICE_IDS: Record<Exclude<SubscriptionTier, 'free'>, string> = {
  artist: import.meta.env.VITE_STRIPE_PRICE_ARTIST || 'price_test_artist',
  engineer: import.meta.env.VITE_STRIPE_PRICE_ENGINEER || 'price_test_engineer',
  studio: import.meta.env.VITE_STRIPE_PRICE_STUDIO || 'price_test_studio',
};

const EXPORT_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_EXPORT || 'price_test_export';

const TIER_PRICES: Record<Exclude<SubscriptionTier, 'free'>, number> = {
  artist: 19,
  engineer: 49,
  studio: 99,
};

export const stripeService = {
  /**
   * Create checkout session for tier upgrade
   * Backend endpoint required: POST /api/stripe/checkout
   */
  async createCheckoutSession(tier: Exclude<SubscriptionTier, 'free'>): Promise<{ sessionId: string; url: string }> {
    try {
      const data = await createCoreCheckout(`subscription-${tier}`, PRICE_IDS[tier]);
      return { sessionId: data.checkout_session_id, url: data.checkout_url };
    } catch (err) {
      console.error('Stripe checkout error:', err);
      throw err;
    }
  },

  /**
   * Redirect to Stripe Checkout
   */
  async redirectToCheckout(tier: Exclude<SubscriptionTier, 'free'>): Promise<void> {
    try {
      const { url } = await this.createCheckoutSession(tier);
      window.location.href = url;
    } catch (err) {
      console.error('Redirect failed:', err);
      throw err;
    }
  },

  async createExportCheckout(jobId: string): Promise<{ sessionId: string; url: string }> {
    try {
      const successUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/download/${encodeURIComponent(jobId)}?checkout=success`
          : undefined;
      const cancelUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/download/${encodeURIComponent(jobId)}?checkout=cancelled`
          : undefined;
      const data = await createCoreCheckout(jobId, EXPORT_PRICE_ID, { successUrl, cancelUrl });
      return { sessionId: data.checkout_session_id, url: data.checkout_url };
    } catch (err) {
      console.error('Export checkout error:', err);
      throw err;
    }
  },

  async redirectToExportCheckout(jobId: string): Promise<void> {
    try {
      const { url } = await this.createExportCheckout(jobId);
      window.location.href = url;
    } catch (err) {
      console.error('Export redirect failed:', err);
      throw err;
    }
  },

  /**
   * Get tier pricing
   */
  getPrice(tier: Exclude<SubscriptionTier, 'free'>): number {
    return TIER_PRICES[tier];
  },

  /**
   * Get all pricing info
   */
  getPricingInfo(): Array<{
    tier: Exclude<SubscriptionTier, 'free'>;
    name: string;
    price: number;
    features: string[];
  }> {
    return [
      {
        tier: 'artist',
        name: 'Artist',
        price: 19,
        features: [
          '✓ Unlimited exports',
          '✓ 24-bit + 32-bit float WAV',
          '✓ Reference matching',
          '✓ Priority support',
        ],
      },
      {
        tier: 'engineer',
        name: 'Engineer',
        price: 49,
        features: [
          '✓ All Artist features',
          '✓ Hardware emulation',
          '✓ Real-time collaboration',
          '✓ Batch processing',
          '✓ Linear-phase EQ',
          '✓ Engineer style matching',
          '✓ Stem separation',
        ],
      },
      {
        tier: 'studio',
        name: 'Studio',
        price: 99,
        features: [
          '✓ All Engineer features',
          '✓ Multi-user seats (5)',
          '✓ Provenance signing',
          '✓ White-label branding',
          '✓ API access',
          '✓ Dedicated support',
        ],
      },
    ];
  },
};
