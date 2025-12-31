/**
 * Windows Export Job Controller (Phase 4 Stub)
 *
 * Enforces: RENDER_EXPORT (killable job objects)
 * Blocks: WIN-T05, WIN-T07, WIN-T08, WIN-T11
 *
 * Ghost Checklist (Code Review):
 * ❌ Is CreateJobObject implemented?
 * ❌ Is JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE set?
 * ❌ Is TerminateJobObject called in revokeAllPermissions?
 * ❌ Does getFileMetadata capture volume + object ID?
 * ❌ Does verifyFileStoppedChanging check identity FIRST?
 * ❌ Is startFileChangeWatcher called (not skipped)?
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability } from '../../services/capabilities';
import WindowsDialogWatcher from './WindowsDialogWatcher';
import SessionContext from '../common/SessionContext';

export interface WindowsFileMetadata {
  size: number;
  mtime: number;
  path: string;
  volumeSerialNumber: number;
  fileIndexHigh: number;
  fileIndexLow: number;
}

export interface ExportJobRequest {
  capability: Capability.RENDER_EXPORT;
  filePath: string;
  sessionId: string;
}

export interface WindowsExportJobHandle {
  jobId: string;
  jobObject: number;  // Win32 HANDLE as number
  filePath: string;
  startTime: number;
  state: 'RUNNING' | 'CANCELLED' | 'TERMINATED' | 'COMPLETED';
  cancel: () => Promise<void>;
}

export class WindowsExportJobController {
  private jobs = new Map<string, WindowsExportJobHandle>();
  private jobSessions = new Map<string, string>();
  private fileWatchers = new Map<string, NodeJS.Timeout>();
  private lastFileState = new Map<string, WindowsFileMetadata>();
  private audit = getAuditLogger();
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(dialogWatcher: WindowsDialogWatcher, sessionCtx: SessionContext) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce RENDER_EXPORT capability
   * Creates killable job object with all spawned processes
   *
   * Returns: killable handle with cancel() method
   *
   * Blocks: WIN-T05 (inherited handles), WIN-T07, WIN-T08 (job escape)
   *
   * Ghost Checkpoint:
   * ❌ Is CreateJobObject called?
   * ❌ Is enforceKillOnJobClose called?
   */
  async enforceRenderExport(request: ExportJobRequest): Promise<WindowsExportJobHandle> {
    this.dialogWatcher.throwIfModalVisible();

    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'RENDER_EXPORT',
      filePath: request.filePath,
      timestamp: Date.now()
    });

    const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Ghost Checkpoint (WIN-T07, WIN-T08): Create job object
    // If this is skipped or fails silently: WIN-ACC-02 fails
    const jobObject = this.createJobObject(jobId);
    if (!jobObject) {
      throw new Error('[JOB_CREATE_FAILED] Could not create Windows job object');
    }

    // Ghost Checkpoint (WIN-T07): Set KILL_ON_JOB_CLOSE
    // If this is not called: WIN-ACC-02 fails (child processes survive)
    this.enforceKillOnJobClose(jobObject);

    const handle: WindowsExportJobHandle = {
      jobId,
      jobObject,
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
   * Cancel job explicitly
   * Terminates all processes in job object
   * Verifies output file stopped changing
   *
   * Blocks: WIN-T05, WIN-T07, WIN-T08, WIN-T11
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

    // Terminate job object (kills all child processes)
    this.terminateJobObject(job.jobObject);
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
   * Mark job as completed successfully
   * Called when export finishes normally
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
   * Revoke all export jobs
   * Called on session end
   * Terminates all running jobs and verifies files stopped changing
   *
   * Ghost Checkpoint (WIN-ACC-02, WIN-T05, WIN-T07):
   * ❌ Is TerminateJobObject called for each job?
   * If not: WIN-ACC-02 fails (jobs continue after session end)
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

        // Terminate job object
        this.terminateJobObject(job.jobObject);
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
    for (const [_, watcher] of this.fileWatchers) {
      clearInterval(watcher);
    }
    this.fileWatchers.clear();
  }

  // ===== Private Helpers =====

  /**
   * Create Win32 job object
   * All render processes assigned to this job
   *
   * Win32:
   *   - CreateJobObject(nullptr, jobName) → HANDLE
   *
   * Ghost Checkpoint (WIN-T07, WIN-T08):
   * ❌ Does this return non-null HANDLE?
   */
  private createJobObject(jobId: string): number | null {
    // TODO: Implement CreateJobObject
    // For now: stub returns null (indicates failure)
    return null;
  }

  /**
   * Enforce JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
   * All processes in job die when job closes
   *
   * Win32:
   *   - SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, ...)
   *   - Set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE flag
   *
   * Ghost Checkpoint (WIN-T07):
   * ❌ Is this called?
   * If not: child processes survive job termination
   */
  private enforceKillOnJobClose(jobObject: number): void {
    // TODO: Implement SetInformationJobObject with KILL_ON_JOB_CLOSE
  }

  /**
   * Terminate job object (kills all child processes)
   *
   * Win32:
   *   - TerminateJobObject(hJob, 0) → BOOL
   *
   * Ghost Checkpoint (WIN-T07, WIN-T08):
   * ❌ Is TerminateJobObject called?
   */
  private terminateJobObject(jobObject: number): void {
    // TODO: Implement TerminateJobObject
  }

  /**
   * Start file change watcher
   * Polls file size + object ID every 500ms
   *
   * Ghost Checkpoint (WIN-ACC-06):
   * ❌ Is this actually called (not skipped)?
   * If skipped: WIN-ACC-06 fails (no file change tracking)
   */
  private startFileChangeWatcher(jobId: string, filePath: string): void {
    const initial = this.getFileMetadata(filePath);
    this.lastFileState.set(filePath, initial);

    const watcher = setInterval(() => {
      try {
        const current = this.getFileMetadata(filePath);
        this.lastFileState.set(filePath, current);
      } catch (err) {
        // File may not exist yet
      }
    }, 500);

    this.fileWatchers.set(jobId, watcher);
  }

  /**
   * Verify file stopped changing
   * Checks: identity stable, size + mtime stable
   *
   * Ghost Checkpoint (WIN-T11, WIN-ACC-06):
   * ❌ Is identity checked FIRST (before size/mtime)?
   * If not: hardlink swap (WIN-T09) or volume move (WIN-T11) succeeds
   */
  private verifyFileStoppedChanging(filePath: string): boolean {
    try {
      const current = this.getFileMetadata(filePath);
      const last = this.lastFileState.get(filePath);

      if (!last) {
        return false;
      }

      // Ghost Checkpoint: Check identity FIRST
      // Identity change = file was swapped
      if (
        current.volumeSerialNumber !== last.volumeSerialNumber ||
        current.fileIndexHigh !== last.fileIndexHigh ||
        current.fileIndexLow !== last.fileIndexLow
      ) {
        this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
          reason: 'Export target identity changed (volume or object ID)',
          filePath,
          original: {
            volumeSerial: last.volumeSerialNumber,
            objectId: `${last.fileIndexHigh}:${last.fileIndexLow}`
          },
          current: {
            volumeSerial: current.volumeSerialNumber,
            objectId: `${current.fileIndexHigh}:${current.fileIndexLow}`
          }
        });
        return false;
      }

      // Then check size + mtime
      const timeDiff = current.mtime - last.mtime;
      const sizeDiff = Math.abs(current.size - last.size);

      if (sizeDiff === 0 && timeDiff < 100) {
        return true;
      }

      return false;
    } catch (err) {
      return true;  // Error reading file, assume stopped
    }
  }

  /**
   * Get file metadata (size + mtime + object ID)
   *
   * Win32:
   *   - CreateFileA() with FILE_SHARE_READ
   *   - GetFileInformationByHandle() → BY_HANDLE_FILE_INFORMATION
   *   - Extract: nFileSizeLow, ftLastWriteTime, nFileIndexHigh/Low, dwVolumeSerialNumber
   *
   * Ghost Checkpoint (WIN-ACC-06):
   * ❌ Are volume + objectId captured (not just size/mtime)?
   */
  private getFileMetadata(filePath: string): WindowsFileMetadata {
    // TODO: Implement GetFileInformationByHandle
    // For now: stub returns zeros

    return {
      size: 0,
      mtime: 0,
      path: filePath,
      volumeSerialNumber: 0,
      fileIndexHigh: 0,
      fileIndexLow: 0
    };
  }
}

export default WindowsExportJobController;
