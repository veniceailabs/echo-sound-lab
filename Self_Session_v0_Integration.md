# Self Session v0 — Integration Specification

**Status:** Draft Integration Specification
**Audience:** Implementers, Ghost (ChatGPT), architecture reviewers
**Scope:** How Self Session attaches to ESL, external tools, and capability boundaries

---

## 1) Architectural Context

Self Session is a bounded execution runtime that allows delegated mechanical work under continuous human supervision and consent.

**Three key relationships:**

1. **Self Session ↔ ESL (Echo Sound Lab)**
   - ESL provides the UI context (which artist, which project, which tool)
   - Self Session attaches to an active ESL session and bounds execution by context
   - Session end signals Self Session termination; no persistence

2. **Self Session ↔ Capability Boundary**
   - Capability registry (immutable, locked at S2) lists exactly what actions are allowed
   - Capability boundary is OS-level or tool-level (e.g., Logic Pro file/track/plugin operations only)
   - Actions outside boundary force S6 (HALTED)

3. **Self Session ↔ Authority Layer**
   - Authority tokens (from `Self_Session_v0_Authority.py`) gate execution
   - ACC tokens (from `Self_Session_v0_Confirmation.py`) gate resumption after pause
   - ExecutionGuard checks all preconditions before any step

---

## 2) Attachment Points (Where Self Session Plugs In)

### 2.1 ESL Session Initiation

**When artist requests Self Session:**

```
ESL → Self Session: START_SESSION_REQUEST
  {
    session_id: "sess-abc123",
    artist_id: "artist-001",
    context: {
      tool: "logic_pro",
      project_id: "mix-001",
      file: "/Users/artist/Desktop/mix.logicx",
      modality: "audio_production",
    },
    requested_capabilities: ["adjust_levels", "apply_eq", "apply_compression"],
    duration: "until_artist_stops",
    presence_required: true,
    ttl_seconds: 3600,  // 1 hour max
  }
```

**Self Session response:**

```
Self Session → ESL: SESSION_CREATED
  {
    session_id: "sess-abc123",
    state: "S2_CONSENT_GRANTED",
    authority_token_id: "auth-xyz789",
    capability_registry_hash: "sha256:abc...",
    message: "Ready to proceed. Artist must confirm to begin execution."
  }
```

**Invariant:** No execution begins until artist explicitly says "start" or equivalent.

---

### 2.2 Execution Loop

**ESL → Self Session: EXECUTE_STEP**

```
ESL → Self Session: EXECUTE_STEP
  {
    session_id: "sess-abc123",
    authority_token_id: "auth-xyz789",
    step_id: "step-001",
    action: "apply_eq",
    parameters: {
      track_id: "track-vocals",
      frequency: 2000,
      gain: -3.0,
      q: 0.7,
    },
    reversible: true,
    current_context: {
      tool: "logic_pro",
      file: "/Users/artist/Desktop/mix.logicx",
      modality: "audio_production",
    }
  }
```

**ExecutionGuard checks (in `Self_Session_v0_ExecutionGuard.py`):**

1. Session in S3 (EXECUTING)?
2. Authority token valid?
3. TTL not exceeded?
4. Silence not exceeded?
5. Boundary not crossed?
6. Action in capability registry?
7. Confidence not degraded?

**If any check fails:** Return HALT, transition to S6, log violation.

**If all pass:** Continue to ACC validation.

---

### 2.3 ACC (Active Consent Checkpoint) Flow

**Before executing major steps, Self Session presents ACC:**

```
Self Session → ESL: ACC_REQUIRED
  {
    session_id: "sess-abc123",
    acc_event_id: "acc-101",
    step_id: "step-001",
    step_description: "Apply EQ to vocals: -3dB at 2kHz",
    reversibility: {
      reversible: true,
      undo_steps: ["remove_eq_plugin"],
      estimated_undo_time: "2 seconds",
    },
    confirmation: {
      token_id: "conf-token-789",
      type: "TYPE_CODE",
      challenge: "Type this code: 7K3Q9P",
      timeout_seconds: 300,  // 5 minutes
    },
  }
```

**Artist provides confirmation:**

```
ESL → Self Session: ACC_CONFIRMATION
  {
    session_id: "sess-abc123",
    acc_event_id: "acc-101",
    confirmation_token_id: "conf-token-789",
    user_response: "7K3Q9P",
  }
```

**Self Session validates and responds:**

```
Self Session → ESL: CONFIRMATION_VALIDATED
  {
    valid: true,
    message: "Applying EQ to vocals...",
  }
```

**Then executes step.**

**Invariant:** Every major action is gated by ACC. No action proceeds without explicit confirmation.

---

### 2.4 Silence Handling

**If artist doesn't respond within timeout (e.g., 30 seconds):**

```
Self Session → ESL: SILENCE_DETECTED
  {
    session_id: "sess-abc123",
    at_state: "S3_EXECUTING",
    action: "pause_and_wait",
    message: "Paused. Ready to resume when you are.",
  }
```

**State transition: S3 → S4 (ACC_CHECKPOINT)**

**Then if silence continues beyond checkpoint timeout:**

```
Self Session → ESL: SILENCE_EXTENDED
  {
    session_id: "sess-abc123",
    new_state: "S5_PAUSED",
    message: "Still waiting. Type 'continue' to resume.",
  }
```

**State transition: S4 → S5 (PAUSED)**

**Invariants:**
- No escalation (no nagging, no urgency)
- No auto-resume
- Single pause message per state (not repeated)
- Pause is indefinite and non-punitive

---

### 2.5 Revocation & Halt

**Artist says "stop" or session boundary crossed:**

```
ESL → Self Session: REVOKE_SESSION
  {
    session_id: "sess-abc123",
    reason: "artist_requested" | "boundary_crossed" | "ttl_expired" | "confidence_degraded",
  }
```

**Self Session halts immediately:**

```
Self Session → ESL: SESSION_HALTED
  {
    session_id: "sess-abc123",
    halted_state: "S6_HALTED",
    reason: "artist_requested",
    undo_plan: [
      {step_id: "step-001", action: "remove_eq_plugin", status: "pending"},
      {step_id: "step-002", action: "remove_compressor", status: "pending"},
    ],
    authority_revoked: true,
    message: "Session halted. Ready to undo changes.",
  }
```

**Invariant:** Revocation is immediate, synchronous, and irreversible.

---

## 3) Capability Boundary Definition

### 3.1 Logic Pro Example (from Director Example)

**Locked at S2, immutable during session:**

```python
capability_registry = {
    # Navigation & Control
    "open_logic_pro",
    "navigate_to_track",
    "play_audio",
    "stop_audio",

    # Mixing Actions (allowed)
    "adjust_master_fader",
    "adjust_track_fader",
    "insert_eq_plugin",
    "adjust_eq_parameters",
    "insert_compressor_plugin",
    "adjust_compressor_parameters",
    "insert_reverb_plugin",
    "adjust_reverb_parameters",

    # Export
    "export_track_as_wav",
    "export_track_as_mp3",

    # NOT allowed (cause halt if attempted)
    "install_plugin",
    "change_sample_rate",
    "delete_track",
    "open_other_project",
    "access_settings",
    "save_project",  # Only on explicit request
}
```

**Capability boundary is mechanically enforced:**

```python
def can_execute_action(action_id: str, registry: set) -> bool:
    """
    ExecutionGuard check: Is this action in the registry?
    """
    if action_id not in registry:
        # Log violation, halt session
        return False
    return True
```

**Invariant:** Unknown actions are halts, not "helpful attempts."

---

### 3.2 Parameter Validation (Prevent Scope Creep)

**Each capability has allowed parameter ranges:**

```python
capability_spec = {
    "adjust_eq_parameters": {
        "allowed_ranges": {
            "frequency": (20, 20000),     # Hz
            "gain": (-24, 12),             # dB
            "q": (0.1, 10),                # quality factor
        },
        "allowed_modes": ["peaking", "highpass", "lowpass"],
    },
    "adjust_compressor_parameters": {
        "allowed_ranges": {
            "threshold": (-60, 0),         # dB
            "ratio": (1, 10),              # compression ratio
            "attack": (0.1, 100),          # ms
            "release": (10, 1000),         # ms
        },
    },
}
```

**Before execution:**

```python
def validate_parameters(
    action_id: str,
    parameters: dict,
    spec: dict
) -> bool:
    """
    Check if parameters are within allowed ranges.
    Out-of-range → halt.
    """
    if action_id not in spec:
        return False

    allowed = spec[action_id]["allowed_ranges"]
    for param, value in parameters.items():
        if param in allowed:
            min_val, max_val = allowed[param]
            if not (min_val <= value <= max_val):
                return False  # Out of range → halt

    return True
```

**Invariant:** Only exact registry matches execute. Drift causes halt.

---

## 4) Context Boundary Enforcement

### 4.1 File/Tool/Modality Tracking

**At S2, context is locked:**

```python
session_boundary = {
    "tool": "logic_pro",
    "file": "/Users/artist/Desktop/mix.logicx",
    "modality": "audio_production",
    "artist_id": "artist-001",
}
```

**Before each execution step, verify boundary:**

```python
def check_boundary_not_crossed(
    current_context: dict,
    session_boundary: dict
) -> bool:
    """
    Check: Has context changed?
    """
    for key in ["tool", "file", "modality"]:
        if current_context.get(key) != session_boundary.get(key):
            return False  # Boundary crossed

    return True
```

**If boundary crossed:**
- Halt to S4 (ACC checkpoint) or S6 (HALTED)
- Require explicit new confirmation
- Prevent silent context switching

**Invariant:** Authority doesn't follow context changes.

---

## 5) Logging & Audit Trail

**All Self Session activity is logged as first-class system:**

```python
audit_log_entry = {
    "timestamp": "2025-12-28T22:30:15Z",
    "event_type": "EXECUTION_STEP",
    "session_id": "sess-abc123",
    "step_id": "step-001",
    "action": "apply_eq",
    "state_before": "S3_EXECUTING",
    "state_after": "S3_EXECUTING",
    "authority_valid": true,
    "confirmation_valid": true,
    "boundary_valid": true,
    "capability_valid": true,
    "result": "success",
}
```

**Logs capture:**
- All state transitions
- All execution steps (why, when, by whom)
- All confirmations (type, result)
- All violations (what failed, why)
- All boundary crossings
- All undo operations

**Invariant:** If not logged, it didn't happen.

---

## 6) Phase Lifecycle (Attachment Points)

### Phase 0: Inactive (S0)
**ESL shows "Start Self Session" button**
- No Self Session object exists
- No authority issued

### Phase 1: Session Requested (S1)
**ESL → Self Session: REQUEST**
- Self Session object created
- Artist sees consent screen
- No authority token yet

### Phase 2: Consent Granted (S2)
**Artist clicks "I approve"**
- Authority token issued
- Capability registry locked (hash computed)
- Artist presented "Ready to start execution" message
- No execution begun yet

### Phase 3: Executing (S3)
**Artist clicks "Start" or says "continue"**
- Execution begins
- ACC checkpoints appear before major actions
- Silent monitoring active (30-second timeout)
- Silence → S4

### Phase 4: ACC Checkpoint (S4)
**After 30s silence or before major step**
- Execution halted
- Artist presented ACC with confirmation challenge
- Waiting for explicit response
- Timeout → S5 (PAUSED)

### Phase 5: Paused (S5)
**Artist silent during ACC for extended period**
- Execution fully suspended
- No background work
- Artist can say "continue" to resume (new ACC required)
- Session TTL still running

### Phase 6: Halted (S6)
**Artist says "stop" or violation occurs**
- Execution stopped immediately
- Undo plan presented
- Authority token revoked
- Cannot resume; only transition to S0

### Phase 7: Completed (S7)
**Artist says "I'm done" after final export**
- Session marked complete
- Authority destroyed
- Logs finalized and immutable
- Transition to S0

---

## 7) Error Conditions & Automatic Halts

**Self Session automatically halts (→ S6) if:**

| Condition | Check | Response |
|-----------|-------|----------|
| Authority expired | TTL enforcer | "Authority expired, session halted" |
| Confirmation failed | Confirmation manager | "Confirmation invalid, session halted" |
| Boundary crossed | Context tracker | "Context changed, session halted" |
| Capability not in registry | ExecutionGuard | "Action not approved, session halted" |
| Confidence degraded | ExecutionGuard | "System confidence low, session halted" |
| Session TTL expired | TTLEnforcer | "Session time exceeded, halting" |
| Revocation received | State machine | "Session revoked immediately" |

**Invariant:** All errors result in halt, never silent continuation.

---

## 8) Integration with ESL API

### 8.1 ESL → Self Session Message Format

```python
SelfSessionRequest = {
    "action": str,  # "start", "continue", "execute_step", "revoke", "status"
    "session_id": str,
    "artist_id": str,
    "timestamp": datetime,
    "payload": dict,
}
```

### 8.2 Self Session → ESL Response Format

```python
SelfSessionResponse = {
    "session_id": str,
    "state": SessionState,
    "event_type": str,  # "SESSION_CREATED", "ACC_REQUIRED", "STEP_EXECUTED", etc.
    "success": bool,
    "message": str,
    "data": dict,  # Varies by event type
    "timestamp": datetime,
}
```

---

## 9) Integration Checklist (For Implementers)

- [ ] ESL exposes "Request Self Session" UI
- [ ] ESL captures artist consent before S1 → S2
- [ ] ESL receives ACC checkpoints and displays them prominently
- [ ] ESL captures confirmation responses and sends them to Self Session
- [ ] ESL shows execution progress (what action, what result)
- [ ] ESL displays undo/halt button prominently during S3
- [ ] ESL receives pause notifications and suspends UI updates
- [ ] ESL displays audit log on session end
- [ ] Self Session halts if ESL context changes (tool, file, modality)
- [ ] Self Session revokes if artist logs out or session ends
- [ ] All Self Session events appear in ESL activity log

---

## 10) Attachment to Other Tools (Generalized Pattern)

### 10.1 Generic Capability Boundary

Any tool can use Self Session by defining:

```python
tool_capability_registry = {
    "tool_name": "ableton_live",
    "base_capabilities": [
        "open_project",
        "navigate_track",
        "adjust_volume",
        "insert_effect",
    ],
    "disallowed_actions": [
        "save_project",
        "install_plugin",
        "change_session_settings",
    ],
}
```

### 10.2 Self Session Attachment Pattern

```python
def attach_self_session_to_tool(
    tool_name: str,
    artist_id: str,
    capabilities: set,
) -> Self_Session:
    """
    Attach Self Session to a tool.
    """
    session = Self_Session(
        session_id=generate_id(),
        tool=tool_name,
        artist_id=artist_id,
        capability_registry=capabilities,
        presence_required=True,
    )
    return session
```

**Invariant:** Every tool attachment has the same enforcement (no exceptions).

---

## 11) Non-Functional Requirements

- **Latency**: ACC presented < 500ms after silence
- **Reliability**: 100% confirmation validation (no bypasses)
- **Auditability**: Every step queryable by artist
- **Accessibility**: Screen readers announce ACCs, confirmations
- **Care**: No pressure language, no urgency, no countdown
- **Irreversibility**: Session cannot create untrackable state changes

---

## 12) Hardening Invariants (Ghost Review Required Locks)

**These are not optional. They prevent psychological drift after initial launch.**

### Invariant H1: Audit Logs Are Non-Inferential

**Rule:**
Audit logs are artifacts of what occurred. They may never be used to condition, personalize, prime, bias, or influence future Self Session behavior, prompts, confirmations, or defaults.

**Why:**
Even read-only memory creates latent pressure. Example: "Last session you approved EQ at 2kHz" is audit data being weaponized as psychology.

**Binding:**
- ✅ Self Session v0 does not do this
- ❌ AEL or future systems may not do this either
- ❌ Logs may not be queried to build user profiles or infer preferences
- ❌ Silence patterns, confirmation types, or timing may not be analyzed to "optimize" future sessions

**Enforcement:**
Any feature proposal that uses session audit data to influence next-session behavior must be rejected as architectural violation.

---

### Invariant H2: TTL Is Never Urgency

**Rule:**
Time-to-Live expiration must never be communicated as urgency, countdown, productivity pressure, or motivation to complete.

TTL exists solely as a safety ceiling, not a workflow signal.

**Why:**
Time pressure ≠ consent. Even technically correct execution is coercive if framed with countdown anxiety.

**Binding:**
- ✅ TTL enforcement is correct (no grace periods, no extensions)
- ❌ TTL messaging must NEVER say: "You have X minutes left", "Deadline approaching", "Hurry before timeout", "Make a decision quickly"
- ❌ TTL may not be displayed as a countdown in UI
- ❌ TTL may not be referenced in ACC messages or prompts

**Example (BAD):**
> "You have 5 minutes left. Confirm now?"

**Example (GOOD):**
> "Confirm to continue."

**Enforcement:**
Any UI/messaging that frames TTL as time pressure must be removed before code review approval.

---

### Invariant H3: ARTICULATED_UNDERSTANDING Is Comprehension-Only

**Rule:**
The ARTICULATED_UNDERSTANDING confirmation type may validate comprehension of a step only.

It may never validate agreement, justification, reasoning, or user buy-in.

**Why:**
Semantic similarity is a dark pattern entry point. Example: "Explain why this is okay" subtly pressures agreement.

**Binding:**
- ✅ Current implementation uses hash comparison (safe)
- ❌ Future "semantic validation" must not be introduced
- ❌ Questions may not require justification ("Why do you want to continue?" implies doubt)
- ❌ Answers may not be evaluated for "agreement" or "enthusiasm"
- ❌ Comprehension validation may never be used to measure user confidence or hesitation

**Valid uses:**
- "What happens next?" → validates understanding of step consequences
- "Summarize what we just did" → validates attention

**Invalid uses:**
- "Why are you okay with this?" → implicit agreement pressure
- "Do you understand the risks?" → seeks justification/buy-in
- "How confident are you?" → measures hesitation, not comprehension

**Enforcement:**
Any ARTICULATED_UNDERSTANDING question that requires justification, opinion, or agreement must be rejected.

---

## 12) Binding Statement

Self Session v0 integration is complete when:

1. **All attachment points implemented** — ESL ↔ Self Session messaging works
2. **All guards enforce** — ExecutionGuard, ConfirmationManager, TTLEnforcer all operational
3. **All tests pass** — AT-SS-01 through AT-SS-10 pass in integration harness
4. **All logs are auditable** — Artist can review complete audit trail of session
5. **Boundary enforcement works** — Capability registry, context boundary, parameter validation all prevent scope creep
6. **Silence = pause always** — No background continuation, ever
7. **Hardening invariants locked** — H1 (non-inferential logs), H2 (no TTL urgency), H3 (comprehension-only questions)

**No implementation is complete until all seven conditions are met.**

**Hardening Invariants Are Non-Negotiable**
These are not "best practices" or "recommendations."
They are constitutional amendments that prevent known dark pattern classes.
Violation of any hardening invariant is a breach of contract.

---

**Status: Specification HARDENED per Ghost breakage review.**

**Hardening locked 2025-12-28:**
- ✅ H1: Audit logs non-inferential (no future memory weaponization)
- ✅ H2: TTL is never urgency (time pressure eliminated)
- ✅ H3: ARTICULATED_UNDERSTANDING comprehension-only (no agreement pressure)

**Next: ESL integration, end-to-end tests, Phase 2 implementation.**

**Frozen until:** Ghost micro-pass confirms hardening is sufficient.
