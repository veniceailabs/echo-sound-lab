# PHASE 4 WINDOWS — GHOST RE-ATTACK CHECKLIST

**Status:** 🧨 ADVERSARIAL PLAYBOOK
**Audience:** Code reviewers, self-attack testers, Ghost
**Purpose:** Proactive vulnerability detection during implementation (before formal Ghost re-attack)

This checklist documents:
1. **What Ghost probes first** (attack ordering)
2. **Per-PR attack sequences** (which attacks apply to which PR)
3. **Win32-specific footguns** (common mistakes)
4. **Self-attack test ideas** (engineers can run these before CI)

---

## OVERVIEW

Ghost's Windows re-attack will follow this ordering (based on Phase 3C + Windows-specific complexity):

**Attack Wave 1 (Days 1-2):** Singleton/State Bypass
- HWND reuse (WIN-T03)
- Session binding break (WIN-T06)
- Dialog state desync (WIN-T02)

**Attack Wave 2 (Days 3-4):** Persistence Leakage
- Registry writes (WIN-T12)
- AppData cache (WIN-T13)
- Static cache reuse (WIN-T06)

**Attack Wave 3 (Days 5-6):** File/Job Escape
- File identity bypass (WIN-T09, WIN-T11)
- Job termination failure (WIN-T07, WIN-T08)
- Handle inheritance (WIN-T05)

**Attack Wave 4 (Days 7):** Field Classification + Token
- SENSITIVE field bypass (WIN-T14)
- Token elevation abuse (WIN-T14)

---

## PR-001 ATTACK SEQUENCE (Tier 0: Foundations)

**What Ghost tests first:** Singleton enforcement

### Attack 1.1: SessionContext Not Singleton
**Technique:**
```
Spawn two EnforcementAdapters.
Each creates its own SessionContext.
Session 1 binds in Adapter A.
Session 2 binds in Adapter B.
Adapter A and B now have different sessions.
```

**Vulnerability:** Silent session isolation break. Gates in Adapter A don't know about Session 2.

**Reviewer Checklist:**
- [ ] Constructor takes SessionContext as parameter (not creates new)
- [ ] No `sessionCtx = new SessionContext()` anywhere outside factory
- [ ] Same instance passed to ALL gates

**Self-Attack Test:**
```typescript
const ctx = new SessionContext();
const adapter1 = new WindowsEnforcementAdapter(ctx);
const adapter2 = new WindowsEnforcementAdapter(ctx);

ctx.bind('session-1');
adapter1.onSessionEnd();
expect(ctx.get()).toBe(null);  // Should be null

// If adapters created their own context, this would pass locally but fail when session bindings don't align
```

---

### Attack 1.2: DialogWatcher Not Singleton
**Technique:**
```
Create two WindowsDialogWatcher instances directly (bypass factory).
Dialog detected in Watcher-A.
Watcher-B has no knowledge.
Enforcement calls Watcher-B.throwIfModalVisible() → passes (shouldn't).
```

**Vulnerability:** Dialog state desync. One gate sees modal, other doesn't.

**Reviewer Checklist:**
- [ ] No `new WindowsDialogWatcher()` outside factory
- [ ] All gates call `getSharedWindowsDialogWatcher()`
- [ ] Factory returns same instance (not new each time)

**Self-Attack Test:**
```typescript
const watcher1 = new WindowsDialogWatcher();  // ← This should fail in code review
const watcher2 = getSharedWindowsDialogWatcher();
const watcher3 = getSharedWindowsDialogWatcher();

expect(watcher2 === watcher3).toBe(true);  // Should be same instance
```

---

### Attack 1.3: Static Cache Leakage
**Technique:**
```
Static variable at module level:
  static cachedSession = new SessionContext();

Code loads module → static init runs → SessionContext created without control.
Next adapter tries to inject → conflict.
```

**Vulnerability:** Hidden instance creation bypasses DI.

**Reviewer Checklist:**
- [ ] No `static sessionCtx` or `static watcher` variables
- [ ] No module-level singletons except factory function
- [ ] All state is instance state (not class state)

**Self-Attack Test:**
Grep for `static.*SessionContext` or `static.*DialogWatcher` — should find zero matches (except in factory).

---

## PR-002 ATTACK SEQUENCE (Tier 1: Dialog Freeze)

**What Ghost tests:** Dialog freeze timing and state reset

### Attack 2.1: throwIfModalVisible Not First Line
**Technique:**
```
enforceTextInput() called with fieldType = 'SENSITIVE'
Method checks fieldType FIRST
Throws before calling throwIfModalVisible()
Dialog is visible but check never happens
```

**Vulnerability:** Field classification takes priority over dialog freeze. TOCTOU window.

**Reviewer Checklist:**
- [ ] throwIfModalVisible() is literal first executable line
- [ ] Before any variable declarations
- [ ] Before any permission checks
- [ ] Grep for `enforceUINavigation`, `enforceTextInput`, `enforceParameterAdjustment` — all should have throwIfModalVisible() first

**Self-Attack Test:**
```typescript
adapter.onOSDialogDetected('permission');
try {
  await adapter.enforceCapability(
    { capability: Capability.TEXT_INPUT },
    { sessionId, fieldType: 'SENSITIVE' }  // Even if SENSITIVE, should freeze first
  );
  throw new Error('Should have thrown');
} catch (e) {
  expect(e.message).toContain('[OS_HARD_STOP]');  // Not field classification error
}
```

---

### Attack 2.2: isModalVisible Flag Not Reset
**Technique:**
```
Dialog detected: isModalVisible = true
Dialog cleared: dialogs.delete(hwnd)
But developer forgets to check if Map is empty
isModalVisible stays true
Next enforcement frozen incorrectly
```

**Vulnerability:** Stale freeze state. Valid operation blocked.

**Reviewer Checklist:**
- [ ] onDialogCleared():
  - Removes dialog from Map
  - Then checks: `if (dialogs.size === 0)`
  - Sets `isModalVisible = false`
- [ ] Not: `if (dialogId matches)` then `isModalVisible = false` (wrong — may be other dialogs)

**Self-Attack Test:**
```typescript
adapter.onOSDialogDetected('perm1', { hwnd: 0x1000 });
adapter.onOSDialogDetected('perm2', { hwnd: 0x2000 });
adapter.onOSDialogCleared(0x1000);  // Clear first dialog

// Should NOT be frozen (second dialog still visible)
try {
  adapter.throwIfModalVisible();  // This should still throw
} catch (e) {
  expect(e.message).toContain('[OS_HARD_STOP]');
}

adapter.onOSDialogCleared(0x2000);  // Clear second dialog

// NOW should not be frozen
try {
  adapter.throwIfModalVisible();  // This should NOT throw
} catch (e) {
  throw new Error('Should not have frozen');
}
```

---

### Attack 2.3: Audit Events Missing
**Technique:**
```
Dialog detected.
throwIfModalVisible() throws.
But no audit event emitted before throw.
Reviewer can't see decision in logs.
Silent failure path.
```

**Vulnerability:** Unaudited decision. No proof of enforcement.

**Reviewer Checklist:**
- [ ] OS_DIALOG_DETECTED emitted on detect
- [ ] OS_DIALOG_CLEARED emitted on clear
- [ ] OS_HARD_STOP_TRIGGERED emitted before throw

**Self-Attack Test:**
```typescript
const auditEvents = [];
audit.on('emit', (event) => auditEvents.push(event));

adapter.onOSDialogDetected('perm');
try {
  adapter.throwIfModalVisible();
} catch (e) {}

expect(auditEvents).toContainEqual(
  expect.objectContaining({ type: 'OS_DIALOG_DETECTED' })
);
expect(auditEvents).toContainEqual(
  expect.objectContaining({ type: 'OS_HARD_STOP_TRIGGERED' })
);
```

---

## PR-003 ATTACK SEQUENCE (Tier 2: Session Binding)

**What Ghost tests:** Session binding breaks + persistence

### Attack 3.1: Session Binding Check Not Enforced
**Technique:**
```
sessionCtx.get() returns 'session-1'
enforceFileRead called with sessionId = 'session-2'
Code doesn't call assert() (or assert is stubbed)
File access succeeds despite mismatch
```

**Vulnerability:** Session boundary broken. Cross-session access.

**Reviewer Checklist:**
- [ ] assert() called AFTER dialog freeze, BEFORE any other logic
- [ ] assert() throws if mismatch (not returns false)
- [ ] Error includes sessionId for audit

**Self-Attack Test:**
```typescript
ctx.bind('session-1');
try {
  gate.enforceFileRead({
    capability: Capability.FILE_READ,
    filePath: 'C:\\file.txt',
    sessionId: 'session-2'  // ← Mismatch
  });
  throw new Error('Should have failed');
} catch (e) {
  expect(e.message).toContain('SESSION_MISMATCH');
}
```

---

### Attack 3.2: Revocation Incomplete
**Technique:**
```
Session 1 creates 5 bookmarks.
onSessionEnd() revokes session.
But only clears sessionId, not bookmarks Map.
Session 2 starts, finds old bookmarks.
File access succeeds without re-prompt.
```

**Vulnerability:** Silent persistence. No revocation.

**Reviewer Checklist:**
- [ ] revokeAllPermissions() calls:
  - bookmarks.clear()
  - jobs.clear()
  - fileWatchers.clear()
- [ ] Not just: sessionCtx.revoke()

**Self-Attack Test:**
```typescript
gate.requestSecurityScopedAccess('C:\\file.txt', 'session-1');
expect(gate.bookmarks.size).toBe(1);

gate.revokeAllPermissions();
expect(gate.bookmarks.size).toBe(0);  // Must be empty
```

---

## PR-004 ATTACK SEQUENCE (Tier 3: File Access)

**What Ghost tests:** File identity verification + ADS sneaks

### Attack 4.1: Identity Check After Size/mtime
**Technique:**
```
File identity check:
  ✓ volumeSerial matches
  ✓ fileId matches
  ✓ size matches
  ✓ mtime matches
Attacker swaps hardlink BETWEEN mtime and identity check.
Identity is checked last → swap succeeds.
```

**Vulnerability:** TOCTOU window. Identity verified too late.

**Reviewer Checklist:**
- [ ] verifyFileStoppedChanging():
  - Identity check is FIRST
  - Size/mtime check is AFTER
  - Not vice versa
- [ ] Code order matters (not just presence)

**Self-Attack Test:**
```typescript
const metadata1 = { volumeSerial: 1, fileId: 100, size: 1000 };
const metadata2 = { volumeSerial: 1, fileId: 100, size: 1000 };  // Same but different file
const metadata3 = { volumeSerial: 2, fileId: 100, size: 1000 };  // Swapped

// Controller should reject if identity changes
const result = controller.verifyFileStoppedChanging([metadata1, metadata3]);
expect(result).toBe(false);  // Identity mismatch
```

---

### Attack 4.2: ADS Paths Not Rejected
**Technique:**
```
enforceFileWrite called with filePath = 'C:\\export.wav:evil.exe'
ADS check not in place (or checks wrong thing)
File written to alternate stream
Executor plays audio, evil runs hidden
```

**Vulnerability:** Hidden alternate stream execution.

**Reviewer Checklist:**
- [ ] isValidPath() rejects colon beyond position 1
- [ ] Check happens BEFORE bookmark lookup
- [ ] Error message mentions ADS

**Self-Attack Test:**
```typescript
try {
  gate.enforceFileWrite({
    capability: Capability.FILE_WRITE,
    filePath: 'C:\\file.txt:hidden',  // ADS
    sessionId
  });
  throw new Error('Should reject ADS');
} catch (e) {
  expect(e.message).toContain('ADS');
}

// Valid drive should pass
expect(() => gate.isValidPath('C:\\file.txt')).not.toThrow();
```

---

## PR-005 ATTACK SEQUENCE (Tier 4: Export Jobs)

**What Ghost tests:** Job termination + handle inheritance

### Attack 5.1: Job Not Terminated on Session End
**Technique:**
```
Job created in session.
Session ends.
onSessionEnd() called.
But TerminateJobObject not called (stub returns without doing).
Job still running, export continues.
```

**Vulnerability:** Background execution post-revocation.

**Reviewer Checklist:**
- [ ] revokeAllPermissions():
  - Iterates all jobs
  - Calls terminateJobObject() on each
  - Sets state to TERMINATED
- [ ] Not stub (must actually call Win32)

**Self-Attack Test:**
```typescript
const job = await controller.enforceRenderExport({...});
expect(job.state).toBe('RUNNING');

controller.revokeAllPermissions();
expect(job.state).toBe('TERMINATED');
```

---

### Attack 5.2: Handle Inheritance Not Disabled
**Technique:**
```
File handle created for export.
Child process spawned (not in job).
Handle inherited by child.
Session ends, job killed.
Child process still has handle, continues writing.
```

**Vulnerability:** Handle survives termination.

**Reviewer Checklist:**
- [ ] Handles must be marked non-inheritable
- [ ] Win32 SetHandleInformation(..., HANDLE_FLAG_INHERIT, 0)
- [ ] Code comment: "Non-inheritable to prevent child escape"

---

## PR-006 ATTACK SEQUENCE (Tier 5: Accessibility)

**What Ghost tests:** Field classification hard-deny + elevation abuse

### Attack 6.1: fieldType Optional (Not Mandatory)
**Technique:**
```
enforceTextInput called WITHOUT fieldType in context
Code doesn't check presence (fieldType is optional)
Defaults to SAFE (implicit)
Sensitive field accessed
```

**Vulnerability:** Silent default. No explicit classification.

**Reviewer Checklist:**
- [ ] fieldType is NOT optional in interface
- [ ] Missing fieldType → throw [OS_PERMISSION_DENIED]
- [ ] Error before any permission checks

**Self-Attack Test:**
```typescript
try {
  gate.enforceTextInput({
    capability: Capability.TEXT_INPUT,
    fieldId: 'password',
    // fieldType is missing
    windowHandle: 0x1000,
    processId: 1000,
    sessionId
  });
  throw new Error('Should fail');
} catch (e) {
  expect(e.message).toContain('fieldType');
}
```

---

### Attack 6.2: SENSITIVE Not Hard-Deny
**Technique:**
```
fieldType = 'SENSITIVE'
Check happens but throws permission error (not hard stop)
Caller has try-catch, retries with ACC
Eventually succeeds
```

**Vulnerability:** SENSITIVE fields are defeatable (should be hard stop).

**Reviewer Checklist:**
- [ ] SENSITIVE → throw [OS_HARD_STOP]
- [ ] Not [OS_PERMISSION_DENIED]
- [ ] Immediate (no retry possible)
- [ ] Audit: SENSITIVE_FIELD_BLOCKED

**Self-Attack Test:**
```typescript
try {
  gate.enforceTextInput({
    fieldType: 'SENSITIVE',
    ...
  });
} catch (e) {
  expect(e.message).toContain('[OS_HARD_STOP]');  // Not [OS_PERMISSION_DENIED]
}
```

---

## PR-007 ATTACK SEQUENCE (Tier 6: Adapter Routing)

**What Ghost tests:** Routing completeness + revocation order

### Attack 7.1: Capability Not Routed
**Technique:**
```
enforceCapability(RENDER_EXPORT, context)
Switch statement misses RENDER_EXPORT case
Falls through to default
Throws "unknown capability"
Doesn't call exportJobController
Job created but not tracked
```

**Vulnerability:** Silent miss. Uncontrolled export.

**Reviewer Checklist:**
- [ ] All 6 capabilities in switch:
  - UI_NAVIGATION
  - TEXT_INPUT
  - PARAMETER_ADJUSTMENT
  - FILE_READ
  - FILE_WRITE
  - RENDER_EXPORT
- [ ] No default case (or default throws)

**Self-Attack Test:**
```typescript
const allCapabilities = [
  Capability.UI_NAVIGATION,
  Capability.TEXT_INPUT,
  Capability.PARAMETER_ADJUSTMENT,
  Capability.FILE_READ,
  Capability.FILE_WRITE,
  Capability.RENDER_EXPORT
];

for (const cap of allCapabilities) {
  expect(() => adapter.enforceCapability({ capability: cap }, context))
    .not.toThrow('Unknown capability');
}
```

---

### Attack 7.2: Revocation Order Wrong
**Technique:**
```
onSessionEnd() called.
sessionCtx.revoke() called FIRST.
Then gate.revokeAllPermissions().
But gates check sessionCtx.get() in revoke logic.
It's null, so revoke succeeds silently.
But audit is missing.
```

**Vulnerability:** Revocation hidden from audit.

**Reviewer Checklist:**
- [ ] onSessionEnd():
  - Emit OS_SESSION_ENDING first
  - Call all gate.revokeAllPermissions()
  - THEN sessionCtx.revoke()
  - Emit OS_SESSION_ENDED last
- [ ] Order matters

---

## SELF-ATTACK TIMING

Engineers can run these checks during development:

**During PR-001 coding:** Singleton tests
**During PR-002 coding:** Dialog freeze tests
**During PR-003 coding:** Session binding tests
**During PR-004 coding:** File identity tests
**During PR-005 coding:** Job termination tests
**During PR-006 coding:** Field classification tests
**During PR-007 coding:** Routing completeness tests

Run before pushing to CI.

---

## GHOST FORMAL RE-ATTACK (Expected)

After all 9 tests pass locally, Ghost will:

1. **Re-attack all 15 WIN-T vectors** (exact same list as threat map)
2. **Probe each PR's specific attack surface** (per checklist above)
3. **Test combinations** (what if Ghost chains WIN-T03 + WIN-T06?)
4. **Verify audit completeness** (can we reconstruct decision path from logs?)

If this checklist is followed during implementation, Ghost's re-attack will be boring (the goal).

---

**This checklist is your insurance policy against "but we thought we fixed that."**

Use it liberally. Share it with reviewers. Reference it in PR comments.

If a PR fails this checklist, it fails before Ghost ever sees it.
