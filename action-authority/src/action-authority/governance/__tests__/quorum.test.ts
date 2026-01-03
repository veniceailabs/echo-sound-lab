/**
 * Action Authority Level 2: Quorum Gate Security Tests
 *
 * Test Categories (per LOCKED CHECKLIST v1.1.0):
 * - Unit: registerAttestation() logic for LOW/HIGH
 * - Integration: Envelope composition and state transitions
 * - Security: Amendment A-D constraints enforcement
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  QuorumGate,
  QuorumRegistrationResult,
} from '../QuorumGate';
import {
  RiskLevel,
  AuthorizationEnvelope,
  Attestation,
} from '../quorum-types';

describe('QuorumGate: Level 2 Governance Service', () => {

  beforeEach(() => {
    // Reset singleton state before each test
    QuorumGate.reset();
  });

  // ============================================================================
  // UNIT TESTS: LOW Risk (1 Signature Required)
  // ============================================================================

  describe('LOW Risk Quorum (1 signature required)', () => {

    it('UNIT-1: Should complete envelope with single attestation', () => {
      const workOrderId = 'wo-low-001';
      const riskLevel: RiskLevel = 'LOW';
      const attestation: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-v1-001',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        riskLevel,
        attestation
      );

      expect(result.status).toBe('QUORUM_MET');
      expect(result.envelope.isComplete).toBe(true);
      expect(result.envelope.attestations).toHaveLength(1);
      expect(result.envelope.requiredSignatures).toBe(1);
    });

    it('UNIT-2: Should return correct LOW envelope metadata', () => {
      const workOrderId = 'wo-low-002';
      const attestation: Attestation = {
        sessionId: 'user_bob',
        auditId: 'audit-v1-002',
        holdDurationMs: 500,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'LOW',
        attestation
      );

      expect(result.envelope.workOrderId).toBe(workOrderId);
      expect(result.envelope.riskLevel).toBe('LOW');
      expect(result.envelope.requiredSignatures).toBe(1);
      expect(result.envelope.sealedAt).toBeUndefined(); // Not sealed until later
    });
  });

  // ============================================================================
  // UNIT TESTS: HIGH Risk (2 Signatures Required)
  // ============================================================================

  describe('HIGH Risk Quorum (2 signatures required)', () => {

    it('UNIT-3: Should return PENDING with first attestation', () => {
      const workOrderId = 'wo-high-001';
      const riskLevel: RiskLevel = 'HIGH';
      const attestation1: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-v1-003',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        riskLevel,
        attestation1
      );

      expect(result.status).toBe('QUORUM_PENDING');
      expect(result.envelope.isComplete).toBe(false);
      expect(result.envelope.attestations).toHaveLength(1);
      expect(result.envelope.requiredSignatures).toBe(2);
      expect(result.missingSessionIds).toContain('user_bob'); // Example: waiting for second user
    });

    it('UNIT-4: Should complete HIGH envelope with second attestation', () => {
      const workOrderId = 'wo-high-002';

      // Register first attestation
      const attestation1: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-v1-004',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };
      QuorumGate.registerAttestation(workOrderId, 'HIGH', attestation1);

      // Register second attestation
      const attestation2: Attestation = {
        sessionId: 'user_bob',
        auditId: 'audit-v1-005',
        holdDurationMs: 500,
        confirmedAt: Date.now(),
      };
      const result = QuorumGate.registerAttestation(
        workOrderId,
        'HIGH',
        attestation2
      );

      expect(result.status).toBe('QUORUM_MET');
      expect(result.envelope.isComplete).toBe(true);
      expect(result.envelope.attestations).toHaveLength(2);
      expect(result.envelope.requiredSignatures).toBe(2);
      expect(result.missingSessionIds).toHaveLength(0);
    });
  });

  // ============================================================================
  // AMENDMENT A: No Time Coupling
  // Tests that quorum does NOT depend on wall-clock time between attestations
  // ============================================================================

  describe('Amendment A: No Time Coupling', () => {

    it('AMENDMENT-A-1: Should complete regardless of attestation time deltas', () => {
      const workOrderId = 'wo-amend-a-001';

      // First attestation at T0
      const attestation1: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-a-001',
        holdDurationMs: 450,
        confirmedAt: 1000,
      };
      QuorumGate.registerAttestation(workOrderId, 'HIGH', attestation1);

      // Second attestation at T0 + 5000ms (5 seconds later)
      const attestation2: Attestation = {
        sessionId: 'user_bob',
        auditId: 'audit-a-002',
        holdDurationMs: 450,
        confirmedAt: 6000, // 5 seconds later
      };
      const result = QuorumGate.registerAttestation(
        workOrderId,
        'HIGH',
        attestation2
      );

      // Should complete despite large time delta
      expect(result.status).toBe('QUORUM_MET');
      expect(result.envelope.isComplete).toBe(true);
    });

    it('AMENDMENT-A-2: Should complete with attestations in reverse chronological order', () => {
      const workOrderId = 'wo-amend-a-002';

      // Register "later" attestation first (higher confirmedAt)
      const attestation2: Attestation = {
        sessionId: 'user_bob',
        auditId: 'audit-a-003',
        holdDurationMs: 450,
        confirmedAt: 6000,
      };
      QuorumGate.registerAttestation(workOrderId, 'HIGH', attestation2);

      // Register "earlier" attestation second (lower confirmedAt)
      const attestation1: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-a-004',
        holdDurationMs: 450,
        confirmedAt: 1000,
      };
      const result = QuorumGate.registerAttestation(
        workOrderId,
        'HIGH',
        attestation1
      );

      // Should still complete despite reverse order
      expect(result.status).toBe('QUORUM_MET');
      expect(result.envelope.isComplete).toBe(true);
    });
  });

  // ============================================================================
  // AMENDMENT B: Order Independence
  // Tests that attestations processed in any order yield identical envelope state
  // ============================================================================

  describe('Amendment B: Order Independence', () => {

    it('AMENDMENT-B-1: Should produce identical envelopes regardless of registration order', () => {
      const workOrderId1 = 'wo-amend-b-001';
      const workOrderId2 = 'wo-amend-b-002';

      const attestation_alice: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-b-001',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const attestation_bob: Attestation = {
        sessionId: 'user_bob',
        auditId: 'audit-b-002',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      // Test 1: Alice then Bob
      QuorumGate.registerAttestation(workOrderId1, 'HIGH', attestation_alice);
      const result1 = QuorumGate.registerAttestation(
        workOrderId1,
        'HIGH',
        attestation_bob
      );

      // Test 2: Bob then Alice (different workOrderId, reset between)
      QuorumGate.reset();
      QuorumGate.registerAttestation(workOrderId2, 'HIGH', attestation_bob);
      const result2 = QuorumGate.registerAttestation(
        workOrderId2,
        'HIGH',
        attestation_alice
      );

      // Both should complete with same signature count
      expect(result1.envelope.isComplete).toBe(true);
      expect(result2.envelope.isComplete).toBe(true);
      expect(result1.envelope.attestations.length).toBe(
        result2.envelope.attestations.length
      );

      // Both envelopes should have same sessions (order doesn't matter)
      const sessions1 = result1.envelope.attestations
        .map((a) => a.sessionId)
        .sort();
      const sessions2 = result2.envelope.attestations
        .map((a) => a.sessionId)
        .sort();
      expect(sessions1).toEqual(sessions2);
    });
  });

  // ============================================================================
  // AMENDMENT C: Envelope Immutability
  // Tests that once AuthorizationEnvelope.isComplete = true, envelope is frozen
  // ============================================================================

  describe('Amendment C: Envelope Immutability', () => {

    it('AMENDMENT-C-1: Should freeze envelope once quorum is met', () => {
      const workOrderId = 'wo-amend-c-001';
      const attestation: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-c-001',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'LOW',
        attestation
      );

      // Envelope should be frozen
      expect(Object.isFrozen(result.envelope)).toBe(true);

      // Attempting to mutate should fail silently or throw in strict mode
      expect(() => {
        (result.envelope as any).isComplete = false;
      }).toThrow(); // In strict mode

      // Attestations array should also be frozen
      expect(Object.isFrozen(result.envelope.attestations)).toBe(true);
    });

    it('AMENDMENT-C-2: Should NOT set sealedAt in QuorumGate (dispatcher responsibility)', () => {
      const workOrderId = 'wo-amend-c-002';
      const attestation: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-c-002',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'LOW',
        attestation
      );

      // sealedAt should be undefined here; set only by dispatcher when committed to forensic log
      expect(result.envelope.sealedAt).toBeUndefined();
      // But envelope should be frozen
      expect(Object.isFrozen(result.envelope)).toBe(true);
    });
  });

  // ============================================================================
  // AMENDMENT D: No Implicit Escalation
  // Tests that HIGH risk requires explicit second attestation (no auto-upgrade)
  // ============================================================================

  describe('Amendment D: No Implicit Escalation', () => {

    it('AMENDMENT-D-1: Should NOT auto-escalate HIGH with multiple attestations from same session', () => {
      const workOrderId = 'wo-amend-d-001';

      const attestation1: Attestation = {
        sessionId: 'user_alice', // Same session
        auditId: 'audit-d-001',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      QuorumGate.registerAttestation(workOrderId, 'HIGH', attestation1);

      // Try to register a second attestation from SAME session
      const attestation2: Attestation = {
        sessionId: 'user_alice', // Same session again
        auditId: 'audit-d-002',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'HIGH',
        attestation2
      );

      // Should REJECT duplicate session, not count it as second signature
      expect(result.status).toBe('QUORUM_PENDING');
      expect(result.envelope.attestations).toHaveLength(1); // Only 1, not 2
    });

    it('AMENDMENT-D-2: Should require DIFFERENT sessions for HIGH risk quorum', () => {
      const workOrderId = 'wo-amend-d-002';

      const attestation_alice: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-d-003',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      QuorumGate.registerAttestation(workOrderId, 'HIGH', attestation_alice);

      // Register second attestation from DIFFERENT session
      const attestation_bob: Attestation = {
        sessionId: 'user_bob', // Different session
        auditId: 'audit-d-004',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'HIGH',
        attestation_bob
      );

      // Now it should complete
      expect(result.status).toBe('QUORUM_MET');
      expect(result.envelope.attestations).toHaveLength(2);
      expect(
        result.envelope.attestations.map((a) => a.sessionId)
      ).toEqual(['user_alice', 'user_bob']);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS: Dispatcher Scenarios
  // ============================================================================

  describe('Integration: Dispatcher Dispatch Scenarios', () => {

    it('INTEG-1: Dispatcher can query envelope status via getEnvelope()', () => {
      const workOrderId = 'wo-integ-001';
      const attestation: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-integ-001',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      QuorumGate.registerAttestation(workOrderId, 'LOW', attestation);

      const envelope = QuorumGate.getEnvelope(workOrderId);
      expect(envelope).toBeDefined();
      expect(envelope?.isComplete).toBe(true);
      expect(envelope?.workOrderId).toBe(workOrderId);
    });

    it('INTEG-2: Multiple work orders tracked independently', () => {
      const wo1 = 'wo-integ-002-a';
      const wo2 = 'wo-integ-002-b';

      const attestation1: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-integ-002',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      QuorumGate.registerAttestation(wo1, 'LOW', attestation1);

      const attestation2: Attestation = {
        sessionId: 'user_bob',
        auditId: 'audit-integ-003',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      QuorumGate.registerAttestation(wo2, 'HIGH', attestation2);

      // wo1 should be complete
      expect(QuorumGate.getEnvelope(wo1)?.isComplete).toBe(true);
      // wo2 should be pending
      expect(QuorumGate.getEnvelope(wo2)?.isComplete).toBe(false);
    });
  });

  // ============================================================================
  // CONSTRAINT ENFORCEMENT: No Bypasses
  // ============================================================================

  describe('Constraint Enforcement: No Bypasses', () => {

    it('ENFORCE-1: Cannot manually modify envelope after registration', () => {
      const workOrderId = 'wo-enforce-001';
      const attestation: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-enforce-001',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'LOW',
        attestation
      );

      // Attempt to modify isComplete
      expect(() => {
        (result.envelope as any).isComplete = false;
      }).toThrow();
    });

    it('ENFORCE-2: Cannot manually add attestations to envelope', () => {
      const workOrderId = 'wo-enforce-002';
      const attestation: Attestation = {
        sessionId: 'user_alice',
        auditId: 'audit-enforce-002',
        holdDurationMs: 450,
        confirmedAt: Date.now(),
      };

      const result = QuorumGate.registerAttestation(
        workOrderId,
        'LOW',
        attestation
      );

      // Attempt to push to attestations array
      expect(() => {
        result.envelope.attestations.push({
          sessionId: 'user_hacker',
          auditId: 'audit-hacker',
          holdDurationMs: 400,
          confirmedAt: Date.now(),
        });
      }).toThrow();
    });
  });
});
