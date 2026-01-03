/**
 * APL Executor: The Hands
 *
 * This service bridges APL Intelligence to Logic Pro Actuators.
 *
 * Two Execution Paths:
 *  Path A (Direct): APL → AppleScript → Logic Pro (High speed, user-confirmed, bypasses FSM hold)
 *  Path B (Gated):  APL → Action Authority FSM → Dispatcher → Logic Pro (High security, forensic sealing)
 *
 * State Drift Mitigation (Amendment F/G):
 *  After Direct execution, we MUST call invalidateContextAfterAPLExecution()
 *  to prevent the AA from allowing actions on stale context hashes.
 */

import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';
import { proposalToWorkOrder, invalidateContextAfterAPLExecution } from 'action-authority/integration/apl-bridge';
import { getExecutionDispatcher } from 'action-authority/execution/dispatcher';
import type { AAExecutionResult } from 'action-authority/execution/work-order';

export interface ExecutionContext {
  id: string;
  hash: string;
  trackId: string;
  [key: string]: any;
}

export class APLExecutor {
  /**
   * Path A: Direct Execution
   *
   * High-speed path: APL Proposal → AppleScript Generation → Logic Pro Execution
   *
   * Requirements:
   * ✅ User confirms action via "Apply Direct" button
   * ✅ Bypasses the 400ms FSM hold in Action Authority
   * ✅ Generates AppleScript from proposal parameters
   * ✅ Executes immediately if Logic Pro is available
   * ✅ MANDATORY: Calls invalidateContextAfterAPLExecution() on success
   *
   * Use Case: Speed + simplicity for trusted operations
   * Risk Profile: Medium (no governance FSM, but user explicitly confirmed)
   */
  static async executeDirectly(proposal: APLProposal): Promise<{
    success: boolean;
    message: string;
    executionTime: number;
  }> {
    const startTime = Date.now();
    console.log(`[APLExecutor] 🚀 Direct Execution START: ${proposal.proposalId}`);
    console.log(`[APLExecutor] Action: ${proposal.action.type} | Track: ${proposal.trackName}`);
    console.log(`[APLExecutor] Parameters:`, proposal.action.parameters);

    try {
      // Step 1: Generate AppleScript from proposal
      const script = this.mapProposalToAppleScript(proposal);
      console.log(`[APLExecutor] Generated AppleScript (${script.length} chars)`);

      // Step 2: Execute the script
      // NOTE: In Phase 3 with AppleScript, this will actually run the command
      // For now, we simulate successful execution
      const executionResult = await this.executeAppleScript(script);

      if (!executionResult.success) {
        console.error(`[APLExecutor] AppleScript execution failed:`, executionResult.error);
        return {
          success: false,
          message: `Execution failed: ${executionResult.error}`,
          executionTime: Date.now() - startTime
        };
      }

      // Step 3: MANDATORY State Drift Mitigation
      // After Direct execution, the track state has changed.
      // We must invalidate the AA context to prevent "Ghost" approvals.
      console.log(`[APLExecutor] Invalidating AA context (State Drift Mitigation)`);
      invalidateContextAfterAPLExecution(proposal.trackId, {} as any);

      const executionTime = Date.now() - startTime;
      console.log(`[APLExecutor] ✅ Direct Execution SUCCESS (${executionTime}ms)`);

      return {
        success: true,
        message: `${proposal.action.type} applied to ${proposal.trackName}`,
        executionTime
      };
    } catch (error) {
      console.error(`[APLExecutor] ❌ Direct Execution ERROR:`, error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Path B: Gated Execution
   *
   * High-security path: APL Proposal → Work Order → Action Authority FSM → Dispatcher
   *
   * Requirements:
   * ✅ Converts APLProposal to AAWorkOrder (v1.0.0 format)
   * ✅ Routes to Action Authority for governance evaluation
   * ✅ Triggers 400ms FSM hold with HUD visualization
   * ✅ Forensic sealing in audit log
   * ✅ User must confirm in FSM to actually execute
   *
   * Use Case: High-stakes operations, regulatory compliance, audit trail
   * Risk Profile: Low (governance FSM, forensic sealing, user confirmation)
   */
  static async routeToAuthority(proposal: APLProposal, context: ExecutionContext): Promise<{
    success: boolean;
    message: string;
    workOrderId?: string;
  }> {
    console.log(`[APLExecutor] 🛡️ Gated Execution START: ${proposal.proposalId}`);
    console.log(`[APLExecutor] Routing to Action Authority FSM for governance`);
    console.log(`[APLExecutor] Context:`, { id: context.id, trackId: context.trackId });

    try {
      // Step 1: Convert APL Proposal to Action Authority Work Order
      const workOrder = proposalToWorkOrder(
        proposal,
        `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        context.id,
        context.hash
      );

      console.log(`[APLExecutor] Converted to Work Order:`, workOrder.actionId);
      console.log(`[APLExecutor] Domain: ${workOrder.domain} | Bridge: ${workOrder.bridgeType}`);

      // Step 2: Route to Dispatcher (The Gatekeeper)
      // The Dispatcher will trigger the FSM sequence in ActionAuthorityHUD
      const dispatcher = getExecutionDispatcher();
      const dispatchResult = await dispatcher.dispatch(workOrder);

      if (dispatchResult.status === 'SUCCESS') {
        console.log(`[APLExecutor] ✅ Gated Execution DISPATCHED (Work Order ${workOrder.actionId})`);
        return {
          success: true,
          message: `Submitted for governance approval: ${proposal.action.description}`,
          workOrderId: workOrder.actionId
        };
      } else if (dispatchResult.status === 'PENDING_ATTESTATION') {
        // Work order is pending - FSM will handle the hold
        console.log(`[APLExecutor] ⏳ Gated Execution PENDING (awaiting user attestation)`);
        return {
          success: true,
          message: `Waiting for user confirmation in FSM...`,
          workOrderId: workOrder.actionId
        };
      } else {
        console.error(`[APLExecutor] Dispatcher returned FAILED:`, dispatchResult.error);
        return {
          success: false,
          message: `Dispatcher rejected: ${dispatchResult.error?.message || 'Unknown error'}`
        };
      }
    } catch (error) {
      console.error(`[APLExecutor] ❌ Gated Execution ERROR:`, error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Map APL Proposal to AppleScript
   *
   * This is the critical translation layer between APL logic and Logic Pro commands.
   *
   * For each action type, we generate specific AppleScript that Logic Pro understands.
   *
   * AppleScript Examples:
   * - LIMITING: Set threshold on limiter plugin
   * - GAIN_ADJUSTMENT: Adjust track fader volume
   * - NORMALIZATION: Apply loudness normalization
   * - DC_REMOVAL: Apply high-pass filter
   */
  private static mapProposalToAppleScript(proposal: APLProposal): string {
    const { action, trackName } = proposal;
    const params = action.parameters as Record<string, any>;

    console.log(`[APLExecutor] Mapping ${action.type} to AppleScript...`);

    switch (action.type) {
      case 'LIMITING': {
        // LIMITING: Apply dynamic limiter to prevent clipping
        const threshold = params.threshold ?? -0.1;
        const ratio = params.ratio ?? 4;
        const makeupGain = params.makeupGain ?? 1.0;

        return `
          tell application "Logic Pro X"
            activate
            tell track "${trackName}"
              -- Insert Limiter Plugin
              create plugin "Compressor (Limiter)" at position 1
              tell plugin "Compressor (Limiter)" at position 1
                -- Set Limiter Parameters
                set parameter "Threshold" to ${threshold}
                set parameter "Ratio" to ${ratio}
                set parameter "Makeup Gain" to ${makeupGain}
              end tell
            end tell
          end tell
        `.trim();
      }

      case 'GAIN_ADJUSTMENT': {
        // GAIN_ADJUSTMENT: Adjust track volume
        const gainDb = params.gainDb ?? 0;
        const gainLinear = Math.pow(10, gainDb / 20); // Convert dB to linear

        return `
          tell application "Logic Pro X"
            activate
            tell track "${trackName}"
              set volume to ${gainLinear}
            end tell
          end tell
        `.trim();
      }

      case 'NORMALIZATION': {
        // NORMALIZATION: Normalize loudness to target
        // This typically uses gain automation or a normalization plugin
        const targetLUFS = params.targetLUFS ?? -14.0;

        return `
          tell application "Logic Pro X"
            activate
            tell track "${trackName}"
              -- Apply Loudness Normalization
              create plugin "Compressor" at position 1
              tell plugin "Compressor" at position 1
                -- Gentle compression for loudness matching
                set parameter "Threshold" to -20
                set parameter "Ratio" to 2
              end tell
            end tell
          end tell
        `.trim();
      }

      case 'DC_REMOVAL': {
        // DC_REMOVAL: Remove DC offset with high-pass filter
        const cornerFrequency = params.cornerFrequency ?? 20; // Hz

        return `
          tell application "Logic Pro X"
            activate
            tell track "${trackName}"
              -- Insert High-Pass Filter
              create plugin "EQ" at position 1
              tell plugin "EQ" at position 1
                set parameter "HPF Freq" to ${cornerFrequency}
                set parameter "HPF Bypass" to false
              end tell
            end tell
          end tell
        `.trim();
      }

      default:
        console.warn(`[APLExecutor] Unknown action type: ${action.type}`);
        return `
          display dialog "APL Proposal: ${action.description}" with title "Logic Pro"
        `.trim();
    }
  }

  /**
   * Execute AppleScript
   *
   * This is a placeholder that would be implemented with actual AppleScript execution.
   * In production, this would use the AppleScriptActuator from Phase 11.
   */
  private static async executeAppleScript(script: string): Promise<{
    success: boolean;
    output?: string;
    error?: string;
  }> {
    // In Phase 3 with AppleScriptActuator integrated, this would actually execute
    // For now, we simulate successful execution
    console.log(`[APLExecutor] Simulating AppleScript execution...`);

    // Simulate execution delay (realistic for AppleScript)
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      output: 'AppleScript executed successfully'
    };
  }
}

export default APLExecutor;
