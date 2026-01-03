/**
 * APL-AA Bridge: Optional Integration Layer
 *
 * Location: action-authority/integration/apl-bridge.ts
 * Status: Phase 4 (Created after APL decoupling in Phase 1)
 *
 * IMPORTANT ARCHITECTURE RULE:
 * This file lives in Action Authority, NOT in APL.
 * Action Authority optionally imports APL, not vice versa.
 * This ensures APL remains 100% independent.
 *
 * PURPOSE:
 * Converts APL proposals (plain data objects) into AA work orders
 * Enables optional AA gated execution of APL recommendations
 *
 * USAGE:
 * In Action Authority, if APL proposals need AA governance:
 *
 *   import { APLProposal } from 'echo-sound-lab/apl';
 *   import { proposalToWorkOrder } from './apl-bridge';
 *
 *   const proposal = generateAPLProposal(...);
 *   const workOrder = proposalToWorkOrder(
 *     proposal,
 *     auditId,
 *     contextId,
 *     sourceHash
 *   );
 *
 * If APL is not available, AA works without this bridge.
 * If APL is available but not used, this bridge is never called.
 */

// TYPE IMPORT ONLY - APL remains an optional dependency
import type { APLProposal } from '../../../src/echo-sound-lab/apl';

import {
  createWorkOrder,
  ExecutionDomain,
  BridgeType,
  type AAWorkOrder,
} from '../execution';

/**
 * Convert an APL proposal into an Action Authority work order
 *
 * This function:
 *  ✅ Maps APL action types to AA execution actions
 *  ✅ Binds the proposal to an audit trail
 *  ✅ Marks as LOW risk (APL proposals are always advisory)
 *  ✅ Preserves evidence for forensic logging
 *  ✅ Returns an immutable work order
 *
 * @param proposal - APL proposal (from independent APL system)
 * @param auditId - AA audit ID for forensic binding
 * @param contextId - Operational context (track, session, etc.)
 * @param sourceHash - Source code hash for integrity verification
 * @returns Immutable work order ready for AA dispatcher
 */
export function proposalToWorkOrder(
  proposal: APLProposal,
  auditId: string,
  contextId: string,
  sourceHash: string,
): AAWorkOrder {
  return createWorkOrder({
    actionId: proposal.proposalId,
    description: proposal.action.description,
    domain: ExecutionDomain.LOGIC_PRO,
    bridgeType: BridgeType.APPLESCRIPT,
    payload: {
      action: mapAPLActionTypeToPayload(proposal.action.type),
      track: proposal.trackName,
      ...proposal.action.parameters,
    },
    auditId,
    contextHash: `hash_${sourceHash}`,
    authorizedAt: Date.now(),
    contextId,
    sourceHash,
    metadata: {
      // Link to APL intelligence for audit trail
      aplProposalId: proposal.proposalId,
      aplConfidence: proposal.confidence,
      aplEvidence: {
        metric: proposal.evidence.metric,
        currentValue: proposal.evidence.currentValue,
        targetValue: proposal.evidence.targetValue,
        rationale: proposal.evidence.rationale,
      },
    },
  });
}

/**
 * Map APL action type to AA/Logic Pro payload action
 *
 * This is the glue between APL's recommendation types and
 * Logic Pro's actual AppleScript commands.
 */
function mapAPLActionTypeToPayload(actionType: string): string {
  switch (actionType) {
    case 'LIMITING':
      return 'INSERT_LIMITER';
    case 'NORMALIZATION':
      return 'SET_GAIN';
    case 'DC_REMOVAL':
      return 'INSERT_HIGHPASS';
    case 'GAIN_ADJUSTMENT':
      return 'SET_GAIN';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Type guard: Check if an object is a valid APL proposal
 * Useful for runtime validation when receiving proposals
 */
export function isAPLProposal(obj: unknown): obj is APLProposal {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const p = obj as Record<string, unknown>;

  // Check required fields
  if (typeof p.proposalId !== 'string') return false;
  if (typeof p.trackId !== 'string') return false;
  if (typeof p.trackName !== 'string') return false;
  if (typeof p.confidence !== 'number') return false;

  // Check action structure
  if (!p.action || typeof p.action !== 'object') return false;
  const action = p.action as Record<string, unknown>;
  if (
    !['GAIN_ADJUSTMENT', 'LIMITING', 'NORMALIZATION', 'DC_REMOVAL'].includes(
      action.type as string,
    )
  ) {
    return false;
  }

  // Check evidence structure
  if (!p.evidence || typeof p.evidence !== 'object') return false;
  const evidence = p.evidence as Record<string, unknown>;
  if (
    typeof evidence.metric !== 'string' ||
    typeof evidence.currentValue !== 'number' ||
    typeof evidence.targetValue !== 'number' ||
    typeof evidence.rationale !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * State Drift Mitigation (Gemini Review Point)
 *
 * When APL executes a proposal directly (outside AA),
 * AA's cached context hashes may become stale.
 *
 * This function should be called when APL emits an execution event.
 *
 * @param trackId - Track that was modified
 * @param contextBinding - AA's context binding layer
 */
export function invalidateContextAfterAPLExecution(
  trackId: string,
  contextBinding: any, // ContextBinding instance
): void {
  /**
   * IMPLEMENTATION NOTE (Phase 3-4):
   * This is called via the Global Context Invalidator pattern.
   *
   * When APL's APLExecutor fires 'apl:proposal_executed' event,
   * AA listens and calls this function.
   *
   * This ensures:
   *  ✅ AA knows the track state has changed
   *  ✅ Cached sourceHash for this track is invalid
   *  ✅ Next AA proposal requires context re-validation
   *  ✅ No "Stale Approval" attacks possible
   */
  if (contextBinding && typeof contextBinding.invalidateTrack === 'function') {
    contextBinding.invalidateTrack(trackId);
  }
}
