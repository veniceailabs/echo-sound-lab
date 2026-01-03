/**
 * Forensic Viewer v2.0: Projection Layer
 *
 * CRITICAL PRINCIPLE:
 * ForensicAuditEntry (sealed, hash-chained) remains IMMUTABLE.
 * This layer provides a READ-ONLY VIEW that enriches entries with governance context.
 *
 * The Viewer derives context by joining:
 * - Sealed forensic log entry (authoritative)
 * - Lease registry (LeasesGate)
 * - Quorum envelopes (QuorumGate)
 * - Revocation event log (system telemetry)
 *
 * Zero modifications to prior entries. Only additive observability.
 */

import { ForensicAuditEntry } from './forensic-types';

/**
 * Execution Mode: How was this action authorized?
 *
 * POLICY_BLOCKED: Action was rejected due to semantic policy violation (Level 4, Amendment J)
 */
export type ExecutionMode = 'LEASE' | 'QUORUM' | 'REVOCATION_EVENT' | 'POLICY_BLOCKED';

/**
 * Heartbeat Health: How fresh is the lease?
 */
export type HeartbeatHealth = 'FRESH' | 'STALE' | 'DEAD';

/**
 * Lease Projection: Context for LEASE_EXECUTION mode
 * Derived from LeasesGate registry (not stored in audit entry)
 */
export interface LeaseProjection {
  leaseId: string;
  heartbeatLatencyMs: number; // Current Time - Last Heartbeat
  heartbeatIntervalMs: number; // Expected interval (e.g., 50ms)
  health: HeartbeatHealth; // FRESH if latency < interval
  leaseExpiresAt: number;
  leaseAgeMs: number;
  riskCeiling: 'LOW';
}

/**
 * Quorum Projection: Context for QUORUM_EXECUTION mode
 * Derived from QuorumGate.getEnvelope() (not stored in audit entry)
 */
export interface QuorumProjection {
  attestations: Array<{
    sessionId: string;
    attestedAt: number;
    holdDurationMs: number;
  }>;
  requiredSignatures: number;
  actualSignatures: number;
  riskLevel: 'LOW' | 'HIGH';
  isComplete: boolean;
}

/**
 * Revocation Event: Why a lease was killed (safety event)
 * Derived from system telemetry log (not stored in sealed entry)
 */
export interface RevocationEvent {
  type:
    | 'HEARTBEAT_MISSED'
    | 'SCOPE_VIOLATION'
    | 'RISK_ESCALATION'
    | 'TIME_EXPIRED'
    | 'MANUAL_REVOCATION'
    | 'USER_DISENGAGEMENT';
  revokedLeaseId: string;
  reason: string;
  revokedAt: number;
  leaseAgeMs: number;
}

/**
 * Policy Violation: Amendment J enforcement event
 * Shows when semantic policies blocked an action
 */
export interface PolicyViolationEvent {
  type: 'POLICY_EVALUATION' | 'POLICY_VIOLATION';
  violationCode: string; // e.g., "PII_EXPOSURE", "EXTERNAL_API_CALL"
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string; // Why the policy was violated
  remediation?: string; // Static guidance from PolicyEngine
  timestamp: number; // When violation was detected
  evaluationTimeMs?: number; // How long policy evaluation took
  policiesChecked?: string[]; // Which policies were evaluated
}

/**
 * Forensic View Model: Read-Only Projection for UI
 *
 * This enriches a sealed forensic entry with governance context.
 * The entry itself is NEVER modified. The projection is ephemeral,
 * computed on-demand from joinable sources.
 *
 * Rules:
 * - baseEntry is immutable (frozen)
 * - executionMode determines which context (lease OR quorum OR revocation)
 * - All metadata is optional and may be null if context unavailable
 * - UI renders based on executionMode, not schema mutation
 */
export interface ForensicViewModel {
  // ====== IMMUTABLE BASE (FROM SEALED AUDIT ENTRY) ======
  baseEntry: ForensicAuditEntry;

  // ====== DERIVED EXECUTION MODE ======
  executionMode: ExecutionMode;

  // ====== GOVERNANCE CONTEXT (OPTIONAL, DERIVED) ======
  lease?: LeaseProjection; // Present if executionMode === 'LEASE'
  quorum?: QuorumProjection; // Present if executionMode === 'QUORUM'
  revocation?: RevocationEvent; // Present if executionMode === 'REVOCATION_EVENT'

  // ====== LEVEL 4: SEMANTIC POLICY CONTEXT (OPTIONAL, AMENDMENT J) ======
  policyViolation?: PolicyViolationEvent; // Present if action was blocked by policy

  // ====== COMPUTED FOR UI ======
  readableMode: string; // "Leased Speed" | "Manual Authority" | "Safety Event" | "Policy Blocked"
  colorScheme: 'amber' | 'blue' | 'red'; // Gold/Amber | Blue | Red
}

/**
 * System Telemetry Event: Append-Only Log
 * (Non-authoritative, for observability only)
 *
 * These are emitted as side-channel telemetry AFTER authorization decisions.
 * They never influence decisions. They only explain them.
 *
 * Level 4 Amendment J: POLICY_EVALUATION and POLICY_VIOLATION events track
 * semantic policy checks and violations for audit trail visibility.
 */
export interface TelemetryEvent {
  type:
    | 'HEARTBEAT_SAMPLE'
    | 'LEASE_REVOKED'
    | 'QUORUM_COMPLETED'
    | 'DISPATCH_DECISION'
    | 'POLICY_EVALUATION'
    | 'POLICY_VIOLATION';
  timestamp: number;
  actionId: string;
  sessionId: string;
  data: Record<string, unknown>;
}

/**
 * Helper: Determine execution mode based on available context
 */
export function deriveExecutionMode(
  entry: ForensicAuditEntry,
  lease?: LeaseProjection,
  quorum?: QuorumProjection,
  revocation?: RevocationEvent,
  policyViolation?: PolicyViolationEvent,
): ExecutionMode {
  if (policyViolation) return 'POLICY_BLOCKED'; // Policy violations take precedence
  if (revocation) return 'REVOCATION_EVENT';
  if (lease) return 'LEASE';
  if (quorum) return 'QUORUM';
  return 'QUORUM'; // Fallback: assume quorum if no lease
}

/**
 * Helper: Convert mode to human-readable text
 */
export function modeToReadable(mode: ExecutionMode, riskLevel?: 'LOW' | 'HIGH'): string {
  if (mode === 'POLICY_BLOCKED') return 'Policy Blocked';
  if (mode === 'REVOCATION_EVENT') return 'Safety Event';
  if (mode === 'LEASE') return 'Leased Speed (No Hold)';
  if (mode === 'QUORUM') {
    if (riskLevel === 'HIGH') return 'High-Risk Quorum (2 Signatures)';
    return 'Manual Authority (Quorum)';
  }
  return 'Unknown';
}

/**
 * Helper: Determine color scheme based on mode
 */
export function modeToColor(mode: ExecutionMode): 'amber' | 'blue' | 'red' {
  if (mode === 'POLICY_BLOCKED') return 'red'; // Red for policy violations
  if (mode === 'REVOCATION_EVENT') return 'red';
  if (mode === 'LEASE') return 'amber';
  return 'blue';
}
