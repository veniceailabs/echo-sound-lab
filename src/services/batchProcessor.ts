import { BatchProcessingJob, ProcessingConfig, ExportFormat } from '../types';
import { audioEngine } from './audioEngine';
import { encoderService } from './encoderService';
import { mixAnalysisService } from './mixAnalysis';

type ProgressCallback = (progress: number, currentFile: string) => void;
type CompletionCallback = (job: BatchProcessingJob) => void;

class BatchProcessorService {
    private currentJob: BatchProcessingJob | null = null;
    private isProcessing: boolean = false;

    /**
     * Process multiple files with the same configuration
     */
    async processBatch(
        files: File[],
        config: ProcessingConfig,
        exportFormat: ExportFormat = 'WAV',
        onProgress?: ProgressCallback,
        onComplete?: CompletionCallback
    ): Promise<BatchProcessingJob> {

        if (this.isProcessing) {
            throw new Error('Batch processing already in progress');
        }

        // Create job
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
            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progress = ((i + 1) / files.length) * 100;

                // Update progress
                job.progress = progress;
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
            }

            // Job complete
            job.status = 'completed';
            job.progress = 100;

            if (onComplete) {
                onComplete(job);
            }

        } catch (error: any) {
            job.status = 'error';
            console.error('Batch processing error:', error);
        } finally {
            this.isProcessing = false;
        }

        return job;
    }

    /**
     * Apply processing config to an audio buffer
     */
    private async applyProcessing(
        buffer: AudioBuffer,
        config: ProcessingConfig
    ): Promise<AudioBuffer> {

        // Create offline context for processing
        const offlineCtx = new OfflineAudioContext(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        let currentNode: AudioNode = source;

        // Apply input trim
        if (config.inputTrimDb) {
            const inputGain = offlineCtx.createGain();
            inputGain.gain.value = Math.pow(10, config.inputTrimDb / 20);
            currentNode.connect(inputGain);
            currentNode = inputGain;
        }

        // Apply EQ
        if (config.eq && config.eq.length > 0) {
            for (const band of config.eq) {
                const filter = offlineCtx.createBiquadFilter();
                filter.type = band.type;
                filter.frequency.value = band.frequency;
                filter.gain.value = band.gain;
                if (band.q) filter.Q.value = band.q;

                currentNode.connect(filter);
                currentNode = filter;
            }
        }

        // Apply compression
        if (config.compression) {
            const compressor = offlineCtx.createDynamicsCompressor();
            compressor.threshold.value = config.compression.threshold ?? -24;
            compressor.ratio.value = config.compression.ratio ?? 3;
            compressor.attack.value = config.compression.attack ?? 0.003;
            compressor.release.value = config.compression.release ?? 0.25;

            currentNode.connect(compressor);
            currentNode = compressor;

            // Makeup gain
            if (config.compression.makeupGain) {
                const makeupGain = offlineCtx.createGain();
                makeupGain.gain.value = Math.pow(10, config.compression.makeupGain / 20);
                currentNode.connect(makeupGain);
                currentNode = makeupGain;
            }
        }

        // Apply limiter
        if (config.limiter) {
            const limiter = offlineCtx.createDynamicsCompressor();
            limiter.threshold.value = config.limiter.threshold;
            limiter.ratio.value = config.limiter.ratio;
            limiter.attack.value = config.limiter.attack ?? 0.001;
            limiter.release.value = config.limiter.release;

            currentNode.connect(limiter);
            currentNode = limiter;
        }

        // Apply output trim
        if (config.outputTrimDb) {
            const outputGain = offlineCtx.createGain();
            outputGain.gain.value = Math.pow(10, config.outputTrimDb / 20);
            currentNode.connect(outputGain);
            currentNode = outputGain;
        }

        // Connect to destination
        currentNode.connect(offlineCtx.destination);
        source.start(0);

        // Render offline
        return await offlineCtx.startRendering();
    }

    /**
     * Download all results as a ZIP (browser-side)
     */
    async downloadResults(job: BatchProcessingJob): Promise<void> {
        const successfulResults = job.results.filter(r => r.success && r.outputBlob);

        if (successfulResults.length === 0) {
            throw new Error('No successful results to download');
        }

        // If only one file, download directly
        if (successfulResults.length === 1) {
            const result = successfulResults[0];
            const url = URL.createObjectURL(result.outputBlob!);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.getExportFilename(result.filename);
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        // For multiple files, download each separately
        // (ZIP creation would require additional library like JSZip)
        for (const result of successfulResults) {
            const url = URL.createObjectURL(result.outputBlob!);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.getExportFilename(result.filename);
            a.click();
            URL.revokeObjectURL(url);

            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    /**
     * Get export filename with proper extension
     */
    private getExportFilename(originalName: string, format: ExportFormat = 'WAV'): string {
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        const extension = format.toLowerCase();
        return `${baseName}_processed.${extension}`;
    }

    /**
     * Cancel current batch job
     */
    cancelCurrentJob(): void {
        if (this.currentJob) {
            this.currentJob.status = 'error';
            this.isProcessing = false;
        }
    }

    /**
     * Get current job status
     */
    getCurrentJob(): BatchProcessingJob | null {
        return this.currentJob;
    }

    /**
     * Check if currently processing
     */
    isCurrentlyProcessing(): boolean {
        return this.isProcessing;
    }

    /**
     * Get summary of job results
     */
    getJobSummary(job: BatchProcessingJob): {
        total: number;
        successful: number;
        failed: number;
        successRate: number;
    } {
        const total = job.results.length;
        const successful = job.results.filter(r => r.success).length;
        const failed = total - successful;
        const successRate = total > 0 ? (successful / total) * 100 : 0;

        return { total, successful, failed, successRate };
    }
}

export const batchProcessor = new BatchProcessorService();
