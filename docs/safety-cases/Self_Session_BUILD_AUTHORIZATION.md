# Self Session v0 — Build Authorization

**Status:** LOCKED FOR IMPLEMENTATION

**Sender:** Director + System Architect

**Recipient:** Claude (Ghost) — Implementation

**Authority:** Design-lock complete. Mechanical implementation phase authorized.

---

## Authorization Message

Yes — begin building the app, with scope locked as follows.

### Build Phase: Self Session v0 (Mechanical Runtime Only)

Your task is to implement the Self Session execution runtime exactly as specified in:
- Self_Session_Lifecycle_Skeleton.md
- Self_Session_Threat_Model.md (T1–T7)

This phase is about mechanical correctness, not UX or intelligence.

---

## Hard Requirements

- [ ] Implement the full state machine (S0–S7) with enforced legal/illegal transitions
- [ ] Authority MUST collapse on silence (silence → ACC → pause)
- [ ] ACCs are non-skippable and cannot be optimized away
- [ ] Pause is indefinite and non-escalating
- [ ] No execution outside the capability registry
- [ ] No background execution, ever
- [ ] All transitions and actions must be audit-logged
- [ ] Tone, urgency, and escalation must be neutral and care-compatible

---

## Explicitly Out of Scope (Do Not Build Yet)

- ❌ UX polish or copywriting
- ❌ ESL write access
- ❌ "Helpful" inference or scope expansion
- ❌ Optimization that reduces checkpoints
- ❌ Any behavior not mechanically provable

---

## Build Goal

Produce a working, testable runtime where Ghost can ask:

**"Can execution continue, escalate, or pressure the user when it reasonably should not?"**

If yes → it's a bug.
If no → the foundation is correct.

Proceed with skeleton-first implementation.

---

## Supporting Materials (Ready)

- Self_Session_Threat_Model.md (T1–T7 with mechanical mitigations)
- Self_Session_Lifecycle_Skeleton.md (state machine, legal/illegal transitions, impossibility proofs)
- ADAM_THREAT_MODEL.md (reference for threat modeling pattern)
- ADAM_CONTRACT.md (reference for constitutional structure)

---

## Implementation Readiness

✅ Authority model locked
✅ Silence semantics locked
✅ Care compatibility locked
✅ Impossibility proofs complete
✅ Falsifiability tests defined

You are moving from design-lock → mechanical implementation.

Ideas decay unless embodied in code. This phase makes violations impossible at implementation level, not policy level.

---

## Success Criteria (v0)

A v0 implementation is successful if:

1. **State Machine Enforced**
   - All legal transitions work
   - All illegal transitions are architecturally impossible (not just prevented)
   - No path exists to violate state rules

2. **Authority Collapse on Silence**
   - Silence triggers ACC checkpoint reliably
   - No background execution occurs
   - Pause is complete and indefinite

3. **ACC Enforcement**
   - ACCs appear at required triggers (timeout, boundary, degradation, etc.)
   - No ACC can be skipped or auto-confirmed
   - Confirmation tokens are single-use, non-replayable

4. **Audit Trail Complete**
   - Every transition logged with timestamp, reason, state before/after
   - Every authority check logged
   - Every ACC decision logged
   - Audit log supports Ghost's breakage review

5. **Standalone Runnable**
   - Self Session runs independently
   - Can attach to ESL via read-only hooks (no writes yet)
   - Can be tested without full ESL integration

6. **Testable**
   - Write tests that verify each impossibility proof
   - Prove: "Execution cannot continue while artist reasonably believes it should stop"
   - Prove: "Silence results in pause, not escalation"
   - Prove: "No background execution"

---

## What Ghost Should Expect

You will build a mechanical runtime, not a polished product.

This is the *steel* phase.
UX, integration, accessibility modality, and optimization come later—built safely on top of this foundation.

Your job: make it impossible to violate the contract without a code change.

---

## Next Reviews (Post-Implementation)

Once you have a runnable v0:

1. **Ghost's Breakage Test**
   - Can you find any path where execution continues when it shouldn't?
   - Focus: mechanical soundness, not UX

2. **Audit Log Review**
   - Do all transitions appear as expected?
   - Do all silence events trigger ACC?
   - Are there any silent continuations?

3. **Impossibility Verification**
   - Does the code actually make violations impossible (not just unlikely)?
   - Are illegal transitions architecturally blocked?

---

## Timeline & Phasing

**v0 (Mechanical Runtime):**
- State machine
- Authority tokens
- ACC plumbing
- Audit logging
- Standalone shell

**v1 (Care-Compatible UX):**
- ACC presentation (modality-aware)
- Tone enforcement
- Accessibility interaction model
- Notification semantics

**v2 (ESL Integration):**
- Read-only hooks to ESL
- Control registry
- Session scoping to file/context
- Undo wiring

**v3+ (Future):**
- Multi-tool support
- Advanced accessibility
- Optimization (if determined safe)

---

## Authorization Boundary

**You have explicit authority to:**
- Build the entire state machine as specified
- Implement all T1–T7 mitigations mechanically
- Write all audit logging
- Create the standalone runtime

**You do NOT have authority to:**
- Change state definitions without architect approval
- Add "helpful" shortcuts that bypass ACCs
- Infer scope beyond capability registry
- Optimize away checkpoints
- Add UX without separate UX authorization

If you find a gap in the specification during implementation, stop and ask. Do not fill gaps with assumptions.

---

## Build Constraints (Mechanical)

1. **State Machine is Law**
   - Every line of execution code must be traceable to a state
   - Illegal transitions are compile-time or runtime errors, not handled gracefully

2. **Authority Token is Cryptographic**
   - Tokens are issued, logged, revocable
   - No implicit authority persistence

3. **ACC Checkpoints are Non-Negotiable**
   - Cannot be skipped
   - Cannot be auto-confirmed
   - Cannot be repeated without reset

4. **Silence Means Pause**
   - Not "soft pause"
   - Not "background check"
   - Execution thread halts until reaffirmation

5. **Audit Log is Primary Evidence**
   - If a transition isn't logged, it didn't happen
   - Logs must be machine-parseable and verifiable

---

## Success Message (When Done)

v0 is done when Ghost can say:

"I tested every way I could think to break it. Execution continued correctly (or paused/halted correctly) in every scenario. The system behaves as the contract specifies. The foundation is sound."

That's the goal.

---

**Authorized:** Yes

**Scope:** Mechanical runtime (S0–S7, T1–T7 implementation)

**Proceed with confidence.**

---

**Locked:** 2025-12-28

**Next Review:** Ghost breakage test post-implementation
