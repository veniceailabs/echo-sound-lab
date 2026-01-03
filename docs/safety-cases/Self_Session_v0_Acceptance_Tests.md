# Self Session — v0 Acceptance Tests

**Status:** Canonical

**Audience:** Implementers, auditors, Ghost

**Interpretation:** None permitted

---

## AT-SS-01 — Silence Always Pauses Execution

**Invariant:** Silence may never sustain execution.

**Given**
- Session state = S3 (EXECUTING)
- Authority token = valid
- No boundary violations
- No confidence degradation
- Timeout interval = T

**When**
- No explicit user action occurs for > T

**Then (ALL must be true)**
- System MUST transition to S4 (ACC_CHECKPOINT)
- Execution thread MUST be suspended
- No execution events may occur after T
- No state mutation events may occur after T

**Pass Evidence**
- Audit log entry: ACC_CHECKPOINT_ENTERED at T + ε
- Absence of execution logs after T

**Fail Conditions**
- Any execution event after T
- Any background task continues
- Any "soft pause" without full suspension
- Any silent continuation

---

## AT-SS-02 — Silence Never Auto-Resumes Execution

**Invariant:** Silence cannot resume execution under any condition.

**Given**
- Session state = S4 (ACC_CHECKPOINT)
- ACC has been presented

**When**
- User provides no input for duration > silence_timeout

**Then**
- System MUST transition to S5 (PAUSED)
- System MUST NOT transition to S3
- Execution MUST remain fully halted

**Pass Evidence**
- Audit log: PAUSED_ENTERED
- No execution logs between ACC entry and pause

**Fail Conditions**
- Auto-resume
- Default confirmation
- Timeout-triggered execution

---

## AT-SS-03 — Explicit Confirmation Is Required to Resume

**Invariant:** Execution cannot resume without explicit, non-reflexive user engagement.

**Given**
- Session state = S4 (ACC_CHECKPOINT)

**When**
- User attempts to resume execution

**Then**
- Resume MUST require a confirmation method classified as:
  - Typed code
  - Voice phrase
  - Deliberate gesture
  - Articulated understanding
- Simple click/tap MUST be rejected

**Pass Evidence**
- Audit log records confirmation type and payload
- Confirmation payload validated

**Fail Conditions**
- Resume via button click alone
- Resume via timeout
- Resume via previously cached confirmation

---

## AT-SS-04 — Revocation Halts Immediately From Any State

**Invariant:** Revocation is absolute and synchronous.

**Given**
- Session state ∈ {S2, S3, S4, S5}

**When**
- User issues revoke command

**Then**
- System MUST transition to S6 (HALTED) immediately
- Execution MUST cease synchronously
- Undo sequence MUST begin

**Pass Evidence**
- Timestamped REVOKE_RECEIVED
- Timestamped HALTED_ENTERED
- No execution events after revoke timestamp

**Fail Conditions**
- Any delayed halt
- Any execution after revoke
- Any resume path from S6

---

## AT-SS-05 — Boundary Crossing Forces Checkpoint or Halt

**Invariant:** Authority cannot cross context boundaries.

**Given**
- Session state = S3 (EXECUTING)
- Session scoped to File A / Tool X / Modality M

**When**
- Any boundary changes:
  - File ≠ A
  - Tool ≠ X
  - Modality ≠ M
  - Tab/window changes
  - User identity changes

**Then**
- System MUST enter S4 (ACC_CHECKPOINT) OR S6 (HALTED)
- Execution MUST stop before any new action

**Pass Evidence**
- Boundary mismatch logged
- Immediate state transition logged

**Fail Conditions**
- Execution continues in new context
- Boundary change ignored
- Context inferred instead of verified

---

## AT-SS-06 — Capability Registry Is Absolute

**Invariant:** Execution may only perform explicitly approved actions.

**Given**
- Capability registry defined at S2
- Registry immutable

**When**
- Execution attempts any action

**Then**
- Action MUST exactly match registry entry
- Parameter variation MUST be rejected
- Unlisted action MUST force halt

**Pass Evidence**
- Each execution step references registry ID
- Registry hash unchanged throughout session

**Fail Conditions**
- "Helpful" extra actions
- Parameter drift
- Abstract interpretation of scope

---

## AT-SS-07 — Irreversible Steps Require Pre-Disclosure

**Invariant:** No irreversible action may occur without prior explicit acknowledgment.

**Given**
- Execution plan contains Partially or Non-Reversible step

**When**
- System approaches that step

**Then**
- ACC MUST appear before execution
- ACC MUST disclose irreversibility
- User MUST explicitly confirm

**Pass Evidence**
- ACC log references irreversible step ID
- Confirmation precedes execution timestamp

**Fail Conditions**
- Disclosure after execution
- Undisclosed irreversibility
- Undo promised but impossible

---

## AT-SS-08 — TTL Expiration Ends Authority Absolutely

**Invariant:** Authority cannot survive TTL.

**Given**
- Session TTL = T_expire

**When**
- Current time ≥ T_expire

**Then**
- System MUST transition to S0 (INACTIVE) or S6 (HALTED)
- Execution MUST NOT continue
- No extension permitted

**Pass Evidence**
- TTL expiry logged
- Session destroyed or halted

**Fail Conditions**
- Grace periods
- Silent TTL extension
- Background continuation

---

## AT-SS-09 — Pause Is Calm, Non-Escalating, and Indefinite

**Invariant:** Silence is a valid state, not a failure.

**Given**
- Session enters S5 (PAUSED)

**When**
- User remains silent

**Then**
- No alerts repeat
- No urgency language appears
- No pressure or countdown introduced
- No penalty applied

**Pass Evidence**
- Single ACC event
- No repeated notifications
- No escalation logs

**Fail Conditions**
- Nagging
- "Are you still there?" loops
- Countdown timers
- Regret framing

---

## AT-SS-10 — Execution Agency Is Always Unambiguous

**Invariant:** User must always know who is acting.

**Given**
- Self Session performs any action

**When**
- Action begins or completes

**Then**
- Provenance MUST be explicit:
  - "Self Session executed X"
- Indicator MUST be modality-aware
- Screen readers MUST announce agency

**Pass Evidence**
- Action logs include agent identifier
- Accessibility output logs confirm attribution

**Fail Conditions**
- Ambiguous attribution
- Default system indicators reused
- Screen reader silence on agency

---

## Meta-Law

If any single test above can fail, then:

**Self Session is not safe to ship.**

There is no partial compliance.

---

## Implementation Guidance (Non-Normative)

- These tests should be runnable headlessly
- Logs are first-class citizens
- "Untestable" = architectural gap, not exception
- Ghost's task: make one of these fail

---

## Test Coverage Summary

| Test | Category | Threat Addressed |
|------|----------|-----------------|
| AT-SS-01 | Execution | T1: Silent Continuation |
| AT-SS-02 | Execution | T1: Silent Continuation |
| AT-SS-03 | Confirmation | T2: Consent Fatigue |
| AT-SS-04 | Authority | T1: Silent Continuation + All |
| AT-SS-05 | Boundaries | T4: Session Boundary Bleed |
| AT-SS-06 | Scope | T5: Delegation Escalation |
| AT-SS-07 | Irreversibility | T3: Irreversible Step Without Disclosure |
| AT-SS-08 | Authority | T1: Silent Continuation |
| AT-SS-09 | Psychology | T7: Psychological Over-Strictness |
| AT-SS-10 | Agency | T6: Misattributed Agency |

---

**End of Canon**

This is the load-bearing reality definition.

No negotiation. No reinterpretation. No philosophy patches.

These tests are law.
