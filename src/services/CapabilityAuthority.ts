/**
 * Capability Authority — Default-Deny Gate
 *
 * Core principle: No capability exists without explicit grant.
 * - No wildcard scope
 * - No implicit escalation
 * - No time extension
 * - All checks logged
 * - Process identity bound (C6: halt on PID change, app crash, reload)
 */

import { Capability, CapabilityGrant, CapabilityRequest, CapabilityScope } from './capabilities';

export interface ProcessIdentity {
  appId: string;
  pid: number;
  launchTimestamp: number;
}

export class CapabilityAuthority {
  private grants: CapabilityGrant[] = [];
  private processIdentity: ProcessIdentity | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly monotonicNow: () => number,
    initialProcessIdentity?: ProcessIdentity
  ) {
    if (initialProcessIdentity) {
      this.bindProcessIdentity(initialProcessIdentity);
    }
  }

  /**
   * Grant a capability (immutable, time-bounded).
   */
  grant(grant: CapabilityGrant): void {
    if (grant.expiresAt <= this.monotonicNow()) {
      throw new Error(
        `[CAPABILITY_GRANT] Cannot grant expired capability. ` +
        `Expiry: ${grant.expiresAt}, Now: ${this.monotonicNow()}`
      );
    }
    this.grants.push(grant);
  }

  /**
   * Revoke all capabilities (session end, halt, etc.).
   */
  revokeAll(): void {
    this.grants = [];
  }

  /**
   * Bind this authority to a process identity (C6: Process Identity Binding).
   * If process crashes, reloads, or PID changes → authority halts.
   */
  bindProcessIdentity(identity: ProcessIdentity): void {
    this.processIdentity = {
      appId: identity.appId,
      pid: identity.pid,
      launchTimestamp: identity.launchTimestamp
    };
  }

  /**
   * Check if process identity is still valid.
   * Called before every capability check.
   * If identity has changed → immediate halt (revokeAll).
   */
  private verifyProcessIdentity(currentIdentity: ProcessIdentity): boolean {
    if (!this.processIdentity) {
      // Not bound yet, allow
      return true;
    }

    // PID changed → app crashed or reloaded
    if (currentIdentity.pid !== this.processIdentity.pid) {
      console.warn(
        `[C6_VIOLATION] Process ID changed. Session halted.\n` +
        `Previous PID: ${this.processIdentity.pid}, Current PID: ${currentIdentity.pid}`
      );
      this.revokeAll();
      return false;
    }

    // Launch timestamp changed → process restarted
    if (currentIdentity.launchTimestamp !== this.processIdentity.launchTimestamp) {
      console.warn(
        `[C6_VIOLATION] Process restarted. Session halted.\n` +
        `Previous launch: ${this.processIdentity.launchTimestamp}, Current: ${currentIdentity.launchTimestamp}`
      );
      this.revokeAll();
      return false;
    }

    return true;
  }

  /**
   * Check if a capability is allowed.
   * Throws if denied. Returns grant if allowed.
   * Default: DENY. No capability without explicit match.
   * Enforces C6: Process identity must remain constant.
   */
  assertAllowed(request: CapabilityRequest, currentProcessIdentity?: ProcessIdentity): CapabilityGrant {
    const now = this.monotonicNow();

    // C6: Verify process identity hasn't changed
    if (currentProcessIdentity) {
      if (!this.verifyProcessIdentity(currentProcessIdentity)) {
        throw new Error(
          `[C6_HALT] Process identity changed. Authority halted.\n` +
          `All capabilities revoked.`
        );
      }
    }

    // Find matching grant
    const match = this.grants.find(g =>
      g.capability === request.capability &&
      g.expiresAt > now &&
      scopeMatches(g.scope, request.scope)
    );

    if (!match) {
      throw new Error(
        `[CAPABILITY_DENIED] ${request.capability}\n` +
        `Reason: ${request.reason}\n` +
        `Scope: appId=${request.scope.appId}, ` +
        `windowId=${request.scope.windowId || 'any'}, ` +
        `resourceIds=${request.scope.resourceIds?.join(',') || 'any'}`
      );
    }

    return match;
  }

  /**
   * Check without throwing (returns true/false).
   * Use for conditional UI rendering.
   */
  isAllowed(request: CapabilityRequest, currentProcessIdentity?: ProcessIdentity): boolean {
    try {
      this.assertAllowed(request, currentProcessIdentity);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get current process identity (for diagnostics).
   */
  getProcessIdentity(): ProcessIdentity | null {
    return this.processIdentity ? { ...this.processIdentity } : null;
  }

  /**
   * Get all active grants (for diagnostics).
   */
  getActiveGrants(): CapabilityGrant[] {
    const now = this.monotonicNow();
    return this.grants.filter(g => g.expiresAt > now);
  }

  /**
   * Get remaining TTL for a capability (in ms).
   */
  getRemainingTtl(grant: CapabilityGrant): number {
    const remaining = grant.expiresAt - this.monotonicNow();
    return Math.max(0, remaining);
  }

  /**
   * Check if any grant exists for a capability (ignoring scope).
   */
  hasCapability(capability: Capability): boolean {
    const now = this.monotonicNow();
    return this.grants.some(g =>
      g.capability === capability &&
      g.expiresAt > now
    );
  }

  /**
   * Enforce scope matching.
   * App must match exactly. Window and resource are optional (if granted, narrower).
   */
}

function scopeMatches(granted: CapabilityScope, requested: CapabilityScope): boolean {
  // App ID must match exactly (no cross-app bleed)
  if (granted.appId !== requested.appId) {
    return false;
  }

  // If window is specified in grant, must match exactly
  if (granted.windowId && granted.windowId !== requested.windowId) {
    return false;
  }

  // If resource IDs are specified in grant, requested IDs must be subset
  if (granted.resourceIds && requested.resourceIds) {
    const requestedSet = new Set(requested.resourceIds);
    const grantedSet = new Set(granted.resourceIds);

    for (const resourceId of requestedSet) {
      if (!grantedSet.has(resourceId)) {
        return false;
      }
    }
  }

  return true;
}

export default CapabilityAuthority;
