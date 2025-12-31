/**
 * Shared OSDialogWatcher singleton
 *
 * Purpose:
 * - Ensures ALL gates observe the SAME OS dialog visibility state
 * - Prevents "adapter sees dialog, gate does not" bypass
 *
 * Used by:
 * - AccessibilityGate
 * - FileAccessGate
 * - ExportJobController
 * - MacOSEnforcementAdapter
 */

import OSDialogWatcher from './OSDialogWatcher';

let shared: OSDialogWatcher | null = null;

export function getSharedOSDialogWatcher(): OSDialogWatcher {
  if (!shared) shared = new OSDialogWatcher();
  return shared;
}

export function resetSharedOSDialogWatcher(): void {
  // For tests: clears dialog state deterministically
  if (shared) shared.revokeAllPermissions();
}
