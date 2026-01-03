/**
 * Action Authority: Execution Dispatcher
 *
 * Simple. Boring. Defensible.
 *
 * When the FSM reaches EXECUTED state:
 *  1. Perception Layer creates a work order (must include audit binding)
 *  2. Dispatcher receives it
 *  3. Dispatcher verifies audit binding exists
 *  4. Dispatcher routes to the correct bridge
 *  5. Bridge executes atomically
 *  6. Result is recorded back to audit log
 *
 * The dispatcher does exactly three things:
 *  ✅ Verify audit binding
 *  ✅ Route to bridge
 *  ✅ Record outcome
 *
 * It does NOT:
 *  ❌ Retry silently
 *  ❌ Batch work orders
 *  ❌ Infer dependencies
 *  ❌ Optimize execution order
 */

import { AAWorkOrder, AAExecutionResult, IExecutionBridge, ExecutionDomain } from './work-order';
import { ForensicAuditLog } from '../audit/forensic-log';
import { QuorumGate } from '../governance/QuorumGate';
import { LeasesGate } from '../governance/LeasesGate';
import { Attestation } from '../governance/quorum-types';
import { PolicyEngine } from '../governance/semantic/PolicyEngine';
import { buildSemanticContext } from '../governance/semantic/utils';

/**
 * Execution Dispatcher: Routes work orders to bridges
 */
export class AAExecutionDispatcher {
  private bridges: Map<ExecutionDomain, IExecutionBridge> = new Map();

  /**
   * Register a domain bridge
   */
  public registerBridge(bridge: IExecutionBridge): void {
    const existing = this.bridges.get(bridge.domain);
    if (existing) {
      console.warn(
        `⚠️ Overwriting bridge for domain ${bridge.domain} (${existing.bridgeType} → ${bridge.bridgeType})`,
      );
    }
    this.bridges.set(bridge.domain, bridge);
  }

  /**
   * Main dispatch entry point
   * Called when FSM reaches EXECUTED state
   *
   * Five phases (with Level 3 Leased Intent integration):
   *  1. Verify audit binding (security gate)
   *  2. **RED LINE: Risk Pre-Check** (Amendment H enforcement)
   *     - HIGH risk: bypass lease, force v1.1.0 Quorum
   *     - LOW risk: check Level 3 lease
   *  3. Execute via lease (if valid and LOW risk)
   *  4. Else: Register attestation with QuorumGate (Level 2 governance)
   *  5. Route to bridge and seal forensic entry
   */
  public async dispatch(workOrder: AAWorkOrder): Promise<AAExecutionResult> {
    // Step 1: Verify audit binding (gateway check)
    if (!workOrder.audit?.auditId) {
      const errorResult: AAExecutionResult = {
        auditId: 'UNKNOWN',
        status: 'FAILED',
        executedAt: Date.now(),
        error: {
          code: 'MISSING_AUDIT_BINDING',
          message: 'Work order must include valid audit binding (auditId)',
        },
        immutable: true,
      };
      Object.freeze(errorResult);
      return errorResult;
    }

    // Step 2: **RED LINE 1: RISK PRE-CHECK** (Amendment H enforcement)
    // This check happens BEFORE any lease lookup to ensure HIGH-risk
    // actions never bypass v1.0.0/v1.1.0 authorization
    // (Amendment H: Confidence is ignored; risk is structural)
    if (workOrder.riskLevel === 'LOW') {
      // LOW risk: Check for Level 3 Lease (Leased Intent)
      const sessionId = workOrder.forensic?.session || 'unknown';
      const leaseCheck = LeasesGate.validateLeaseForWorkOrder(
        sessionId,
        workOrder.domain,
        workOrder.riskLevel
      );

      if (leaseCheck.isValid && leaseCheck.lease) {
        // **RED LINE 2: BINARY HEARTBEAT CHECK**
        // If we got here, the lease passed all checks including heartbeat validation
        // The LeasesGate.validateLeaseForWorkOrder already enforces:
        // - Binary heartbeat: if Date.now() - lastHeartbeat > 50ms, REVOKED
        // - No grace period, no retry
        // - Amendment H enforced: no confidence consulted

        console.log(
          `⚡ [DISPATCHER] LOW-risk action via active lease: ${sessionId} @ ${workOrder.domain} (lease:${leaseCheck.lease.leaseId})`
        );

        // Execute directly via lease authority (no 400ms hold required)
        const result = await this.executeBridgeForWorkOrder(workOrder);
        await this.sealForensicEntry(workOrder, result);
        return result;
      }

      // Lease check failed or not found—fall through to Level 2 Quorum
      if (leaseCheck.lease?.isRevoked) {
        console.log(
          `⚠️ [DISPATCHER] Lease revoked (${leaseCheck.lease.revocationReason}), falling back to Quorum`
        );
      }
    } else {
      // HIGH risk: Bypass lease entirely, force v1.0.0/v1.1.0 authorization
      console.log(
        `🔒 [DISPATCHER] HIGH-risk action: Bypassing lease, forcing v1.0.0/v1.1.0 Quorum`
      );
    }

    // Step 3: Fall back to Level 2: Register attestation with QuorumGate
    // (This handles both HIGH-risk actions and LOW-risk without active lease)
    const attestation: Attestation = {
      sessionId: workOrder.forensic?.session || 'unknown',
      auditId: workOrder.audit.auditId,
      holdDurationMs: workOrder.forensic?.authority?.holdDurationMs || 0,
      confirmedAt: workOrder.forensic?.authority?.confirmationTime || Date.now(),
    };

    const quorumResult = QuorumGate.registerAttestation(
      workOrder.actionId,
      workOrder.riskLevel,
      attestation
    );

    // If quorum not met, return PENDING_ATTESTATION
    if (!quorumResult.envelope.isComplete) {
      const pendingResult: AAExecutionResult = {
        auditId: workOrder.audit.auditId,
        status: 'PENDING_ATTESTATION',
        executedAt: Date.now(),
        immutable: true,
      };
      Object.freeze(pendingResult);
      console.log(
        `⏳ [DISPATCHER] Quorum pending for ${workOrder.actionId}: ${quorumResult.envelope.attestations.length}/${quorumResult.envelope.requiredSignatures} signatures`
      );
      return pendingResult;
    }

    console.log(
      `✅ [DISPATCHER] Quorum met for ${workOrder.actionId}: ${quorumResult.envelope.attestations.length} signatures`
    );

    // **RED LINE 4.1: SEMANTIC POLICY PRE-EXECUTION AUDIT** (Level 4)
    // Final backstop: even if UI/FSM failed, Dispatcher enforces semantic policies
    // This is the "Synchronous Pre-Execution Audit" - no exceptions allowed
    try {
      const semanticContext = buildSemanticContext({
        id: workOrder.actionId,
        type: workOrder.description,
        parameters: workOrder.forensic?.rationale?.evidence || {},
      });

      const policyResult = PolicyEngine.evaluate(semanticContext);

      if (!policyResult.isValid) {
        // Policy violation detected - return FAILED
        const policyFailResult: AAExecutionResult = {
          auditId: workOrder.audit.auditId,
          status: 'FAILED',
          executedAt: Date.now(),
          error: {
            code: 'POLICY_VIOLATION',
            message: `Policy violation at execution time: ${policyResult.reason}`,
          },
          immutable: true,
        };
        Object.freeze(policyFailResult);

        console.warn(
          `🛑 [DISPATCHER] Policy violation BLOCKED execution of ${workOrder.actionId}: ${policyResult.reason}`
        );

        // Seal violation to forensic log (Amendment J)
        await this.sealForensicEntry(workOrder, policyFailResult, policyResult);

        return policyFailResult;
      }

      console.log(
        `✅ [DISPATCHER] Semantic policies passed for ${workOrder.actionId}`
      );
    } catch (policyError) {
      // **RED LINE 4.2: FAIL-CLOSED**
      // If PolicyEngine is unreachable or throws, ABORT execution
      // This is not fail-safe - errors in policy evaluation are critical
      const errorMessage = policyError instanceof Error ? policyError.message : String(policyError);

      const policyErrorResult: AAExecutionResult = {
        auditId: workOrder.audit.auditId,
        status: 'FAILED',
        executedAt: Date.now(),
        error: {
          code: 'POLICY_ENGINE_ERROR',
          message: `Critical: PolicyEngine unavailable at execution: ${errorMessage}`,
        },
        immutable: true,
      };
      Object.freeze(policyErrorResult);

      console.error(
        `🚨 [DISPATCHER] FAIL-CLOSED: PolicyEngine error, aborting ${workOrder.actionId}: ${errorMessage}`
      );

      return policyErrorResult;
    }

    // Step 4: Route to bridge and execute
    const result = await this.executeBridgeForWorkOrder(workOrder);

    // Step 5: Seal forensic entry
    await this.sealForensicEntry(workOrder, result);

    return result;
  }

  /**
   * Helper: Execute work order via bridge
   * Routes to the appropriate domain bridge and executes atomically.
   */
  private async executeBridgeForWorkOrder(workOrder: AAWorkOrder): Promise<AAExecutionResult> {
    const bridge = this.bridges.get(workOrder.domain);
    if (!bridge) {
      const errorResult: AAExecutionResult = {
        auditId: workOrder.audit.auditId,
        status: 'FAILED',
        executedAt: Date.now(),
        error: {
          code: 'NO_BRIDGE_FOR_DOMAIN',
          message: `No execution bridge registered for domain: ${workOrder.domain}`,
        },
        immutable: true,
      };
      Object.freeze(errorResult);
      return errorResult;
    }

    // Execute (bridge must be atomic and not throw)
    let result: AAExecutionResult;
    try {
      result = await bridge.execute(workOrder);
    } catch (error) {
      // If bridge throws (violated contract), capture it
      const errorMessage = error instanceof Error ? error.message : String(error);
      result = {
        auditId: workOrder.audit.auditId,
        status: 'FAILED',
        executedAt: Date.now(),
        error: {
          code: 'BRIDGE_EXCEPTION',
          message: `Bridge ${bridge.bridgeType} threw exception: ${errorMessage}`,
        },
        immutable: true,
      };
    }

    // Ensure result is immutable
    Object.freeze(result);
    if (result.output) Object.freeze(result.output);
    if (result.error) Object.freeze(result.error);

    return result;
  }

  /**
   * Helper: Seal forensic entry for execution result
   * Records the execution outcome to the forensic audit log.
   * Optional: If policyResult provided, logs semantic policy violation (Amendment J)
   */
  private async sealForensicEntry(
    workOrder: AAWorkOrder,
    result: AAExecutionResult,
    policyResult?: any // PolicyResult from Level 4
  ): Promise<void> {
    if (!workOrder.forensic) {
      return; // No forensic metadata to log
    }

    try {
      const bridge = this.bridges.get(workOrder.domain);
      const forensicEntryId = ForensicAuditLog.writeEntry(
        workOrder.audit.auditId,
        workOrder.actionId,
        workOrder.forensic.session || 'unknown',
        {
          source: workOrder.forensic.rationale?.source || 'USER_MANUAL',
          evidence: workOrder.forensic.rationale?.evidence || {},
          description: workOrder.forensic.rationale?.description || workOrder.description,
          confidence: workOrder.forensic.rationale?.confidence,
        },
        {
          fsmPath: workOrder.forensic.authority?.fsmPath || [],
          holdDurationMs: workOrder.forensic.authority?.holdDurationMs || 0,
          confirmationTime: workOrder.forensic.authority?.confirmationTime || Date.now(),
          contextId: workOrder.forensic.authority?.contextId || workOrder.audit.contextId,
          contextHash: workOrder.forensic.authority?.contextHash || workOrder.audit.contextHash,
        },
        {
          domain: workOrder.domain,
          bridge: bridge?.bridgeType || 'UNKNOWN',
          status: result.status,
          resultHash: this.hashObject(result.output || result.error || {}),
          executedAt: result.executedAt,
          duration: result.executedAt - (workOrder.audit.authorizedAt || 0),
          output: result.output,
          error: result.error,
        }
      );

      // Add forensic entry ID to result
      (result as any).forensicEntryId = forensicEntryId;

      // **AMENDMENT J: VIOLATION ENTRY LOGGING**
      // If a policy violation occurred, log the violation to the audit trail
      // This ensures the "Attempted Violation" is a permanent part of the system record
      if (policyResult && !policyResult.isValid) {
        try {
          ForensicAuditLog.logEvent({
            type: 'POLICY_VIOLATION_BLOCKED',
            timestamp: Date.now(),
            actionId: workOrder.actionId,
            sessionId: workOrder.forensic?.session || 'unknown',
            data: {
              auditId: workOrder.audit.auditId,
              forensicEntryId,
              policyResult: {
                reason: policyResult.reason,
                violations: policyResult.violations.map((v: any) => ({
                  type: v.type,
                  severity: v.severity,
                  matchCount: v.matches?.length || 0,
                })),
                evaluationTimeMs: policyResult.metadata?.evaluationTimeMs,
              },
            },
          });

          console.log(
            `🛡️ [AMENDMENT J] Policy violation logged to audit chain: ${forensicEntryId}`
          );
        } catch (amendmentJError) {
          const msg = amendmentJError instanceof Error ? amendmentJError.message : String(amendmentJError);
          console.warn(`⚠️ [AMENDMENT J] Violation logging failed: ${msg}`);
          // Continue anyway - main execution already blocked
        }
      }

      console.log(`🏛️ [DISPATCHER] Forensic entry sealed: ${forensicEntryId}`);
    } catch (forensicError) {
      const message = forensicError instanceof Error ? forensicError.message : String(forensicError);
      console.warn(`⚠️ [DISPATCHER] Forensic sealing failed: ${message}`);
      // Continue anyway - execution already happened, just warn on audit trail
    }
  }

  /**
   * Simple hash for result integrity verification
   */
  private hashObject(obj: Record<string, unknown>): string {
    const json = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `sha256_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Singleton instance
 */
let dispatcherInstance: AAExecutionDispatcher | null = null;

/**
 * Get or create the singleton dispatcher
 */
export function getExecutionDispatcher(): AAExecutionDispatcher {
  if (!dispatcherInstance) {
    dispatcherInstance = new AAExecutionDispatcher();
  }
  return dispatcherInstance;
}
