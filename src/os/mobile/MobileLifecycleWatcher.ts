/**
 * Mobile Lifecycle Watcher — Tier 1 Freeze Enforcement
 * Phase 7 MOB-PR-002
 *
 * Rule: throwIfNotInForeground() MUST be first line of any enforce path.
 * Rule: Foreground does NOT restore authority.
 * Rule: Background/blur/lock/kill = immediate revokeAll().
 *
 * Blocks: MOB-T01, MOB-T02, MOB-T05, MOB-T06, MOB-T07, MOB-T08, MOB-T09, MOB-T12
 */

import MobileSessionContext from './MobileSessionContext';
import { getAuditLogger } from '../../services/AuditLogger';

export class MobileLifecycleWatcher {
  private sessionCtx: MobileSessionContext;
  private audit = getAuditLogger();

  constructor(sessionCtx: MobileSessionContext) {
    this.sessionCtx = sessionCtx;
  }

  // ========================================================================
  // Lifecycle Transitions
  // ========================================================================

  /**
   * App became foreground (active)
   * iOS: applicationDidBecomeActive
   * Android: onResume
   *
   * Foreground grants permission to ATTEMPT bind only.
   * Does NOT restore authority automatically.
   */
  onForeground(): void {
    this.sessionCtx.setForeground(true);
    this.audit.emit('MOBILE_APP_FOREGROUND', {
      timestamp: Date.now()
    });
  }

  /**
   * App lost focus (blur)
   * iOS: applicationWillResignActive
   * Android: onPause
   *
   * Blocks: MOB-T01, MOB-T05, MOB-T06, MOB-T09
   */
  onBlur(): void {
    this.sessionCtx.setForeground(false);
    this.sessionCtx.revokeAll();
    this.audit.emit('MOBILE_APP_BLUR', {
      timestamp: Date.now()
    });
  }

  /**
   * App entered background
   * iOS: applicationDidEnterBackground
   * Android: onStop
   *
   * Blocks: MOB-T01, MOB-T08, MOB-T09
   */
  onBackground(): void {
    this.sessionCtx.setForeground(false);
    this.sessionCtx.revokeAll();
    this.audit.emit('MOBILE_APP_BACKGROUND', {
      timestamp: Date.now()
    });
  }

  /**
   * App being terminated
   * iOS: applicationWillTerminate
   * Android: onDestroy
   *
   * Blocks: MOB-T04, MOB-T10
   */
  onKill(): void {
    this.sessionCtx.setForeground(false);
    this.sessionCtx.revokeAll();
    this.audit.emit('MOBILE_APP_TERMINATED', {
      timestamp: Date.now()
    });
  }

  /**
   * Screen locked
   * iOS: protectedDataWillBecomeUnavailable
   * Android: ACTION_SCREEN_OFF (via BroadcastReceiver)
   *
   * Blocks: MOB-T07
   */
  onScreenLock(): void {
    this.sessionCtx.setForeground(false);
    this.sessionCtx.revokeAll();
    this.audit.emit('MOBILE_SCREEN_LOCK_DETECTED', {
      timestamp: Date.now()
    });
  }

  // ========================================================================
  // ENFORCEMENT FREEZE GATE (GLOBAL)
  // ========================================================================

  /**
   * Guard clause: throw if not in foreground.
   * MUST be the FIRST executable line of every enforce method.
   *
   * No exceptions. No conditions. No guards.
   *
   * Blocks: MOB-T01, MOB-T02, MOB-T07, MOB-T08, MOB-T09, MOB-T12
   */
  throwIfNotInForeground(): void {
    if (!this.sessionCtx.isInForeground()) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'APP_NOT_IN_FOREGROUND',
        timestamp: Date.now()
      });
      throw new Error('[OS_HARD_STOP] App not in foreground. Authority revoked.');
    }
  }
}

export default MobileLifecycleWatcher;
