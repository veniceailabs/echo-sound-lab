/**
 * Action Authority Level 3: Dead Man's Switch Interface
 *
 * The Dead Man's Switch is the physical constraint that binds the human to autonomous execution.
 *
 * PRINCIPLE:
 * - Mobile: Finger must remain on screen (touch event)
 * - Desktop: Active engagement required (focus + periodic input)
 * - Lift finger / disengage: Authority revocation is immediate and complete
 *
 * AMENDMENT E: Heartbeat Invariant
 * The Dead Man's Switch must provide a heartbeat every heartbeatIntervalMs (50ms).
 * If a heartbeat is missed (no signal within the interval), the lease is immediately REVOKED.
 * There is no grace period.
 *
 * This interface is PLATFORM-AGNOSTIC.
 * Implementations will be platform-specific (React hooks, iOS native, etc.).
 */

import { HeartbeatSignal } from './lease-types';

/**
 * Engagement Mode: How is the user keeping the switch engaged?
 */
export enum EngagementMode {
  MOBILE_TOUCH = 'MOBILE_TOUCH',      // Finger on screen (iOS/Android)
  DESKTOP_FOCUS = 'DESKTOP_FOCUS',    // Active window focus + periodic input
  GAMEPAD = 'GAMEPAD',                // Controller button held
  UNKNOWN = 'UNKNOWN',
}

/**
 * Heartbeat Status: Health of the heartbeat for a specific lease
 */
export interface HeartbeatStatus {
  leaseId: string;
  isAlive: boolean;                    // Is heartbeat currently active?
  lastHeartbeatAt: number | null;      // When was the last successful heartbeat?
  missedCount: number;                 // How many heartbeats missed in a row?
  engagementMode?: EngagementMode;     // How is user engaging?
  engagementLevel: number;             // 0-100 (0 = not engaged, 100 = fully engaged)
}

/**
 * Dead Man's Switch Interface
 *
 * All implementations MUST:
 * 1. Send heartbeats every heartbeatIntervalMs (50ms per Amendment E)
 * 2. Stop sending heartbeats immediately when user disengages
 * 3. Report engagement level (0-100) for UI feedback
 * 4. Invoke onHeartbeatMissed callback if heartbeat cannot be sent
 * 5. Never silently fail or cache heartbeat signals
 */
export interface IDeadMansSwitch {
  /**
   * Start heartbeat for a lease
   *
   * This begins sending HeartbeatSignal every heartbeatIntervalMs.
   * Must be called after lease is created.
   *
   * Throws if:
   * - leaseId is unknown
   * - heartbeat is already running for this lease
   */
  startHeartbeat(leaseId: string, heartbeatIntervalMs: number): Promise<void>;

  /**
   * Stop heartbeat (user disengaged / lease revoked)
   *
   * This immediately ceases sending heartbeat signals.
   * If heartbeat was active, the lease will expire on next validation check.
   */
  stopHeartbeat(leaseId: string): Promise<void>;

  /**
   * Check if heartbeat is currently alive for a lease
   *
   * Returns false if:
   * - Heartbeat was never started
   * - stopHeartbeat was called
   * - User disengaged (lifted finger / lost focus)
   */
  isHeartbeatAlive(leaseId: string): boolean;

  /**
   * Get the last successful heartbeat timestamp for a lease
   *
   * Returns null if heartbeat has never been sent for this lease.
   */
  getLastHeartbeat(leaseId: string): number | null;

  /**
   * Get current engagement level (0-100)
   *
   * 0 = not engaged (finger off screen, no focus, etc.)
   * 100 = fully engaged (finger on screen, focus active, etc.)
   *
   * Used for UI feedback ("Hold the pulse...").
   */
  getEngagementLevel(leaseId: string): number;

  /**
   * Get full heartbeat status for a lease
   */
  getHeartbeatStatus(leaseId: string): HeartbeatStatus | null;

  /**
   * Get engagement mode for a lease
   */
  getEngagementMode(leaseId: string): EngagementMode;

  /**
   * Callback: Invoked when heartbeat is missed
   *
   * This is called when a heartbeat signal cannot be sent within the heartbeat interval.
   * The implementation should immediately revoke the associated lease.
   */
  onHeartbeatMissed?(leaseId: string, missedCount: number): void;

  /**
   * Callback: Invoked when user disengages
   *
   * This is called when the physical engagement ends:
   * - Mobile: Finger lifted from screen
   * - Desktop: Focus lost / button released
   */
  onDisengagement?(leaseId: string): void;

  /**
   * Reset heartbeat state for a lease (for testing)
   */
  reset?(leaseId: string): void;
}

/**
 * Abstract base class for Dead Man's Switch implementations
 *
 * Subclasses should implement:
 * - Mobile implementation (React Native or native iOS/Android)
 * - Desktop/Web implementation (React hooks + mouse/keyboard)
 * - Gamepad implementation (Gamepad API)
 */
export abstract class DeadMansSwitchImpl implements IDeadMansSwitch {
  protected heartbeatMap = new Map<string, HeartbeatStatus>();
  protected heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  abstract startHeartbeat(
    leaseId: string,
    heartbeatIntervalMs: number
  ): Promise<void>;

  abstract stopHeartbeat(leaseId: string): Promise<void>;

  abstract isHeartbeatAlive(leaseId: string): boolean;

  abstract getLastHeartbeat(leaseId: string): number | null;

  abstract getEngagementLevel(leaseId: string): number;

  abstract getEngagementMode(leaseId: string): EngagementMode;

  /**
   * Get full heartbeat status
   */
  getHeartbeatStatus(leaseId: string): HeartbeatStatus | null {
    return this.heartbeatMap.get(leaseId) ?? null;
  }

  /**
   * Protected helper: Send a heartbeat signal
   *
   * Implementations call this when a heartbeat event occurs.
   */
  protected sendHeartbeat(signal: HeartbeatSignal, engagementLevel: number): void {
    const status = this.heartbeatMap.get(signal.leaseId);

    if (!status) {
      return; // Heartbeat for unknown lease (shouldn't happen)
    }

    // Reset missed count (heartbeat received)
    status.missedCount = 0;
    status.isAlive = true;
    status.lastHeartbeatAt = signal.timestamp;
    status.engagementLevel = engagementLevel;
  }

  /**
   * Protected helper: Mark heartbeat as missed
   *
   * Implementations call this when heartbeat window expires without signal.
   */
  protected markHeartbeatMissed(leaseId: string): void {
    const status = this.heartbeatMap.get(leaseId);

    if (!status) {
      return;
    }

    status.missedCount++;
    status.isAlive = false;

    // Amendment E: One missed heartbeat = revoke
    if (status.missedCount >= 1) {
      this.onHeartbeatMissed?.(leaseId, status.missedCount);
    }
  }

  /**
   * Protected helper: Mark user as disengaged
   */
  protected markDisengagement(leaseId: string): void {
    const status = this.heartbeatMap.get(leaseId);

    if (!status) {
      return;
    }

    status.isAlive = false;
    status.engagementLevel = 0;
    this.onDisengagement?.(leaseId);
  }

  /**
   * Protected helper: Create heartbeat status entry
   */
  protected createHeartbeatStatus(
    leaseId: string,
    engagementMode: EngagementMode
  ): HeartbeatStatus {
    const status: HeartbeatStatus = {
      leaseId,
      isAlive: false,
      lastHeartbeatAt: null,
      missedCount: 0,
      engagementMode,
      engagementLevel: 0,
    };

    this.heartbeatMap.set(leaseId, status);
    return status;
  }

  /**
   * Public reset (for testing)
   */
  reset(leaseId: string): void {
    // Clear any pending heartbeat interval
    const interval = this.heartbeatIntervals.get(leaseId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(leaseId);
    }

    // Clear heartbeat status
    this.heartbeatMap.delete(leaseId);
  }
}

/**
 * Mock Implementation: For Testing
 *
 * Allows tests to manually inject heartbeat signals.
 */
export class MockDeadMansSwitch extends DeadMansSwitchImpl {
  private engagementLevels = new Map<string, number>();
  private engagementModes = new Map<string, EngagementMode>();

  async startHeartbeat(leaseId: string, heartbeatIntervalMs: number): Promise<void> {
    this.createHeartbeatStatus(leaseId, EngagementMode.UNKNOWN);
    this.engagementLevels.set(leaseId, 100); // Default to fully engaged for tests
    this.engagementModes.set(leaseId, EngagementMode.DESKTOP_FOCUS);

    // For testing: Start a timer that checks if heartbeat was sent
    const interval = setInterval(() => {
      const status = this.heartbeatMap.get(leaseId);
      if (status && status.isAlive) {
        // Heartbeat was sent, reset for next check
        status.isAlive = false;
      } else {
        // Heartbeat was NOT sent—mark as missed
        this.markHeartbeatMissed(leaseId);
      }
    }, heartbeatIntervalMs);

    this.heartbeatIntervals.set(leaseId, interval);
  }

  async stopHeartbeat(leaseId: string): Promise<void> {
    const interval = this.heartbeatIntervals.get(leaseId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(leaseId);
    }
    this.markDisengagement(leaseId);
  }

  isHeartbeatAlive(leaseId: string): boolean {
    const status = this.heartbeatMap.get(leaseId);
    return status?.isAlive ?? false;
  }

  getLastHeartbeat(leaseId: string): number | null {
    return this.heartbeatMap.get(leaseId)?.lastHeartbeatAt ?? null;
  }

  getEngagementLevel(leaseId: string): number {
    return this.engagementLevels.get(leaseId) ?? 0;
  }

  getEngagementMode(leaseId: string): EngagementMode {
    return this.engagementModes.get(leaseId) ?? EngagementMode.UNKNOWN;
  }

  /**
   * Test helper: Manually inject a heartbeat
   */
  injectHeartbeat(leaseId: string, timestamp: number): void {
    const signal: HeartbeatSignal = {
      leaseId,
      timestamp,
      sessionId: 'test-session',
      engagementLevel: this.getEngagementLevel(leaseId),
    };

    this.sendHeartbeat(signal, signal.engagementLevel);
  }

  /**
   * Test helper: Set engagement level
   */
  setEngagementLevel(leaseId: string, level: number): void {
    this.engagementLevels.set(leaseId, Math.max(0, Math.min(100, level)));
  }

  /**
   * Test helper: Simulate disengagement
   */
  simulateDisengagement(leaseId: string): void {
    this.markDisengagement(leaseId);
  }
}
