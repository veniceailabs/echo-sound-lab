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
import { ProcessingAction, ProcessingConfig, AudioMetrics, PreservationMode } from '../types';
import { actionsToConfig } from './processingActionUtils';
import { audioEngine } from './audioEngine';
import { mixAnalysisService } from './mixAnalysis';
import { calculateLoudnessRange } from './dsp/analysisUtils';

export interface ProcessingResult {
  processedBuffer: AudioBuffer;
  metrics: AudioMetrics;
  appliedActions: ProcessingAction[];
  preservation: {
    mode: PreservationMode;
    originalDynamicRange: number;
    processedDynamicRange: number;
    minAllowedDynamicRange: number;
    hardCapDb: number;
    wasAdjusted: boolean;
    blocked: boolean;
    reason?: string;
  };
}

export class AudioProcessingPipeline {
  private originalBuffer: AudioBuffer | null = null;
  private processedBuffer: AudioBuffer | null = null;
  private isPlayingProcessed: boolean = false;
  private readonly safetyPeakTargetDb = -1.0;
  private readonly safetyPeakThresholdDb = -0.3;
  private readonly makeupPeakTargetDb = -0.65;
  private readonly globalHardCapDb = 2.0;
  private readonly preservationBudgets: Record<PreservationMode, number> = {
    preserve: 1.2,
    balanced: 1.6,
    competitive: 2.0,
  };
  private originalMetrics: AudioMetrics | null = null;

  private applyGainToBuffer(buffer: AudioBuffer, gainLinear: number) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channel = buffer.getChannelData(ch);
      for (let i = 0; i < channel.length; i++) {
        channel[i] *= gainLinear;
      }
    }
  }

  /**
   * Load original audio file
   */
  async loadAudio(buffer: AudioBuffer): Promise<void> {
    this.originalBuffer = buffer;
    this.processedBuffer = null;
    this.isPlayingProcessed = false;
    this.originalMetrics = mixAnalysisService.analyzeStaticMetrics(buffer);
    audioEngine.setBuffer(buffer);
    audioEngine.setProcessedBuffer(null);
  }

  /**
   * Process audio with selected actions
   * Returns new audio buffer + updated metrics
   */
  async processAudio(
    selectedActions: ProcessingAction[],
    options: { preservationMode?: PreservationMode } = {}
  ): Promise<ProcessingResult> {
    if (!this.originalBuffer) throw new Error('No audio loaded');
    const preservationMode = options.preservationMode ?? 'balanced';
    const originalMetrics = this.originalMetrics || mixAnalysisService.analyzeStaticMetrics(this.originalBuffer);
    const originalDynamicRange = calculateLoudnessRange(this.originalBuffer);
    const allowedReductionDb = Math.min(this.preservationBudgets[preservationMode], this.globalHardCapDb);
    const minAllowedDynamicRange = originalDynamicRange - allowedReductionDb;

    // Convert ProcessingAction[] to ProcessingConfig
    const config = actionsToConfig(selectedActions);
    const boundedConfig = this.applyPreservationBounds(config, originalDynamicRange, preservationMode);

    // Render processed audio and re-check DR after all dynamics/limiter stages.
    const enforcement = await this.renderWithHardCeiling(
      this.originalBuffer,
      boundedConfig,
      originalDynamicRange,
      minAllowedDynamicRange
    );
    const processedBuffer = enforcement.buffer;

    // Analyze new metrics
    let metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
    const preTrimMetrics = metrics;

    // Safety trim to prevent unintended clipping from recommendations
    if (metrics.peak > this.safetyPeakThresholdDb) {
      const trimDb = this.safetyPeakTargetDb - metrics.peak;
      const linearGain = Math.pow(10, trimDb / 20);
      this.applyGainToBuffer(processedBuffer, linearGain);
      metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);

      // Soft-knee recovery: restore part of perceived loudness when trim was aggressive.
      const rmsDropDb = preTrimMetrics.rms - metrics.rms;
      const availableHeadroomDb = this.makeupPeakTargetDb - metrics.peak;
      if (rmsDropDb > 0.4 && availableHeadroomDb > 0.05) {
        const makeupDb = Math.min(
          rmsDropDb * 0.5,
          availableHeadroomDb * 0.85,
          0.5
        );
        if (makeupDb > 0.05) {
          this.applyGainToBuffer(processedBuffer, Math.pow(10, makeupDb / 20));
          metrics = mixAnalysisService.analyzeStaticMetrics(processedBuffer);
        }
      }
    }

    metrics.lufs = {
      integrated: metrics.rms + 3,
      shortTerm: metrics.rms + 3,
      momentary: metrics.rms + 3,
      loudnessRange: metrics.crestFactor,
      truePeak: metrics.peak,
    };

    const processedDynamicRange = calculateLoudnessRange(processedBuffer);
    const violatesHardCeiling = processedDynamicRange < minAllowedDynamicRange || enforcement.hadViolation;
    if (violatesHardCeiling && this.originalBuffer) {
      // Non-bypassable hard ceiling: reject processing if DR floor is breached.
      this.processedBuffer = this.originalBuffer;
      audioEngine.setProcessedBuffer(this.originalBuffer);
      const fallbackMetrics = {
        ...originalMetrics,
        lufs: originalMetrics.lufs || {
          integrated: originalMetrics.rms + 3,
          shortTerm: originalMetrics.rms + 3,
          momentary: originalMetrics.rms + 3,
          loudnessRange: originalMetrics.crestFactor,
          truePeak: originalMetrics.peak,
        },
      };
      return {
        processedBuffer: this.originalBuffer,
        metrics: fallbackMetrics,
        appliedActions: selectedActions,
        preservation: {
          mode: preservationMode,
          originalDynamicRange,
          processedDynamicRange,
          minAllowedDynamicRange,
          hardCapDb: this.globalHardCapDb,
          wasAdjusted: boundedConfig !== config,
          blocked: true,
          reason: enforcement.hadViolation
            ? `Dynamic range floor breached after final render (${processedDynamicRange.toFixed(2)}dB < ${minAllowedDynamicRange.toFixed(2)}dB).`
            : `Dynamic range floor breached (${processedDynamicRange.toFixed(2)}dB < ${minAllowedDynamicRange.toFixed(2)}dB).`,
        },
      };
    }

    // Store processed buffer
    this.processedBuffer = processedBuffer;
    audioEngine.setProcessedBuffer(processedBuffer);

    return {
      processedBuffer,
      metrics,
      appliedActions: selectedActions,
      preservation: {
        mode: preservationMode,
        originalDynamicRange,
        processedDynamicRange,
        minAllowedDynamicRange,
        hardCapDb: this.globalHardCapDb,
        wasAdjusted: boundedConfig !== config || enforcement.usedRelaxation,
        blocked: false,
        reason: enforcement.warning,
      },
    };
  }

  /**
   * Reprocess audio with modified actions (e.g., removing one action)
   */
  async reprocessAudio(
    selectedActions: ProcessingAction[],
    options: { preservationMode?: PreservationMode } = {}
  ): Promise<ProcessingResult> {
    if (!this.originalBuffer) throw new Error('No original audio');

    // Start from original, not from processed
    audioEngine.setBuffer(this.originalBuffer);

    return this.processAudio(selectedActions, options);
  }

  private applyPreservationBounds(
    config: ProcessingConfig,
    originalDynamicRange: number,
    mode: PreservationMode
  ): ProcessingConfig {
    let mutated = false;
    const next: ProcessingConfig = { ...config };
    const ratioCap = mode === 'preserve' ? 1.6 : mode === 'balanced' ? 2.2 : 3.0;
    const compressionThresholdFloor = mode === 'preserve' ? -12 : mode === 'balanced' ? -14 : -16;
    const limiterThresholdFloor = mode === 'preserve' ? -1.0 : mode === 'balanced' ? -1.2 : -1.6;

    if (next.compression) {
      const ratio = next.compression.ratio ?? 1;
      const threshold = next.compression.threshold ?? -12;
      const drSensitiveRatioCap = originalDynamicRange <= 8 ? Math.min(ratioCap, 1.5) : ratioCap;
      const clampedRatio = Math.min(ratio, drSensitiveRatioCap);
      const clampedThreshold = Math.max(threshold, compressionThresholdFloor);
      if (clampedRatio !== ratio || clampedThreshold !== threshold) {
        mutated = true;
        next.compression = {
          ...next.compression,
          ratio: clampedRatio,
          threshold: clampedThreshold,
        };
      }
    }

    if (next.limiter) {
      const threshold = next.limiter.threshold ?? -1.0;
      const clampedThreshold = Math.max(threshold, limiterThresholdFloor);
      if (clampedThreshold !== threshold) {
        mutated = true;
        next.limiter = {
          ...next.limiter,
          threshold: clampedThreshold,
        };
      }
    }

    return mutated ? next : config;
  }

  private async renderWithHardCeiling(
    originalBuffer: AudioBuffer,
    initialConfig: ProcessingConfig,
    originalDynamicRange: number,
    minAllowedDynamicRange: number
  ): Promise<{ buffer: AudioBuffer; usedRelaxation: boolean; hadViolation: boolean; warning?: string }> {
    let attemptConfig = initialConfig;
    let usedRelaxation = false;
    let warning: string | undefined;

    for (let attempt = 0; attempt < 4; attempt++) {
      const rendered = await audioEngine.renderProcessedAudio(attemptConfig);
      const currentDR = calculateLoudnessRange(rendered);
      const reduction = originalDynamicRange - currentDR;
      if (currentDR >= minAllowedDynamicRange && reduction <= this.globalHardCapDb) {
        return { buffer: rendered, usedRelaxation, hadViolation: false, warning };
      }

      usedRelaxation = true;
      warning = `[Preservation] DR violation (${reduction.toFixed(2)}dB). Relaxing dynamics before retry ${attempt + 2}.`;
      attemptConfig = this.relaxDynamicPressure(attemptConfig, attempt + 1);
    }

    const finalRendered = await audioEngine.renderProcessedAudio(attemptConfig);
    return {
      buffer: finalRendered,
      usedRelaxation,
      hadViolation: true,
      warning,
    };
  }

  private relaxDynamicPressure(config: ProcessingConfig, level: number): ProcessingConfig {
    const softened: ProcessingConfig = { ...config };
    const compressionRatioCap = Math.max(1.1, 2.2 - level * 0.35);
    const limiterThresholdFloor = -0.9 + level * 0.2;

    if (softened.compression) {
      softened.compression = {
        ...softened.compression,
        ratio: Math.min(softened.compression.ratio ?? compressionRatioCap, compressionRatioCap),
        threshold: Math.max(softened.compression.threshold ?? -10, -8 + level),
      };
    }

    if (softened.limiter) {
      softened.limiter = {
        ...softened.limiter,
        threshold: Math.max(softened.limiter.threshold ?? -1.0, limiterThresholdFloor),
      };
    }

    return softened;
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
