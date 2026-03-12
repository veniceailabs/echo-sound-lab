/**
 * Audio Processing Layer: Proposal Engine (APLProposalEngine)
 *
 * Converts Signal Intelligence into Action Proposals
 *
 * The Proposal Engine (Independent):
 *  ✅ Reads APLSignalIntelligence
 *  ✅ Generates one or more APLProposal objects
 *  ✅ Does NOT execute anything
 *  ✅ Does NOT make final decisions
 *  ✅ Does NOT depend on Action Authority
 *
 * APLProposal is a complete, self-contained recommendation that can be:
 *  ✅ Executed directly (via APLExecutor in Echo Sound Lab)
 *  ✅ Routed to Authority Layer (via optional APL-AA bridge in Action Authority)
 *  ✅ Exported as JSON (fully serializable, no circular refs)
 *
 * DECOUPLING NOTE (Phase 1 - Approved by Gemini):
 * Removed all imports from ../action-authority/execution
 * proposalToWorkOrder() moved to action-authority/integration/apl-bridge.ts
 * APL is now 100% independent from Action Authority
 */

import {
  APLSignalIntelligence,
  getGainAdjustmentNeeded,
  getLimiterThresholdNeeded,
} from './signal-intelligence';
import { deterministicId } from '../../services/deterministicJson';

/**
 * APLProposal: Complete, Self-Contained Recommendation
 *
 * This is a Plain Old Data object (no functions, no circular refs) that:
 *  ✅ Is 100% JSON-serializable
 *  ✅ Can be executed directly in Echo Sound Lab
 *  ✅ Can be routed to Action Authority for gated execution
 *  ✅ Can be exported, saved, analyzed, etc.
 *
 * DESIGN PRINCIPLE: APLProposal is the "happy path output" of APL.
 * Consumers decide how to act upon it (direct vs. gated).
 *
 * QUANTUM HOOK (Phase 0):
 * The `provenance` field distinguishes between classical rules and
 * quantum-optimized suggestions, enabling future quantum simulation support
 * without modifying core logic later.
 */
export interface APLProposal {
  proposalId: string;
  trackId: string;
  trackName: string;

  // The action to apply
  action: {
    type:
      | 'GAIN_ADJUSTMENT'
      | 'LIMITING'
      | 'NORMALIZATION'
      | 'DC_REMOVAL'
      | 'ADD_TRACK'
      | 'ADD_REGION'
      | 'MOVE_REGION'
      | 'SPLIT_REGION'
      | 'SET_AUTOMATION_POINT'
      | 'ADD_PLUGIN'
      | 'REMOVE_PLUGIN'
      | 'REORDER_PLUGIN'
      | 'SET_PLUGIN_PARAM';
    description: string;
    parameters: Record<string, unknown>;
  };

  // The evidence justifying this proposal
  evidence: {
    metric: string;           // Which metric triggered this (e.g., "loudnessLUFS")
    currentValue: number;     // Current measured value
    targetValue: number;      // Target or recommended value
    rationale: string;        // Human-readable explanation
  };

  // Confidence: Purely advisory (does NOT gate execution per Amendment H)
  confidence: number;        // 0.0-1.0 range

  // QUANTUM HOOK: Origin of the suggestion (Classical vs Quantum-optimized)
  // Phase 0: Prepared for quantum simulation support
  // Currently: All suggestions are CLASSICAL (rules-based)
  // Future: QUANTUM_SIMULATOR and QPU for quantum-optimized parameters
  provenance: {
    engine: 'CLASSICAL' | 'QUANTUM_SIMULATOR' | 'QPU';  // Origin of suggestion
    confidence: number;                                  // Engine confidence in this suggestion
    optimizationLevel?: number;                         // 0-1.0, optimization depth (quantum only)
  };

  // Reference to the complete analysis
  signalIntelligence: APLSignalIntelligence;
}

/**
 * APL Proposal Engine
 * Generates proposals from signal intelligence
 */
export class APLProposalEngine {
  private buildProposalId(
    actionType: APLProposal['action']['type'],
    intel: APLSignalIntelligence,
    extra: Record<string, unknown>
  ): string {
    return deterministicId(`prop-${actionType.toLowerCase()}`, {
      actionType,
      trackId: intel.trackId,
      trackName: intel.trackName,
      metrics: {
        loudnessLUFS: Number(intel.metrics.loudnessLUFS.toFixed(4)),
        truePeakDB: Number(intel.metrics.truePeakDB.toFixed(4)),
        crestFactor: Number(intel.metrics.crestFactor.toFixed(4)),
      },
      extra,
    });
  }

  /**
   * Generate proposals from signal intelligence
   * May return 0, 1, or multiple proposals
   */
  public generateProposals(intel: APLSignalIntelligence): APLProposal[] {
    const proposals: APLProposal[] = [];

    // Check each anomaly and generate proposals
    for (const anomaly of intel.anomalies) {
      switch (anomaly.type) {
        case 'CLIPPING':
          proposals.push(this.createLimiterProposal(intel, anomaly));
          break;

        case 'LOUDNESS_OUT_OF_RANGE':
          proposals.push(this.createGainAdjustmentProposal(intel));
          break;

        case 'DC_OFFSET':
          proposals.push(this.createDCRemovalProposal(intel, anomaly));
          break;

        // INFO severity anomalies don't generate proposals
        default:
          break;
      }
    }

    return proposals;
  }

  /**
   * Create a limiter proposal (for clipping)
   */
  private createLimiterProposal(
    intel: APLSignalIntelligence,
    anomaly: any,
  ): APLProposal {
    const limiterThreshold = getLimiterThresholdNeeded(intel.metrics);
    const targetThreshold = limiterThreshold || -0.1;

    return {
      proposalId: this.buildProposalId('LIMITING', intel, {
        threshold: targetThreshold,
        anomalyStartMs: anomaly?.startMs ?? 0,
        anomalyEndMs: anomaly?.endMs ?? 0,
      }),
      trackId: intel.trackId,
      trackName: intel.trackName,
      action: {
        type: 'LIMITING',
        description: `Apply Limiter at ${targetThreshold.toFixed(1)} dBFS to prevent clipping`,
        parameters: {
          plugin: 'Logic Pro Limiter',
          threshold: targetThreshold,
          release: 50,
          lookahead: 5,
        },
      },
      evidence: {
        metric: 'truePeakDB',
        currentValue: intel.metrics.truePeakDB,
        targetValue: limiterThreshold || -0.1,
        rationale: `True peak detected at ${intel.metrics.truePeakDB.toFixed(1)} dBFS (clipping). Limiting will prevent digital distortion and protect streaming platforms.`,
      },
      confidence: 0.98,
      provenance: {
        engine: 'CLASSICAL',
        confidence: 0.98,
      },
      signalIntelligence: intel,
    };
  }

  /**
   * Create a gain adjustment proposal (for loudness)
   */
  private createGainAdjustmentProposal(intel: APLSignalIntelligence): APLProposal {
    const targetLUFS = -14;
    const gainAdjustment = getGainAdjustmentNeeded(intel.metrics, targetLUFS);

    return {
      proposalId: this.buildProposalId('NORMALIZATION', intel, {
        targetLUFS,
        gainAdjustment: Number(gainAdjustment.toFixed(4)),
      }),
      trackId: intel.trackId,
      trackName: intel.trackName,
      action: {
        type: 'NORMALIZATION',
        description: `Normalize loudness to -14 LUFS (${gainAdjustment > 0 ? '+' : ''}${gainAdjustment.toFixed(1)} dB)`,
        parameters: {
          plugin: 'Logic Pro Gain',
          gainDB: gainAdjustment,
          targetLUFS: targetLUFS,
        },
      },
      evidence: {
        metric: 'loudnessLUFS',
        currentValue: intel.metrics.loudnessLUFS,
        targetValue: targetLUFS,
        rationale: `Current loudness ${intel.metrics.loudnessLUFS.toFixed(1)} LUFS is outside streaming standard (-14 LUFS). Gain adjustment ensures compatibility with Spotify, Apple Music, YouTube, etc.`,
      },
      confidence: 0.95,
      provenance: {
        engine: 'CLASSICAL',
        confidence: 0.95,
      },
      signalIntelligence: intel,
    };
  }

  /**
   * Create a DC removal proposal
   */
  private createDCRemovalProposal(intel: APLSignalIntelligence, anomaly: any): APLProposal {
    const cornerFrequency = 20;
    return {
      proposalId: this.buildProposalId('DC_REMOVAL', intel, {
        cornerFrequency,
        anomalyStartMs: anomaly?.startMs ?? 0,
        anomalyEndMs: anomaly?.endMs ?? 0,
      }),
      trackId: intel.trackId,
      trackName: intel.trackName,
      action: {
        type: 'DC_REMOVAL',
        description: 'Apply highpass filter to remove DC offset',
        parameters: {
          plugin: 'Logic Pro Highpass EQ',
          frequency: cornerFrequency,
          slope: 12,
        },
      },
      evidence: {
        metric: 'dcOffsetDetected',
        currentValue: 1,
        targetValue: 0,
        rationale: 'DC offset detected in signal. This can cause clipping in some systems and should be removed before distribution.',
      },
      confidence: 0.99,
      provenance: {
        engine: 'CLASSICAL',
        confidence: 0.99,
      },
      signalIntelligence: intel,
    };
  }

  /**
   * NOTE: proposalToWorkOrder() has been moved to the APL-AA bridge
   * Location: action-authority/src/action-authority/integration/apl-bridge.ts
   *
   * This decoupling (Phase 1) ensures APL is independent from Action Authority.
   * Action Authority can optionally import APL, not vice versa.
   */
}

/**
 * Singleton instance
 */
let engineInstance: APLProposalEngine | null = null;

/**
 * Get or create the singleton engine
 */
export function getAPLProposalEngine(): APLProposalEngine {
  if (!engineInstance) {
    engineInstance = new APLProposalEngine();
  }
  return engineInstance;
}
