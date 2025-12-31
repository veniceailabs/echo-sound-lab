/**
 * Action Authority: Context Binding Layer
 *
 * Prevents "time-travel" attacks by tethering actions to their creation state.
 * If the underlying context changes (file switches, session closes), the action expires.
 *
 * Context is immutable once bound. No action can execute against stale state.
 */

import { AAFSM, AAState, AAContext, AAEvent, createAAFSM } from "./fsm";

/**
 * Represents the current operational context of the system.
 *
 * This changes when:
 *  - User switches to a different file
 *  - Session is closed or reset
 *  - Source audio is changed
 *
 * Actions generated in one context cannot execute in a different context.
 */
export interface AAOperationalContext {
  contextId: string; // unique identifier (file ID, session ID, etc.)
  sourceHash: string; // immutable hash of the source state at creation time
  timestamp: number; // when this context became active
}

/**
 * An "action" in Action Authority.
 *
 * Actions are immutable once created. They carry their context binding.
 * If the operational context changes, the action expires.
 */
export interface AAAction {
  id: string; // unique action identifier
  fsm: AAFSM; // finite state machine managing this action's lifecycle
  boundContext: AAContext; // context this action is bound to
  createdAt: number; // timestamp when action was generated
}

/**
 * Context Binding Manager: Create and track actions.
 *
 * Ensures that:
 *  1. Every action is bound to the current context at creation time
 *  2. Actions cannot execute if their bound context is no longer current
 *  3. Context changes are detected and cause action expiration
 */
export class AAContextBinding {
  private currentContext: AAOperationalContext;
  private actions: Map<string, AAAction> = new Map();
  private actionIdCounter: number = 0;

  constructor(initialContext: AAOperationalContext) {
    this.currentContext = initialContext;
  }

  /**
   * Create a new action bound to the current context.
   *
   * The action is created with an FSM that tracks its lifecycle.
   * If the context changes before the action is executed, the FSM transitions to EXPIRED.
   */
  public createAction(): AAAction {
    const actionId = `AA_${this.currentContext.contextId}_${++this.actionIdCounter}`;
    const boundContext: AAContext = {
      contextId: this.currentContext.contextId,
      timestamp: Date.now(),
      sourceHash: this.currentContext.sourceHash,
    };

    const fsm = createAAFSM(boundContext);
    const action: AAAction = {
      id: actionId,
      fsm,
      boundContext,
      createdAt: Date.now(),
    };

    this.actions.set(actionId, action);
    return action;
  }

  /**
   * Check if an action is still valid in the current context.
   *
   * An action is invalid if:
   *  - Its bound context ID does not match the current context ID
   *  - Its source hash differs from the current context hash
   *  - The action is already in a terminal state
   */
  public isActionValid(action: AAAction): boolean {
    // Terminal states are always "valid" (they've reached their end state)
    if (action.fsm.isTerminal()) {
      return true;
    }

    // Non-terminal actions must match the current context
    const contextMatch = action.boundContext.contextId === this.currentContext.contextId;
    const hashMatch = action.boundContext.sourceHash === this.currentContext.sourceHash;

    return contextMatch && hashMatch;
  }

  /**
   * Validate an action's context before execution.
   *
   * If the action's context is no longer valid, it is forcibly expired.
   * Throws an error with details about the context mismatch.
   */
  public validateActionContext(action: AAAction): void {
    if (action.fsm.isTerminal()) {
      // Terminal actions don't need validation
      return;
    }

    if (!this.isActionValid(action)) {
      // Context is invalid: force the FSM to EXPIRED
      try {
        action.fsm.transition(AAEvent.CONTEXT_INVALID);
      } catch (e) {
        // Expected: FSM will throw on context mismatch
      }

      throw new Error(
        `Action ${action.id} context is stale. ` +
          `Bound to: ${action.boundContext.contextId} (hash: ${action.boundContext.sourceHash}), ` +
          `Current: ${this.currentContext.contextId} (hash: ${this.currentContext.sourceHash}). ` +
          `Action has expired.`,
      );
    }
  }

  /**
   * Switch the operational context.
   *
   * This invalidates all non-terminal actions. Any attempt to transition them will fail.
   * Used when: file switches, session closes, source audio changes, etc.
   */
  public switchContext(newContext: AAOperationalContext): void {
    if (newContext.contextId === this.currentContext.contextId &&
        newContext.sourceHash === this.currentContext.sourceHash) {
      // No change
      return;
    }

    const oldContext = this.currentContext;
    this.currentContext = newContext;

    // Notify all non-terminal actions that context has changed
    for (const [, action] of this.actions) {
      if (!action.fsm.isTerminal() && action.boundContext.contextId !== newContext.contextId) {
        // Mark as invalid (FSM will handle this on next transition attempt)
        // No need to force transition; the next call to validateActionContext will expire it
      }
    }
  }

  /**
   * Get the current operational context.
   */
  public getCurrentContext(): AAOperationalContext {
    return { ...this.currentContext };
  }

  /**
   * Get an action by ID.
   */
  public getAction(actionId: string): AAAction | null {
    return this.actions.get(actionId) ?? null;
  }

  /**
   * Get all actions (for debugging/audit).
   */
  public getAllActions(): AAAction[] {
    return Array.from(this.actions.values());
  }

  /**
   * Clean up terminal actions (optional, for memory management).
   */
  public purgeTerminalActions(): void {
    for (const [id, action] of this.actions) {
      if (action.fsm.isTerminal()) {
        this.actions.delete(id);
      }
    }
  }

  /**
   * Get statistics on action states (for debugging/audit).
   */
  public getActionStatistics(): Record<AAState, number> {
    const stats: Record<string, number> = {
      GENERATED: 0,
      VISIBLE_GHOST: 0,
      PREVIEW_ARMED: 0,
      CONFIRM_READY: 0,
      EXECUTED: 0,
      EXPIRED: 0,
      REJECTED: 0,
    };

    for (const [, action] of this.actions) {
      const state = action.fsm.getState();
      stats[state] = (stats[state] || 0) + 1;
    }

    return stats;
  }
}

/**
 * Factory: Create a context binding manager.
 */
export function createAAContextBinding(initialContext: AAOperationalContext): AAContextBinding {
  return new AAContextBinding(initialContext);
}
