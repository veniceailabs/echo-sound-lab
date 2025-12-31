/**
 * PHASE 1 LOCK - READ-ONLY PERCEPTION SURFACE
 *
 * This file is part of the Phase 1 APL <-> ANME boundary.
 *
 * Invariants:
 * - No control authority
 * - No lifecycle control
 * - No DSP execution
 * - No persistence
 * - No inferred intent
 *
 * Any mutation, execution, or control capability
 * requires a new, versioned contract (Phase 2+).
 */

import { aplConsumer } from './aplConsumer';

const IS_DEV = process.env.NODE_ENV === 'development';

type FrameHandler = Parameters<typeof aplConsumer.onFrame>[0];
type ChangeHandler = Parameters<typeof aplConsumer.onChange>[0];

export interface ANMEPerceptionHandlers {
  onFrame?: FrameHandler;
  onChange?: ChangeHandler;
}

const safeSerialize = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const assertFrozen = (value: unknown, label: string) => {
  if (!IS_DEV || !value || typeof value !== 'object') return;
  if (!Object.isFrozen(value)) {
    throw new Error(`[ANME] Invariant failed: ${label} must be immutable`);
  }
};

const invokeWithMutationGuard = <T>(
  label: string,
  value: T,
  handler: ((payload: T) => void) | undefined
) => {
  if (!handler) return;
  if (!IS_DEV) {
    handler(value);
    return;
  }
  const before = safeSerialize(value);
  handler(value);
  const after = safeSerialize(value);
  if (before !== null && after !== null && before !== after) {
    throw new Error(`[ANME] Invariant failed: ${label} must not be mutated`);
  }
};

export const attachANMEPerception = (
  handlers: ANMEPerceptionHandlers = {}
): (() => void) | undefined => {
  const snapshot = aplConsumer.getSnapshot();
  if (snapshot.state !== 'listening') {
    return;
  }

  const unsubFrame = aplConsumer.onFrame((frame) => {
    assertFrozen(frame, 'APL frame');
    invokeWithMutationGuard('APL frame', frame, handlers.onFrame);
  });

  const unsubChange = aplConsumer.onChange((change) => {
    assertFrozen(change, 'APL change');
    if (!Number.isFinite(change.confidence) || change.confidence < 0.5) {
      // Confidence gating per contract: ask or defer below threshold.
      return;
    }
    invokeWithMutationGuard('APL change', change, handlers.onChange);
  });

  return () => {
    unsubFrame();
    unsubChange();
  };
};
