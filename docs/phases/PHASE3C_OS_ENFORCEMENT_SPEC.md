# Phase 3C — macOS OS-Level Enforcement Specification

**Status:** PATCH v1.1 INTEGRATED, READY FOR LOCK
**Scope:** macOS OS-level enforcement only
**Non-Goal:** No new authority semantics, no UX invention, no optimization

---

## 0. Purpose (Non-Negotiable)

Phase 3C enforces existing authority semantics at the operating system level.

OS enforcement may only reduce capability.
It may never expand it.

This layer exists to ensure that even if the application is compromised, confused, or buggy, execution still halts when authority ends.

---

## 1. Preconditions (Must Already Be True)

Phase 3C cannot exist unless all are true:
- Phase 3A (E2E authority) — LOCKED
- Phase 3B (audit UI) — LOCKED
- Capability Boundary (Phase 2) — LOCKED
- Self Session v0 — LOCKED

If any of the above are modified, Phase 3C must be re-reviewed.

---

## 2. OS Enforcement Principles (Constitutional)

### OS-INV-01: OS Is a Gate, Not an Authority

- macOS does not decide what is allowed
- macOS only enforces denial
- All allow/deny decisions originate from:
  - CapabilityAuthority
  - Self Session state
  - ACC validation

**Broken if:** OS behavior enables something app logic denied.

---

### OS-INV-02: Permission Denial = Immediate Halt

If macOS denies a permission request:
- Execution must halt
- Session must pause
- No retries
- No fallbacks
- No degraded mode

**Broken if:** System continues with partial capability.

---

### OS-INV-03: Revocation Is Immediate and Total

If any of the following occur:
- Session ends
- Authority revoked
- App loses focus / crashes
- Process identity changes

Then:
- All OS permissions become invalid
- Any in-flight operation is terminated
- No background continuation is allowed

**Broken if:** Anything continues after authority death.

---

### OS-INV-04: No Persistent Security-Scoped Access

**[PATCH v1.1 — Ghost]**

Security-scoped bookmarks MUST NOT be written to disk, keychain, preferences, or any persistent store.

All security-scoped access handles MUST:
- Exist only in memory
- Carry a session_id
- Be invalidated immediately on:
  - Session end
  - Authority revocation
  - App crash
  - Process restart

Any attempt to reuse a bookmark from a previous session MUST FAIL and trigger OS_PERMISSION_DENIED.

**Violation Condition (Binary):**
If a file path can be accessed without a new user-mediated picker in a new session → FAIL

---

### OS-INV-05: OS Dialog Presence Freezes Execution

**[PATCH v1.1 — Ghost]**

If any OS-managed dialog is visible (permissions, authentication, file access):
- All execution MUST HALT immediately
- No UI_NAVIGATION, TEXT_INPUT, or PARAMETER_ADJUSTMENT may proceed
- Execution may resume only after:
  - Dialog is dismissed
  - ACC reaffirmation (if capability requires it)

**Required Audit Events:**
- OS_DIALOG_DETECTED
- OS_DIALOG_CLEARED

**Violation Condition:**
If any execution occurs while an OS dialog is present → FAIL

---

## 3. OS Permission Classes (Explicit Mapping)

| Capability | macOS Mechanism | Scope |
|-----------|-----------------|-------|
| UI_NAVIGATION | Accessibility API | Bound app process only |
| TEXT_INPUT | Accessibility API | Non-secure fields only |
| PARAMETER_ADJUSTMENT | Accessibility API | Same window / same app |
| FILE_READ | Security-Scoped Bookmarks | User-selected files only |
| FILE_WRITE | Security-Scoped Bookmarks | Explicit export paths only |
| RENDER_EXPORT | File write + process execution | Single action |
| TRANSPORT_CONTROL | Accessibility API | Active window only |

**No other OS permissions are in scope.**

---

## 4. Permission Request Rules (Binary)

### OS-REQ-01: Just-In-Time Only

- Permissions are requested only at point of use
- Never pre-granted
- Never bundled

**Broken if:** Permissions are requested "in advance".

---

### OS-REQ-02: User-Mediated Grant Only

- All OS permission dialogs are shown by macOS
- Self Session never simulates clicks
- User must explicitly approve

**Broken if:** Approval can be automated or inferred.

---

### OS-REQ-03: Permission Scope Must Match Capability Scope

- App-wide permissions are forbidden
- Only:
  - Specific process
  - Specific file
  - Specific window

**Broken if:** Permission exceeds declared capability scope.

---

### OS-REQ-04: Explicit TEXT_INPUT Field Classification

**[PATCH v1.1 — Ghost]**

All TEXT_INPUT actions MUST classify the target field before execution.

Field classification is mandatory and binary-enforced:

| Classification | Meaning | Action |
|---|---|---|
| SAFE | Explicitly allowlisted, non-credential field | Allowed |
| UNKNOWN | Cannot be confidently classified | Deny + ACC |
| SENSITIVE | Credential, secret, auth, or system field | Hard deny + halt |

SENSITIVE includes (non-exhaustive):
- Password fields
- API key/token inputs
- 2FA / OTP fields
- Keychain dialogs
- OS authentication prompts
- Fields inside OS-managed permission dialogs

**Rules:**
- UNKNOWN defaults to DENY
- SENSITIVE triggers:
  - S6 HALTED
  - SENSITIVE_FIELD_BLOCKED audit event

**Violation Condition:**
Any TEXT_INPUT executed without prior classification → FAIL

---

### OS-REQ-05: Process + Window Identity Binding

**[PATCH v1.1 — Ghost]**

Authority binding MUST include:
- bundleId
- processId
- windowNumber

**Rules:**
- If the active window changes:
  - Transition to S4 ACC_CHECKPOINT
  - Execution pauses
- Authority MUST NOT persist across:
  - Window changes
  - Detached panels
  - File pickers
  - Floating tool windows

**Violation Condition:**
Execution continues after window identity changes without re-affirmation → FAIL

---

### OS-REQ-06: Export Job Termination Control

**[PATCH v1.1 — Ghost]**

All RENDER_EXPORT operations MUST:
- Return a cancellable job handle
- Support explicit termination
- Be verifiably stopped on:
  - Session end
  - Authority revocation
  - App crash
  - OS permission loss

On termination:
- Cancel job at app level
- Terminate helper process if spawned
- Verify output file stops changing

**Required Audit Events:**
- OS_EXPORT_JOB_STARTED
- OS_EXPORT_JOB_CANCEL_REQUESTED
- OS_EXPORT_JOB_TERMINATED

**Violation Condition:**
Export continues after session end → FAIL

---

## 5. Hard Stop Conditions (Mandatory)

Execution must halt immediately if any occur:
1. macOS permission denied
2. macOS permission revoked
3. App process restarts
4. App crashes
5. Session ends
6. ACC expires
7. Authority TTL expires
8. App loses foreground focus (configurable, default ON)

No retries. No "resume when fixed".

---

## 6. OS-Deny Classification

**[PATCH v1.1 — Ghost]**

Permission denial behavior is classified:

| Denial Type | Resulting State |
|---|---|
| Required capability denied | S6 HALTED |
| Optional capability denied | S5 PAUSED |

**Rules:**
- Both require explicit user re-initiation to continue
- Both must be logged
- No auto-retry permitted

---

## 7. Forbidden Behaviors (Explicit)

The following are constitutionally forbidden:
- Simulating OS permission dialogs
- Explaining why permission is needed in persuasive language
- Re-requesting denied permissions automatically
- Storing permissions beyond session lifetime
- Using Accessibility to:
  - Enter passwords
  - Approve OS dialogs
  - Navigate system settings
- Continuing work "offline" or "headless"

If any occur → system is broken.

---

## 8. Audit Requirements (OS Layer)

Every OS interaction must emit an audit event:

| Event | Required Fields |
|---|---|
| OS_PERMISSION_REQUESTED | capability, timestamp |
| OS_PERMISSION_GRANTED | capability, scope |
| OS_PERMISSION_DENIED | capability |
| OS_PERMISSION_REVOKED | capability |
| OS_HARD_STOP_TRIGGERED | reason |
| OS_EXECUTION_TERMINATED | processId |
| OS_DIALOG_DETECTED | dialogType |
| OS_DIALOG_CLEARED | timestamp |
| OS_EXPORT_JOB_STARTED | jobId, timestamp |
| OS_EXPORT_JOB_CANCEL_REQUESTED | jobId |
| OS_EXPORT_JOB_TERMINATED | jobId |
| SENSITIVE_FIELD_BLOCKED | fieldId, reason |

If it's not logged, it didn't happen.

---

## 9. Acceptance Tests (Pass / Fail)

### OS-ACC-01: Deny Accessibility → Session Halts

- Deny Accessibility permission
- Assert: Session halts, no execution occurs
- **PASS/FAIL**

---

### OS-ACC-02: Session End Mid-Export → Export Terminates

- End session mid-export
- Assert: Export terminates, file stops changing
- **PASS/FAIL**

---

### OS-ACC-03: Crash App → Relaunch → Authority Is Gone

- Crash app during session
- Relaunch app
- Assert: Authority is gone, no residual permission
- **PASS/FAIL**

---

### OS-ACC-04: Permission Granted Once → Reuse Without Re-Prompt → FAIL

- Grant permission once
- Attempt to reuse without new user-mediated picker
- Assert: FAIL (must re-prompt)
- **PASS/FAIL**

---

### OS-ACC-05: OS Denial Followed By Retry Without User Action → FAIL

- OS denies permission
- System attempts to retry automatically
- Assert: FAIL (no auto-retry)
- **PASS/FAIL**

---

### OS-ACC-06: Background Export Survival

**[PATCH v1.1 — Ghost]**

- Start long RENDER_EXPORT
- End session mid-export
- Assert:
  - Export job canceled
  - Output file stops changing (size + timestamp)
  - OS_EXPORT_JOB_TERMINATED logged
- **PASS/FAIL**

---

### OS-ACC-07: Secure Field Denial

**[PATCH v1.1 — Ghost]**

- Attempt TEXT_INPUT into credential-like field
- Assert:
  - Hard denial
  - Transition to S6 HALTED
  - SENSITIVE_FIELD_BLOCKED logged
  - No execution occurs
- **PASS/FAIL**

---

## 10. Non-Goals (Explicit)

Phase 3C does not:
- Improve UX
- Reduce friction
- Optimize permission flows
- Hide macOS dialogs
- Make anything "smoother"

Safety > convenience. Always.

---

## 11. Lock Statement

Phase 3C introduces no new authority.
It only enforces existing authority at a lower level.
If this spec is violated, the system is unsafe.

---

## Patch Summary (v1.1)

**Ghost Additions:**
- Added OS-INV-04: No bookmark persistence
- Added OS-INV-05: OS dialog execution freeze
- Added OS-REQ-04: TEXT_INPUT field classification
- Added OS-REQ-05: Window-scoped authority binding
- Added OS-REQ-06: Export job killability
- Added OS-DENY classification
- Added OS-ACC-06 / OS-ACC-07 tests
- Extended audit event list

**Status:** LOCK-READY

---

Generated with Claude Code
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
