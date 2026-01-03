/**
 * Action Authority Level 3: LeasesGate Service
 *
 * The LeasesGate is the logic layer that manages active leases and enforces
 * Amendment E (Heartbeat), Amendment F (Scope), Amendment G (Audit), and
 * Amendment H (Confidence Invariance).
 *
 * CRITICAL PRINCIPLE (Amendment H):
 * Confidence scores from APL, QPU, or any Intelligence Layer are NEVER
 * consulted during lease eligibility checks. Confidence is informational only.
 *
 * The LeasesGate asks:
 * - "Is this lease still alive?" (heartbeat check, Amendment E)
 * - "Is the domain allowed?" (scope check, Amendment F)
 * - "Has this lease change been audited?" (Amendment G)
 *
 * The LeasesGate does NOT ask:
 * - "What is the APL confidence?" (Amendment H violation)
 * - "Is the AI really sure about this?" (Authority cannot be opinion-based)
 * - "Can we bend the rules just this once?" (Rules are structures, not suggestions)
 */

import {
  AuthorityLease,
  LeaseValidationResult,
  LeaseRevocationReason,
  validateLeaseForExecution,
  revokeAuthorityLease,
  updateLeaseHeartbeat,
  HeartbeatSignal,
} from './lease-types';
import { IDeadMansSwitch } from './DeadMansSwitch';
import { ExecutionDomain } from '../execution/work-order';
import { RiskLevel } from './quorum-types';
import { ForensicAuditLog } from '../audit/forensic-log';

/**
 * Lease Registration Result: What happened when we tried to use/check a lease
 */
export interface LeaseRegistrationResult {
  isValid: boolean;                        // Is the lease currently valid?
  lease?: AuthorityLease;                  // Current lease state (if found)
  reason?: string;                         // Why valid/invalid
  validationResult?: LeaseValidationResult; // Full validation details
}

/**
 * LeasesGate: Singleton service managing active leases and their heartbeat state
 *
 * RESPONSIBILITIES:
 * 1. Store active leases per sessionId
 * 2. Monitor heartbeat state via IDeadMansSwitch
 * 3. Revoke leases when heartbeat is missed (Amendment E)
 * 4. Validate leases without consulting confidence scores (Amendment H)
 * 5. Log all lease lifecycle events (Amendment G)
 * 6. Enforce scope strictness (Amendment F)
 *
 * INVARIANTS:
 * - Only one active lease per (sessionId, domain) pair
 * - Heartbeat check is synchronous and deterministic
 * - Revocation is permanent (isRevoked cannot transition back to false)
 * - No confidence metadata influences eligibility checks
 * - All lease changes are forensically audited
 */
export class LeasesGate {
  // Storage: sessionId → Map<domain, lease>
  private static leases = new Map<string, Map<ExecutionDomain, AuthorityLease>>();

  // Reference to Dead Man's Switch (injected at runtime)
  private static deadMansSwitch: IDeadMansSwitch | null = null;

  /**
   * Inject the Dead Man's Switch implementation
   * (Called during app initialization)
   */
  static setDeadMansSwitch(dms: IDeadMansSwitch): void {
    this.deadMansSwitch = dms;
  }

  /**
   * Register a new lease for a session
   *
   * Creates or updates the active lease for (sessionId, domain).
   * If a lease already exists for this domain, it is replaced.
   *
   * Also begins heartbeat monitoring immediately.
   */
  static registerLease(lease: AuthorityLease): void {
    // Create session map if needed
    if (!this.leases.has(lease.sessionId)) {
      this.leases.set(lease.sessionId, new Map());
    }

    const sessionLeases = this.leases.get(lease.sessionId)!;
    sessionLeases.set(lease.domain, lease);

    // Start heartbeat monitoring for this lease
    if (this.deadMansSwitch) {
      this.deadMansSwitch
        .startHeartbeat(lease.leaseId, lease.heartbeatIntervalMs)
        .catch((err) => {
          console.warn(
            `⚠️ [LEASES_GATE] Failed to start heartbeat for lease ${lease.leaseId}: ${err}`
          );
        });
    }

    // Amendment G: Log lease creation
    this.logLeaseCreated(lease);
  }

  /**
   * Get an active lease for a session and domain
   *
   * This includes heartbeat freshness check (Amendment E):
   * If the heartbeat has missed a window, the lease is synchronously revoked.
   *
   * Does NOT consult confidence scores (Amendment H).
   */
  static getLease(sessionId: string, domain: ExecutionDomain): LeaseRegistrationResult {
    const sessionLeases = this.leases.get(sessionId);

    if (!sessionLeases || !sessionLeases.has(domain)) {
      return {
        isValid: false,
        reason: 'NO_ACTIVE_LEASE',
      };
    }

    let lease = sessionLeases.get(domain)!;

    // Amendment E: Check heartbeat freshness
    if (this.deadMansSwitch && !lease.isRevoked) {
      const isHeartbeatAlive = this.deadMansSwitch.isHeartbeatAlive(lease.leaseId);
      const lastHeartbeat = this.deadMansSwitch.getLastHeartbeat(lease.leaseId);

      if (!isHeartbeatAlive || lastHeartbeat === null) {
        // Heartbeat is dead—revoke the lease
        lease = revokeAuthorityLease(lease, 'HEARTBEAT_MISSED');
        sessionLeases.set(domain, lease);
        this.logLeaseRevoked(lease);

        return {
          isValid: false,
          lease,
          reason: 'HEARTBEAT_MISSED',
        };
      }

      // Additional check: if enough time has passed since last heartbeat, revoke
      const now = Date.now();
      const timeSinceLastBeat = now - lastHeartbeat;
      if (timeSinceLastBeat > lease.heartbeatIntervalMs) {
        lease = revokeAuthorityLease(lease, 'HEARTBEAT_MISSED');
        sessionLeases.set(domain, lease);
        this.logLeaseRevoked(lease);

        return {
          isValid: false,
          lease,
          reason: 'HEARTBEAT_MISSED',
        };
      }
    }

    // Amendment H: Do NOT check confidence here
    // (Confidence is informational, not authoritative)

    // Amendment F: Already bound to single domain (implicit in lookup)

    return {
      isValid: !lease.isRevoked,
      lease,
      reason: lease.isRevoked ? `REVOKED: ${lease.revocationReason}` : 'ACTIVE',
    };
  }

  /**
   * Validate a lease for a specific work order execution
   *
   * Performs full validation:
   * - Heartbeat freshness (Amendment E)
   * - Domain matching (Amendment F)
   * - Risk gating (HIGH risk always bypasses)
   * - Revocation state
   *
   * Does NOT consult confidence scores (Amendment H).
   */
  static validateLeaseForWorkOrder(
    sessionId: string,
    domain: ExecutionDomain,
    riskLevel: RiskLevel
  ): LeaseRegistrationResult {
    const leaseResult = this.getLease(sessionId, domain);

    if (!leaseResult.isValid || !leaseResult.lease) {
      return leaseResult;
    }

    const lease = leaseResult.lease;

    // Amendment H: Ignore any confidence metadata
    // (Risk gating is structural, not opinion-based)

    // Use the pure validation function from lease-types.ts
    const validationResult = validateLeaseForExecution(lease, domain, riskLevel);

    // If risk escalation (HIGH risk), revoke and report
    if (!validationResult.isRiskAllowed && riskLevel === 'HIGH') {
      const revokedLease = revokeAuthorityLease(lease, 'RISK_ESCALATION');
      const sessionLeases = this.leases.get(sessionId);
      if (sessionLeases) {
        sessionLeases.set(domain, revokedLease);
      }
      this.logLeaseRevoked(revokedLease);

      return {
        isValid: false,
        lease: revokedLease,
        reason: 'RISK_ESCALATION: HIGH-risk action requires v1.0.0/v1.1.0 authorization',
        validationResult,
      };
    }

    return {
      isValid: validationResult.isValid,
      lease,
      reason: validationResult.reason,
      validationResult,
    };
  }

  /**
   * Revoke a lease (user action or system event)
   */
  static revokeLease(
    sessionId: string,
    domain: ExecutionDomain,
    reason: LeaseRevocationReason
  ): void {
    const sessionLeases = this.leases.get(sessionId);

    if (!sessionLeases || !sessionLeases.has(domain)) {
      return;
    }

    let lease = sessionLeases.get(domain)!;

    if (!lease.isRevoked) {
      lease = revokeAuthorityLease(lease, reason);
      sessionLeases.set(domain, lease);

      // Stop heartbeat monitoring
      if (this.deadMansSwitch) {
        this.deadMansSwitch
          .stopHeartbeat(lease.leaseId)
          .catch((err) => {
            console.warn(`⚠️ [LEASES_GATE] Failed to stop heartbeat: ${err}`);
          });
      }

      // Amendment G: Log revocation
      this.logLeaseRevoked(lease);
    }
  }

  /**
   * Revoke ALL leases for a session (used for scope violations, Amendment F)
   *
   * When a user attempts cross-domain use, all their leases are revoked globally.
   * This is Amendment F enforcement.
   */
  static revokeAllLeasesForSession(sessionId: string, reason: LeaseRevocationReason): void {
    const sessionLeases = this.leases.get(sessionId);

    if (!sessionLeases) {
      return;
    }

    // Revoke each lease in the session
    for (const [domain, lease] of sessionLeases.entries()) {
      if (!lease.isRevoked) {
        const revokedLease = revokeAuthorityLease(lease, reason);
        sessionLeases.set(domain, revokedLease);

        // Stop heartbeat
        if (this.deadMansSwitch) {
          this.deadMansSwitch.stopHeartbeat(lease.leaseId).catch(() => {
            /* silent */
          });
        }

        // Amendment G: Log revocation
        this.logLeaseRevoked(revokedLease);
      }
    }
  }

  /**
   * Get all active leases for a session (for diagnostics)
   */
  static getActiveLeases(sessionId: string): AuthorityLease[] {
    const sessionLeases = this.leases.get(sessionId);
    if (!sessionLeases) return [];

    const active: AuthorityLease[] = [];
    for (const lease of sessionLeases.values()) {
      if (!lease.isRevoked) {
        active.push(lease);
      }
    }

    return active;
  }

  /**
   * Get all leases (active and revoked) for a session
   */
  static getAllLeases(sessionId: string): AuthorityLease[] {
    const sessionLeases = this.leases.get(sessionId);
    if (!sessionLeases) return [];

    return Array.from(sessionLeases.values());
  }

  /**
   * Amendment G: Log lease creation event to forensic audit log
   */
  private static logLeaseCreated(lease: AuthorityLease): void {
    try {
      ForensicAuditLog.writeEntry(
        lease.leaseId,
        lease.leaseId,
        lease.sessionId,
        {
          source: 'LEASE_SYSTEM' as any,
          description: `Lease created: ${lease.domain} (${lease.riskCeiling} risk)`,
          evidence: {
            leaseId: lease.leaseId,
            domain: lease.domain,
            riskCeiling: lease.riskCeiling,
            durationMs: lease.expiresAt - lease.createdAt,
            expiresAt: lease.expiresAt,
          },
        },
        {
          fsmPath: ['LEASE_CREATED'],
          holdDurationMs: 2000, // Master Hold duration
          confirmationTime: lease.createdAt,
          contextId: lease.leaseId,
          contextHash: lease.leaseId, // Simplified for demo
        },
        {
          domain: lease.domain,
          bridge: 'LEASE_GATE',
          status: 'ACTIVE',
          resultHash: lease.leaseId,
          executedAt: lease.createdAt,
          duration: 0,
        }
      );
    } catch (err) {
      console.warn(`⚠️ [LEASES_GATE] Failed to log lease creation: ${err}`);
    }
  }

  /**
   * Amendment G: Log lease revocation event to forensic audit log
   */
  private static logLeaseRevoked(lease: AuthorityLease): void {
    if (!lease.revokedAt || !lease.revocationReason) {
      return; // Not actually revoked yet
    }

    try {
      ForensicAuditLog.writeEntry(
        lease.leaseId,
        lease.leaseId,
        lease.sessionId,
        {
          source: 'LEASE_SYSTEM' as any,
          description: `Lease revoked: ${lease.revocationReason}`,
          evidence: {
            leaseId: lease.leaseId,
            revocationReason: lease.revocationReason,
            timeheldMs: lease.revokedAt - lease.createdAt,
          },
        },
        {
          fsmPath: ['LEASE_REVOKED'],
          holdDurationMs: lease.revokedAt - lease.createdAt,
          confirmationTime: lease.revokedAt,
          contextId: lease.leaseId,
          contextHash: lease.leaseId,
        },
        {
          domain: lease.domain,
          bridge: 'LEASE_GATE',
          status: lease.revocationReason,
          resultHash: lease.leaseId,
          executedAt: lease.revokedAt,
          duration: lease.revokedAt - lease.createdAt,
        }
      );
    } catch (err) {
      console.warn(`⚠️ [LEASES_GATE] Failed to log lease revocation: ${err}`);
    }
  }

  /**
   * Reset all leases (for testing)
   */
  static reset(): void {
    this.leases.clear();
  }

  /**
   * Get all leases across all sessions (for testing/diagnostics)
   */
  static getAllLeasesGlobal(): AuthorityLease[] {
    const all: AuthorityLease[] = [];
    for (const sessionLeases of this.leases.values()) {
      for (const lease of sessionLeases.values()) {
        all.push(lease);
      }
    }
    return all;
  }
}

/**
 * Helper: Get or create the singleton LeasesGate instance
 * (In this implementation, LeasesGate is static, so this just returns the class)
 */
export function getLeasesGate(): typeof LeasesGate {
  return LeasesGate;
}
