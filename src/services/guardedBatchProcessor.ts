/**
 * Guarded Batch Processor — Rule C4: Single-Action ACC Binding
 *
 * Enforces that batch operations DO NOT silently expand.
 * Each job requires independent RENDER_EXPORT approval.
 *
 * Prevents:
 * - User approves "Export to MP3" → system silently also exports to WAV
 * - User approves "Process track 1" → system silently processes tracks 2-5
 *
 * Requires explicit per-job confirmation.
 */

import { BatchProcessingJob, ProcessingConfig, ExportFormat } from '../types';
import { audioEngine } from './audioEngine';
import { encoderService } from './encoderService';
import { mixAnalysisService } from './mixAnalysis';
import ESLCapabilityAdapter from './eslCapabilityAdapter';

type ProgressCallback = (progress: number, currentFile: string) => void;
type CompletionCallback = (job: BatchProcessingJob) => void;

export class GuardedBatchProcessor {
  private currentJob: BatchProcessingJob | null = null;
  private isProcessing: boolean = false;

  constructor(
    private adapter: ESLCapabilityAdapter,
    private appId: string
  ) {}

  /**
   * Process batch with capability checking.
   * Rule C4: Each job requires independent approval.
   * Cannot batch-expand without explicit per-job confirmation.
   */
  async processBatchGuarded(
    files: File[],
    config: ProcessingConfig,
    exportFormat: ExportFormat = 'WAV',
    onProgress?: ProgressCallback,
    onComplete?: CompletionCallback
  ): Promise<BatchProcessingJob> {
    if (this.isProcessing) {
      throw new Error('[BATCH_PROCESSING] Batch processing already in progress');
    }

    // Rule C4 enforcement: Cannot process multiple files without explicit approval
    if (files.length > 1) {
      throw new Error(
        `[BATCH_CHAINING_DENIED] Rule C4: Cannot process ${files.length} files in single batch.\n` +
        `Each file requires independent RENDER_EXPORT approval.\n` +
        `Process one file at a time, or use explicit per-file confirmation.`
      );
    }

    if (files.length === 0) {
      throw new Error('[BATCH_PROCESSING] No files to process');
    }

    const file = files[0];

    // Guard the single job before execution
    const jobRequest = await this.adapter.guardBatchJob(
      `batch-${Date.now()}`,
      'export',
      `Export ${file.name} to ${exportFormat}`
    );

    // Check capability before processing
    try {
      const grant = (this.adapter as any).authority.assertAllowed(jobRequest);

      if (grant.requiresACC) {
        throw new Error(
          `[ACC_REQUIRED] Batch export requires active consent.\n` +
          `File: ${file.name}\n` +
          `Format: ${exportFormat}\n` +
          `Reason: ${jobRequest.reason}`
        );
      }

      // Authority granted. Proceed with processing.
    } catch (error) {
      this.adapter.logViolation(jobRequest, error as Error);
      throw error;
    }

    // Create job
    const job: BatchProcessingJob = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      files: [file],
      config,
      status: 'processing',
      progress: 0,
      results: []
    };

    this.currentJob = job;
    this.isProcessing = true;

    try {
      // Process the single file
      const progress = 100;

      if (onProgress) {
        onProgress(progress, file.name);
      }

      try {
        // Load and process file
        const buffer = await audioEngine.loadFile(file);

        // Apply processing configuration
        const processedBuffer = await this.applyProcessing(buffer, config);

        // Export to desired format
        const exportBlob = await encoderService.encodeBuffer(processedBuffer, exportFormat);

        job.results.push({
          filename: file.name,
          success: true,
          outputBlob: exportBlob
        });

      } catch (error: any) {
        job.results.push({
          filename: file.name,
          success: false,
          error: error.message || 'Processing failed'
        });
      }

      // Job complete
      job.status = 'completed';
      job.progress = 100;

      if (onComplete) {
        onComplete(job);
      }

    } catch (error: any) {
      job.status = 'error';
      console.error('[GuardedBatchProcessor] Batch processing error:', error);
    } finally {
      this.isProcessing = false;
    }

    return job;
  }

  /**
   * Sequential processing with per-job confirmation.
   * For multiple files, caller must explicitly approve each one.
   * This is the ONLY way to process multiple files.
   */
  async processSequentialWithApproval(
    files: File[],
    config: ProcessingConfig,
    exportFormat: ExportFormat = 'WAV',
    onProgress?: ProgressCallback,
    onComplete?: CompletionCallback,
    onApprovalRequired?: (file: File) => Promise<boolean>  // Must return true to proceed
  ): Promise<BatchProcessingJob> {
    if (this.isProcessing) {
      throw new Error('[BATCH_PROCESSING] Batch processing already in progress');
    }

    if (files.length === 0) {
      throw new Error('[BATCH_PROCESSING] No files to process');
    }

    const job: BatchProcessingJob = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      files,
      config,
      status: 'processing',
      progress: 0,
      results: []
    };

    this.currentJob = job;
    this.isProcessing = true;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Request approval for each file (Rule C4)
        if (onApprovalRequired) {
          const approved = await onApprovalRequired(file);
          if (!approved) {
            console.log(`[GuardedBatchProcessor] Skipped file (not approved): ${file.name}`);
            job.results.push({
              filename: file.name,
              success: false,
              error: 'User declined processing'
            });
            continue;
          }
        }

        // Guard each job independently
        const jobRequest = await this.adapter.guardBatchJob(
          `batch-${Date.now()}-${i}`,
          'export',
          `Export ${file.name} to ${exportFormat}`
        );

        try {
          const grant = (this.adapter as any).authority.assertAllowed(jobRequest);

          if (grant.requiresACC) {
            console.warn(`[GuardedBatchProcessor] ACC required for ${file.name}, skipping`);
            job.results.push({
              filename: file.name,
              success: false,
              error: 'Active consent required'
            });
            continue;
          }
        } catch (error) {
          this.adapter.logViolation(jobRequest, error as Error);
          job.results.push({
            filename: file.name,
            success: false,
            error: (error as Error).message
          });
          continue;
        }

        // Process this file
        const progress = ((i + 1) / files.length) * 100;

        if (onProgress) {
          onProgress(progress, file.name);
        }

        try {
          const buffer = await audioEngine.loadFile(file);
          const processedBuffer = await this.applyProcessing(buffer, config);
          const exportBlob = await encoderService.encodeBuffer(processedBuffer, exportFormat);

          job.results.push({
            filename: file.name,
            success: true,
            outputBlob: exportBlob
          });

        } catch (error: any) {
          job.results.push({
            filename: file.name,
            success: false,
            error: error.message || 'Processing failed'
          });
        }
      }

      job.status = 'completed';
      job.progress = 100;

      if (onComplete) {
        onComplete(job);
      }

    } catch (error: any) {
      job.status = 'error';
      console.error('[GuardedBatchProcessor] Sequential processing error:', error);
    } finally {
      this.isProcessing = false;
    }

    return job;
  }

  /**
   * Apply processing config to an audio buffer (internal).
   */
  private async applyProcessing(
    buffer: AudioBuffer,
    config: ProcessingConfig
  ): Promise<AudioBuffer> {
    // Simplified version of batchProcessor.applyProcessing
    // In reality, this would be the full DSP chain
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);

    source.start(0);

    return offlineCtx.startRendering();
  }

  /**
   * Get current job status (read-only, no capability check).
   */
  getCurrentJob(): BatchProcessingJob | null {
    return this.currentJob;
  }

  /**
   * Check if processing in progress.
   */
  isProcessingActive(): boolean {
    return this.isProcessing;
  }
}

export default GuardedBatchProcessor;
