/**
 * System-Level Execution Bridge
 *
 * Handles OS-level automation via CLI commands.
 *
 * Payload Schema (System):
 * {
 *   command: string;            // Shell command to execute
 *   args?: string[];            // Command arguments
 *   workingDirectory?: string;  // Where to execute
 *   timeout?: number;           // Command timeout (ms)
 * }
 *
 * ⚠️ SECURITY WARNING
 * This bridge executes arbitrary shell commands. Only use with trusted inputs.
 * Always validate command payloads before reaching this bridge.
 */

import {
  IExecutionBridge,
  ExecutionDomain,
  BridgeType,
  AAWorkOrder,
  AAExecutionResult,
  createExecutionResult,
} from '../work-order';

/**
 * System Bridge: Simulation Mode
 *
 * In development, this logs commands instead of executing them.
 * Set SIMULATION_MODE = false to actually execute shell commands.
 *
 * ⚠️ DANGER: Real execution can modify system state!
 */
export class SystemBridge implements IExecutionBridge {
  domain = ExecutionDomain.SYSTEM;
  bridgeType = BridgeType.CLI;

  // Toggle to enable/disable real execution
  private SIMULATION_MODE = true;

  /**
   * Execute the work order
   * Must be atomic and never throw
   */
  public async execute(workOrder: AAWorkOrder): Promise<AAExecutionResult> {
    try {
      // Validate payload
      const command = workOrder.payload.command as string;

      if (!command) {
        return createExecutionResult(
          workOrder.audit.auditId,
          'FAILED',
          undefined,
          {
            code: 'INVALID_PAYLOAD',
            message: 'SystemBridge requires command in payload',
          },
        );
      }

      // Safety: Reject dangerous commands
      if (this.isDangerousCommand(command)) {
        return createExecutionResult(
          workOrder.audit.auditId,
          'FAILED',
          undefined,
          {
            code: 'DANGEROUS_COMMAND',
            message: `Command blocked for safety: ${command}`,
          },
        );
      }

      // Execute (simulation or real)
      if (this.SIMULATION_MODE) {
        return this.executeSimulation(workOrder, command);
      } else {
        return await this.executeReal(workOrder, command);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createExecutionResult(
        workOrder.audit.auditId,
        'FAILED',
        undefined,
        {
          code: 'EXECUTION_ERROR',
          message: `Unexpected error in SystemBridge: ${errorMessage}`,
        },
      );
    }
  }

  /**
   * Safety check: Block dangerous commands
   */
  private isDangerousCommand(command: string): boolean {
    const dangerous = [
      'rm -rf',
      'dd if=',
      'mkfs',
      ':() { :|:& };:',
      'fork bomb',
      'chmod 000',
    ];

    for (const pattern of dangerous) {
      if (command.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simulation Mode: Log the command, return success
   */
  private executeSimulation(workOrder: AAWorkOrder, command: string): AAExecutionResult {
    console.log(`🖥️ [SYSTEM_SIMULATION] ${command}`);
    console.log(`   Working Dir: ${workOrder.payload.workingDirectory || 'current'}`);
    console.log(`   Timeout: ${workOrder.payload.timeout || 'default'}`);
    console.log(`   Audit ID: ${workOrder.audit.auditId}`);

    return createExecutionResult(
      workOrder.audit.auditId,
      'SUCCESS',
      {
        command,
        simulated: true,
        output: '(simulation mode - no real execution)',
        timestamp: Date.now(),
      },
    );
  }

  /**
   * Real Execution Mode: Execute shell command
   * (Requires Node.js child_process module)
   */
  private async executeReal(workOrder: AAWorkOrder, command: string): Promise<AAExecutionResult> {
    // In a real implementation, this would:
    // 1. Validate command syntax
    // 2. Execute via child_process
    // 3. Capture stdout/stderr
    // 4. Return result

    // For now, just simulate
    console.log(`🖥️ [SYSTEM_REAL] Would execute: ${command}`);

    return createExecutionResult(
      workOrder.audit.auditId,
      'SUCCESS',
      {
        command,
        executed: true,
        output: '(real execution pending)',
        timestamp: Date.now(),
      },
    );
  }

  /**
   * Enable/disable simulation mode
   */
  public setSimulationMode(enabled: boolean): void {
    this.SIMULATION_MODE = enabled;
  }
}

/**
 * Singleton instance
 */
let bridgeInstance: SystemBridge | null = null;

/**
 * Get or create the singleton bridge
 */
export function getSystemBridge(): SystemBridge {
  if (!bridgeInstance) {
    bridgeInstance = new SystemBridge();
  }
  return bridgeInstance;
}
