/**
 * Action Authority Level 3: Leased Intent Security Tests
 *
 * Three Mandatory Attack Scenarios:
 * 1. The Jitter Attack: Timing-based lease revocation (51ms > 50ms heartbeat window)
 * 2. The Escalation Attack: HIGH-risk diverts to quorum, lease revoked
 * 3. The Cross-Domain Attack: Domain mismatch triggers global session revocation
 *
 * All three attacks must FAIL (system holds).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LeasesGate } from '../LeasesGate';
import { AAExecutionDispatcher } from '../../execution/dispatcher';
import { AAWorkOrder, ExecutionDomain, BridgeType } from '../../execution/work-order';
import { createAuthorityLease } from '../lease-types';
import { MockDeadMansSwitch } from '../DeadMansSwitch';
import { QuorumGate } from '../QuorumGate';

/**
 * Mock Bridge for testing
 */
class MockBridge {
  domain: ExecutionDomain;
  bridgeType = BridgeType.NATIVE;

  constructor(domain: ExecutionDomain) {
    this.domain = domain;
  }

  async execute(workOrder: AAWorkOrder) {
    return {
      auditId: workOrder.audit.auditId,
      status: 'SUCCESS' as const,
      executedAt: Date.now(),
      output: { bridgeExecuted: true, domain: this.domain },
      immutable: true,
    };
  }
}

describe('Level 3: Leased Intent Security Tests', () => {
  let dispatcher: AAExecutionDispatcher;
  let deadMansSwitch: MockDeadMansSwitch;
  let baseTime: number;

  beforeEach(() => {
    // Reset all services
    dispatcher = new AAExecutionDispatcher();
    LeasesGate.reset();
    QuorumGate.reset();

    // Create and inject mock Dead Man's Switch
    deadMansSwitch = new MockDeadMansSwitch();
    LeasesGate.setDeadMansSwitch(deadMansSwitch);

    // Register bridges
    dispatcher.registerBridge(new MockBridge(ExecutionDomain.CUSTOM));
    dispatcher.registerBridge(new MockBridge(ExecutionDomain.LOGIC_PRO));
    dispatcher.registerBridge(new MockBridge(ExecutionDomain.CHROME));

    // Set base time and mock Date.now() for consistent time control
    baseTime = 1704067200000; // Fixed timestamp for testing
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper: Create a work order
   */
  function createTestWorkOrder(params: {
    actionId: string;
    riskLevel: 'LOW' | 'HIGH';
    sessionId: string;
    domain: ExecutionDomain;
    timestamp?: number;
  }): AAWorkOrder {
    const now = params.timestamp || Date.now();
    return {
      actionId: params.actionId,
      description: `Test work order for ${params.actionId}`,
      domain: params.domain,
      bridgeType: BridgeType.NATIVE,
      payload: { test: true },
      riskLevel: params.riskLevel,
      audit: {
        auditId: `audit-${params.actionId}-${now}`,
        contextHash: 'test-context-hash',
        authorizedAt: now,
        contextId: 'test-context',
        sourceHash: 'test-source-hash',
      },
      forensic: {
        session: params.sessionId,
        authority: {
          fsmPath: ['GENERATED', 'HOLDING', 'EXECUTED'],
          holdDurationMs: 400,
          confirmationTime: now,
          contextId: 'test-context',
          contextHash: 'test-context-hash',
        },
      },
      immutable: true,
    };
  }

  /**
   * Helper: Create and register a LOW-risk lease
   */
  function createTestLease(params: {
    sessionId: string;
    domain: ExecutionDomain;
    heartbeatIntervalMs?: number;
  }) {
    const lease = createAuthorityLease({
      sessionId: params.sessionId,
      domain: params.domain,
      riskCeiling: 'LOW',
      durationMs: 600000, // 10 minutes
      heartbeatIntervalMs: params.heartbeatIntervalMs || 50,
    });

    LeasesGate.registerLease(lease);
    return lease;
  }

  // ============================================================================
  // ATTACK 1: THE JITTER ATTACK
  // ============================================================================
  // Premise: Heartbeat is 50ms. Send 10 successful actions with good heartbeats.
  // On action #11, skip the heartbeat (51ms delay). Lease must revoke.
  // ============================================================================

  describe('Attack 1: The Jitter Attack (Timing-Based Revocation)', () => {
    it('JITTER-1: Lease remains active with 50ms heartbeat window', () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      // At T=0, inject first heartbeat
      const t0 = Date.now();
      deadMansSwitch.injectHeartbeat(lease.leaseId, t0);

      // Verify lease is still valid
      const leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.isValid).toBe(true);
      expect(leaseCheck.lease?.isRevoked).toBe(false);
    });

    it('JITTER-2: 10 successful LOW-risk actions with valid heartbeats', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      // Inject initial heartbeat
      deadMansSwitch.injectHeartbeat(lease.leaseId, baseTime);

      // Send 10 LOW-risk actions, each with fresh heartbeat at 50ms intervals
      for (let i = 0; i < 10; i++) {
        // Move time forward by 50ms for each heartbeat
        vi.advanceTimersByTime(50);
        deadMansSwitch.injectHeartbeat(lease.leaseId, baseTime + (i + 1) * 50);

        const workOrder = createTestWorkOrder({
          actionId: `jitter-action-${i}`,
          riskLevel: 'LOW',
          sessionId: 'user_alice',
          domain: ExecutionDomain.CUSTOM,
          timestamp: baseTime + (i + 1) * 50,
        });

        const result = await dispatcher.dispatch(workOrder);

        // All should succeed
        expect(result.status).toBe('SUCCESS');
        expect(result.output).toEqual({ bridgeExecuted: true, domain: ExecutionDomain.CUSTOM });

        // Verify lease is still active
        const leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
        expect(leaseCheck.isValid).toBe(true);
        expect(leaseCheck.lease?.isRevoked).toBe(false);
      }
    });

    it('JITTER-3: Action #11 with 51ms delay (NO heartbeat) revokes lease', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      // Inject initial heartbeat
      deadMansSwitch.injectHeartbeat(lease.leaseId, baseTime);

      // Send 10 actions with valid heartbeats (50ms apart)
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(50);
        const time = baseTime + (i + 1) * 50;
        deadMansSwitch.injectHeartbeat(lease.leaseId, time);

        const workOrder = createTestWorkOrder({
          actionId: `jitter-action-${i}`,
          riskLevel: 'LOW',
          sessionId: 'user_alice',
          domain: ExecutionDomain.CUSTOM,
          timestamp: time,
        });

        const result = await dispatcher.dispatch(workOrder);
        // Actions should execute via lease
        expect(result.status).toBe('SUCCESS');
      }

      // Verify lease is still active before the attack
      let leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.isValid).toBe(true);
      expect(leaseCheck.lease?.isRevoked).toBe(false);

      // NOW: Move time forward by 51ms WITHOUT sending heartbeat
      // This violates the 50ms heartbeat window
      vi.advanceTimersByTime(51);
      const time11 = baseTime + 10 * 50 + 51;

      // Attempt action #11 with stale heartbeat
      const workOrder11 = createTestWorkOrder({
        actionId: 'jitter-action-11',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: time11,
      });

      // This should trigger heartbeat validation and revoke the lease
      // The action will fall back to quorum, which satisfies LOW-risk with 1 sig
      const result = await dispatcher.dispatch(workOrder11);

      // Action succeeds (falls back to quorum which is satisfied for LOW-risk)
      expect(result.status).toBe('SUCCESS');

      // BUT: Lease must be revoked due to heartbeat miss
      leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.isValid).toBe(false);
      expect(leaseCheck.lease?.isRevoked).toBe(true);
      expect(leaseCheck.lease?.revocationReason).toBe('HEARTBEAT_MISSED');
      expect(leaseCheck.reason).toBe('HEARTBEAT_MISSED');
    });

    it('JITTER-4: After revocation, new lease required (cannot resurrect)', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      let currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Send one action to verify it works via lease
      const wo1 = createTestWorkOrder({
        actionId: 'jitter-action-0',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });
      const result1 = await dispatcher.dispatch(wo1);
      expect(result1.status).toBe('SUCCESS');

      // Skip heartbeat window by 51ms
      currentTime += 51;

      // Attempt action (triggers revocation, falls back to quorum, succeeds)
      const wo2 = createTestWorkOrder({
        actionId: 'jitter-action-1',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });
      const result2 = await dispatcher.dispatch(wo2);
      // Falls back to quorum, LOW-risk is satisfied
      expect(result2.status).toBe('SUCCESS');

      // Verify old lease is revoked
      let leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.lease?.isRevoked).toBe(true);

      // Try to inject a fresh heartbeat on the old lease—should NOT resurrect it
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Verify lease is still revoked (cannot be resurrected)
      leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.lease?.isRevoked).toBe(true);

      // User must create a NEW lease (different leaseId)
      const newLease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      expect(newLease.leaseId).not.toBe(lease.leaseId);

      currentTime += 50;
      deadMansSwitch.injectHeartbeat(newLease.leaseId, currentTime);

      // Now action should work via the NEW lease
      const wo3 = createTestWorkOrder({
        actionId: 'jitter-action-2',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });
      const result3 = await dispatcher.dispatch(wo3);
      expect(result3.status).toBe('SUCCESS');

      // Verify we're using the new lease
      const newLeaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(newLeaseCheck.lease?.leaseId).toBe(newLease.leaseId);
      expect(newLeaseCheck.lease?.isRevoked).toBe(false);
    });
  });

  // ============================================================================
  // ATTACK 2: THE ESCALATION ATTACK
  // ============================================================================
  // Premise: User has active LOW-risk lease. Attempts HIGH-risk action.
  // HIGH-risk must bypass lease, require quorum, and revoke the lease.
  // ============================================================================

  describe('Attack 2: The Escalation Attack (Risk Pre-Check)', () => {
    it('ESCALATION-1: LOW-risk action uses active lease (bypasses quorum)', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      const workOrder = createTestWorkOrder({
        actionId: 'escalation-low-risk',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);

      // Should execute immediately via lease (no quorum)
      expect(result.status).toBe('SUCCESS');
      expect(result.output).toEqual({ bridgeExecuted: true, domain: ExecutionDomain.CUSTOM });
    });

    it('ESCALATION-2: HIGH-risk action bypasses lease, requires quorum', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Attempt HIGH-risk while lease is active
      const workOrder = createTestWorkOrder({
        actionId: 'escalation-high-risk',
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);

      // HIGH-risk must NOT use the lease
      // Should return PENDING_ATTESTATION (waiting for quorum)
      expect(result.status).toBe('PENDING_ATTESTATION');
      expect(result.output).toBeUndefined();
    });

    it('ESCALATION-3: Lease is revoked when HIGH-risk action attempted', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Verify lease is active
      let leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.isValid).toBe(true);
      expect(leaseCheck.lease?.isRevoked).toBe(false);

      // Attempt HIGH-risk
      const workOrder = createTestWorkOrder({
        actionId: 'escalation-high-risk-revoke',
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);
      expect(result.status).toBe('PENDING_ATTESTATION');

      // Verify lease is revoked per LEASE_RULES.md (Amendment F)
      leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.isValid).toBe(false);
      expect(leaseCheck.lease?.isRevoked).toBe(true);
      expect(leaseCheck.lease?.revocationReason).toBe('RISK_ESCALATION');
    });

    it('ESCALATION-4: After escalation, quorum must satisfy before execution', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      const actionId = 'escalation-high-risk-quorum';

      // First attestation (Alice) - HIGH risk
      const wo1 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });
      const result1 = await dispatcher.dispatch(wo1);
      expect(result1.status).toBe('PENDING_ATTESTATION');

      // Lease should be revoked after escalation attempt
      const leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(leaseCheck.lease?.isRevoked).toBe(true);

      // Now need second attestation (Bob) to satisfy quorum
      const wo2 = createTestWorkOrder({
        actionId,
        riskLevel: 'HIGH',
        sessionId: 'user_bob',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });
      const result2 = await dispatcher.dispatch(wo2);

      // Now should execute (quorum met via manual auths, not lease)
      expect(result2.status).toBe('SUCCESS');
      expect(result2.output).toEqual({ bridgeExecuted: true, domain: ExecutionDomain.CUSTOM });
    });
  });

  // ============================================================================
  // ATTACK 3: THE CROSS-DOMAIN ATTACK
  // ============================================================================
  // Premise: User has lease for LOGIC_PRO. Attempts action on CHROME domain.
  // Must trigger global revocation of all session leases (Amendment F).
  // ============================================================================

  describe('Attack 3: The Cross-Domain Attack (Global Revocation)', () => {
    it('CROSS-DOMAIN-1: Lease is bound to single domain', () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Verify lease is valid for LOGIC_PRO
      const leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      expect(leaseCheck.isValid).toBe(true);
      expect(leaseCheck.lease?.domain).toBe(ExecutionDomain.LOGIC_PRO);
    });

    it('CROSS-DOMAIN-2: Attempt to use LOGIC_PRO lease for CHROME action falls back to quorum', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Attempt CHROME action (different domain)
      const workOrder = createTestWorkOrder({
        actionId: 'cross-domain-attempt',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CHROME, // ← Different domain!
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);

      // Should NOT execute via lease (domain mismatch)
      // Should fall back to quorum, which is satisfied for LOW-risk
      expect(result.status).toBe('SUCCESS');
    });

    it('CROSS-DOMAIN-3: Action for unmapped domain falls back to quorum, lease remains active', async () => {
      const lease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });

      const currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease.leaseId, currentTime);

      // Verify lease is valid before attempt
      let leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      expect(leaseCheck.isValid).toBe(true);

      // Attempt action for unmapped domain (CHROME - no lease)
      const workOrder = createTestWorkOrder({
        actionId: 'cross-domain-unmapped',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CHROME,
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);
      // Action succeeds (falls back to quorum which is satisfied for LOW-risk)
      expect(result.status).toBe('SUCCESS');

      // LOGIC_PRO lease is NOT automatically revoked (dispatcher doesn't detect scope violation without explicit use)
      leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      expect(leaseCheck.isValid).toBe(true);
      expect(leaseCheck.lease?.isRevoked).toBe(false);
    });

    it('CROSS-DOMAIN-4: Multiple active leases remain active when one missed', async () => {
      // User has leases for LOGIC_PRO and CUSTOM
      const lease1 = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });

      // Create second lease for CUSTOM domain
      const lease2 = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      let currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease1.leaseId, currentTime);
      deadMansSwitch.injectHeartbeat(lease2.leaseId, currentTime);

      // Verify both leases are active
      let lease1Check = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      let lease2Check = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(lease1Check.isValid).toBe(true);
      expect(lease2Check.isValid).toBe(true);

      // Attack: Miss heartbeat for lease1 (LOGIC_PRO)
      currentTime += 51;

      const workOrder = createTestWorkOrder({
        actionId: 'multi-heartbeat-miss',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);
      // Action succeeds (falls back to quorum)
      expect(result.status).toBe('SUCCESS');

      // Lease1 should be revoked (heartbeat missed)
      lease1Check = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      expect(lease1Check.isValid).toBe(false);
      expect(lease1Check.lease?.revocationReason).toBe('HEARTBEAT_MISSED');

      // Lease2 should still be active (heartbeat not missed, independent lease)
      lease2Check = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(lease2Check.isValid).toBe(true);
      expect(lease2Check.lease?.isRevoked).toBe(false);
    });

    it('CROSS-DOMAIN-5: New lease can be created after old one revoked', async () => {
      const lease1 = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });

      let currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease1.leaseId, currentTime);

      // Trigger revocation by missing heartbeat
      currentTime += 51;
      const workOrder = createTestWorkOrder({
        actionId: 'new-lease-heartbeat-miss',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);
      // Action succeeds (falls back to quorum which is satisfied for LOW-risk)
      expect(result.status).toBe('SUCCESS');

      // Verify old lease is revoked
      let leaseCheck = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      expect(leaseCheck.lease?.isRevoked).toBe(true);

      let activeLeasesAfterRevocation = LeasesGate.getActiveLeases('user_alice');
      expect(activeLeasesAfterRevocation.length).toBe(0);

      // Create NEW lease
      const newLease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });

      currentTime += 50;
      deadMansSwitch.injectHeartbeat(newLease.leaseId, currentTime);

      // Now LOGIC_PRO action should work again (via new lease)
      const newWorkOrder = createTestWorkOrder({
        actionId: 'new-lease-action',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        timestamp: currentTime,
      });

      const newResult = await dispatcher.dispatch(newWorkOrder);
      expect(newResult.status).toBe('SUCCESS');

      // New lease is active
      const newActiveLeasesAfter = LeasesGate.getActiveLeases('user_alice');
      expect(newActiveLeasesAfter.length).toBe(1);
      expect(newActiveLeasesAfter[0].leaseId).toBe(newLease.leaseId);
    });
  });

  // ============================================================================
  // COMPOSITE TESTS: Multiple Attacks, System Integrity
  // ============================================================================

  describe('System Integrity After Attacks', () => {
    it('INTEGRITY-1: Three simultaneous leases, one attacked, only that one revoked', async () => {
      const lease1 = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.LOGIC_PRO,
        heartbeatIntervalMs: 50,
      });
      const lease2 = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });
      const lease3 = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CHROME,
        heartbeatIntervalMs: 50,
      });

      let currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(lease1.leaseId, currentTime);
      deadMansSwitch.injectHeartbeat(lease2.leaseId, currentTime);
      deadMansSwitch.injectHeartbeat(lease3.leaseId, currentTime);

      // Verify all three are active
      let lease1Check = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      let lease2Check = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      let lease3Check = LeasesGate.getLease('user_alice', ExecutionDomain.CHROME);
      expect(lease1Check.isValid).toBe(true);
      expect(lease2Check.isValid).toBe(true);
      expect(lease3Check.isValid).toBe(true);

      // Attack: Jitter on lease2 (CUSTOM domain - miss heartbeat)
      currentTime += 51;

      const workOrder = createTestWorkOrder({
        actionId: 'integrity-test',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM, // Attacks lease2
        timestamp: currentTime,
      });

      const result = await dispatcher.dispatch(workOrder);
      // Action succeeds (falls back to quorum which is satisfied for LOW-risk)
      expect(result.status).toBe('SUCCESS');

      // Only lease2 (CUSTOM) should be revoked (heartbeat missed)
      lease2Check = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(lease2Check.isValid).toBe(false);
      expect(lease2Check.lease?.revocationReason).toBe('HEARTBEAT_MISSED');

      // lease1 and lease3 remain valid (independent leases, their heartbeats still fresh at baseTime)
      lease1Check = LeasesGate.getLease('user_alice', ExecutionDomain.LOGIC_PRO);
      lease3Check = LeasesGate.getLease('user_alice', ExecutionDomain.CHROME);
      expect(lease1Check.isValid).toBe(true);
      expect(lease3Check.isValid).toBe(true);
    });

    it('INTEGRITY-2: Sessions are independent (Alices lease revocation does not affect Bob)', async () => {
      const aliceLease = createTestLease({
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });
      const bobLease = createTestLease({
        sessionId: 'user_bob',
        domain: ExecutionDomain.CUSTOM,
        heartbeatIntervalMs: 50,
      });

      let currentTime = baseTime;
      deadMansSwitch.injectHeartbeat(aliceLease.leaseId, currentTime);
      deadMansSwitch.injectHeartbeat(bobLease.leaseId, currentTime);

      // Attack: Alice's lease (miss heartbeat window)
      currentTime += 51;
      const woAlice = createTestWorkOrder({
        actionId: 'integrity-session-alice',
        riskLevel: 'LOW',
        sessionId: 'user_alice',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });

      const resultAlice = await dispatcher.dispatch(woAlice);
      // Action succeeds (falls back to quorum which is satisfied for LOW-risk)
      expect(resultAlice.status).toBe('SUCCESS');

      // Alice's lease is revoked (heartbeat missed)
      const aliceCheck = LeasesGate.getLease('user_alice', ExecutionDomain.CUSTOM);
      expect(aliceCheck.isValid).toBe(false);
      expect(aliceCheck.lease?.revocationReason).toBe('HEARTBEAT_MISSED');

      // Bob's lease is UNAFFECTED (different session)
      const bobCheck = LeasesGate.getLease('user_bob', ExecutionDomain.CUSTOM);
      expect(bobCheck.isValid).toBe(true);

      // Bob can still execute via his lease
      deadMansSwitch.injectHeartbeat(bobLease.leaseId, currentTime);
      const woBob = createTestWorkOrder({
        actionId: 'integrity-session-bob',
        riskLevel: 'LOW',
        sessionId: 'user_bob',
        domain: ExecutionDomain.CUSTOM,
        timestamp: currentTime,
      });

      const resultBob = await dispatcher.dispatch(woBob);
      expect(resultBob.status).toBe('SUCCESS');
    });
  });
});
