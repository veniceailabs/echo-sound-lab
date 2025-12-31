/**
 * macOS Enforcement Adapter (Phase 3C macOS)
 *
 * Central coordinator routing capability requests to OS-level gates.
 *
 * Architecture:
 * 1. CapabilityAuthority decides: app-level permission (already granted?)
 * 2. MacOSEnforcementAdapter routes: to appropriate OS gate
 * 3. OS gates enforce: mechanical denial
 *
 * Constitutional Rules (PHASE3C_OS_ENFORCEMENT_SPEC.md):
 * - OS-INV-01: OS is gate not authority (routing only, no new decisions)
 * - OS-INV-02: Permission denial = immediate halt
 * - OS-INV-03: Revocation is immediate and total
 * - All hard stops enforced
 *
 * This layer adds NO new authority.
 * It only enforces existing authority at OS level.
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability, TextInputFieldType } from '../../services/capabilities';
import { CapabilityRequest, CapabilityGrant } from '../../services/capabilities';
import { CapabilityAuthority } from '../../services/CapabilityAuthority';

import AccessibilityGate, { AccessibilityRequest, WindowIdentity } from './AccessibilityGate';
import FileAccessGate, { FileAccessRequest, SecurityScopedBookmark } from './FileAccessGate';
import ExportJobController, { ExportJobRequest, ExportJobHandle } from './ExportJobController';
import OSDialogWatcher from './OSDialogWatcher';
import { getSharedOSDialogWatcher } from './getSharedOSDialogWatcher';
import {
  AccessibilityPermissionOracle,
  DefaultAccessibilityPermissionOracle
} from './AccessibilityPermissionOracle';
import SessionContext from '../common/SessionContext';

export interface ExecutionContext {
  sessionId: string;
  windowIdentity?: WindowIdentity;
  fieldId?: string; // For TEXT_INPUT
  fieldType?: TextInputFieldType; // For TEXT_INPUT classification
  filePath?: string; // For FILE_READ / FILE_WRITE
  isExportPath?: boolean; // For FILE_WRITE
}

export type CapabilityResult = CapabilityGrant | ExportJobHandle;

export class MacOSEnforcementAdapter {
  private accessibility: AccessibilityGate;
  private fileAccess: FileAccessGate;
  private exportJob: ExportJobController;
  private dialogWatcher: OSDialogWatcher;
  private sessionCtx: SessionContext;

  private currentWindowIdentity: WindowIdentity | null = null;
  private audit = getAuditLogger();

  constructor(
    private capabilityAuthority: CapabilityAuthority,
    permissionOracle: AccessibilityPermissionOracle = new DefaultAccessibilityPermissionOracle(),
    sessionCtx?: SessionContext
  ) {
    // Single shared watcher across adapter + all gates (prevents bypass)
    this.dialogWatcher = getSharedOSDialogWatcher();
    this.sessionCtx = sessionCtx ?? new SessionContext();

    // SINGLE SOURCE OF TRUTH — same instance everywhere
    this.accessibility = new AccessibilityGate(
      this.dialogWatcher,
      permissionOracle,
      this.sessionCtx
    );

    this.fileAccess = new FileAccessGate(
      this.dialogWatcher,
      this.sessionCtx
    );

    this.exportJob = new ExportJobController(
      this.dialogWatcher,
      this.sessionCtx
    );
  }

  /**
   * Main enforcement entry point.
   * Routes capability request through appropriate OS gate.
   * Enforces all hard stop conditions.
   *
   * Flow:
   * 1. Check dialog not visible (OS-INV-05)
   * 2. Verify process identity (C6)
   * 3. Route to appropriate gate
   * 4. Gate enforces mechanical denial
   * 5. Return grant or throw
   */
  async enforceCapability(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityResult> {
    // Check OS dialog not visible (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    // SINGLE SOURCE OF TRUTH: Session binding
    this.sessionCtx.bind(context.sessionId);
    this.sessionCtx.assert(context.sessionId);

    // Route to appropriate gate based on capability
    switch (request.capability) {
      case Capability.UI_NAVIGATION:
        return await this.enforceUINavigation(request, context);

      case Capability.TEXT_INPUT:
        return await this.enforceTextInput(request, context);

      case Capability.PARAMETER_ADJUSTMENT:
        return await this.enforceParameterAdjustment(request, context);

      case Capability.TRANSPORT_CONTROL:
        return await this.enforceTransportControl(request, context);

      case Capability.FILE_READ:
        return await this.enforceFileRead(request, context);

      case Capability.FILE_WRITE:
        return await this.enforceFileWrite(request, context);

      case Capability.RENDER_EXPORT:
        return await this.enforceRenderExport(request, context);

      default:
        throw new Error(`[OS_UNSUPPORTED_CAPABILITY] Unknown capability: ${request.capability}`);
    }
  }

  /**
   * Enforce UI_NAVIGATION capability.
   * Routes to AccessibilityGate.
   */
  private async enforceUINavigation(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityGrant> {
    if (!context.windowIdentity) {
      throw new Error('[OS_MISSING_CONTEXT] UI_NAVIGATION requires windowIdentity');
    }

    const accessibilityRequest: AccessibilityRequest = {
      capability: Capability.UI_NAVIGATION,
      windowIdentity: context.windowIdentity,
      sessionId: context.sessionId
    };

    await this.accessibility.enforceUINavigation(accessibilityRequest);

    // Update current window binding
    this.currentWindowIdentity = context.windowIdentity;
    this.currentSessionId = context.sessionId;

    return {
      capability: request.capability,
      scope: request.scope,
      expiresAt: Date.now() + 3600000, // Placeholder
      grantId: `grant-ui-nav-${Date.now()}`
    };
  }

  /**
   * Enforce TEXT_INPUT capability.
   * Routes to AccessibilityGate with field classification.
   */
  private async enforceTextInput(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityGrant> {
    if (!context.windowIdentity) {
      throw new Error('[OS_MISSING_CONTEXT] TEXT_INPUT requires windowIdentity');
    }

    if (!context.fieldType) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'TEXT_INPUT',
        reason: 'Missing fieldType classification'
      });
      throw new Error('[OS_PERMISSION_DENIED] TEXT_INPUT requires explicit fieldType');
    }

    if (!context.fieldId) {
      throw new Error('[OS_MISSING_CONTEXT] TEXT_INPUT requires fieldId');
    }

    const fieldType: TextInputFieldType = context.fieldType;

    const accessibilityRequest: AccessibilityRequest = {
      capability: Capability.TEXT_INPUT,
      windowIdentity: context.windowIdentity,
      sessionId: context.sessionId,
      fieldId: context.fieldId,
      fieldType
    };

    await this.accessibility.enforceTextInput(accessibilityRequest);

    // Update current window binding
    this.currentWindowIdentity = context.windowIdentity;
    this.currentSessionId = context.sessionId;

    return {
      capability: request.capability,
      scope: request.scope,
      expiresAt: Date.now() + 3600000,
      grantId: `grant-text-input-${Date.now()}`
    };
  }

  /**
   * Enforce PARAMETER_ADJUSTMENT capability.
   * Routes to AccessibilityGate.
   */
  private async enforceParameterAdjustment(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityGrant> {
    if (!context.windowIdentity) {
      throw new Error('[OS_MISSING_CONTEXT] PARAMETER_ADJUSTMENT requires windowIdentity');
    }

    const accessibilityRequest: AccessibilityRequest = {
      capability: Capability.PARAMETER_ADJUSTMENT,
      windowIdentity: context.windowIdentity,
      sessionId: context.sessionId
    };

    await this.accessibility.enforceParameterAdjustment(accessibilityRequest);

    // Update current window binding
    this.currentWindowIdentity = context.windowIdentity;
    this.currentSessionId = context.sessionId;

    return {
      capability: request.capability,
      scope: request.scope,
      expiresAt: Date.now() + 3600000,
      grantId: `grant-param-adjust-${Date.now()}`
    };
  }

  /**
   * Enforce TRANSPORT_CONTROL capability.
   * Routes to AccessibilityGate.
   */
  private async enforceTransportControl(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityGrant> {
    if (!context.windowIdentity) {
      throw new Error('[OS_MISSING_CONTEXT] TRANSPORT_CONTROL requires windowIdentity');
    }

    const accessibilityRequest: AccessibilityRequest = {
      capability: Capability.UI_NAVIGATION, // Uses same gate
      windowIdentity: context.windowIdentity
    };

    await this.accessibility.enforceUINavigation(accessibilityRequest);

    // Update current window binding
    this.currentWindowIdentity = context.windowIdentity;
    this.currentSessionId = context.sessionId;

    return {
      capability: request.capability,
      scope: request.scope,
      expiresAt: Date.now() + 3600000,
      grantId: `grant-transport-${Date.now()}`
    };
  }

  /**
   * Enforce FILE_READ capability.
   * Routes to FileAccessGate.
   * Requires security-scoped bookmark.
   */
  private async enforceFileRead(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityGrant> {
    if (!context.filePath) {
      throw new Error('[OS_MISSING_CONTEXT] FILE_READ requires filePath');
    }

    const fileAccessRequest: FileAccessRequest = {
      capability: Capability.FILE_READ,
      filePath: context.filePath,
      sessionId: context.sessionId
    };

    await this.fileAccess.enforceFileRead(fileAccessRequest);

    this.currentSessionId = context.sessionId;

    return {
      capability: request.capability,
      scope: request.scope,
      expiresAt: Date.now() + 3600000,
      grantId: `grant-file-read-${Date.now()}`
    };
  }

  /**
   * Enforce FILE_WRITE capability.
   * Routes to FileAccessGate.
   * Requires security-scoped bookmark for export path.
   */
  private async enforceFileWrite(request: CapabilityRequest, context: ExecutionContext): Promise<CapabilityGrant> {
    if (!context.filePath) {
      throw new Error('[OS_MISSING_CONTEXT] FILE_WRITE requires filePath');
    }

    const fileAccessRequest: FileAccessRequest = {
      capability: Capability.FILE_WRITE,
      filePath: context.filePath,
      isExportPath: context.isExportPath || false,
      sessionId: context.sessionId
    };

    await this.fileAccess.enforceFileWrite(fileAccessRequest);

    this.currentSessionId = context.sessionId;

    return {
      capability: request.capability,
      scope: request.scope,
      expiresAt: Date.now() + 3600000,
      grantId: `grant-file-write-${Date.now()}`
    };
  }

  /**
   * Enforce RENDER_EXPORT capability.
   * Routes to ExportJobController.
   * Returns killable job handle.
   */
  private async enforceRenderExport(request: CapabilityRequest, context: ExecutionContext): Promise<ExportJobHandle> {
    if (!context.filePath) {
      throw new Error('[OS_MISSING_CONTEXT] RENDER_EXPORT requires filePath');
    }

    const exportJobRequest: ExportJobRequest = {
      capability: Capability.RENDER_EXPORT,
      filePath: context.filePath,
      sessionId: context.sessionId
    };

    const jobHandle = await this.exportJob.enforceRenderExport(exportJobRequest);

    this.currentSessionId = context.sessionId;

    return jobHandle;
  }

  /**
   * Called when app window changes.
   * Enforces OS-REQ-05: Window identity binding.
   * Throws hard stop if window changed.
   */
  onWindowChanged(newWindowIdentity: WindowIdentity): void {
    if (this.currentWindowIdentity === null) {
      // First binding
      this.currentWindowIdentity = newWindowIdentity;
      return;
    }

    if (
      this.currentWindowIdentity.bundleId !== newWindowIdentity.bundleId ||
      this.currentWindowIdentity.processId !== newWindowIdentity.processId ||
      this.currentWindowIdentity.windowNumber !== newWindowIdentity.windowNumber
    ) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed',
        oldWindow: `${this.currentWindowIdentity.bundleId}:${this.currentWindowIdentity.windowNumber}`,
        newWindow: `${newWindowIdentity.bundleId}:${newWindowIdentity.windowNumber}`
      });

      this.accessibility.onWindowChanged(newWindowIdentity);

      throw new Error('[OS_HARD_STOP] Window changed, transition to S4 ACC_CHECKPOINT');
    }
  }

  /**
   * Called when app loses focus.
   * Enforces optional hard stop (default ON per OS-REQ-01).
   */
  onAppFocusLost(): void {
    this.audit.emit('OS_HARD_STOP_TRIGGERED', {
      reason: 'App lost focus'
    });

    this.accessibility.onFocusLost();

    throw new Error('[OS_HARD_STOP] App lost focus, execution paused');
  }

  /**
   * Called when session ends.
   * Enforces OS-INV-03: Revocation is immediate and total.
   * Clears all gates, terminates all jobs.
   */
  onSessionEnd(): void {
    this.audit.emit('OS_SESSION_ENDING', {
      sessionId: this.sessionCtx.get() ?? 'unknown',
      timestamp: Date.now()
    });

    // Revoke all gates
    this.accessibility.revokeAllPermissions();
    this.fileAccess.revokeAllPermissions();
    this.exportJob.revokeAllPermissions();
    this.dialogWatcher.revokeAllPermissions();

    // Clear bindings
    this.currentWindowIdentity = null;
    this.sessionCtx.revoke();

    this.audit.emit('OS_SESSION_ENDED', {
      timestamp: Date.now()
    });
  }

  /**
   * Called when OS-managed dialog detected.
   * Enforces OS-INV-05: Dialog presence freezes execution.
   */
  onOSDialogDetected(
    dialogType: 'permission' | 'authentication' | 'file_picker' | 'system_alert',
    details?: Record<string, any>
  ): void {
    this.dialogWatcher.onDialogDetected(dialogType, details);
  }

  /**
   * Called when OS dialog dismissed.
   * Allows execution to resume.
   */
  onOSDialogCleared(): void {
    this.dialogWatcher.onDialogCleared();
  }

  /**
   * Called when specific dialog dismissed by ID.
   */
  onSpecificDialogCleared(dialogId: string): void {
    this.dialogWatcher.onSpecificDialogCleared(dialogId);
  }

  /**
   * Helper: Request security-scoped bookmark for file access.
   * Used by app to trigger macOS file picker.
   */
  async requestFileAccessBookmark(
    filePath: string,
    sessionId: string,
    isExportPath: boolean = false
  ): Promise<SecurityScopedBookmark> {
    return this.fileAccess.requestSecurityScopedAccess(filePath, sessionId, isExportPath);
  }

  /**
   * Helper: Get current window identity.
   */
  getCurrentWindowIdentity(): WindowIdentity | null {
    return this.currentWindowIdentity;
  }

  /**
   * Helper: Get current session ID.
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Helper: Check if dialog visible.
   */
  isOSDialogVisible(): boolean {
    return this.dialogWatcher.isDialogCurrentlyVisible();
  }

  /**
   * Helper: Get active export job IDs.
   */
  getActiveExportJobs(): string[] {
    return this.exportJob.getActiveJobIds();
  }
}

export default MacOSEnforcementAdapter;
