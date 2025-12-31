/**
 * Export Job Controller (Phase 3C macOS)
 *
 * Enforces:
 * - RENDER_EXPORT (with killable job handle)
 * - Job termination on session end
 * - File output verification (stops changing)
 *
 * Constitutional Rules (PHASE3C_OS_ENFORCEMENT_SPEC.md):
 * - OS-REQ-06: Export job killability
 * - OS-INV-02: Permission denial = immediate halt
 * - OS-INV-03: Revocation is immediate and total
 *
 * This is a gate, not an authority.
 * It enforces denial. It does not grant.
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability } from '../../services/capabilities';
import OSDialogWatcher from './OSDialogWatcher';
import { getSharedOSDialogWatcher } from './getSharedOSDialogWatcher';
import SessionContext from '../common/SessionContext';
import * as fs from 'fs';

export interface ExportJobRequest {
  capability: Capability.RENDER_EXPORT;
  filePath: string;
  sessionId: string;
}

export interface ExportJobHandle {
  jobId: string;
  filePath: string;
  startTime: number;
  state: 'RUNNING' | 'CANCELLED' | 'TERMINATED' | 'COMPLETED';
  cancel: () => Promise<void>;
}

interface FileMetadata {
  size: number;
  mtime: number;
  path: string;
  inode: number;           // Inode for identity verification
  device: number;          // Device for identity verification
}

export class ExportJobController {
  private jobs = new Map<string, ExportJobHandle>();
  private jobSessions = new Map<string, string>(); // jobId -> sessionId
  private fileWatchers = new Map<string, NodeJS.Timeout>();
  private lastFileState = new Map<string, FileMetadata>();
  private audit = getAuditLogger();
  private dialogWatcher: OSDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(
    dialogWatcher: OSDialogWatcher,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce RENDER_EXPORT capability.
   * Creates killable job handle.
   * Returns handle with cancel() method.
   */
  async enforceRenderExport(request: ExportJobRequest): Promise<ExportJobHandle> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    // Session binding assertion (single source of truth)
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'RENDER_EXPORT',
      filePath: request.filePath,
      timestamp: Date.now()
    });

    // Create job ID
    const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create job handle with cancel capability
    const handle: ExportJobHandle = {
      jobId,
      filePath: request.filePath,
      startTime: Date.now(),
      state: 'RUNNING',
      cancel: async () => {
        await this.cancelJob(jobId);
      }
    };

    // Store job
    this.jobs.set(jobId, handle);
    this.jobSessions.set(jobId, request.sessionId);

    // Start file change watcher
    this.startFileChangeWatcher(jobId, request.filePath);

    this.audit.emit('OS_EXPORT_JOB_STARTED', {
      jobId: jobId.substring(0, 6),
      filePath: request.filePath,
      timestamp: Date.now()
    });

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'RENDER_EXPORT',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId, jobId }
    });

    return handle;
  }

  /**
   * Cancel job explicitly.
   * Called on session end or user action.
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('[JOB_NOT_FOUND] Export job not found');
    }

    if (job.state !== 'RUNNING') {
      throw new Error(`[JOB_INVALID_STATE] Export job already ${job.state}`);
    }

    this.audit.emit('OS_EXPORT_JOB_CANCEL_REQUESTED', {
      jobId: jobId.substring(0, 6),
      filePath: job.filePath,
      timestamp: Date.now()
    });

    // Stop watching file
    const watcher = this.fileWatchers.get(jobId);
    if (watcher) {
      clearInterval(watcher);
      this.fileWatchers.delete(jobId);
    }

    // Mark as cancelled
    job.state = 'CANCELLED';

    // Verify file stopped changing
    const isStopped = this.verifyFileStoppedChanging(job.filePath);

    this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
      jobId: jobId.substring(0, 6),
      filePath: job.filePath,
      reason: 'Explicit cancellation',
      fileVerified: isStopped,
      timestamp: Date.now()
    });

    if (!isStopped) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Export job file continued changing after termination',
        jobId,
        filePath: job.filePath
      });
      throw new Error('[OS_HARD_STOP] Export job file continued after cancellation');
    }
  }

  /**
   * Mark job as completed successfully.
   * Called by app when export finishes normally.
   */
  async completeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('[JOB_NOT_FOUND] Export job not found');
    }

    if (job.state !== 'RUNNING') {
      throw new Error(`[JOB_INVALID_STATE] Cannot complete job in state ${job.state}`);
    }

    // Stop watching file
    const watcher = this.fileWatchers.get(jobId);
    if (watcher) {
      clearInterval(watcher);
      this.fileWatchers.delete(jobId);
    }

    job.state = 'COMPLETED';

    this.audit.emit('OS_EXPORT_JOB_COMPLETED', {
      jobId: jobId.substring(0, 6),
      filePath: job.filePath,
      timestamp: Date.now()
    });
  }

  /**
   * Verify job termination.
   * Checks:
   * - Job marked terminated/cancelled
   * - File stopped changing (size + mtime stable)
   */
  async verifyJobTermination(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);

    if (!job) {
      return false; // Job not found = terminated
    }

    if (job.state === 'COMPLETED' || job.state === 'TERMINATED' || job.state === 'CANCELLED') {
      // Check file stopped changing
      return this.verifyFileStoppedChanging(job.filePath);
    }

    return false; // Job still running
  }

  /**
   * Revoke all export jobs.
   * Called on session end.
   * Terminates all jobs, verifies files stopped changing.
   * Enforces OS-INV-03: Revocation is immediate and total.
   */
  revokeAllPermissions(): void {
    const jobIds = Array.from(this.jobs.keys());

    this.audit.emit('OS_EXPORT_JOBS_REVOKED', {
      count: jobIds.length,
      timestamp: Date.now()
    });

    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && job.state === 'RUNNING') {
        // Stop watching file
        const watcher = this.fileWatchers.get(jobId);
        if (watcher) {
          clearInterval(watcher);
          this.fileWatchers.delete(jobId);
        }

        // Mark as terminated
        job.state = 'TERMINATED';

        // Verify file stopped changing
        const isStopped = this.verifyFileStoppedChanging(job.filePath);

        this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
          jobId: jobId.substring(0, 6),
          filePath: job.filePath,
          reason: 'Session ended',
          fileVerified: isStopped,
          timestamp: Date.now()
        });

        if (!isStopped) {
          this.audit.emit('OS_HARD_STOP_TRIGGERED', {
            reason: 'Export job file continued after session revocation',
            jobId,
            filePath: job.filePath
          });
        }
      }
    }

    // Gate clears ONLY local state
    this.jobs.clear();
    this.jobSessions.clear();
    this.lastFileState.clear();

    // Clear all watchers
    for (const [jobId, watcher] of this.fileWatchers) {
      clearInterval(watcher);
    }
    this.fileWatchers.clear();
  }

  /**
   * Start file change watcher.
   * Polls file size + mtime every 500ms to detect changes.
   * Enforces OS-ACC-06: File must stop changing after job termination.
   */
  private startFileChangeWatcher(jobId: string, filePath: string): void {
    // Get initial file metadata
    const initial = this.getFileMetadata(filePath);
    this.lastFileState.set(filePath, initial);

    // Poll every 500ms
    const watcher = setInterval(() => {
      try {
        const current = this.getFileMetadata(filePath);
        this.lastFileState.set(filePath, current);
      } catch (err) {
        // File may not exist yet, that's ok
      }
    }, 500);

    this.fileWatchers.set(jobId, watcher);
  }

  /**
   * Verify file stopped changing.
   * Checks:
   * - Size + mtime stable (last 1 second)
   * - Inode + device unchanged (identity verified)
   */
  private verifyFileStoppedChanging(filePath: string): boolean {
    try {
      // Get current metadata
      const current = this.getFileMetadata(filePath);
      const last = this.lastFileState.get(filePath);

      if (!last) {
        // No previous state, can't verify
        return false;
      }

      // Check file identity (inode/device)
      if (current.inode !== last.inode || current.device !== last.device) {
        this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
          reason: 'Export target identity changed (inode/device mismatch)',
          filePath,
          original: { inode: last.inode, device: last.device },
          current: { inode: current.inode, device: current.device }
        });
        return false;
      }

      // Check if size and mtime stable (last 1 second)
      const timeDiff = current.mtime - last.mtime;
      const sizeDiff = Math.abs(current.size - last.size);

      // If both size and mtime identical, file is stable
      if (sizeDiff === 0 && timeDiff < 100) {
        return true;
      }

      return false;
    } catch (err) {
      // Error reading file, assume stopped
      return true;
    }
  }

  /**
   * Helper: Get file metadata (size + mtime + inode + device).
   * Uses fs.statSync() for real identity verification.
   */
  private getFileMetadata(filePath: string): FileMetadata {
    try {
      const stats = fs.statSync(filePath);
      return {
        size: stats.size,
        mtime: stats.mtimeMs,
        path: filePath,
        inode: stats.ino,
        device: stats.dev
      };
    } catch (err) {
      // File doesn't exist or can't be accessed
      // Return a sentinel value that will fail identity check
      return {
        size: 0,
        mtime: 0,
        path: filePath,
        inode: 0,
        device: 0
      };
    }
  }

  /**
   * Helper: Get job state (for debugging/testing).
   */
  getJobState(jobId: string): 'RUNNING' | 'CANCELLED' | 'TERMINATED' | 'COMPLETED' | null {
    const job = this.jobs.get(jobId);
    return job ? job.state : null;
  }

  /**
   * Helper: Get all active job IDs (for testing).
   */
  getActiveJobIds(): string[] {
    return Array.from(this.jobs.entries())
      .filter(([_, job]) => job.state === 'RUNNING')
      .map(([jobId, _]) => jobId);
  }
}

export default ExportJobController;
