/**
 * SessionContext — Single source of truth for session binding (Phase 3C)
 *
 * Rules:
 * - Exactly one active session at a time
 * - Any session change triggers immediate hard stop + full revocation
 * - All gates must assert session equality before enforcement
 */

import { getAuditLogger } from '../../services/AuditLogger';

export class SessionContext {
  private activeSessionId: string | null = null;
  private audit = getAuditLogger();

  bind(sessionId: string): void {
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Session changed',
        oldSessionId: this.activeSessionId,
        newSessionId: sessionId
      });
      throw new Error('[OS_HARD_STOP] Session changed');
    }
    this.activeSessionId = sessionId;
  }

  assert(sessionId: string): void {
    if (!this.activeSessionId || this.activeSessionId !== sessionId) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        reason: 'Session mismatch or inactive',
        sessionId
      });
      throw new Error('[OS_PERMISSION_DENIED] Invalid or inactive session');
    }
  }

  revoke(): void {
    if (this.activeSessionId) {
      this.audit.emit('OS_SESSION_REVOKED', {
        sessionId: this.activeSessionId
      });
    }
    this.activeSessionId = null;
  }

  get(): string | null {
    return this.activeSessionId;
  }
}

export default SessionContext;
