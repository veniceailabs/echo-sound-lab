# PHASE 4 — WINDOWS ACCEPTANCE TEST FAILURE MODES

Status: 🔍 DEFENSIVE FORESIGHT (Pre-Ghost Hardening)
Purpose: Document expected failure behavior in WIN-ACC-01 → WIN-ACC-09
Methodology: What breaks first? What breaks loudly vs. silently? What degrades gracefully?

This document informs:
- Code review focus areas (weak seams)
- Expected test failures during implementation
- How failures should degrade (hard stop vs. silent bypass)
- Pre-Ghost hardening points

---

## OVERVIEW

Each test has expected failure modes:
- **Loud Failure** = Test throws expected error, audit logs, hard stop → GOOD (defensive)
- **Silent Failure** = Test passes but audit empty or missing → BAD (bypass risk)
- **Graceful Degradation** = Test fails for right reason, audit complete → GOOD
- **Catastrophic Failure** = Test passes when it shouldn't → RED FLAG

Ghost will attack the silent/catastrophic paths first.

---

## WIN-ACC-01: DIALOG FREEZE

### Expected Loud Failures (Desired)
- Dialog detected → enforcement throws [OS_HARD_STOP] ✓
- Audit emits OS_DIALOG_DETECTED event ✓
- Dialog clear event logged ✓

### Risk: Silent Failures (Must Hardened Before Ghost)
- Dialog detected but enforcement doesn't check throwIfModalVisible() → **SILENT BYPASS**
  - Test passes (no exception thrown)
  - Audit shows dialog detected but no HARD_STOP event
  - **Fix**: Enforce throwIfModalVisible() as first line of every enforce method

- Dialog clear happens but stale freeze remains → **SILENT DESYNC**
  - Test clears dialog
  - Subsequent enforcement still throws [OS_HARD_STOP]
  - **Fix**: Verify isModalVisible flag resets when dialog count reaches zero

- Fake OS dialog not detected → **DETECTION GAP**
  - User app draws permission-like dialog
  - WindowsDialogWatcher doesn't detect it (only looks for system-owned dialogs)
  - Enforcement proceeds
  - **Expected**: This is actually correct behavior (only OS dialogs freeze). But test must verify system-owned detection works.

### What To Audit (Code Review Focus)
```
checkpoints:
  1. WindowsDialogWatcher.throwIfModalVisible() called at entry
  2. EnumWindows() filter for WS_DISABLED + system process
  3. isModalVisible boolean resets when dialogs.size === 0
  4. No cached dialog state in gates (single source = watcher only)
  5. OS_DIALOG_CLEARED event emission before resume
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS (all events logged) | Dialog freeze working | Proceed to next test |
| FAIL (OS_HARD_STOP not thrown) | throwIfModalVisible missing/broken | Fix: add guard clause |
| PASS but audit empty | Dialog detected but not logged | Fix: audit.emit in watcher |
| FAIL on dialog clear resume | Stale freeze state | Fix: reset isModalVisible |

---

## WIN-ACC-02: JOB TERMINATION

### Expected Loud Failures (Desired)
- Job created → state = RUNNING ✓
- Session end → TerminateJobObject called ✓
- Audit emits OS_EXPORT_JOB_TERMINATED ✓
- Job state changes to TERMINATED ✓

### Risk: Silent Failures
- Job created but TerminateJobObject never called → **CHILD PROCESS LEAK**
  - Test passes (no exception)
  - Job state remains RUNNING
  - Audit silent (no termination event)
  - **Fix**: Implement revokeAllPermissions() to iterate jobs + TerminateJobObject

- Handle inherited despite non-inheritable flag → **INHERITANCE LEAK**
  - Parent session ends
  - Child process inherits handle
  - Child continues writing
  - Test sees job TERMINATED but file still growing
  - **Fix**: SetHandleInformation(..., HANDLE_FLAG_INHERIT, 0)

- JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE not set → **JOB ESCAPE**
  - Job terminates but process threads survive via RemoteThread
  - Test passes but Ghost can exec in orphaned thread
  - **Fix**: SetInformationJobObject(..., JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)

### What To Audit (Code Review Focus)
```
checkpoints:
  1. CreateJobObject() returns non-null HANDLE
  2. SetInformationJobObject(..., KILL_ON_JOB_CLOSE) enforced
  3. AssignProcessToJobObject() before spawning children
  4. TerminateJobObject() called in revokeAllPermissions()
  5. File verification loop stops (not infinite)
  6. Handles marked non-inheritable (SetHandleInformation)
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + audit shows TERMINATED | Job killed cleanly | Proceed |
| FAIL (state still RUNNING) | revokeAllPermissions not called | Fix: wire session end hook |
| PASS + file still growing | KILL_ON_JOB_CLOSE not set | Fix: SetInformationJobObject |
| FAIL (OS_EXPORT_JOB_TERMINATED missing) | Audit logging missing | Fix: audit.emit in cancelJob |

---

## WIN-ACC-03: NO PERSISTENCE

### Expected Loud Failures (Desired)
- Session 1: Grants exist ✓
- Session 1 end: All grants revoked ✓
- Session 2: New access denied (no carryover) ✓
- Audit shows revocation event ✓

### Risk: Silent Failures
- Bookmarks stored in registry → **PERSISTENCE**
  - Test pass (authority.getActiveGrants shows zero)
  - But registry key still exists
  - Session 2 silently reloads from registry
  - **Fix**: Never write to registry; memory-only storage

- AppData folder checked on startup → **SILENT RELOAD**
  - Session 2 boots
  - Reads cached token from %APPDATA%
  - Resumes without user mediation
  - **Fix**: No persisted artifacts; enforce at startup

- Static cache in WindowsFileAccessGate → **GLOBAL REUSE**
  - Bookmark stored in static Map across sessions
  - Session 2 finds old bookmark
  - Access succeeds without re-prompt
  - **Fix**: Bookmarks cleared on revokeAllPermissions(); session binding checked

### What To Audit (Code Review Focus)
```
checkpoints:
  1. No registry writes in WindowsFileAccessGate
  2. No file I/O to AppData / temp for authority
  3. bookmarks.clear() called in revokeAllPermissions()
  4. SessionContext.revoke() called on session end
  5. verifyBookmarkStillValid() checks sessionId match
  6. Expired bookmarks rejected (expiresAt checked)
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + next session denied | Persistence blocked | Proceed |
| PASS but file exists | Registry/disk written | Fix: remove I/O |
| FAIL (session 2 succeeds) | Bookmark reused | Fix: session ID check |
| PASS but audit missing revocation | Logging gap | Fix: audit.emit in revoke |

---

## WIN-ACC-04: HWND REUSE

### Expected Loud Failures (Desired)
- Window 1 bound (hwnd 0x1000, timestamp T1) ✓
- Window 1 closes, OS reuses handle for Window 2 (hwnd 0x1000, timestamp T2) ✓
- Enforcement on Window 2 → [OS_HARD_STOP] (timestamp mismatch) ✓

### Risk: Silent Failures
- Timestamp not captured at bind time → **REUSE ACCEPTED**
  - Window 1 enforcement works
  - HWND recycled, Window 2 gets same handle
  - Enforcement succeeds on Window 2 (no timestamp to compare)
  - **Fix**: Capture creationTime in WindowsWindowIdentity

- Creation time not validated on re-enforce → **STALE BINDING**
  - Window 1: capture hwnd 0x1000, pid 2000, T=1000
  - Window 1 close: gate doesn't clear currentWindowIdentity
  - Window 2: same hwnd, pid, but T=2000
  - Comparison: hwnd ✓ pid ✓ time ✗ → should fail
  - But if time check missing → SILENT REUSE
  - **Fix**: isWindowIdentityValid() compares all three

- PID not included in binding → **CROSS-PROCESS EXEC**
  - Process A opens window, gets enforced
  - Process B injects into Process A's HWND
  - Enforcement sees same HWND, allows exec
  - **Fix**: Bind hwnd + processId + createdAt (all three required)

### What To Audit (Code Review Focus)
```
checkpoints:
  1. captureWindowIdentity() captures hwnd + pid + createdAt
  2. isWindowIdentityValid() checks all three
  3. Creation time expires after reasonable TTL (no infinite reuse)
  4. Process path hash optional but recommended (WIN-T04 hardening)
  5. Window change triggers hard stop
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + hard stop on reuse | HWND binding working | Proceed |
| FAIL (reuse allowed) | createdAt not checked | Fix: add timestamp validation |
| PASS but audit lacks identity | Logging incomplete | Fix: log captured identity |

---

## WIN-ACC-05: HANDLE REUSE

### Expected Loud Failures (Desired)
- Session 1: Bookmark created (session ID binding) ✓
- Session 1 end: bookmarks.clear() ✓
- Session 2: Access denied (no bookmark) ✓
- Audit shows OS_PERMISSION_DENIED ✓

### Risk: Silent Failures
- Bookmark not session-bound → **GLOBAL REUSE**
  - Bookmark stored with sessionId = null
  - Session 2 finds same bookmark
  - Access succeeds without re-prompt
  - **Fix**: sessionId mandatory in bookmark; verify at enforce time

- verifyBookmarkStillValid() not checking session → **SESSION MISMATCH ACCEPTED**
  - Bookmark.sessionId = 'session-1'
  - Current session = 'session-2'
  - Function only checks expiration, not session
  - Silently proceeds
  - **Fix**: Add sessionCtx.get() === bookmark.sessionId check

- bookmarks.clear() not called on revoke → **STALE BOOKMARKS PERSIST**
  - Session 1 ends
  - revokeAllPermissions() not called
  - Session 2 finds old bookmark
  - Silently reuses
  - **Fix**: Ensure revokeAllPermissions() calls bookmarks.clear()

### What To Audit (Code Review Focus)
```
checkpoints:
  1. SecurityScopedBookmark.sessionId is always set (not optional)
  2. verifyBookmarkStillValid() checks sessionCtx.get() === bookmark.sessionId
  3. bookmarks.clear() called in revokeAllPermissions()
  4. Session binding checked BEFORE identity check
  5. No cache bypass (all paths check bookmarks)
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + next session denied | Session binding working | Proceed |
| FAIL (session 2 succeeds) | Session ID not checked | Fix: add session binding check |
| PASS but bookmarks not cleared | Audit logging OK but storage stale | Fix: call clear() on revoke |

---

## WIN-ACC-06: FILE STABILITY & IDENTITY

### Expected Loud Failures (Desired)
- Export starts, watcher polls file size + object ID ✓
- Export terminates → TerminateJobObject ✓
- File stopped changing (size stable, object ID unchanged) ✓
- Audit logs OS_EXPORT_JOB_TERMINATED with fileVerified ✓

### Risk: Silent Failures
- File identity not captured at grant time → **SWAP UNDETECTED**
  - Grant: capture volume=1, objId=100
  - File moved to different volume: volume=2, objId=100 (same object, different volume)
  - Verification doesn't check volume → PASSES
  - **Fix**: Capture AND verify volumeSerialNumber + fileIndexHigh/Low

- Object ID not re-verified at termination → **HARDLINK SWAP**
  - Grant: file A (inode 100)
  - Attacker creates hardlink B (same inode)
  - Export swaps hardlink mid-flight
  - Watcher only checks size/mtime, not object ID
  - **Fix**: verifyFileStoppedChanging() checks identity first

- File watcher not running → **NO CHANGE DETECTION**
  - Export started but watcher interval never starts
  - File continues growing indefinitely
  - Termination verification passes (no state to compare)
  - **Fix**: startFileChangeWatcher() must set interval

- Size/mtime check only, no identity check → **IDENTITY SWAP**
  - File A (size 1MB) → File B (size 1MB, different inode)
  - Size matches but file is wrong
  - **Fix**: Check identity before size

### What To Audit (Code Review Focus)
```
checkpoints:
  1. getFileMetadata() captures volumeSerialNumber + fileIndexHigh + fileIndexLow
  2. startFileChangeWatcher() sets interval (not skipped)
  3. verifyFileStoppedChanging() checks identity FIRST
  4. Identity mismatch → hard stop (not silent)
  5. Size/mtime stability checked AFTER identity
  6. Audit logs fileVerified flag
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + fileVerified=true | Export termination working | Proceed |
| FAIL (fileVerified=false) | File changed after termination | Fix: file watcher not running |
| PASS but identity not checked | Size stable but file swapped | Fix: add identity verification |
| FAIL (OS_HARD_STOP on identity change) | Swap detected → correct | Proceed |

---

## WIN-ACC-07: SECURE FIELD DENIAL

### Expected Loud Failures (Desired)
- fieldType = 'SENSITIVE' ✓
- Enforcement throws [OS_HARD_STOP] ✓
- Audit emits SENSITIVE_FIELD_BLOCKED ✓
- No execution proceeds ✓

### Risk: Silent Failures
- fieldType not checked before processing → **CREDENTIAL ENTRY**
  - Request.fieldType = 'SENSITIVE'
  - enforceTextInput checks permission first
  - Only then checks fieldType
  - If permission denied, error masks sensitive field exposure
  - **Fix**: Check fieldType as FIRST check after dialog freeze

- SENSITIVE classification too narrow → **CLASSIFICATION GAP**
  - Only password fields marked SENSITIVE
  - PIN entry, SSN entry, API key fields not classified
  - All proceed as SAFE
  - **Fix**: Expand classification (consult field introspection strategy)

- No audit on sensitive blocking → **SILENT BLOCKING**
  - fieldType = 'SENSITIVE'
  - Hard stop thrown
  - But audit.emit missing
  - **Fix**: Log SENSITIVE_FIELD_BLOCKED before throwing

### What To Audit (Code Review Focus)
```
checkpoints:
  1. fieldType check happens AFTER dialog freeze, BEFORE permission check
  2. fieldType === 'SENSITIVE' → throw immediately (no other checks)
  3. SENSITIVE_FIELD_BLOCKED audit event emitted
  4. Classification strategy documented (password, pin, credential stores, etc.)
  5. No fallback to SAFE for unclassified sensitive fields
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + [OS_HARD_STOP] thrown | Secure field blocking | Proceed |
| FAIL (enforcement succeeds) | fieldType check missing | Fix: add early fieldType validation |
| PASS but audit silent | Blocking works but not audited | Fix: add audit.emit |

---

## WIN-ACC-08: MISSING FIELDTYPE

### Expected Loud Failures (Desired)
- fieldType is undefined ✓
- Enforcement throws [OS_PERMISSION_DENIED] ✓
- Audit emits reason = 'Missing fieldType' ✓

### Risk: Silent Failures
- No fieldType check → **IMPLICIT DEFAULT**
  - fieldType undefined
  - Code defaults to 'SAFE'
  - Sensitive field accessed silently
  - **Fix**: fieldType mandatory; no defaults

- fieldType optional in interface → **TYPE SYSTEM BYPASS**
  - Interface shows fieldType?: TextInputFieldType
  - Caller doesn't set it
  - Enforcement doesn't validate
  - **Fix**: Make fieldType required (not optional)

- Permissive error message → **OBSCURED FAILURE**
  - Audit: reason = 'Missing context'
  - Doesn't specify fieldType
  - Harder to detect in logs
  - **Fix**: Explicit audit message: 'Missing fieldType classification'

### What To Audit (Code Review Focus)
```
checkpoints:
  1. WindowsAccessibilityRequest.fieldType is NOT optional
  2. Adapter validates fieldType present before routing
  3. Missing fieldType → throw [OS_PERMISSION_DENIED]
  4. Audit reason explicitly states 'Missing fieldType'
  5. No implicit defaults (no SAFE fallback)
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + [OS_PERMISSION_DENIED] | Missing fieldType blocked | Proceed |
| FAIL (enforcement succeeds) | No fieldType validation | Fix: add mandatory check |
| PASS but audit vague | Blocked but reason unclear | Fix: improve audit message |

---

## WIN-ACC-09: DIALOG DESYNC

### Expected Loud Failures (Desired)
- Dialog detected → enforcement frozen ✓
- Dialog cleared → no subsequent freeze ✓
- Both events in audit trail ✓
- isModalVisible boolean resets correctly ✓

### Risk: Silent Failures
- isModalVisible not reset on clear → **STALE FREEZE**
  - Dialog detected: isModalVisible = true
  - Dialog cleared: event logged
  - But isModalVisible remains true
  - Subsequent enforcement throws [OS_HARD_STOP] (wrong reason)
  - **Fix**: Set isModalVisible = false when dialogs.size === 0

- Gate caches dialog state separately → **DUAL-STATE DESYNC**
  - OSDialogWatcher.isModalVisible = false
  - WindowsAccessibilityGate.osDialogDetected = true
  - Enforcement calls different state source
  - Stale state blocks valid enforcement
  - **Fix**: Single source of truth (gates call watcher only)

- Partial clear (some dialogs remain) → **FALSE POSITIVE RESUME**
  - Dialog A detected: count=1, isModalVisible=true
  - Dialog A cleared: count=0, isModalVisible=false
  - But Dialog B still present (count should be 1)
  - Enforcement resumes wrongly
  - **Fix**: Track dialog HWND → Map, not count

- Dialog clear event logged but state not updated → **AUDIT-STATE MISMATCH**
  - Audit shows OS_DIALOG_CLEARED
  - But isModalVisible never changes
  - Next enforcement still frozen
  - **Fix**: Update state in onDialogCleared() before emitting

### What To Audit (Code Review Focus)
```
checkpoints:
  1. OnDialogDetected() adds to Map<hwnd, dialog>
  2. OnDialogCleared() removes from Map by hwnd
  3. isModalVisible = (dialogs.size > 0)
  4. No gate-level dialog caching (all call watcher.throwIfModalVisible())
  5. Both DETECTED and CLEARED events logged
  6. State update happens BEFORE event emission (not after)
```

### Test Failure Interpretation
| Test Result | Meaning | Next Action |
|---|---|---|
| PASS + freeze then resume | Dialog desync fixed | Proceed |
| FAIL (stale freeze after clear) | isModalVisible not reset | Fix: set to false on clear |
| FAIL (desync between gates) | Dual dialog state exists | Fix: remove gate caching |
| PASS but audit shows clear but freeze continues | State-audit mismatch | Fix: update state before emit |

---

## SUMMARY: FAILURE MODE PRIORITIZATION

For code review, focus on these in order (highest bypass risk first):

1. **WIN-ACC-03** (no persistence) — Silent reload
2. **WIN-ACC-05** (handle reuse) — Session binding missing
3. **WIN-ACC-01** (dialog freeze) — throwIfModalVisible not called
4. **WIN-ACC-09** (dialog desync) — stale boolean state
5. **WIN-ACC-02** (job termination) — TerminateJobObject not called
6. **WIN-ACC-04** (HWND reuse) — Timestamp not captured
7. **WIN-ACC-06** (file stability) — Identity not verified
8. **WIN-ACC-07** (secure field) — SENSITIVE check too late
9. **WIN-ACC-08** (missing fieldType) — Optional instead of required

---

## USAGE (Code Review + Implementation)

When implementing:
1. Read this doc first (understand failure modes)
2. Implement method per spec
3. Run tests
4. If test fails, consult corresponding section above
5. Fix + re-run
6. If test passes but audit empty → consult "silent failure" section

When reviewing:
1. Run tests locally
2. Check audit logs for expected events
3. Use "What To Audit" checkpoints
4. Verify stubs don't have "silent" gaps

---

**Next: Windows implementation stubs drop with Ghost checklist annotations.**
