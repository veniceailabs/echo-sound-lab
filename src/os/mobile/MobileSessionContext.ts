/**
 * Mobile Session Context (Phase 7 iOS + Android)
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
 * - setForeground() tracks lifecycle
 */

import { getAuditLogger } from '../../services/AuditLogger';

export class MobileSessionContext {
  private currentSessionId: string | null = null;
  private foreground: boolean = false;
  private audit = getAuditLogger();

  /**
   * Bind to a session
   * Sets currentSessionId. Fails if session already bound.
   */
  bind(sessionId: string): void {
    if (this.currentSessionId !== null) {
      this.audit.emit('MOBILE_SESSION_BIND_FAILED', {
        reason: 'SESSION_ALREADY_BOUND',
        existing: this.currentSessionId,
        attempted: sessionId,
        timestamp: Date.now()
      });
      throw new Error('[SESSION_ALREADY_BOUND] Cannot bind new session while one is active');
    }

    this.currentSessionId = sessionId;

    this.audit.emit('MOBILE_SESSION_BOUND', {
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
      this.audit.emit('MOBILE_SESSION_MISMATCH', {
        expected: sessionId,
        current: this.currentSessionId,
        timestamp: Date.now()
      });

      throw new Error(`[OS_PERMISSION_DENIED] Expected session ${sessionId}, current is ${this.currentSessionId}`);
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
   * Revoke a specific session
   * Clears currentSessionId if matched.
   *
   * Called on lifecycle events.
   */
  revoke(sessionId: string): void {
    if (this.currentSessionId === sessionId) {
      this.audit.emit('MOBILE_SESSION_REVOKED', {
        sessionId,
        reason: 'SESSION_END',
        timestamp: Date.now()
      });

      this.currentSessionId = null;
    }
  }

  /**
   * Revoke all authority
   * Total cleanup, no session ID check.
   *
   * Called on background, blur, lock, kill.
   */
  revokeAll(): void {
    const revokedSessionId = this.currentSessionId;
    this.currentSessionId = null;

    this.audit.emit('MOBILE_SESSION_REVOKED_ALL', {
      revokedSessionId,
      timestamp: Date.now()
    });
  }

  /**
   * Set foreground state
   * Tracks whether app is visible and active.
   */
  setForeground(isForeground: boolean): void {
    this.foreground = isForeground;

    this.audit.emit('MOBILE_FOREGROUND_STATE_CHANGED', {
      foreground: isForeground,
      timestamp: Date.now()
    });
  }

  /**
   * Check if app is in foreground
   * Returns true if app is visible and active.
   */
  isInForeground(): boolean {
    return this.foreground;
  }
}

export default MobileSessionContext;
