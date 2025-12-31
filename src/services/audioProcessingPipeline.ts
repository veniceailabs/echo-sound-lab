/**
 * CLEAN AUDIO PROCESSING PIPELINE
 *
 * Unified interface abstracting the audio engine complexity.
 * Single responsibility: Take audio + actions → produce processed audio + metrics
 *
 * Replaces the confusing array of audioEngine methods:
 * - renderProcessedAudio() / renderWithWebAudio() / renderWithCustomDSP()
 * - applyProcessingConfig() / enableProcessedSignal() / disableProcessedSignal()
 * - switchToOriginal() / getOriginalBuffer() / etc.
 */

import { AudioBuffer } from 'web-audio-api';
import { ProcessingAction, ProcessingConfig, AudioMetrics } from '../types';
import { actionsToConfig } from './processingActionUtils';
import { audioEngine } from './audioEngine';
import { mixAnalysisService } from './mixAnalysis';

export interface ProcessingResult {
  processedBuffer: AudioBuffer;
  metrics: AudioMetrics;
  appliedActions: ProcessingAction[];
}

export class AudioProcessingPipeline {
  private originalBuffer: AudioBuffer | null = null;
  private processedBuffer: AudioBuffer | null = null;
  private isPlayingProcessed: boolean = false;
  private readonly safetyPeakTargetDb = -1.0;
  private readonly safetyPeakThresholdDb = -0.3;

  /**
   * Load original audio file
   */
  async loadAudio(buffer: AudioBuffer): Promise<void> {
    this.originalBuffer = buffer;
    this.processedBuffer = null;
    this.isPlayingProcessed = false;
    audioEngine.setBuffer(buffer);
    audioEngine.setProcessedBuffer(null);
  }

  /**
   * Process audio with selected actions
   * Returns new audio buffer + updated metrics
   */
  async processAudio(selectedActions: ProcessingAction[]): Promise<ProcessingResult> {
    if (!this.originalBuffer) throw new Error('No audio loaded');

    // Convert ProcessingAction[] to ProcessingConfig
    const config = actionsToConfig(selectedActions);

    // Render processed audio
    const processedBuffer = await audioEngine.renderProcessedAudio(config);

    // Analyze new metrics
    let metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);

    // Safety trim to prevent unintended clipping from recommendations
    if (metrics.peak > this.safetyPeakThresholdDb) {
      const trimDb = this.safetyPeakTargetDb - metrics.peak;
      const linearGain = Math.pow(10, trimDb / 20);
      for (let ch = 0; ch < processedBuffer.numberOfChannels; ch++) {
        const channel = processedBuffer.getChannelData(ch);
        for (let i = 0; i < channel.length; i++) {
          channel[i] *= linearGain;
        }
      }
      metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
    }

    metrics.lufs = {
      integrated: metrics.rms + 3,
      shortTerm: metrics.rms + 3,
      momentary: metrics.rms + 3,
      loudnessRange: metrics.crestFactor,
      truePeak: metrics.peak,
    };

    // Store processed buffer
    this.processedBuffer = processedBuffer;
    audioEngine.setProcessedBuffer(processedBuffer);

    return {
      processedBuffer,
      metrics,
      appliedActions: selectedActions,
    };
  }

  /**
   * Reprocess audio with modified actions (e.g., removing one action)
   */
  async reprocessAudio(selectedActions: ProcessingAction[]): Promise<ProcessingResult> {
    if (!this.originalBuffer) throw new Error('No original audio');

    // Start from original, not from processed
    audioEngine.setBuffer(this.originalBuffer);

    return this.processAudio(selectedActions);
  }

  /**
   * A/B comparison: switch between original and processed
   */
  playOriginal(): void {
    if (!this.originalBuffer) throw new Error('No original audio');
    audioEngine.setBuffer(this.originalBuffer);
    this.isPlayingProcessed = false;
  }

  playProcessed(): void {
    if (!this.processedBuffer) {
      console.warn('No processed audio available, playing original');
      this.playOriginal();
      return;
    }
    audioEngine.setProcessedBuffer(this.processedBuffer);
    this.isPlayingProcessed = true;
  }

  /**
   * Get current state
   */
  getOriginalBuffer(): AudioBuffer | null {
    return this.originalBuffer;
  }

  getProcessedBuffer(): AudioBuffer | null {
    return this.processedBuffer;
  }

  isPlayingProcessedAudio(): boolean {
    return this.isPlayingProcessed;
  }

  /**
   * Clear session
   */
  reset(): void {
    this.originalBuffer = null;
    this.processedBuffer = null;
    this.isPlayingProcessed = false;
    audioEngine.setBuffer(null);
    audioEngine.setProcessedBuffer(null);
  }

  /**
   * Convert ProcessingAction[] to ProcessingConfig
   * This is the ONLY place where the conversion happens
   */
  // actionsToConfig moved to processingActionUtils.ts
}

// Singleton instance
export const audioProcessingPipeline = new AudioProcessingPipeline();
