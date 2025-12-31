/**
 * Guarded Session Manager — With Capability Authority
 *
 * Wraps sessionManager with FILE_WRITE capability checks.
 * Autosave is halted if authority is denied.
 *
 * Integration point for Rule C3: Side-Effect Promotion
 * Parameter changes that trigger autosave are escalated to FILE_WRITE.
 */

import { SessionState } from '../types';
import { sessionManager } from './sessionManager';
import ESLCapabilityAdapter from './eslCapabilityAdapter';
import { withCapability } from './withCapability';
import { Capability } from './capabilities';

export class GuardedSessionManager {
  private autosaveTimer: number | null = null;
  private isAutosaveEnabled = false;
  private sessionDataPendingAutosave: SessionState | null = null;

  constructor(
    private adapter: ESLCapabilityAdapter,
    private appId: string
  ) {}

  /**
   * Start autosave with capability checks.
   * Each autosave attempt is guarded by FILE_WRITE capability.
   */
  async startAutosaveGuarded(intervalMs: number = 5000): Promise<void> {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }

    this.isAutosaveEnabled = true;

    this.autosaveTimer = window.setInterval(async () => {
      if (!this.isAutosaveEnabled || !this.sessionDataPendingAutosave) {
        return;
      }

      // Check capability before autosave
      const canAutosave = await this.adapter.canAutosave(
        this.sessionDataPendingAutosave
      );

      if (!canAutosave) {
        // Authority denied. Autosave is silently halted.
        // This is expected behavior during S4 (ACC_CHECKPOINT) or S5 (PAUSED).
        // Console warning for diagnostic purposes only (not user-facing).
        console.warn('[GuardedSessionManager] Autosave denied by capability authority');
        return;
      }

      // Authority granted. Execute autosave.
      try {
        await this.performAutosave(this.sessionDataPendingAutosave);
      } catch (error) {
        console.error('[GuardedSessionManager] Autosave failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop autosave timer.
   */
  stopAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.isAutosaveEnabled = false;
  }

  /**
   * Queue session update for autosave.
   * This marks the session as "dirty" but doesn't save immediately.
   * Actual save happens on next autosave interval (if authority permits).
   */
  updateSession(updates: Partial<SessionState>): void {
    // Merge updates into pending state
    this.sessionDataPendingAutosave = {
      ...this.sessionDataPendingAutosave || {},
      ...updates,
      savedAt: Date.now(),
    } as SessionState;

    // Delegate to original sessionManager for in-memory state
    sessionManager.updateSession(updates);
  }

  /**
   * Update session with side-effect checking (Rule C3).
   * If parameter change has side-effects (e.g., auto-save toggle),
   * escalate to FILE_WRITE capability check.
   */
  async updateSessionWithSideEffectCheck(
    parameterId: string,
    newValue: any,
    otherUpdates?: Partial<SessionState>
  ): Promise<void> {
    // Check for side-effects first
    const sideEffectCapability = await this.adapter.guardSideEffectParameter(
      parameterId,
      newValue
    );

    if (sideEffectCapability) {
      // Side-effect detected. This is an escalated operation.
      // Require capability check before allowing the change.
      const grant = this.adapter['authority'].assertAllowed(sideEffectCapability);
      // If we got here, capability was granted. Proceed.
    }

    // Now update the session normally
    this.updateSession(otherUpdates || {});
  }

  /**
   * Explicit save (user-initiated, e.g., Ctrl+S).
   * Requires FILE_WRITE capability + may require ACC.
   */
  async saveSessionExplicit(session: SessionState): Promise<void> {
    const request = await this.adapter.guardSaveSession(session);

    // This will either succeed (if authority allows) or throw
    const authority = (this.adapter as any).authority; // Access for testing
    const grant = authority.assertAllowed(request);

    if (grant.requiresACC) {
      throw new Error(
        `[ACC_REQUIRED] FILE_WRITE capability requires active consent. ` +
        `Reason: ${request.reason}`
      );
    }

    // Authority granted and no ACC required. Save now.
    await this.performAutosave(session);
  }

  /**
   * Internal: Perform actual autosave.
   * Called only after capability check passes.
   */
  private async performAutosave(session: SessionState): Promise<void> {
    try {
      // Delegate to original sessionManager's internal save
      // (We cannot call public saveSessionNow, so we use the same logic)
      const SESSION_KEY = 'echo-session-v2';
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('[GuardedSessionManager] Failed to persist session:', error);
      throw error;
    }
  }

  /**
   * Clear session (on revocation or logout).
   * Does NOT require capability check (cleanup operation).
   */
  clearSession(): void {
    const SESSION_KEY = 'echo-session-v2';
    try {
      localStorage.removeItem(SESSION_KEY);
      this.sessionDataPendingAutosave = null;
      console.log('[GuardedSessionManager] Session cleared');
    } catch (error) {
      console.error('[GuardedSessionManager] Failed to clear session:', error);
    }
  }

  /**
   * Load session from localStorage (read-only, no capability check needed).
   */
  loadSession(): SessionState | null {
    try {
      const SESSION_KEY = 'echo-session-v2';
      const data = localStorage.getItem(SESSION_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed as SessionState;
      }
    } catch (error) {
      console.error('[GuardedSessionManager] Failed to load session:', error);
    }
    return null;
  }

  /**
   * Restore session on app startup.
   * No capability check (reading only, and user already has access to their own session).
   */
  async restoreSession(): Promise<SessionState | null> {
    const session = this.loadSession();
    if (session) {
      this.sessionDataPendingAutosave = session;
    }
    return session;
  }
}

export default GuardedSessionManager;
