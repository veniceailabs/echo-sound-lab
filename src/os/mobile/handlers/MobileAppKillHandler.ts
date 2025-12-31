/**
 * Mobile App Kill Handler — Tier 3 (MOB-PR-004)
 * Phase 7 Mobile Authority Death & Rebirth
 *
 * Rule: Session already revoked by MobileLifecycleWatcher.onKill() (Tier 1).
 * Handler confirms cleanup (no enforcement logic).
 *
 * Blocks: MOB-T04, MOB-T10, MOB-T12
 */

import MobileSessionContext from '../MobileSessionContext';
import MobileEnforceWrapper from '../MobileEnforceWrapper';
import { getAuditLogger } from '../../services/AuditLogger';

export class MobileAppKillHandler {
  private sessionCtx: MobileSessionContext;
  private wrapper: MobileEnforceWrapper;
  private audit = getAuditLogger();

  constructor(
    sessionCtx: MobileSessionContext,
    wrapper: MobileEnforceWrapper
  ) {
    this.sessionCtx = sessionCtx;
    this.wrapper = wrapper;
  }

  /**
   * Confirm app kill cleanup.
   *
   * NOTE: Session is already revoked by MobileLifecycleWatcher.onKill() (Tier 1).
   * This handler does NOT revoke (that's Tier 1's job).
   * This handler only confirms cleanup state.
   *
   * Rule: No logic, no conditions, no recovery attempts.
   * Rule: Session must be null when this is called.
   *
   * Blocks: MOB-T04, MOB-T10, MOB-T12
   */
  public onAppKilled(): void {
    // Session already revoked by Tier 1
    // Verify: session is null
    const currentSession = this.sessionCtx.get();

    if (currentSession !== null) {
      // This should never happen if Tier 1 worked correctly
      // But we catch it for debugging
      this.audit.emit('OS_KILL_HANDLER_WARNING', {
        reason: 'Session not null after Tier 1 kill',
        session: currentSession,
        timestamp: Date.now()
      });
    }

    // Emit confirmation
    this.audit.emit('MOBILE_APP_KILL_CONFIRMED', {
      sessionCleared: currentSession === null,
      foreground: this.sessionCtx.isInForeground(),
      timestamp: Date.now()
    });
  }
}

export default MobileAppKillHandler;
