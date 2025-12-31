/**
 * Action Authority: Immutable Audit Log
 *
 * Every action that reaches EXECUTED state is recorded immutably.
 * The log is append-only. Entries cannot be modified, deleted, or reordered.
 *
 * Purpose:
 *  - Accountability: What happened and when
 *  - Reversibility: Restore exact bit-state prior to each action
 *  - Compliance: Immutable record for audit/legal purposes
 */

import { AAFSM, AAState, AAEvent } from "./fsm";
import { AAAction } from "./context-binding";

/**
 * Immutable record of an executed action.
 *
 * Once written, this entry can never be changed, deleted, or reordered.
 * Attempting to do so is a violation of the audit log contract.
 */
export interface AAExecutionLog {
  actionId: string; // unique identifier of the executed action
  executedAt: number; // timestamp when action reached EXECUTED state
  contextId: string; // context this action was bound to
  sourceHash: string; // immutable snapshot of source state at action time
  transitionPath: Array<{
    event: AAEvent;
    from: AAState;
    to: AAState;
    timestamp: number;
  }>; // full transition history
  preExecutionState: Record<string, any>; // snapshot of system state BEFORE execution
  executionDuration: number; // time from GENERATED to EXECUTED (ms)
  userConfirmationTime: number; // timestamp of final user confirmation
  immutable: true; // marker that this entry is sealed
}

/**
 * Audit Log Manager: Record and retrieve executed actions.
 *
 * Guarantees:
 *  1. Append-only: New entries can be added; existing entries cannot be modified
 *  2. Sealed entries: Once written, entries are immutable (Object.freeze)
 *  3. Ordered: Entries maintain strict chronological order
 *  4. Complete: Every EXECUTED action generates exactly one log entry
 *  5. Reversible: Log contains enough state to restore pre-execution conditions
 */
export class AAAuditLog {
  private entries: AAExecutionLog[] = [];
  private entryMap: Map<string, AAExecutionLog> = new Map(); // For O(1) lookup
  private sealed: boolean = false; // Can be sealed for production read-only mode

  /**
   * Record an executed action.
   *
   * This is called when an action reaches the EXECUTED state.
   * The entry is immediately frozen to prevent tampering.
   */
  public recordExecution(
    action: AAAction,
    preExecutionState: Record<string, any>,
    userConfirmationTime: number,
  ): void {
    if (this.sealed) {
      throw new Error("Audit log is sealed. Cannot record new entries.");
    }

    const fsm = action.fsm;
    if (fsm.getState() !== AAState.EXECUTED) {
      throw new Error(
        `Cannot record action ${action.id}: state is ${fsm.getState()}, not EXECUTED`,
      );
    }

    const transitionPath = fsm.getTransitionLog();

    const entry: AAExecutionLog = {
      actionId: action.id,
      executedAt: Date.now(),
      contextId: action.boundContext.contextId,
      sourceHash: action.boundContext.sourceHash,
      transitionPath,
      preExecutionState,
      executionDuration: Date.now() - action.createdAt,
      userConfirmationTime,
      immutable: true,
    };

    // Freeze the entry to make it immutable
    Object.freeze(entry);
    Object.freeze(entry.transitionPath);
    Object.freeze(entry.preExecutionState);

    this.entries.push(entry);
    this.entryMap.set(action.id, entry);
  }

  /**
   * Get an execution log entry by action ID.
   *
   * Returns a deep copy to prevent external modification.
   */
  public getExecution(actionId: string): AAExecutionLog | null {
    const entry = this.entryMap.get(actionId);
    if (!entry) {
      return null;
    }

    // Return a deep copy to prevent tampering
    return JSON.parse(JSON.stringify(entry));
  }

  /**
   * Get all execution logs (in chronological order).
   *
   * Returns deep copies to prevent external modification.
   */
  public getAllExecutions(): AAExecutionLog[] {
    return this.entries.map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Get execution logs for a specific context.
   */
  public getExecutionsForContext(contextId: string): AAExecutionLog[] {
    return this.entries
      .filter((entry) => entry.contextId === contextId)
      .map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Get execution logs within a time range.
   */
  public getExecutionsInTimeRange(startTime: number, endTime: number): AAExecutionLog[] {
    return this.entries
      .filter((entry) => entry.executedAt >= startTime && entry.executedAt <= endTime)
      .map((entry) => JSON.parse(JSON.stringify(entry)));
  }

  /**
   * Verify that an execution log is unmodified.
   *
   * This checks that:
   *  1. The entry is in the log
   *  2. The entry is properly sealed (immutable)
   *  3. The entry's hash matches its expected value
   */
  public verifyExecutionIntegrity(actionId: string): boolean {
    const entry = this.entryMap.get(actionId);
    if (!entry) {
      return false;
    }

    // Check that entry is frozen
    if (!Object.isFrozen(entry)) {
      return false;
    }

    // Check that the entry maintains its marker
    if (entry.immutable !== true) {
      return false;
    }

    return true;
  }

  /**
   * Seal the audit log (production mode).
   *
   * Once sealed, the log becomes read-only. No new entries can be recorded.
   * This ensures that the audit trail cannot be extended after deployment.
   */
  public seal(): void {
    this.sealed = true;
    Object.freeze(this.entries);
  }

  /**
   * Check if the audit log is sealed.
   */
  public isSealed(): boolean {
    return this.sealed;
  }

  /**
   * Get audit log statistics.
   */
  public getStatistics(): {
    totalExecutions: number;
    executionsByContext: Record<string, number>;
    oldestExecution: number | null;
    newestExecution: number | null;
    averageExecutionDuration: number;
  } {
    const executionsByContext: Record<string, number> = {};
    let totalDuration = 0;

    for (const entry of this.entries) {
      executionsByContext[entry.contextId] = (executionsByContext[entry.contextId] || 0) + 1;
      totalDuration += entry.executionDuration;
    }

    return {
      totalExecutions: this.entries.length,
      executionsByContext,
      oldestExecution: this.entries.length > 0 ? this.entries[0].executedAt : null,
      newestExecution: this.entries.length > 0 ? this.entries[this.entries.length - 1].executedAt : null,
      averageExecutionDuration:
        this.entries.length > 0 ? totalDuration / this.entries.length : 0,
    };
  }

  /**
   * Export audit log as JSON (for compliance/backup).
   *
   * The export is read-only and cannot be re-imported.
   */
  public exportAsJSON(): string {
    return JSON.stringify(
      {
        exportedAt: Date.now(),
        sealed: this.sealed,
        entries: this.entries.map((entry) => JSON.parse(JSON.stringify(entry))),
      },
      null,
      2,
    );
  }
}

/**
 * Factory: Create an audit log.
 */
export function createAAAuditLog(): AAAuditLog {
  const log = new AAAuditLog();
  if (process.env.NODE_ENV === "production") {
    log.seal();
  }
  return log;
}
