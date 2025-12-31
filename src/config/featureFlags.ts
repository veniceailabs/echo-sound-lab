/**
 * Feature Flags - Controls experimental features
 * Change these to control rollout and testing
 */

export const FEATURE_FLAGS = {
  /**
   * LISTENING_PASS_ENABLED
   * - When true: Listening Pass runs on every audio upload
   * - When false: Skipped (existing flows unchanged)
   * - Default: true (can toggle instantly in dev tools)
   */
  LISTENING_PASS_ENABLED: true,

  /**
   * LISTENING_PASS_LOG_ENABLED
   * - When true: Logs raw Listening Pass JSON to console
   * - When false: Logs only errors
   * - Default: true in development, false in production
   */
  LISTENING_PASS_LOG_ENABLED: process.env.NODE_ENV === 'development',

  /**
   * LISTENING_PASS_SHOW_REPORT_CARD
   * - When true: Renders Echo Report Card in UI (Phase 4)
   * - When false: Skipped
   * - Default: false (Phase 3+)
   */
  LISTENING_PASS_SHOW_REPORT_CARD: false,

  /**
   * LLM_REASONING_ENABLED
   * - When true: LLM reasoning runs after Listening Pass (Phase 3)
   * - When false: Listening Pass only, LLM skipped
   * - Default: true (LLM interpretation layer active)
   */
  LLM_REASONING_ENABLED: true,

  /**
   * LLM_FALLBACK_ON_ERROR
   * - When true: Use Listening Pass data if LLM fails
   * - When false: Show error message if LLM fails
   * - Default: true (graceful degradation)
   */
  LLM_FALLBACK_ON_ERROR: true,

  /**
   * APL_ENABLED
   * - When true: Audio Perception Layer runs during playback (listen-only)
   * - When false: APL is disabled entirely
   * - Default: true (safe, read-only, dev-visible)
   */
  APL_ENABLED: true,

  /**
   * APL_LOG_ENABLED
   * - When true: Logs APL frames in development
   * - When false: No APL logging
   * - Default: true in development, false in production
   */
  APL_LOG_ENABLED: process.env.NODE_ENV === 'development',
} as const;

/**
 * Runtime toggle (dev tools only)
 * Usage: window.__DEBUG__.toggleListeningPass()
 *        window.__DEBUG__.toggleLLMReasoning()
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__DEBUG__ = {
    toggleListeningPass: () => {
      FEATURE_FLAGS.LISTENING_PASS_ENABLED = !FEATURE_FLAGS.LISTENING_PASS_ENABLED;
      console.log(
        `[DEBUG] Listening Pass ${FEATURE_FLAGS.LISTENING_PASS_ENABLED ? 'ENABLED' : 'DISABLED'}`
      );
    },
    toggleLLMReasoning: () => {
      FEATURE_FLAGS.LLM_REASONING_ENABLED = !FEATURE_FLAGS.LLM_REASONING_ENABLED;
      console.log(
        `[DEBUG] LLM Reasoning ${FEATURE_FLAGS.LLM_REASONING_ENABLED ? 'ENABLED' : 'DISABLED'}`
      );
    },
    toggleAPL: () => {
      FEATURE_FLAGS.APL_ENABLED = !FEATURE_FLAGS.APL_ENABLED;
      console.log(
        `[DEBUG] APL ${FEATURE_FLAGS.APL_ENABLED ? 'ENABLED' : 'DISABLED'}`
      );
    },
    getFeatureFlags: () => FEATURE_FLAGS,
  };
}
