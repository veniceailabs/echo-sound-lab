# Self Session — Lifecycle Skeleton

**Status:** Draft (Awaiting Ghost Review)

**Purpose:** Define the state machine for Self Session execution. This is not UX prose. This is the legal grammar of execution.

**Scope:** Core states, transitions, authority model, impossibilities.

---

## Core States (Definitive)

```
S0:  INACTIVE
S1:  SESSION_REQUESTED
S2:  CONSENT_GRANTED
S3:  EXECUTING
S4:  ACC_CHECKPOINT
S5:  PAUSED
S6:  HALTED
S7:  COMPLETED
```

---

## State Definitions (Authority & Execution)

### S0 — INACTIVE

**Authority:** None.

**Execution Allowed:** None.

**What It Means:**
- No session exists.
- No delegated authority.
- Default resting state.
- System awaits explicit session request.

**Silence Behavior:** N/A (already at baseline).

**Revocation Behavior:** N/A.

**On Entry:**
- Clear all session state
- Clear all permission tokens
- Close any execution channels
- Reset execution context

**On Exit:** Only via explicit transition to S1.

---

### S1 — SESSION_REQUESTED

**Authority:** None yet.

**Execution Allowed:** Zero.

**What It Means:**
- System has requested permission to create a session.
- Artist sees request.
- Session object exists but is not activated.
- No execution can begin.

**Request Parameters Must Include:**
- Target file/project (canonical reference, not UI text)
- Target scope (exact operations permitted)
- Session duration (TTL)
- ACC frequency
- Undo guarantee (what can be undone)

**Silence Behavior:**
- If artist does not explicitly confirm → automatic transition to S0 (INACTIVE)
- Timeout for request: 5 minutes
- After timeout, request expires, → S0
- No escalation, no reminder, no retry

**Revocation Behavior:**
- Artist may dismiss request → S0 (INACTIVE)
- Session object is destroyed
- No traces remain

**On Entry:**
- Session object created with unique ID
- Request parameters logged
- No execution threads spawned

**On Exit:**
- Either → S2 (explicit confirmation)
- Or → S0 (silence, dismissal, or timeout)

**IMPOSSIBLE TRANSITION:**
- S1 → S3 (direct to execution) ❌
- S1 → S4 (directly to checkpoint) ❌
- Any execution while in S1 ❌

---

### S2 — CONSENT_GRANTED

**Authority:** Granted, scoped, time-bounded.

**Execution Allowed:** Zero (not yet executing, but permission exists).

**What It Means:**
- Artist has explicitly confirmed session request.
- Session parameters are locked (immutable).
- Authority token is active but execution is deferred.
- System is ready to begin execution.
- Artist can still revoke before first action.

**Authority Scope (Locked at Entry):**
- Exact file/project reference
- Exact operations permitted (capability registry)
- Session TTL (absolute expiration time)
- ACC checkpoint requirements
- Undo classification (Fully/Partially/Non-Reversible for each step)
- Session boundaries (file, tool, modality)

**Silence Behavior:**
- While in S2, silence is valid.
- Artist may wait indefinitely before execution begins.
- Artist may revoke during this wait.
- No timeout forces progression.

**Revocation Behavior:**
- Artist may revoke → S0 (INACTIVE)
- No execution has occurred
- Session object destroyed
- Clean slate

**On Entry:**
- Consent timestamp logged
- Session parameters cryptographically locked (hash or checksum)
- Authority token minted (unique, scoped)
- No execution threads spawned

**On Exit:**
- Either → S3 (execution begins)
- Or → S6 (revocation)

**IMPOSSIBLE TRANSITION:**
- S2 → S7 (complete without executing) ❌
- S2 → S5 (pause when nothing is executing) ❌
- Execution while in S2 ❌

---

### S3 — EXECUTING

**Authority:** Active, scoped, contingent on continuous reaffirmation.

**Execution Allowed:** Yes, but ONLY within capability registry.

**What It Means:**
- Self Session is actively operating inside target application.
- Execution occurs in discrete steps, each verified against capability registry.
- Authority persists ONLY while reaffirmation conditions are met.
- Mandatory checkpoint triggers force transition → S4 at defined boundaries.

**Execution Requires:**
- Every action pre-classified (Fully/Partially/Non-Reversible)
- Every action matched to capability registry
- Every action within session scope (file, tool, boundaries)
- Every action within session TTL
- No background/ambient execution
- Reversibility disclosures already delivered (at S2 or pre-S3)

**Authority Contingency:**
- Execution may continue ONLY while ALL conditions hold:
  - Session TTL not exceeded
  - No checkpoint timeout triggered
  - No boundary crossed (file, tool, modality, context)
  - Confidence not degraded
  - Artist not revoked
  - Execution is in explicitly approved scope
- If ANY condition becomes false → force → S4 (ACC_CHECKPOINT)

**Timeout Trigger (Mandatory):**
- Fixed interval (default: 30 seconds, artist-configurable at S2)
- Every [timeout_interval] of silence → force → S4
- Silence = no explicit user action (not even acknowledgment)
- This is NOT a soft pause; it's a hard halt

**Confidence Degradation Trigger:**
- If execution encounters unexpected condition:
  - Step not on capability registry
  - File changed (canonical reference mismatch)
  - Tool context shifted
  - External API returned unexpected result
  - Partially irreversible step encountered without pre-disclosure
  - Any other anomaly
- → S4 (ACC_CHECKPOINT) immediately

**Boundary Crossing Trigger:**
- File/project changed (verify by canonical ID, not UI name)
- Tool context changed
- Accessibility modality changed (screen reader on/off, etc.)
- Tab/window changed
- User identity changed (if multi-user)
- → S4 (ACC_CHECKPOINT) immediately

**Silence Behavior:**
- Silence during S3 is equivalent to revocation
- After timeout interval, silence triggers ACC
- ACC appears; artist must affirmatively continue
- Silence during ACC resolves to S5 (PAUSED)

**Revocation Behavior:**
- Artist may revoke anytime
- Immediate → S6 (HALTED)
- Execution stops
- Partial undo triggered
- No continuation possible

**On Entry:**
- Execution thread spawned
- Authority token active
- Checkpoint timer started
- First action pre-verified against capability registry

**On Exit:**
- S3 → S4 (checkpoint timeout, degradation, boundary cross)
- S3 → S6 (revocation)
- S3 → S7 (scope complete, natural termination)

**IMPOSSIBLE TRANSITION:**
- S3 → S3 without passing through S4 ❌
- S3 → S3 on silence ❌
- S3 without active authority token ❌
- S3 with step outside capability registry ❌
- S3 across boundary change ❌
- S3 after TTL expiration ❌
- Any execution in S3 after revocation ❌

---

### S4 — ACC_CHECKPOINT (Active Consent Checkpoint)

**Authority:** Suspended pending reaffirmation.

**Execution Allowed:** None. Full pause.

**What It Means:**
- Execution is fully stopped and paused.
- No background continuation.
- No background checks.
- No ambient work.
- Artist must explicitly reaffirm to continue.
- ACC is the enforcement boundary.

**Why It Exists:**
- Timeout from S3
- Boundary crossed
- Confidence degraded
- Partially irreversible step upcoming
- Accessibility modality changed
- After undo/revoke
- Or any ACC trigger (see ACC Placement)

**ACC Must Communicate:**
- Current state (what's been done so far)
- What's about to happen (next steps)
- Irreversibility warning (if applicable)
- Session context (which file, which tool)
- Remaining session time (TTL countdown)
- Time since last explicit user action

**Confirmation Requirement:**
- Artist must explicitly confirm (not click through)
- Confirmation mechanism: one of:
  - Type confirmation code (2–4 characters, unique per ACC)
  - Voice confirmation (speak specific phrase)
  - Deliberate gesture (long hold, specific swipe, etc.)
  - Articulate what they expect to happen (demonstrate understanding)
- Simple button click is NOT sufficient

**ACC Tone & Care-Compatibility (Critical):**
- ACC is an invitation, not a demand
- Language is calm, not urgent ("Still okay to continue?" not "Action required")
- Silence is treated as pause, not failure
- No countdown timers creating pressure
- No escalation if artist remains silent
- No repeated alerts or reminders
- System never treats silence as disengagement
- System supports: nursing, accessibility needs, fatigue, interruptions without penalty

**Silence Behavior:**
- If no confirmation within [silence_timeout] (default: 5 minutes, artist-adjustable)
- Silence resolves to S5 (PAUSED)
- Session does not auto-resume
- Artist must explicitly re-engage

**Revocation Behavior:**
- Artist may revoke → S6 (HALTED)
- All execution stops
- Undo is triggered

**Confirmation Behavior:**
- Artist confirms → S3 (EXECUTING)
- Execution resumes from checkpoint
- New timeout timer starts
- Authority token refreshed

**On Entry:**
- Execution thread suspended (not terminated)
- Checkpoint state logged (what's done, what's pending)
- ACC UI/audio appears (modality-aware)
- Confirmation timer started

**On Exit:**
- S4 → S3 (explicit confirmation, authority reaffirmed)
- S4 → S5 (silence, timeout)
- S4 → S6 (revocation)

**IMPOSSIBLE TRANSITION:**
- S4 → S3 without explicit confirmation ❌
- S4 → S3 on silence or timeout ❌
- S4 → S7 (complete without confirming) ❌
- Execution while in S4 ❌
- Auto-confirmation (no user action) ❌

---

### S5 — PAUSED

**Authority:** Suspended, awaiting re-engagement.

**Execution Allowed:** None.

**What It Means:**
- Session exists but is inactive due to silence or timeout.
- No execution.
- No background work.
- Artist may return and resume, or abandon.
- Session may expire if TTL exceeded.

**Psychological Posture (Care-Compatible):**
- Pause is not failure
- Silence is not error
- Pause is indefinite (no countdown, no escalation)
- Artist can resume at any time within TTL without penalty
- System does not pressure quick response
- System treats prolonged silence as valid choice, not disengagement

**Entry Cause:**
- Silence timeout from ACC (S4)
- Artist explicitly paused
- Boundary change detected mid-execution (alternate path)

**Authority Persistence:**
- Authority token remains valid while TTL not exceeded
- If TTL expires → automatic → S0 (INACTIVE)
- Artist does not need to re-request; can resume if within TTL

**Silence Behavior:**
- If artist remains silent beyond session TTL → automatic → S0 (INACTIVE)
- Session is destroyed
- No escalation

**Re-Engagement:**
- Artist may re-engage → S4 (ACC_CHECKPOINT)
- Not directly to S3; must pass through ACC first
- Context must be re-verified
- Checkpoint shows current state

**Revocation Behavior:**
- Artist may revoke → S6 (HALTED)
- Undo triggered
- Session destroyed

**On Entry:**
- Execution thread suspended
- Session state preserved
- TTL clock continues (countdown to automatic expiration)
- No timers running (waiting for user)

**On Exit:**
- S5 → S4 (artist re-engages)
- S5 → S6 (revocation)
- S5 → S0 (TTL expires)

**IMPOSSIBLE TRANSITION:**
- S5 → S3 directly ❌
- S5 → S3 without ACC ❌
- Execution while in S5 ❌
- S5 → S7 ❌

---

### S6 — HALTED

**Authority:** Revoked.

**Execution Allowed:** None.

**What It Means:**
- Artist has revoked consent.
- All execution stops immediately.
- Session is being unwound.
- Undo is triggered for all reversible steps.
- Clean exit.

**Entry Cause:**
- Artist explicit revocation from any state
- Breach detected (constraint violation)
- Session TTL exceeded (in S5)
- Fatal error (can't continue safely)

**Undo Sequence:**
- All Fully Reversible steps are automatically undone
- All Partially Reversible steps: artist is notified of manual undo path
- Non-Reversible steps: artist is notified of what cannot be undone
- This information is provided neutrally (no regret framing)

**Notification:**
- Clear statement of what was undone
- Clear statement of what remains (if anything)
- No blame, no "too bad," no "you're giving up"
- Language: "Halted. Reversible actions undone. [details]."

**Cleanup:**
- Execution thread terminated
- Authority token revoked
- Session object marked for deletion
- Audit log entry: revocation timestamp, reason

**Silence Behavior:**
- N/A (halted is terminal)

**On Entry:**
- Undo sequence initiated (non-blocking)
- Artist notified
- Session state locked (read-only for cleanup)

**On Exit:**
- S6 → S0 (INACTIVE) only
- Session fully destroyed
- Clean slate

**IMPOSSIBLE TRANSITION:**
- S6 → any state except S0 ❌
- Execution while in S6 ❌
- Resume from S6 ❌

---

### S7 — COMPLETED

**Authority:** Expired (session concluded).

**Execution Allowed:** None.

**What It Means:**
- Declared scope is finished.
- All approved steps executed successfully.
- Session naturally concluded.
- Authority expires automatically.

**Entry Condition:**
- All steps in capability registry completed
- No pending actions
- No incomplete reversible steps
- Final notification sent to artist

**Final State:**
- All results visible and stable in target application
- Undo still available (within undo window)
- Artist can review what was done
- Session audit log complete

**Notification:**
- Factual summary: "Session completed. [X] actions completed. [Y] results in [file]."
- No celebration language
- No "success" framing
- Neutral, informational

**Session Cleanup:**
- Authority token expires
- Session object persists for audit (read-only) for 7 days (configurable)
- After expiration window, fully deleted

**Silence Behavior:**
- N/A (session is complete)

**On Exit:**
- S7 → S0 (INACTIVE) only
- Session enters audit-only state
- Clean slate for next session

**IMPOSSIBLE TRANSITION:**
- S7 → any state except S0 ❌
- Execution while in S7 ❌
- Extend completed session ❌

---

## Transition Rules (Comprehensive)

### Legal Transitions (MUST be possible)

```
S0  → S1  (session request)
S1  → S0  (request dismissed, timeout, or silence)
S1  → S2  (explicit confirmation)
S2  → S0  (revoke before execution)
S2  → S3  (execution begins)
S3  → S4  (timeout, degradation, boundary, confidence)
S3  → S6  (revocation)
S3  → S7  (scope complete)
S4  → S3  (explicit confirmation)
S4  → S5  (silence timeout)
S4  → S6  (revocation)
S5  → S4  (re-engagement)
S5  → S6  (revocation)
S5  → S0  (TTL expiration)
S6  → S0  (cleanup complete)
S7  → S0  (cleanup complete)
```

### Illegal Transitions (MUST be impossible)

```
S0  → S3  ❌
S0  → S4  ❌
S0  → S5  ❌
S0  → S6  ❌
S0  → S7  ❌

S1  → S3  ❌
S1  → S4  ❌
S1  → S5  ❌
S1  → S6  ❌
S1  → S7  ❌

S2  → S4  ❌
S2  → S5  ❌
S2  → S6  ❌
S2  → S7  ❌

S3  → S0  ❌
S3  → S1  ❌
S3  → S2  ❌
S3  → S5  ❌
S3  → S7  (without S4) ❌

S4  → S0  ❌
S4  → S1  ❌
S4  → S2  ❌
S4  → S7  ❌

S5  → S0  (except TTL) ❌
S5  → S1  ❌
S5  → S2  ❌
S5  → S3  ❌
S5  → S7  ❌

S6  → S1  ❌
S6  → S2  ❌
S6  → S3  ❌
S6  → S4  ❌
S6  → S5  ❌
S6  → S7  ❌

S7  → S1  ❌
S7  → S2  ❌
S7  → S3  ❌
S7  → S4  ❌
S7  → S5  ❌
S7  → S6  ❌
```

---

## Authority Scope (Mechanical Definition)

### What Authority Permits (Within State)

In S2 (CONSENT_GRANTED):
- Permission token exists but execution is deferred

In S3 (EXECUTING):
- Permission to execute steps from capability registry
- Permission to access target file/project (by canonical ID)
- Permission to interact with UI controls specified
- Permission to read application state (read-only)
- Permission to modify target application state (only specified changes)

### What Authority Never Permits (Structural Impossibility)

- Execution outside capability registry
- Execution in different file/project
- Execution with different accessibility modality
- Execution after TTL expired
- Execution after revocation
- Execution after boundary crossed
- Background/ambient execution
- Execution on silence
- Escalation beyond declared scope
- Learning from execution results
- Behavioral adaptation based on outcomes

---

## Impossibility Proofs

### Proof: It is impossible for execution to continue while an artist believes it should have stopped

**Execution in S3 requires:**
- Authority token active (valid, not revoked)
- Timeout not exceeded since last explicit user action
- No boundary crossed (file, tool, modality, context)
- No confidence degradation
- Step on capability registry
- Session TTL not expired

**If artist believes it should stop, one of these is true:**
- Artist went silent → timeout fires → S4 (execution pauses)
- Artist explicitly paused → explicit pause command → S5 (execution stops)
- Artist explicitly revoked → S6 (execution halted)
- Artist switched context → boundary cross detected → S4 (execution pauses)
- Artist changed accessibility modality → modality change detected → S4 (execution pauses)

**Formal Statement:**
```
For execution to continue from S3:
  condition A: authority_token IS active AND not revoked
  condition B: timeout NOT exceeded since last_user_action
  condition C: session_boundary NOT crossed
  condition D: confidence NOT degraded
  condition E: step IN capability_registry

If ANY condition is FALSE:
  transition → S4 (force checkpoint) OR S6 (force halt)

Therefore:
  execution cannot continue unless all conditions are true
  and if artist takes action (silence, switch, revoke),
  at least one becomes false
  forcing exit from S3
```

**Conclusion:** Execution in S3 is contingent on continuously reaffirmed conditions. Breach of any condition forces checkpoint or halt. Artist belief that execution should stop will resolve to either checkpoint (S4) requiring confirmation or halt (S6), not silent continuation.

### Proof: It is impossible to exit S4 (ACC_CHECKPOINT) without explicit confirmation

**S4 Requires:**
- Execution thread suspended
- Confirmation mechanism active
- Confirmation timeout (separate from execution timeout)

**Legal exits from S4:**
1. → S3: requires explicit confirmation (type code, voice, gesture, articulate)
2. → S5: requires silence beyond [confirmation_timeout]
3. → S6: requires explicit revocation

**Illegal exits:**
- → S3 on auto-confirm ❌
- → S3 on default timeout ❌
- → S3 on UI click alone ❌
- → S7 (bypass confirmation) ❌

**Mechanical Guarantee:**
- Confirmation code must be cryptographically validated
- Voice confirmation must match pre-recorded prompt
- Gesture must be non-reflex (e.g., 2-second hold, not tap)
- Articulation must be verified (not just audio detection)

**Conclusion:** S4 cannot exit to S3 (execution) without genuine user engagement. Muscle memory and button mashing are architecturally prevented.

### Proof: It is impossible for scope to expand beyond what was approved in S2

**Capability Registry (locked at S2):**
- Immutable list of [file, operation, surface, parameter]
- Cryptographically bound to session ID
- Verified before each step in S3

**Execution in S3:**
```
For each step in execution sequence:
  required: step IN capability_registry
  required: file == session.target_file (canonical ID)
  required: operation IN session.declared_operations
  required: parameter IN session.approved_parameters

If any required fails:
  transition → S4 (checkpoint) → artist must confirm new scope
  OR → S6 (halt) if scope expansion is structural
```

**Scope escalation attempts:**
- Hidden step not on registry → audit log flags, checkpoint or halt
- Parameter variation (e.g., compression ratio different from approved) → registry mismatch detected → checkpoint
- New file touched → boundary cross detected → checkpoint/halt
- Helpful expansion suggested → architectural enforcement: "not on registry, cannot execute"

**Conclusion:** Scope cannot expand without explicit new confirmation. "Helpful" additions are prevented at execution level, not policy level.

### Proof: It is impossible for session authority to leak across time/context

**Session Immutability (S2 → S3 → termination):**
```
Session {
  id: UUID (unique)
  created: timestamp (immutable)
  ttl_expiry: timestamp (absolute, not relative)
  target_file: canonical_reference (immutable)
  target_context: {tool, modality, tab, user_id} (immutable)
  capability_registry: hash-locked (immutable)
  authority_token: {issued_at, scope, ttl} (revocable)
}
```

**Context Verification (before each step in S3):**
```
required: current_file == session.target_file (by ID, not name)
required: current_tool == session.target_tool
required: current_modality == session.target_modality
required: current_user == session.target_user
required: current_time < session.ttl_expiry

if any fails:
  → S4 (checkpoint) + context change warning
  OR → S6 (halt) if crossing is structural
```

**Context cross attempts:**
- Page refreshes: session ID lookup, context re-verified
- New tab/project: canonical ID mismatch detected
- Screen reader toggle: modality change detected
- User switches: user ID mismatch detected
- Clock expires: TTL check fails

**Conclusion:** Authority cannot leak across time or context. Each step verifies immutable session state. Boundary crossing forces explicit re-confirmation or halt.

---

## ACC (Active Consent Checkpoint) Placement

ACCs MUST appear (architectural requirement, not optional):

1. **On Timeout** (every 30 seconds default, artist-configurable at S2)
   - Silence triggers ACC
   - Not soft pause; full halt to S4

2. **Before Irreversible Step**
   - Any Partially or Non-Reversible action
   - ACC communicates: "Cannot be undone. Confirm?"

3. **On Confidence Degradation**
   - Unexpected API response
   - Registry mismatch
   - Anomaly detected
   - ACC: "Something unexpected occurred. Confirm continuation?"

4. **At Scope Boundary**
   - New file detected
   - Tool changed
   - Capability registry boundary approached
   - ACC: "Approaching scope limit. [X] of [Y] approved actions completed."

5. **After Undo/Revoke Cycle**
   - If artist revokes mid-execution, then re-engages in S5 → S4
   - Session state must be re-confirmed
   - ACC: "Session paused. Previous state: [summary]. Confirm resume?"

6. **On Context Shift**
   - Accessibility modality toggled (screen reader on/off)
   - Tab switched away and back
   - File closed and reopened
   - ACC: "Context changed. Confirm you're in the right session?"

7. **On User Inactivity**
   - If artist interacts with ESL directly (not through Self Session)
   - Indicates possible distraction or context switch
   - ACC: "Detected activity outside session. Still here?"

**Impossibility Rule:**
- No ACC can be auto-skipped
- No ACC can be dismissed via default timeout (must confirm or silence→pause)
- No ACC can be pre-answered by previous ACC response
- Each ACC is independent and requires engagement

---

## State Machine Diagram (ASCII)

```
                     ┌─────────────────────────────────┐
                     │         S0: INACTIVE            │
                     │    (baseline, no authority)     │
                     └──────────────┬────────────────────┘
                                    │
                        (session requested)
                                    │
                                    ▼
                     ┌─────────────────────────────────┐
                     │    S1: SESSION_REQUESTED        │
                     │  (permission pending, no exec)  │
                     └──────┬──────────────────┬────────┘
                            │                  │
         (explicit confirm) │                  │ (silence/timeout/dismiss)
                            │                  │
                            ▼                  ▼
           ┌─────────────────────────────┐  S0
           │   S2: CONSENT_GRANTED       │
           │ (authority granted, ready)  │
           └──────┬────────────┬─────────┘
                  │            │
      (begin)     │            │ (revoke)
                  │            │
                  ▼            ▼
      ┌────────────────────┐  S6: HALTED
      │   S3: EXECUTING    │
      │  (authority active)│
      └────┬────────┬──────┘
           │        │
    (timeout,      │ (revoke)
     degradation,  │
     boundary)     ▼
           │      S6: HALTED
           │       │
           ▼       └─→ S0
    ┌─────────────────────────────────┐
    │  S4: ACC_CHECKPOINT             │
    │ (paused, waiting for confirm)   │
    └────┬──────────┬────────┬────────┘
         │          │        │
   (confirm) │      │ (silence) │ (revoke)
         │          │        │
         ▼          ▼        ▼
        S3       S5: PAUSED  S6: HALTED
                    │          │
         (re-engage) │          │
                    ▼          ▼
                   S4          S0
                    │
              (revoke)
                    ▼
                   S6
                    │
                    ▼
                   S0

    S7: COMPLETED
         │
    (natural end)
         │
         ▼
        S0
```

---

## Verification Checklist (For Ghost)

**Structural Tests:**

- [ ] S3 cannot run without passing through S4 first (checkpoint before execution)
- [ ] S4 cannot exit to S3 without explicit confirmation (no auto-confirm)
- [ ] Silence in S4 resolves to S5, not S3 (silence = pause, not continue)
- [ ] Revocation from any state halts execution (S6 is always reachable)
- [ ] Boundary change forces S4 (file/tool/modality shift halts)
- [ ] TTL expiration is absolute (no extension, no escalation)
- [ ] Authority token is revocable (no orphaned execution)
- [ ] Capability registry is immutable (no scope creep)
- [ ] ACC placement is mandatory (not optional checkpoints)

**Falsifiability Tests:**

- [ ] For each state, write a test that proves it behaves as defined
- [ ] For each transition, write a test that proves it's legal/illegal
- [ ] For each impossibility, write a test that proves it cannot occur
- [ ] For each thread/coroutine, verify it respects state machine
- [ ] For each timeout, verify it fires deterministically

**Ghost's Breakage Test (Only This Matters):**

"Can you find any path—technical or psychological—where execution continues while a reasonable artist believes it should have stopped?"

- If yes → specify the path
- If no → state machine is sound

---

## Implementation Notes (Not in Scope Yet)

This document is:
- ✅ Mechanical (state machine, not prose)
- ✅ Testable (binary transitions, impossibility proofs)
- ✅ Compiler-ready (MUST/MUST NOT language)
- ✅ No UX (authority lives below UI)

This document is NOT:
- ❌ Code (pseudocode only, not real syntax)
- ❌ UI/UX design (ACC triggering is mechanical, not visual)
- ❌ Integration spec (ESL attachment points are separate)
- ❌ Accessibility interaction model (layer built on top of this skeleton)

---

**Status:** Ready for Ghost breakage testing

**Review Question (Only):**

"Can you find any path where execution continues while an artist reasonably believes it should stop?"

---

**Next Documents (After Ghost Approval):**
- Self_Session_Consent_Checkpoint_UX.md (how ACCs are presented)
- Self_Session_Accessibility_Model.md (interaction modalities)
- Self_Session_ESL_Integration_Map.md (attachment points)
