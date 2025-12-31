# PHASE 4 — WINDOWS THREAT SURFACE MAP

(Pre-Spec / Pre-Test / Adversarial First Principles)

Status: 🎯 ADVERSARIAL REFERENCE (Ghost Playbook)
Scope: Concrete Windows-specific attack vectors + mandatory blocking requirements
Purpose: All Phase 4 enforcement must map to blocking one or more vectors below

This document enumerates attack vectors Ghost will attempt. No enforcement code should exist unless it blocks a WIN-Txx vector.

---

## I. THREAT CATEGORIES (Windows-Specific)

1. Dialog & UI Spoofing
2. Window Identity & HWND Reuse
3. Handle Persistence & Inheritance
4. Job Object Escape
5. File Identity Subversion
6. Process Elevation & Token Abuse
7. Persistence Across Sessions
8. Race Conditions & TOCTOU (Time-of-check / time-of-use)

---

## II. WINDOWS ATTACK VECTOR TABLE

### 🟥 DIALOG & UI SPOOFING

---

#### WIN-T01: Fake Permission Dialog Spoof

**Attack Flow**
- App draws a custom Win32 dialog that visually mimics a Windows permission prompt
- User believes OS mediated approval occurred
- App proceeds without real OS grant

**Impact**
- User consent bypass
- Silent permission escalation

**Mandatory Blocking**
- Enforcement must not trust UI state
- DialogWatcher must detect real OS-owned dialogs only
- Execution must freeze on any detected system dialog until OS dismissal event is observed

---

#### WIN-T02: Modal Overlay Hijack

**Attack Flow**
- App opens a modal overlay window above real OS dialog
- Intercepts input
- Simulates dismissal

**Impact**
- Dialog spoof dismissal
- Premature resume of execution

**Mandatory Blocking**
- Dialog dismissal must be tied to OS-level signals, not window close events
- No "best guess" dialog clearing

---

### 🟥 WINDOW IDENTITY & HWND REUSE

---

#### WIN-T03: HWND Recycling Attack

**Attack Flow**
- Window A closes
- Windows reuses HWND value for Window B
- Enforcement checks HWND only → mistakenly trusts new window

**Impact**
- Cross-window command execution
- UI navigation into unintended app context

**Mandatory Blocking**
- Window binding must include:
  - HWND
  - PID
  - Creation timestamp
- Any mismatch = hard stop

---

#### WIN-T04: Cross-Process Window Rebinding

**Attack Flow**
- Attacker injects into another process
- Presents window with same title/class
- Tricks enforcement into rebinding

**Impact**
- Command execution in wrong process

**Mandatory Blocking**
- Window identity must be bound to:
  - PID
  - Executable path hash
- Title/class alone is forbidden

---

### 🟥 HANDLE PERSISTENCE & INHERITANCE

---

#### WIN-T05: Inherited File Handle Leak

**Attack Flow**
- Child process inherits file handle
- Parent session ends
- Child continues writing/exporting

**Impact**
- Background execution post-revocation
- Export survives session end

**Mandatory Blocking**
- All file handles must be:
  - Non-inheritable by default
  - Explicitly closed on session end
  - Job termination must revoke children

---

#### WIN-T06: Handle Reuse Across Sessions

**Attack Flow**
- Handle opened in Session 1
- Cached in memory or static object
- Reused in Session 2

**Impact**
- Permission reuse without user mediation

**Mandatory Blocking**
- All handles must be session-scoped
- Session ID mismatch = immediate deny
- No global handle caches

---

### 🟥 JOB OBJECT ESCAPE

---

#### WIN-T07: CreateRemoteThread Escape

**Attack Flow**
- Job-bound process spawns thread in external process
- External process not in job
- Execution survives revocation

**Impact**
- Sandbox escape
- Post-session execution

**Mandatory Blocking**
- Job must enforce:
  - JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
  - All spawned processes must be job-bound
  - Detect + deny remote thread creation

---

#### WIN-T08: DLL Injection Persistence

**Attack Flow**
- Inject DLL into explorer.exe or service
- Job ends, injected code persists

**Impact**
- Long-lived control channel

**Mandatory Blocking**
- Enforcement must never trust job containment alone
- Sensitive operations must verify:
  - Caller PID ∈ active job
  - Job membership checks are mandatory at execution time

---

### 🟥 FILE IDENTITY SUBVERSION

---

#### WIN-T09: Hardlink Swap Attack

**Attack Flow**
- User grants access to file A
- Attacker swaps hardlink to file B
- Handle still valid

**Impact**
- Write to unintended file

**Mandatory Blocking**
- File identity must bind to:
  - Volume serial
  - File ID (NTFS)
- Path alone is insufficient

---

#### WIN-T10: NTFS Alternate Data Streams (ADS)

**Attack Flow**
- Write payload to file.txt:payload.exe
- Bypass normal path checks

**Impact**
- Hidden persistence
- Data exfiltration

**Mandatory Blocking**
- Explicitly deny ADS paths (: beyond drive spec)
- Canonicalize and validate paths before access

---

#### WIN-T11: Volume Move / Rename TOCTOU

**Attack Flow**
- File moved between check and write
- Path still valid, identity changed

**Impact**
- Integrity breach

**Mandatory Blocking**
- Identity must be revalidated at use time
- Not just at request time

---

### 🟥 PERSISTENCE & REGISTRY ABUSE

---

#### WIN-T12: Registry Bookmark Persistence

**Attack Flow**
- Store granted paths / handles in registry
- Reload after restart

**Impact**
- Cross-session permission reuse

**Mandatory Blocking**
- No persisted bookmarks allowed
- Registry must not be used for authority state
- Session end = total destruction

---

#### WIN-T13: AppData / Temp Leakage

**Attack Flow**
- Store tokens/handles in AppData
- Reload silently

**Impact**
- Invisible permission carryover

**Mandatory Blocking**
- Enforcement must not read any persisted permission artifacts
- Runtime-only authority

---

### 🟥 PROCESS ELEVATION

---

#### WIN-T14: Token Duplication / Elevation

**Attack Flow**
- Duplicate access token from higher-privileged process
- Perform action under elevated context

**Impact**
- Full system compromise

**Mandatory Blocking**
- All operations must assert:
  - Token integrity
  - Same elevation level as parent app
- Deny elevated token mismatch

---

#### WIN-T15: UAC Boundary Abuse

**Attack Flow**
- Trigger UAC prompt
- Resume execution incorrectly after dismissal

**Impact**
- Execution during privileged transition

**Mandatory Blocking**
- UAC dialogs must be treated as execution freeze
- Resume only after explicit OS confirmation

---

## III. GHOST'S EXPECTED PLAYBOOK (ORDER OF ATTACK)

Ghost will probe in this order:

1. **HWND reuse** (cheap, subtle, devastating) — WIN-T03
2. **Handle inheritance** — WIN-T05, WIN-T06
3. **Job object escape** — WIN-T07, WIN-T08
4. **Hardlink / ADS file tricks** — WIN-T09, WIN-T10
5. **Registry persistence** — WIN-T12, WIN-T13
6. **Dialog spoofing** — WIN-T01, WIN-T02
7. **Token elevation edge cases** — WIN-T14, WIN-T15
8. **TOCTOU races** — WIN-T11

If those fail, Ghost escalates to multi-vector chaining and race condition amplification.

---

## IV. MANDATORY PHASE 4 ENFORCEMENT CHECKS (NON-NEGOTIABLE)

Phase 4 must enforce:

- ✅ OS-truth dialog detection (no UI trust) — blocks WIN-T01, WIN-T02
- ✅ Window identity = HWND + PID + creation time — blocks WIN-T03, WIN-T04
- ✅ Session-scoped handles only — blocks WIN-T05, WIN-T06
- ✅ Kill-on-job-close job objects — blocks WIN-T07, WIN-T08
- ✅ File identity binding (volume + file ID) — blocks WIN-T09
- ✅ ADS rejection — blocks WIN-T10
- ✅ No persisted authority — blocks WIN-T12, WIN-T13
- ✅ Runtime job membership validation — blocks WIN-T08
- ✅ Token elevation checks — blocks WIN-T14, WIN-T15
- ✅ Hard stop on any ambiguity — blocks WIN-T11 and all race conditions

**If even one of these is missing, Ghost will find it.**

---

## V. VECTOR-TO-ENFORCEMENT MAPPING

| Threat Vector | Category | Mandatory Block | Phase 4 Component |
|---|---|---|---|
| WIN-T01 | Dialog spoof | OS-truth detection | WindowsDialogWatcher |
| WIN-T02 | Modal hijack | OS signals only | WindowsDialogWatcher |
| WIN-T03 | HWND reuse | HWND + PID + timestamp | WindowsEnforcementAdapter |
| WIN-T04 | Process rebind | PID + exe path hash | WindowsEnforcementAdapter |
| WIN-T05 | Handle inherit | Non-inheritable, close on revoke | WindowsFileAccessGate |
| WIN-T06 | Handle reuse | Session-scoped, ID mismatch deny | WindowsFileAccessGate |
| WIN-T07 | RemoteThread | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | WindowsExportJobController |
| WIN-T08 | DLL inject | Runtime job membership check | WindowsExportJobController |
| WIN-T09 | Hardlink swap | Volume + file ID binding | WindowsFileAccessGate |
| WIN-T10 | ADS abuse | Reject : paths | WindowsFileAccessGate |
| WIN-T11 | Volume move | Revalidate at use time | WindowsFileAccessGate |
| WIN-T12 | Registry persist | No registry authority | WindowsFileAccessGate + all gates |
| WIN-T13 | AppData leak | No persisted artifacts | WindowsFileAccessGate + all gates |
| WIN-T14 | Token elevation | Assert elevation level | WindowsAccessibilityGate |
| WIN-T15 | UAC bypass | Treat as freeze | WindowsDialogWatcher |

---

## VI. WHAT THIS ENABLES NEXT

From this threat map, the next steps become obvious:

### Phase 4 Windows Enforcement Spec (Vector-Mapped)
Every class + method maps to blocking specific WIN-Txx vectors:
- WindowsDialogWatcher blocks WIN-T01, WIN-T02, WIN-T15
- WindowsEnforcementAdapter blocks WIN-T03, WIN-T04
- WindowsFileAccessGate blocks WIN-T05, WIN-T06, WIN-T09, WIN-T10, WIN-T11, WIN-T12, WIN-T13
- WindowsExportJobController blocks WIN-T07, WIN-T08
- WindowsAccessibilityGate blocks WIN-T14

### WIN-ACC-01 → WIN-ACC-09 Tests (Vector-Indexed)
Each acceptance test proves one or more vectors are dead:
- WIN-ACC-01: Dialog freeze denies enforcement (blocks WIN-T01, WIN-T02)
- WIN-ACC-02: Job termination on session end (blocks WIN-T05, WIN-T07)
- WIN-ACC-03: Crash → relaunch → no persistence (blocks WIN-T12, WIN-T13)
- WIN-ACC-04: Handle reuse fails (blocks WIN-T06)
- WIN-ACC-06: Export termination verified (blocks WIN-T11)
- WIN-ACC-09: Modal single source of truth (blocks WIN-T02)
- (etc.)

### Ghost Review
Reduced to: "Can I still perform WIN-Txx?"
- If no → lock
- If yes → micro-patch

---

## VII. VERDICT

Your approach is not just sound — **it is the only correct one at this maturity level.**

Build enforcement that blocks known threats first. Tests that prove blocking. Then adversarial review that confirms no new vectors exist.

Next phase: **Phase 4 Windows Enforcement Spec (Vector-Mapped)**

This spec will define:
- All Windows enforcement classes + method signatures
- How each blocks WIN-T01 → WIN-T15
- What invariants must hold
- What tests must exist

Then acceptance tests fall out mechanically.
