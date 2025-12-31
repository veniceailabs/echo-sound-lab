/**
 * macOS Audit Emitter (Phase 3C macOS)
 *
 * Provides:
 * - TypeScript interfaces for all OS audit events
 * - Validation of required fields
 * - Single point of truth for OS event schema
 *
 * Requirement (PHASE3C_OS_ENFORCEMENT_SPEC.md):
 * "If it's not logged, it didn't happen."
 *
 * This module ensures all OS enforcement actions emit audit events
 * with correct, traceable schema.
 */

import { getAuditLogger } from '../../services/AuditLogger';

/**
 * OS Audit Event Types (per spec section 8)
 */
export type OSAuditEventType =
  | 'OS_PERMISSION_REQUESTED'
  | 'OS_PERMISSION_GRANTED'
  | 'OS_PERMISSION_DENIED'
  | 'OS_PERMISSION_REVOKED'
  | 'OS_HARD_STOP_TRIGGERED'
  | 'OS_EXECUTION_TERMINATED'
  | 'OS_DIALOG_DETECTED'
  | 'OS_DIALOG_CLEARED'
  | 'OS_DIALOG_PARTIALLY_CLEARED'
  | 'OS_DIALOG_SPECIFIC_CLEARED'
  | 'OS_DIALOG_FULLY_CLEARED'
  | 'OS_DIALOG_WATCHER_RESET'
  | 'OS_EXPORT_JOB_STARTED'
  | 'OS_EXPORT_JOB_CANCEL_REQUESTED'
  | 'OS_EXPORT_JOB_TERMINATED'
  | 'OS_EXPORT_JOB_COMPLETED'
  | 'OS_EXPORT_JOBS_REVOKED'
  | 'SENSITIVE_FIELD_BLOCKED'
  | 'OS_SESSION_ENDING'
  | 'OS_SESSION_ENDED';

/**
 * Type-safe event data interfaces
 */

export interface PermissionRequestedData {
  capability: string;
  filePath?: string;
  fieldId?: string;
  fieldType?: string;
  isExportPath?: boolean;
  timestamp: number;
}

export interface PermissionGrantedData {
  capability: string;
  filePath?: string;
  fieldId?: string;
  fieldType?: string;
  scope?: Record<string, any>;
  bookmarkId?: string;
  jobId?: string;
  timestamp?: number;
  reason?: string;
}

export interface PermissionDeniedData {
  capability: string;
  filePath?: string;
  fieldId?: string;
  reason: string;
}

export interface PermissionRevokedData {
  capabilities?: string[];
  capability?: string;
  reason: string;
  bookmarksCleared?: number;
}

export interface HardStopData {
  reason: string;
  capability?: string;
  oldWindowNumber?: number;
  newWindowNumber?: number;
  oldWindow?: string;
  newWindow?: string;
  oldSessionId?: string;
  newSessionId?: string;
  activeDialogs?: string[];
  jobId?: string;
  filePath?: string;
  timestamp?: number;
}

export interface DialogDetectedData {
  dialogId: string;
  type: 'permission' | 'authentication' | 'file_picker' | 'system_alert';
  details?: Record<string, any>;
  timestamp: number;
}

export interface DialogClearedData {
  timestamp: number;
  dialogId?: string;
  type?: string;
  remainingDialogs?: number;
  dialogsClearedCount?: number;
}

export interface ExportJobData {
  jobId: string;
  filePath: string;
  timestamp: number;
  reason?: string;
  state?: string;
  fileVerified?: boolean;
  count?: number;
}

export interface SensitiveFieldBlockedData {
  fieldId: string;
  reason: string;
  timestamp?: number;
}

export interface SessionData {
  sessionId: string;
  timestamp: number;
}

/**
 * Main emitter class
 */
export class MacOSAuditEmitter {
  private audit = getAuditLogger();

  /**
   * Emit OS_PERMISSION_REQUESTED event.
   * Fired when app requests OS permission for a capability.
   */
  emitPermissionRequested(data: PermissionRequestedData): void {
    if (!data.capability) {
      throw new Error('[AUDIT_VALIDATION] OS_PERMISSION_REQUESTED requires capability');
    }
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_PERMISSION_REQUESTED requires timestamp');
    }

    this.audit.emit('OS_PERMISSION_REQUESTED', data);
  }

  /**
   * Emit OS_PERMISSION_GRANTED event.
   * Fired when OS permits capability execution.
   */
  emitPermissionGranted(data: PermissionGrantedData): void {
    if (!data.capability) {
      throw new Error('[AUDIT_VALIDATION] OS_PERMISSION_GRANTED requires capability');
    }

    this.audit.emit('OS_PERMISSION_GRANTED', data);
  }

  /**
   * Emit OS_PERMISSION_DENIED event.
   * Fired when OS denies capability.
   */
  emitPermissionDenied(data: PermissionDeniedData): void {
    if (!data.capability) {
      throw new Error('[AUDIT_VALIDATION] OS_PERMISSION_DENIED requires capability');
    }
    if (!data.reason) {
      throw new Error('[AUDIT_VALIDATION] OS_PERMISSION_DENIED requires reason');
    }

    this.audit.emit('OS_PERMISSION_DENIED', data);
  }

  /**
   * Emit OS_PERMISSION_REVOKED event.
   * Fired when OS permissions revoked (session end, authority revocation).
   */
  emitPermissionRevoked(data: PermissionRevokedData): void {
    if (!data.reason) {
      throw new Error('[AUDIT_VALIDATION] OS_PERMISSION_REVOKED requires reason');
    }

    this.audit.emit('OS_PERMISSION_REVOKED', data);
  }

  /**
   * Emit OS_HARD_STOP_TRIGGERED event.
   * Fired when execution halts due to OS condition.
   */
  emitHardStopTriggered(data: HardStopData): void {
    if (!data.reason) {
      throw new Error('[AUDIT_VALIDATION] OS_HARD_STOP_TRIGGERED requires reason');
    }

    this.audit.emit('OS_HARD_STOP_TRIGGERED', data);
  }

  /**
   * Emit OS_EXECUTION_TERMINATED event.
   * Fired when execution terminates after hard stop.
   */
  emitExecutionTerminated(processId: number): void {
    this.audit.emit('OS_EXECUTION_TERMINATED', {
      processId,
      timestamp: Date.now()
    });
  }

  /**
   * Emit OS_DIALOG_DETECTED event.
   * Fired when OS-managed dialog becomes visible.
   */
  emitDialogDetected(data: DialogDetectedData): void {
    if (!data.dialogId) {
      throw new Error('[AUDIT_VALIDATION] OS_DIALOG_DETECTED requires dialogId');
    }
    if (!data.type) {
      throw new Error('[AUDIT_VALIDATION] OS_DIALOG_DETECTED requires type');
    }
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_DIALOG_DETECTED requires timestamp');
    }

    this.audit.emit('OS_DIALOG_DETECTED', data);
  }

  /**
   * Emit OS_DIALOG_CLEARED event.
   * Fired when all OS dialogs dismissed.
   */
  emitDialogCleared(data: DialogClearedData): void {
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_DIALOG_CLEARED requires timestamp');
    }

    this.audit.emit('OS_DIALOG_CLEARED', data);
  }

  /**
   * Emit OS_EXPORT_JOB_STARTED event.
   * Fired when export job starts.
   */
  emitExportJobStarted(data: ExportJobData): void {
    if (!data.jobId) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_STARTED requires jobId');
    }
    if (!data.filePath) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_STARTED requires filePath');
    }
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_STARTED requires timestamp');
    }

    this.audit.emit('OS_EXPORT_JOB_STARTED', data);
  }

  /**
   * Emit OS_EXPORT_JOB_CANCEL_REQUESTED event.
   * Fired when job cancellation requested.
   */
  emitExportJobCancelRequested(data: ExportJobData): void {
    if (!data.jobId) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_CANCEL_REQUESTED requires jobId');
    }
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_CANCEL_REQUESTED requires timestamp');
    }

    this.audit.emit('OS_EXPORT_JOB_CANCEL_REQUESTED', data);
  }

  /**
   * Emit OS_EXPORT_JOB_TERMINATED event.
   * Fired when job terminates (cancelled or failed).
   */
  emitExportJobTerminated(data: ExportJobData): void {
    if (!data.jobId) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_TERMINATED requires jobId');
    }
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_EXPORT_JOB_TERMINATED requires timestamp');
    }

    this.audit.emit('OS_EXPORT_JOB_TERMINATED', data);
  }

  /**
   * Emit SENSITIVE_FIELD_BLOCKED event.
   * Fired when TEXT_INPUT blocked on credential field.
   */
  emitSensitiveFieldBlocked(data: SensitiveFieldBlockedData): void {
    if (!data.fieldId) {
      throw new Error('[AUDIT_VALIDATION] SENSITIVE_FIELD_BLOCKED requires fieldId');
    }
    if (!data.reason) {
      throw new Error('[AUDIT_VALIDATION] SENSITIVE_FIELD_BLOCKED requires reason');
    }

    this.audit.emit('SENSITIVE_FIELD_BLOCKED', data);
  }

  /**
   * Emit OS_SESSION_ENDING event.
   * Fired when session teardown begins.
   */
  emitSessionEnding(data: SessionData): void {
    if (!data.sessionId) {
      throw new Error('[AUDIT_VALIDATION] OS_SESSION_ENDING requires sessionId');
    }
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_SESSION_ENDING requires timestamp');
    }

    this.audit.emit('OS_SESSION_ENDING', data);
  }

  /**
   * Emit OS_SESSION_ENDED event.
   * Fired when session fully torn down.
   */
  emitSessionEnded(data: SessionData): void {
    if (!data.timestamp) {
      throw new Error('[AUDIT_VALIDATION] OS_SESSION_ENDED requires timestamp');
    }

    this.audit.emit('OS_SESSION_ENDED', data);
  }
}

/**
 * Singleton instance
 */
export const osAuditEmitter = new MacOSAuditEmitter();

export default MacOSAuditEmitter;
