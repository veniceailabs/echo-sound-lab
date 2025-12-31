/**
 * Accessibility Permission Oracle
 *
 * Purpose:
 * - Single source of truth for macOS Accessibility permission state
 * - Default DENY
 * - Test-injectable
 *
 * Constitutional:
 * - OS-INV-02: Permission denial halts execution
 */

export interface AccessibilityPermissionOracle {
  isGranted(): Promise<boolean>;
}

export class DefaultAccessibilityPermissionOracle implements AccessibilityPermissionOracle {
  async isGranted(): Promise<boolean> {
    /**
     * REAL IMPLEMENTATION REQUIRED IN PROD:
     * - AXIsProcessTrustedWithOptions()
     *
     * Until native binding exists:
     * DEFAULT = DENY
     */
    return false;
  }
}
