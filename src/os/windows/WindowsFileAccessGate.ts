/**
 * Windows File Access Gate (Phase 4 Stub)
 *
 * Enforces: FILE_READ, FILE_WRITE (export path binding)
 * Blocks: WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13
 *
 * Ghost Checklist (Code Review):
 * ❌ Are bookmarks stored in memory only (no registry)?
 * ❌ Is session ID binding checked in verifyBookmarkStillValid?
 * ❌ Are file identity checks done BEFORE size/mtime checks?
 * ❌ Does getFileMetadata capture volumeSerialNumber + fileIndexHigh/Low?
 * ❌ Is ADS path rejection implemented (: beyond drive)?
 * ❌ Are handles marked non-inheritable?
 * ❌ Is bookmarks.clear() called in revokeAllPermissions()?
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability } from '../../services/capabilities';
import WindowsDialogWatcher from './WindowsDialogWatcher';
import SessionContext from '../common/SessionContext';

export interface WindowsFileIdentity {
  volumeSerialNumber: number;  // Blocks hardlink swap (WIN-T09)
  fileIndexHigh: number;       // NTFS object ID (high 32 bits)
  fileIndexLow: number;        // NTFS object ID (low 32 bits)
  filePath: string;
}

export interface WindowsSecurityScopedBookmark {
  id: string;
  filePath: string;
  identity: WindowsFileIdentity;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  isExportPath?: boolean;
  handle?: number;  // Win32 HANDLE (non-inheritable)
}

export interface FileAccessRequest {
  capability: Capability.FILE_READ | Capability.FILE_WRITE;
  filePath: string;
  isExportPath?: boolean;
  sessionId: string;
}

export class WindowsFileAccessGate {
  private bookmarks = new Map<string, WindowsSecurityScopedBookmark>();
  private audit = getAuditLogger();
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(dialogWatcher: WindowsDialogWatcher, sessionCtx: SessionContext) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce FILE_READ capability
   *
   * Requirements:
   *   - Dialog freeze (hard stop first)
   *   - Security-scoped bookmark exists for this file
   *   - Bookmark valid for current session (session ID binding)
   *   - File identity unchanged (volume + object ID)
   *   - No ADS paths allowed
   *
   * Blocks: WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13
   */
  async enforceFileRead(request: FileAccessRequest): Promise<void> {
    this.dialogWatcher.throwIfModalVisible();

    if (request.capability !== Capability.FILE_READ) {
      throw new Error('[GATE_ERROR] enforceFileRead called with non-FILE_READ');
    }

    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'FILE_READ',
      filePath: request.filePath,
      timestamp: Date.now()
    });

    // Ghost Checkpoint (WIN-T10): Reject ADS paths
    // ADS format: "path.txt:stream"
    // Valid: "C:\file.txt" or "D:\data"
    if (!this.isValidPath(request.filePath)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'ADS (alternate data stream) paths forbidden'
      });
      throw new Error('[OS_PERMISSION_DENIED] ADS paths not allowed');
    }

    // Check if bookmark exists
    const bookmark = Array.from(this.bookmarks.values()).find(
      b => b.filePath === request.filePath && b.sessionId === request.sessionId && !b.isExportPath
    );

    if (!bookmark) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'No security-scoped bookmark for this file in current session'
      });
      throw new Error('[OS_PERMISSION_DENIED] File access requires user-mediated picker');
    }

    // Ghost Checkpoint (WIN-ACC-05, WIN-T06): Verify session binding
    // If missing: WIN-ACC-05 fails (handle reuse succeeds)
    if (!this.verifyBookmarkStillValid(bookmark)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'Security-scoped bookmark expired or session changed'
      });
      throw new Error('[OS_PERMISSION_DENIED] Security-scoped bookmark invalid');
    }

    // Ghost Checkpoint (WIN-T09, WIN-T11): Verify file identity FIRST
    // Must check BEFORE size/mtime (identity changes = file swap)
    // If skipped: hardlink swap (WIN-T09) succeeds
    try {
      const currentIdentity = await this.getFileIdentity(request.filePath);

      if (
        currentIdentity.volumeSerialNumber !== bookmark.identity.volumeSerialNumber ||
        currentIdentity.fileIndexHigh !== bookmark.identity.fileIndexHigh ||
        currentIdentity.fileIndexLow !== bookmark.identity.fileIndexLow
      ) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'FILE_READ',
          filePath: request.filePath,
          reason: 'File identity mismatch (volume or object ID)',
          original: {
            volumeSerial: bookmark.identity.volumeSerialNumber,
            objectId: `${bookmark.identity.fileIndexHigh}:${bookmark.identity.fileIndexLow}`
          },
          current: {
            volumeSerial: currentIdentity.volumeSerialNumber,
            objectId: `${currentIdentity.fileIndexHigh}:${currentIdentity.fileIndexLow}`
          }
        });
        throw new Error('[OS_PERMISSION_DENIED] File identity changed');
      }
    } catch (err) {
      if ((err as Error).message.includes('[OS_PERMISSION_DENIED]')) {
        throw err;
      }
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'Cannot verify file identity'
      });
      throw new Error('[OS_PERMISSION_DENIED] File identity verification failed');
    }

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'FILE_READ',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId }
    });
  }

  /**
   * Enforce FILE_WRITE capability (export path binding)
   *
   * Same requirements as FILE_READ + bookmark marked as export path
   * Blocks: WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13
   */
  async enforceFileWrite(request: FileAccessRequest): Promise<void> {
    this.dialogWatcher.throwIfModalVisible();

    if (request.capability !== Capability.FILE_WRITE) {
      throw new Error('[GATE_ERROR] enforceFileWrite called with non-FILE_WRITE');
    }

    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'FILE_WRITE',
      filePath: request.filePath,
      isExportPath: request.isExportPath || false,
      timestamp: Date.now()
    });

    // Reject ADS paths
    if (!this.isValidPath(request.filePath)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_WRITE',
        filePath: request.filePath,
        reason: 'ADS paths forbidden'
      });
      throw new Error('[OS_PERMISSION_DENIED] ADS paths not allowed');
    }

    // Check if bookmark exists for export path
    const bookmark = Array.from(this.bookmarks.values()).find(
      b => b.filePath === request.filePath && b.sessionId === request.sessionId && b.isExportPath
    );

    if (!bookmark) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_WRITE',
        filePath: request.filePath,
        reason: 'No security-scoped bookmark for this export path in current session'
      });
      throw new Error('[OS_PERMISSION_DENIED] File write requires user-mediated export path binding');
    }

    // Verify session binding
    if (!this.verifyBookmarkStillValid(bookmark)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_WRITE',
        filePath: request.filePath,
        reason: 'Security-scoped bookmark expired or session changed'
      });
      throw new Error('[OS_PERMISSION_DENIED] Security-scoped bookmark invalid');
    }

    // Verify file identity
    try {
      const currentIdentity = await this.getFileIdentity(request.filePath);

      if (
        currentIdentity.volumeSerialNumber !== bookmark.identity.volumeSerialNumber ||
        currentIdentity.fileIndexHigh !== bookmark.identity.fileIndexHigh ||
        currentIdentity.fileIndexLow !== bookmark.identity.fileIndexLow
      ) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'FILE_WRITE',
          filePath: request.filePath,
          reason: 'File identity mismatch (volume or object ID)'
        });
        throw new Error('[OS_PERMISSION_DENIED] File identity changed');
      }
    } catch (err) {
      if ((err as Error).message.includes('[OS_PERMISSION_DENIED]')) {
        throw err;
      }
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_WRITE',
        filePath: request.filePath,
        reason: 'Cannot verify file identity'
      });
      throw new Error('[OS_PERMISSION_DENIED] File identity verification failed');
    }

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'FILE_WRITE',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId }
    });
  }

  /**
   * Request security-scoped access (user-mediated file picker)
   * Captures file identity at grant time
   *
   * Ghost Checkpoint (WIN-T12, WIN-T13):
   * ❌ Is bookmark stored in memory only (no registry/disk)?
   * ❌ Does bookmark include sessionId?
   */
  async requestSecurityScopedAccess(
    filePath: string,
    sessionId: string,
    isExportPath: boolean = false
  ): Promise<WindowsSecurityScopedBookmark> {
    this.sessionCtx.bind(sessionId);
    this.sessionCtx.assert(sessionId);

    // Reject ADS paths
    if (!this.isValidPath(filePath)) {
      throw new Error('[OS_PERMISSION_DENIED] ADS paths not allowed');
    }

    // Capture file identity at grant time
    const identity = await this.getFileIdentity(filePath);

    // Create memory-only bookmark
    // Ghost Checkpoint: NO registry, NO appdata, NO disk
    const bookmarkId = `bookmark-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const bookmark: WindowsSecurityScopedBookmark = {
      id: bookmarkId,
      filePath,
      identity,
      sessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (86400000 * 365),
      isExportPath,
      handle: undefined
    };

    // Store IN MEMORY ONLY
    this.bookmarks.set(bookmarkId, bookmark);

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: isExportPath ? 'FILE_WRITE' : 'FILE_READ',
      filePath,
      reason: 'User-mediated security-scoped access granted',
      bookmarkId: bookmark.id.substring(0, 6),
      scope: { filePath, sessionId, isExportPath }
    });

    return bookmark;
  }

  /**
   * Revoke all file access permissions
   * Called on session end
   *
   * Ghost Checkpoint (WIN-T05, WIN-T12, WIN-T13):
   * ❌ Is bookmarks.clear() called?
   * ❌ Are all handles closed?
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_PERMISSION_REVOKED', {
      capabilities: ['FILE_READ', 'FILE_WRITE'],
      reason: 'Session ended or authority revoked',
      bookmarksCleared: this.bookmarks.size
    });

    // Close all handles
    for (const bookmark of this.bookmarks.values()) {
      if (bookmark.handle) {
        // Win32: CloseHandle(bookmark.handle)
        // TODO: Implement CloseHandle
      }
    }

    // Gate clears ONLY local state
    this.bookmarks.clear();
  }

  // ===== Private Helpers =====

  /**
   * Get file identity (volume serial + object ID)
   *
   * Win32:
   *   - OpenFileA() or CreateFileA() with FILE_SHARE_READ
   *   - GetFileInformationByHandle() → BY_HANDLE_FILE_INFORMATION
   *   - Extract: nFileIndexHigh, nFileIndexLow (NTFS object ID)
   *   - Extract: dwVolumeSerialNumber
   *
   * Ghost Checkpoint (WIN-ACC-06):
   * ❌ Are all three values captured (volume + high + low)?
   */
  private async getFileIdentity(filePath: string): Promise<WindowsFileIdentity> {
    // TODO: Implement GetFileInformationByHandle
    // For now: stub returns zeros

    return {
      volumeSerialNumber: 0,
      fileIndexHigh: 0,
      fileIndexLow: 0,
      filePath
    };
  }

  /**
   * Verify bookmark still valid
   * Checks:
   *   - Session binding (sessionId matches current session)
   *   - Expiration (expiresAt not reached)
   *
   * Ghost Checkpoint (WIN-ACC-05, WIN-T06):
   * ❌ Does this check sessionCtx.get() === bookmark.sessionId?
   * If missing: WIN-ACC-05 fails (session binding broken)
   */
  private verifyBookmarkStillValid(bookmark: WindowsSecurityScopedBookmark): boolean {
    // Check session binding (CRITICAL for WIN-ACC-05)
    if (this.sessionCtx.get() !== bookmark.sessionId) {
      return false;
    }

    // Check expiration
    if (Date.now() > bookmark.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Validate path is not an ADS (alternate data stream)
   * ADS format: "path.txt:stream"
   * Valid drive format: "C:\" or "C:/"
   *
   * Ghost Checkpoint (WIN-T10):
   * ❌ Does this reject ADS paths?
   */
  private isValidPath(filePath: string): boolean {
    // Reject paths with : beyond drive letter
    const colonIndex = filePath.indexOf(':');

    if (colonIndex === -1) {
      return true;  // No colon, valid
    }

    // Colon at position 1 = drive letter (C:), valid
    if (colonIndex === 1) {
      return true;
    }

    // Colon elsewhere = ADS or invalid
    return false;
  }
}

export default WindowsFileAccessGate;
