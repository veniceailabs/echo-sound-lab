# PHASE 4 WINDOWS — PR EXECUTION SEQUENCE (AUTHORITATIVE)

**Status:** 🔐 LOCKED (Non-Negotiable)
**Doctrine:** Each PR is mergeable only if Definition of Done is met. Tests never loosened. Failures = code is wrong.
**Sequence:** PR-001 → PR-007 (strict order, no deviation)

---

## RULE: TIER ORDERING IS NON-NEGOTIABLE

Each PR closes a tier. No PR can merge until previous tier is passing.

If a PR attempts to jump tiers or implement out-of-order: **BLOCK IMMEDIATELY**

---

## 🧱 PR-001 — TIER 0 FOUNDATIONS (BLOCKING)

**Status:** PREREQUISITE (all other PRs depend on this)

### Scope
Establish singletons + factories. No enforcement logic yet.

### Files (Expected to Touch)
- `src/os/windows/SessionContext.ts`
- `src/os/windows/WindowsDialogWatcher.ts`
- `src/os/windows/getSharedWindowsDialogWatcher.ts`
- `src/os/windows/types.ts` (hwnd identity, session binding shapes)
- `src/services/AuditLogger.ts` (verify Windows hooks exist, if needed)

### Must Implement

**SessionContext:**
- `bind(sessionId: string): void`
- `assert(sessionId: string): void` — throws if mismatch
- `revoke(sessionId: string): void` — clears if match
- `get(): string | null` — returns current sessionId

**WindowsDialogWatcher:**
- `onDialogDetected(dialogType: string, metadata?: any): void`
- `onDialogCleared(dialogHwnd?: number): void`
- `throwIfModalVisible(): void` — throws `[OS_HARD_STOP]` if visible
- Private: `isSystemOwnedDialog()` (stub return false)

**Factory:**
- `getSharedWindowsDialogWatcher(): WindowsDialogWatcher` — returns SINGLE instance
- `resetSharedWindowsDialogWatcher(): void` — for tests only

**What NOT to include yet:**
- ❌ No WindowsAccessibilityGate
- ❌ No WindowsFileAccessGate
- ❌ No WindowsExportJobController
- ❌ No WindowsEnforcementAdapter

### Definition of Done

- ✅ Code compiles (TypeScript, no errors)
- ✅ SessionContext stores exactly one sessionId at a time
- ✅ No registry writes, disk writes, env vars, static caches
- ✅ Factory prevents new instances (same instance returned always)
- ✅ resetSharedWindowsDialogWatcher() clears state for tests
- ✅ NO WIN-ACC tests expected to pass yet (infrastructure only)

### Blocks Closed
None (foundation only)

### Merge Gate (REQUIRED)
🔒 **BLOCKING:** All other PRs depend on this. Must merge first.

### Ghost Verification
- [ ] Single instance only
- [ ] No persistence
- [ ] Factory is enforced

---

## 🧊 PR-002 — TIER 1: DIALOG FREEZE ENFORCEMENT

**Status:** After PR-001 merges

### Scope
Dialog detection, freeze, and resume logic. Bridge to enforce methods (stubs only).

### Files (Expected to Touch)
- `src/os/windows/WindowsDialogWatcher.ts` (enhance)
- Minimal stub wiring (just enough to call throwIfModalVisible from tests)

### Must Implement

**WindowsDialogWatcher (enhance PR-001 implementation):**
- `isModalVisible` boolean flag
- On `onDialogDetected()`:
  - Add dialog to internal Map
  - Set `isModalVisible = true`
  - Emit audit event: `OS_DIALOG_DETECTED`
- On `onDialogCleared()`:
  - Remove dialog from Map (by hwnd or all)
  - If Map is empty: set `isModalVisible = false`
  - Emit audit event: `OS_DIALOG_CLEARED`
- `throwIfModalVisible()`:
  - Emit audit event: `OS_HARD_STOP_TRIGGERED`
  - Throw error: `[OS_HARD_STOP] OS modal dialog visible, execution frozen`

### Definition of Done

- ✅ WIN-ACC-01 PASSES: Dialog detected → throws `[OS_HARD_STOP]`
- ✅ WIN-ACC-09 PASSES: Dialog cleared → no stale freeze on next call
- ✅ Audit events present: `OS_DIALOG_DETECTED`, `OS_DIALOG_CLEARED`, `OS_HARD_STOP_TRIGGERED`
- ✅ Flag resets when Map empty (critical for WIN-ACC-09)

### Blocks Closed
- WIN-T01 (fake permission dialog spoof)
- WIN-T02 (modal overlay hijack / desync)
- WIN-T15 (UAC boundary abuse)

### Merge Criteria
- Dialog freeze is enforced
- Clearing dialog removes freeze (no stale state)
- Both tests pass without test modification

---

## 🔗 PR-003 — TIER 2: SESSION BINDING ENFORCEMENT

**Status:** After PR-002 merges

### Scope
Single-session authority. Session binding checks. No persistence.

### Files (Expected to Touch)
- `src/os/windows/SessionContext.ts` (enhance)
- `src/os/windows/WindowsAccessibilityGate.ts` (stub with assert call)
- `src/os/windows/WindowsFileAccessGate.ts` (stub with assert call)

### Must Implement

**SessionContext (enhance PR-001 implementation):**
- Ensure `bind()`, `assert()`, `revoke()` work correctly
- `bind()` sets the current session (only one active at a time)
- `assert()` throws if sessionId doesn't match current
- `revoke()` clears current session

**Stub gates (WindowsAccessibilityGate, WindowsFileAccessGate):**
- Constructor receives `sessionCtx: SessionContext` (injected)
- First line of any enforce method: `this.sessionCtx.assert(request.sessionId)`
- Emit audit event on assertion

**Revocation:**
- Each gate implements `revokeAllPermissions()` (stub is OK)
- Clears in-memory state (not persisted)

### Definition of Done

- ✅ WIN-ACC-03 PASSES: Session end → authority gone → new session denied
- ✅ No gate creates its own SessionContext
- ✅ Session mismatch → `[SESSION_MISMATCH]` error
- ✅ Audit events on bind/assert/revoke

### Blocks Closed
- WIN-T12 (registry bookmark persistence)
- WIN-T13 (AppData leakage)

### Merge Criteria
- Session binding enforced
- Revocation destroys all in-memory state
- WIN-ACC-03 passes

---

## 📁 PR-004 — TIER 3: FILE ACCESS + IDENTITY (NO PERSISTENCE)

**Status:** After PR-003 merges

### Scope
File identity (volume + object ID), handle lifecycle, ADS rejection. Session-scoped bookmarks only.

### Files (Expected to Touch)
- `src/os/windows/WindowsFileAccessGate.ts` (main implementation)
- `src/os/windows/fileIdentity.ts` (identity type definition)

### Must Implement

**File Identity:**
```typescript
type WindowsFileIdentity = {
  volumeSerialNumber: number;  // Win32 dwVolumeSerialNumber
  fileIndexHigh: number;       // Win32 nFileIndexHigh
  fileIndexLow: number;        // Win32 nFileIndexLow
  filePath: string;
};
```

**WindowsFileAccessGate:**
- `getFileIdentity(filePath)`: Returns identity (stub OK, return zeros for now)
- `isValidPath(filePath)`: Reject ADS (colon beyond position 1)
- `requestSecurityScopedAccess(filePath, sessionId)`: Create memory-only bookmark
  - Capture identity at grant time
  - Store ONLY in Map (no registry, no disk)
  - Include sessionId in bookmark
- `enforceFileRead/Write()`:
  - BEFORE size/mtime check: verify file identity matches
  - ADS path reject early (before bookmark lookup)
  - Session binding check (from PR-003)
- `revokeAllPermissions()`:
  - `bookmarks.clear()`
  - Close any handles
  - Audit event: `OS_PERMISSION_REVOKED`

### Definition of Done

- ✅ WIN-ACC-05 PASSES: Bookmark from Session-1 → revoke → Session-2 denied
- ✅ Identity check precedes size/mtime check
- ✅ ADS paths rejected early
- ✅ Zero persistence (no disk, no registry, no env vars)
- ✅ Bookmarks include sessionId

### Blocks Closed
- WIN-T06 (handle reuse across sessions)
- WIN-T09 (hardlink swap)
- WIN-T10 (NTFS alternate data streams)
- WIN-T12 (registry persistence)
- WIN-T13 (session leakage)

### Merge Criteria
- WIN-ACC-05 passes
- No persistence artifacts
- Identity verification is explicit

---

## 🧨 PR-005 — TIER 4: EXPORT JOBS + FILE STABILITY

**Status:** After PR-004 merges

### Scope
Job lifecycle (create, run, terminate). File stability verification post-termination.

### Files (Expected to Touch)
- `src/os/windows/WindowsExportJobController.ts` (main implementation)
- `src/os/windows/windowsJobHandle.ts` (job handle type)

### Must Implement

**Job Handle:**
```typescript
type WindowsExportJobHandle = {
  jobId: string;
  jobObject: number;  // Win32 HANDLE
  filePath: string;
  startTime: number;
  state: 'RUNNING' | 'CANCELLED' | 'TERMINATED' | 'COMPLETED';
  cancel: () => Promise<void>;
};
```

**WindowsExportJobController:**
- `enforceRenderExport()`:
  - Dialog freeze check (from PR-002)
  - Session binding check (from PR-003)
  - Create job object (stub OK)
  - Return handle with `cancel()` method
  - Audit: `OS_EXPORT_JOB_STARTED`
- `cancelJob(jobId)`:
  - Set state to CANCELLED
  - Call `verifyFileStoppedChanging()`
  - Audit: `OS_EXPORT_JOB_TERMINATED`
- `verifyFileStoppedChanging()`:
  - **CRITICAL:** Identity check FIRST (not last)
  - Then size/mtime stability
  - Return false if identity mismatches
- `revokeAllPermissions()`:
  - Iterate all jobs
  - Call `terminateJobObject()` on each (stub OK)
  - Verify file stopped
  - Audit: `OS_EXPORT_JOBS_REVOKED`

### Definition of Done

- ✅ WIN-ACC-02 PASSES: Job running → session end → job terminated
- ✅ WIN-ACC-06 PASSES: Export verified stable post-termination
- ✅ Identity checked BEFORE size/mtime
- ✅ Jobs don't survive session end

### Blocks Closed
- WIN-T05 (inherited file handle leak)
- WIN-T07 (CreateRemoteThread escape)
- WIN-T08 (DLL injection persistence)
- WIN-T11 (volume move / rename TOCTOU)

### Merge Criteria
- WIN-ACC-02 and WIN-ACC-06 pass
- No job survives `revokeAllPermissions()`
- File identity verification is first

---

## 🔐 PR-006 — TIER 5: ACCESSIBILITY + FIELD CLASSIFICATION

**Status:** After PR-005 merges

### Scope
TEXT_INPUT enforcement with mandatory field classification. Zero ambiguity.

### Files (Expected to Touch)
- `src/os/windows/WindowsAccessibilityGate.ts` (main implementation)
- `src/services/capabilities.ts` (ensure TextInputFieldType includes SENSITIVE)

### Must Implement

**WindowsAccessibilityGate:**
- `enforceUINavigation()`:
  - Line 1: Dialog freeze (from PR-002)
  - Line 2: Session binding (from PR-003)
  - Then: window identity checks (stubs OK)
  - Audit: `OS_PERMISSION_GRANTED` or denial reason
- `enforceTextInput()`:
  - Line 1: Dialog freeze
  - Line 2: Session binding
  - Check fieldType is present (mandatory)
  - If SENSITIVE: throw `[OS_HARD_STOP]`, audit `SENSITIVE_FIELD_BLOCKED`
  - If UNKNOWN: throw `[OS_ACC_REQUIRED]`
  - If SAFE: proceed with window identity + token checks (stubs OK)
  - Audit all paths
- `enforceParameterAdjustment()`:
  - Same pattern as `enforceUINavigation()`

### Definition of Done

- ✅ WIN-ACC-07 PASSES: SENSITIVE field → `[OS_HARD_STOP]`
- ✅ WIN-ACC-08 PASSES: Missing fieldType → `[OS_PERMISSION_DENIED]`
- ✅ fieldType is mandatory (not optional)
- ✅ Dialog freeze is line 1
- ✅ Session binding is line 2

### Blocks Closed
- WIN-T14 (token duplication / elevation)

### Merge Criteria
- WIN-ACC-07 and WIN-ACC-08 pass
- SENSITIVE fields hard-deny immediately
- No partial execution paths

---

## 🧠 PR-007 — TIER 6: WINDOWSENFORCEMENT​ADAPTER (FINAL WIRING)

**Status:** After PR-006 merges

### Scope
Central routing + revocation orchestration. All gates wired together.

### Files (Expected to Touch)
- `src/os/windows/WindowsEnforcementAdapter.ts` (main implementation)

### Must Implement

**WindowsEnforcementAdapter:**
- Constructor:
  - Inject `dialogWatcher` (from factory)
  - Inject `sessionCtx` (or create new)
  - Create instances of all gates (passing shared watcher + context)
- `enforceCapability()`:
  - Route all 6 capabilities:
    - `UI_NAVIGATION` → `accessibilityGate.enforceUINavigation()`
    - `TEXT_INPUT` → `accessibilityGate.enforceTextInput()`
    - `PARAMETER_ADJUSTMENT` → `accessibilityGate.enforceParameterAdjustment()`
    - `FILE_READ` → `fileAccessGate.enforceFileRead()`
    - `FILE_WRITE` → `fileAccessGate.enforceFileWrite()`
    - `RENDER_EXPORT` → `exportJobController.enforceRenderExport()`
  - No fallthrough, exhaustive switch
- `onOSDialogDetected() / onOSDialogCleared()`:
  - Route to `dialogWatcher` (not gates)
- `onSessionEnd()`:
  - Audit: `OS_SESSION_ENDING`
  - `accessibilityGate.revokeAllPermissions()`
  - `fileAccessGate.revokeAllPermissions()`
  - `exportJobController.revokeAllPermissions()`
  - `dialogWatcher.revokeAllPermissions()`
  - `sessionCtx.revoke(sessionId)`
  - Audit: `OS_SESSION_ENDED`

### Definition of Done

- ✅ ALL WIN-ACC-01 → WIN-ACC-09 PASS
- ✅ No tests modified
- ✅ No new instances of SessionContext or DialogWatcher
- ✅ All audit events present
- ✅ Routing exhaustive

### Blocks Closed
All remaining integration surfaces

### Merge Criteria
- All 9 tests pass
- Zero persistence
- Both singletons properly wired

---

## 🏁 PHASE 4 LOCK CONDITIONS

Phase 4 is LOCKABLE when:
- ✅ All 9 WIN-ACC tests pass locally
- ✅ Zero tests loosened
- ✅ Ghost re-attack finds no new vectors
- ✅ Zero persistence artifacts discovered
- ✅ All threat vectors WIN-T01 → WIN-T15 documented as blocked

---

## ENFORCEMENT (GHOST DOCTRINE)

**If a PR violates this sequence:**
- 🚫 BLOCKED immediately
- 🚫 No merge until tier completion
- 🚫 No test loosening permitted
- 🚫 No shortcuts

**If a test fails:**
- ❌ Fix code, never test
- ❌ Revert if unclear how to fix
- ❌ Ask for clarification, don't guess

---

**This sequence is authoritative. No deviation.**
