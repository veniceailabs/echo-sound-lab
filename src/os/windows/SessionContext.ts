/**
 * Session Context (Phase 4 Windows)
 *
 * Single source of truth for session binding.
 * All gates share the same instance.
 *
 * Contract:
 * - One session active at a time
 * - bind() sets the current session
 * - assert() throws if mismatch
 * - revoke() clears if matched
 * - get() returns current sessionId
 */

import { getAuditLogger } from '../../services/AuditLogger';

export class SessionContext {
  private currentSessionId: string | null = null;
  private audit = getAuditLogger();

  /**
   * Bind to a session
   * Sets currentSessionId. Replaces previous if any.
   */
  bind(sessionId: string): void {
    if (this.currentSessionId && this.currentSessionId !== sessionId) {
      this.audit.emit('OS_SESSION_BINDING_CHANGED', {
        from: this.currentSessionId,
        to: sessionId,
        timestamp: Date.now()
      });
    }

    this.currentSessionId = sessionId;

    this.audit.emit('OS_SESSION_BOUND', {
      sessionId,
      timestamp: Date.now()
    });
  }

  /**
   * Assert current session matches expected
   * Throws if mismatch.
   *
   * Called at entry of every enforce method.
   */
  assert(sessionId: string): void {
    if (this.currentSessionId !== sessionId) {
      this.audit.emit('OS_SESSION_MISMATCH', {
        expected: sessionId,
        current: this.currentSessionId,
        timestamp: Date.now()
      });

      throw new Error(`[SESSION_MISMATCH] Expected session ${sessionId}, current is ${this.currentSessionId}`);
    }
  }

  /**
   * Get current session ID
   * Returns null if no session bound.
   */
  get(): string | null {
    return this.currentSessionId;
  }

  /**
   * Revoke a session
   * Clears currentSessionId if matched.
   *
   * Called on session end.
   */
  revoke(sessionId: string): void {
    if (this.currentSessionId === sessionId) {
      this.audit.emit('OS_SESSION_REVOKED', {
        sessionId,
        timestamp: Date.now()
      });

      this.currentSessionId = null;
    }
  }
}

export default SessionContext;
