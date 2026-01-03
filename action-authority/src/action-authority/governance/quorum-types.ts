/**
 * Action Authority v1.1.0 — Collaborative Authority
 * Quorum Gate Types
 *
 * ARCHITECTURAL PRINCIPLE:
 * Level 2 never authorizes anything.
 * Level 2 only decides when enough v1.0.0 authorizations exist.
 *
 * This file is pure data contracts.
 * No logic. No side effects. No FSM interaction.
 * Schema only.
 */

/**
 * RiskLevel: Determines how many signatures are required
 *
 * - LOW: Single operator authorization sufficient (1 signature)
 * - HIGH: Two independent operators required (2 signatures)
 *
 * Examples:
 * - EQ adjustment → LOW (operator can adjust alone)
 * - Delete track → HIGH (requires peer confirmation)
 * - Final master bounce → HIGH (requires peer confirmation)
 * - Publish/export → HIGH (requires peer confirmation)
 */
export type RiskLevel = 'LOW' | 'HIGH';

/**
 * Attestation: A single v1.0.0 authorization proof
 *
 * This is NOT a new proof format.
 * This is a reference to an existing, sealed v1.0.0 forensic entry.
 *
 * Each attestation is independently verifiable:
 * - sessionId: Who authorized (e.g., "user_alice")
 * - auditId: Points to the sealed v1.0.0 forensic entry
 * - holdDurationMs: Proof that ≥400ms intent was demonstrated
 * - confirmedAt: Timestamp of the authorization
 */
export interface Attestation {
  sessionId: string; // WHO: "user_alice", "user_bob", etc.
  auditId: string; // Pointer to sealed ForensicAuditEntry from v1.0.0
  holdDurationMs: number; // ≥400ms proves intent (not reflex)
  confirmedAt: number; // Unix timestamp of confirmation
}

/**
 * AuthorizationEnvelope: Composite proof of organizational consent
 *
 * This is the ONLY new structure introduced by Level 2.
 * It composes multiple v1.0.0 proofs into a single governance decision.
 *
 * Invariants:
 * - attestations.length >= requiredSignatures when isComplete = true
 * - All attestations must have unique sessionIds (no double-signing)
 * - Each attestation.auditId points to a sealed v1.0.0 entry
 *
 * Philosophy:
 * This envelope never creates authorization.
 * It only acknowledges when authorization is sufficient.
 */
export interface AuthorizationEnvelope {
  workOrderId: string; // Which work order is this authorizing?
  riskLevel: RiskLevel; // LOW (1 sig) or HIGH (2 sigs)

  // Quorum requirements
  requiredSignatures: number; // 1 (LOW) | 2 (HIGH) | 3+ (future RESTRICTED)

  // Collected authorizations
  attestations: Attestation[]; // Array of v1.0.0 proofs

  // State
  isComplete: boolean; // true when attestations.length >= requiredSignatures

  // Audit trail
  sealedAt?: number; // When this envelope was finalized
}

/**
 * Quorum query result: Used internally by QuorumGate
 * (No external exposure at this schema layer)
 */
export interface QuorumStatus {
  workOrderId: string;
  riskLevel: RiskLevel;
  attestationsReceived: number;
  attestationsRequired: number;
  isQuorumMet: boolean;
  missingSessionIds: string[]; // For UI: "Awaiting User_B"
}
