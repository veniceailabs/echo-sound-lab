/**
 * Composite Action Guard
 *
 * Prevents a chain of reversible actions from becoming non-reversible without escalation.
 * Rule: If N reversible actions exceed threshold in sequence → escalate to RENDER_EXPORT
 *
 * Rationale:
 * - Each action alone: reversible (EQ, compression, normalize)
 * - Sequence of M actions: may alter export baseline, gain staging, buffer state
 * - Aggregate effect: changes to persistent state without explicit non-reversible intent
 *
 * Solution: Hard ceiling on reversible action chains.
 */

import { ProcessingAction } from '../types';
import { Capability } from './capabilities';

export interface CompositeActionContext {
  reversibleCount: number;
  maxSafeChain: number;
  hasStateChanges: boolean;
}

export class CompositeActionGuard {
  private readonly MAX_SAFE_CHAIN = 5; // Hard ceiling for reversible action chains
  private readonly STATE_CHANGE_KEYWORDS = [
    'save',
    'buffer',
    'state',
    'persist',
    'cache',
    'baseline',
    'export'
  ];

  /**
   * Check if a sequence of actions should be escalated to RENDER_EXPORT.
   *
   * Returns:
   * - PARAMETER_ADJUSTMENT if chain is safe (reversible, low action count)
   * - RENDER_EXPORT if chain exceeds threshold or contains state-touching actions
   */
  classifyActionChain(actions: ProcessingAction[]): Capability {
    if (!actions || actions.length === 0) {
      return Capability.PARAMETER_ADJUSTMENT;
    }

    // Count reversible actions
    const reversibleActions = actions.filter(a => a.reversibility === 'Fully');
    const nonReversibleActions = actions.filter(a => a.reversibility !== 'Fully');

    // If any non-reversible action exists, whole chain is non-reversible
    if (nonReversibleActions.length > 0) {
      return Capability.RENDER_EXPORT;
    }

    // All actions are reversible. Check if chain is too long.
    if (reversibleActions.length > this.MAX_SAFE_CHAIN) {
      // Escalate: chain is too deep, may have accumulated side-effects
      return Capability.RENDER_EXPORT;
    }

    // Check if any action description hints at state changes
    const hasStateChanges = this.detectStateChanges(actions);
    if (hasStateChanges) {
      // Escalate: even reversible actions may alter persistent state
      return Capability.RENDER_EXPORT;
    }

    // Safe: short reversible chain, no state hints
    return Capability.PARAMETER_ADJUSTMENT;
  }

  /**
   * Detect if action descriptions hint at state changes.
   */
  private detectStateChanges(actions: ProcessingAction[]): boolean {
    return actions.some(action => {
      const desc = (action.description || '').toLowerCase();
      return this.STATE_CHANGE_KEYWORDS.some(keyword => desc.includes(keyword));
    });
  }

  /**
   * Get context for diagnostics.
   */
  getContext(actions: ProcessingAction[]): CompositeActionContext {
    const reversibleCount = actions.filter(a => a.reversibility === 'Fully').length;

    return {
      reversibleCount,
      maxSafeChain: this.MAX_SAFE_CHAIN,
      hasStateChanges: this.detectStateChanges(actions)
    };
  }
}

export default CompositeActionGuard;
