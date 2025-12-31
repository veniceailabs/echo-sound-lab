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

import {
  audioPerceptionLayer,
  APLSnapshot,
  APLEventHandler,
  PerceptualEmbedding,
  PerceptualFrame,
  APLChangeEvent,
} from './audioPerceptionLayer';

export type APLUnsubscribe = () => void;

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Read-only consumer surface for APL. No start/stop/config mutations here.
 */
export const aplConsumer = {
  getSnapshot(): APLSnapshot {
    return audioPerceptionLayer.getSnapshot();
  },

  onFrame(handler: (frame: PerceptualFrame) => void): APLUnsubscribe {
    return audioPerceptionLayer.on('frame', handler as APLEventHandler);
  },

  onEmbedding(handler: (embedding: PerceptualEmbedding) => void): APLUnsubscribe {
    return audioPerceptionLayer.on('embedding', handler as APLEventHandler);
  },

  onChange(handler: (change: APLChangeEvent) => void): APLUnsubscribe {
    return audioPerceptionLayer.on('change', handler as APLEventHandler);
  },

  onState(handler: (state: APLSnapshot['state']) => void): APLUnsubscribe {
    return audioPerceptionLayer.on('state', handler as APLEventHandler);
  },
};

if (IS_DEV) {
  const forbiddenKeys = ['start', 'stop', 'pause', 'resume', 'configure', 'setConfig', 'setEnabled'];
  forbiddenKeys.forEach(key => {
    if (key in aplConsumer) {
      throw new Error(`[APL] Invariant failed: aplConsumer must be read-only (found ${key})`);
    }
  });
  if ('audioPerceptionLayer' in (aplConsumer as Record<string, unknown>)) {
    throw new Error('[APL] Invariant failed: aplConsumer must not expose audioPerceptionLayer');
  }
  const allowedKeys = new Set(['getSnapshot', 'onFrame', 'onEmbedding', 'onChange', 'onState']);
  Object.getOwnPropertyNames(aplConsumer).forEach(key => {
    if (!allowedKeys.has(key)) {
      throw new Error(`[APL] Invariant failed: aplConsumer exposes unexpected member ${key}`);
    }
  });
  Object.freeze(aplConsumer);
}
