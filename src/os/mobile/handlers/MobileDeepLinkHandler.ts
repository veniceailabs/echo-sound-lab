/**
 * Mobile Deep-Link Handler — Tier 3 (MOB-PR-004)
 * Phase 7 Mobile Authority Death & Rebirth
 *
 * Rule: Deep-link entry = visual foreground only.
 * Rule: No session binding. No recovery. No authority grant.
 * Rule: Old sessionId must hard-fail on next assert().
 *
 * Blocks: MOB-T03, MOB-T02, MOB-T12
 */

import MobileSessionContext from '../MobileSessionContext';
import MobileEnforceWrapper from '../MobileEnforceWrapper';
import { getAuditLogger } from '../../services/AuditLogger';

export class MobileDeepLinkHandler {
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
   * Handle deep-link entry.
   *
   * Deep-link brings app to foreground (visual).
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
   * Blocks: MOB-T03, MOB-T02, MOB-T12
   */
  public onDeepLinkEntry(): void {
    // FIRST LINE: Visual foreground only
    this.sessionCtx.setForeground(true);

    // SECOND LINE: Audit emission
    this.audit.emit('MOBILE_DEEP_LINK_ENTRY', {
      foreground: true,
      session: this.sessionCtx.get(),  // Current session (probably null)
      timestamp: Date.now()
    });

    // No bind(). No recovery. No logic. Handler complete.
  }
}

export default MobileDeepLinkHandler;
