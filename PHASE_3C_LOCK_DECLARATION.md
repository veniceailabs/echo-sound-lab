# PHASE 3C — macOS ENFORCEMENT LOCK DECLARATION (SPEC SNAPSHOT)
Status: 🔒 LOCKED (Mechanically enforced)
Scope: Phase 3C macOS OS Enforcement Layer (Adapter + Gates + Acceptance Tests)

## 1) Purpose
This document is the spec-level snapshot of Phase 3C macOS enforcement.
It records the enforcement contract, invariants, acceptance tests, and final verdict.
This layer is a gate (mechanical denial), not an authority (no new decisions).

## 2) Components in Lock Scope
- MacOSEnforcementAdapter (central routing / coordinator)
- OSDialogWatcher (single source of truth for dialog freeze)
- AccessibilityGate (UI navigation + text input + parameter adjustment enforcement)
- FileAccessGate (security-scoped file read/write enforcement)
- ExportJobController (killable export jobs + termination verification)
- SessionContext (single source of truth for session binding)

## 3) Core Enforcement Model
- The OS layer enforces denial and hard-stops.
- It does not grant new capabilities.
- It receives a capability request + execution context and routes to gates.
- All enforcement is session-bound; revocation is immediate and total.

## 4) Locked Invariants (Must Always Hold)
### INV-01: Gate Not Authority
- Adapter + gates enforce only. They do not mint new authority or policy.

### INV-02: Denial = Immediate Halt
- If any gate denies, execution halts immediately via thrown error.

### INV-03: Revocation Is Immediate and Total
- Session end revokes: AccessibilityGate, FileAccessGate, ExportJobController, OSDialogWatcher.
- All in-memory grants/bookmarks/jobs are invalidated immediately.

### INV-04: No Persistent Security-Scoped Access
- File access bookmarks exist in memory only.
- Bookmarks are session-bound and cleared on session end.
- Reuse across sessions without re-prompt fails.

### INV-05: OS Dialog Presence Freezes Execution (Hard Stop)
- Single shared OSDialogWatcher is the source of truth.
- Adapter and all gates call throwIfDialogVisible().
- Any OS dialog visible ⇒ hard stop.
- Clearing dialogs allows execution to resume (no stale desync).

### INV-06: Window Identity Binding (Hard Stop on Change)
- Window identity changes trigger hard stop / checkpoint behavior via gate + adapter handling.
- Prevents executing against unintended windows.

### INV-07: Secure Field Denial (Credentials Protected)
- TEXT_INPUT to SENSITIVE fields is hard-denied with OS_HARD_STOP.
- UNKNOWN fields default deny requiring explicit confirmation (ACC_REQUIRED path).
- SAFE fields require accessibility permission + window identity validity.

### INV-08: Killable Export Jobs
- Export jobs return killable handles.
- Session end terminates running jobs.
- No background survival permitted.

### INV-09: Export Output Continuation Detection
- After termination/revocation, output must stop changing.
- File stability checks are performed (size/mtime).
- Identity checks prevent alias/symlink swaps.

## 5) File Identity Binding (TOCTOU / Swap Resistance)
### FileAccessGate
- Captures file identity at bookmark creation time:
  - realPath (canonical)
  - inode
  - device
- On enforceFileRead/enforceFileWrite:
  - resolves current realPath + stat
  - verifies inode/device match bookmark identity
  - mismatch ⇒ OS_PERMISSION_DENIED + audit trail

### ExportJobController
- File watcher uses fs.statSync metadata including inode/device.
- verifyFileStoppedChanging enforces identity stability and change cessation.

## 6) Audit Requirements (Proof Over Inference)
- All critical transitions emit audit events:
  - OS_PERMISSION_REQUESTED / GRANTED / DENIED
  - OS_HARD_STOP_TRIGGERED
  - OS_SESSION_ENDING / ENDED
  - OS_EXPORT_JOB_STARTED / TERMINATED / COMPLETED
  - OS_DIALOG_DETECTED / CLEARED / WATCHER_RESET
  - SENSITIVE_FIELD_BLOCKED

## 7) Blocking Acceptance Tests (All Must PASS)
Test Suite: Phase 3C macOS OS Enforcement — Acceptance Tests

- OS-ACC-01: Deny Accessibility → Session Halts
  - Accessibility permission denied ⇒ OS_PERMISSION_DENIED, execution halts

- OS-ACC-02: Session End Mid-Export → Export Terminates
  - Export running + session end ⇒ TERMINATED + audit logged

- OS-ACC-03: Crash App → Relaunch → Authority Is Gone
  - Session end logs destruction events; grants do not persist; enforcement fails in new session

- OS-ACC-04: Permission Granted Once → Reuse Without Re-Prompt → FAIL
  - New session file access without new bookmark ⇒ OS_PERMISSION_DENIED

- OS-ACC-05: OS Denial Followed By Retry Without User Action → FAIL
  - No auto-retry loop permitted; repeated attempt without user mediation fails

- OS-ACC-06: Background Export Survival
  - Export terminated + no continued changes + audit proof

- OS-ACC-07: Secure Field Denial
  - TEXT_INPUT to SENSITIVE field ⇒ OS_HARD_STOP + SENSITIVE_FIELD_BLOCKED

- OS-ACC-08: TEXT_INPUT Missing FieldType → FAIL
  - Missing fieldType ⇒ OS_PERMISSION_DENIED

- OS-ACC-09: OSDialogWatcher Single Source of Truth
  - Dialog detected ⇒ hard stop
  - Dialog cleared ⇒ no stale freeze on subsequent enforcement

## 8) Final Verdict (Lock)
✅ Phase 3C macOS Enforcement is LOCKED.

- Mechanically enforced invariants hold.
- No bypass surfaces remain (dialog desync, permission reuse, export survival, sensitive field entry).
- Identity binding prevents file swap/alias attacks.
- Session-bound revocation is immediate and total.
- All 9 acceptance tests are blocking and PASS.

Approved by Ghost adversarial review (2025-12-29).

## 9) Out of Scope / Optional Hygiene (Not Required for Lock)
- Optional: strengthen file-stability verification using consecutive stable counts.
  - Correctness hygiene only; not a security gap.
