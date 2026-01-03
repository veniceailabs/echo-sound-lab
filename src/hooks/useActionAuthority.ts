/**
 * useActionAuthority Hook
 *
 * The Bridge between the Law (FSM) and the Citizen (APL/UI)
 *
 * This hook is PLATFORM-AGNOSTIC. It manages:
 *  ✅ FSM state machine lifecycle
 *  ✅ Temporal loop (400ms hold gesture)
 *  ✅ Clean React interface (state + actions)
 *  ✅ Animation loop for UI feedback
 *
 * It does NOT know about:
 *  ❌ Audio, Logic Pro, AppleScript
 *  ❌ Execution details (those are the Citizen's concern)
 *  ❌ Domain-specific state (those are passed in)
 *
 * Integration:
 *  1. Call arm() when user starts gesture (MouseDown, KeyDown)
 *  2. Call release() when user stops gesture (MouseUp, KeyUp)
 *  3. Call confirm() when user explicitly confirms (Enter)
 *  4. Watch status === AAState.EXECUTED to know when to execute
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createAAFSM,
  AAState,
  AAEvent,
  type AAFSM,
  type AAContext
} from '../../action-authority/src/action-authority/fsm';

// Re-export for consumers of the hook
export { AAState, AAEvent };

// Configuration: The Dead Man's Switch Threshold
const HOLD_THRESHOLD_MS = 400;

/**
 * Public Interface: What the Citizen receives from the Law
 */
export interface ActionAuthorityHook {
  // Current verified state of the system
  status: AAState;

  // Visual feedback: progress of hold gesture (0.0 to 1.0)
  // Use for drawing progress bar, opacity, etc.
  holdProgress: number;

  // The Law: Interface methods the Citizen must use
  actions: {
    arm: () => void;      // Call on gesture start (MouseDown, KeyDown)
    release: () => void;  // Call on gesture end (MouseUp, KeyUp)
    confirm: () => void;  // Call on explicit confirm (Enter key)
    cancel: () => void;   // Call on cancel (Escape key)
  };

  // Audit metadata for the Citizen to pass downstream
  metadata: {
    contextId: string;
    sourceHash: string;
  };
}

/**
 * The Hook: Pure functional wrapper around FSM
 *
 * @param contextId - Session/context identifier
 * @param sourceHash - Source hash for audit binding
 * @param onStateChange - Optional callback when state changes
 */
export const useActionAuthority = (
  contextId: string,
  sourceHash: string,
  onStateChange?: (state: AAState) => void
): ActionAuthorityHook => {
  // ===== PERSISTENT STATE (Refs) =====

  // FSM instance persists across renders
  const fsmRef = useRef<AAFSM | null>(null);

  // Timer refs for the animation loop
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // ===== REACT STATE (Syncs with FSM for rendering) =====

  // Current FSM state
  const [status, setStatus] = useState<AAState>(AAState.GENERATED);

  // Progress of hold gesture (0.0 to 1.0) for visual feedback
  const [holdProgress, setHoldProgress] = useState(0);

  // ===== INITIALIZATION =====

  /**
   * Initialize FSM instance on mount or context change
   *
   * This runs once per unique (contextId, sourceHash) pair.
   * FSM is sealed/immutable once created.
   */
  useEffect(() => {
    console.log(`[useActionAuthority] Initializing FSM for context: ${contextId}`);

    const context: AAContext = {
      contextId,
      timestamp: Date.now(),
      sourceHash
    };

    fsmRef.current = createAAFSM(context);

    // Sync initial state
    const initialState = fsmRef.current.getState();
    setStatus(initialState);
    console.log(`[useActionAuthority] FSM created, initial state: ${initialState}`);

    // Cleanup on unmount
    return () => {
      console.log(`[useActionAuthority] Cleaning up FSM for context: ${contextId}`);

      // Cancel any pending animation
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // Reset refs
      holdStartRef.current = null;
    };
  }, [contextId, sourceHash]);

  // ===== INTERACTION HANDLERS (The Law) =====

  /**
   * ARM: User starts gesture (presses key or mouse button)
   *
   * This transitions FSM from VISIBLE_GHOST to HOLDING,
   * and starts the 400ms countdown animation.
   */
  const arm = useCallback(() => {
    const fsm = fsmRef.current;
    if (!fsm) {
      console.warn('[useActionAuthority] arm() called but FSM not initialized');
      return;
    }

    const currentState = fsm.getState();
    console.log(`[useActionAuthority] arm() called, current state: ${currentState}`);

    // Only proceed if in valid state
    if (currentState !== AAState.VISIBLE_GHOST) {
      console.log(`[useActionAuthority] arm() ignored - not in VISIBLE_GHOST state`);
      return;
    }

    try {
      // Transition FSM to HOLDING
      fsm.transition(AAEvent.HOLD_START);
      holdStartRef.current = Date.now();

      console.log('[useActionAuthority] FSM transitioned to HOLDING, starting 400ms countdown');

      // Start the animation loop (UI visual feedback only)
      // Logic is in FSM, animation is for rendering
      const animate = () => {
        const elapsed = Date.now() - (holdStartRef.current || 0);
        const progress = Math.min(elapsed / HOLD_THRESHOLD_MS, 1.0);

        setHoldProgress(progress);

        // Check if threshold crossed
        if (progress < 1.0) {
          // Still holding - request next frame
          rafRef.current = requestAnimationFrame(animate);
        } else {
          // Threshold crossed - tell FSM
          console.log('[useActionAuthority] 400ms threshold crossed, triggering HOLD_TIMEOUT');
          fsm.transition(AAEvent.HOLD_TIMEOUT);

          const newState = fsm.getState();
          setStatus(newState);
          onStateChange?.(newState);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    } catch (error) {
      console.error('[useActionAuthority] arm() FSM transition failed:', error);
    }
  }, [onStateChange]);

  /**
   * RELEASE: User stops gesture (releases key or mouse button)
   *
   * This cancels the animation and tells FSM to transition
   * based on whether threshold was crossed.
   */
  const release = useCallback(() => {
    const fsm = fsmRef.current;
    if (!fsm) return;

    const currentState = fsm.getState();
    console.log(`[useActionAuthority] release() called, current state: ${currentState}`);

    // Stop animation loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    holdStartRef.current = null;
    setHoldProgress(0);

    // Tell FSM the gesture ended
    try {
      fsm.transition(AAEvent.HOLD_END);

      const newState = fsm.getState();
      setStatus(newState);
      onStateChange?.(newState);

      console.log(`[useActionAuthority] FSM transitioned on HOLD_END, new state: ${newState}`);
    } catch (error) {
      console.error('[useActionAuthority] release() FSM transition failed:', error);
    }
  }, [onStateChange]);

  /**
   * CONFIRM: User explicitly confirms action (presses Enter)
   *
   * This is only valid if FSM is in PREVIEW_ARMED state.
   * Transitions to EXECUTED, which signals the Citizen to proceed.
   */
  const confirm = useCallback(() => {
    const fsm = fsmRef.current;
    if (!fsm) return;

    const currentState = fsm.getState();
    console.log(`[useActionAuthority] confirm() called, current state: ${currentState}`);

    // Only allow confirm if we're armed
    if (currentState !== AAState.PREVIEW_ARMED) {
      console.warn(`[useActionAuthority] confirm() ignored - not in PREVIEW_ARMED state`);
      return;
    }

    try {
      fsm.transition(AAEvent.CONFIRM);

      const newState = fsm.getState();
      setStatus(newState);
      onStateChange?.(newState);

      console.log(`[useActionAuthority] FSM transitioned on CONFIRM, new state: ${newState}`);

      // If new state is EXECUTED, the Citizen should see this and proceed
      if (newState === AAState.EXECUTED) {
        console.log('[useActionAuthority] ✅ EXECUTED - Citizen may now execute action');
      }
    } catch (error) {
      console.error('[useActionAuthority] confirm() FSM transition failed:', error);
    }
  }, [onStateChange]);

  /**
   * CANCEL: User cancels action (presses Escape)
   *
   * Resets FSM to initial state and clears all visual feedback.
   */
  const cancel = useCallback(() => {
    const fsm = fsmRef.current;
    if (!fsm) return;

    const currentState = fsm.getState();
    console.log(`[useActionAuthority] cancel() called, current state: ${currentState}`);

    // Stop animation
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    holdStartRef.current = null;
    setHoldProgress(0);

    try {
      fsm.transition(AAEvent.REJECT);

      const newState = fsm.getState();
      setStatus(newState);
      onStateChange?.(newState);

      console.log(`[useActionAuthority] FSM transitioned on REJECT, new state: ${newState}`);
    } catch (error) {
      console.error('[useActionAuthority] cancel() FSM transition failed:', error);
    }
  }, [onStateChange]);

  // ===== RETURN PUBLIC INTERFACE =====

  const fsmContext = fsmRef.current?.getContext();

  return {
    status,
    holdProgress,
    actions: {
      arm,
      release,
      confirm,
      cancel
    },
    metadata: {
      contextId: fsmContext?.contextId || contextId,
      sourceHash: fsmContext?.sourceHash || sourceHash
    }
  };
};

export default useActionAuthority;
