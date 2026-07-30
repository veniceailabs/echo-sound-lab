/**
 * UserTierContext — Sprint 5A
 * Subscription tier management with feature gating
 */
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type SubscriptionTier = 'free' | 'artist' | 'engineer' | 'studio';

const STORAGE_KEY = 'echo.subscriptionTier.v1';

// Feature gate map: feature → minimum tier required
const FEATURE_GATE_MAP: Record<string, SubscriptionTier> = {
  // Free tier features (all users)
  basic_export_16bit: 'free',
  lufs_metering: 'free',
  eq_basic: 'free',
  compression_basic: 'free',

  // Artist tier ($19/mo) — serious indie artists
  micro_moves: 'artist',
  unlimited_masters: 'artist',
  clean_export: 'artist',
  export_24bit: 'artist',          // 24-bit WAV — pro delivery
  export_32bit_float: 'artist',    // 32-bit float for DAW handoff
  export_flac: 'artist',           // Lossless FLAC
  sidechain_compression: 'artist', // Kick→bass ducking
  reference_matching: 'artist',    // Reference track analysis

  // Engineer tier ($49/mo) — semi-pro & home studio engineers
  midi_export: 'engineer',
  hardware_emulation: 'engineer',
  collaboration: 'engineer',
  batch_processing: 'engineer',
  wam_plugins: 'engineer',
  blind_testing: 'engineer',
  aesthetic_classifier: 'engineer',
  linear_phase_eq: 'engineer',     // Zero-phase mastering EQ
  analog_saturation: 'engineer',   // Tape/tube/console models
  stem_separation: 'engineer',     // Real Demucs separation
  engineer_style_match: 'engineer', // Ali / 40 / Rian / Manny profiles

  // Studio tier ($99/mo) — labels, studios, teams
  studio_seats: 'studio',
  provenance_signing: 'studio',    // Cryptographic render manifests
  bulk_stem_separation: 'studio',  // Batch Demucs via Replicate
  white_label: 'studio',          // Custom branding
};

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  artist: 1,
  engineer: 2,
  studio: 3,
};

interface UserTierContextValue {
  tier: SubscriptionTier;
  setTier: (tier: SubscriptionTier) => void;
  isAllowed: (feature: string) => boolean;
  requiredTier: (feature: string) => SubscriptionTier;
  showUpgradePrompt: (feature: string) => void;
  upgradeFeature: string | null;
  clearUpgradePrompt: () => void;
}

const UserTierContext = createContext<UserTierContextValue | null>(null);

function readTierFromStorage(): SubscriptionTier {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'free' || stored === 'artist' || stored === 'engineer' || stored === 'studio') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'free';
}

export const UserTierProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tier, setTierState] = useState<SubscriptionTier>(readTierFromStorage);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);

  const setTier = useCallback((newTier: SubscriptionTier) => {
    setTierState(newTier);
    try {
      localStorage.setItem(STORAGE_KEY, newTier);
    } catch {
      // ignore
    }
  }, []);

  const isAllowed = useCallback((feature: string): boolean => {
    const required = FEATURE_GATE_MAP[feature];
    if (!required) return true; // unknown feature = allowed
    return TIER_RANK[tier] >= TIER_RANK[required];
  }, [tier]);

  const requiredTier = useCallback((feature: string): SubscriptionTier => {
    return FEATURE_GATE_MAP[feature] ?? 'free';
  }, []);

  const showUpgradePrompt = useCallback((feature: string) => {
    setUpgradeFeature(feature);
  }, []);

  const clearUpgradePrompt = useCallback(() => {
    setUpgradeFeature(null);
  }, []);

  return (
    <UserTierContext.Provider value={{
      tier,
      setTier,
      isAllowed,
      requiredTier,
      showUpgradePrompt,
      upgradeFeature,
      clearUpgradePrompt,
    }}>
      {children}
    </UserTierContext.Provider>
  );
};

export function useUserTier(): UserTierContextValue {
  const ctx = useContext(UserTierContext);
  if (!ctx) throw new Error('useUserTier must be used inside UserTierProvider');
  return ctx;
}

export function useFeatureGate(feature: string): { allowed: boolean; requiredTier: SubscriptionTier } {
  const { isAllowed, requiredTier } = useUserTier();
  return {
    allowed: isAllowed(feature),
    requiredTier: requiredTier(feature),
  };
}

// Inline upgrade banner component
interface UpgradePromptProps {
  feature: string;
  onUpgrade?: () => void;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({ feature, onUpgrade }) => {
  const { requiredTier } = useUserTier();
  const needed = requiredTier(feature);
  const tierLabel = needed.charAt(0).toUpperCase() + needed.slice(1);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-sm">
      <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      <span className="text-orange-200">
        Upgrade to <strong className="text-orange-300">{tierLabel}</strong> to unlock {feature.replace(/_/g, ' ')}
      </span>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          className="ml-auto px-3 py-1 text-xs font-bold uppercase tracking-wider text-black bg-orange-400 hover:bg-orange-300 rounded-lg transition-colors"
        >
          Upgrade
        </button>
      )}
    </div>
  );
};

export default UserTierProvider;
