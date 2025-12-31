/**
 * Mobile Enforcement Wrapper — Tier 2 Session Binding Enforcement
 * Phase 7 MOB-PR-003
 *
 * THIN ENTRY POINT ONLY — No state, no flags, no logic.
 *
 * Enforcement Order (ABSOLUTE):
 * 1. throwIfNotInForeground() — hard stop if background
 * 2. sessionCtx.assert(sessionId) — validate session binding
 * 3. Execute underlying logic
 *
 * Blocks: MOB-T01, MOB-T02, MOB-T05, MOB-T06, MOB-T07, MOB-T08, MOB-T09, MOB-T12
 */

import MobileSessionContext from './MobileSessionContext';
import MobileLifecycleWatcher from './MobileLifecycleWatcher';
import { getAuditLogger } from '../../services/AuditLogger';

export class MobileEnforceWrapper {
  private sessionCtx: MobileSessionContext;
  private watcher: MobileLifecycleWatcher;
  private audit = getAuditLogger();

  constructor(
    sessionCtx: MobileSessionContext,
    watcher: MobileLifecycleWatcher
  ) {
    this.sessionCtx = sessionCtx;
    this.watcher = watcher;
  }

  /**
   * Generic enforce wrapper for all gate operations.
   *
   * ENFORCEMENT ORDER (NON-NEGOTIABLE):
   * 1. Line 1: throwIfNotInForeground() — hard stop if background
   * 2. Line 2: sessionCtx.assert(sessionId) — validate session binding
   * 3. Line 3+: Execute the operation
   *
   * No implicit binding. No state changes. No decision logic.
   *
   * Blocks:
   * - MOB-T01: Auto-resume on foreground
   * - MOB-T02: Notification tap grant
   * - MOB-T05: Blur grants authority
   * - MOB-T06: Background app accessibility
   * - MOB-T07: Screen lock grants authority
   * - MOB-T08: Background service execution
   * - MOB-T09: Silent foreground bypass
   * - MOB-T12: Implicit authority after kill
   *
   * @param sessionId Required session identifier (no defaults, no implicit bind)
   * @param operation The operation to enforce (executes only if both guards pass)
   * @returns Result of operation or throws on guard violation
   */
  public async enforce<T>(
    sessionId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // ========================================================================
    // GUARD 1: FREEZE GATE (Foreground Check)
    // ========================================================================
    // Blocks: MOB-T01, MOB-T07, MOB-T08, MOB-T09
    // This MUST be the first executable line.
    // No conditions, no early returns before this.
    this.watcher.throwIfNotInForeground();

    // ========================================================================
    // GUARD 2: BIND GATE (Session Assertion)
    // ========================================================================
    // Blocks: MOB-T02, MOB-T05, MOB-T06, MOB-T09, MOB-T12
    // Validates that the sessionId matches the bound session.
    // Throws immediately on mismatch (no implicit bind, no recovery).
    this.sessionCtx.assert(sessionId);

    // ========================================================================
    // OPERATION EXECUTION
    // ========================================================================
    // Both guards passed. Execute the operation.
    // If we reach this line, both foreground AND session binding are valid.
    try {
      const result = await operation();
      this.audit.emit('MOBILE_ENFORCE_SUCCESS', {
        sessionId,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      this.audit.emit('MOBILE_ENFORCE_OPERATION_FAILED', {
        sessionId,
        error: String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Synchronous variant of enforce (for non-async operations).
   *
   * SAME enforcement order as async variant.
   * Use this for operations that don't need async/await.
   *
   * @param sessionId Required session identifier
   * @param operation Synchronous operation to enforce
   * @returns Result of operation or throws
   */
  public enforceSync<T>(
    sessionId: string,
    operation: () => T
  ): T {
    // GUARD 1: Freeze
    this.watcher.throwIfNotInForeground();

    // GUARD 2: Bind
    this.sessionCtx.assert(sessionId);

    // Operation
    try {
      const result = operation();
      this.audit.emit('MOBILE_ENFORCE_SUCCESS', {
        sessionId,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      this.audit.emit('MOBILE_ENFORCE_OPERATION_FAILED', {
        sessionId,
        error: String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Void enforce (for operations with no return value).
   *
   * SAME enforcement order.
   * Simpler signature for operations that don't return.
   *
   * @param sessionId Required session identifier
   * @param operation Void operation to enforce
   */
  public async enforceVoid(
    sessionId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    // GUARD 1: Freeze
    this.watcher.throwIfNotInForeground();

    // GUARD 2: Bind
    this.sessionCtx.assert(sessionId);

    // Operation
    try {
      await operation();
      this.audit.emit('MOBILE_ENFORCE_SUCCESS', {
        sessionId,
        timestamp: Date.now()
      });
    } catch (error) {
      this.audit.emit('MOBILE_ENFORCE_OPERATION_FAILED', {
        sessionId,
        error: String(error),
        timestamp: Date.now()
      });
      throw error;
    }
  }
}

export default MobileEnforceWrapper;
