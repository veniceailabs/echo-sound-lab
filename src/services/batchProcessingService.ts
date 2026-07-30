/**
 * Echo Sound Lab — Batch Processing Service
 * Process multiple files in parallel with progress tracking
 * Essential for professional workflow (e.g., master entire album)
 */

export interface BatchJob {
  id: string;
  name: string;
  files: BatchFile[];
  processingType: 'mastering' | 'mixing' | 'enhancement';
  config: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  totalDuration: number; // seconds
  processedDuration: number; // seconds
}

export interface BatchFile {
  id: string;
  name: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
  outputUrl?: string;
  duration: number; // seconds
  metadata?: any;
}

export class BatchProcessingService {
  private jobs: Map<string, BatchJob> = new Map();
  private maxConcurrent = 3; // Process 3 files in parallel
  private activeJobs: Set<string> = new Set();

  /**
   * Create a new batch job
   */
  createJob(
    name: string,
    files: { name: string; url: string; duration: number }[],
    processingType: 'mastering' | 'mixing' | 'enhancement',
    config: any
  ): BatchJob {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const batchFiles: BatchFile[] = files.map((file, idx) => ({
      id: `file_${idx}`,
      name: file.name,
      url: file.url,
      status: 'pending',
      progress: 0,
      duration: file.duration,
    }));

    const job: BatchJob = {
      id: jobId,
      name,
      files: batchFiles,
      processingType,
      config,
      status: 'pending',
      createdAt: new Date(),
      totalDuration: files.reduce((sum, f) => sum + f.duration, 0),
      processedDuration: 0,
    };

    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Start processing a batch job
   */
  async startJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = 'processing';
    this.activeJobs.add(jobId);

    try {
      // Process files in batches of maxConcurrent
      const pendingFiles = job.files.filter((f) => f.status === 'pending');

      for (let i = 0; i < pendingFiles.length; i += this.maxConcurrent) {
        const batch = pendingFiles.slice(i, i + this.maxConcurrent);
        await Promise.all(batch.map((file) => this.processFile(job, file)));
      }

      job.status = 'completed';
      job.completedAt = new Date();
    } catch (error) {
      job.status = 'failed';
      console.error(`Batch job ${jobId} failed:`, error);
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Process a single file
   */
  private async processFile(job: BatchJob, file: BatchFile): Promise<void> {
    try {
      file.status = 'processing';

      // Fetch audio file
      const response = await fetch(file.url);
      const arrayBuffer = await response.arrayBuffer();

      // Call mastering/mixing/enhancement API
      const formData = new FormData();
      formData.append('audio', new Blob([arrayBuffer], { type: 'audio/wav' }));

      // Add config parameters
      Object.entries(job.config).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          formData.append(key, String(value));
        }
      });

      const endpoint = this.getEndpoint(job.processingType);
      const processResponse = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!processResponse.ok) {
        throw new Error(`Processing failed: ${processResponse.statusText}`);
      }

      const result = await processResponse.json();

      // Store result
      file.status = 'completed';
      file.progress = 100;
      file.outputUrl = result.downloadUrl;
      file.metadata = result.metadata;

      // Update job progress
      job.processedDuration += file.duration;
    } catch (error) {
      file.status = 'failed';
      file.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  /**
   * Get API endpoint based on processing type
   */
  private getEndpoint(processingType: string): string {
    switch (processingType) {
      case 'mastering':
        return '/api/proxy/mastering/process';
      case 'mixing':
        return '/api/proxy/mixing/process';
      case 'enhancement':
        return '/api/proxy/vocal-enhancement/process';
      default:
        return '/api/proxy/mastering/process';
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BatchJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get job progress (0-100)
   */
  getProgress(jobId: string): number {
    const job = this.jobs.get(jobId);
    if (!job) return 0;

    if (job.totalDuration === 0) return 0;
    return Math.round((job.processedDuration / job.totalDuration) * 100);
  }

  /**
   * Get job status summary
   */
  getStatus(jobId: string): {
    status: string;
    progress: number;
    completed: number;
    failed: number;
    pending: number;
    totalFiles: number;
  } | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      status: job.status,
      progress: this.getProgress(jobId),
      completed: job.files.filter((f) => f.status === 'completed').length,
      failed: job.files.filter((f) => f.status === 'failed').length,
      pending: job.files.filter((f) => f.status === 'pending').length,
      totalFiles: job.files.length,
    };
  }

  /**
   * Get results for a completed job
   */
  getResults(jobId: string): Array<{
    name: string;
    url: string;
    status: string;
    error?: string;
  }> | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return job.files.map((file) => ({
      name: file.name,
      url: file.outputUrl || '',
      status: file.status,
      error: file.error,
    }));
  }

  /**
   * Cancel a batch job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed') return false;

    job.status = 'failed';
    this.activeJobs.delete(jobId);
    return true;
  }

  /**
   * Delete a batch job
   */
  deleteJob(jobId: string): boolean {
    if (this.activeJobs.has(jobId)) return false;
    return this.jobs.delete(jobId);
  }

  /**
   * Export results as a ZIP file
   */
  async exportResults(jobId: string): Promise<Blob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');

    // In production, would use JSZip library
    const urls = job.files
      .filter((f) => f.status === 'completed' && f.outputUrl)
      .map((f) => f.outputUrl!) as string[];

    // Create a simple manifest file
    const manifest = {
      jobName: job.name,
      processingType: job.processingType,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      files: job.files.map((f) => ({
        name: f.name,
        status: f.status,
        outputUrl: f.outputUrl,
      })),
    };

    return new Blob([JSON.stringify(manifest, null, 2)], {
      type: 'application/json',
    });
  }

  /**
   * Get estimated time remaining
   */
  getEstimatedTimeRemaining(jobId: string): number {
    // seconds
    const job = this.jobs.get(jobId);
    if (!job || job.totalDuration === 0) return 0;

    const progress = this.getProgress(jobId);
    if (progress === 0) return 0;

    const elapsedSeconds = (Date.now() - job.createdAt.getTime()) / 1000;
    const estimatedTotal = (elapsedSeconds * 100) / progress;
    return Math.max(0, estimatedTotal - elapsedSeconds);
  }
}

// Export singleton instance
export const batchProcessingService = new BatchProcessingService();
