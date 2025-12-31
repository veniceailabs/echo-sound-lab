/**
 * OS Dialog Watcher (Phase 3C macOS)
 *
 * Enforces:
 * - OS dialog detection
 * - Execution freeze while dialog visible
 * - Execution resume after dialog dismissed
 *
 * Constitutional Rules (PHASE3C_OS_ENFORCEMENT_SPEC.md):
 * - OS-INV-05: OS dialog presence freezes execution
 * - OS-REQ-05: Window + PID binding enforcement (dialogs trigger window bind reset)
 *
 * This is a gate, not an authority.
 * It enforces denial. It does not grant.
 */

import { getAuditLogger } from '../../services/AuditLogger';

export interface DetectedDialog {
  id: string;
  type: 'permission' | 'authentication' | 'file_picker' | 'system_alert';
  detectedAt: number;
  details?: Record<string, any>;
}

export class OSDialogWatcher {
  private dialogs = new Map<string, DetectedDialog>();
  private isDialogVisible = false;
  private audit = getAuditLogger();

  /**
   * Called when macOS detects an OS-managed dialog.
   * Triggers hard stop: all execution halts until dialog dismissed.
   * Enforces OS-INV-05: OS dialog presence freezes execution.
   */
  onDialogDetected(
    dialogType: 'permission' | 'authentication' | 'file_picker' | 'system_alert',
    details?: Record<string, any>
  ): void {
    // Set flag immediately (hard stop)
    this.isDialogVisible = true;

    // Create dialog record
    const dialogId = `dialog-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const dialog: DetectedDialog = {
      id: dialogId,
      type: dialogType,
      detectedAt: Date.now(),
      details
    };

    this.dialogs.set(dialogId, dialog);

    this.audit.emit('OS_DIALOG_DETECTED', {
      dialogId: dialogId.substring(0, 6),
      type: dialogType,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Called when OS dialog is dismissed.
   * Allows execution to resume.
   * Enforces OS-INV-05 completion: Execution may resume after dialog dismissal.
   */
  onDialogCleared(): void {
    // Check if any dialogs still visible
    const remainingDialogs = Array.from(this.dialogs.values());

    if (remainingDialogs.length === 0) {
      this.isDialogVisible = false;

      this.audit.emit('OS_DIALOG_CLEARED', {
        timestamp: Date.now()
      });
    } else {
      // Another dialog still visible, keep freeze
      this.audit.emit('OS_DIALOG_PARTIALLY_CLEARED', {
        remainingDialogs: remainingDialogs.length,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Called when specific dialog is dismissed by ID.
   * Allows fine-grained dialog lifecycle tracking.
   */
  onSpecificDialogCleared(dialogId: string): void {
    const dialog = this.dialogs.get(dialogId);

    if (!dialog) {
      return; // Dialog not tracked, ignore
    }

    // Remove dialog from tracking
    this.dialogs.delete(dialogId);

    this.audit.emit('OS_DIALOG_SPECIFIC_CLEARED', {
      dialogId: dialogId.substring(0, 6),
      type: dialog.type,
      timestamp: Date.now()
    });

    // Check if any dialogs still visible
    if (this.dialogs.size === 0) {
      this.isDialogVisible = false;

      this.audit.emit('OS_DIALOG_FULLY_CLEARED', {
        timestamp: Date.now()
      });
    }
  }

  /**
   * Check if OS dialog currently visible.
   * Used by accessibility gates to decide whether to throw hard stop.
   */
  isDialogCurrentlyVisible(): boolean {
    return this.isDialogVisible;
  }

  /**
   * Throw hard stop if dialog visible.
   * Called from AccessibilityGate, FileAccessGate, ExportJobController.
   * Enforces OS-INV-05: Execution must halt while dialog present.
   */
  throwIfDialogVisible(): void {
    if (this.isDialogVisible) {
      const activeDialogs = Array.from(this.dialogs.values()).map(d => d.type);

      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'OS dialog present, execution frozen',
        activeDialogs,
        timestamp: Date.now()
      });

      throw new Error('[OS_HARD_STOP] OS dialog present, execution frozen');
    }
  }

  /**
   * Clear all dialog tracking.
   * Called on session end.
   * Resets watcher to clean state.
   */
  revokeAllPermissions(): void {
    const clearedCount = this.dialogs.size;

    this.audit.emit('OS_DIALOG_WATCHER_RESET', {
      dialogsClearedCount: clearedCount,
      timestamp: Date.now()
    });

    this.dialogs.clear();
    this.isDialogVisible = false;
  }

  /**
   * Helper: Get all active dialogs (for testing/debugging).
   */
  getActiveDialogs(): DetectedDialog[] {
    return Array.from(this.dialogs.values());
  }

  /**
   * Helper: Get dialog count.
   */
  getDialogCount(): number {
    return this.dialogs.size;
  }

  /**
   * Helper: Check if specific dialog type visible.
   */
  isDialogTypeVisible(type: 'permission' | 'authentication' | 'file_picker' | 'system_alert'): boolean {
    return Array.from(this.dialogs.values()).some(d => d.type === type);
  }
}

export default OSDialogWatcher;
