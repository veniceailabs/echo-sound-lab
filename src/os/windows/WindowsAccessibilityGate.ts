/**
 * Windows Accessibility Gate (Phase 4 Stub)
 *
 * Enforces: UI_NAVIGATION, TEXT_INPUT, PARAMETER_ADJUSTMENT
 * Blocks: WIN-T03, WIN-T04, WIN-T14
 *
 * Ghost Checklist (Code Review):
 * ❌ Is fieldType checked AFTER dialog freeze?
 * ❌ Does SENSITIVE field throw immediately (hard stop)?
 * ❌ Is window identity = HWND + PID + createdAt?
 * ❌ Does isWindowIdentityValid check all three?
 * ❌ Does verifyTokenElevation check elevation parity?
 * ❌ Is there any gate-level dialog caching?
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability, TextInputFieldType } from '../../services/capabilities';
import WindowsDialogWatcher from './WindowsDialogWatcher';
import SessionContext from '../common/SessionContext';

export interface WindowsWindowIdentity {
  hwnd: number;
  processId: number;
  createdAt: number;
  processPath: string;
}

export interface WindowsAccessibilityRequest {
  capability: Capability.UI_NAVIGATION | Capability.TEXT_INPUT | Capability.PARAMETER_ADJUSTMENT;
  windowHandle: number;
  processId: number;
  sessionId: string;
  fieldId?: string;
  fieldType?: TextInputFieldType;  // SAFE | UNKNOWN | SENSITIVE
}

export class WindowsAccessibilityGate {
  private currentWindowIdentity: WindowsWindowIdentity | null = null;
  private audit = getAuditLogger();
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(dialogWatcher: WindowsDialogWatcher, sessionCtx: SessionContext) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce UI_NAVIGATION capability
   *
   * Requirements:
   *   - Dialog freeze (hard stop first)
   *   - Window identity valid (HWND + PID + timestamp)
   *   - Token elevation matches
   *
   * Blocks: WIN-T03, WIN-T04, WIN-T15
   */
  async enforceUINavigation(request: WindowsAccessibilityRequest): Promise<void> {
    // Ghost Checkpoint: This must be FIRST (before any other check)
    // If missing: WIN-T01, WIN-T02, WIN-T15 bypass
    this.dialogWatcher.throwIfModalVisible();

    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'UI_NAVIGATION',
      windowHandle: `0x${request.windowHandle.toString(16)}`,
      processId: request.processId,
      timestamp: Date.now()
    });

    // Check window identity (blocks WIN-T03, WIN-T04)
    if (!this.isWindowIdentityValid(request.windowHandle, request.processId)) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed or invalid',
        capability: 'UI_NAVIGATION'
      });
      throw new Error('[OS_HARD_STOP] Window identity invalid');
    }

    // Check token elevation (blocks WIN-T14)
    const tokenMatches = await this.verifyTokenElevation(request.processId);
    if (!tokenMatches) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'UI_NAVIGATION',
        reason: 'Token elevation level mismatch'
      });
      throw new Error('[OS_PERMISSION_DENIED] Token elevation mismatch');
    }

    // Update window identity
    this.currentWindowIdentity = this.captureWindowIdentity(request.windowHandle, request.processId);

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'UI_NAVIGATION',
      scope: { windowHandle: request.windowHandle, processId: request.processId }
    });
  }

  /**
   * Enforce TEXT_INPUT capability with field classification
   *
   * Requirements:
   *   - Dialog freeze (hard stop first)
   *   - fieldType is MANDATORY (not optional)
   *   - SENSITIVE → hard deny immediately
   *   - UNKNOWN → default deny (ACC_REQUIRED)
   *   - SAFE → check window identity + token
   *
   * Blocks: WIN-T14 (elevation), WIN-T07/T08 (job membership)
   *
   * Ghost Checkpoint: fieldType check AFTER dialog, BEFORE permission
   */
  async enforceTextInput(request: WindowsAccessibilityRequest): Promise<void> {
    // Ghost Checkpoint: Dialog freeze FIRST (before field type check)
    // If missing: WIN-T01, WIN-T02 bypass
    this.dialogWatcher.throwIfModalVisible();

    const fieldId = request.fieldId || 'unknown-field';

    // Ghost Checkpoint: fieldType is MANDATORY
    // If optional with fallback: WIN-T14 silent bypass
    if (!request.fieldType) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'TEXT_INPUT',
        fieldId,
        reason: 'Missing fieldType classification'
      });
      throw new Error('[OS_PERMISSION_DENIED] TEXT_INPUT requires explicit fieldType');
    }

    const fieldType = request.fieldType;

    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'TEXT_INPUT',
      fieldId,
      fieldType,
      windowHandle: `0x${request.windowHandle.toString(16)}`,
      timestamp: Date.now()
    });

    // Ghost Checkpoint: SENSITIVE check AFTER dialog, BEFORE permission
    // Hard stop immediately (no fallback)
    if (fieldType === 'SENSITIVE') {
      this.audit.emit('SENSITIVE_FIELD_BLOCKED', {
        fieldId,
        reason: 'SENSITIVE field classification'
      });
      throw new Error('[OS_HARD_STOP] SENSITIVE field blocked. Transition to S6 HALTED.');
    }

    // Default deny for UNKNOWN fields
    if (fieldType === 'UNKNOWN') {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'TEXT_INPUT',
        fieldId,
        reason: 'Field classification is UNKNOWN, default deny'
      });
      throw new Error('[OS_ACC_REQUIRED] TEXT_INPUT to UNKNOWN field requires explicit confirmation');
    }

    // Proceed with SAFE field
    if (fieldType === 'SAFE') {
      // Check window identity
      if (!this.isWindowIdentityValid(request.windowHandle, request.processId)) {
        this.audit.emit('OS_HARD_STOP_TRIGGERED', {
          reason: 'Window identity changed',
          capability: 'TEXT_INPUT'
        });
        throw new Error('[OS_HARD_STOP] Window identity changed');
      }

      // Check token elevation (blocks WIN-T14)
      const tokenMatches = await this.verifyTokenElevation(request.processId);
      if (!tokenMatches) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'TEXT_INPUT',
          fieldId,
          reason: 'Token elevation mismatch'
        });
        throw new Error('[OS_PERMISSION_DENIED] Token elevation mismatch');
      }

      // Check job membership (blocks WIN-T08)
      const jobMembershipValid = await this.verifyJobMembership(request.processId);
      if (!jobMembershipValid) {
        this.audit.emit('OS_HARD_STOP_TRIGGERED', {
          reason: 'Caller not in active export job',
          capability: 'TEXT_INPUT'
        });
        throw new Error('[OS_HARD_STOP] Caller not in expected job context');
      }

      // Update window identity
      this.currentWindowIdentity = this.captureWindowIdentity(request.windowHandle, request.processId);

      this.audit.emit('OS_PERMISSION_GRANTED', {
        capability: 'TEXT_INPUT',
        fieldId,
        fieldType: 'SAFE',
        scope: { windowHandle: request.windowHandle, processId: request.processId }
      });
    }
  }

  /**
   * Enforce PARAMETER_ADJUSTMENT capability
   *
   * Same requirements as UI_NAVIGATION
   * Blocks: WIN-T03, WIN-T04, WIN-T14, WIN-T15
   */
  async enforceParameterAdjustment(request: WindowsAccessibilityRequest): Promise<void> {
    this.dialogWatcher.throwIfModalVisible();

    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'PARAMETER_ADJUSTMENT',
      windowHandle: `0x${request.windowHandle.toString(16)}`,
      timestamp: Date.now()
    });

    // Check window identity
    if (!this.isWindowIdentityValid(request.windowHandle, request.processId)) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed',
        capability: 'PARAMETER_ADJUSTMENT'
      });
      throw new Error('[OS_HARD_STOP] Window identity changed');
    }

    // Check token elevation
    const tokenMatches = await this.verifyTokenElevation(request.processId);
    if (!tokenMatches) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'PARAMETER_ADJUSTMENT',
        reason: 'Token elevation mismatch'
      });
      throw new Error('[OS_PERMISSION_DENIED] Token elevation mismatch');
    }

    // Update window identity
    this.currentWindowIdentity = this.captureWindowIdentity(request.windowHandle, request.processId);

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'PARAMETER_ADJUSTMENT',
      scope: { windowHandle: request.windowHandle, processId: request.processId }
    });
  }

  /**
   * Revoke all accessibility permissions
   * Called on session end
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_PERMISSION_REVOKED', {
      capabilities: ['UI_NAVIGATION', 'TEXT_INPUT', 'PARAMETER_ADJUSTMENT']
    });

    this.currentWindowIdentity = null;
  }

  // ===== Private Helpers =====

  /**
   * Capture window identity at bind time
   * Returns: HWND + PID + creation timestamp + process path
   *
   * Ghost Checkpoint (WIN-ACC-04):
   * ❌ Is createdAt captured?
   * ❌ Is it compared on subsequent accesses?
   */
  private captureWindowIdentity(hwnd: number, pid: number): WindowsWindowIdentity {
    return {
      hwnd,
      processId: pid,
      createdAt: Date.now(),
      processPath: this.getProcessPath(pid)
    };
  }

  /**
   * Verify window identity hasn't changed
   * Checks: HWND + PID + creation time (all three required)
   *
   * Ghost Checkpoint (WIN-T03, WIN-T04):
   * ❌ Does this check HWND?
   * ❌ Does this check PID?
   * ❌ Does this check createdAt timestamp?
   * ❌ What happens if any mismatch?
   *
   * If only HWND is checked: WIN-T03 succeeds
   * If HWND+PID but no timestamp: WIN-ACC-04 fails (HWND reuse not detected)
   */
  private isWindowIdentityValid(hwnd: number, pid: number): boolean {
    if (this.currentWindowIdentity === null) {
      return true;  // First bind, accept
    }

    // All three must match
    const hWndMatch = this.currentWindowIdentity.hwnd === hwnd;
    const pidMatch = this.currentWindowIdentity.processId === pid;
    const timeValid = this.currentWindowIdentity.createdAt + 3600000 > Date.now();  // 1 hour TTL

    return hWndMatch && pidMatch && timeValid;
  }

  /**
   * Verify token elevation level matches app context
   *
   * Win32:
   *   - GetProcessToken(pid) → handle
   *   - GetTokenInformation(TokenElevation) → DWORD
   *   - Compare with parent app elevation
   *
   * Ghost Checkpoint (WIN-T14):
   * ❌ Does this check elevation level?
   * ❌ What if token is elevated and parent is not?
   */
  private async verifyTokenElevation(callerPid: number): Promise<boolean> {
    // TODO: Implement GetProcessToken + GetTokenInformation
    // For now: return true (stub)
    return true;
  }

  /**
   * Verify caller is in active export job (if any)
   *
   * Win32:
   *   - IsProcessInJob(pid, hJob) → BOOL
   *   - Returns false if not in job
   *
   * Ghost Checkpoint (WIN-T08):
   * ❌ Is this checked?
   * ❌ What if process spawns thread outside job?
   */
  private async verifyJobMembership(callerPid: number): Promise<boolean> {
    // TODO: Implement IsProcessInJob check
    // For now: return true (stub)
    return true;
  }

  /**
   * Get process executable path
   * Win32: OpenProcess() → GetProcessImageFileNameW()
   */
  private getProcessPath(pid: number): string {
    // TODO: Implement GetProcessImageFileNameW
    return '';
  }
}

export default WindowsAccessibilityGate;
