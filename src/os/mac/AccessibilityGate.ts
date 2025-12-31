/**
 * Accessibility Gate (Phase 3C macOS)
 *
 * Enforces:
 * - UI_NAVIGATION
 * - TEXT_INPUT (with SAFE|UNKNOWN|SENSITIVE classification)
 * - PARAMETER_ADJUSTMENT
 *
 * Constitutional Rules (PHASE3C_OS_ENFORCEMENT_SPEC.md):
 * - OS-REQ-04: TEXT_INPUT field classification (mandatory)
 * - OS-REQ-05: Window + PID binding enforcement
 * - OS-INV-02: Permission denial = immediate halt
 * - OS-INV-05: OS dialog presence freezes execution
 *
 * This is a gate, not an authority.
 * It enforces denial. It does not grant.
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability, TextInputFieldType } from '../../services/capabilities';
import OSDialogWatcher from './OSDialogWatcher';
import { getSharedOSDialogWatcher } from './getSharedOSDialogWatcher';
import {
  AccessibilityPermissionOracle,
  DefaultAccessibilityPermissionOracle
} from './AccessibilityPermissionOracle';
import SessionContext from '../common/SessionContext';

export interface WindowIdentity {
  bundleId: string;
  processId: number;
  windowNumber: number;
}

export interface AccessibilityRequest {
  capability: Capability.UI_NAVIGATION | Capability.TEXT_INPUT | Capability.PARAMETER_ADJUSTMENT;
  windowIdentity: WindowIdentity;
  sessionId: string;
  fieldId?: string; // For TEXT_INPUT
  fieldType?: TextInputFieldType; // For TEXT_INPUT classification
}

export class AccessibilityGate {
  private currentWindowIdentity: WindowIdentity | null = null;
  private audit = getAuditLogger();
  private dialogWatcher: OSDialogWatcher;
  private permissionOracle: AccessibilityPermissionOracle;
  private sessionCtx: SessionContext;

  constructor(
    dialogWatcher: OSDialogWatcher,
    permissionOracle: AccessibilityPermissionOracle,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.permissionOracle = permissionOracle;
    this.sessionCtx = sessionCtx;
  }


  /**
   * Enforce UI_NAVIGATION capability.
   * Requires:
   * - Accessibility permission granted
   * - Window identity matches bound identity
   * - No OS dialog visible
   */
  async enforceUINavigation(request: AccessibilityRequest): Promise<void> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    // Session binding assertion (single source of truth)
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'UI_NAVIGATION',
      windowIdentity: request.windowIdentity,
      timestamp: Date.now()
    });

    // Check Accessibility permission
    const hasPermission = await this.permissionOracle.isGranted();
    if (!hasPermission) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'UI_NAVIGATION',
        reason: 'Accessibility permission not granted'
      });
      throw new Error('[OS_PERMISSION_DENIED] Accessibility permission not granted');
    }

    // Check window identity hasn't changed
    if (!this.isWindowIdentityValid(request.windowIdentity)) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed',
        capability: 'UI_NAVIGATION'
      });
      throw new Error('[OS_HARD_STOP] Window identity changed');
    }

    // (legacy flag retained) — source of truth is dialogWatcher.throwIfDialogVisible()

    // Update current window identity
    this.currentWindowIdentity = request.windowIdentity;

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'UI_NAVIGATION',
      scope: { windowIdentity: request.windowIdentity }
    });
  }

  /**
   * Enforce TEXT_INPUT capability with field classification.
   *
   * Constitutional Rule (OS-REQ-04):
   * - SAFE fields: allowed
   * - UNKNOWN fields: default to deny + ACC
   * - SENSITIVE fields: hard deny + S6 HALTED
   */
  async enforceTextInput(request: AccessibilityRequest): Promise<void> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    const fieldId = request.fieldId || 'unknown-field';

    if (!request.fieldType) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'TEXT_INPUT',
        fieldId,
        reason: 'Missing fieldType classification'
      });
      throw new Error('[OS_PERMISSION_DENIED] TEXT_INPUT requires explicit fieldType');
    }

    const fieldType = request.fieldType;

    // Session binding assertion (single source of truth)
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'TEXT_INPUT',
      fieldId,
      fieldType,
      windowIdentity: request.windowIdentity,
      timestamp: Date.now()
    });

    // Hard deny for SENSITIVE fields
    if (fieldType === 'SENSITIVE') {
      this.audit.emit('SENSITIVE_FIELD_BLOCKED', {
        fieldId,
        reason: 'SENSITIVE field classification'
      });
      throw new Error('[OS_HARD_STOP] SENSITIVE field blocked. Transition to S6 HALTED.');
    }

    // Default deny for UNKNOWN fields (requires ACC)
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
      // Check Accessibility permission
      const hasPermission = await this.permissionOracle.isGranted();
      if (!hasPermission) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'TEXT_INPUT',
          fieldId,
          reason: 'Accessibility permission not granted'
        });
        throw new Error('[OS_PERMISSION_DENIED] Accessibility permission not granted');
      }

      // Check window identity
      if (!this.isWindowIdentityValid(request.windowIdentity)) {
        this.audit.emit('OS_HARD_STOP_TRIGGERED', {
          reason: 'Window identity changed',
          capability: 'TEXT_INPUT'
        });
        throw new Error('[OS_HARD_STOP] Window identity changed');
      }

      // (legacy flag retained) — source of truth is dialogWatcher.throwIfDialogVisible()

      // Update current window identity
      this.currentWindowIdentity = request.windowIdentity;

      this.audit.emit('OS_PERMISSION_GRANTED', {
        capability: 'TEXT_INPUT',
        fieldId,
        fieldType: 'SAFE',
        scope: { windowIdentity: request.windowIdentity, fieldId }
      });
    }
  }

  /**
   * Enforce PARAMETER_ADJUSTMENT capability.
   * Requires:
   * - Accessibility permission granted
   * - Window identity matches bound identity
   * - No OS dialog visible
   */
  async enforceParameterAdjustment(request: AccessibilityRequest): Promise<void> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    // Session binding assertion (single source of truth)
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'PARAMETER_ADJUSTMENT',
      windowIdentity: request.windowIdentity,
      timestamp: Date.now()
    });

    // Check Accessibility permission
    const hasPermission = await this.permissionOracle.isGranted();
    if (!hasPermission) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'PARAMETER_ADJUSTMENT',
        reason: 'Accessibility permission not granted'
      });
      throw new Error('[OS_PERMISSION_DENIED] Accessibility permission not granted');
    }

    // Check window identity hasn't changed
    if (!this.isWindowIdentityValid(request.windowIdentity)) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed',
        capability: 'PARAMETER_ADJUSTMENT'
      });
      throw new Error('[OS_HARD_STOP] Window identity changed');
    }

    // (legacy flag retained) — source of truth is dialogWatcher.throwIfDialogVisible()

    // Update current window identity
    this.currentWindowIdentity = request.windowIdentity;

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'PARAMETER_ADJUSTMENT',
      scope: { windowIdentity: request.windowIdentity }
    });
  }

  /**
   * Called when app loses focus or window changes.
   * Triggers transition to S4 ACC_CHECKPOINT.
   */
  onWindowChanged(newWindowIdentity: WindowIdentity): void {
    if (this.currentWindowIdentity === null) {
      return; // No prior window binding
    }

    if (this.currentWindowIdentity.windowNumber !== newWindowIdentity.windowNumber) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window changed',
        oldWindowNumber: this.currentWindowIdentity.windowNumber,
        newWindowNumber: newWindowIdentity.windowNumber
      });

      // Clear window identity to force re-check on next access
      this.currentWindowIdentity = null;

      throw new Error('[OS_WINDOW_CHANGED] Window changed, transition to S4 ACC_CHECKPOINT');
    }
  }

  /**
   * Called when app loses focus.
   * Optional hard stop (configurable, default ON per OS-REQ-01).
   */
  onFocusLost(): void {
    this.audit.emit('OS_HARD_STOP_TRIGGERED', {
      reason: 'App lost focus'
    });

    // Clear window identity
    this.currentWindowIdentity = null;

    // This triggers session pause by default
    throw new Error('[OS_FOCUS_LOST] App lost focus, execution paused');
  }

  /**
   * Revoke all Accessibility permissions.
   * Called on session end or authority revocation.
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_PERMISSION_REVOKED', {
      capabilities: ['UI_NAVIGATION', 'TEXT_INPUT', 'PARAMETER_ADJUSTMENT']
    });

    this.currentWindowIdentity = null;
  }

  /**
   * Helper: Validate window identity hasn't changed.
   * If currentWindowIdentity is null, accept the new one (initial binding).
   */
  private isWindowIdentityValid(newIdentity: WindowIdentity): boolean {
    if (this.currentWindowIdentity === null) {
      return true; // First time, bind to this window
    }

    // Check all three identifiers match
    return (
      this.currentWindowIdentity.bundleId === newIdentity.bundleId &&
      this.currentWindowIdentity.processId === newIdentity.processId &&
      this.currentWindowIdentity.windowNumber === newIdentity.windowNumber
    );
  }
}

export default AccessibilityGate;
