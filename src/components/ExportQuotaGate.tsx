/**
 * ExportQuotaGate ‚ÄFeature gate for export quota limits
 *
 * Shows upgrade prompt when user hits free tier limit
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useUserTier } from '../context/UserTierContext';
import { exportQuotaService } from '../services/exportQuotaService';
import { stripeService } from '../services/stripeService';

interface ExportQuotaGateProps {
  onUpgrade?: () => void;
}

export const ExportQuotaGate: React.FC<ExportQuotaGateProps> = ({ onUpgrade }) => {
  const { tier } = useUserTier();
  const { remaining, limit } = exportQuotaService.getUsageInfo(tier);

  // Only show for free tier with limits
  if (limit === null) return null; // unlimited tier
  if (remaining === null || remaining > 0) return null; // has exports left

  // Free tier, quota exhausted
  const pricing = stripeService.getPricingInfo();
  const artistPlan = pricing.find((p) => p.tier === 'artist')!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-orange-500/5 p-4 mb-4"
    >
      <div className="flex items-start gap-3">
        <div className="text-orange-400 text-xl flex-shrink-0">‚ö†Ô∏è</div>
        <div className="flex-1">
          <h3 className="font-semibold text-orange-300 mb-1">Monthly export limit reached</h3>
          <p className="text-xs text-orange-200 mb-3">
            You've used all 5 free exports this month. Upgrade to Artist or higher to continue.
          </p>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onUpgrade}
              className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors"
            >
              Upgrade to Artist ‚Ä${artistPlan.price}/mo
            </motion.button>
            <button className="px-3 py-1.5 rounded-lg bg-white/10 text-orange-200 text-xs font-semibold hover:bg-white/15 transition-colors">
              Learn more
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Hook to check if export is allowed and get remaining count
 */
export function useExportQuota(): {
  canExport: boolean;
  remaining: number | null;
  limit: number | null;
  recordExport: () => void;
} {
  const { tier } = useUserTier();

  return {
    canExport: exportQuotaService.canExport(tier),
    remaining: exportQuotaService.getRemaining(tier),
    limit: exportQuotaService.getTierLimit(tier),
    recordExport: () => exportQuotaService.recordExport(tier),
  };
}

// Add getTierLimit to service
Object.assign(exportQuotaService, {
  getTierLimit(tier: any) {
    const TIER_LIMITS: Record<string, number | null> = {
      free: 5,
      artist: null,
      engineer: null,
      studio: null,
    };
    return TIER_LIMITS[tier];
  },
});
