/**
 * Mobile Notification Handler — Tier 3 (MOB-PR-004)
 * Phase 7 Mobile Authority Death & Rebirth
 *
 * Rule: Notification tap = visual foreground only.
 * Rule: No session binding. No recovery. No authority grant.
 * Rule: Old sessionId must hard-fail on next assert().
 *
 * Blocks: MOB-T02, MOB-T09, MOB-T12
 */

import MobileSessionContext from '../MobileSessionContext';
import MobileEnforceWrapper from '../MobileEnforceWrapper';
import { getAuditLogger } from '../../services/AuditLogger';

export class MobileNotificationHandler {
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
   * Handle notification tap.
   *
   * Notification tap brings app to foreground (visual).
   * Does NOT grant authority.
   * Does NOT restore previous session.
   * Does NOT auto-bind.
   *
   * Foreground ≠ Authority.
   *
   * Rule: No conditional logic. No recovery attempts. No caching.
   * Rule: First line: setForeground(true)
   * Rule: Second line: audit emission
   * Rule: No bind() call (ever)
   *
   * Blocks: MOB-T02, MOB-T09, MOB-T12
   */
  public onNotificationTap(): void {
    // FIRST LINE: Visual foreground only
    this.sessionCtx.setForeground(true);

    // SECOND LINE: Audit emission
    this.audit.emit('MOBILE_NOTIFICATION_ENTRY', {
      foreground: true,
      session: this.sessionCtx.get(),  // Current session (probably null)
      timestamp: Date.now()
    });

    // No bind(). No recovery. No logic. Handler complete.
  }
}

export default MobileNotificationHandler;
