/**
 * EXECUTION SERVICE (Main Process)
 *
 * The Receiver. Listens for FSM verdicts and routes to Actuators.
 *
 * CAPABILITIES:
 * - Validates FSM Seals
 * - Prevents State Drift
 * - Calls Logic Pro (via AppleScriptActuator)
 */

import { ExecutionPayload, ExecutionResult, requiresAccGrantForAction } from '../types/execution-contract';
import { AppleScriptActuator } from './AppleScriptActuator';
import { ProposalMapper } from './logic/LogicTemplates';
import { policyEngine } from './policy/PolicyEngine';
import { forensicLogger } from './ForensicLogger';
import { MerkleAuditLog } from '../action-authority/audit/MerkleAuditLog';
import { executionSessionService } from './executionSessionService';
import { verifyExecutionPayloadSignature } from './executionSigning';
import { provenanceLedger } from './ProvenanceLedger';
import { AccessBlockReasonCode, securityLedger } from './SecurityLedger';

export class ExecutionTamperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionTamperError';
  }
}

export class ExecutionReplayError extends ExecutionTamperError {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionReplayError';
  }
}

export class ExecutionAccessDeniedError extends ExecutionTamperError {
  constructor(
    public readonly reasonCode: AccessBlockReasonCode,
    message: string
  ) {
    super(message);
    this.name = 'ExecutionAccessDeniedError';
  }
}

class ExecutionService {
  private static instance: ExecutionService;
  private isProcessing: boolean = false;
  private merkleAuditLog: MerkleAuditLog;
  private readonly maxSealAgeMs = 60_000;
  private consumedNonceKeys = new Set<string>();
  private accGrantUseCountByKey = new Map<string, number>();

  // Default to simulation in development, but allow production to execute the real Logic Pro path.
  private SIMULATION_MODE: boolean = (() => {
    if (typeof process !== 'undefined' && process.env.ESL_EXECUTION_SIMULATION != null) {
      return process.env.ESL_EXECUTION_SIMULATION !== '0';
    }
    if (typeof process !== 'undefined' && process.env.NODE_ENV) {
      return process.env.NODE_ENV !== 'production';
    }
    return true;
  })();

  private constructor() {
    // Initialize Merkle Audit Log for cryptographic proof of execution
    this.merkleAuditLog = new MerkleAuditLog('./audit-log.jsonl');
    console.log('[ExecutionService] Initialized (SIMULATION_MODE: ' + this.SIMULATION_MODE + ')');
    console.log('[ExecutionService] Merkle Audit Log enabled for Phase 5 compliance');
  }

  public static getInstance(): ExecutionService {
    if (!ExecutionService.instance) {
      ExecutionService.instance = new ExecutionService();
    }
    return ExecutionService.instance;
  }

  /**
   * The Entry Point. Called when FSM emits EXECUTED.
   */
  public async handleExecutionRequest(payload: ExecutionPayload): Promise<ExecutionResult> {
    console.log(`[ExecutionService] Processing Order: ${payload.proposalId}`);

    // LOG: Execution Attempt (Day 5 - The Seal)
    // PHASE 5: Dual-log to both forensic and Merkle ledgers
    forensicLogger.logAttempt(
      payload.proposalId,
      payload.actionType,
      payload.aaContext.sourceHash,
      payload.parameters
    );

    // Cryptographic append to Merkle chain
    this.merkleAuditLog.append('EXECUTION_ATTEMPT', {
      proposalId: payload.proposalId,
      actionType: payload.actionType,
      sourceHash: payload.aaContext.sourceHash,
      parameters: payload.parameters,
      timestamp: Date.now()
    });

    // 1. Thread Locking
    if (this.isProcessing) {
      const error = 'BUSY_LOCK';
      forensicLogger.logFailure(payload.proposalId, payload.actionType, error);

      // Merkle: Log execution rejection
      this.merkleAuditLog.append('EXECUTION_REJECTED', {
        proposalId: payload.proposalId,
        actionType: payload.actionType,
        reason: error,
        timestamp: Date.now()
      });

      return {
        success: false,
        workOrderId: '',
        timestamp: Date.now(),
        proposalId: payload.proposalId,
        error
      };
    }
    this.isProcessing = true;

    try {
      // 2. Security Check (FSM Seal Validation)
      await this.validateSeal(payload);

      // 2.5. POLICY ENGINE CHECK (The Conscience)
      // This is the final gatekeeper that prevents unsafe actions
      const policyResult = policyEngine.evaluate(payload);

      if (!policyResult.allowed) {
        console.error(`[ExecutionService] BLOCKED BY POLICY: ${policyResult.reason}`);

        // LOG: Policy Block (Day 5 - The Seal)
        forensicLogger.logPolicyBlock(
          payload.proposalId,
          payload.actionType,
          policyResult.policyName,
          policyResult.reason
        );

        // Merkle: Log policy violation
        this.merkleAuditLog.append('POLICY_VIOLATION_DETECTED', {
          proposalId: payload.proposalId,
          actionType: payload.actionType,
          policyName: policyResult.policyName,
          reason: policyResult.reason,
          timestamp: Date.now()
        });

        return {
          success: false,
          workOrderId: '',
          timestamp: Date.now(),
          proposalId: payload.proposalId,
          error: `POLICY_BLOCK: ${policyResult.reason}`
        };
      }

      // 3. Generate AppleScript from action type
      const scriptGenerator = ProposalMapper[payload.actionType];
      if (!scriptGenerator) {
        throw new Error(`UNKNOWN_ACTION_TYPE: ${payload.actionType}`);
      }
      const script = scriptGenerator(payload.parameters);
      if (!AppleScriptActuator.validateScript(script)) {
        throw new Error('UNSAFE_SCRIPT_REJECTED');
      }

      // 4. EXECUTE (The Crossing)
      let resultData = '';

      if (this.SIMULATION_MODE) {
        // SIMULATION: Print to console, don't execute
        console.log(`[SIMULATION] Would execute:\n${script}`);
        await this.mockDelay(500); // Mock latency
        resultData = 'SIMULATION_SUCCESS';
      } else {
        // REAL EXECUTION: Check Logic Pro is running
        console.log(`[ExecutionService] Checking if Logic Pro is running...`);
        const isReady = await AppleScriptActuator.isLogicRunning();
        if (!isReady) {
          throw new Error('LOGIC_PRO_NOT_RUNNING');
        }

        // Execute the AppleScript
        console.log(`[ExecutionService] Sending command to Logic Pro...`);
        resultData = await AppleScriptActuator.run(script);
        console.log(`[ExecutionService] Logic Pro responded: ${resultData}`);
      }

      // 5. State Drift Mitigation
      // TODO: Call invalidateContextAfterAPLExecution() here
      // This prevents stale context exploitation

      // 5.5 Provenance ledger append (append-only, signed actions only)
      provenanceLedger.appendFromExecutionPayload(payload, Date.now());

      const workOrderId = `WO-${Date.now()}`;

      // LOG: Execution Success (Day 5 - The Seal)
      forensicLogger.logSuccess(
        payload.proposalId,
        payload.actionType,
        this.SIMULATION_MODE,
        workOrderId
      );

      // Merkle: Log successful execution
      this.merkleAuditLog.append('EXECUTION_SUCCESS', {
        proposalId: payload.proposalId,
        actionType: payload.actionType,
        workOrderId: workOrderId,
        simulationMode: this.SIMULATION_MODE,
        resultData: resultData,
        timestamp: Date.now()
      });

      return {
        success: true,
        workOrderId,
        timestamp: Date.now(),
        proposalId: payload.proposalId
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      console.error('[ExecutionService] FAILURE:', error);

      // LOG: Execution Failure (Day 5 - The Seal)
      forensicLogger.logFailure(payload.proposalId, payload.actionType, errorMsg);

      // Merkle: Log execution failure
      this.merkleAuditLog.append('EXECUTION_FAILURE', {
        proposalId: payload.proposalId,
        actionType: payload.actionType,
        error: errorMsg,
        timestamp: Date.now()
      });

      return {
        success: false,
        workOrderId: '',
        timestamp: Date.now(),
        proposalId: payload.proposalId,
        error: errorMsg
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Validate FSM Seal (Security Context)
   */
  private async validateSeal(payload: ExecutionPayload): Promise<void> {
    const context = payload.aaContext;
    if (!context.sourceHash) throw new Error('INVALID_SEAL: Missing Source Hash');
    if (!context.contextId) throw new Error('INVALID_SEAL: Missing Context ID');
    if (!context.timestamp) throw new Error('INVALID_SEAL: Missing Timestamp');
    if (!context.sessionId) throw new ExecutionTamperError('INVALID_SEAL: Missing Session ID');
    if (!context.nonce) throw new ExecutionTamperError('INVALID_SEAL: Missing Nonce');
    if (context.signatureVersion !== 'hmac-sha256-v1') {
      throw new ExecutionTamperError('INVALID_SEAL: Unsupported signature version');
    }
    if (!context.signature) throw new ExecutionTamperError('INVALID_SEAL: Missing Signature');

    const ageMs = Math.abs(Date.now() - context.timestamp);
    if (ageMs > this.maxSealAgeMs) {
      throw new ExecutionTamperError(`INVALID_SEAL: Stale Signature (${ageMs}ms old)`);
    }

    const session = executionSessionService.getSessionById(context.sessionId);
    if (!session) {
      throw new ExecutionTamperError('INVALID_SEAL: Session not found or expired');
    }

    const isValid = await verifyExecutionPayloadSignature(payload, session.sessionSecret);

    if (!isValid) {
      throw new ExecutionTamperError('INVALID_SEAL: Signature verification failed');
    }

    this.validateAccGate(payload);

    const nonceKey = `${context.sessionId}:${context.nonce}`;
    if (this.consumedNonceKeys.has(nonceKey)) {
      throw new ExecutionReplayError('INVALID_SEAL: Replay detected (local nonce cache)');
    }

    const consumed = await executionSessionService.consumeNonce(context.sessionId, context.nonce);
    if (!consumed) {
      throw new ExecutionReplayError('INVALID_SEAL: Replay detected (nonce already consumed)');
    }

    this.consumedNonceKeys.add(nonceKey);
  }

  private validateAccGate(payload: ExecutionPayload): void {
    if (!requiresAccGrantForAction(payload.actionType)) {
      return;
    }

    const context = payload.aaContext;
    const capability = this.mapActionTypeToCapability(payload.actionType);
    const deny = (reasonCode: AccessBlockReasonCode, reason: string): never => {
      this.recordAccessBlock(payload, reasonCode, reason, capability, context.accGrant?.grantId);
      throw new ExecutionAccessDeniedError(reasonCode, `ACC_BLOCK[${reasonCode}] ${reason}`);
    };

    try {
      const grant = context.accGrant;
      if (!grant) {
        deny('MISSING_GRANT', 'ACC grant is required for high-risk action execution');
      }

      if (grant.capability !== capability || grant.scopeActionType !== payload.actionType) {
        deny('SCOPE_MISMATCH', 'ACC grant scope does not match requested execution action');
      }

      if (grant.expiresAt <= Date.now()) {
        deny('TTL_EXPIRED', 'ACC grant has expired');
      }

      const activeWorkspaceId = context.workspaceId || context.contextId;
      if (grant.workspaceId && grant.workspaceId !== activeWorkspaceId) {
        deny(
          'WORKSPACE_MISMATCH',
          `ACC grant is scoped to workspace ${grant.workspaceId}, but request was submitted from ${activeWorkspaceId}`
        );
      }

      const grantKey = `${context.sessionId}:${grant.grantId}`;
      const useCount = this.accGrantUseCountByKey.get(grantKey) || 0;
      const maxUses = grant.singleUse
        ? 1
        : (typeof grant.maxUses === 'number' && grant.maxUses > 0 ? grant.maxUses : Number.MAX_SAFE_INTEGER);

      if (useCount >= maxUses) {
        if (maxUses === 1) {
          deny('REPLAY_DETECTED', 'ACC grant replay detected (single-use grant already consumed)');
        }
        deny('MAX_USES_EXCEEDED', `ACC grant max uses exceeded (${maxUses})`);
      }

      this.accGrantUseCountByKey.set(grantKey, useCount + 1);
    } catch (error) {
      if (error instanceof ExecutionAccessDeniedError) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : 'Unknown ACC evaluation error';
      this.recordAccessBlock(payload, 'ACC_EVALUATION_ERROR', reason, capability, context.accGrant?.grantId);
      throw new ExecutionAccessDeniedError('ACC_EVALUATION_ERROR', `ACC_BLOCK[ACC_EVALUATION_ERROR] ${reason}`);
    }
  }

  private mapActionTypeToCapability(actionType: string): string {
    const upper = String(actionType || '').toUpperCase();
    if (upper.includes('EXPORT') || upper.includes('RENDER')) {
      return 'RENDER_EXPORT';
    }
    if (upper.includes('WRITE') || upper.includes('SAVE')) {
      return 'FILE_WRITE';
    }
    return 'PARAMETER_ADJUSTMENT';
  }

  private recordAccessBlock(
    payload: ExecutionPayload,
    reasonCode: AccessBlockReasonCode,
    reason: string,
    capability: string,
    grantId?: string
  ): void {
    const sessionId = payload.aaContext.sessionId;
    securityLedger.appendBlock({
      proposalId: payload.proposalId,
      actionType: payload.actionType,
      sessionId,
      reasonCode,
      reason,
      capability,
      grantId,
    });

    forensicLogger.logAccessBlock(payload.proposalId, payload.actionType, reason, reasonCode, {
      capability,
      sessionId,
      grantId,
    });

    this.merkleAuditLog.append('ACCESS_BLOCKED', {
      proposalId: payload.proposalId,
      actionType: payload.actionType,
      reasonCode,
      reason,
      capability,
      sessionId,
      grantId,
      timestamp: Date.now(),
    });
  }

  /**
   * Public strict validation hook for security tests and preflight checks.
   * Throws typed errors on tamper/replay failures.
   */
  public async validatePayloadOrThrow(payload: ExecutionPayload): Promise<void> {
    await this.validateSeal(payload);
  }

  /**
   * Mock delay (simulates osascript latency)
   */
  private mockDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Public: Toggle simulation mode for testing
   */
  public setSimulationMode(enabled: boolean): void {
    this.SIMULATION_MODE = enabled;
    console.log(`[ExecutionService] SIMULATION_MODE set to ${enabled}`);
  }

  /**
   * Public: Get current simulation mode state
   */
  public getSimulationMode(): boolean {
    return this.SIMULATION_MODE;
  }

  // Test helper: clear replay cache between isolated test cases.
  public resetSecurityStateForTest(): void {
    this.consumedNonceKeys.clear();
    this.accGrantUseCountByKey.clear();
  }
}

export const executionService = ExecutionService.getInstance();
