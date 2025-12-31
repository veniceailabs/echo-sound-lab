/**
 * Action Authority: Finite State Machine Core
 *
 * The only execution path:
 * GENERATED → VISIBLE_GHOST → PREVIEW_ARMED → CONFIRM_READY → EXECUTED
 *
 * Forbidden transitions are hard-blocked.
 * Context binding is immutable.
 * One confirmation = one action.
 */

export enum AAState {
  GENERATED = "GENERATED",
  VISIBLE_GHOST = "VISIBLE_GHOST",
  PREVIEW_ARMED = "PREVIEW_ARMED",
  CONFIRM_READY = "CONFIRM_READY",
  EXECUTED = "EXECUTED",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED",
}

export enum AAEvent {
  SHOW = "SHOW",
  HOLD_START = "HOLD_START",
  HOLD_END = "HOLD_END",
  HOLD_TIMEOUT = "HOLD_TIMEOUT",
  CONFIRM = "CONFIRM",
  CONTEXT_INVALID = "CONTEXT_INVALID",
  EXPIRE = "EXPIRE",
  REJECT = "REJECT",
}

/**
 * Context Binding: Action is bound to a specific state at a moment in time.
 * If context changes (file switches, session closes), action expires.
 */
export interface AAContext {
  contextId: string; // file ID, session ID, etc.
  timestamp: number; // when action was generated
  sourceHash: string; // immutable snapshot of source state
}

/**
 * Action Authority FSM Instance
 */
export class AAFSM {
  private state: AAState = AAState.GENERATED;
  private context: AAContext;
  private holdStartTime: number | null = null;
  private transitionLog: Array<{ event: AAEvent; from: AAState; to: AAState; timestamp: number }> = [];

  constructor(context: AAContext) {
    this.context = context;
  }

  /**
   * Transition: Apply an event to the FSM.
   * Throws on forbidden transitions or context violations.
   */
  public transition(event: AAEvent, currentContextId?: string): void {
    const prevState = this.state;

    // Rule: EXPIRED and REJECTED are terminal states
    if (this.state === AAState.EXPIRED || this.state === AAState.REJECTED) {
      throw new Error(`Cannot transition from terminal state ${this.state}`);
    }

    // Rule: Context invalidation forces EXPIRED
    if (event === AAEvent.CONTEXT_INVALID || (currentContextId && currentContextId !== this.context.contextId)) {
      this.state = AAState.EXPIRED;
      this.logTransition(event, prevState, this.state);
      throw new Error(`Context invalidated. Action expired. Expected context: ${this.context.contextId}`);
    }

    const nextState = this.getNextState(event);
    if (!nextState) {
      throw new Error(
        `Forbidden transition: ${this.state} --${event}--> UNDEFINED. No legal path exists.`,
      );
    }

    this.state = nextState;
    this.logTransition(event, prevState, nextState);
  }

  /**
   * Legal Transition Matrix
   *
   * From GENERATED:
   *   - SHOW → VISIBLE_GHOST (user can see the preview)
   *
   * From VISIBLE_GHOST:
   *   - HOLD_START → stays in VISIBLE_GHOST (starts timing)
   *   - EXPIRE → EXPIRED
   *   - REJECT → REJECTED
   *
   * From VISIBLE_GHOST (when holding):
   *   - HOLD_TIMEOUT (≥400ms elapsed) → PREVIEW_ARMED
   *   - HOLD_END (before timeout) → stays in VISIBLE_GHOST
   *   - EXPIRE → EXPIRED
   *
   * From PREVIEW_ARMED:
   *   - CONFIRM → CONFIRM_READY (user pressed confirm button)
   *   - HOLD_END → reverts to VISIBLE_GHOST
   *   - EXPIRE → EXPIRED
   *
   * From CONFIRM_READY:
   *   - CONFIRM → EXECUTED (atomic: confirmation confirmed)
   *   - CONTEXT_INVALID → EXPIRED (file switched, etc.)
   *   - EXPIRE → EXPIRED
   *
   * FORBIDDEN:
   *   - GENERATED → EXECUTED (no user involvement)
   *   - VISIBLE_GHOST → EXECUTED (no arming)
   *   - CONFIRM_READY → EXECUTED (without CONFIRM event after)
   *   - Any → GENERATED (no reset, no restart)
   */
  private getNextState(event: AAEvent): AAState | null {
    const transitions: Record<AAState, Record<AAEvent, AAState | null>> = {
      [AAState.GENERATED]: {
        [AAEvent.SHOW]: AAState.VISIBLE_GHOST,
        [AAEvent.HOLD_START]: null,
        [AAEvent.HOLD_END]: null,
        [AAEvent.HOLD_TIMEOUT]: null,
        [AAEvent.CONFIRM]: null,
        [AAEvent.CONTEXT_INVALID]: AAState.EXPIRED,
        [AAEvent.EXPIRE]: AAState.EXPIRED,
        [AAEvent.REJECT]: AAState.REJECTED,
      },
      [AAState.VISIBLE_GHOST]: {
        [AAEvent.SHOW]: AAState.VISIBLE_GHOST, // Idempotent: already visible
        [AAEvent.HOLD_START]: AAState.VISIBLE_GHOST, // Start timing, stay in VISIBLE_GHOST
        [AAEvent.HOLD_END]: AAState.VISIBLE_GHOST, // Released before threshold
        [AAEvent.HOLD_TIMEOUT]: AAState.PREVIEW_ARMED, // ≥400ms reached
        [AAEvent.CONFIRM]: null, // Can't confirm without arming first
        [AAEvent.CONTEXT_INVALID]: AAState.EXPIRED,
        [AAEvent.EXPIRE]: AAState.EXPIRED,
        [AAEvent.REJECT]: AAState.REJECTED,
      },
      [AAState.PREVIEW_ARMED]: {
        [AAEvent.SHOW]: AAState.PREVIEW_ARMED, // Already armed
        [AAEvent.HOLD_START]: AAState.PREVIEW_ARMED, // Already timing
        [AAEvent.HOLD_END]: AAState.VISIBLE_GHOST, // User released before confirming
        [AAEvent.HOLD_TIMEOUT]: AAState.PREVIEW_ARMED, // Already armed
        [AAEvent.CONFIRM]: AAState.CONFIRM_READY, // User pressed confirm button
        [AAEvent.CONTEXT_INVALID]: AAState.EXPIRED,
        [AAEvent.EXPIRE]: AAState.EXPIRED,
        [AAEvent.REJECT]: AAState.REJECTED,
      },
      [AAState.CONFIRM_READY]: {
        [AAEvent.SHOW]: AAState.CONFIRM_READY, // Already in confirm state
        [AAEvent.HOLD_START]: AAState.CONFIRM_READY, // Still holding
        [AAEvent.HOLD_END]: AAState.VISIBLE_GHOST, // User released during confirm
        [AAEvent.HOLD_TIMEOUT]: AAState.CONFIRM_READY, // Already ready
        [AAEvent.CONFIRM]: AAState.EXECUTED, // Atomic: CONFIRMED → EXECUTED
        [AAEvent.CONTEXT_INVALID]: AAState.EXPIRED,
        [AAEvent.EXPIRE]: AAState.EXPIRED,
        [AAEvent.REJECT]: AAState.REJECTED,
      },
      [AAState.EXECUTED]: {
        // Terminal state: no transitions allowed
        [AAEvent.SHOW]: null,
        [AAEvent.HOLD_START]: null,
        [AAEvent.HOLD_END]: null,
        [AAEvent.HOLD_TIMEOUT]: null,
        [AAEvent.CONFIRM]: null,
        [AAEvent.CONTEXT_INVALID]: null,
        [AAEvent.EXPIRE]: null,
        [AAEvent.REJECT]: null,
      },
      [AAState.EXPIRED]: {
        // Terminal state: no transitions allowed
        [AAEvent.SHOW]: null,
        [AAEvent.HOLD_START]: null,
        [AAEvent.HOLD_END]: null,
        [AAEvent.HOLD_TIMEOUT]: null,
        [AAEvent.CONFIRM]: null,
        [AAEvent.CONTEXT_INVALID]: null,
        [AAEvent.EXPIRE]: null,
        [AAEvent.REJECT]: null,
      },
      [AAState.REJECTED]: {
        // Terminal state: no transitions allowed
        [AAEvent.SHOW]: null,
        [AAEvent.HOLD_START]: null,
        [AAEvent.HOLD_END]: null,
        [AAEvent.HOLD_TIMEOUT]: null,
        [AAEvent.CONFIRM]: null,
        [AAEvent.CONTEXT_INVALID]: null,
        [AAEvent.EXPIRE]: null,
        [AAEvent.REJECT]: null,
      },
    };

    return transitions[this.state][event] ?? null;
  }

  /**
   * Hold Timer Management
   *
   * Returns true if HOLD_TIMEOUT should be triggered (≥400ms elapsed).
   */
  public startHold(): void {
    if (this.state !== AAState.VISIBLE_GHOST && this.state !== AAState.PREVIEW_ARMED) {
      throw new Error(`Cannot start hold from ${this.state}`);
    }
    this.holdStartTime = Date.now();
    this.transition(AAEvent.HOLD_START);
  }

  public endHold(): boolean {
    if (this.holdStartTime === null) {
      return false;
    }

    const elapsed = Date.now() - this.holdStartTime;
    this.holdStartTime = null;

    const thresholdMet = elapsed >= 400;
    if (thresholdMet && this.state === AAState.VISIBLE_GHOST) {
      this.transition(AAEvent.HOLD_TIMEOUT);
    } else {
      this.transition(AAEvent.HOLD_END);
    }

    return thresholdMet;
  }

  /**
   * Getters
   */
  public getState(): AAState {
    return this.state;
  }

  public getContext(): AAContext {
    return this.context;
  }

  public getTransitionLog(): Array<{ event: AAEvent; from: AAState; to: AAState; timestamp: number }> {
    return [...this.transitionLog];
  }

  /**
   * Utilities
   */
  public isExecuted(): boolean {
    return this.state === AAState.EXECUTED;
  }

  public isTerminal(): boolean {
    return [AAState.EXECUTED, AAState.EXPIRED, AAState.REJECTED].includes(this.state);
  }

  public isArmed(): boolean {
    return this.state === AAState.PREVIEW_ARMED || this.state === AAState.CONFIRM_READY;
  }

  private logTransition(event: AAEvent, from: AAState, to: AAState): void {
    this.transitionLog.push({
      event,
      from,
      to,
      timestamp: Date.now(),
    });
  }
}

/**
 * FSM Factory: Create a new FSM instance for an action.
 */
export function createAAFSM(context: AAContext): AAFSM {
  return new AAFSM(context);
}
