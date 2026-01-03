/**
 * Logic Pro X Execution Bridge
 *
 * Handles audio workstation automation via AppleScript.
 *
 * Execution Model:
 *  1. Receive work order (audit-bound)
 *  2. Build AppleScript from payload
 *  3. Execute script atomically
 *  4. Return result (SUCCESS or FAILED, never throw)
 *
 * Payload Schema (Logic Pro):
 * {
 *   action: 'SET_FADER' | 'INSERT_PLUGIN' | 'RECORD_ARM' | etc.
 *   track: string;              // Track name
 *   parameter?: string;         // Parameter name (e.g., 'pan', 'volume')
 *   value?: number | string;    // New value
 * }
 */

import {
  IExecutionBridge,
  ExecutionDomain,
  BridgeType,
  AAWorkOrder,
  AAExecutionResult,
  createExecutionResult,
} from '../work-order';
import { AppleScriptActuator, buildLogicProScript } from '../actuators/AppleScriptActuator';

/**
 * Logic Pro Bridge: Simulation Mode
 *
 * In development, this logs actions instead of executing them.
 * Set SIMULATION_MODE = false to actually execute AppleScript.
 */
export class LogicProBridge implements IExecutionBridge {
  domain = ExecutionDomain.LOGIC_PRO;
  bridgeType = BridgeType.APPLESCRIPT;

  // Toggle this to enable/disable real execution
  private SIMULATION_MODE = true;

  /**
   * Execute the work order
   * Must be atomic and never throw
   */
  public async execute(workOrder: AAWorkOrder): Promise<AAExecutionResult> {
    try {
      // Validate payload
      const action = workOrder.payload.action as string;
      const track = workOrder.payload.track as string;

      if (!action || !track) {
        return createExecutionResult(
          workOrder.audit.auditId,
          'FAILED',
          undefined,
          {
            code: 'INVALID_PAYLOAD',
            message: 'LogicProBridge requires action and track in payload',
          },
        );
      }

      // Build script
      const script = this.buildAppleScript(action, workOrder.payload);

      // Execute (simulation or real)
      if (this.SIMULATION_MODE) {
        return this.executeSimulation(workOrder, action, script);
      } else {
        return await this.executeReal(workOrder, script);
      }
    } catch (error) {
      // Should never happen, but catch anyway
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createExecutionResult(
        workOrder.audit.auditId,
        'FAILED',
        undefined,
        {
          code: 'EXECUTION_ERROR',
          message: `Unexpected error in LogicProBridge: ${errorMessage}`,
        },
      );
    }
  }

  /**
   * Build AppleScript from work order payload
   */
  private buildAppleScript(action: string, payload: Record<string, unknown>): string {
    const track = payload.track as string;

    switch (action) {
      case 'SET_FADER':
        return this.scriptSetFader(track, payload.value as number);

      case 'SET_PAN':
        return this.scriptSetPan(track, payload.value as number);

      case 'INSERT_PLUGIN':
        return this.scriptInsertPlugin(track, payload.plugin as string);

      case 'ARM_RECORDING':
        return this.scriptArmRecording(track);

      case 'START_PLAYBACK':
        return this.scriptStartPlayback();

      case 'STOP_PLAYBACK':
        return this.scriptStopPlayback();

      default:
        throw new Error(`Unknown Logic Pro action: ${action}`);
    }
  }

  /**
   * AppleScript: Set fader level
   */
  private scriptSetFader(track: string, value: number): string {
    return `
      tell application "Logic Pro"
        set fader position of channel strip "${track}" to ${value}
      end tell
    `;
  }

  /**
   * AppleScript: Set pan
   */
  private scriptSetPan(track: string, value: number): string {
    return `
      tell application "Logic Pro"
        set pan value of channel strip "${track}" to ${value}
      end tell
    `;
  }

  /**
   * AppleScript: Insert plugin
   */
  private scriptInsertPlugin(track: string, plugin: string): string {
    return `
      tell application "Logic Pro"
        insert plugin named "${plugin}" into channel strip "${track}"
      end tell
    `;
  }

  /**
   * AppleScript: Arm recording
   */
  private scriptArmRecording(track: string): string {
    return `
      tell application "Logic Pro"
        set recording enabled of channel strip "${track}" to true
      end tell
    `;
  }

  /**
   * AppleScript: Start playback
   */
  private scriptStartPlayback(): string {
    return `
      tell application "Logic Pro"
        play
      end tell
    `;
  }

  /**
   * AppleScript: Stop playback
   */
  private scriptStopPlayback(): string {
    return `
      tell application "Logic Pro"
        stop
      end tell
    `;
  }

  /**
   * Simulation Mode: Log the action, return success
   */
  private executeSimulation(
    workOrder: AAWorkOrder,
    action: string,
    _script: string,
  ): AAExecutionResult {
    console.log(`🎛️ [LOGIC_PRO_SIMULATION] ${action}`);
    console.log(`   Track: ${workOrder.payload.track}`);
    console.log(`   Value: ${workOrder.payload.value || 'N/A'}`);
    console.log(`   Audit ID: ${workOrder.audit.auditId}`);

    return createExecutionResult(
      workOrder.audit.auditId,
      'SUCCESS',
      {
        action,
        track: workOrder.payload.track,
        simulated: true,
        timestamp: Date.now(),
      },
    );
  }

  /**
   * Real Execution Mode: Run actual AppleScript via osascript
   * (Requires osascript CLI available on macOS)
   */
  private async executeReal(workOrder: AAWorkOrder, script: string): Promise<AAExecutionResult> {
    const action = workOrder.payload.action as string;

    console.log(`\n🍏 [LOGIC_PRO_BRIDGE] REAL EXECUTION MODE`);
    console.log(`   Action: ${action}`);
    console.log(`   Track: ${workOrder.payload.track}`);
    console.log(`   Audit ID: ${workOrder.audit.auditId}`);

    // Step 1: Validate the script
    if (!AppleScriptActuator.validateScript(script, `Logic Pro ${action}`)) {
      console.error(`❌ [LOGIC_PRO_BRIDGE] Script validation failed`);
      return createExecutionResult(
        workOrder.audit.auditId,
        'FAILED',
        undefined,
        {
          code: 'SCRIPT_VALIDATION_FAILED',
          message: 'AppleScript validation failed - dangerous patterns detected',
        },
      );
    }

    // Step 2: Execute the AppleScript
    console.log(`\n📤 [LOGIC_PRO_BRIDGE] Firing actuator...`);
    const result = await AppleScriptActuator.run(script);

    // Step 3: Parse result
    if (result.status === 'SUCCESS') {
      console.log(`\n✅ [LOGIC_PRO_BRIDGE] Execution successful`);
      return createExecutionResult(
        workOrder.audit.auditId,
        'SUCCESS',
        {
          action,
          track: workOrder.payload.track,
          executed: true,
          applescriptOutput: result.output,
          timestamp: Date.now(),
        },
      );
    } else {
      console.error(`\n❌ [LOGIC_PRO_BRIDGE] Execution failed`);
      console.error(`   Error: ${result.stderr}`);
      return createExecutionResult(
        workOrder.audit.auditId,
        'FAILED',
        undefined,
        {
          code: 'APPLESCRIPT_ERROR',
          message: `AppleScript execution failed: ${result.stderr}`,
        },
      );
    }
  }

  /**
   * Toggle between simulation and real execution
   *
   * Simulation: Logs actions to console (safe for testing)
   * Real: Executes actual AppleScript via osascript (requires macOS + Logic Pro X)
   *
   * ⚠️  WARNING: Real execution will actually modify Logic Pro state!
   * Only enable after verification that:
   *  1. Logic Pro X is installed
   *  2. System Security & Privacy permissions are granted
   *  3. You have tested with a safe project file
   */
  public setSimulationMode(enabled: boolean): void {
    this.SIMULATION_MODE = enabled;
    if (!enabled) {
      console.warn(
        `\n⚠️  [LOGIC_PRO_BRIDGE] REAL EXECUTION ENABLED\n` +
          `   AppleScript will actually modify Logic Pro state\n` +
          `   Ensure Logic Pro X is installed and you have proper permissions\n`,
      );
    }
  }
}

/**
 * Singleton instance
 */
let bridgeInstance: LogicProBridge | null = null;

/**
 * Get or create the singleton bridge
 */
export function getLogicProBridge(): LogicProBridge {
  if (!bridgeInstance) {
    bridgeInstance = new LogicProBridge();
  }
  return bridgeInstance;
}
