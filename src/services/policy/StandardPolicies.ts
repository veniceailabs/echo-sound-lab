/**
 * STANDARD POLICIES
 * The "Common Sense" rules that prevent disaster.
 *
 * These are immutable, core safety policies that govern:
 *  - Hearing Protection (Gain Limits)
 *  - Equipment Protection (Peak Levels)
 *  - Data Protection (Protected Tracks)
 *  - Operation Validation (Track Existence)
 */

import { SecurityPolicy, PolicyLevel, PolicyResult } from './PolicyTypes';
import { ExecutionPayload } from '../../types/execution-contract';

/**
 * POLICY: Maximum Gain Limit
 *
 * Rationale: Large gain changes can damage speakers, hearing, or distribute
 * to streaming platforms with catastrophic results (clipping, loudness wars).
 *
 * Rule: GAIN_ADJUSTMENT and NORMALIZATION actions capped at ±6dB.
 * Justification: 6dB is a perceptually significant change without being extreme.
 */
export const MaxGainPolicy: SecurityPolicy = {
  name: 'MAX_GAIN_LIMIT',
  description: 'Prevents gain changes larger than ±6dB to protect equipment and hearing.',

  validate: (payload: ExecutionPayload): PolicyResult => {
    // Only validate gain-related actions
    if (payload.actionType !== 'GAIN_ADJUSTMENT' && payload.actionType !== 'NORMALIZATION') {
      return {
        allowed: true,
        level: PolicyLevel.INFO,
        reason: 'N/A (not a gain action)',
        policyName: 'MAX_GAIN_LIMIT'
      };
    }

    // Extract gain value (could be in 'value' or 'targetLevel' field)
    const dbValue = payload.parameters.value !== undefined
      ? payload.parameters.value
      : payload.parameters.targetLevel !== undefined
      ? payload.parameters.targetLevel
      : 0;

    const MAX_DB = 6.0;

    // Check limit
    if (Math.abs(dbValue) > MAX_DB) {
      return {
        allowed: false,
        level: PolicyLevel.BLOCK,
        reason: `Gain change of ${dbValue.toFixed(1)}dB exceeds safety limit of ±${MAX_DB}dB.`,
        policyName: 'MAX_GAIN_LIMIT'
      };
    }

    return {
      allowed: true,
      level: PolicyLevel.INFO,
      reason: `Gain ${dbValue.toFixed(1)}dB is within safety limit.`,
      policyName: 'MAX_GAIN_LIMIT'
    };
  }
};

/**
 * POLICY: Protected Track Protection
 *
 * Rationale: Certain tracks (Master, Reference, Click) are critical to the
 * mix structure. Modifying them can destroy the entire mix.
 *
 * Rule: Block certain actions on protected track names.
 * Protected Tracks: Master, Stereo Out, Reference, Click, Control Room
 */
export const ProtectedTrackPolicy: SecurityPolicy = {
  name: 'PROTECTED_TRACKS',
  description: 'Prevents modification of critical tracks (Master, Reference, Click).',

  validate: (payload: ExecutionPayload): PolicyResult => {
    const trackName = (payload.parameters.track || '').toLowerCase();
    const PROTECTED_KEYWORDS = ['master', 'stereo out', 'reference', 'click', 'control room'];

    // Check if track matches any protected keyword
    const isProtected = PROTECTED_KEYWORDS.some(keyword => trackName.includes(keyword));

    if (isProtected) {
      // Block destructive/risky actions on protected tracks
      const RISKY_ACTIONS = ['DELETE', 'DC_REMOVAL', 'LIMITING'];

      if (RISKY_ACTIONS.includes(payload.actionType)) {
        return {
          allowed: false,
          level: PolicyLevel.BLOCK,
          reason: `Action '${payload.actionType}' is not allowed on protected track '${payload.parameters.track}'.`,
          policyName: 'PROTECTED_TRACKS'
        };
      }
    }

    return {
      allowed: true,
      level: PolicyLevel.INFO,
      reason: 'Track is not protected.',
      policyName: 'PROTECTED_TRACKS'
    };
  }
};

/**
 * POLICY: Peak Level Safety
 *
 * Rationale: True peak levels must stay below 0dBFS to prevent clipping.
 * Some platforms allow -1dBFS headroom, others -0.1dBFS.
 *
 * Rule: If we're reducing peaks, check that threshold is not too high.
 */
export const PeakLevelPolicy: SecurityPolicy = {
  name: 'PEAK_LEVEL_SAFETY',
  description: 'Ensures limiter thresholds prevent clipping.',

  validate: (payload: ExecutionPayload): PolicyResult => {
    // Only validate LIMITING action
    if (payload.actionType !== 'LIMITING') {
      return {
        allowed: true,
        level: PolicyLevel.INFO,
        reason: 'N/A (not a limiter action)',
        policyName: 'PEAK_LEVEL_SAFETY'
      };
    }

    const threshold = payload.parameters.threshold !== undefined
      ? payload.parameters.threshold
      : -0.1; // Default safe threshold

    // Threshold must be < 0dBFS (some breathing room required)
    if (threshold > 0) {
      return {
        allowed: false,
        level: PolicyLevel.BLOCK,
        reason: `Limiter threshold of ${threshold.toFixed(1)}dBFS allows clipping. Must be < 0dBFS.`,
        policyName: 'PEAK_LEVEL_SAFETY'
      };
    }

    return {
      allowed: true,
      level: PolicyLevel.INFO,
      reason: `Limiter threshold ${threshold.toFixed(1)}dBFS is safe.`,
      policyName: 'PEAK_LEVEL_SAFETY'
    };
  }
};

/**
 * POLICY: Parameter Sanity Check
 *
 * Rationale: Some parameters have obvious invalid ranges.
 * A compressor ratio of 1000:1 or a release time of 0ms are nonsensical.
 *
 * Rule: Validate parameter ranges for common DSP effects.
 */
export const ParameterSanityPolicy: SecurityPolicy = {
  name: 'PARAMETER_SANITY',
  description: 'Validates parameter ranges to prevent DSP nonsense.',

  validate: (payload: ExecutionPayload): PolicyResult => {
    // Check compression ratio if present
    if (payload.parameters.ratio !== undefined) {
      const ratio = payload.parameters.ratio;
      if (ratio < 1 || ratio > 100) {
        return {
          allowed: false,
          level: PolicyLevel.BLOCK,
          reason: `Compression ratio ${ratio}:1 is outside valid range (1-100).`,
          policyName: 'PARAMETER_SANITY'
        };
      }
    }

    // Check release time if present
    if (payload.parameters.release !== undefined) {
      const release = payload.parameters.release;
      if (release < 0 || release > 5000) {
        return {
          allowed: false,
          level: PolicyLevel.BLOCK,
          reason: `Release time ${release}ms is outside valid range (0-5000ms).`,
          policyName: 'PARAMETER_SANITY'
        };
      }
    }

    // Check attack time if present
    if (payload.parameters.attackTime !== undefined) {
      const attack = payload.parameters.attackTime;
      if (attack < 0 || attack > 1000) {
        return {
          allowed: false,
          level: PolicyLevel.BLOCK,
          reason: `Attack time ${attack}ms is outside valid range (0-1000ms).`,
          policyName: 'PARAMETER_SANITY'
        };
      }
    }

    // Check Q factor (for EQ)
    if (payload.parameters.q !== undefined) {
      const q = payload.parameters.q;
      if (q < 0.1 || q > 50) {
        return {
          allowed: false,
          level: PolicyLevel.BLOCK,
          reason: `Q factor ${q} is outside valid range (0.1-50).`,
          policyName: 'PARAMETER_SANITY'
        };
      }
    }

    return {
      allowed: true,
      level: PolicyLevel.INFO,
      reason: 'All parameters are within valid ranges.',
      policyName: 'PARAMETER_SANITY'
    };
  }
};

/**
 * Global Policy Set
 * These are the immutable, core safety policies applied to every execution.
 */
export const GlobalPolicies: SecurityPolicy[] = [
  MaxGainPolicy,
  ProtectedTrackPolicy,
  PeakLevelPolicy,
  ParameterSanityPolicy
];
