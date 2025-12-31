/**
 * Action Authority: useActionAuthority React Hook
 *
 * This is the ONLY interface between the UI and the Action Authority FSM.
 *
 * Non-negotiables:
 *  1. UI MUST NOT call FSM transitions directly
 *  2. Hook emits events → FSM decides state
 *  3. FSM state is the single source of truth for rendering
 *  4. No confidence, no shortcuts, no execution logic in UI
 *  5. One confirmation → one execution (unchanged)
 *
 * The hook is incapable of violating FSM invariants.
 * If the UI tries to break the rules, the FSM refuses.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AAFSM, AAState, AAEvent, AAContext, createAAFSM } from "../fsm";
import { AAOperationalContext } from "../context-binding";

/**
 * Read-only ghost data (preview overlay).
 *
 * This is application-level data, not FSM state.
 * The ghost is what the UI displays as a preview before execution.
 */
export interface AAGhost {
  id: string; // unique action ID
  type: string; // action type (e.g., "brighten", "reduce_noise")
  description: string; // human-readable description
  parameters?: Record<string, any>; // action parameters (immutable)
  confidence?: number; // informational only (NOT used for execution)
}

/**
 * Hook return type: What the UI can do
 */
export interface UseActionAuthorityReturn {
  // Read-only state (single source of truth)
  state: AAState; // Current FSM state
  ghost: AAGhost | null; // Current preview overlay (null if not showing)
  isArmed: boolean; // Convenience: PREVIEW_ARMED or CONFIRM_READY
  isExecuted: boolean; // Convenience: EXECUTED
  isExpired: boolean; // Convenience: EXPIRED or context invalid
  isTerminal: boolean; // Convenience: action is done (EXECUTED, EXPIRED, or REJECTED)

  // Event emitters (only safe transitions)
  show: (ghost: AAGhost) => void; // Make action visible (GENERATED → VISIBLE_GHOST)
  arm: () => void; // Start hold timer (begins arming process)
  release: () => boolean; // Release hold; returns true if threshold was met
  confirm: () => void; // Confirm action (PREVIEW_ARMED → CONFIRM_READY → EXECUTED)
  cancel: () => void; // Reject action (any state → REJECTED)

  // Debug utilities (read-only)
  debug: {
    fsmState: AAState;
    holdProgress: number; // 0.0 to 1.0, how close to 400ms
    transitionCount: number; // number of transitions so far
  };
}

/**
 * useActionAuthority: The bridge between UI and FSM
 *
 * Usage:
 *  const { state, arm, release, confirm, cancel, ghost } = useActionAuthority(context);
 *
 * The hook manages:
 *  1. FSM lifecycle (create, transition, update state)
 *  2. Hold timer (400ms threshold for reflex protection)
 *  3. Context validation (action expires if context changes)
 *  4. State synchronization (UI always reflects FSM state)
 *
 * The UI can ONLY:
 *  - Emit events (arm, release, confirm, cancel)
 *  - Read state
 *  - Display ghost
 *
 * The UI can NEVER:
 *  - Call FSM directly
 *  - Bypass the hold timer
 *  - Skip confirmation
 *  - Use confidence for decisions
 *  - Execute without explicit user action
 */
export function useActionAuthority(context: AAOperationalContext): UseActionAuthorityReturn {
  // FSM instance (never exposed, never mutable from outside)
  const fsmRef = useRef<AAFSM | null>(null);

  // React state synchronized with FSM
  const [state, setState] = useState<AAState>(AAState.GENERATED);
  const [ghost, setGhost] = useState<AAGhost | null>(null);

  // Hold timer management (for 400ms threshold)
  const holdTimerRef = useRef<{
    startTime: number | null;
    rafId: number | null;
  }>({
    startTime: null,
    rafId: null,
  });

  const [holdProgress, setHoldProgress] = useState(0); // 0.0 to 1.0

  const expireIfContextMismatch = useCallback(() => {
    if (!fsmRef.current) return true;

    const boundContext = fsmRef.current.getContext();
    if (
      boundContext.contextId !== context.contextId ||
      boundContext.sourceHash !== context.sourceHash ||
      boundContext.timestamp !== context.timestamp
    ) {
      try {
        fsmRef.current.transition(AAEvent.CONTEXT_INVALID, context.contextId);
      } catch (error) {
        // Expected: transition throws on context invalidation
      }

      setState(fsmRef.current.getState());
      setGhost(null);
      setHoldProgress(0);
      return true;
    }

    return false;
  }, [context.contextId, context.sourceHash, context.timestamp]);

  /**
   * Initialize FSM on mount or context change
   */
  useEffect(() => {
    if (fsmRef.current && !fsmRef.current.isTerminal()) {
      try {
        fsmRef.current.transition(AAEvent.CONTEXT_INVALID, context.contextId);
      } catch (error) {
        // Expected: transition throws on context invalidation
      }
    }

    // Create new FSM bound to this context
    const boundContext: AAContext = {
      contextId: context.contextId,
      timestamp: context.timestamp,
      sourceHash: context.sourceHash,
    };

    const newFsm = createAAFSM(boundContext);
    fsmRef.current = newFsm;

    // Initialize state
    setState(newFsm.getState());
    setGhost(null);
    setHoldProgress(0);

    // Cleanup: Reset on context change
    return () => {
      if (holdTimerRef.current.rafId !== null) {
        cancelAnimationFrame(holdTimerRef.current.rafId);
      }
      holdTimerRef.current.startTime = null;
    };
  }, [context.contextId, context.sourceHash, context.timestamp]);

  /**
   * Event: Show the ghost (make action visible)
   *
   * Transitions: GENERATED → VISIBLE_GHOST
   * The UI can show the ghost without the user doing anything.
   */
  const show = useCallback(
    (newGhost: AAGhost) => {
      if (!fsmRef.current) return;
      if (expireIfContextMismatch()) return;

      try {
        // Attempt FSM transition
        fsmRef.current.transition(AAEvent.SHOW, context.contextId);

        // If transition succeeded, update UI
        setState(fsmRef.current.getState());
        setGhost(newGhost);
      } catch (error) {
        // Transition failed (illegal state)
        // FSM state unchanged, UI reflects this
        console.warn("Failed to show ghost:", error);
      }
    },
    [context.contextId, expireIfContextMismatch],
  );

  /**
   * Event: Arm the action (start hold timer)
   *
   * This does NOT immediately transition. It starts a timer.
   * If hold ≥400ms: VISIBLE_GHOST → PREVIEW_ARMED (on release)
   * If hold <400ms: stays in VISIBLE_GHOST (on release)
   */
  const arm = useCallback(() => {
    if (!fsmRef.current) return;
    if (expireIfContextMismatch()) return;

    try {
      // Start the hold
      fsmRef.current.startHold();
      setState(fsmRef.current.getState());

      // Begin hold timer for visual feedback
      holdTimerRef.current.startTime = Date.now();

      // Animate progress from 0 to 1 over 400ms
      const updateProgress = () => {
        if (holdTimerRef.current.startTime === null) return;

        const elapsed = Date.now() - holdTimerRef.current.startTime;
        const progress = Math.min(elapsed / 400, 1.0);
        setHoldProgress(progress);

        if (progress < 1.0) {
          holdTimerRef.current.rafId = requestAnimationFrame(updateProgress);
        }
      };

      holdTimerRef.current.rafId = requestAnimationFrame(updateProgress);
    } catch (error) {
      console.warn("Failed to arm:", error);
    }
  }, [expireIfContextMismatch]);

  /**
   * Event: Release the hold
   *
   * Returns: true if threshold (400ms) was met, false otherwise
   * If threshold met: VISIBLE_GHOST → PREVIEW_ARMED
   * If threshold not met: stays in VISIBLE_GHOST
   */
  const release = useCallback(() => {
    if (!fsmRef.current) return false;

    try {
      // Stop hold timer
      if (holdTimerRef.current.rafId !== null) {
        cancelAnimationFrame(holdTimerRef.current.rafId);
        holdTimerRef.current.rafId = null;
      }
      holdTimerRef.current.startTime = null;
      setHoldProgress(0);

      if (expireIfContextMismatch()) {
        return false;
      }

      // End hold in FSM (this triggers HOLD_END or HOLD_TIMEOUT)
      const thresholdMet = fsmRef.current.endHold();

      // Update state
      setState(fsmRef.current.getState());

      return thresholdMet;
    } catch (error) {
      console.warn("Failed to release:", error);
      return false;
    }
  }, [expireIfContextMismatch]);

  /**
   * Event: Confirm the action
   *
   * This is the nuclear button. Pressing this causes execution.
   * It can only succeed if the FSM is in PREVIEW_ARMED or CONFIRM_READY.
   *
   * Transitions:
   *  - PREVIEW_ARMED → CONFIRM_READY (first press)
   *  - CONFIRM_READY → EXECUTED (second press, atomic)
   */
  const confirm = useCallback(() => {
    if (!fsmRef.current) return;
    if (expireIfContextMismatch()) return;

    try {
      // Emit CONFIRM event
      fsmRef.current.transition(AAEvent.CONFIRM, context.contextId);

      // Update state
      setState(fsmRef.current.getState());

      // If we've reached EXECUTED, clear ghost
      if (fsmRef.current.getState() === AAState.EXECUTED) {
        setGhost(null);
      }
    } catch (error) {
      // Transition failed
      // This is expected if user tries to confirm without arming
      console.warn("Failed to confirm:", error);
    }
  }, [context.contextId, expireIfContextMismatch]);

  /**
   * Event: Cancel/Reject the action
   *
   * User explicitly rejects the action.
   * Transitions: any state → REJECTED
   */
  const cancel = useCallback(() => {
    if (!fsmRef.current) return;
    if (expireIfContextMismatch()) return;

    try {
      fsmRef.current.transition(AAEvent.REJECT, context.contextId);
      setState(fsmRef.current.getState());
      setGhost(null);
      setHoldProgress(0);
    } catch (error) {
      console.warn("Failed to cancel:", error);
    }
  }, [context.contextId, expireIfContextMismatch]);

  /**
   * Convenience helpers (read-only)
   */
  const isArmed = state === AAState.PREVIEW_ARMED || state === AAState.CONFIRM_READY;
  const isExecuted = state === AAState.EXECUTED;
  const isExpired = state === AAState.EXPIRED;
  const isTerminal =
    state === AAState.EXECUTED || state === AAState.EXPIRED || state === AAState.REJECTED;

  return {
    // State (read-only)
    state,
    ghost,
    isArmed,
    isExecuted,
    isExpired,
    isTerminal,

    // Events (the only way to interact)
    show,
    arm,
    release,
    confirm,
    cancel,

    // Debug (read-only)
    debug: {
      fsmState: state,
      holdProgress,
      transitionCount: fsmRef.current?.getTransitionLog().length || 0,
    },
  };
}
