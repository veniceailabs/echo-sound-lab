# ACTION AUTHORITY v1.0.0
## STANDING ASSUMPTIONS FOR FUTURE VERSIONS & AUDITS

**Document ID:** LCL-AA-ASSUMPTIONS-2025-12-31
**Version Applies To:** v1.0.0 and subsequent versions (unless explicitly superseded)
**Status:** Reference Document for Codex Continuity
**Date:** December 31, 2025

---

## PURPOSE

This document establishes the foundational assumptions that underpinned Action Authority v1.0.0 design and will guide any future versions. It is a reference artifact to prevent architectural drift and ensure continuity of intent across version boundaries.

---

## SECTION 1: ARCHITECTURAL ASSUMPTIONS

### 1.1 Single-User, Local-Only Scope

**Assumption:** Action Authority is designed for single-user, local execution environments.

**Implications:**
- No authentication, encryption, or network security is in scope
- Multi-user scenarios require additional controls outside Action Authority
- Cross-device synchronization is NOT supported
- Cloud deployment requires external boundary controls

**When This Changes:**
- If multi-user or distributed execution is needed, design a v2.0.0 that includes access control and audit trail distribution
- If network deployment is needed, design a v2.0.0 that includes transport security

---

### 1.2 Synchronous FSM, Single-Threaded Execution

**Assumption:** The FSM operates in a synchronous, single-threaded environment (JavaScript/React).

**Implications:**
- No Promise-based state transitions (would introduce race conditions)
- All FSM transitions must complete atomically within a single call stack
- Timer is RAF-based, not setTimeout (maintains determinism)

**When This Changes:**
- If async state transitions are required, design a v2.0.0 with explicit mutex/lock semantics
- If multi-threaded execution is needed, redesign the FSM with cross-thread safety guarantees

---

### 1.3 Immutable Core, Versioned Evolution Only

**Assumption:** Once v1.0.0 is locked, the core FSM, context binding, and hook boundary cannot be modified inline. All improvements must result in versioned releases (v1.0.1, v1.1.0, v2.0.0) with full re-verification.

**Implications:**
- No "hot patches" to core logic
- No emergency modifications without Codex security pass
- Each version is a self-contained, verifiable artifact
- History is preserved (v1.0.0 can always be cited as a reference)

**When This Changes:**
- This assumption should never change. If it does, create a meta-governance document (v2.0.0+ governance model)

---

## SECTION 2: SCOPE BOUNDARIES (WHAT ACTION AUTHORITY DOES NOT DO)

### 2.1 Does NOT Address Perception Quality

**Out of Scope:**
- Whether APL (perception layer) correctly analyzes audio
- Whether recommendations are accurate or useful
- Whether confidence scores reflect true uncertainty

**In Scope:**
- Preventing AI from executing based on confidence alone
- Preventing AI from executing recommendations without human confirmation

**Note:** Perception quality is a separate safety concern. Action Authority mitigates execution risk, not perception risk.

---

### 2.2 Does NOT Address Broader AI Safety

**Out of Scope:**
- Model alignment
- Prompt injection / jailbreak resilience
- Adversarial robustness
- Hallucination prevention

**In Scope:**
- Preventing unverified execution of AI-generated actions
- Ensuring human remains the decision authority

**Note:** Action Authority is one control in a defense-in-depth strategy, not a complete solution to AI safety.

---

### 2.3 Does NOT Address Data Security

**Out of Scope:**
- Encryption of audit logs
- Authentication of users
- Access control to the system
- Confidentiality of actions taken

**In Scope:**
- Integrity and immutability of audit logs (via Object.freeze)
- Tamper-detection (via SHA-256 hash)
- Non-repudiation (via immutable audit trail)

**Note:** Data security is a separate system property. Action Authority provides audit integrity, not data confidentiality.

---

### 2.4 Does NOT Automate Anything

**Out of Scope:**
- Autonomous decision-making
- Background processing
- Scheduled execution
- Agent-based workflows

**In Scope:**
- Preventing automation by accident
- Enforcing human confirmation as a prerequisite

**Note:** Action Authority explicitly forbids automation. It is designed for tool-use and human-in-the-loop workflows only.

---

## SECTION 3: DEPLOYMENT ASSUMPTIONS

### 3.1 Audit Log Must Be Sealed in Production

**Assumption:** In production environments, the audit log MUST be sealed immediately after initialization.

```typescript
if (process.env.NODE_ENV === 'production') {
  auditLog.seal();  // Mandatory
}
```

**Implications:**
- Without sealing, the audit trail can be modified post-deployment
- Sealing makes the log immutable and tamper-evident
- Sealing is ONE-WAY; cannot be undone within v1.0.0

**When This Changes:**
- If audit log modification is needed post-deployment, design a v2.0.0 with append-log rotation or segregated archive strategies

---

### 3.2 FSM Core Files Must Never Be Hot-Patched

**Assumption:** The following files must be updated via versioned release, never via hot-patch:
- src/action-authority/fsm.ts
- src/action-authority/context-binding.ts
- src/action-authority/hooks/useActionAuthority.ts
- src/action-authority/audit-log.ts
- src/action-authority/undo-engine.ts

**Implications:**
- Any production bug in these files requires a new release (v1.0.1)
- The bug fix must be tested against the full 12-vector security pass
- The new version must be re-verified before deployment

**When This Changes:**
- If real-time patching is required, design a v2.0.0 with formal rollback semantics and dual-versioning support

---

### 3.3 Context Hash Must Reflect Immutable Source State

**Assumption:** The `sourceHash` in `AAContext` must reflect an immutable snapshot of the data being operated on.

**Implications:**
- sourceHash should be computed from the audio file, session ID, or equivalent
- If data changes, sourceHash MUST change
- If sourceHash doesn't change, the system will not detect stale data
- The hash algorithm must be deterministic and consistent

**When This Changes:**
- If source state is mutable (e.g., live streaming), design a v2.0.0 with timestamped context windows instead of hash-based binding

---

## SECTION 4: FUTURE VERSION GUIDANCE

### 4.1 v1.0.1 (Patch Release)

**Allowed Changes:**
- Bug fixes in any file
- Performance improvements (no logic changes)
- Documentation improvements

**Required:**
- All 12 Codex security vectors must still pass
- No changes to FSM semantics
- No new execution paths

**Example:**
- Fix a race condition in RAF timer
- Optimize context hash computation
- Clarify error messages in audit log

---

### 4.2 v1.1.0 (Minor Release)

**Allowed Changes:**
- New optional event types (if FSM transition matrix allows)
- New hook utilities (convenience functions, no new execution logic)
- UI enhancements (HUD redesign, new visualizations)
- Additional context metadata (informational, non-execution)

**Required:**
- All 12 Codex security vectors must still pass
- No changes to the legal execution path
- No new shortcuts to EXECUTED state

**Example:**
- Add a `HOLD_PROGRESS_CALLBACK` for UI updates
- Add `getTransitionDuration()` helper
- Redesign HUD with dark mode support

---

### 4.3 v2.0.0 (Major Release)

**Allowed Changes:**
- New FSM states or events
- New execution paths (with full justification)
- Changes to context binding strategy
- Multi-user or distributed support

**Required:**
- NEW threat model (explicitly enumerate new attack surfaces)
- NEW Codex security pass (12+ vectors)
- NEW safety case submission
- Explicit supersession statement (how v2.0.0 differs from v1.0.0)

**Example:**
- Add batch execution with queuing (requires new threat model)
- Add multi-user audit trail distribution (requires new threat model)
- Change context binding to timestamped windows (requires new threat model)

---

## SECTION 5: NON-NEGOTIABLE CONSTRAINTS

These invariants cannot be weakened without a major version bump and full re-verification:

### 5.1 Confidence Cannot Influence Execution

**Immutable Rule:** No execution path depends on confidence thresholds or scores.

**Why:** Confidence is probabilistic; execution must be deterministic.

**If This Changes:** Requires v2.0.0 with explicit justification and new threat model.

---

### 5.2 Hold Timer Cannot Be Shortened

**Immutable Rule:** The 400ms hold threshold is non-negotiable.

**Why:** Protects against reflex clicks and automation bias.

**If This Changes:** Requires v2.0.0 with temporal safety re-analysis.

---

### 5.3 Confirmation Must Be Explicit and Atomic

**Immutable Rule:** One confirmation sequence = one execution, no queueing or batching.

**Why:** Prevents automation and ensures human intent is contemporaneous.

**If This Changes:** Requires v2.0.0 with deferred-execution threat model.

---

### 5.4 Context Mismatch Must Expire Actions

**Immutable Rule:** If context changes between suggestion and confirmation, action must EXPIRE.

**Why:** Prevents TOCTOU attacks and stale data execution.

**If This Changes:** Requires v2.0.0 with context-mutation threat model.

---

### 5.5 FSM Is the Sole Execution Authority

**Immutable Rule:** No execution pathway exists outside the FSM.

**Why:** Centralizes authority, enables audit, prevents bypass.

**If This Changes:** Requires v2.0.0 redesign with new control architecture.

---

## SECTION 6: AUDIT & CONTINUITY

### 6.1 This Document Is a Reference Artifact

**Status:** Not binding, but guidance.

**Purpose:** Prevent architectural drift and clarify design intent for future developers/auditors.

**How to Use:**
- Codex keeps this on file for future version reviews
- Future versions reference this to justify changes
- Regulators/auditors use this to understand v1.0.0 design philosophy

---

### 6.2 When to Create a New Standing Assumptions Document

**Trigger:** If v2.0.0 or later significantly changes architecture.

**Process:**
1. Create `STANDING_ASSUMPTIONS_v2.0.0.md`
2. Reference this v1.0.0 document as precedent
3. Explain what assumptions changed and why
4. Archive both versions for continuity

---

## SECTION 7: SUMMARY

Action Authority v1.0.0 is founded on these principles:

1. **Immutability:** Core files are locked; changes require versioned releases
2. **Determinism:** FSM is synchronous; no races, no ambiguity
3. **Authority:** Human oversight is structural, not procedural
4. **Auditability:** Every action is logged immutably
5. **Fail-Closed:** All faults terminate in non-executing states

These principles should guide all future versions.

If any principle is violated in a future version, that version should be considered a major architectural shift (v2.0.0+) requiring full re-verification.

---

**Document Status:** Reference / Guidance
**Authority:** Design Intent
**Version Lock:** Applies to v1.0.0 and all subsequent versions unless explicitly superseded
**Date:** December 31, 2025

---
