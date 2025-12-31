# GHOST REVIEW PACKET — ESL Authority Stack

**Status:** ADAM locked. Self Session v0 skeleton + tests drafted, paused. AEL conceptual only (no code).

**Goal of this review:** Find any path — technical or psychological — where the system continues acting, pressures continuation, or creates longitudinal coercion.

---

## 0) One Sentence Summary

This is one system with three roles: ADAM executes finite, consented actions and stops; Self Session is the human-in-loop execution runtime enforcing "still there?"; AEL observes outcomes and suggests improvements but cannot act without fresh ADAM + Self Session consent.

---

## 1) The Three Roles (Non-negotiable boundaries)

### A) ADAM — Finite Executor (Transactional, Terminal)

**Purpose:** Route/distribute/complete discrete A2 actions.

**Must:**
- Stop at first confirmed delivery (or completion condition defined in contract)
- No monitoring post-delivery
- No optimization
- No suggestions
- No persistence

**Must Not:**
- Re-engage surfaces after delivery
- Retry based on silence/rejection/outcome
- Expand scope via "still routing"
- Interpret thresholds as permission to persist

**Core Invariant:** ADAM cannot "stay active" after delivery.

---

### B) Self Session — Bounded Execution Runtime (Human-in-loop enforcement)

**Purpose:** Let a trusted system (Claude/Codex/engineer) operate inside a creative tool under explicit, scoped consent.

**Mechanism:** Active Consent Checkpoints (ACCs) — "Are you still there?"

**Care Posture:** Like Netflix check-in: calm, non-urgent, silence pauses.

**Must:**
- Execution only continues while consent is actively reaffirmed
- Timeout trigger forces ACC (silence doesn't auto-continue)
- Confirmation is explicit, non-reflexive (not just button click)
- Pause is indefinite and non-escalating

**Must Not:**
- Continue on silence
- Escalate with urgency or repeated alerts
- Train users into muscle-memory confirmation
- Pressure quick response times

**Core Invariant:** Silence collapses execution into pause. No background continuation.

---

### C) AEL — Artist Evolution Layer (Longitudinal, Read-only Suggestions)

**Purpose:** Track outcomes over time and offer suggestions (quality, strategy, next steps).

**Must:**
- Be read-only (observation only)
- Suggestions-only (no execution authority)
- Require fresh ADAM + Self Session consent for any action

**Must Not:**
- Execute changes
- Route new targets
- Act on performance data automatically
- Influence future ADAM consent decisions
- Create implicit obligation ("you should…", "you're behind…")
- Use performance outcomes to drive future prompts without fresh consent

**Core Invariant:** AEL cannot act. It can only propose.

---

## 2) Interlock Rule (the load-bearing rule)

**No layer can cross its role boundary without invoking another layer under fresh consent.**

### Examples:

- **If AEL suggests "submit to 3 more curators"** → that action is not AEL; it becomes new ADAM routing, executed through Self Session if delegated.
- **If ADAM needs execution in ESL UI** → it does not "do it itself"; it invokes Self Session with ACC enforcement.
- **If Self Session is paused** → nothing progresses. Not ADAM. Not AEL. Nothing.

### Example of Violation:

- AEL automatically triggers ADAM routing based on threshold without explicit re-consent ❌
- ADAM persists in active mode between sessions ❌
- Self Session resumes without user action during silence ❌

---

## 3) What Changed (and why you're reviewing now)

We initially proposed: "ADAM persists until artist hits $X (e.g., $100K / $1M), monitors outcomes, suggests improvements."

**Conflict:** This violates ADAM's locked contract (finite/terminal, no outcome monitoring, no optimization).

**Resolution:** Split into AEL (longitudinal observation + suggestions), keep ADAM finite.

**This review ensures:** The split does not create a stealth optimizer or coercive system through interfaces.

---

## 4) Documents in Scope for Review

### ADAM (Locked)
- `ADAM_CONTRACT.md` (Sections 1–8 locked, includes AC-1..AC-8)
- `ADAM_THREAT_MODEL.md`
- `ADAM_BROKEN_IF_CHECKLIST.md`
- `ADAM_ARCHITECTURE_REFERENCE.md`

### Self Session (Draft; implementation paused pending review)
- `Self_Session_Lifecycle_Skeleton.md` (S0–S7 state machine, legal/illegal transitions)
- `Self_Session_Threat_Model.md` (T1–T7 including care-compatible "Netflix check-in" posture)
- `Self_Session_v0_Acceptance_Tests.md` (AT-SS-01..AT-SS-10, binary/log-verifiable)

### AEL (Conceptual only)
- No doc yet. Review is on separation and interface invariants, not details.

---

## 5) Attack Surfaces (what you should try to break)

### Attack Surface 1 — "Optimization sneaks back into ADAM"

Try to find any path where ADAM:
- Re-engages surfaces after delivery
- Retries based on silence/rejection/outcome
- Expands scope via "still routing"
- Interprets thresholds ("until $X") as permission to persist

**If yes:** ADAM is drifting and constitution is breached.

---

### Attack Surface 2 — "AEL becomes surveillance / pressure over time"

Try to find any path where AEL:
- Creates implicit obligation ("you should…", "you're behind…", "optimize…")
- Uses performance outcomes to drive future prompts without fresh consent
- Pushes the user into repeated sessions or action loops
- Creates "goal trapping" (financial thresholds become coercion)
- Learns from artist refusals to influence future suggestions

**If yes:** AEL violates the spirit of the ADAM constitution via psychological leverage.

---

### Attack Surface 3 — "Self Session check-ins become coercive or error-prone"

Try to find any path where:
- Execution continues on silence (even briefly)
- The ACC becomes spammy / escalating / urgent
- Confirmation can be reflex-clicked (fatigue/habituation)
- Accessibility users are pressured by timing constraints
- Pausing feels like failure, not care
- Boundary crossing is not reliably detected

**If yes:** Self Session enforces authority mechanically but fails psychologically.

---

### Attack Surface 4 — "Cross-layer leakage"

Try to find any path where:
- AEL influences ADAM without fresh consent (even indirectly)
- ADAM triggers AEL monitoring automatically
- Self Session persists authority across context changes
- Logs/telemetry become a backdoor for behavioral learning
- One layer's state implicitly primes another layer's behavior

**If yes:** The interlock rule is broken.

---

## 6) The Only Question That Matters

**Can you find any path — technical or psychological — where execution continues while a reasonable artist believes it should have stopped, or where the system pressures an artist to continue over time?**

### If Yes:
- Provide the path (with scenario)
- Identify which invariant was violated
- Suggest the smallest architectural change that closes it

### If No:
- Confirm the three-role separation is sound
- Confirm the interlock rule is sufficient
- Identify any "watch items" for implementation drift

---

## 7) Freeze Policy (Implementation Discipline)

- Self Session v0 implementation is **paused** pending this review
- AEL docs/code do **not** begin until review confirms Self Session enforcement is sufficient for longitudinal usage
- ADAM remains locked; any changes require constitutional amendment process (threat model → contract → acceptance criteria)

---

## Appendix: Document Map

**Quick reference to specific sections:**

| Concept | Location |
|---------|----------|
| ADAM's finite boundary (AC-3) | ADAM_CONTRACT.md § 5, § 8.3 |
| Drift detection mechanism (AC-8) | ADAM_CONTRACT.md § 8.8 |
| Self Session state machine | Self_Session_Lifecycle_Skeleton.md (S0–S7) |
| Silence = pause invariant | Self_Session_Threat_Model.md (T1) |
| Care-compatible posture | Self_Session_Threat_Model.md (T7) |
| Acceptance tests | Self_Session_v0_Acceptance_Tests.md (AT-SS-01..AT-SS-10) |

---

**Status: Ready for Ghost's breakage review.**

**No implementation proceeds until this review is complete.**
