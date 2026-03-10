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
  sessionId: string;
  nonce: string;
  signatureVersion: 'hmac-sha256-v1';
  signature: string; // HMAC-SHA256(base64url)
  actorId?: string;
  actorType?: 'HUMAN' | 'AI';
  generatorId?: string;
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

export type ExecutionSealPayload = {
  proposalId: string;
  actionType: string;
  parameters: Record<string, any>;
  aaContext: Omit<AAContextSeal, 'signature'>;
};

export function buildExecutionSealPayload(payload: ExecutionPayload): ExecutionSealPayload {
  return {
    proposalId: payload.proposalId,
    actionType: payload.actionType,
    parameters: payload.parameters,
    aaContext: {
      contextId: payload.aaContext.contextId,
      sourceHash: payload.aaContext.sourceHash,
      timestamp: payload.aaContext.timestamp,
      sessionId: payload.aaContext.sessionId,
      nonce: payload.aaContext.nonce,
      signatureVersion: payload.aaContext.signatureVersion,
      actorId: payload.aaContext.actorId,
      actorType: payload.aaContext.actorType,
      generatorId: payload.aaContext.generatorId,
    },
  };
}
