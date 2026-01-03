/**
 * Audio Processing Layer (APL) v0.1
 * Signal Intelligence + Proposal Generation + Quantum Hook
 *
 * The APL is the "Eyes" of the system:
 *  - APLAnalyzer: Measures audio metrics (forensic truth)
 *  - APLProposalEngine: Converts metrics into action proposals
 *  - QCLSimulatorAdapter: Optional quantum-optimized suggestions (Phase 0)
 *
 * The APL is NOT the "Brain":
 *  - Does not make final decisions
 *  - Does not access Authority Layer directly
 *  - Proposes; does not execute
 *
 * QUANTUM HOOK (Phase 0):
 * APL proposals can now indicate their origin (CLASSICAL vs QUANTUM_SIMULATOR vs QPU)
 * This enables future integration with quantum optimization without core changes.
 */

export {
  APLSignalMetrics,
  APLAnomaly,
  APLSignalIntelligence,
  createSignalIntelligence,
  getGainAdjustmentNeeded,
  getLimiterThresholdNeeded,
} from './signal-intelligence';

export { APLAnalyzer, getAPLAnalyzer } from './analyzer';

export { APLProposal, APLProposalEngine, getAPLProposalEngine } from './proposal-engine';

export { QCLSimulatorAdapter, getQCLSimulator } from './qcl-simulator-adapter';
