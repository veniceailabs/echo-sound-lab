/**
 * Windows Enforcement Types (Phase 4)
 *
 * Shared type definitions across all Windows gates.
 */

/**
 * Windows modal dialog (detected by watcher)
 */
export interface WindowsModalDialog {
  hwnd: number;
  title: string;
  className: string;
  processId: number;
  isSystemOwned: boolean;
  detectedAt?: number;
}

/**
 * Window identity (for binding)
 * Includes creation timestamp to prevent HWND reuse exploitation
 */
export interface WindowsWindowIdentity {
  hwnd: number;
  processId: number;
  createdAt: number;
  processPath: string;
}

/**
 * File identity (inode-equivalent on NTFS)
 * Volume + object ID prevents hardlink swap + path aliasing
 */
export interface WindowsFileIdentity {
  volumeSerialNumber: number;  // Prevents cross-volume swaps
  fileIndexHigh: number;       // NTFS object ID (high 32 bits)
  fileIndexLow: number;        // NTFS object ID (low 32 bits)
  filePath: string;
}

/**
 * Security-scoped file bookmark
 * Memory-only, session-bound
 */
export interface WindowsSecurityScopedBookmark {
  id: string;
  filePath: string;
  identity: WindowsFileIdentity;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  isExportPath?: boolean;
  handle?: number;
}

/**
 * Export job handle (killable, tracked)
 */
export interface WindowsExportJobHandle {
  jobId: string;
  jobObject: number;
  filePath: string;
  startTime: number;
  state: 'RUNNING' | 'CANCELLED' | 'TERMINATED' | 'COMPLETED';
  cancel: () => Promise<void>;
}

/**
 * File metadata for stability checks
 */
export interface WindowsFileMetadata {
  size: number;
  mtime: number;
  path: string;
  volumeSerialNumber: number;
  fileIndexHigh: number;
  fileIndexLow: number;
}
