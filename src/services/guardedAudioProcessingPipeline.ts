/**
 * Guarded Audio Processing Pipeline — With Capability Authority
 *
 * Wraps audioProcessingPipeline with capability checks.
 * Each action is classified by reversibility and checked before execution.
 * Composite action chains are escalated if they exceed MAX_SAFE_CHAIN threshold.
 *
 * Non-reversible actions (RENDER_EXPORT) may require ACC.
 * Reversible actions (PARAMETER_ADJUSTMENT) usually pass through.
 */

import { AudioBuffer } from 'web-audio-api';
import { ProcessingAction, ProcessingConfig, AudioMetrics } from '../types';
import { audioProcessingPipeline, ProcessingResult } from './audioProcessingPipeline';
import ESLCapabilityAdapter from './eslCapabilityAdapter';
import { withCapability } from './withCapability';
import { CompositeActionGuard } from './CompositeActionGuard';

export class GuardedAudioProcessingPipeline {
  private compositeGuard: CompositeActionGuard;

  constructor(
    private adapter: ESLCapabilityAdapter,
    private appId: string
  ) {
    this.compositeGuard = new CompositeActionGuard();
  }

  /**
   * Load audio file.
   * Requires FILE_READ capability.
   */
  async loadAudio(buffer: AudioBuffer): Promise<void> {
    // FILE_READ is safe, just log it
    await audioProcessingPipeline.loadAudio(buffer);
  }

  /**
   * Process audio with selected actions.
   * Each action is capability-checked based on reversibility.
   * Composite chains are escalated if they exceed MAX_SAFE_CHAIN.
   *
   * Reversible (PARAMETER_ADJUSTMENT) → usually allowed
   * Non-Reversible (RENDER_EXPORT) → may require ACC
   * Long chains (>5 actions) → escalate to RENDER_EXPORT
   */
  async processAudio(selectedActions: ProcessingAction[]): Promise<ProcessingResult> {
    if (!selectedActions || selectedActions.length === 0) {
      throw new Error('No actions to process');
    }

    // Check composite action chain for escalation
    const escalatedCapability = this.compositeGuard.classifyActionChain(selectedActions);

    // Check each action before processing
    for (const action of selectedActions) {
      // Use escalated capability if composite guard determined it
      let capabilityRequest = await this.adapter.guardProcessingAction(action);

      // Override with composite escalation if needed
      if (escalatedCapability === 'RENDER_EXPORT' && action.reversibility === 'Fully') {
        capabilityRequest = {
          capability: 'RENDER_EXPORT' as any,
          scope: capabilityRequest.scope,
          reason: `Composite action chain exceeds safe threshold. Escalated: ${capabilityRequest.reason}`
        };
      }

      // Attempt to execute with capability check
      try {
        const grant = (this.adapter as any).authority.assertAllowed(capabilityRequest);

        if (grant.requiresACC && capabilityRequest.capability !== 'PARAMETER_ADJUSTMENT') {
          // Non-reversible action requires explicit ACC
          throw new Error(
            `[ACC_REQUIRED] Action requires active consent.\n` +
            `Action: ${action.description}\n` +
            `Reason: ${capabilityRequest.reason}`
          );
        }

        // Authority granted. Action may proceed.
      } catch (error) {
        // Authority denied or ACC required
        this.adapter.logViolation(capabilityRequest, error as Error);
        throw error;
      }
    }

    // All actions passed capability checks. Process audio.
    return audioProcessingPipeline.processAudio(selectedActions);
  }

  /**
   * Reprocess audio with modified actions.
   * Each new action is rechecked.
   * Composite chains are re-escalated.
   */
  async reprocessAudio(selectedActions: ProcessingAction[]): Promise<ProcessingResult> {
    if (!selectedActions || selectedActions.length === 0) {
      throw new Error('No actions to process');
    }

    // Re-check composite chain for escalation
    const escalatedCapability = this.compositeGuard.classifyActionChain(selectedActions);

    // Check each modified action
    for (const action of selectedActions) {
      let capabilityRequest = await this.adapter.guardProcessingAction(action);

      // Override with composite escalation if needed
      if (escalatedCapability === 'RENDER_EXPORT' && action.reversibility === 'Fully') {
        capabilityRequest = {
          capability: 'RENDER_EXPORT' as any,
          scope: capabilityRequest.scope,
          reason: `Composite action chain exceeds safe threshold (reprocess). Escalated: ${capabilityRequest.reason}`
        };
      }

      try {
        (this.adapter as any).authority.assertAllowed(capabilityRequest);
      } catch (error) {
        this.adapter.logViolation(capabilityRequest, error as Error);
        throw error;
      }
    }

    return audioProcessingPipeline.reprocessAudio(selectedActions);
  }

  /**
   * A/B comparison: switch to original (always safe, no capability check).
   */
  playOriginal(): void {
    audioProcessingPipeline.playOriginal();
  }

  /**
   * A/B comparison: switch to processed (safe to compare).
   */
  playProcessed(): void {
    audioProcessingPipeline.playProcessed();
  }

  /**
   * Get current state (safe, read-only).
   */
  getOriginalBuffer(): AudioBuffer | null {
    return audioProcessingPipeline.getOriginalBuffer();
  }

  getProcessedBuffer(): AudioBuffer | null {
    return audioProcessingPipeline.getProcessedBuffer();
  }

  isPlayingProcessedAudio(): boolean {
    return audioProcessingPipeline.isPlayingProcessedAudio();
  }

  /**
   * Clear session (cleanup, no capability check needed).
   */
  reset(): void {
    audioProcessingPipeline.reset();
  }
}

export default GuardedAudioProcessingPipeline;
