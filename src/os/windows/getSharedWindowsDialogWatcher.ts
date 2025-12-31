/**
 * Shared Windows Dialog Watcher Factory
 *
 * Ensures single instance of WindowsDialogWatcher across all gates and adapters.
 * Prevents bypass via direct gate instantiation.
 *
 * Ghost Principle: Single source of truth for dialog state
 */

import WindowsDialogWatcher from './WindowsDialogWatcher';

let sharedWatcher: WindowsDialogWatcher | null = null;

export function getSharedWindowsDialogWatcher(): WindowsDialogWatcher {
  if (!sharedWatcher) {
    sharedWatcher = new WindowsDialogWatcher();
  }
  return sharedWatcher;
}

export function resetSharedWindowsDialogWatcher(): void {
  if (sharedWatcher) {
    sharedWatcher.destroy();
    sharedWatcher = null;
  }
}
