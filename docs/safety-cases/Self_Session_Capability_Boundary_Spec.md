# Self Session — Capability Boundary Specification (v0.1)

**Status:** LOCKED (Ghost Adversarial Pass Complete)
**Subsystem:** Self Session
**Purpose:** Define the only executable authority Self Session may exercise, independent of OS, app, or UI affordances.

---

## 1) Purpose & Scope

Self Session is an app-agnostic, capability-strict execution runtime.

It may operate inside any system application explicitly permitted by the artist, but:
- only within declared capability boundaries
- only while the artist is present
- only until the session ends
- never by inference, memory, or persistence

Capabilities are the sole unit of execution authority.

If an action cannot be expressed as a capability defined in this document, it is not executable.

---

## 2) Core Principle (Non-Negotiable)

Capabilities define what Self Session can do.
Permissions only enforce those limits.

- OS permissions do not grant authority
- UI affordances do not grant authority
- Prior sessions do not grant authority
- Success in similar actions does not grant authority

Authority exists only inside an active session and only for granted capabilities.

---

## 3) Capability Classes (Canonical Set)

Each capability is independent, explicit, and non-escalating.

### 3.1 UI_NAVIGATION

**Allows:**
- Mouse movement
- Clicks
- Window focus within bound app
- Menu navigation

**Does NOT allow:**
- Text entry
- Parameter changes
- File operations
- Execution of irreversible actions
- Destructive actions (delete, remove, clear)

**Risk Level:** Low
**Reversibility:** Fully reversible

---

### 3.2 TEXT_INPUT

**Allows:**
- Typing into existing text fields
- Editing text where cursor already exists

**Does NOT allow:**
- Submitting forms unless explicitly confirmed
- Writing to files
- Executing commands
- Creating executable or interpretable output

**Risk Level:** Medium
**Reversibility:** Context-dependent

---

### 3.3 PARAMETER_ADJUSTMENT

**Allows:**
- Adjusting knobs, sliders, toggles
- Changing values of existing controls

**Does NOT allow:**
- Creating new entities
- Deleting entities
- Triggering renders or exports
- Enabling side-effect features (auto-save, auto-bounce, background render)

**Risk Level:** Medium
**Reversibility:** Depends on host app (but must be verified before execution)

---

### 3.4 TRANSPORT_CONTROL

**Allows:**
- Play / pause
- Stop
- Loop
- Scrub

**Does NOT allow:**
- Rendering
- Exporting
- File writes
- Background continuation

**Risk Level:** Low
**Reversibility:** Fully reversible

---

### 3.5 FILE_READ

**Allows:**
- Opening existing files
- Reading file metadata
- Importing assets

**Does NOT allow:**
- Writing
- Overwriting
- Deleting

**Risk Level:** Medium
**Reversibility:** Safe

---

### 3.6 FILE_WRITE

**Allows:**
- Saving files
- Writing exports
- Overwriting with explicit confirmation
- Content-type constrained (data, media, documents only)

**Does NOT allow:**
- Creating executable files (scripts, binaries, plugins, workflows)
- Creating interpretable automation (AppleScript, shell, macros)
- Deleting files
- Modifying outside declared directory scope

**Risk Level:** High
**Reversibility:** Potentially irreversible
**ACC Required:** Yes (per-action, pre-execution)

---

### 3.7 RENDER_EXPORT

**Allows:**
- Triggering render / bounce / export operations
- Background completion (during active session only)

**Does NOT allow:**
- Batch expansion or chaining without explicit confirmation
- Background continuation after session end
- Automatic retries

**Risk Level:** High
**Reversibility:** Irreversible
**ACC Required:** Yes (explicit + final confirmation)

---

## 4) Constitutional Rules (Ghost Adversarial Pass - v0.1)

### Rule C1: Default Deny (Immutable)

- Any action not mapped to a capability → BLOCKED
- Any capability not explicitly granted → BLOCKED
- Any attempt to combine capabilities implicitly → BLOCKED

There is no "implied capability." Ever.

---

### Rule C2: Non-Executable Output Constraint (NEW - Ghost Pass #1)

Self Session may not create, modify, or write files that are executable, interpretable, or automatable outside the host application context, regardless of capability combination.

**Prohibited outputs:**
- Shell scripts (.sh, .bash, .zsh)
- Compiled binaries or bytecode
- AppleScript (.scpt, .app)
- Automator workflows
- Plugin/extension files
- Configuration automation files

**Enforcement:** FILE_WRITE must validate content-type before execution. If output would be executable/interpretable, automatic promotion to RENDER_EXPORT + explicit pre-ACC required.

---

### Rule C3: Side-Effect Promotion (NEW - Ghost Pass #2)

If a parameter adjustment causes file creation, export, persistence, or external state change, the action is automatically reclassified as FILE_WRITE or RENDER_EXPORT and requires the corresponding ACC.

**Examples:**
- Toggling "auto-save" → requires FILE_WRITE ACC
- Enabling "background render" → requires RENDER_EXPORT ACC
- Changing "working directory" → requires explicit confirmation

**Enforcement:** Before any PARAMETER_ADJUSTMENT executes, system must check: "Does this change create side effects?" If yes, escalate to appropriate capability.

---

### Rule C4: Single-Action ACC Binding (NEW - Ghost Pass #3)

FILE_WRITE and RENDER_EXPORT approvals apply to exactly one atomic action.

Each subsequent write/export requires a new ACC, regardless of prior approvals within the same session.

**Examples:**
- ✅ Artist approves "Save mix.wav" → saves one file
- ✗ Artist approves "Save mix.wav" → system then saves 5 backup files without new ACCs
- ✅ Artist approves "Export project to MP3" → exports one file
- ✗ Artist approves export → system then exports to 3 formats without new ACCs

**Enforcement:** Each FILE_WRITE and RENDER_EXPORT call requires a fresh confirmation token. No batch operations.

---

### Rule C5: Destructive Action Guard (NEW - Ghost Pass #4)

Any UI interaction that triggers deletion, removal, clearing, or destructive modification is forbidden, regardless of capability, unless a dedicated DELETE capability is explicitly defined (it is not).

**Prohibited outcomes:**
- Delete file
- Remove track
- Clear project
- Undo/redo that deletes content
- Destructive effects (reverb, distortion beyond reversal)

**Enforcement:** If a UI_NAVIGATION action navigates toward a destructive menu item or button, system triggers ACC or halt before click. If user clicks, session immediately halts.

---

### Rule C6: Process Identity Binding (NEW - Ghost Pass #5)

Self Session authority is bound to a specific process instance.

If the bound application exits, crashes, or relaunches (PID changes), the session immediately halts and requires explicit re-initiation.

**Examples:**
- App crashes → session halts (not paused, halted)
- App is force-quit → session halts
- App updates and relaunches → session halts
- User switches to another window of same app → allowed (same PID)

**Enforcement:** Before every action, verify: `current_app_pid == session_bound_pid`. If mismatch, transition to S6 (HALTED) immediately.

---

### Rule C7: Anti-Automation Pacing (NEW - Ghost Pass #6)

Self Session may not execute high-frequency repetitive actions without intermittent ACCs, even if individual actions are low-risk.

**Definition of high-frequency:** More than 3 low-risk actions (UI_NAVIGATION, TRANSPORT_CONTROL) within 5 seconds without explicit user input.

**Enforcement:** System tracks action frequency. If threshold exceeded, automatically insert ACC or transition to S4 (ACC_CHECKPOINT).

**Why:** Preserves "delegated hands, not automation" posture. Prevents fatigue-based coercion.

---

## 5) App Binding Mechanism

Each Self Session is bound to:
- One (1) target application
- Identified by:
  - Bundle ID
  - Process ID (immutable; relaunch = new session)
  - Window ownership

**Rules:**
- Switching focus outside the bound app triggers immediate pause → ACC or halt
- Cross-app actions are never allowed
- File pickers are treated as temporary sub-contexts, not new apps
- Process identity changes → immediate halt (Rule C6)

---

## 6) Cross-App & Context Violation Handling

**Immediate Halt Conditions:**
- New application gains focus without ACC
- OS dialog requiring permission escalation appears
- Capability request exceeds granted scope
- Automation API returns ambiguous target
- Process ID changes (Rule C6)
- Destructive action attempted (Rule C5)

**Behavior:**
- Execution halts
- Authority token remains valid for session restart (if not revoked)
- Artist must explicitly continue or end session

---

## 7) Capability ↔ ACC Coupling

Capabilities are categorized by confirmation requirement:

| Capability | Pre-ACC | Post-ACC | Notes |
|---|---|---|---|
| UI_NAVIGATION | No | No | Passive; halts on destructive intent |
| TEXT_INPUT | Sometimes | No | Context-dependent; never creates executables |
| PARAMETER_ADJUSTMENT | No | Optional | Side-effects promote to FILE_WRITE/RENDER_EXPORT |
| TRANSPORT_CONTROL | No | No | Safe; no background persistence |
| FILE_READ | No | No | Safe; read-only |
| FILE_WRITE | Yes | No | High risk; per-action binding (Rule C4) |
| RENDER_EXPORT | Yes | Yes | Irreversible; per-action binding (Rule C4) |

---

## 8) Explicitly Forbidden (Cannot Ever Happen)

- Capability escalation without confirmation
- Capability persistence across sessions
- Learning which capabilities are "usually allowed"
- Background execution after pause or session end
- Chaining actions to simulate higher authority
- Inferring consent from silence, habit, or success
- Creating executable output (Rule C2)
- Executing side-effect parameters without ACC (Rule C3)
- Batch write operations without per-action ACCs (Rule C4)
- Destructive UI interactions (Rule C5)
- Continuing session across app restart (Rule C6)
- High-frequency automation without pacing ACCs (Rule C7)

---

## 9) Binding Statement

Self Session may act only through explicitly granted capabilities, inside a single bound application (identified by immutable process ID), while the artist is present, and only for the duration of the session.

Capabilities do not persist, do not escalate, do not chain implicitly, do not execute side-effects silently, do not create executables, and do not infer authority from context, history, or outcome.

Any action outside this boundary is a system failure and results in immediate halt.

---

## 10) Reference Invariants

- **H1:** Presence is the authority source
- **H2:** Silence collapses execution into pause
- **H3:** Session end destroys all authority
- **C1-C7:** Constitutional rules (above)

---

## 11) Changelog (v0 → v0.1)

Ghost Adversarial Pass applied. 6 constitutional rules added:

- **C2:** Non-Executable Output Constraint (kills scripting, executables)
- **C3:** Side-Effect Promotion (elevates auto-save, auto-bounce to FILE_WRITE/RENDER_EXPORT)
- **C4:** Single-Action ACC Binding (prevents batch writes without confirmation)
- **C5:** Destructive Action Guard (UI_NAVIGATION cannot navigate to delete)
- **C6:** Process Identity Binding (app crash = immediate halt)
- **C7:** Anti-Automation Pacing (high-frequency actions require intermittent ACCs)

All 6 rules are mechanical, testable, and enforceable.

---

## 12) Lock Statement

This specification is constitutionally locked.

No Phase 2 work may violate these rules.
No OS mapping may circumvent these rules.
No engineer may interpret these rules as optional.

If a feature proposal cannot be expressed as a single capability from Section 3, it does not ship.

If a feature violates any rule C1–C7, it must be redesigned or rejected.

**Locked:** 2025-12-28
**By:** Ghost (Adversarial Review)
**Status:** READY FOR OS-LEVEL PERMISSION MAPPING

---

**Next:** Option B (OS Permission Model) now maps these capabilities to macOS Accessibility/Automation APIs.

No ambiguity remains. No escape hatches. No "but what if..."

The constitution is law.
