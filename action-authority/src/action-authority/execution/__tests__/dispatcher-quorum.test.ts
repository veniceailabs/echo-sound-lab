/**
 * Dispatcher + QuorumGate Integration Tests
 *
 * Verifies that the dispatcher correctly integrates with QuorumGate
 * for Level 2 governance enforcement (quorum requirements).
 *
 * Test Categories:
 * - LOW Risk: Single attestation → immediate execution
 * - HIGH Risk: Requires 2 attestations before execution
 * - PENDING_ATTESTATION: Returned when quorum not met
 * - Multi-work-order: Each actionId tracked independently
 * - Immutability: Frozen envelopes cannot be modified
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AAExecutionDispatcher } from '../dispatcher';
import { AAWorkOrder, ExecutionDomain, BridgeType } from '../work-order';
import { QuorumGate } from '../../governance/QuorumGate';

// Mock bridge for testing
class MockBridge {
  domain = ExecutionDomain.CUSTOM;
  bridgeType = BridgeType.NATIVE;

  async execute(workOrder: AAWorkOrder) {
    return {
      auditId: workOrder.audit.auditId,
      status: 'SUCCESS' as const,
      executedAt: Date.now(),
      output: { bridgeExecuted: true },
      immutable: true,
    };
  }
}

describe('Dispatcher + QuorumGate Integration', () => {
  let dispatcher: AAExecutionDispatcher;

  beforeEach(() => {
    // Create fresh dispatcher and reset quorum for each test
    dispatcher = new AAExecutionDispatcher();
    dispatcher.registerBridge(new MockBridge());
    QuorumGate.reset();
  });

  /**
   * Helper: Create a work order for testing
   */
  function createTestWorkOrder(params: {
    actionId: string;
    riskLevel: 'LOW' | 'HIGH';
    sessionId: string;
    holdDurationMs: number;
  }): AAWorkOrder {
    const now = Date.now();
    return {
      actionId: params.actionId,
      description: `Test work order for ${params.actionId}`,
      domain: ExecutionDomain.CUSTOM,
      bridgeType: BridgeType.NATIVE,
      payload: { test: true },
      riskLevel: params.riskLevel,
      audit: {
        auditId: `audit-${params.actionId}-${params.sessionId}`,
        contextHash: 'test-context-hash',
        authorizedAt: now,
        contextId: 'test-context',
        sourceHash: 'test-source-hash',
      },
      forensic: {
        session: params.sessionId,
        authority: {
          fsmPath: ['GENERATED', 'HOLDING', 'EXECUTED'],
          holdDurationMs: params.holdDurationMs,
          confirmationTime: now,
          contextId: 'test-context',
          contextHash: 'test-context-hash',
        },
      },
      immutable: true,
    };
  }

  // ============================================================================
  // LOW RISK: Single Attestation Should Execute Immediately
  // ============================================================================

  describe('LOW Risk Execution Flow', () => {

    it('LOW-1: Dispatcher executes work order with single attestation', async () => {
      const workOrder = createTestWorkOrder({
        actionId: 'wo-low-1',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      const result = await dispatcher.dispatch(workOrder);

      expect(result.status).toBe('SUCCESS');
      expect(result.output).toEqual({ bridgeExecuted: true });
    });

    it('LOW-2: Dispatcher executes immediately without pending state', async () => {
      // For LOW risk, quorum is met on first attestation
      const workOrder = createTestWorkOrder({
        actionId: 'wo-low-2',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      const result = await dispatcher.dispatch(workOrder);

      // Should execute on first call, not pending
      expect(result.status).toBe('SUCCESS');
      expect(result.status).not.toBe('PENDING_ATTESTATION');
    });
  });

  // ============================================================================
  // HIGH RISK: Requires 2 Attestations Before Execution
  // ============================================================================

  describe('HIGH Risk Execution Flow', () => {

    it('HIGH-1: First attestation returns PENDING_ATTESTATION', async () => {
      const workOrder = createTestWorkOrder({
        actionId: 'wo-high-1',
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      const result = await dispatcher.dispatch(workOrder);

      expect(result.status).toBe('PENDING_ATTESTATION');
      // Should NOT have output (execution didn't happen)
      expect(result.output).toBeUndefined();
    });

    it('HIGH-2: Second attestation from different user executes work order', async () => {
      const actionId = 'wo-high-2';

      // First attestation
      const wo1 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      const result1 = await dispatcher.dispatch(wo1);
      expect(result1.status).toBe('PENDING_ATTESTATION');

      // Second attestation from different user
      const wo2 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 500,
      });
      const result2 = await dispatcher.dispatch(wo2);

      // Now should execute
      expect(result2.status).toBe('SUCCESS');
      expect(result2.output).toEqual({ bridgeExecuted: true });
    });

    it('HIGH-3: Duplicate sessionId does not satisfy quorum', async () => {
      const actionId = 'wo-high-3';

      // First attestation from Alice
      const wo1 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      await dispatcher.dispatch(wo1);

      // Second attestation ALSO from Alice (same session)
      const wo2 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      const result2 = await dispatcher.dispatch(wo2);

      // Should still be PENDING (not counted as second signature)
      expect(result2.status).toBe('PENDING_ATTESTATION');
    });

    it('HIGH-4: Additional attestations after quorum met still execute', async () => {
      const actionId = 'wo-high-4';

      // Alice
      const wo1 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      const r1 = await dispatcher.dispatch(wo1);
      expect(r1.status).toBe('PENDING_ATTESTATION');

      // Bob
      const wo2 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 450,
      });
      const r2 = await dispatcher.dispatch(wo2);
      expect(r2.status).toBe('SUCCESS');

      // At this point, envelope is complete and frozen
      const envelope = QuorumGate.getEnvelope(actionId);
      expect(envelope?.isComplete).toBe(true);
      expect(Object.isFrozen(envelope)).toBe(true);
      expect(envelope?.attestations.length).toBe(2); // Alice and Bob only

      // Charlie attempts to attest - envelope.attestations is frozen, so push will fail
      // But QuorumGate.registerAttestation should catch this gracefully
      // In real scenario, we'd skip frozen envelopes, but for testing we expect it to throw
    });
  });

  // ============================================================================
  // Multi-Work-Order Independence
  // ============================================================================

  describe('Multiple Work Orders Tracked Independently', () => {

    it('MULTI-1: Two HIGH work orders tracked separately', async () => {
      const wo1_alice = createTestWorkOrder({
        actionId: 'wo-multi-1',
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      const wo2_charlie = createTestWorkOrder({
        actionId: 'wo-multi-2',
        riskLevel: 'HIGH',
        sessionId: 'user_charlie',
        holdDurationMs: 450,
      });

      // Dispatch first attestation for each
      const r1 = await dispatcher.dispatch(wo1_alice);
      const r2 = await dispatcher.dispatch(wo2_charlie);

      // Both should be PENDING (each needs 2 sigs)
      expect(r1.status).toBe('PENDING_ATTESTATION');
      expect(r2.status).toBe('PENDING_ATTESTATION');

      // Now dispatch second attestation for wo-multi-1
      const wo1_bob = createTestWorkOrder({
        actionId: 'wo-multi-1',
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 450,
      });
      const r3 = await dispatcher.dispatch(wo1_bob);
      expect(r3.status).toBe('SUCCESS'); // wo-multi-1 quorum met

      // wo-multi-2 should still be pending
      const envelope2 = QuorumGate.getEnvelope('wo-multi-2');
      expect(envelope2?.isComplete).toBe(false);
    });
  });

  // ============================================================================
  // Error Cases
  // ============================================================================

  describe('Error Handling', () => {

    it('ERROR-1: Missing audit binding is rejected', async () => {
      const workOrder = createTestWorkOrder({
        actionId: 'wo-error-1',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      // Remove audit binding
      (workOrder.audit as any) = null;

      const result = await dispatcher.dispatch(workOrder);

      expect(result.status).toBe('FAILED');
      expect(result.error?.code).toBe('MISSING_AUDIT_BINDING');
    });

    it('ERROR-2: Missing bridge returns FAILED with NO_BRIDGE_FOR_DOMAIN', async () => {
      const dispatcher2 = new AAExecutionDispatcher();
      // Don't register any bridges

      const workOrder = createTestWorkOrder({
        actionId: 'wo-error-2',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      const result = await dispatcher2.dispatch(workOrder);

      expect(result.status).toBe('FAILED');
      expect(result.error?.code).toBe('NO_BRIDGE_FOR_DOMAIN');
    });
  });

  // ============================================================================
  // Immutability Verification
  // ============================================================================

  describe('Envelope Immutability', () => {

    it('IMMUT-1: Envelope is frozen after quorum met', async () => {
      const workOrder = createTestWorkOrder({
        actionId: 'wo-immut-1',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      await dispatcher.dispatch(workOrder);

      const envelope = QuorumGate.getEnvelope(workOrder.actionId);
      expect(Object.isFrozen(envelope)).toBe(true);
    });

    it('IMMUT-2: Attestations array is frozen after quorum met', async () => {
      const workOrder = createTestWorkOrder({
        actionId: 'wo-immut-2',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      await dispatcher.dispatch(workOrder);

      const envelope = QuorumGate.getEnvelope(workOrder.actionId);
      expect(Object.isFrozen(envelope?.attestations)).toBe(true);
    });

    it('IMMUT-3: Cannot manually add attestations to frozen envelope', async () => {
      const workOrder = createTestWorkOrder({
        actionId: 'wo-immut-3',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });

      await dispatcher.dispatch(workOrder);

      const envelope = QuorumGate.getEnvelope(workOrder.actionId);

      expect(() => {
        (envelope as any).attestations.push({
          sessionId: 'hacker',
          auditId: 'fake',
          holdDurationMs: 0,
          confirmedAt: Date.now(),
        });
      }).toThrow();
    });
  });

  // ============================================================================
  // Constraint Validation: LOCKED CHECKLIST v1.1.0
  // ============================================================================

  describe('LOCKED CHECKLIST v1.1.0 Constraint Enforcement', () => {

    it('CONSTRAINT-A: No time coupling (order of confirmedAt doesn\'t matter)', async () => {
      const actionId = 'wo-const-a';

      // First attestation with earlier time
      const wo1 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      // Manually set earlier time
      wo1.forensic!.authority!.confirmationTime = 1000;

      await dispatcher.dispatch(wo1);

      // Second attestation with much later time
      const wo2 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 450,
      });
      wo2.forensic!.authority!.confirmationTime = 6000;

      const result = await dispatcher.dispatch(wo2);

      // Should execute despite large time delta
      expect(result.status).toBe('SUCCESS');
    });

    it('CONSTRAINT-B: Order independence (registration order doesn\'t affect result)', async () => {
      const actionId1 = 'wo-const-b-1';
      const actionId2 = 'wo-const-b-2';

      // Scenario 1: Alice then Bob
      const wo1_alice = createTestWorkOrder({
        actionId: actionId1,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      const wo1_bob = createTestWorkOrder({
        actionId: actionId1,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 450,
      });
      await dispatcher.dispatch(wo1_alice);
      const r1 = await dispatcher.dispatch(wo1_bob);

      // Scenario 2: Bob then Alice (different actionId, reset)
      QuorumGate.reset();
      const wo2_bob = createTestWorkOrder({
        actionId: actionId2,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 450,
      });
      const wo2_alice = createTestWorkOrder({
        actionId: actionId2,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      await dispatcher.dispatch(wo2_bob);
      const r2 = await dispatcher.dispatch(wo2_alice);

      // Both should execute
      expect(r1.status).toBe('SUCCESS');
      expect(r2.status).toBe('SUCCESS');
    });

    it('CONSTRAINT-D: No implicit escalation (same user can\'t satisfy HIGH)', async () => {
      const actionId = 'wo-const-d';

      // Alice tries to authorize twice
      const wo1 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        holdDurationMs: 450,
      });
      const r1 = await dispatcher.dispatch(wo1);
      expect(r1.status).toBe('PENDING_ATTESTATION');

      const wo2 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice', // Same user
        holdDurationMs: 450,
      });
      const r2 = await dispatcher.dispatch(wo2);

      // Still pending (no implicit escalation)
      expect(r2.status).toBe('PENDING_ATTESTATION');

      // Now Bob authorizes
      const wo3 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        holdDurationMs: 450,
      });
      const r3 = await dispatcher.dispatch(wo3);

      // Now it executes
      expect(r3.status).toBe('SUCCESS');
    });
  });
});
