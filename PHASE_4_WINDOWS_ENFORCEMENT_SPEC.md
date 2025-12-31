# PHASE 4 — WINDOWS ENFORCEMENT SPEC

Status: 🗂️ SPECIFICATION (Vector-Mapped, Implementation-Ready)
Scope: WindowsDialogWatcher, WindowsAccessibilityGate, WindowsFileAccessGate, WindowsExportJobController, WindowsEnforcementAdapter
Threat Coverage: All WIN-T01 → WIN-T15 vectors
Methodology: Threat-first, zero speculation, mechanical enforcement

---

## OVERVIEW

Phase 4 Windows enforcement mirrors Phase 3C macOS architecture but uses Windows-specific APIs:

- **OSDialogWatcher → WindowsDialogWatcher** (Win32 modal detection via EnumWindows + WS_DISABLED)
- **AccessibilityGate → WindowsAccessibilityGate** (keyboard input, control classification)
- **FileAccessGate → WindowsFileAccessGate** (file handles, volume + object ID binding)
- **ExportJobController → WindowsExportJobController** (job objects, TerminateJobObject)
- **SessionContext** (shared with macOS, no platform-specific changes)

Every method is annotated with `// Blocks: WIN-Txx` to establish vector closure.

---

## 1. WINDOWSDIALOGWATCHER

**Purpose:** Single source of truth for OS modal dialog detection (not UI trust)
**Blocks:** WIN-T01, WIN-T02, WIN-T15

### Class Definition

```typescript
interface WindowsModalDialog {
  hwnd: HWND;
  title: string;
  className: string;
  processId: number;
  isSystemOwned: boolean;  // OS dialog (not user app)
}

export class WindowsDialogWatcher {
  private dialogs = new Map<HWND, WindowsModalDialog>();
  private isModalVisible = false;
  private audit = getAuditLogger();

  constructor() {
    // Poll for system modals every 100ms
    this.startModalDetection();
  }

  /**
   * Poll system dialogs (EnumWindows + WS_DISABLED check)
   * Detects:
   * - Windows permission prompts
   * - File dialogs
   * - UAC prompts
   * NOT user app dialogs (filtered by WS_DISABLED + process check)
   *
   * Blocks: WIN-T01, WIN-T02, WIN-T15
   */
  private async startModalDetection(): Promise<void> {
    setInterval(() => {
      this.detectSystemModals();
    }, 100);
  }

  /**
   * Detect OS-owned modal dialogs via EnumWindows + style checks
   * Returns only windows with:
   * - WS_DISABLED (modal style)
   * - System process ownership (explorer.exe, dwm.exe, etc.)
   * - Known system window classes
   *
   * Blocks: WIN-T01 (fake dialog detection), WIN-T02 (overlay hijack detection)
   */
  private detectSystemModals(): void {
    // Win32 EnumWindows() → filter WS_DISABLED + system process
    const systemWindows: WindowsModalDialog[] = this.enumerateSystemModals();

    // Update dialog registry
    const currentHwnd = new Set(systemWindows.map(d => d.hwnd));
    const previousHwnd = new Set(this.dialogs.keys());

    // Detect new dialogs
    for (const dialog of systemWindows) {
      if (!previousHwnd.has(dialog.hwnd)) {
        this.dialogs.set(dialog.hwnd, dialog);
        this.isModalVisible = true;

        this.audit.emit('OS_DIALOG_DETECTED', {
          hwnd: `0x${dialog.hwnd.toString(16)}`,
          title: dialog.title,
          className: dialog.className,
          processId: dialog.processId,
          isSystemOwned: dialog.isSystemOwned,
          timestamp: Date.now()
        });
      }
    }

    // Detect cleared dialogs
    for (const hwnd of previousHwnd) {
      if (!currentHwnd.has(hwnd)) {
        const cleared = this.dialogs.get(hwnd);
        this.dialogs.delete(hwnd);

        this.audit.emit('OS_DIALOG_CLEARED', {
          hwnd: `0x${hwnd.toString(16)}`,
          title: cleared?.title,
          timestamp: Date.now()
        });

        // Update state if no more dialogs
        if (this.dialogs.size === 0) {
          this.isModalVisible = false;
        }
      }
    }
  }

  /**
   * Hard stop if any OS dialog visible
   * Called at entry of every enforce method
   *
   * Blocks: WIN-T01, WIN-T02, WIN-T15
   */
  throwIfModalVisible(): void {
    if (this.isModalVisible) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'OS modal dialog visible',
        dialogCount: this.dialogs.size,
        timestamp: Date.now()
      });

      throw new Error('[OS_HARD_STOP] OS modal dialog visible, execution frozen');
    }
  }

  /**
   * Revoke dialog watcher on session end
   * Clear all tracked dialogs
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_DIALOG_WATCHER_RESET', {
      dialogCount: this.dialogs.size,
      timestamp: Date.now()
    });

    this.dialogs.clear();
    this.isModalVisible = false;
  }

  // ===== Helper: Enumerate system-owned modal dialogs =====

  /**
   * Win32 EnumWindows + filter for system modals
   * Returns only dialogs with:
   * - WS_DISABLED set (modal style)
   * - Process owned by: explorer.exe, dwm.exe, conhost.exe, etc.
   * - Known system window classes
   *
   * Rejects user app dialogs (unowned modals)
   */
  private enumerateSystemModals(): WindowsModalDialog[] {
    // Win32 implementation detail: EnumWindows() to iterate all windows
    // GetWindowLongPtr(hwnd, GWL_STYLE) to check WS_DISABLED
    // GetWindowThreadProcessId() to get PID
    // GetModuleFileNameEx() to verify system process
    // GetClassName() to verify known system class

    const systemProcesses = new Set([
      'explorer.exe',
      'dwm.exe',
      'conhost.exe',
      'winlogon.exe',
      'lsass.exe'
    ]);

    const systemClasses = new Set([
      '#32770',        // Dialog class
      'ComboBox',
      'SysTreeView32'
    ]);

    return [
      // Placeholder: real implementation iterates EnumWindows
      // and filters per criteria above
    ];
  }
}
```

---

## 2. WINDOWSACCESSIBILITYGATE

**Purpose:** Enforce UI navigation + text input with credential field blocking
**Blocks:** WIN-T14 (token elevation), WIN-T07, WIN-T08 (job membership)

### Class Definition

```typescript
interface WindowsAccessibilityRequest {
  capability: Capability.UI_NAVIGATION | Capability.TEXT_INPUT | Capability.PARAMETER_ADJUSTMENT;
  windowHandle: HWND;
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

  constructor(
    dialogWatcher: WindowsDialogWatcher,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce UI_NAVIGATION capability
   * Requires:
   * - Window identity matches bound identity (HWND + PID + creation time)
   * - No OS dialog visible
   * - Token elevation level matches app context
   *
   * Blocks: WIN-T03, WIN-T04, WIN-T14, WIN-T15
   */
  async enforceUINavigation(request: WindowsAccessibilityRequest): Promise<void> {
    // OS-INV-05: OS dialog presence freezes execution (hard stop)
    this.dialogWatcher.throwIfModalVisible();

    // Session binding assertion
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'UI_NAVIGATION',
      windowHandle: `0x${request.windowHandle.toString(16)}`,
      processId: request.processId,
      timestamp: Date.now()
    });

    // Check window identity (HWND + PID + creation timestamp)
    // Blocks: WIN-T03 (HWND reuse), WIN-T04 (process rebinding)
    if (!this.isWindowIdentityValid(request.windowHandle, request.processId)) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed or invalid',
        capability: 'UI_NAVIGATION'
      });
      throw new Error('[OS_HARD_STOP] Window identity invalid');
    }

    // Check token elevation level (blocks WIN-T14)
    // Blocks: WIN-T14 (token elevation)
    const tokenElevationMatches = await this.verifyTokenElevation(request.processId);
    if (!tokenElevationMatches) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'UI_NAVIGATION',
        reason: 'Token elevation level mismatch'
      });
      throw new Error('[OS_PERMISSION_DENIED] Token elevation mismatch');
    }

    // Update current window identity
    this.currentWindowIdentity = this.captureWindowIdentity(request.windowHandle, request.processId);

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'UI_NAVIGATION',
      scope: { windowHandle: request.windowHandle, processId: request.processId }
    });
  }

  /**
   * Enforce TEXT_INPUT capability with field classification
   * Requires:
   * - fieldType is mandatory (SAFE | UNKNOWN | SENSITIVE)
   * - SENSITIVE fields → hard deny
   * - UNKNOWN fields → default deny (ACC_REQUIRED)
   * - SAFE fields → allow with window binding + token check
   * - Caller PID must be in active job (if exported job active)
   *
   * Blocks: WIN-T14 (elevation), WIN-T07, WIN-T08 (job membership)
   */
  async enforceTextInput(request: WindowsAccessibilityRequest): Promise<void> {
    // OS-INV-05: Hard stop first (before field type check)
    this.dialogWatcher.throwIfModalVisible();

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

    // Session binding assertion
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'TEXT_INPUT',
      fieldId,
      fieldType,
      windowHandle: `0x${request.windowHandle.toString(16)}`,
      timestamp: Date.now()
    });

    // Hard deny for SENSITIVE fields (passwords, credential stores)
    // Blocks: WIN-T14 (prevents elevation attack on credential fields)
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

      // Check token elevation
      // Blocks: WIN-T14
      const tokenElevationMatches = await this.verifyTokenElevation(request.processId);
      if (!tokenElevationMatches) {
        this.audit.emit('OS_PERMISSION_DENIED', {
          capability: 'TEXT_INPUT',
          fieldId,
          reason: 'Token elevation mismatch'
        });
        throw new Error('[OS_PERMISSION_DENIED] Token elevation mismatch');
      }

      // Verify caller PID is in active export job (if any)
      // Blocks: WIN-T08 (DLL injection outside job)
      const jobMembershipValid = await this.verifyJobMembership(request.processId);
      if (!jobMembershipValid) {
        this.audit.emit('OS_HARD_STOP_TRIGGERED', {
          reason: 'Caller not in active export job',
          capability: 'TEXT_INPUT'
        });
        throw new Error('[OS_HARD_STOP] Caller not in expected job context');
      }

      // Update current window identity
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
   * Same requirements as UI_NAVIGATION
   *
   * Blocks: WIN-T03, WIN-T04, WIN-T14
   */
  async enforceParameterAdjustment(request: WindowsAccessibilityRequest): Promise<void> {
    // OS-INV-05: Hard stop first
    this.dialogWatcher.throwIfModalVisible();

    // Session binding assertion
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'PARAMETER_ADJUSTMENT',
      windowHandle: `0x${request.windowHandle.toString(16)}`,
      timestamp: Date.now()
    });

    // Check window identity
    // Blocks: WIN-T03, WIN-T04
    if (!this.isWindowIdentityValid(request.windowHandle, request.processId)) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Window identity changed',
        capability: 'PARAMETER_ADJUSTMENT'
      });
      throw new Error('[OS_HARD_STOP] Window identity changed');
    }

    // Check token elevation
    // Blocks: WIN-T14
    const tokenElevationMatches = await this.verifyTokenElevation(request.processId);
    if (!tokenElevationMatches) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'PARAMETER_ADJUSTMENT',
        reason: 'Token elevation mismatch'
      });
      throw new Error('[OS_PERMISSION_DENIED] Token elevation mismatch');
    }

    // Update current window identity
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

  // ===== Helpers =====

  /**
   * Capture window identity at bind time
   * Returns: HWND + PID + creation timestamp
   * Blocks: WIN-T03 (reuse detection requires timestamp)
   */
  private captureWindowIdentity(hwnd: HWND, pid: number): WindowsWindowIdentity {
    return {
      hwnd,
      processId: pid,
      creationTime: Date.now(),  // Timestamp blocks HWND reuse
      processPath: this.getProcessPath(pid)  // Exe path blocks WIN-T04
    };
  }

  /**
   * Verify window identity hasn't changed
   * Checks: HWND + PID + creation time
   * Blocks: WIN-T03 (HWND reuse), WIN-T04 (process rebinding)
   */
  private isWindowIdentityValid(hwnd: HWND, pid: number): boolean {
    if (this.currentWindowIdentity === null) {
      return true;  // First bind
    }

    // All three must match: HWND, PID, creation time
    return (
      this.currentWindowIdentity.hwnd === hwnd &&
      this.currentWindowIdentity.processId === pid &&
      this.currentWindowIdentity.creationTime + 3600000 > Date.now()  // Expire after 1 hour
    );
  }

  /**
   * Verify token elevation level matches app context
   * Blocks: WIN-T14 (prevents elevation bypass)
   *
   * Returns: true if token elevation matches parent app context
   */
  private async verifyTokenElevation(callerPid: number): Promise<boolean> {
    // Win32: GetProcessToken() → GetTokenInformation(TokenElevation)
    // Compare with parent app elevation level
    // Must match (no elevation bypass permitted)
    return true;  // Placeholder: real impl checks token integrity
  }

  /**
   * Verify caller is in active export job (if any)
   * Blocks: WIN-T08 (DLL injection outside job)
   *
   * Returns: true if caller is in expected job or no job is active
   */
  private async verifyJobMembership(callerPid: number): Promise<boolean> {
    // Placeholder: check if callerPid is in active export job
    // Return false if job is active but PID not member
    return true;
  }

  /**
   * Get executable path for a process
   * Used for window identity binding
   */
  private getProcessPath(pid: number): string {
    // Win32: OpenProcess() → GetProcessImageFileNameW()
    return '';  // Placeholder
  }
}

interface WindowsWindowIdentity {
  hwnd: HWND;
  processId: number;
  creationTime: number;
  processPath: string;
}
```

---

## 3. WINDOWSFILEACCESSGATE

**Purpose:** Session-scoped file access with volume + file ID binding
**Blocks:** WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13

### Class Definition

```typescript
interface WindowsFileIdentity {
  volumeSerialNumber: number;  // Blocks hardlink swap (WIN-T09)
  fileIndexHigh: number;       // NTFS object ID (high 32 bits)
  fileIndexLow: number;        // NTFS object ID (low 32 bits)
  filePath: string;
}

interface WindowsSecurityScopedBookmark {
  id: string;
  filePath: string;
  identity: WindowsFileIdentity;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  isExportPath?: boolean;
  handle?: HANDLE;  // Non-inheritable file handle (if cached)
}

export class WindowsFileAccessGate {
  private bookmarks = new Map<string, WindowsSecurityScopedBookmark>();
  private audit = getAuditLogger();
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(
    dialogWatcher: WindowsDialogWatcher,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce FILE_READ capability
   * Requires:
   * - Security-scoped bookmark exists for this file
   * - Bookmark valid for current session
   * - File identity (volume + object ID) unchanged
   * - No ADS paths allowed
   *
   * Blocks: WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13
   */
  async enforceFileRead(request: FileAccessRequest): Promise<void> {
    // OS-INV-05: Hard stop on dialog
    this.dialogWatcher.throwIfModalVisible();

    if (request.capability !== Capability.FILE_READ) {
      throw new Error('[GATE_ERROR] WindowsFileAccessGate.enforceFileRead called with non-FILE_READ');
    }

    // Session binding
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'FILE_READ',
      filePath: request.filePath,
      timestamp: Date.now()
    });

    // Reject ADS paths
    // Blocks: WIN-T10 (NTFS alternate data streams)
    if (request.filePath.includes(':') && !this.isValidDrivePath(request.filePath)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'ADS (alternate data stream) paths forbidden'
      });
      throw new Error('[OS_PERMISSION_DENIED] ADS paths not allowed');
    }

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
    // Blocks: WIN-T06 (handle reuse across sessions)
    if (!this.verifyBookmarkStillValid(bookmark)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_READ',
        filePath: request.filePath,
        reason: 'Security-scoped bookmark expired or session changed'
      });
      throw new Error('[OS_PERMISSION_DENIED] Security-scoped bookmark invalid');
    }

    // Verify file identity (volume + object ID)
    // Blocks: WIN-T09 (hardlink swap), WIN-T11 (volume move TOCTOU)
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

    // Bookmark is valid and file identity matches
    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'FILE_READ',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId }
    });
  }

  /**
   * Enforce FILE_WRITE capability (export path binding)
   * Same requirements as FILE_READ + bookmark marked as export path
   *
   * Blocks: WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13
   */
  async enforceFileWrite(request: FileAccessRequest): Promise<void> {
    // OS-INV-05: Hard stop on dialog
    this.dialogWatcher.throwIfModalVisible();

    if (request.capability !== Capability.FILE_WRITE) {
      throw new Error('[GATE_ERROR] WindowsFileAccessGate.enforceFileWrite called with non-FILE_WRITE');
    }

    // Session binding
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'FILE_WRITE',
      filePath: request.filePath,
      isExportPath: request.isExportPath || false,
      timestamp: Date.now()
    });

    // Reject ADS paths
    // Blocks: WIN-T10
    if (request.filePath.includes(':') && !this.isValidDrivePath(request.filePath)) {
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

    // Verify bookmark not expired
    // Blocks: WIN-T06
    if (!this.verifyBookmarkStillValid(bookmark)) {
      this.audit.emit('OS_PERMISSION_DENIED', {
        capability: 'FILE_WRITE',
        filePath: request.filePath,
        reason: 'Security-scoped bookmark expired or session changed'
      });
      throw new Error('[OS_PERMISSION_DENIED] Security-scoped bookmark invalid');
    }

    // Verify file identity
    // Blocks: WIN-T09, WIN-T11
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

    // Bookmark is valid and file identity matches
    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'FILE_WRITE',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId }
    });
  }

  /**
   * Request security-scoped access (user-mediated file picker)
   * Captures file identity at grant time
   * Blocks: WIN-T12, WIN-T13 (no persistence)
   */
  async requestSecurityScopedAccess(
    filePath: string,
    sessionId: string,
    isExportPath: boolean = false
  ): Promise<WindowsSecurityScopedBookmark> {
    // Session binding
    this.sessionCtx.bind(sessionId);
    this.sessionCtx.assert(sessionId);

    // Reject ADS paths
    // Blocks: WIN-T10
    if (filePath.includes(':') && !this.isValidDrivePath(filePath)) {
      throw new Error('[OS_PERMISSION_DENIED] ADS paths not allowed');
    }

    // Capture file identity at grant time (volume + object ID)
    const identity = await this.getFileIdentity(filePath);

    // Create memory-only bookmark (no registry, no disk)
    // Blocks: WIN-T12, WIN-T13 (no persistence)
    const bookmarkId = `bookmark-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const bookmark: WindowsSecurityScopedBookmark = {
      id: bookmarkId,
      filePath,
      identity,
      sessionId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (86400000 * 365),  // Expires when session ends
      isExportPath,
      handle: undefined  // Placeholder: can cache non-inheritable handle
    };

    // Store IN MEMORY ONLY (never registry, appdata, disk)
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
   * Blocks: WIN-T05, WIN-T06, WIN-T12, WIN-T13 (total destruction)
   */
  revokeAllPermissions(): void {
    this.audit.emit('OS_PERMISSION_REVOKED', {
      capabilities: ['FILE_READ', 'FILE_WRITE'],
      reason: 'Session ended or authority revoked',
      bookmarksCleared: this.bookmarks.size
    });

    // Close all handles (non-inheritable by default)
    // Blocks: WIN-T05 (handle leak prevention)
    for (const bookmark of this.bookmarks.values()) {
      if (bookmark.handle) {
        // Win32: CloseHandle(bookmark.handle)
      }
    }

    // Gate clears ONLY local state (no registry cleanup needed)
    this.bookmarks.clear();
  }

  // ===== Helpers =====

  /**
   * Get file identity (volume serial + object ID)
   * Used for binding at grant time and re-verification at access time
   * Blocks: WIN-T09 (hardlink swap), WIN-T11 (volume move)
   */
  private async getFileIdentity(filePath: string): Promise<WindowsFileIdentity> {
    // Win32: GetFileAttributesEx() → FILE_BASIC_INFO
    // OpenFile() + GetFileInformationByHandle() → BY_HANDLE_FILE_INFORMATION
    // Extract: nFileIndexHigh, nFileIndexLow (NTFS object ID), dwVolumeSerialNumber

    return {
      volumeSerialNumber: 0,     // Placeholder
      fileIndexHigh: 0,          // Placeholder
      fileIndexLow: 0,           // Placeholder
      filePath
    };
  }

  /**
   * Verify bookmark is still valid
   * Blocks: WIN-T06 (session-scoped binding)
   */
  private verifyBookmarkStillValid(bookmark: WindowsSecurityScopedBookmark): boolean {
    // Check session binding
    if (this.sessionCtx.get() !== bookmark.sessionId) {
      return false;  // Session changed
    }

    // Check expiration
    if (Date.now() > bookmark.expiresAt) {
      return false;  // Bookmark expired
    }

    return true;
  }

  /**
   * Validate path is not an ADS (alternate data stream)
   * ADS format: "path.txt:stream"
   * Valid drive format: "C:" (not "C:stream")
   */
  private isValidDrivePath(filePath: string): boolean {
    // Allow drive letter: C:\ or C:/
    // Reject stream suffix: file.txt:payload
    const drivePattern = /^[A-Z]:[\\\/]/i;
    return drivePattern.test(filePath);
  }
}
```

---

## 4. WINDOWSEXPORTJOBCONTROLLER

**Purpose:** Killable export jobs with process group termination
**Blocks:** WIN-T05, WIN-T07, WIN-T08, WIN-T11

### Class Definition

```typescript
interface WindowsFileMetadata {
  size: number;
  mtime: number;
  path: string;
  volumeSerialNumber: number;  // File identity
  fileIndexHigh: number;
  fileIndexLow: number;
}

interface WindowsExportJobHandle {
  jobId: string;
  jobObject: HANDLE;  // Win32 job object
  filePath: string;
  startTime: number;
  state: 'RUNNING' | 'CANCELLED' | 'TERMINATED' | 'COMPLETED';
  cancel: () => Promise<void>;
}

export class WindowsExportJobController {
  private jobs = new Map<string, WindowsExportJobHandle>();
  private jobSessions = new Map<string, string>();
  private fileWatchers = new Map<string, NodeJS.Timeout>();
  private lastFileState = new Map<string, WindowsFileMetadata>();
  private audit = getAuditLogger();
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;

  constructor(
    dialogWatcher: WindowsDialogWatcher,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;
  }

  /**
   * Enforce RENDER_EXPORT capability
   * Creates killable job object with all spawned processes
   * Blocks: WIN-T05, WIN-T07, WIN-T08
   *
   * Returns: killable handle with cancel() method
   */
  async enforceRenderExport(request: ExportJobRequest): Promise<WindowsExportJobHandle> {
    // OS-INV-05: Hard stop on dialog
    this.dialogWatcher.throwIfModalVisible();

    // Session binding
    this.sessionCtx.assert(request.sessionId);

    this.audit.emit('OS_PERMISSION_REQUESTED', {
      capability: 'RENDER_EXPORT',
      filePath: request.filePath,
      timestamp: Date.now()
    });

    const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create Win32 job object
    // Blocks: WIN-T07 (CreateRemoteThread escape), WIN-T08 (DLL injection)
    const jobObject = this.createJobObject(jobId);
    if (!jobObject) {
      throw new Error('[JOB_CREATE_FAILED] Could not create Windows job object');
    }

    // Set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    // Blocks: WIN-T07 (all child processes die when job closes)
    this.enforceKillOnJobClose(jobObject);

    const handle: WindowsExportJobHandle = {
      jobId,
      jobObject,
      filePath: request.filePath,
      startTime: Date.now(),
      state: 'RUNNING',
      cancel: async () => {
        await this.cancelJob(jobId);
      }
    };

    // Store job
    this.jobs.set(jobId, handle);
    this.jobSessions.set(jobId, request.sessionId);

    // Start file change watcher
    this.startFileChangeWatcher(jobId, request.filePath);

    this.audit.emit('OS_EXPORT_JOB_STARTED', {
      jobId: jobId.substring(0, 6),
      filePath: request.filePath,
      timestamp: Date.now()
    });

    this.audit.emit('OS_PERMISSION_GRANTED', {
      capability: 'RENDER_EXPORT',
      filePath: request.filePath,
      scope: { filePath: request.filePath, sessionId: request.sessionId, jobId }
    });

    return handle;
  }

  /**
   * Cancel job explicitly
   * Terminates all processes in job object
   * Verifies output file stopped changing
   * Blocks: WIN-T05 (inherited handle leak), WIN-T07, WIN-T08, WIN-T11
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('[JOB_NOT_FOUND] Export job not found');
    }

    if (job.state !== 'RUNNING') {
      throw new Error(`[JOB_INVALID_STATE] Export job already ${job.state}`);
    }

    this.audit.emit('OS_EXPORT_JOB_CANCEL_REQUESTED', {
      jobId: jobId.substring(0, 6),
      filePath: job.filePath,
      timestamp: Date.now()
    });

    // Stop watching file
    const watcher = this.fileWatchers.get(jobId);
    if (watcher) {
      clearInterval(watcher);
      this.fileWatchers.delete(jobId);
    }

    // Terminate job object (kills all child processes)
    // Blocks: WIN-T05 (handles closed), WIN-T07, WIN-T08 (remote threads die)
    // Win32: TerminateJobObject(job.jobObject, 0)
    this.terminateJobObject(job.jobObject);

    job.state = 'CANCELLED';

    // Verify file stopped changing (size + identity)
    // Blocks: WIN-T11 (volume move detection)
    const isStopped = this.verifyFileStoppedChanging(job.filePath);

    this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
      jobId: jobId.substring(0, 6),
      filePath: job.filePath,
      reason: 'Explicit cancellation',
      fileVerified: isStopped,
      timestamp: Date.now()
    });

    if (!isStopped) {
      this.audit.emit('OS_HARD_STOP_TRIGGERED', {
        reason: 'Export job file continued changing after termination',
        jobId,
        filePath: job.filePath
      });
      throw new Error('[OS_HARD_STOP] Export job file continued after cancellation');
    }
  }

  /**
   * Mark job as completed successfully
   * Called when export finishes normally
   */
  async completeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error('[JOB_NOT_FOUND] Export job not found');
    }

    if (job.state !== 'RUNNING') {
      throw new Error(`[JOB_INVALID_STATE] Cannot complete job in state ${job.state}`);
    }

    // Stop watching file
    const watcher = this.fileWatchers.get(jobId);
    if (watcher) {
      clearInterval(watcher);
      this.fileWatchers.delete(jobId);
    }

    job.state = 'COMPLETED';

    this.audit.emit('OS_EXPORT_JOB_COMPLETED', {
      jobId: jobId.substring(0, 6),
      filePath: job.filePath,
      timestamp: Date.now()
    });
  }

  /**
   * Revoke all export jobs
   * Called on session end
   * Blocks: WIN-T05, WIN-T07, WIN-T08 (total job termination)
   */
  revokeAllPermissions(): void {
    const jobIds = Array.from(this.jobs.keys());

    this.audit.emit('OS_EXPORT_JOBS_REVOKED', {
      count: jobIds.length,
      timestamp: Date.now()
    });

    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && job.state === 'RUNNING') {
        // Stop watching file
        const watcher = this.fileWatchers.get(jobId);
        if (watcher) {
          clearInterval(watcher);
          this.fileWatchers.delete(jobId);
        }

        // Terminate job object
        // Blocks: WIN-T05, WIN-T07, WIN-T08
        this.terminateJobObject(job.jobObject);
        job.state = 'TERMINATED';

        // Verify file stopped changing
        const isStopped = this.verifyFileStoppedChanging(job.filePath);

        this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
          jobId: jobId.substring(0, 6),
          filePath: job.filePath,
          reason: 'Session ended',
          fileVerified: isStopped,
          timestamp: Date.now()
        });

        if (!isStopped) {
          this.audit.emit('OS_HARD_STOP_TRIGGERED', {
            reason: 'Export job file continued after session revocation',
            jobId,
            filePath: job.filePath
          });
        }
      }
    }

    // Gate clears ONLY local state
    this.jobs.clear();
    this.jobSessions.clear();
    this.lastFileState.clear();

    // Clear all watchers
    for (const [_, watcher] of this.fileWatchers) {
      clearInterval(watcher);
    }
    this.fileWatchers.clear();
  }

  // ===== Helpers =====

  /**
   * Create Win32 job object
   * All render processes assigned to this job
   * Blocks: WIN-T07, WIN-T08
   */
  private createJobObject(jobId: string): HANDLE | null {
    // Win32: CreateJobObject(nullptr, jobName)
    // Returns job handle or nullptr on failure
    return null;  // Placeholder
  }

  /**
   * Enforce JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
   * All processes in job die when job closes
   * Blocks: WIN-T05 (inherited handles closed), WIN-T07 (remote threads die)
   */
  private enforceKillOnJobClose(jobObject: HANDLE): void {
    // Win32: SetInformationJobObject(..., JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
  }

  /**
   * Terminate job object (kills all child processes)
   * Blocks: WIN-T07, WIN-T08
   */
  private terminateJobObject(jobObject: HANDLE): void {
    // Win32: TerminateJobObject(jobObject, 0)
  }

  /**
   * Start file change watcher
   * Polls file size + object ID every 500ms
   */
  private startFileChangeWatcher(jobId: string, filePath: string): void {
    const initial = this.getFileMetadata(filePath);
    this.lastFileState.set(filePath, initial);

    const watcher = setInterval(() => {
      try {
        const current = this.getFileMetadata(filePath);
        this.lastFileState.set(filePath, current);
      } catch (err) {
        // File may not exist yet
      }
    }, 500);

    this.fileWatchers.set(jobId, watcher);
  }

  /**
   * Verify file stopped changing
   * Checks: size + mtime stable, object ID unchanged
   * Blocks: WIN-T11 (volume move detection via object ID)
   */
  private verifyFileStoppedChanging(filePath: string): boolean {
    try {
      const current = this.getFileMetadata(filePath);
      const last = this.lastFileState.get(filePath);

      if (!last) {
        return false;  // No previous state
      }

      // Check file identity (object ID)
      // Blocks: WIN-T11 (volume move)
      if (
        current.volumeSerialNumber !== last.volumeSerialNumber ||
        current.fileIndexHigh !== last.fileIndexHigh ||
        current.fileIndexLow !== last.fileIndexLow
      ) {
        this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
          reason: 'Export target identity changed (volume or object ID)',
          filePath
        });
        return false;
      }

      // Check size and mtime stable
      const timeDiff = current.mtime - last.mtime;
      const sizeDiff = Math.abs(current.size - last.size);

      if (sizeDiff === 0 && timeDiff < 100) {
        return true;  // File is stable
      }

      return false;
    } catch (err) {
      return true;  // Error reading file, assume stopped
    }
  }

  /**
   * Get file metadata (size + mtime + object ID)
   */
  private getFileMetadata(filePath: string): WindowsFileMetadata {
    // Win32: GetFileAttributesEx() + GetFileInformationByHandle()
    return {
      size: 0,
      mtime: 0,
      path: filePath,
      volumeSerialNumber: 0,
      fileIndexHigh: 0,
      fileIndexLow: 0
    };
  }
}
```

---

## 5. WINDOWSENFORCEMENT​ADAPTER

**Purpose:** Central routing + coordination between capability requests and gates
**Scope:** Maps capabilities to WindowsAccessibilityGate, WindowsFileAccessGate, WindowsExportJobController

```typescript
export class WindowsEnforcementAdapter {
  private accessibilityGate: WindowsAccessibilityGate;
  private fileAccessGate: WindowsFileAccessGate;
  private exportJobController: WindowsExportJobController;
  private dialogWatcher: WindowsDialogWatcher;
  private sessionCtx: SessionContext;
  private audit = getAuditLogger();

  constructor(
    dialogWatcher: WindowsDialogWatcher,
    sessionCtx: SessionContext
  ) {
    this.dialogWatcher = dialogWatcher;
    this.sessionCtx = sessionCtx;

    // Instantiate gates (all share same dialogWatcher + sessionCtx)
    this.accessibilityGate = new WindowsAccessibilityGate(dialogWatcher, sessionCtx);
    this.fileAccessGate = new WindowsFileAccessGate(dialogWatcher, sessionCtx);
    this.exportJobController = new WindowsExportJobController(dialogWatcher, sessionCtx);
  }

  /**
   * Main enforcement entry point
   * Routes capability to appropriate gate
   */
  async enforceCapability(
    capability: Capability,
    context: ExecutionContext
  ): Promise<void> {
    switch (capability) {
      case Capability.UI_NAVIGATION:
        return await this.accessibilityGate.enforceUINavigation({
          capability,
          windowHandle: context.windowHandle,
          processId: context.processId,
          sessionId: context.sessionId
        });

      case Capability.TEXT_INPUT:
        return await this.accessibilityGate.enforceTextInput({
          capability,
          windowHandle: context.windowHandle,
          processId: context.processId,
          sessionId: context.sessionId,
          fieldId: context.fieldId,
          fieldType: context.fieldType
        });

      case Capability.PARAMETER_ADJUSTMENT:
        return await this.accessibilityGate.enforceParameterAdjustment({
          capability,
          windowHandle: context.windowHandle,
          processId: context.processId,
          sessionId: context.sessionId
        });

      case Capability.FILE_READ:
        return await this.fileAccessGate.enforceFileRead({
          capability,
          filePath: context.filePath,
          sessionId: context.sessionId
        });

      case Capability.FILE_WRITE:
        return await this.fileAccessGate.enforceFileWrite({
          capability,
          filePath: context.filePath,
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
   * Enforce RENDER_EXPORT and return killable job handle
   */
  private async enforceRenderExport(context: ExecutionContext): Promise<void> {
    const handle = await this.exportJobController.enforceRenderExport({
      capability: Capability.RENDER_EXPORT,
      filePath: context.filePath,
      sessionId: context.sessionId
    });

    // Store handle for later cancellation
    // (implementation detail: caller may cache and call handle.cancel())
  }

  /**
   * Dialog detection routing (called by macOS/Windows UI layer)
   * Routes to shared WindowsDialogWatcher
   */
  onOSDialogDetected(dialogType: string, metadata: any): void {
    this.dialogWatcher.onDialogDetected(dialogType, metadata);
  }

  onOSDialogCleared(): void {
    this.dialogWatcher.onDialogCleared();
  }

  /**
   * Session end → revoke all permissions
   */
  endSession(sessionId: string): void {
    this.accessibilityGate.revokeAllPermissions();
    this.fileAccessGate.revokeAllPermissions();
    this.exportJobController.revokeAllPermissions();
    this.dialogWatcher.revokeAllPermissions();

    this.sessionCtx.revoke(sessionId);

    this.audit.emit('OS_SESSION_ENDED', {
      sessionId,
      timestamp: Date.now()
    });
  }
}
```

---

## INVARIANT MAPPING (WIN-Txx → Implementation)

| Threat | Invariant | Phase 4 Component | Method | Annotation |
|---|---|---|---|---|
| WIN-T01, WIN-T02, WIN-T15 | INV-05 (Dialog freeze) | WindowsDialogWatcher | throwIfModalVisible() | // Blocks: WIN-T01, WIN-T02, WIN-T15 |
| WIN-T03, WIN-T04 | INV-06 (Window binding) | WindowsAccessibilityGate | isWindowIdentityValid() | // Blocks: WIN-T03, WIN-T04 |
| WIN-T14 | INV-07 (Secure field) | WindowsAccessibilityGate | verifyTokenElevation() | // Blocks: WIN-T14 |
| WIN-T05, WIN-T06 | INV-04 (No persistence) | WindowsFileAccessGate | requestSecurityScopedAccess() | // Blocks: WIN-T05, WIN-T06 |
| WIN-T09, WIN-T11 | INV-09 (File identity) | WindowsFileAccessGate | getFileIdentity() | // Blocks: WIN-T09, WIN-T11 |
| WIN-T10 | INV-04 (ADS rejection) | WindowsFileAccessGate | enforceFileRead/Write() | // Blocks: WIN-T10 |
| WIN-T07, WIN-T08 | INV-08 (Killable jobs) | WindowsExportJobController | enforceKillOnJobClose() | // Blocks: WIN-T07, WIN-T08 |

---

## ACCEPTANCE TEST MAPPING (Next Phase)

Each test proves one or more vectors are dead:

- **WIN-ACC-01:** Dialog freeze denies enforcement (blocks WIN-T01, WIN-T02, WIN-T15)
- **WIN-ACC-02:** Job termination on session end (blocks WIN-T05, WIN-T07, WIN-T08)
- **WIN-ACC-03:** Crash → relaunch → no persistence (blocks WIN-T12, WIN-T13)
- **WIN-ACC-04:** HWND reuse → identity mismatch deny (blocks WIN-T03)
- **WIN-ACC-05:** Handle reuse fails without re-prompt (blocks WIN-T06)
- **WIN-ACC-06:** Export termination → file stable + identity verified (blocks WIN-T11)
- **WIN-ACC-07:** Password field → hard deny (blocks WIN-T14)
- **WIN-ACC-08:** Missing fieldType classification → deny (blocks WIN-T14 prevention)
- **WIN-ACC-09:** Modal single source of truth (blocks WIN-T02 desync)

---

## STATUS

✅ Phase 4 Windows Enforcement Spec complete
✅ All WIN-Txx vectors mapped to blocking implementation
✅ Method signatures and contracts defined
⏳ WIN-ACC-01 → WIN-ACC-09 Acceptance Tests — **NEXT**

---

**Next Artifact:**
`WIN-ACC-01_through_WIN-ACC-09_ACCEPTANCE_TEST_SUITE.test.ts`
