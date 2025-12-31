/**
 * Windows Enforcement Adapter (Phase 4 Stub)
 *
 * Central routing + coordination between capability requests and gates
 * Single shared instance ensures all gates use same dialog watcher + session context
 *
 * Ghost Checklist (Code Review):
 * ❌ Do all gates receive same WindowsDialogWatcher instance?
 * ❌ Do all gates receive same SessionContext instance?
 * ❌ Is capability routing exhaustive (all cases handled)?
 * ❌ Are dialog/session lifecycle events routed correctly?
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { CapabilityAuthority } from '../../services/CapabilityAuthority';
import { Capability, TextInputFieldType } from '../../services/capabilities';

import WindowsDialogWatcher from './WindowsDialogWatcher';
import WindowsAccessibilityGate, { WindowsAccessibilityRequest } from './WindowsAccessibilityGate';
import WindowsFileAccessGate, { FileAccessRequest } from './WindowsFileAccessGate';
import WindowsExportJobController, { ExportJobRequest, WindowsExportJobHandle } from './WindowsExportJobController';

import SessionContext from '../common/SessionContext';
import { getSharedWindowsDialogWatcher } from './getSharedWindowsDialogWatcher';

export interface ExecutionContext {
  sessionId: string;
  windowHandle?: number;
  processId?: number;
  fieldId?: string;
  fieldType?: TextInputFieldType;
  filePath?: string;
  isExportPath?: boolean;
}

export class WindowsEnforcementAdapter {
  private accessibilityGate: WindowsAccessibilityGate;
  private fileAccessGate: WindowsFileAccessGate;
  private exportJobController: WindowsExportJobController;
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;
  private audit = getAuditLogger();

  constructor(authority?: CapabilityAuthority, reserved?: any, sessionCtx?: SessionContext) {
    // Use shared dialog watcher (singleton)
    // Ghost Checkpoint: Same instance across all gates
    this.dialogWatcher = getSharedWindowsDialogWatcher();

    // Use provided or create new session context
    this.sessionCtx = sessionCtx || new SessionContext();

    // Instantiate gates (all share same dialogWatcher + sessionCtx)
    this.accessibilityGate = new WindowsAccessibilityGate(this.dialogWatcher, this.sessionCtx);
    this.fileAccessGate = new WindowsFileAccessGate(this.dialogWatcher, this.sessionCtx);
    this.exportJobController = new WindowsExportJobController(this.dialogWatcher, this.sessionCtx);
  }

  /**
   * Main enforcement entry point
   * Routes capability request to appropriate gate
   *
   * Ghost Checkpoint:
   * ❌ Are all capabilities handled?
   * ❌ Is routing exhaustive (no fallthrough)?
   */
  async enforceCapability(
    capabilityRequest: any,
    context: ExecutionContext
  ): Promise<any> {
    const capability = capabilityRequest.capability;

    switch (capability) {
      case Capability.UI_NAVIGATION:
        return await this.accessibilityGate.enforceUINavigation({
          capability,
          windowHandle: context.windowHandle!,
          processId: context.processId!,
          sessionId: context.sessionId
        });

      case Capability.TEXT_INPUT:
        return await this.accessibilityGate.enforceTextInput({
          capability,
          windowHandle: context.windowHandle!,
          processId: context.processId!,
          sessionId: context.sessionId,
          fieldId: context.fieldId,
          fieldType: context.fieldType
        });

      case Capability.PARAMETER_ADJUSTMENT:
        return await this.accessibilityGate.enforceParameterAdjustment({
          capability,
          windowHandle: context.windowHandle!,
          processId: context.processId!,
          sessionId: context.sessionId
        });

      case Capability.FILE_READ:
        return await this.fileAccessGate.enforceFileRead({
          capability,
          filePath: context.filePath!,
          sessionId: context.sessionId
        });

      case Capability.FILE_WRITE:
        return await this.fileAccessGate.enforceFileWrite({
          capability,
          filePath: context.filePath!,
          isExportPath: context.isExportPath,
          sessionId: context.sessionId
        });

      case Capability.RENDER_EXPORT:
        return await this.enforceRenderExport(context);

      default:
        throw new Error(`[GATE_ERROR] Unknown capability: ${capability}`);
    }
  }

  /**
   * Enforce RENDER_EXPORT (returns killable job handle)
   */
  private async enforceRenderExport(context: ExecutionContext): Promise<WindowsExportJobHandle> {
    const handle = await this.exportJobController.enforceRenderExport({
      capability: Capability.RENDER_EXPORT,
      filePath: context.filePath!,
      sessionId: context.sessionId
    });

    return handle;
  }

  /**
   * Dialog detection event (called by macOS/Windows UI layer)
   * Routes to shared WindowsDialogWatcher
   *
   * Ghost Checkpoint:
   * ❌ Does this route to dialogWatcher (not gate-level)?
   */
  onOSDialogDetected(dialogType: string, metadata?: any): void {
    this.dialogWatcher.onDialogDetected(dialogType, metadata);
  }

  /**
   * Dialog cleared event
   * Routes to shared WindowsDialogWatcher
   */
  onOSDialogCleared(dialogHwnd?: number): void {
    this.dialogWatcher.onDialogCleared(dialogHwnd);
  }

  /**
   * Session end → revoke all permissions
   * Called on crash, logout, or normal exit
   *
   * Ghost Checkpoint:
   * ❌ Are all gates revoked?
   * ❌ Is sessionCtx.revoke() called?
   */
  onSessionEnd(sessionId?: string): void {
    this.audit.emit('OS_SESSION_ENDING', {
      sessionId: sessionId || this.sessionCtx.get(),
      timestamp: Date.now()
    });

    this.accessibilityGate.revokeAllPermissions();
    this.fileAccessGate.revokeAllPermissions();
    this.exportJobController.revokeAllPermissions();
    this.dialogWatcher.revokeAllPermissions();

    if (sessionId) {
      this.sessionCtx.revoke(sessionId);
    }

    this.audit.emit('OS_SESSION_ENDED', {
      sessionId: sessionId || this.sessionCtx.get(),
      timestamp: Date.now()
    });
  }
}

export default WindowsEnforcementAdapter;
