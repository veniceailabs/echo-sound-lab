/**
 * Action Authority: Visual State Contract
 *
 * Master mapping from HUDState (visual projection) to visual properties.
 * This is source-of-truth for all HUD rendering.
 * No derivation, no inference—HUDState → visual properties only.
 *
 * HUDState is derived from (AAState, holdProgress) by the projection layer.
 * The HUD receives HUDState only and renders deterministically.
 */

import { AAState } from "./fsm";

// ============================================================================
// HUDState: The Visual Projection of the Authority Layer
// ============================================================================

/**
 * HUDState: Mirrors AAState but includes the projected HOLDING state.
 * HOLDING is not in AAState (FSM is locked), but exists as a visual state.
 * The projection layer (useActionAuthority) computes:
 *   (AAState.VISIBLE_GHOST, holdProgress > 0) → HUDState.HOLDING
 *   All other AAStates → HUDState (1:1 passthrough)
 */
export enum HUDState {
  VISIBLE_GHOST = "VISIBLE_GHOST",
  HOLDING = "HOLDING",
  PREVIEW_ARMED = "PREVIEW_ARMED",
  CONFIRM_READY = "CONFIRM_READY",
  EXECUTED = "EXECUTED",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED",
}

// ============================================================================
// CONSTANT TOKEN MAPS (Hardcoded CSS Values for Determinism)
// ============================================================================

/**
 * COLORS: Tailwind colors converted to hex.
 * Hardcoded to ensure visual consistency regardless of CSS framework.
 */
export const COLORS = {
  NEUTRAL: "#94a3b8",      // slate-400
  ACTIVE: "#3b82f6",       // blue-500
  SAFETY: "#f59e0b",       // amber-500
  DANGER: "#d97706",       // amber-600
  SUCCESS: "#22c55e",      // green-500
  ALERT: "#ef4444",        // red-500
  DISMISSED: "#6b7280",    // gray-500
  TRANSPARENT: "transparent",
  RAIL_BG: "rgba(15, 23, 42, 0.9)", // slate-900 @ 90%
} as const;

/**
 * BORDERS: CSS border styles.
 */
export const BORDERS = {
  NONE: "none",
  DASHED_2: "2px dashed",
  SOLID_3: "3px solid",
  SOLID_4: "4px solid",
} as const;

/**
 * FILTERS: Screen effects (visual feedback only).
 */
export const FILTERS = {
  NONE: "none",
  BLOOM: "bloom",
  DESATURATE: "desaturate",
  FLASH: "flash",
  SMOKE: "smoke",
} as const;

/**
 * AUDIO_FEEDBACK: Audio cues (informational only).
 */
export const AUDIO_FEEDBACK = {
  NONE: "none",
  PULSE: "pulse",
  CLICK: "click",
  TINGLE: "tingle",
  CHIME: "chime",
  BUZZ: "buzz",
  WHOOSH: "whoosh",
} as const;

// ============================================================================
// VISUAL STATE PROPERTIES INTERFACE
// ============================================================================

/**
 * Visual properties for a given HUDState.
 * All fields are typed using keyof typeof TOKEN_MAP to prevent inline values.
 */
export interface VisualStateProperties {
  opacity: number; // 0.0 to 1.0
  borderStyle: typeof BORDERS[keyof typeof BORDERS];
  borderColor: typeof COLORS[keyof typeof COLORS];
  audioFeedback: typeof AUDIO_FEEDBACK[keyof typeof AUDIO_FEEDBACK];
  screenEffect: typeof FILTERS[keyof typeof FILTERS];
  statusText: string;
}

// ============================================================================
// MASTER VISUAL & SENSORY CONTRACT TABLE
// ============================================================================

/**
 * Exhaustive mapping of HUDState → VisualStateProperties.
 * All rows from Master Visual & Sensory Contract Table.
 * Missing states result in compile-time type error (no default case).
 */
export const VISUAL_CONTRACT: Record<HUDState, VisualStateProperties> = {
  [HUDState.VISIBLE_GHOST]: {
    opacity: 0.3,
    borderStyle: BORDERS.DASHED_2,
    borderColor: COLORS.NEUTRAL,
    audioFeedback: AUDIO_FEEDBACK.NONE,
    screenEffect: FILTERS.NONE,
    statusText: "Holding Intent…",
  },

  [HUDState.HOLDING]: {
    opacity: 0.3, // Base opacity; UI animates fill via holdProgress prop
    borderStyle: BORDERS.DASHED_2,
    borderColor: COLORS.ACTIVE,
    audioFeedback: AUDIO_FEEDBACK.PULSE,
    screenEffect: FILTERS.NONE,
    statusText: "Arming…",
  },

  [HUDState.PREVIEW_ARMED]: {
    opacity: 0.8,
    borderStyle: BORDERS.SOLID_3,
    borderColor: COLORS.SAFETY,
    audioFeedback: AUDIO_FEEDBACK.CLICK,
    screenEffect: FILTERS.BLOOM,
    statusText: "⚠️ ACTION ARMED",
  },

  [HUDState.CONFIRM_READY]: {
    opacity: 1.0,
    borderStyle: BORDERS.SOLID_4,
    borderColor: COLORS.DANGER,
    audioFeedback: AUDIO_FEEDBACK.TINGLE,
    screenEffect: FILTERS.DESATURATE,
    statusText: "⚖️ CONFIRM AUTHORITY",
  },

  [HUDState.EXECUTED]: {
    opacity: 1.0,
    borderStyle: BORDERS.SOLID_4,
    borderColor: COLORS.SUCCESS,
    audioFeedback: AUDIO_FEEDBACK.CHIME,
    screenEffect: FILTERS.FLASH,
    statusText: "✅ SEALED & LOGGED",
  },

  [HUDState.EXPIRED]: {
    opacity: 0,
    borderStyle: BORDERS.NONE,
    borderColor: COLORS.ALERT,
    audioFeedback: AUDIO_FEEDBACK.BUZZ,
    screenEffect: FILTERS.SMOKE,
    statusText: "❌ CONTEXT STALE",
  },

  [HUDState.REJECTED]: {
    opacity: 0,
    borderStyle: BORDERS.NONE,
    borderColor: COLORS.DISMISSED,
    audioFeedback: AUDIO_FEEDBACK.WHOOSH,
    screenEffect: FILTERS.NONE,
    statusText: "⊘ DISMISSED",
  },
};

// ============================================================================
// CONVENIENCE FUNCTION (Pure lookup, no logic)
// ============================================================================

/**
 * Get visual properties for a given HUDState.
 * This is a lookup only. No derivation, no inference.
 */
export function getVisualPropertiesForState(
  state: HUDState
): VisualStateProperties {
  return VISUAL_CONTRACT[state];
}
