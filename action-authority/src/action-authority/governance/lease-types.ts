/**
 * Action Authority Level 3: Leased Intent
 * Authority Lease Type Definitions
 *
 * ARCHITECTURAL PRINCIPLE:
 * A Lease is a temporal and scope-bound delegation of authority.
 * It allows the AI to act autonomously on LOW-risk actions within a specific domain
 * for a limited time window, ONLY while the Dead Man's Switch remains engaged.
 *
 * HIGH-risk actions ALWAYS revoke the lease and require manual 400ms hold (v1.0.0/v1.1.0).
 *
 * AMENDMENTS:
 * E: Heartbeat Invariant — One missed heartbeat = instant REVOKED (no grace period)
 * F: Scope-Strictness — Cross-domain use = GLOBAL_REVOCATION
 * G: 2nd-Order Audit — Lease creation and revocation are forensically audited
 */

import { RiskLevel } from './quorum-types';
import { ExecutionDomain } from '../execution/work-order';

/**
 * LeaseScope: A lease is bound to a single ExecutionDomain
 * (LOGIC_PRO, EXCEL, CHROME, VS_CODE, SYSTEM, CUSTOM)
 */
export type LeaseScope = ExecutionDomain;

/**
 * Revocation Reason: Why did this lease end?
 */
export type LeaseRevocationReason =
  | 'TIME_EXPIRED'          // expiresAt timestamp reached
  | 'HEARTBEAT_MISSED'      // Amendment E: missed one heartbeat cycle
  | 'SCOPE_VIOLATION'       // Amendment F: attempted cross-domain use
  | 'RISK_ESCALATION'       // User tried HIGH-risk action with lease
  | 'USER_DISENGAGEMENT'    // Dead Man's Switch released
  | 'MANUAL_REVOCATION';    // User explicitly ended lease

/**
 * AuthorityLease: A time-bound and scope-bound delegation
 *
 * INVARIANTS:
 * - Immutable once created (Object.freeze)
 * - Can only grant LOW-risk authority (HIGH-risk actions revoke)
 * - Bound to single domain (cross-domain use triggers GLOBAL_REVOCATION)
 * - Requires active Dead Man's Switch engagement
 * - Each heartbeat failure marks lease as revoked (Amendment E)
 *
 * LIFECYCLE:
 * 1. Created by user initiating 2-second "Master Hold"
 * 2. Active from createdAt until expiresAt OR heartbeat missed OR scope violated
 * 3. Revoked state is immutable (can only transition to REVOKED, never back)
 */
export interface AuthorityLease {
  // Identity
  leaseId: string;                         // Unique lease identifier
  sessionId: string;                       // WHO holds the lease
  domain: LeaseScope;                      // WHERE (domain) this lease applies

  // Authority Scope
  riskCeiling: RiskLevel;                  // 'LOW' only (HIGH always revokes)
  allowedActions?: string[];               // (Optional) Whitelist specific actions

  // Temporal Bounds
  createdAt: number;                       // Unix timestamp of lease creation
  expiresAt: number;                       // Unix timestamp of lease expiration

  // Heartbeat (Amendment E)
  heartbeatIntervalMs: number;             // 50ms per Amendment E
  lastHeartbeatAt: number;                 // Last successful heartbeat timestamp
  heartbeatMissCount: number;              // If > 0, lease is REVOKED

  // Revocation State (Amendment G)
  isRevoked: boolean;                      // Is this lease revoked?
  revokedAt?: number;                      // When was it revoked?
  revocationReason?: LeaseRevocationReason; // Why was it revoked?

  // Immutability Marker
  immutable: true;
}

/**
 * LeaseValidationResult: What the dispatcher checks before allowing execution
 */
export interface LeaseValidationResult {
  isValid: boolean;                        // Is this lease currently valid?
  isExpired: boolean;                      // Has expiresAt passed?
  isHeartbeatLate: boolean;                // Amendment E: Heartbeat missed?
  isRevokedGlobally: boolean;              // Has the lease been revoked?
  isDomainAllowed: boolean;                // Does lease domain match work order?
  isRiskAllowed: boolean;                  // Is work order risk ≤ riskCeiling?

  // Diagnostic info
  reason?: string;                         // Why is lease invalid (if !isValid)
  timeUntilExpiry?: number;                // Milliseconds until expiration
  heartbeatHealth?: {
    lastHeartbeatMs: number;               // How long ago was last heartbeat?
    isLate: boolean;                       // Is it past the interval?
  };
}

/**
 * HeartbeatSignal: Sent by Dead Man's Switch every heartbeatIntervalMs
 */
export interface HeartbeatSignal {
  leaseId: string;                         // Which lease this heartbeat applies to
  timestamp: number;                       // When the heartbeat occurred
  sessionId: string;                       // Who sent it (must match lease holder)
  engagementLevel: number;                 // 0-100 (for UI/diagnostics)
}

/**
 * Helper: Create an AuthorityLease
 */
export function createAuthorityLease(params: {
  leaseId: string;
  sessionId: string;
  domain: LeaseScope;
  riskCeiling: RiskLevel;
  durationMs: number;                      // How long the lease lasts
  heartbeatIntervalMs?: number;            // Defaults to 50ms per Amendment E
  allowedActions?: string[];
}): AuthorityLease {
  const now = Date.now();
  const heartbeatInterval = params.heartbeatIntervalMs ?? 50;

  const lease: AuthorityLease = {
    leaseId: params.leaseId,
    sessionId: params.sessionId,
    domain: params.domain,
    riskCeiling: params.riskCeiling,
    createdAt: now,
    expiresAt: now + params.durationMs,
    heartbeatIntervalMs: heartbeatInterval,
    lastHeartbeatAt: now,
    heartbeatMissCount: 0,
    isRevoked: false,
    allowedActions: params.allowedActions,
    immutable: true,
  };

  // Deep freeze to enforce immutability
  Object.freeze(lease);
  if (lease.allowedActions) Object.freeze(lease.allowedActions);

  return lease;
}

/**
 * Helper: Revoke a lease (creates new immutable revoked version)
 *
 * CRITICAL: We don't mutate the original lease. We return a new frozen version.
 * This preserves the immutability invariant while marking revocation.
 */
export function revokeAuthorityLease(
  lease: AuthorityLease,
  reason: LeaseRevocationReason
): AuthorityLease {
  // Copy the lease and mark as revoked
  const revokedLease: AuthorityLease = {
    ...lease,
    isRevoked: true,
    revokedAt: Date.now(),
    revocationReason: reason,
    immutable: true,
  };

  // Freeze the revoked version
  Object.freeze(revokedLease);
  if (revokedLease.allowedActions) Object.freeze(revokedLease.allowedActions);

  return revokedLease;
}

/**
 * Helper: Update heartbeat (creates new immutable version)
 *
 * CRITICAL: Heartbeat updates must respect Amendment E:
 * - One missed heartbeat = REVOKED immediately
 * - If heartbeat is late (> heartbeatIntervalMs), mark as revoked
 */
export function updateLeaseHeartbeat(
  lease: AuthorityLease,
  signal: HeartbeatSignal
): AuthorityLease {
  // If already revoked, return unchanged
  if (lease.isRevoked) {
    return lease;
  }

  // Verify session (heartbeat must come from lease holder)
  if (signal.sessionId !== lease.sessionId) {
    return revokeAuthorityLease(lease, 'USER_DISENGAGEMENT');
  }

  // Amendment E: Check if heartbeat is late
  const timeSinceLastBeat = signal.timestamp - lease.lastHeartbeatAt;
  if (timeSinceLastBeat > lease.heartbeatIntervalMs) {
    // One missed heartbeat = instant revocation
    return revokeAuthorityLease(lease, 'HEARTBEAT_MISSED');
  }

  // Update heartbeat timestamp (create new immutable version)
  const updatedLease: AuthorityLease = {
    ...lease,
    lastHeartbeatAt: signal.timestamp,
    immutable: true,
  };

  Object.freeze(updatedLease);
  if (updatedLease.allowedActions) Object.freeze(updatedLease.allowedActions);

  return updatedLease;
}

/**
 * Validate a lease against a work order's domain and risk level
 */
export function validateLeaseForExecution(
  lease: AuthorityLease | null | undefined,
  workOrderDomain: ExecutionDomain,
  workOrderRisk: RiskLevel
): LeaseValidationResult {
  const now = Date.now();

  // No lease provided
  if (!lease) {
    return {
      isValid: false,
      isExpired: false,
      isHeartbeatLate: false,
      isRevokedGlobally: false,
      isDomainAllowed: false,
      isRiskAllowed: false,
      reason: 'NO_LEASE',
    };
  }

  // Lease is revoked
  if (lease.isRevoked) {
    return {
      isValid: false,
      isExpired: false,
      isHeartbeatLate: false,
      isRevokedGlobally: true,
      isDomainAllowed: false,
      isRiskAllowed: false,
      reason: `LEASE_REVOKED: ${lease.revocationReason}`,
    };
  }

  // Time expired
  const isExpired = now > lease.expiresAt;
  if (isExpired) {
    return {
      isValid: false,
      isExpired: true,
      isHeartbeatLate: false,
      isRevokedGlobally: false,
      isDomainAllowed: false,
      isRiskAllowed: false,
      reason: 'LEASE_EXPIRED',
    };
  }

  // Amendment E: Heartbeat check
  const timeSinceLastBeat = now - lease.lastHeartbeatAt;
  const isHeartbeatLate = timeSinceLastBeat > lease.heartbeatIntervalMs;
  if (isHeartbeatLate) {
    return {
      isValid: false,
      isExpired: false,
      isHeartbeatLate: true,
      isRevokedGlobally: false,
      isDomainAllowed: false,
      isRiskAllowed: false,
      reason: 'HEARTBEAT_MISSED',
      heartbeatHealth: {
        lastHeartbeatMs: timeSinceLastBeat,
        isLate: true,
      },
    };
  }

  // Amendment F: Domain check (scope-strictness)
  const isDomainAllowed = lease.domain === workOrderDomain;
  if (!isDomainAllowed) {
    return {
      isValid: false,
      isExpired: false,
      isHeartbeatLate: false,
      isRevokedGlobally: false,
      isDomainAllowed: false,
      isRiskAllowed: false,
      reason: `SCOPE_VIOLATION: Lease for ${lease.domain}, attempted ${workOrderDomain}`,
    };
  }

  // Risk check: HIGH risk always requires manual 400ms hold (revokes lease)
  const isRiskAllowed = workOrderRisk === 'LOW' && lease.riskCeiling === 'LOW';
  if (!isRiskAllowed) {
    // HIGH risk with active lease = revoke and require manual hold
    return {
      isValid: false,
      isExpired: false,
      isHeartbeatLate: false,
      isRevokedGlobally: false,
      isDomainAllowed: true,
      isRiskAllowed: false,
      reason: 'RISK_ESCALATION: HIGH-risk actions revoke lease, require manual 400ms hold',
    };
  }

  // Lease is valid!
  return {
    isValid: true,
    isExpired: false,
    isHeartbeatLate: false,
    isRevokedGlobally: false,
    isDomainAllowed: true,
    isRiskAllowed: true,
    timeUntilExpiry: lease.expiresAt - now,
    heartbeatHealth: {
      lastHeartbeatMs: timeSinceLastBeat,
      isLate: false,
    },
  };
}
