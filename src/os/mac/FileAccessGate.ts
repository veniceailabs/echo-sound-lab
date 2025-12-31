/**
 * File Access Gate (Phase 3C macOS)
 *
 * Enforces:
 * - FILE_READ (with security-scoped bookmarks)
 * - FILE_WRITE (with explicit export path binding)
 *
 * Constitutional Rules (PHASE3C_OS_ENFORCEMENT_SPEC.md):
 * - OS-INV-04: No persistent security-scoped access (memory-only, session-bound)
 * - OS-REQ-02: User-mediated grant only (file picker)
 * - OS-REQ-03: Permission scope must match capability scope (specific file, not app-wide)
 *
 * This is a gate, not an authority.
 * It enforces denial. It does not grant.
 */

import { getAuditLogger } from '../../services/AuditLogger';
import { Capability } from '../../services/capabilities';
import OSDialogWatcher from './OSDialogWatcher';
import { getSharedOSDialogWatcher } from './getSharedOSDialogWatcher';
import SessionContext from '../common/SessionContext';
import { ResolvedFileIdentity } from './FileIdentity';
import * as fs from 'fs';

export interface FileAccessRequest {
  capability: Capability.FILE_READ | Capability.FILE_WRITE;
  filePath: string;
  isExportPath?: boolean; // For FILE_WRITE only
  sessionId: string; // Required for session binding
}

export interface SecurityScopedBookmark {
  id: string;
  filePath: string;
  identity: ResolvedFileIdentity;
  sessionId: string;
  createdAt: number;
  expiresAt: number; // When session ends, bookmark dies
  isExportPath?: boolean; // For FILE_WRITE
}

export class FileAccessGate {
  private bookmarks = new Map<string, SecurityScopedBookmark>();
  private audit = getAuditLogger();
  private dialogWatcher: OSDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(
    dialogWatcher: OSDialogWatcher,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce FILE_READ capability.
   * Requires:
   * - Security-scoped bookmark exists for this file
   * - Bookmark valid for current session
   * - No persistent storage used
   */
  async enforceFileRead(request: FileAccessRequest): Promise<void> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    if (request.capability !== Capability.FILE_READ) {
      throw new Error('[GATE_ERROR] FileAccessGate.enforceFileRead called with non-FILE_READ capability');
    }

    // Session binding assertion (single source of truth)
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'FILE_READ',
      filePath: request.filePath,
      timestamp: Date.now()
    });

    // Check if bookmark exists for this file
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

    // Verify bookmark not expired
    if (!this.verifyBookmarkStillValid(bookmark)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'Security-scoped bookmark expired or session changed'
      });
      throw new Error('[OS_PERMISSION_DENIED] Security-scoped bookmark invalid');
    }

    // Verify file identity hasn't changed (TOCTOU protection)
    try {
      const currentRealPath = fs.realpathSync(request.filePath);
      const currentStat = fs.statSync(currentRealPath);

      if (
        currentStat.ino !== bookmark.identity.inode ||
        currentStat.dev !== bookmark.identity.device
      ) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'FILE_READ',
          filePath: request.filePath,
          reason: 'File identity mismatch (inode/device)',
          original: { inode: bookmark.identity.inode, device: bookmark.identity.device },
          current: { inode: currentStat.ino, device: currentStat.dev }
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

    // Bookmark is valid and file identity matches
    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'FILE_READ',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId }
    });
  }

  /**
   * Enforce FILE_WRITE capability.
   * Requires:
   * - Explicit export path binding
   * - Security-scoped bookmark for export path
   * - Bookmark valid for current session
   */
  async enforceFileWrite(request: FileAccessRequest): Promise<void> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfDialogVisible();

    if (request.capability !== Capability.FILE_WRITE) {
      throw new Error('[GATE_ERROR] FileAccessGate.enforceFileWrite called with non-FILE_WRITE capability');
    }

    // Session binding assertion (single source of truth)
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'FILE_WRITE',
      filePath: request.filePath,
      isExportPath: request.isExportPath || false,
      timestamp: Date.now()
    });

    // Check if bookmark exists for this export path
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

    // Verify bookmark not expired
    if (!this.verifyBookmarkStillValid(bookmark)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_WRITE',
        filePath: request.filePath,
        reason: 'Security-scoped bookmark expired or session changed'
      });
      throw new Error('[OS_PERMISSION_DENIED] Security-scoped bookmark invalid');
    }

    // Verify file identity hasn't changed (TOCTOU protection)
    try {
      const currentRealPath = fs.realpathSync(request.filePath);
      const currentStat = fs.statSync(currentRealPath);

      if (
        currentStat.ino !== bookmark.identity.inode ||
        currentStat.dev !== bookmark.identity.device
      ) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'FILE_WRITE',
          filePath: request.filePath,
          reason: 'File identity mismatch (inode/device)',
          original: { inode: bookmark.identity.inode, device: bookmark.identity.device },
          current: { inode: currentStat.ino, device: currentStat.dev }
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

    // Bookmark is valid and file identity matches
    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'FILE_WRITE',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId }
    });
  }

  /**
   * Request security-scoped bookmark access.
   * This simulates the macOS file picker UI (user-mediated).
   * In real implementation, triggers native file picker, user selects file, OS grants access.
   * Bookmark stored ONLY IN MEMORY, valid ONLY FOR THIS SESSION.
   *
   * OS-INV-04 enforcement:
   * - Bookmark dies on session end (currentSessionId = null)
   * - Bookmark never written to disk/keychain/preferences
   * - Bookmark carries session_id (verification check)
   * - Reuse in new session fails (session_id mismatch)
   */
  async requestSecurityScopedAccess(
    filePath: string,
    sessionId: string,
    isExportPath: boolean = false
  ): Promise<SecurityScopedBookmark> {
    // Session binding (centralized)
    this.sessionCtx.bind(sessionId);
    this.sessionCtx.assert(sessionId);

    // Capture file identity at grant time (inode-level binding)
    const realPath = fs.realpathSync(filePath);
    const stat = fs.statSync(realPath);
    const identity: ResolvedFileIdentity = {
      realPath,
      inode: stat.ino,
      device: stat.dev
    };

    // Create memory-only bookmark
    const bookmarkId = `bookmark-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const bookmark: SecurityScopedBookmark = {
      id: bookmarkId,
      filePath,
      identity,
      sessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (86400000 * 365), // Expires when session ends (checked separately)
      isExportPath
    };

    // Store IN MEMORY ONLY (never disk, keychain, preferences)
    this.bookmarks.set(bookmarkId, bookmark);

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: isExportPath ? 'FILE_WRITE' : 'FILE_READ',
      filePath,
      reason: 'User-mediated security-scoped access granted',
      bookmarkId: bookmark.id.substring(0, 6), // Redacted in audit log
      scope: { filePath, sessionId, isExportPath }
    });

    return bookmark;
  }

  /**
   * Helper: Verify bookmark still valid.
   * Checks:
   * - Session hasn't changed
   * - Bookmark hasn't expired (checked on revoke)
   */
  private verifyBookmarkStillValid(bookmark: SecurityScopedBookmark): boolean {
    // Check session binding (OS-INV-04)
    if (this.sessionCtx.get() !== bookmark.sessionId) {
      return false;
    }

    // Check expiration (would be set by session TTL)
    if (Date.now() > bookmark.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Revoke all file access permissions.
   * Called on session end or authority revocation.
   * Enforces OS-INV-04: All bookmarks become invalid immediately.
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_PERMISSION_REVOKED', {
      capabilities: ['FILE_READ', 'FILE_WRITE'],
      reason: 'Session ended or authority revoked',
      bookmarksCleared: this.bookmarks.size
    });

    // Gate clears ONLY local state
    this.bookmarks.clear();
  }

}

export default FileAccessGate;
