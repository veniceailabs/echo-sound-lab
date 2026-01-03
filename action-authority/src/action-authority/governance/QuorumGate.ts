/**
 * Action Authority Level 2: Quorum Gate Service
 *
 * ARCHITECTURAL PRINCIPLE (from LOCKED CHECKLIST v1.1.0):
 * "Level 2 never authorizes anything.
 *  Level 2 only decides when enough v1.0.0 authorizations exist."
 *
 * This service:
 * - Composes multiple v1.0.0 proofs (Attestations)
 * - Enforces LOW (1 sig) and HIGH (2 sigs) quorum requirements
 * - Freezes envelopes once complete (Amendment C)
 * - Enforces all amendments A-D
 * - Does NOT interact with FSM
 * - Does NOT create new authorization types
 */

import {
  RiskLevel,
  Attestation,
  AuthorizationEnvelope,
} from './quorum-types';

/**
 * Result of registering an attestation
 */
export interface QuorumRegistrationResult {
  status: 'QUORUM_MET' | 'QUORUM_PENDING';
  envelope: AuthorizationEnvelope;
  missingSessionIds?: string[];
}

/**
 * QuorumGate: Singleton service managing work order authorization envelopes
 *
 * CONSTRAINTS (enforced by implementation):
 * - Amendment A: No time coupling (order of confirmedAt timestamps doesn't matter)
 * - Amendment B: Order independence (same result regardless of registration order)
 * - Amendment C: Envelope immutability (freeze once isComplete = true)
 * - Amendment D: No implicit escalation (require unique sessionIds, not just count)
 */
export class QuorumGate {
  // Singleton storage: workOrderId → AuthorizationEnvelope
  private static envelopes = new Map<string, AuthorizationEnvelope>();

  /**
   * Register an attestation for a work order.
   *
   * Rules:
   * - LOW risk: 1 unique sessionId → isComplete = true
   * - HIGH risk: 2+ unique sessionIds → isComplete = true
   * - Duplicate sessionIds are rejected (no double-voting)
   * - Once complete, envelope is frozen (immutable)
   *
   * Returns the updated envelope and status.
   */
  static registerAttestation(
    workOrderId: string,
    riskLevel: RiskLevel,
    attestation: Attestation
  ): QuorumRegistrationResult {
    // Get or create envelope
    let envelope = this.envelopes.get(workOrderId);

    if (!envelope) {
      // First attestation: create new envelope
      envelope = {
        workOrderId,
        riskLevel,
        requiredSignatures: riskLevel === 'LOW' ? 1 : 2,
        attestations: [],
        isComplete: false,
      };
      this.envelopes.set(workOrderId, envelope);
    }

    // If envelope is already complete and frozen, return current state
    if (envelope.isComplete) {
      return {
        status: 'QUORUM_MET',
        envelope,
        missingSessionIds: [],
      };
    }

    // Amendment D: Check for duplicate sessions (no double-voting)
    const existingSessionIds = new Set(
      envelope.attestations.map((a) => a.sessionId)
    );

    if (existingSessionIds.has(attestation.sessionId)) {
      // Reject duplicate; return current state unchanged
      return {
        status: envelope.isComplete ? 'QUORUM_MET' : 'QUORUM_PENDING',
        envelope,
        missingSessionIds: this.getMissingSessionIds(envelope),
      };
    }

    // Add attestation (safe: envelope not frozen until isComplete is true)
    envelope.attestations.push(attestation);

    // Check if quorum is now met
    const uniqueSessions = new Set(
      envelope.attestations.map((a) => a.sessionId)
    );
    const quorumMet = uniqueSessions.size >= envelope.requiredSignatures;

    // Amendment C: Freeze envelope once complete
    if (quorumMet && !envelope.isComplete) {
      envelope.isComplete = true;
      // sealedAt is set by dispatcher when envelope is committed to forensic log
      // (not here—that's a separate concern)

      // Deep freeze to prevent mutation
      Object.freeze(envelope);
      Object.freeze(envelope.attestations);
      envelope.attestations.forEach((a) => Object.freeze(a));
    }

    return {
      status: envelope.isComplete ? 'QUORUM_MET' : 'QUORUM_PENDING',
      envelope,
      missingSessionIds: this.getMissingSessionIds(envelope),
    };
  }

  /**
   * Get an envelope by work order ID (for dispatcher checks)
   */
  static getEnvelope(
    workOrderId: string
  ): AuthorizationEnvelope | undefined {
    return this.envelopes.get(workOrderId);
  }

  /**
   * Compute missing session IDs for UI / status display.
   * For HIGH risk with 1 attestation, this would return example usernames.
   * (In real implementation, could be configurable per work order context.)
   *
   * This is informational only; never used for authorization logic.
   */
  private static getMissingSessionIds(envelope: AuthorizationEnvelope): string[] {
    const needed = envelope.requiredSignatures - envelope.attestations.length;
    if (needed <= 0) return [];

    // Return placeholder strings for UI display
    const allPossibleSessions = ['user_alice', 'user_bob', 'user_charlie', 'user_diana'];
    const existingSet = new Set(envelope.attestations.map((a) => a.sessionId));
    const missing = allPossibleSessions.filter((s) => !existingSet.has(s));

    return missing.slice(0, needed);
  }

  /**
   * Reset quorum gate (for testing only)
   */
  static reset(): void {
    this.envelopes.clear();
  }

  /**
   * Introspection: Get all envelopes (for testing/debugging)
   */
  static getAllEnvelopes(): Map<string, AuthorizationEnvelope> {
    return new Map(this.envelopes);
  }

  /**
   * Delete a specific envelope (for testing/cleanup)
   */
  static deleteEnvelope(workOrderId: string): boolean {
    return this.envelopes.delete(workOrderId);
  }
}
