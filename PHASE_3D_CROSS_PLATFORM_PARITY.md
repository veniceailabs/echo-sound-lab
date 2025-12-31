# PHASE 3D — CROSS-PLATFORM PARITY CHECKLIST

Status: 🗂️ SPEC DRAFT (Not implemented yet)
Objective: Define mechanical parity contract so Windows and Linux enforce INV-01 → INV-09 identically to Phase 3C macOS
Scope: Enforcement specifications only (no code, no tests yet)

---

## 1) PARITY DEFINITION

A platform is Phase 3C-equivalent when:
- All INV-01 → INV-09 are mechanically enforceable
- All ACC-tests (01-09) have an equivalent denial proof
- No invariant is weakened (equal or stricter than macOS)
- Audit trails track all critical transitions

**Weakening a platform below macOS baseline is a blocker.**

---

## 2) PLATFORM PARITY MATRIX

### Invariant Mapping: macOS (Locked) → Windows (Planned) → Linux (Planned)

| Invariant | macOS (LOCKED) | Windows (Draft) | Linux (Draft) |
|-----------|---|---|---|
| **INV-01: Gate Not Authority** | Adapter + gates enforce only | Adapter + gates enforce only | Adapter + gates enforce only |
| **INV-02: Denial = Immediate Halt** | Thrown error halts | Thrown error halts | Thrown error halts |
| **INV-03: Revocation Is Immediate + Total** | SessionContext.revokeAll() clears all gates | Session end → invalidate all tokens/handles | Session end → invalidate inode bindings + close FDs |
| **INV-04: No Persistent File Grants** | Security-scoped bookmarks (memory-only) | File handles (session-scoped, not registry) | inode + fd binding (session-scoped, not persisted) |
| **INV-05: OS Dialog Freeze (Hard Stop)** | OSDialogWatcher (single source) | Win32 Modal Detector (EnumWindows + WS_DISABLED) | X11/Wayland Modal Gate (WM_STATE or seat focus) |
| **INV-06: Window Identity Binding** | bundleId + processId + windowNumber | HWND + ProcessId + ThreadId | X11 XID + Display (or Wayland surface + seat) |
| **INV-07: Secure Field Denial** | TEXT_INPUT enum (SAFE/UNKNOWN/SENSITIVE) | Edit control classification (NORMAL/PASSWORD/SENSITIVE) | GTK/Qt entry introspection (property hint) |
| **INV-08: Killable Export Jobs** | Job handle + cancel() + fs polling | Job object (CreateJobObject) + TerminateJobObject | process group + kill(pgid, SIGTERM) |
| **INV-09: Export Output Continuation Detection** | inode + device + size/mtime check | File object ID (NTFS) + size/mtime | inode + device + size/mtime check |

---

## 3) WINDOWS ENFORCEMENT CHECKLIST (Draft)

### 3.1) Dialog Freeze Enforcement (INV-05)

**Goal:** Single authoritative modal dialog detector; all gates call throwIfModalVisible()

**Implementation Strategy:**
```
WindowsDialogWatcher
  ├─ EnumWindows() to find OS dialogs
  ├─ Check WS_DISABLED on top-level windows
  ├─ Maintain isModalVisible flag
  └─ throwIfModalVisible() called at entry of every enforce method
```

**Spec Requirements:**
- Single shared instance (dependency injected)
- Monitors: permission dialogs, UAC prompts, accessibility grant requests
- On modal detected: all enforcement paths hard-stop with [OS_HARD_STOP]
- On modal cleared: no stale freeze on subsequent calls
- Reset on session end

**Test Intent (WIN-ACC-09):**
- Modal detected → enforcement fails with [OS_HARD_STOP]
- Modal cleared → subsequent enforcement proceeds (no phantom freeze)

---

### 3.2) File Access Enforcement (INV-04, INV-09)

**Goal:** Session-scoped file handles; identity bound to volume + object ID (NTFS)

**Implementation Strategy:**
```
WindowsFileAccessGate
  ├─ requestSecurityScopedAccess(filePath)
  │   ├─ GetFileInformationByHandle() → volume ID + file index
  │   └─ Store in-memory only (not registry/appdata)
  │
  ├─ enforceFileRead/Write()
  │   ├─ Open file with FILE_SHARE_READ
  │   ├─ GetFileInformationByHandle() → current volume + index
  │   ├─ Verify volume + index match stored identity
  │   └─ Mismatch → OS_PERMISSION_DENIED
  │
  └─ revokeAllPermissions()
      └─ Close all handles; clear in-memory grants
```

**File Identity Binding:**
```c
typedef struct {
  DWORD volumeSerialNumber;  // Volume ID (prevents cross-volume swap)
  DWORD fileIndexHigh;       // Object ID (prevents file replacement)
  DWORD fileIndexLow;        //
} WindowsFileIdentity;
```

**Spec Requirements:**
- Capture file identity at grant time (user-mediated file picker)
- On access: re-open file, verify volume + index match
- Mismatch → hard deny + audit trail
- No persistent storage of handles (session only)
- Close all handles on session end

**Test Intent (WIN-ACC-04, WIN-ACC-06):**
- File granted in session 1 → new session access fails (no handle reuse)
- Export running → file swapped → export termination verified

---

### 3.3) Export Job Enforcement (INV-08, INV-09)

**Goal:** Killable job objects; termination verified; output stops

**Implementation Strategy:**
```
WindowsExportJobController
  ├─ enforceRenderExport()
  │   ├─ CreateJobObject()
  │   ├─ AssignProcessToJobObject()
  │   └─ Return killable handle
  │
  ├─ cancelJob()
  │   ├─ TerminateJobObject()
  │   ├─ Verify file stopped changing (size/mtime)
  │   └─ Verify file object ID stable
  │
  └─ revokeAllPermissions()
      └─ TerminateJobObject() on all running jobs
```

**Spec Requirements:**
- Export starts → attach to Job object
- Session end → TerminateJobObject() (all child processes die)
- After termination → verify output file stable
- File object ID change → hard stop

**Test Intent (WIN-ACC-02, WIN-ACC-06):**
- Session end mid-export → job killed + audit trail
- Export termination → file stability verified

---

### 3.4) Secure Input Enforcement (INV-07)

**Goal:** Credential fields hard-denied; classification mandatory

**Implementation Strategy:**
```
WindowsAccessibilityGate
  ├─ enforceTextInput(fieldType, windowHandle, controlId)
  │   ├─ Classify control (password vs normal vs sensitive)
  │   ├─ SENSITIVE → hard deny with [OS_HARD_STOP]
  │   ├─ UNKNOWN → ACC_REQUIRED
  │   └─ SAFE → allow with permission check
  │
  └─ Control Classification Strategy
      ├─ Check WM_GETTEXT style/class for "PASSWORD"
      ├─ Introspect control properties (disabled, read-only hints)
      └─ Default to UNKNOWN if not classifiable
```

**Spec Requirements:**
- fieldType is mandatory (not inferred)
- SENSITIVE (password fields, credential stores) → hard deny
- UNKNOWN → default deny (requires explicit user confirmation)
- SAFE → require accessibility permission + window binding
- Classification done at adapter boundary, not gate boundary

**Test Intent (WIN-ACC-07, WIN-ACC-08):**
- TEXT_INPUT to password field → [OS_HARD_STOP]
- Missing fieldType classification → [OS_PERMISSION_DENIED]

---

### 3.5) Window Identity Binding (INV-06)

**Goal:** Window handle + process binding; hard stop on change

**Implementation Strategy:**
```
WindowsEnforcementAdapter
  ├─ Capture: HWND + GetWindowThreadProcessId()
  ├─ Store: (windowHandle, processId, threadId)
  └─ On enforce: verify handles/IDs haven't changed
```

**Spec Requirements:**
- Window identity = HWND + ProcessId + ThreadId
- Binding established on first enforcement
- Change detected → transition to ACC_CHECKPOINT (hard stop)
- Same window across calls ✓
- Different window, same process ✗
- Different process ✗

---

## 4) LINUX ENFORCEMENT CHECKLIST (Draft)

### 4.1) Modal Dialog Detection (INV-05)

**Goal:** X11/Wayland modal gate; single source of truth

**Implementation Strategy:**
```
LinuxDialogWatcher
  ├─ X11 Path:
  │   ├─ XGetWindowProperty() → WM_STATE modal
  │   ├─ Check transient windows
  │   └─ isModalVisible = true if modal found
  │
  ├─ Wayland Path:
  │   ├─ Monitor zxdg_shell_v6 modal dialogs
  │   └─ isModalVisible = true if modal found
  │
  └─ throwIfModalVisible()
      └─ Called at entry of every enforce method
```

**Spec Requirements:**
- Auto-detect X11 vs Wayland at runtime
- Fallback: if can't detect modals, assume visible (fail-closed)
- Single shared instance
- Reset on session end

**Test Intent (LINUX-ACC-09):**
- Modal visible → hard stop
- Modal dismissed → execution resumes

---

### 4.2) File Access Enforcement (INV-04, INV-09)

**Goal:** inode + device binding (Linux native); same as macOS

**Implementation Strategy:**
```
LinuxFileAccessGate
  ├─ requestSecurityScopedAccess(filePath)
  │   ├─ realpath() → canonical path
  │   ├─ stat() → inode + device
  │   └─ Store in-memory only
  │
  ├─ enforceFileRead/Write()
  │   ├─ realpath() + stat() → current identity
  │   ├─ Verify inode + device match
  │   └─ Mismatch → OS_PERMISSION_DENIED
  │
  └─ revokeAllPermissions()
      └─ Clear in-memory bookmarks
```

**Spec Requirements:**
- Use inode + device (identical to macOS)
- No ACL persistence (session memory only)
- Symlink resolution via realpath
- File swap detection via inode change

**Test Intent (LINUX-ACC-04, LINUX-ACC-06):**
- File granted in session 1 → new session fails (no persistence)
- Export file swapped → termination verified

---

### 4.3) Export Job Enforcement (INV-08, INV-09)

**Goal:** process group + SIGTERM; termination verified

**Implementation Strategy:**
```
LinuxExportJobController
  ├─ enforceRenderExport()
  │   ├─ Fork render process
  │   ├─ setpgid() → new process group
  │   └─ Return killable handle
  │
  ├─ cancelJob()
  │   ├─ kill(-pgid, SIGTERM)  // Negative pgid = process group
  │   ├─ Verify file stopped (stat size/mtime)
  │   └─ Verify file inode stable
  │
  └─ revokeAllPermissions()
      └─ kill(-pgid, SIGTERM) on all running jobs
```

**Spec Requirements:**
- Render process in separate process group
- Session end → kill entire process group
- After kill → verify output stable (same as macOS)
- Inode change → hard stop

**Test Intent (LINUX-ACC-02, LINUX-ACC-06):**
- Session end mid-export → process group killed
- Export termination → file stability verified

---

### 4.4) Secure Input Enforcement (INV-07)

**Goal:** GTK/Qt field introspection; classification mandatory

**Implementation Strategy:**
```
LinuxAccessibilityGate
  ├─ enforceTextInput(fieldType, widgetPath)
  │   ├─ GTK path: check GTK_STYLE_PROPERTY (obscured, input-hints)
  │   ├─ Qt path: check QLineEdit.echoMode() (NoEcho = sensitive)
  │   ├─ SENSITIVE → hard deny with [OS_HARD_STOP]
  │   ├─ UNKNOWN → ACC_REQUIRED
  │   └─ SAFE → allow with permission
  │
  └─ Widget Classification
      ├─ Check input-hints (GTK) or echoMode (Qt)
      ├─ NoEcho / PASSWORD → SENSITIVE
      ├─ Normal text → SAFE
      └─ Unknown → UNKNOWN (default deny)
```

**Spec Requirements:**
- fieldType mandatory
- Password entry detection via GTK/Qt introspection
- SENSITIVE → hard deny
- UNKNOWN → default deny
- No inference; explicit classification required

**Test Intent (LINUX-ACC-07, LINUX-ACC-08):**
- TEXT_INPUT to password field → [OS_HARD_STOP]
- Missing fieldType → [OS_PERMISSION_DENIED]

---

### 4.5) Window/Surface Identity Binding (INV-06)

**Goal:** X11 Window XID + Display (or Wayland surface + seat)

**Implementation Strategy:**
```
LinuxEnforcementAdapter
  ├─ X11 Path:
  │   ├─ Capture: Window XID + Display
  │   └─ Binding: (xid, display)
  │
  ├─ Wayland Path:
  │   ├─ Capture: surface pointer + seat
  │   └─ Binding: (surface, seat)
  │
  └─ On enforce: verify identity unchanged
```

**Spec Requirements:**
- X11: Window XID + Display name
- Wayland: surface pointer + seat
- Change → hard stop (ACC_CHECKPOINT)

---

## 5) ACCEPTANCE TEST MAPPING

### Windows Test Suite (WIN-ACC-01 → WIN-ACC-09)

| Test | macOS Equivalent | Windows Spec | Status |
|------|---|---|---|
| WIN-ACC-01 | OS-ACC-01 | Dialog freeze denies enforcement | ⬜ Not Yet |
| WIN-ACC-02 | OS-ACC-02 | Job termination on session end | ⬜ Not Yet |
| WIN-ACC-03 | OS-ACC-03 | Crash → relaunch → no persistence | ⬜ Not Yet |
| WIN-ACC-04 | OS-ACC-04 | File handle reuse without re-prompt fails | ⬜ Not Yet |
| WIN-ACC-05 | OS-ACC-05 | No auto-retry loop | ⬜ Not Yet |
| WIN-ACC-06 | OS-ACC-06 | Export termination → file stable | ⬜ Not Yet |
| WIN-ACC-07 | OS-ACC-07 | Password field → hard deny | ⬜ Not Yet |
| WIN-ACC-08 | OS-ACC-08 | Missing field classification → deny | ⬜ Not Yet |
| WIN-ACC-09 | OS-ACC-09 | Modal dialog single source of truth | ⬜ Not Yet |

### Linux Test Suite (LINUX-ACC-01 → LINUX-ACC-09)

| Test | macOS Equivalent | Linux Spec | Status |
|------|---|---|---|
| LINUX-ACC-01 | OS-ACC-01 | Modal freeze denies enforcement | ⬜ Not Yet |
| LINUX-ACC-02 | OS-ACC-02 | Process group kill on session end | ⬜ Not Yet |
| LINUX-ACC-03 | OS-ACC-03 | Crash → relaunch → no persistence | ⬜ Not Yet |
| LINUX-ACC-04 | OS-ACC-04 | inode binding blocks reuse | ⬜ Not Yet |
| LINUX-ACC-05 | OS-ACC-05 | No auto-retry loop | ⬜ Not Yet |
| LINUX-ACC-06 | OS-ACC-06 | Export termination → file stable | ⬜ Not Yet |
| LINUX-ACC-07 | OS-ACC-07 | Password field → hard deny | ⬜ Not Yet |
| LINUX-ACC-08 | OS-ACC-08 | Missing field classification → deny | ⬜ Not Yet |
| LINUX-ACC-09 | OS-ACC-09 | Modal dialog single source of truth | ⬜ Not Yet |

---

## 6) PARITY CONTRACT RULES

### Rule 1: No Weakening
- If macOS enforces a check, Windows and Linux MUST enforce equivalent check
- Permitted: stricter enforcement (e.g., more aggressive modal detection)
- Forbidden: skipping or relaxing checks (e.g., accepting persistent file handles)

### Rule 2: Audit Parity
- All Windows + Linux enforcement must emit identical audit event types
- Event names: OS_PERMISSION_REQUESTED, OS_PERMISSION_DENIED, OS_HARD_STOP_TRIGGERED, etc.
- Audit format consistent across platforms

### Rule 3: Error Messages
- Hard stops must include platform identifier: [OS_HARD_STOP], [OS_PERMISSION_DENIED], [OS_ACC_REQUIRED]
- No platform-specific suffixes that bypass generic error handling

### Rule 4: Test Naming
- Same test suite numbering (WIN-ACC-01 → WIN-ACC-09, LINUX-ACC-01 → LINUX-ACC-09)
- Each test MUST pass on its respective platform

---

## 7) IMPLEMENTATION BOUNDARIES (NOT YET DONE)

| Component | macOS (LOCKED) | Windows (Spec) | Linux (Spec) | Status |
|-----------|---|---|---|---|
| Dialog Watcher | ✅ Implemented | 🗂️ Spec only | 🗂️ Spec only | Phase 3C locked |
| File Access Gate | ✅ Implemented | 🗂️ Spec only | 🗂️ Spec only | Phase 3C locked |
| Export Job Controller | ✅ Implemented | 🗂️ Spec only | 🗂️ Spec only | Phase 3C locked |
| Accessibility Gate | ✅ Implemented | 🗂️ Spec only | 🗂️ Spec only | Phase 3C locked |
| Acceptance Tests (9/9) | ✅ Passing | 🗂️ Spec only | 🗂️ Spec only | Phase 3C locked |

**CLEAR BOUNDARY:** This document defines the parity contract only. Implementation of Windows/Linux comes in subsequent phases.

---

## 8) NEXT PHASE

Once Phase 3D Parity Spec is approved:

**Phase 4: Windows Enforcement Implementation** (Windows adapter + gates)
**Phase 5: Linux Enforcement Implementation** (Linux adapter + gates)
**Phase 6: Cross-Platform Acceptance Testing** (WIN-ACC-01-09 + LINUX-ACC-01-09 suites)

Each phase includes Ghost adversarial review equivalent to Phase 3C.

---

## 9) SUCCESS CRITERIA

Phase 3D is complete when:
- [ ] Parity matrix documents all INV-01 → INV-09 across platforms
- [ ] Windows checklist specifies all 5 enforcement components
- [ ] Linux checklist specifies all 5 enforcement components
- [ ] Acceptance test mapping (WIN-ACC-01-09 + LINUX-ACC-01-09) defined
- [ ] All parity contract rules explicitly stated
- [ ] Clear boundaries on "NOT YET IMPLEMENTED"
- [ ] No weakening of macOS baseline
