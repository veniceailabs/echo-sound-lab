/**
 * Mobile Lifecycle Adapter — Tier 3 Entry Point Routing
 * Phase 7 Mobile Authority Death & Rebirth (MOB-PR-004)
 *
 * Pure delegation only. Routes all lifecycle events to appropriate handlers.
 * No logic, no conditions, no state access.
 *
 * Tiers:
 * - Tier 0: MobileSessionContext (state owner)
 * - Tier 1: MobileLifecycleWatcher (lifecycle enforcement)
 * - Tier 2: MobileEnforceWrapper (enforcement wrapper)
 * - Tier 3: This adapter (entry point routing)
 *
 * Blocks: MOB-T01 through MOB-T12 (all vectors)
 */

import MobileSessionContext from './MobileSessionContext';
import MobileLifecycleWatcher from './MobileLifecycleWatcher';
import MobileEnforceWrapper from './MobileEnforceWrapper';
import MobileAppKillHandler from './handlers/MobileAppKillHandler';
import MobileDeepLinkHandler from './handlers/MobileDeepLinkHandler';
import MobileNotificationHandler from './handlers/MobileNotificationHandler';

export class MobileLifecycleAdapter {
  private sessionCtx: MobileSessionContext;
  private watcher: MobileLifecycleWatcher;
  private wrapper: MobileEnforceWrapper;
  private killHandler: MobileAppKillHandler;
  private deepLinkHandler: MobileDeepLinkHandler;
  private notificationHandler: MobileNotificationHandler;

  /**
   * Constructor: All dependencies injected (no new instances created).
   *
   * Enforces single SessionContext instance across all layers.
   * All handlers use the same SessionContext, Watcher, and Wrapper.
   */
  constructor(
    sessionCtx: MobileSessionContext,
    watcher: MobileLifecycleWatcher,
    wrapper: MobileEnforceWrapper,
    killHandler: MobileAppKillHandler,
    deepLinkHandler: MobileDeepLinkHandler,
    notificationHandler: MobileNotificationHandler
  ) {
    this.sessionCtx = sessionCtx;
    this.watcher = watcher;
    this.wrapper = wrapper;
    this.killHandler = killHandler;
    this.deepLinkHandler = deepLinkHandler;
    this.notificationHandler = notificationHandler;
  }

  /**
   * Route app kill event.
   *
   * Order (STRICT):
   * 1. Tier 1: watcher.onKill() — Revoke all authority immediately
   * 2. Tier 3: killHandler.onAppKilled() — Confirm cleanup
   *
   * No logic between calls. No conditions. No recovery attempts.
   *
   * Blocks: MOB-T04, MOB-T10, MOB-T12
   */
  public onKill(): void {
    // Tier 1: Lifecycle revocation (immediate, total)
    this.watcher.onKill();

    // Tier 3: Kill handler confirmation (no logic)
    this.killHandler.onAppKilled();
  }

  /**
   * Route deep-link entry event.
   *
   * Handler: deepLinkHandler.onDeepLinkEntry()
   * - Sets foreground = true (visual only)
   * - Emits audit event
   * - No authority grant
   *
   * App logic (outside adapter) must explicitly:
   * - Parse the deep-link
   * - Bind a NEW sessionId
   * - No implicit authority restoration
   *
   * Blocks: MOB-T03, MOB-T02, MOB-T12
   */
  public onDeepLinkEntry(): void {
    // Tier 3: Deep-link entry (visual foreground only)
    this.deepLinkHandler.onDeepLinkEntry();
  }

  /**
   * Route notification tap event.
   *
   * Handler: notificationHandler.onNotificationTap()
   * - Sets foreground = true (visual only)
   * - Emits audit event
   * - No authority grant
   *
   * App logic (outside adapter) must explicitly:
   * - Parse the notification action
   * - Bind a NEW sessionId
   * - No implicit authority restoration
   *
   * Blocks: MOB-T02, MOB-T09, MOB-T12
   */
  public onNotificationTap(): void {
    // Tier 3: Notification entry (visual foreground only)
    this.notificationHandler.onNotificationTap();
  }
}

export default MobileLifecycleAdapter;
