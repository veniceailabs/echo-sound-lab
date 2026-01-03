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

import { ExecutionPayload, ExecutionResult } from '../types/execution-contract';
import { AppleScriptActuator } from './AppleScriptActuator';
import { ProposalMapper } from './logic/LogicTemplates';
import { policyEngine } from './policy/PolicyEngine';
import { forensicLogger } from './ForensicLogger';
import { MerkleAuditLog } from '../action-authority/audit/MerkleAuditLog';

class ExecutionService {
  private static instance: ExecutionService;
  private isProcessing: boolean = false;
  private merkleAuditLog: MerkleAuditLog;

  // Toggle this to FALSE to run real commands against Logic Pro
  // Keep TRUE for development/testing
  private SIMULATION_MODE: boolean = true;

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
      this.validateSeal(payload.aaContext);

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
  private validateSeal(context: any): void {
    if (!context.sourceHash) throw new Error('INVALID_SEAL: Missing Source Hash');
    if (!context.contextId) throw new Error('INVALID_SEAL: Missing Context ID');
    if (!context.timestamp) throw new Error('INVALID_SEAL: Missing Timestamp');
    // TODO: Cryptographic signature verification
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
}

export const executionService = ExecutionService.getInstance();
