/**
 * Windows Dialog Watcher (Phase 4 Stub)
 *
 * Single source of truth for OS modal dialog detection.
 * Blocks: WIN-T01, WIN-T02, WIN-T15
 *
 * Ghost Checklist (Code Review):
 * ❌ Is throwIfModalVisible() called at entry of every enforce method?
 * ❌ Does EnumWindows filter for WS_DISABLED + system process?
 * ❌ Does isModalVisible reset when dialogs.size === 0?
 * ❌ Are OS_DIALOG_DETECTED/CLEARED events emitted?
 * ❌ Is there any gate-level dialog caching (must be removed)?
 */

import { getAuditLogger } from '../../services/AuditLogger';

export interface WindowsModalDialog {
  hwnd: number;         // HWND as number (cast from Win32)
  title: string;
  className: string;
  processId: number;
  isSystemOwned: boolean;  // TRUE only for OS-owned dialogs (not user app)
}

export class WindowsDialogWatcher {
  private dialogs = new Map<number, WindowsModalDialog>();
  private isModalVisible = false;
  private audit = getAuditLogger();
  private detectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start modal detection polling every 100ms
    this.startModalDetection();
  }

  /**
   * Hard stop if any OS dialog visible
   * Called at entry of every enforce method (UI_NAVIGATION, TEXT_INPUT, etc.)
   *
   * Ghost Checkpoint: This must be the FIRST line of every enforce() method
   * If missing: WIN-T01, WIN-T02, WIN-T15 all bypass
   */
  throwIfModalVisible(): void {
    if (this.isModalVisible) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'OS modal dialog visible',
        dialogCount: this.dialogs.size,
        timestamp: Date.now()
      });

      throw new Error('[OS_HARD_STOP] OS modal dialog visible, execution frozen');
    }
  }

  /**
   * Dialog detected event (called by adapter)
   * Routes to OSDialogWatcher, which updates isModalVisible
   *
   * Win32 Implementation:
   *   - EnumWindows to find OS-owned modals
   *   - Check WS_DISABLED style
   *   - Verify system process ownership
   *   - Only add to dialogs if isSystemOwned = true
   */
  onDialogDetected(dialogType: string, metadata?: any): void {
    // Placeholder: real impl uses EnumWindows + GetWindowLongPtr(GWL_STYLE)
    const hwnd = metadata?.hwnd ?? 0x0000;

    const dialog: WindowsModalDialog = {
      hwnd,
      title: metadata?.title ?? 'Unknown',
      className: metadata?.className ?? 'UnknownClass',
      processId: metadata?.processId ?? 0,
      isSystemOwned: this.isSystemOwnedDialog(hwnd, metadata?.processId)
    };

    // Only track system-owned dialogs
    if (dialog.isSystemOwned) {
      this.dialogs.set(hwnd, dialog);
      this.isModalVisible = true;

      this.audit.emit('OS_DIALOG_DETECTED', {
        hwnd: `0x${hwnd.toString(16)}`,
        title: dialog.title,
        className: dialog.className,
        processId: dialog.processId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Dialog cleared event (called by adapter)
   * Removes dialog from tracking
   *
   * Ghost Checkpoint: Must reset isModalVisible = false when dialogs.size === 0
   * If not: WIN-ACC-09 fails (stale freeze after clear)
   */
  onDialogCleared(dialogHwnd?: number): void {
    if (dialogHwnd !== undefined) {
      // Specific dialog cleared
      this.dialogs.delete(dialogHwnd);

      this.audit.emit('OS_DIALOG_CLEARED', {
        hwnd: `0x${dialogHwnd.toString(16)}`,
        timestamp: Date.now()
      });
    } else {
      // All dialogs cleared
      this.dialogs.clear();
    }

    // Reset modal state if no more dialogs
    if (this.dialogs.size === 0) {
      this.isModalVisible = false;
    }
  }

  /**
   * Revoke all permissions (called on session end)
   * Clear all tracked dialogs
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_DIALOG_WATCHER_RESET', {
      dialogCount: this.dialogs.size,
      timestamp: Date.now()
    });

    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }

    this.dialogs.clear();
    this.isModalVisible = false;
  }

  /**
   * Destructor / cleanup
   */
  destroy(): void {
    this.revokeAllPermissions();
  }

  // ===== Private Helpers =====

  /**
   * Start modal detection polling (every 100ms)
   * Continuously enumerates system dialogs
   */
  private startModalDetection(): void {
    this.detectionInterval = setInterval(() => {
      this.detectSystemModals();
    }, 100);
  }

  /**
   * Detect system-owned modal dialogs via EnumWindows
   * Filter: WS_DISABLED + system process
   *
   * Win32 calls:
   *   - EnumWindows()
   *   - GetWindowLongPtr(hwnd, GWL_STYLE)
   *   - GetWindowThreadProcessId(hwnd, &pid)
   *   - GetModuleFileNameEx(pid) to verify system process
   *
   * Ghost Checkpoint:
   * ❌ Does this filter for WS_DISABLED?
   * ❌ Does this verify system process (explorer.exe, dwm.exe, etc)?
   * ❌ Are user app dialogs excluded?
   */
  private detectSystemModals(): void {
    // Placeholder implementation
    // Real impl: EnumWindows() callback → filter → update Map

    const systemProcesses = new Set([
      'explorer.exe',
      'dwm.exe',
      'conhost.exe',
      'winlogon.exe',
      'lsass.exe'
    ]);

    const systemClasses = new Set([
      '#32770',        // Dialog class
      'ComboBox',
      'SysTreeView32'
    ]);

    // TODO: Implement EnumWindows polling
    // For now: stub returns empty (no modals detected)
  }

  /**
   * Verify dialog is system-owned (not user app)
   * Returns true only for OS dialogs
   *
   * Checks:
   *   - Process owner is system (explorer, dwm, conhost)
   *   - Window class is system class
   *
   * Ghost Checkpoint: If this returns true for user dialogs, WIN-T01 bypasses
   */
  private isSystemOwnedDialog(hwnd: number, pid: number): boolean {
    // Placeholder: real impl checks process name + class

    const systemProcesses = ['explorer.exe', 'dwm.exe', 'conhost.exe'];
    // const processName = getProcessNameByPid(pid);

    // TODO: Implement system process verification
    return false;  // Conservative: assume not system-owned until verified
  }

  /**
   * Get process executable path (for system verification)
   * Win32: OpenProcess() + GetProcessImageFileNameW()
   */
  private getProcessPath(pid: number): string {
    // TODO: Implement GetProcessImageFileNameW
    return '';
  }
}

export default WindowsDialogWatcher;
