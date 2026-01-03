/**
 * EXECUTION CONTRACT
 * The strict protocol between FSM (Browser) and ExecutionService (Node).
 *
 * This interface ensures type safety across the process boundary.
 */

export enum ExecutionEventType {
  EXECUTE_PROPOSAL = 'EXECUTE_PROPOSAL',
  EXECUTION_RESULT = 'EXECUTION_RESULT',
}

export interface AAContextSeal {
  contextId: string;
  sourceHash: string;
  timestamp: number;
  signature: string; // FSM Integrity Proof
}

export interface ExecutionPayload {
  proposalId: string;
  actionType: string; // e.g., "GAIN_ADJUSTMENT", "LIMITING", "NORMALIZATION"
  parameters: Record<string, any>; // e.g., { value: -2.0 }

  // Security Context (The "Seal")
  aaContext: AAContextSeal;
}

export interface ExecutionResult {
  success: boolean;
  workOrderId: string;
  timestamp: number;
  proposalId: string;
  error?: string;
}
