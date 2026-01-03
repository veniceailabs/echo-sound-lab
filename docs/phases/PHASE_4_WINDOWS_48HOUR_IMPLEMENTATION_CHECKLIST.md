# PHASE 4 — WINDOWS 48-HOUR IMPLEMENTATION CHECKLIST

**Status:** 🎯 EXECUTION MARCHING ORDERS
**Audience:** Implementation team (engineers, leads, reviewers)
**Duration:** Days 1–2 of implementation
**Constraint:** Execute in priority order. Do NOT deviate.

---

## OVERVIEW

This checklist breaks Phase 4 Windows into sprint-grade scope.

**What this is:**
- Exact high-risk lines per gate
- Priority order (what breaks first?)
- "Do not touch yet" list (invariant protection)
- Copy-pasteable task assignments

**What this is NOT:**
- A spec (you already have the spec)
- A design doc (you already have the design)
- A test plan (you already have the tests)

This is: **What to code first, why it matters, what failure looks like.**

---

## EXECUTIVE SUMMARY (Read This First)

### The 48-Hour Goal
All four gates + adapter compile and run with:
- ✅ Dialog watcher is global & authoritative (not replicated in gates)
- ✅ SessionContext is truly single-source (not cached per-gate)
- ✅ Job objects are created + killable (KILL_ON_JOB_CLOSE enforced)
- ✅ Handles are non-inheritable by default (inheritance disabled)
- ✅ File identity captures volume + object ID (not just path)
- ✅ All audit events are logged (proofs, not just checks)

### What WILL Break If You Skip This
| Missing | Test Fails | Ghost Vector |
|---------|-----------|--------------|
| Dialog watcher global | WIN-ACC-01, 09 | WIN-T01, T02, T15 |
| Session binding check | WIN-ACC-03, 05 | WIN-T06, T12, T13 |
| Job termination | WIN-ACC-02 | WIN-T07, T08, T05 |
| File identity (volume) | WIN-ACC-06 | WIN-T09, T11 |
| Audit events | All tests | Silent bypass |

### What You're NOT Doing Yet
- ❌ Optimizing loops
- ❌ Refactoring for elegance
- ❌ Handling edge cases (beyond what tests check)
- ❌ Adding features
- ❌ Documenting (code clarity first, docs second)

**Goal: Skeleton correctness. Invariants enforced. Tests passing.**

---

## TASK PRIORITY ORDER

### TIER 0: Infrastructure (Prerequisite)

**Task 0.1: Wire SessionContext singleton**

**What:** Ensure SessionContext is injected into ALL gates and adapter.

**Code landmarks:**
```typescript
// src/os/windows/WindowsEnforcementAdapter.ts
constructor(authority?: CapabilityAuthority, reserved?: any, sessionCtx?: SessionContext) {
  this.sessionCtx = sessionCtx || new SessionContext();  // ← SINGLE INSTANCE

  // All gates receive SAME sessionCtx (not new instances)
  this.accessibilityGate = new WindowsAccessibilityGate(dialogWatcher, this.sessionCtx);
  this.fileAccessGate = new WindowsFileAccessGate(dialogWatcher, this.sessionCtx);
  this.exportJobController = new WindowsExportJobController(dialogWatcher, this.sessionCtx);
}
```

**Verification:** All gates log `sessionCtx.assert()` at method entry. No gate creates its own SessionContext.

**Why it matters (WIN-T06, WIN-ACC-05):** If SessionContext is replicated per-gate, session binding breaks. Handle reuse succeeds.

**Risk level:** 🔴 HIGH (silent bypass if missed)

---

**Task 0.2: Wire WindowsDialogWatcher singleton**

**What:** Ensure DialogWatcher is shared (via factory, not new instances).

**Code landmarks:**
```typescript
// src/os/windows/getSharedWindowsDialogWatcher.ts
let sharedWatcher: WindowsDialogWatcher | null = null;

export function getSharedWindowsDialogWatcher(): WindowsDialogWatcher {
  if (!sharedWatcher) {
    sharedWatcher = new WindowsDialogWatcher();
  }
  return sharedWatcher;  // ← ALWAYS SAME INSTANCE
}

// src/os/windows/WindowsEnforcementAdapter.ts
this.dialogWatcher = getSharedWindowsDialogWatcher();  // ← Use factory
```

**Verification:** All gates receive dialogWatcher via factory. No gate creates its own watcher. `resetSharedWindowsDialogWatcher()` works in tests.

**Why it matters (WIN-T01, WIN-T02, WIN-ACC-01, WIN-ACC-09):** If each gate has its own watcher, dialog state desync. One gate sees modal, another doesn't. Stale freeze. Ghost wins (WIN-T02).

**Risk level:** 🔴 HIGH (dialog desync if missed)

---

### TIER 1: Dialog Watcher (Days 1–2, First 4 Hours)

**Task 1.1: Implement WindowsDialogWatcher.throwIfModalVisible()**

**What:** Hard stop if isModalVisible flag is true. No logic, just throw.

**Code landmarks:**
```typescript
// src/os/windows/WindowsDialogWatcher.ts
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
```

**Verification:**
- [ ] Method exists and is called at entry of ALL enforce methods (accessibility + file access)
- [ ] Throws [OS_HARD_STOP] error string (exact match)
- [ ] Audit event emitted before throw
- [ ] WIN-ACC-01 test passes (dialog detected → hard stop)

**Why it matters (WIN-T01, WIN-T02, WIN-T15):** This is the gate guard. If missing or called too late, dialog bypass succeeds. All three vectors win.

**Risk level:** 🔴 CRITICAL (immediate bypass if missing)

**Do NOT:** Try to optimize modal detection logic yet. Just make throwIfModalVisible() bulletproof.

---

**Task 1.2: Implement WindowsDialogWatcher.onDialogDetected() + onDialogCleared()**

**What:** Update isModalVisible flag and audit log.

**Code landmarks:**
```typescript
// src/os/windows/WindowsDialogWatcher.ts
onDialogDetected(dialogType: string, metadata?: any): void {
  const hwnd = metadata?.hwnd ?? 0x0000;

  const dialog: WindowsModalDialog = {
    hwnd,
    title: metadata?.title ?? 'Unknown',
    className: metadata?.className ?? 'UnknownClass',
    processId: metadata?.processId ?? 0,
    isSystemOwned: this.isSystemOwnedDialog(hwnd, metadata?.processId)
  };

  if (dialog.isSystemOwned) {
    this.dialogs.set(hwnd, dialog);
    this.isModalVisible = true;  // ← SET FLAG

    this.audit.emit('OS_DIALOG_DETECTED', {  // ← AUDIT FIRST
      hwnd: `0x${hwnd.toString(16)}`,
      title: dialog.title,
      className: dialog.className,
      processId: dialog.processId,
      timestamp: Date.now()
    });
  }
}

onDialogCleared(dialogHwnd?: number): void {
  if (dialogHwnd !== undefined) {
    this.dialogs.delete(dialogHwnd);  // ← REMOVE

    this.audit.emit('OS_DIALOG_CLEARED', {  // ← AUDIT
      hwnd: `0x${dialogHwnd.toString(16)}`,
      timestamp: Date.now()
    });
  } else {
    this.dialogs.clear();
  }

  // ← CRITICAL: Reset flag if no more dialogs
  if (this.dialogs.size === 0) {
    this.isModalVisible = false;
  }
}
```

**Verification:**
- [ ] isModalVisible is set to true on detect
- [ ] isModalVisible is set to false when dialogs.size === 0
- [ ] OS_DIALOG_DETECTED audit emitted on detect
- [ ] OS_DIALOG_CLEARED audit emitted on clear
- [ ] WIN-ACC-01 test passes (detect → frozen)
- [ ] WIN-ACC-09 test passes (clear → resume, no stale freeze)

**Why it matters (WIN-ACC-09, WIN-T02):** If isModalVisible doesn't reset, stale freeze remains. Dialog is cleared but execution still frozen. WIN-ACC-09 fails.

**Risk level:** 🔴 CRITICAL (stale freeze if reset missing)

**Do NOT:** Implement modal detection logic yet (EnumWindows, WS_DISABLED filter). Just manage the flag and audit.

---

**Task 1.3: Stub WindowsDialogWatcher.isSystemOwnedDialog()**

**What:** Return false (conservative default) until detection logic ready.

**Code landmarks:**
```typescript
// src/os/windows/WindowsDialogWatcher.ts
private isSystemOwnedDialog(hwnd: number, pid: number): boolean {
  // TODO: Implement GetProcessImageFileNameW to verify system process
  // For now: stub returns false (assume not system-owned until proven)
  return false;
}
```

**Verification:**
- [ ] Method exists and is called
- [ ] Returns false (conservative)
- [ ] Tests don't fail because of this (use adapter to inject fake dialogs in tests)

**Why it matters:** Dialog detection is complex (EnumWindows, WS_DISABLED, system process verification). It's not on the critical path for Day 1–2. Stub it safely.

**Risk level:** 🟡 LOW (logic can come later, stub is safe)

---

### TIER 2: SessionContext & Binding (Days 1–2, 4–8 Hours)

**Task 2.1: Ensure SessionContext.bind() + assert() + revoke()**

**What:** SessionContext already exists in Phase 3C. Just verify it's shared.

**Code landmarks:**
```typescript
// src/os/common/SessionContext.ts (ALREADY EXISTS)
export class SessionContext {
  private currentSessionId: string | null = null;

  bind(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  assert(sessionId: string): void {
    if (this.currentSessionId !== sessionId) {
      throw new Error('[SESSION_MISMATCH] Session binding assertion failed');
    }
  }

  get(): string | null {
    return this.currentSessionId;
  }

  revoke(sessionId: string): void {
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }
}
```

**Verification:**
- [ ] SessionContext is imported from `../common/SessionContext` (not created locally)
- [ ] All gates call `this.sessionCtx.assert(request.sessionId)` at method entry (AFTER dialog check)
- [ ] All enforce methods receive sessionId in context
- [ ] WIN-ACC-03 test passes (session binding enforced)
- [ ] WIN-ACC-05 test passes (handle reuse fails across sessions)

**Why it matters (WIN-T06, WIN-ACC-05):** Without session binding, old bookmarks/handles reused in new session. WIN-ACC-05 fails. Ghost vectors WIN-T06, WIN-T12, WIN-T13 win.

**Risk level:** 🔴 CRITICAL (silent reuse if missing)

**Do NOT:** Modify SessionContext logic. Use as-is from Phase 3C.

---

**Task 2.2: Wire verifyBookmarkStillValid() session check**

**What:** Check sessionId before allowing bookmark reuse.

**Code landmarks:**
```typescript
// src/os/windows/WindowsFileAccessGate.ts
private verifyBookmarkStillValid(bookmark: WindowsSecurityScopedBookmark): boolean {
  // CRITICAL: Check session binding FIRST
  if (this.sessionCtx.get() !== bookmark.sessionId) {
    return false;  // ← Session changed, deny
  }

  // Then check expiration
  if (Date.now() > bookmark.expiresAt) {
    return false;
  }

  return true;
}
```

**Verification:**
- [ ] Session check is FIRST (before expiration)
- [ ] Mismatch returns false (not allowed)
- [ ] WIN-ACC-05 test passes (new session denied)
- [ ] WIN-ACC-03 test passes (crash → relaunch → deny)

**Why it matters (WIN-ACC-05, WIN-T06):** If session check is missing or after expiration check, old session bookmark reused. WIN-ACC-05 fails.

**Risk level:** 🔴 CRITICAL (session reuse if missing)

---

### TIER 3: File Identity & Persistence Paths (Days 1–2, 8–12 Hours)

**Task 3.1: Implement WindowsFileAccessGate.getFileIdentity()**

**What:** Capture volume serial + file object ID. NOT just path.

**Code landmarks:**
```typescript
// src/os/windows/WindowsFileAccessGate.ts
private async getFileIdentity(filePath: string): Promise<WindowsFileIdentity> {
  // Win32 API needed:
  // 1. CreateFileA(filePath, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL)
  // 2. GetFileInformationByHandle(hFile) → BY_HANDLE_FILE_INFORMATION
  // 3. Extract: nFileIndexHigh, nFileIndexLow (NTFS object ID), dwVolumeSerialNumber
  // 4. CloseHandle(hFile)

  return {
    volumeSerialNumber: 0,  // TODO: GetFileInformationByHandle().dwVolumeSerialNumber
    fileIndexHigh: 0,       // TODO: GetFileInformationByHandle().nFileIndexHigh
    fileIndexLow: 0,        // TODO: GetFileInformationByHandle().nFileIndexLow
    filePath
  };
}
```

**Verification:**
- [ ] Method returns WindowsFileIdentity with volume + high + low
- [ ] Identity is captured at grant time (requestSecurityScopedAccess)
- [ ] Identity is re-verified at access time (enforceFileRead/enforceFileWrite)
- [ ] WIN-ACC-04, WIN-ACC-06 tests work (need real identity values, not just zeros)

**Why it matters (WIN-T09, WIN-T11):** Path alone is not identity. Hardlinks share path. Volume moves change device. Object ID (inode-equivalent on NTFS) is immutable. Without this, WIN-T09 and WIN-T11 bypass.

**Risk level:** 🔴 CRITICAL (hardlink/volume swap if missing)

**Do NOT:** Implement before getting file handle code right. Stub is OK for Day 1.

---

**Task 3.2: Implement ADS path rejection**

**What:** Reject alternate data streams (colon-based paths).

**Code landmarks:**
```typescript
// src/os/windows/WindowsFileAccessGate.ts
private isValidPath(filePath: string): boolean {
  // Reject paths with : beyond drive letter
  // Valid: "C:\file.txt", "D:\data"
  // Invalid: "file.txt:stream", "C:\file.txt:hidden"

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
```

**Called in:** enforceFileRead() + enforceFileWrite() (BEFORE bookmark check)

**Verification:**
- [ ] ADS path check happens early (before bookmark lookup)
- [ ] Rejects "file.txt:payload"
- [ ] Accepts "C:\file.txt"
- [ ] WIN-ACC-07 / WIN-ACC-08 tests pass

**Why it matters (WIN-T10):** ADS can hide payloads. Without rejection, Ghost can write to `export.wav:evil.exe`. System plays audio, evil runs hidden.

**Risk level:** 🟡 MEDIUM (ADS is post-exploitation, not initial bypass)

---

**Task 3.3: Implement no-persistence guarantee**

**What:** Ensure bookmarks are memory-only. NO registry, NO appdata, NO disk.

**Code landmarks:**
```typescript
// src/os/windows/WindowsFileAccessGate.ts

// IN requestSecurityScopedAccess():
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

// Store IN MEMORY ONLY (never disk, registry, appdata)
this.bookmarks.set(bookmarkId, bookmark);  // ← ONLY THIS

// NOT this:
// fs.writeFileSync(...);  // ← NEVER
// Registry.SetValue(...);  // ← NEVER
// process.env.BOOKMARK = ...;  // ← NEVER


// IN revokeAllPermissions():
public revokeAllPermissions(): void {
  // Close all handles
  for (const bookmark of this.bookmarks.values()) {
    if (bookmark.handle) {
      // CloseHandle(bookmark.handle)
    }
  }

  // Gate clears ONLY local state
  this.bookmarks.clear();  // ← CRITICAL

  // NOT this:
  // fs.unlinkSync(...);  // ← Don't clean up (nothing to clean)
  // Registry.Delete(...);  // ← Don't clean up
}
```

**Verification:**
- [ ] No fs.writeFileSync / readFileSync for bookmarks
- [ ] No Windows Registry calls (RegSetValueEx, RegQueryValueEx)
- [ ] No environment variable leakage
- [ ] bookmarks.clear() called in revokeAllPermissions()
- [ ] WIN-ACC-03 test passes (no persistence across sessions)

**Why it matters (WIN-T12, WIN-T13, WIN-ACC-03):** If bookmarks are persisted to disk/registry, new session reloads them silently. No user re-mediation. WIN-ACC-03 fails.

**Risk level:** 🔴 CRITICAL (silent cross-session reuse if missed)

**Do NOT:** Store bookmarks anywhere except this.bookmarks Map.

---

### TIER 4: Export Job Controller (Days 1–2, 12–16 Hours)

**Task 4.1: Implement WindowsExportJobController.createJobObject()**

**What:** Create Win32 job object with KILL_ON_JOB_CLOSE enforced.

**Code landmarks:**
```typescript
// src/os/windows/WindowsExportJobController.ts
private createJobObject(jobId: string): number | null {
  // Win32 API:
  // 1. CreateJobObject(NULL, jobName) → HANDLE (or NULL on failure)
  // 2. Return handle as number (or null)

  // TODO: Call CreateJobObject via Win32 binding
  // Placeholder for now:
  return null;
}

private enforceKillOnJobClose(jobObject: number): void {
  // Win32 API:
  // 1. SetInformationJobObject(jobObject, JobObjectExtendedLimitInformation, &info, sizeof(info))
  // 2. Set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE flag

  // TODO: Call SetInformationJobObject via Win32 binding
}

private terminateJobObject(jobObject: number): void {
  // Win32 API:
  // 1. TerminateJobObject(jobObject, 0) → BOOL

  // TODO: Call TerminateJobObject via Win32 binding
}
```

**Verification:**
- [ ] createJobObject() returns non-null HANDLE (not stub value)
- [ ] enforceKillOnJobClose() is called in enforceRenderExport()
- [ ] terminateJobObject() is called in cancelJob() + revokeAllPermissions()
- [ ] WIN-ACC-02 test passes (job terminates on session end)

**Why it matters (WIN-T07, WIN-T08):** Without job objects, child processes survive termination. Remote threads can spawn outside job boundary. WIN-T07, WIN-T08 bypass.

**Risk level:** 🔴 CRITICAL (process escape if missing)

**Do NOT:** Try to optimize job management. Just make create → terminate → verify work.

---

**Task 4.2: Implement file identity check in verifyFileStoppedChanging()**

**What:** Check identity FIRST (before size/mtime).

**Code landmarks:**
```typescript
// src/os/windows/WindowsExportJobController.ts
private verifyFileStoppedChanging(filePath: string): boolean {
  try {
    const current = this.getFileMetadata(filePath);
    const last = this.lastFileState.get(filePath);

    if (!last) {
      return false;
    }

    // CHECK IDENTITY FIRST (before size/mtime)
    // Identity change = file was swapped
    if (
      current.volumeSerialNumber !== last.volumeSerialNumber ||
      current.fileIndexHigh !== last.fileIndexHigh ||
      current.fileIndexLow !== last.fileIndexLow
    ) {
      this.audit.emit('OS_EXPORT_JOB_TERMINATED', {
        reason: 'Export target identity changed (volume or object ID)',
        filePath,
        original: {
          volumeSerial: last.volumeSerialNumber,
          objectId: `${last.fileIndexHigh}:${last.fileIndexLow}`
        },
        current: {
          volumeSerial: current.volumeSerialNumber,
          objectId: `${current.fileIndexHigh}:${current.fileIndexLow}`
        }
      });
      return false;
    }

    // THEN check size + mtime (file stopped changing)
    const timeDiff = current.mtime - last.mtime;
    const sizeDiff = Math.abs(current.size - last.size);

    if (sizeDiff === 0 && timeDiff < 100) {
      return true;  // File stable
    }

    return false;
  } catch (err) {
    return true;  // Error reading file, assume stopped
  }
}
```

**Verification:**
- [ ] Identity check is FIRST
- [ ] Size/mtime check is AFTER
- [ ] Audit logs identity mismatch
- [ ] WIN-ACC-06 test passes (file stability verified)

**Why it matters (WIN-T11, WIN-ACC-06):** If identity check is last or missing, volume move (WIN-T11) goes undetected. Export terminates but file was swapped. WIN-ACC-06 fails.

**Risk level:** 🔴 CRITICAL (file swap if identity check is late)

---

### TIER 5: Accessibility Gate (Days 1–2, 16–20 Hours)

**Task 5.1: Enforce dialog freeze FIRST in enforceTextInput()**

**What:** throwIfModalVisible() must be line 1, before ANY other check.

**Code landmarks:**
```typescript
// src/os/windows/WindowsAccessibilityGate.ts
async enforceTextInput(request: WindowsAccessibilityRequest): Promise<void> {
  // LINE 1: Dialog freeze (before fieldType check, before anything)
  this.dialogWatcher.throwIfModalVisible();

  const fieldId = request.fieldId || 'unknown-field';

  // THEN check fieldType (it's mandatory)
  if (!request.fieldType) {
    this.audit.emit('OS_PERMISSION_DENIED', {
      capability: 'TEXT_INPUT',
      fieldId,
      reason: 'Missing fieldType classification'
    });
    throw new Error('[OS_PERMISSION_DENIED] TEXT_INPUT requires explicit fieldType');
  }

  // ... rest of method
}
```

**Verification:**
- [ ] throwIfModalVisible() is line 1 (or immediately after comments)
- [ ] It's called BEFORE fieldType check
- [ ] It's called BEFORE permission checks
- [ ] WIN-ACC-01, WIN-ACC-08 tests pass

**Why it matters (WIN-T01, WIN-T02):** If dialog check is late, attacker can inject dialog → field type check happens → credential field accessed while modal is present. WIN-T01, WIN-T02 bypass.

**Risk level:** 🔴 CRITICAL (dialog bypass if not first)

---

**Task 5.2: Hard deny SENSITIVE fields (line 2)**

**What:** Throw immediately, no other checks.

**Code landmarks:**
```typescript
// src/os/windows/WindowsAccessibilityGate.ts
const fieldType = request.fieldType;

// Check session binding
this.sessionCtx.assert(request.sessionId);

this.audit.emit('OS_PERMISSION_REQUESTED', {
  capability: 'TEXT_INPUT',
  fieldId,
  fieldType,
  windowHandle: `0x${request.windowHandle.toString(16)}`,
  timestamp: Date.now()
});

// CRITICAL: SENSITIVE field → immediate hard deny
if (fieldType === 'SENSITIVE') {
  this.audit.emit('SENSITIVE_FIELD_BLOCKED', {
    fieldId,
    reason: 'SENSITIVE field classification'
  });
  throw new Error('[OS_HARD_STOP] SENSITIVE field blocked. Transition to S6 HALTED.');
}

// Default deny for UNKNOWN fields
if (fieldType === 'UNKNOWN') {
  // ... deny with ACC_REQUIRED ...
}

// Proceed with SAFE field
if (fieldType === 'SAFE') {
  // ... window identity check, token elevation, job membership ...
}
```

**Verification:**
- [ ] SENSITIVE check is AFTER fieldType validation (not before)
- [ ] SENSITIVE → throw [OS_HARD_STOP]
- [ ] SENSITIVE → audit SENSITIVE_FIELD_BLOCKED
- [ ] No fallthrough to other checks
- [ ] WIN-ACC-07 test passes

**Why it matters (WIN-T14):** SENSITIVE fields (passwords, PINs, credential stores) must never be touched. If check is late or missing, credential harvest succeeds. WIN-T14 wins.

**Risk level:** 🔴 CRITICAL (credential leak if missing)

---

**Task 5.3: Stub verifyTokenElevation() + verifyJobMembership()**

**What:** Return true for now (stub).

**Code landmarks:**
```typescript
// src/os/windows/WindowsAccessibilityGate.ts
private async verifyTokenElevation(callerPid: number): Promise<boolean> {
  // TODO: Win32 GetProcessToken + GetTokenInformation(TokenElevation)
  // Compare with parent app elevation level
  // For now: stub returns true
  return true;
}

private async verifyJobMembership(callerPid: number): Promise<boolean> {
  // TODO: Win32 IsProcessInJob
  // Returns false if process not in active job
  // For now: stub returns true
  return true;
}
```

**Verification:**
- [ ] Methods exist and are called
- [ ] Return type is correct (Promise<boolean>)
- [ ] Tests don't fail because of stubs

**Why it matters:** Token elevation + job membership are complex Win32 calls. They're not on critical path for Day 1–2. Stub them.

**Risk level:** 🟡 LOW (can implement after skeleton is correct)

---

### TIER 6: Adapter (Days 1–2, 20–24 Hours)

**Task 6.1: Wire WindowsEnforcementAdapter routing**

**What:** All capabilities route to correct gate + correct method.

**Code landmarks:**
```typescript
// src/os/windows/WindowsEnforcementAdapter.ts
async enforceCapability(
  capabilityRequest: any,
  context: ExecutionContext
): Promise<any> {
  const capability = capabilityRequest.capability;

  switch (capability) {
    case Capability.UI_NAVIGATION:
      return await this.accessibilityGate.enforceUINavigation({
        capability,
        windowHandle: context.windowHandle!,
        processId: context.processId!,
        sessionId: context.sessionId
      });

    case Capability.TEXT_INPUT:
      return await this.accessibilityGate.enforceTextInput({
        capability,
        windowHandle: context.windowHandle!,
        processId: context.processId!,
        sessionId: context.sessionId,
        fieldId: context.fieldId,
        fieldType: context.fieldType
      });

    case Capability.PARAMETER_ADJUSTMENT:
      return await this.accessibilityGate.enforceParameterAdjustment({
        capability,
        windowHandle: context.windowHandle!,
        processId: context.processId!,
        sessionId: context.sessionId
      });

    case Capability.FILE_READ:
      return await this.fileAccessGate.enforceFileRead({
        capability,
        filePath: context.filePath!,
        sessionId: context.sessionId
      });

    case Capability.FILE_WRITE:
      return await this.fileAccessGate.enforceFileWrite({
        capability,
        filePath: context.filePath!,
        isExportPath: context.isExportPath,
        sessionId: context.sessionId
      });

    case Capability.RENDER_EXPORT:
      return await this.enforceRenderExport(context);

    default:
      throw new Error(`[GATE_ERROR] Unknown capability: ${capability}`);
  }
}
```

**Verification:**
- [ ] All 6 capabilities are handled (UI_NAVIGATION, TEXT_INPUT, PARAMETER_ADJUSTMENT, FILE_READ, FILE_WRITE, RENDER_EXPORT)
- [ ] Routing is exhaustive (no fallthrough)
- [ ] No new capabilities are added
- [ ] Tests compile and run

**Why it matters:** If routing is wrong or missing, tests don't match implementation. Silent logic gaps.

**Risk level:** 🟡 MEDIUM (obvious in testing, not silent bypass)

---

**Task 6.2: Implement onSessionEnd() with hard revocation**

**What:** End session → revoke ALL gates.

**Code landmarks:**
```typescript
// src/os/windows/WindowsEnforcementAdapter.ts
onSessionEnd(sessionId?: string): void {
  this.audit.emit('OS_SESSION_ENDING', {
    sessionId: sessionId || this.sessionCtx.get(),
    timestamp: Date.now()
  });

  // Revoke ALL gates (order doesn't matter, but be thorough)
  this.accessibilityGate.revokeAllPermissions();
  this.fileAccessGate.revokeAllPermissions();
  this.exportJobController.revokeAllPermissions();
  this.dialogWatcher.revokeAllPermissions();

  // Revoke session context
  if (sessionId) {
    this.sessionCtx.revoke(sessionId);
  }

  this.audit.emit('OS_SESSION_ENDED', {
    sessionId: sessionId || this.sessionCtx.get(),
    timestamp: Date.now()
  });
}
```

**Verification:**
- [ ] All four components are revoked (accessibility, file access, export, dialog)
- [ ] SessionContext is revoked
- [ ] OS_SESSION_ENDING + OS_SESSION_ENDED events emitted
- [ ] WIN-ACC-02, WIN-ACC-03 tests pass

**Why it matters (WIN-T05, WIN-T07, WIN-ACC-02):** If revocation is incomplete, jobs survive. Handles persist. Export continues. WIN-ACC-02 fails.

**Risk level:** 🔴 CRITICAL (background execution if incomplete)

---

## DO NOT TOUCH YET (Invariant Protection)

These are NOT on Days 1–2. They're Day 3+.

- ❌ EnumWindows modal detection (Task 1.2 stub is OK, full impl is Day 3)
- ❌ Win32 file identity API calls (Task 3.1 stubs OK, full impl is Day 3)
- ❌ Win32 job object API calls (Task 4.1 stubs OK, full impl is Day 3)
- ❌ Token elevation verification (Task 5.3 stub OK, full impl is Day 3+)
- ❌ Error handling for edge cases (unless it makes a test fail)
- ❌ Performance optimization
- ❌ Refactoring for elegance
- ❌ Adding new files or helpers

**Why:** If you start with Win32 API calls before skeleton is correct, you'll debug API issues + skeleton issues simultaneously. Impossible.

**Skeleton first. Then precision.**

---

## REVIEW CHECKLIST (For Code Review)

When PRs land, ask:

### Dialog Watcher PR
- [ ] throwIfModalVisible() is line 1 of enforce methods?
- [ ] isModalVisible resets when dialogs.size === 0?
- [ ] OS_DIALOG_DETECTED + OS_DIALOG_CLEARED both emitted?
- [ ] Factory prevents new instances?

### SessionContext PR
- [ ] sessionCtx.assert() called AFTER dialog, BEFORE logic?
- [ ] verifyBookmarkStillValid() checks sessionId first?
- [ ] bookmarks.clear() called in revoke?

### File Identity PR
- [ ] getFileIdentity returns (volumeSerial, indexHigh, indexLow)?
- [ ] Identity check is BEFORE size/mtime in verify?
- [ ] ADS paths rejected early?

### Export Job PR
- [ ] createJobObject() returns non-null HANDLE?
- [ ] enforceKillOnJobClose() called?
- [ ] terminateJobObject() called in revoke?

### Accessibility Gate PR
- [ ] throwIfModalVisible() is line 1?
- [ ] SENSITIVE fields hard-deny immediately?
- [ ] fieldType is mandatory (not optional)?

### Adapter PR
- [ ] All 6 capabilities routed?
- [ ] All gates revoked in onSessionEnd()?

---

## SUCCESS CRITERIA (End of Day 2)

All of these must be true:

- ✅ Code compiles (TypeScript, no errors)
- ✅ All stubs run without crash
- ✅ WIN-ACC-01 passes (dialog freeze)
- ✅ WIN-ACC-02 passes (job termination)
- ✅ WIN-ACC-03 passes (no persistence)
- ✅ WIN-ACC-05 passes (session binding)
- ✅ WIN-ACC-06 passes (file identity verification — may stub identity values, but check is present)
- ✅ Audit logs are complete (every enforce emits events)
- ✅ No gate caches dialog state (uses watcher only)
- ✅ No gate creates its own SessionContext (injected)
- ✅ No persistence to disk/registry (memory-only)

**If any test fails: Don't loosen test. Fix code.**

---

## NEXT PHASE (Day 3 Onward)

Once skeleton is correct:

1. Implement Win32 API calls (modal detection, file identity, job objects)
2. Implement token verification + job membership checks
3. Day 5: Full test suite runs
4. Day 6: Pre-Ghost self-attack
5. Day 7: Ghost review

---

**END OF 48-HOUR CHECKLIST**

Distribute to engineering team. This is marching orders, not suggestion.

Questions? Ask before Day 1 starts.
