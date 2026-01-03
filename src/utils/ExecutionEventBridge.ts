/**
 * ExecutionEventBridge - IPC-like Event Bridge
 *
 * Allows ProposalCard (React/UI) to emit execution events
 * that ExecutionService (main thread) consumes.
 *
 * Decouples UI from execution logic.
 */

import { EventEmitter } from 'events';
import { APLProposal } from '../echo-sound-lab/apl/proposal-engine';

export interface ExecutionEventPayload {
  proposalId: string;
  proposal: APLProposal;
  timestamp: number;
}

class ExecutionEventBridge extends EventEmitter {
  /**
   * Emit Direct Execution request
   * (User clicked "Apply Direct" button, FSM bypassed)
   */
  emitDirectExecution(payload: ExecutionEventPayload): void {
    console.log(`[ExecutionEventBridge] Direct execution event: ${payload.proposalId}`);
    this.emit('execution:direct', payload);
  }

  /**
   * Emit Gated Execution request
   * (FSM reached EXECUTED state, user confirmed)
   */
  emitGatedExecution(payload: ExecutionEventPayload): void {
    console.log(`[ExecutionEventBridge] Gated execution event: ${payload.proposalId}`);
    this.emit('execution:gated', payload);
  }

  /**
   * Emit FSM rejection
   * (FSM expired or user canceled)
   */
  emitExecutionRejected(proposalId: string): void {
    console.log(`[ExecutionEventBridge] Rejection event: ${proposalId}`);
    this.emit('execution:rejected', { proposalId });
  }
}

// Singleton instance
export const executionEventBridge = new ExecutionEventBridge();
