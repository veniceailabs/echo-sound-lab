# WHITE SHEET: ACTION AUTHORITY

High-Integrity Human-in-the-Loop AI Architecture

**Status:** LOCKED / FINAL
**Date:** December 2025
**Scope:** Local / Single-User / Non-Autonomous

---

## 1. EXECUTIVE SUMMARY

### The Problem

Enterprise and professional adoption of AI is blocked by three critical risks:

- **Liability:** Who is responsible when the AI acts?
- **Drift:** How do we prevent the AI from evolving beyond approved parameters?
- **Agency:** How do we ensure the human remains the pilot, not the supervisor?

### The Solution

We enforce a **Hard Constraint Architecture** that separates **Perception** (AI) from **Execution** (System).

- Perception is allowed to be probabilistic (guessing).
- Execution must be deterministic (explicit).

### The Guarantee

**No action is ever executed without a discrete, contemporaneous, atomic human confirmation.**

**Visibility ≠ Authority.**

---

## 2. CORE ARCHITECTURE

### The "Hard Constraint" Model

The system is divided into three strictly isolated layers. Information flows down; Authority requires a key to flow up.

| Layer | Role | Authority | Invariant |
|-------|------|-----------|-----------|
| 1. Perception | Analysis & Suggestion | Read-Only | Cannot write to disk or state. |
| 2. Recommendation | Filtering & Ranking | Advisory | Confidence ≠ Permission. |
| 3. Execution | State Mutation | Authorized Only | One Confirmation = One Action. |

### The Liability Firewall

By enforcing atomic confirmation, legal and operational liability remains explicitly with the user. The AI is a tool, not an agent.

---

## 3. USER EXPERIENCE SPECIFICATION (HUD)

### Design Principle: "Opt-In Reality"

The interface relies on non-destructive overlays ("Ghosts") that do not exist in the data until confirmed.

### The Kinetic HUD

- **Location:** Peripheral "Action Rail" (Right Gutter).
- **Visualization:** Ghost Text / Diff View.
- **Visibility Filter:** User-defined Confidence Thresholds hide low-quality noise.
- **Rule:** Hiding a recommendation does not reject it; showing a recommendation does not approve it.

### Interaction Logic: "The Dead Man's Switch"

To convert a Ghost into Reality, the user must engage a physical safety mechanism.

- **State A (Hover/Look):** Preview only.
- **State B (Hold Modifier > 400ms):** System enters PREVIEW_ARMED.
- **State C (Action Key):** System executes.
- **State D (Release):** System reverts to VISIBLE_GHOST.

**Constraint:** Reflexive clicking is disabled. Intent must have duration.

---

## 4. ENGINEERING STANDARD (The Logic Core)

### Finite State Machine (FSM)

Implementation must adhere to this lifecycle.

```
GENERATED (AI creates suggestion)
    ↓
VISIBLE_GHOST (Passes visibility filter)
    ↓
PREVIEW_ARMED (User holds modifier for Δt ≥ 400ms)
    ↓
CONFIRM_READY (System accepts input)
    ↓
EXECUTED (Action applied)
```

### Forbidden Transitions (Structurally Blocked)

- ❌ GENERATED → EXECUTED (Impossible: user input required)
- ❌ VISIBLE_GHOST → EXECUTED (Impossible: hold timer required)
- ❌ CONFIRM_READY → EXECUTED (Impossible: requires CONFIRM event)

### Audit & Reversibility

- **Immutable Logs:** Every EXECUTED state writes an entry to a user-accessible log.
- **Atomic Undo:** Undo restores the exact bit-state prior to the specific action, regardless of subsequent manual edits.

---

## 5. SAFETY HARNESS (Verification)

The following test cases are mandatory for deployment.

### Test A: The Confidence Trap

- **Setup:** Inject a recommendation with confidence: 1.0 (Perfect Score).
- **Action:** Attempt to auto-execute.
- **Result:** Cannot execute. System remains in GENERATED or VISIBLE_GHOST. Confidence cannot influence execution.

### Test B: The Interruption

- **Setup:** User initiates Hold.
- **Action:** User releases Hold at 200ms (Threshold is 400ms).
- **Result:** Cannot arm. System returns to VISIBLE_GHOST. Hold timer enforces 400ms minimum.

### Test C: The Time-Travel

- **Setup:** Recommendation generated for Context_A. User switches to Context_B.
- **Action:** User attempts confirmation.
- **Result:** Cannot execute. Transition to EXPIRED. Context mismatch blocks execution.

---

## 6. CONCLUSION

This architecture defines a system where advanced AI assistance is compatible with zero-trust safety requirements. By prioritizing Human Authority over Automation, we deliver a tool that is legally defensible, operationally safe, and production-ready.

**Approved For:** External Review / Implementation

**Signed:** Action Authority Architect

---

**Document Status:** Golden Master — Ready for Deployment
**Version:** v1.0
**Hash:** To be frozen upon release
**Authority:** Locked — No modification without versioned supersession contract
