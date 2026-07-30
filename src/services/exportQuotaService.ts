/**
 * Export Quota Service — Track and enforce per-tier export limits
 *
 * Tiers:
 *   free: 5 exports/month
 *   artist: unlimited ($19/mo)
 *   engineer: unlimited ($49/mo)
 *   studio: unlimited ($99/mo)
 */

import { SubscriptionTier } from '../context/UserTierContext';

const STORAGE_KEY = 'echo.exportQuota.v1';

interface QuotaData {
  monthKey: string; // YYYY-MM for monthly reset
  exportsThisMonth: number;
}

const TIER_LIMITS: Record<SubscriptionTier, number | null> = {
  free: 5,
  artist: null, // unlimited
  engineer: null,
  studio: null,
};

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function readQuotaFromStorage(): QuotaData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as QuotaData;
      // Reset if month changed
      if (data.monthKey !== getCurrentMonthKey()) {
        return { monthKey: getCurrentMonthKey(), exportsThisMonth: 0 };
      }
      return data;
    }
  } catch {
    // ignore
  }
  return { monthKey: getCurrentMonthKey(), exportsThisMonth: 0 };
}

function saveQuotaToStorage(data: QuotaData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export const exportQuotaService = {
  /**
   * Check if user can export at current tier
   */
  canExport(tier: SubscriptionTier): boolean {
    const limit = TIER_LIMITS[tier];
    if (limit === null) return true; // unlimited

    const quota = readQuotaFromStorage();
    return quota.exportsThisMonth < limit;
  },

  /**
   * Get remaining exports this month (null = unlimited)
   */
  getRemaining(tier: SubscriptionTier): number | null {
    const limit = TIER_LIMITS[tier];
    if (limit === null) return null;

    const quota = readQuotaFromStorage();
    return Math.max(0, limit - quota.exportsThisMonth);
  },

  /**
   * Record an export (call after successful download)
   */
  recordExport(tier: SubscriptionTier): void {
    const limit = TIER_LIMITS[tier];
    if (limit === null) return; // unlimited, no tracking needed

    const quota = readQuotaFromStorage();
    quota.exportsThisMonth += 1;
    saveQuotaToStorage(quota);
  },

  /**
   * Get usage info for display
   */
  getUsageInfo(tier: SubscriptionTier): { used: number; limit: number | null; remaining: number | null } {
    const quota = readQuotaFromStorage();
    const limit = TIER_LIMITS[tier];
    const remaining = limit !== null ? Math.max(0, limit - quota.exportsThisMonth) : null;

    return {
      used: quota.exportsThisMonth,
      limit,
      remaining,
    };
  },

  getTierLimit(tier: SubscriptionTier): number | null {
    return TIER_LIMITS[tier];
  },

  /**
   * Reset quota (for testing, or after purchase)
   */
  resetQuota(): void {
    saveQuotaToStorage({ monthKey: getCurrentMonthKey(), exportsThisMonth: 0 });
  },
};
