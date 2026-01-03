/**
 * EXECUTION BRIDGE (Frontend)
 *
 * Transmits confirmed orders across the process boundary.
 * Takes FSM verdicts and routes them to ExecutionService.
 *
 * NOTE: In a full Electron build, this would use IPC.
 * Currently in monolithic "in-process" mode.
 */

import { ExecutionPayload, ExecutionResult } from '../types/execution-contract';
import { executionService } from './ExecutionService';

export const ExecutionBridge = {
  /**
   * Dispatch a signed work order to the Main Process
   */
  dispatch: async (payload: ExecutionPayload): Promise<ExecutionResult> => {
    console.log('[ExecutionBridge] Transmitting execution order...', payload);

    // NOTE: In a full Electron build, this line is replaced by:
    // return await window.electronAPI.invoke('EXECUTE_PROPOSAL', payload);

    // For "In-Process" Monolith (Current Phase), we call the singleton directly
    // but keep the async interface to simulate the boundary.
    return await executionService.handleExecutionRequest(payload);
  }
};
