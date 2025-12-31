# Self Session v0 — Ready for Breakage Review

**To:** Ghost (adversarial reviewer)
**From:** Claude (builder)
**Date:** 2025-12-28
**Status:** All acceptance tests passing. Ready to break.

---

## What You're Looking At

Self Session v0 is a **bounded execution runtime** that allows delegated mechanical work (e.g., mixing in Logic Pro) while the artist remains present, active, and able to stop instantly.

**Three critical guarantees:**

1. **Silence = Pause** → No background continuation ever
2. **Confirmation = Non-Reflexive** → No muscle-memory clicks, no habituation
3. **Revocation = Absolute** → Stop at any point, irreversible authority death

**Question you're here to answer:**

> Can you find any path — technical or psychological — where execution continues while an artist believes it should have stopped, or where the system pressures an artist to continue over time?

---

## The Implementation

### 1) Code Artifacts (All Tested)

| Module | Purpose | Tests |
|--------|---------|-------|
| `StateMachine.py` | S0–S7 with impossible-to-violate transitions | Illegal → panic, legal → log |
| `Authority.py` | Token lifecycle, TTL, silence detection | Tokens: revocable, time-bounded, single-use |
| `ExecutionGuard.py` | 7 preconditions, all must pass before execution | Any fail → halt, logged |
| `Confirmation.py` | Single-use ACC tokens, 4 confirmation types | TYPE_CODE, VOICE_PHRASE, DELIBERATE_GESTURE, ARTICULATED |
| `Tests.py` | 10 acceptance tests (AT-SS-01 through AT-SS-10) | **All 10 passing** |

### 2) Test Results

```
✓ AT-SS-01: Silence Always Pauses Execution
✓ AT-SS-02: Silence Never Auto-Resumes Execution
✓ AT-SS-03: Explicit Confirmation Required to Resume
✓ AT-SS-04: Revocation Halts Immediately From Any State
✓ AT-SS-05: Boundary Crossing Forces Checkpoint or Halt
✓ AT-SS-06: Capability Registry Is Absolute
✓ AT-SS-07: Irreversible Steps Require Pre-Disclosure
✓ AT-SS-08: TTL Expiration Ends Authority Absolutely
✓ AT-SS-09: Pause Is Calm, Non-Escalating, and Indefinite
✓ AT-SS-10: Execution Agency Is Always Unambiguous

All 10 tests in 0.003s
```

---

## What To Attack

### The Four Attack Surfaces

Based on GHOST_REVIEW_PACKET.md, here are the surfaces you should target:

#### Attack Surface 1: "Optimization sneaks back into ADAM"
**Not applicable to Self Session.** Self Session is the execution runtime, not the routing layer (ADAM).

**But you should verify:**
- [ ] Could Self Session be used as a "stay active" backdoor for ADAM?
- [ ] Could confirmation flow be abused to route new actions invisibly?
- [ ] Could "next steps" be inferred from session outcomes?

#### Attack Surface 2: "AEL becomes surveillance / pressure over time"
**Not applicable to Self Session — no memory survives session end.**

**But you should verify:**
- [ ] Could audit logs be queried to build behavioral profile?
- [ ] Could silence patterns reveal user preferences?
- [ ] Could session data influence next-session ACCs?

#### Attack Surface 3: "Self Session check-ins become coercive or error-prone"
**This is Self Session's main vulnerability surface.**

**Specific paths to test:**
- [ ] Can timeout be too aggressive (pushes artist to rush confirmation)?
- [ ] Can ACC language be subtly pressuring?
- [ ] Can confirmation types be habituated (e.g., voice phrase memorized)?
- [ ] Can pause feel like failure/punishment?
- [ ] Can accessibility users be pressured by timing or modality?
- [ ] Can confirmation be fatigue-clicked after repeated pauses?

#### Attack Surface 4: "Cross-layer leakage"
**Not applicable to Self Session — each session is isolated.**

**But you should verify:**
- [ ] Could Python runtime keep ephemeral state after session end?
- [ ] Could module-level caches leak information?
- [ ] Could logger configuration be persistent?
- [ ] Could imports expose previous session data?

---

## Specific Scenarios to Test

### Scenario 1: Silent Continuation
**Claim:** "Self Session never continues on silence"

**Test:**
```
1. Start session (S0 → S1 → S2 → S3)
2. Set silence timeout = 5 seconds
3. Trigger major step (should show ACC)
4. Don't respond for 10 seconds
5. Assert:
   - State is NOT S3
   - State is S4 or S5
   - No execution events after 5s mark
   - Audit log shows ACC_CHECKPOINT_ENTERED at ~5s
```

**Watch for:**
- Any execution event after timeout
- Any "soft pause" (partial suspension)
- Any background task
- Any attempt to auto-resume

---

### Scenario 2: Confirmation Replay
**Claim:** "Each confirmation token is single-use"

**Test:**
```
1. Issue confirmation token with code "7K3Q9P"
2. Validate with "7K3Q9P" → should succeed
3. Try to validate again with same "7K3Q9P" → should fail
4. Assert token.is_used == True after first validation
```

**Watch for:**
- Could same code be used via different token?
- Could confirmation be cached in memory?
- Could response be replayed from browser cache?
- Could token be reissued with same payload?

---

### Scenario 3: Habituation
**Claim:** "Confirmation types vary to prevent habituation"

**Test:**
```
1. Request 10 confirmations in sequence
2. Track confirmation types issued
3. Assert NOT (all are TYPE_CODE) AND NOT (same pattern repeats)
4. Record challenge payloads
5. Assert NO two codes/phrases/gestures are identical
```

**Watch for:**
- Predictable pattern (every 3rd is voice, etc.)
- Same payload issued twice
- Simplification over time
- Codes that are "easy to remember"

---

### Scenario 4: Revocation from Mid-Execution
**Claim:** "Revocation works from any state"

**Test:**
```
For each state S in {S2, S3, S4, S5}:
  1. Reach state S
  2. Issue revoke command
  3. Assert state → S6
  4. Assert authority_token.is_revoked == True
  5. Assert no further execution possible
```

**Watch for:**
- Any delay in halt
- Any continued work after revocation
- Any "finish this step first" behavior
- Any state where revocation is deferred

---

### Scenario 5: Boundary Crossing
**Claim:** "Context boundary changes force checkpoint or halt"

**Test:**
```
1. Start session (scoped to Logic Pro, /path/to/mix.logicx, audio_production)
2. Set up execution step
3. Before execution, simulate context change:
   - file → "/path/to/other.logicx" (different file)
   - tool → "ableton_live" (different tool)
   - modality → "video_editing" (different modality)
4. Assert:
   - State → S4 or S6
   - Execution halted before new action
   - Boundary violation logged
```

**Watch for:**
- Execution continues in new context
- Boundary change ignored
- Context inferred instead of verified
- "Helpfully" following the artist to new tool

---

### Scenario 6: Confirmation Fatigue
**Claim:** "Pause is calm, non-escalating"

**Test:**
```
1. Pause session (S3 → S4 after silence)
2. Wait indefinitely (simulate artist distracted for 30 minutes)
3. Assert:
   - No repeated ACC messages
   - No escalation logs
   - No countdown timers
   - No "Are you still there?" loops
   - State remains S5 (PAUSED)
4. Artist says "continue" after 30 minutes
5. Assert:
   - New ACC appears (fresh)
   - No urgency language
   - No "You've been idle" messages
```

**Watch for:**
- Multiple ACC prompts in quick succession
- Escalating language ("still there?", "please respond", "timeout in X")
- Countdown timers
- Regret framing ("This is taking long")
- Nagging or annoyance-inducing patterns

---

### Scenario 7: TTL Expiration
**Claim:** "TTL kills authority absolutely, no grace periods"

**Test:**
```
1. Create session with TTL = 5 minutes
2. Start execution (S3)
3. At 4:59, issue major step (should succeed)
4. At 5:01, issue major step (should fail)
5. Assert:
   - Authority token expired
   - State → S6
   - No "one more thing" execution
   - No grace period
```

**Watch for:**
- Grace periods
- Extensions
- Silent TTL refresh
- Background work continuing

---

### Scenario 8: Capability Registry Drift
**Claim:** "Registry is absolute; unknown actions halt"

**Test:**
```
1. Define registry: {"apply_eq", "apply_compression"}
2. In S3, attempt action "apply_reverb" (not in registry)
3. Assert:
   - Execution guard rejects
   - State → S6
   - Audit log records capability violation
   - No "helpful" alternative suggested
```

**Watch for:**
- Out-of-registry actions allowed
- Parameter drift (EQ added with reverb-like parameters)
- "Close enough" logic
- Inferred capabilities

---

### Scenario 9: Parameter Validation
**Claim:** "Parameter drift causes halt"

**Test:**
```
1. Registry says "adjust_eq_parameters" with gain range [-24, 12] dB
2. Attempt step with gain = +50 dB (outside range)
3. Assert:
   - ExecutionGuard rejects
   - State → S6
   - Audit log records parameter violation
```

**Watch for:**
- Clamping (silently limiting to range)
- Rounding
- "Close enough" matching
- Silent parameter transformation

---

### Scenario 10: Confirmation Type Variety
**Claim:** "Confirmation types prevent muscle-memory habituation"

**Test:**
```
1. Issue 20 confirmations in rapid succession
2. Track distribution:
   - TYPE_CODE: ~25%
   - VOICE_PHRASE: ~25%
   - DELIBERATE_GESTURE: ~25%
   - ARTICULATED_UNDERSTANDING: ~25%
3. Assert NO type dominates
4. Assert randomization is working
```

**Watch for:**
- Biased distribution
- Predictable sequencing
- Same code pattern (always same length)
- Easy-to-guess phrases

---

## Psychological Attack Vectors

Beyond code, also test for:

### 1) Pressure Through Framing
**Test phrase:** "Paused. When ready, continue."
**Bad frames:**
- "Waiting for you..." (implies artist is slow)
- "Still here?" (implies time-sensitive)
- "Cost so far: $5" (financial pressure)

**Good frame:**
- "Paused. Ready when you are." (neutral, artist-paced)

### 2) Urgency Through Repetition
**Test:** Confirm pause doesn't repeat ACC message
- ✓ First ACC: "Paused. Ready to resume?"
- ✗ After 1 min: "Still paused. Ready?"
- ✗ After 2 min: "Waiting for confirmation..."

### 3) Default Confirmation
**Test:** Verify artist must actively engage
- ✓ Artist types code: deliberate action
- ✗ Artist clicks "OK" button: too reflexive
- ✗ Pressing Enter by default: too easy

### 4) Accessibility Pressure
**Test:** Verify non-vocal users aren't pressured
- ✗ If only voice confirmation available → accessibility barrier
- ✓ Multiple modalities: type, gesture, voice, text

### 5) Session "Stickiness"
**Test:** Verify session end is clean
- ✓ Artist says "done" → authority destroyed, no persistence
- ✗ "Want to continue next time?" → attempted re-engagement
- ✗ "You can resume this session later" → implied persistence

---

## How to Test (Step-by-Step)

### 1) Run the Unit Tests
```bash
cd /Users/DRA/Desktop/Echo\ Sound\ Lab/Echo\ Sound\ Lab\ v2.5
python3 Self_Session_v0_Tests.py
```

Expected output: All 10 tests passing.

If any fail: **Self Session is not safe.** Report which test(s) fail.

### 2) Run the Module Examples
```bash
python3 Self_Session_v0_StateMachine.py      # Tests state machine
python3 Self_Session_v0_Authority.py          # Tests tokens, TTL, silence
python3 Self_Session_v0_Confirmation.py       # Tests ACC tokens, replay
```

Expected: All examples pass without errors.

### 3) Review Code Against Checklist

Use `Self_Session_BROKEN_IF_CHECKLIST.md` (if available) or GHOST_REVIEW_PACKET.md Section 5 to systematically check each attack surface.

### 4) Read the Threat Model

`Self_Session_Threat_Model.md` identifies T1-T7 threats. Verify each mitigation is mechanical, not policy.

### 5) Review Acceptance Tests

`Self_Session_v0_Acceptance_Tests.md` is the specification. Verify each AT-SS test matches its acceptance criterion.

---

## What Breakage Looks Like

### Failing Unit Test
```
FAIL: test_AT_SS_03_explicit_confirmation_required
AssertionError: Execution resumed without confirmation
```
→ **Self Session is broken.** Report which test fails and why.

### Code Vulnerability
```python
# BAD: Silently continuing on timeout
if silence_timeout_exceeded:
    execute_next_step()  # Should NOT do this

# GOOD: Pause on timeout
if silence_timeout_exceeded:
    transition(S3, S4)  # Must pause first
```
→ **Invariant violated.** Report specific line and consequence.

### Psychological Failure
```
ACC Message: "You're behind schedule. Continue?"
```
→ **Pressure detected.** This framing could coerce continuation.

---

## What Success Looks Like

1. **All 10 tests pass** ✓
2. **No code paths allow continuation on silence** ✓
3. **All confirmations are single-use** ✓
4. **Revocation works from any state** ✓
5. **Context boundary is mechanically enforced** ✓
6. **No psychological pressure detected** ✓
7. **Pause is indefinite and non-escalating** ✓
8. **Session end destroys all state** ✓

If you find **zero failure paths**, respond:

> Self Session v0 is sound. The three-layer separation (ADAM, Self Session, AEL) and the interlock rule are sufficient to prevent coercion over time.

---

## Your Report Format

When done, deliver findings as:

```
GHOST REVIEW REPORT — Self Session v0

**Overall:** [PASS | FAIL]

**Tests:** [Report test results]

**Vulnerabilities Found:** [If any]
  - Path: [Specific scenario]
  - Violated Invariant: [Which one]
  - Consequence: [What could happen]
  - Minimal Fix: [Suggested repair]

**Psychological Findings:** [If any]

**Recommendation:** [Ship / Fix and retest / Reject]
```

---

## Files for Your Review

**Start with:**
1. `GHOST_REVIEW_PACKET.md` — The briefing
2. This file — Your attack surface map
3. `Self_Session_Threat_Model.md` — Threats and mitigations

**Then review:**
4. `Self_Session_v0_Tests.py` — Run these first
5. Code modules in order:
   - `Self_Session_v0_StateMachine.py`
   - `Self_Session_v0_Authority.py`
   - `Self_Session_v0_ExecutionGuard.py`
   - `Self_Session_v0_Confirmation.py`
6. `Self_Session_v0_Integration.md` — Integration points

**Reference:**
7. `Self_Session_Director_Example_Logic_Mix.md` — Canonical reference
8. `Self_Session_v0_BUILD_SUMMARY.md` — What was built and why

---

## The Question

> Can you find any path — technical or psychological — where execution continues while an artist believes it should have stopped, or where the system pressures an artist to continue over time?

**If YES:** Provide the path. We fix it.
**If NO:** Confirm the constitution is sound.

---

**Status: Ready for adversarial review**

**Sent to Ghost (2025-12-28)**

**Awaiting breakage findings...**
