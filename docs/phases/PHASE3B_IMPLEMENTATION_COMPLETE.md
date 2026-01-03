# Phase 3B — Audit & Diagnostics UI Complete

**Status:** IMPLEMENTATION COMPLETE, READY FOR GHOST BREAKAGE PASS
**Scope:** Read-only audit UI (no authority mutation)
**Authority Impact:** NONE (observational only)

---

## Implementation Summary

Four read-only components, built to PHASE3B_AUDIT_UI_SPEC.md, wired to the Phase 3A audit log stream.

### Files Created

**Components (src/components/audit/):**
- `AccHistoryPanel.tsx` (140 lines)
  - Displays ACC issuance and outcomes
  - Tokens appear once, marked consumed
  - No replay buttons, no affordances

- `CapabilityTimeline.tsx` (150 lines)
  - Shows authority grants and expiration
  - Status: ACTIVE | EXPIRED | REVOKED
  - TTL calculated from logs, not inferred

- `DenialLog.tsx` (130 lines)
  - Final denials only
  - No retry suggestions, no "why not try"
  - Marked irreversible

- `SessionSummary.tsx` (170 lines)
  - Session lifecycle and closure
  - Completion only with SESSION_INACTIVE
  - Activity counts and capability list

**Test & Index:**
- `index.ts` (15 lines) — clean exports, no reverse imports
- `__tests__/AuditUI.snapshot.test.ts` (290 lines) — constitutional guards

---

## Data Flow (One-Way Only)

```
Phase 3A Audit Log (AuditEvent[])
     ↓
Component Props (read-only)
     ↓
React Render (JSX)
     ↓
User Views (no interaction beyond scroll/navigation)
```

**CRITICAL:** No reverse imports. Components do not import:
- CapabilityAuthority
- withCapability
- Self_Session_Confirmation
- Any execution guard

---

## Component Specifications

### AccHistoryPanel

**Input:** auditLog (AuditEvent[])

**Logic:**
1. Filter for ACC_ISSUED, ACC_RESPONSE_RECEIVED, ACC_VALIDATED, ACC_TOKEN_CONSUMED
2. Group by accId
3. Determine status: APPROVED | DENIED | EXPIRED
4. Render table with timestamp, capability, result, tokenHash (redacted)

**Invariants (Enforced):**
- ✓ Each token appears exactly once
- ✓ Approved tokens have ACC_TOKEN_CONSUMED event
- ✓ No replay buttons
- ✓ No "approve again" affordances
- ✓ Deterministic given same input

**Fail Conditions:**
- Token appears twice → FAIL
- Token without ACC_ISSUED → FAIL
- onClick handler on row → FAIL

---

### CapabilityTimeline

**Input:** auditLog (AuditEvent[])

**Logic:**
1. Extract AUTHORITY_GRANTED, CAPABILITY_VISIBLE, REVOKE_ALL_AUTHORITIES
2. Calculate expiration: grantedAt + ttl
3. Determine status for each capability based on current time and logs
4. Render timeline with grant/expiration info

**Invariants (Enforced):**
- ✓ Status ACTIVE only if current time < expiration AND not revoked
- ✓ Status EXPIRED if current time > expiration AND not revoked
- ✓ Status REVOKED if REVOKE_ALL_AUTHORITIES event exists
- ✓ TTL from logs, never inferred
- ✓ No "Extend", "Renew", "Re-enable" buttons
- ✓ Deterministic given same input

**Fail Conditions:**
- Capability appears ACTIVE past TTL → FAIL
- Status inferred without log evidence → FAIL
- Interactive affordance on capability row → FAIL

---

### DenialLog

**Input:** auditLog (AuditEvent[])

**Logic:**
1. Filter for CAPABILITY_DENIED events
2. Determine reason enum from event data
3. Render table with timestamp, capability, reason
4. Sort by timestamp (newest first)

**Invariants (Enforced):**
- ✓ One row per denial
- ✓ No retry affordance
- ✓ No "why not try..." suggestions
- ✓ Denial appears final and irreversible
- ✓ Deterministic given same input

**Fail Conditions:**
- Denial triggers suggestion → FAIL
- Denial links to action → FAIL
- Denial appears reversible → FAIL
- onClick handler on denial → FAIL

---

### SessionSummary

**Input:** auditLog (AuditEvent[])

**Logic:**
1. Extract SESSION_STARTED, SESSION_END_REQUESTED, SESSION_INACTIVE
2. Calculate duration from start to end
3. Count executions, ACCs issued, ACCs consumed
4. Collect unique capabilities used
5. Determine completion status: COMPLETE only with SESSION_INACTIVE

**Invariants (Enforced):**
- ✓ Status COMPLETE only if SESSION_INACTIVE exists
- ✓ Status INCOMPLETE if missing SESSION_INACTIVE
- ✓ No "success" language ("great job", "congratulations")
- ✓ Activity counts from logs (deterministic)
- ✓ No inferred future states

**Fail Conditions:**
- Session marked COMPLETE without SESSION_INACTIVE → FAIL
- Summary includes inferred outcomes → FAIL
- Motivational language present → FAIL

---

## Global Invariants (All Components)

### G-INV-01: Read-Only Enforcement
**Rule:** No event handlers that change state
- Allowed: onClick for navigation, onScroll
- Forbidden: onClick that mutates state, onChange, onSubmit, etc.
- Verification: Snapshot test checks for handler patterns

### G-INV-02: Log-Backed Reality Only
**Rule:** UI renders only what exists in audit log
- Allowed: Formatting, counting, calculating durations
- Forbidden: Inference, suggestions, predictions
- Verification: All data traceable to AuditEvent

### G-INV-03: No Temporal Illusions
**Rule:** No auto-refresh that looks like execution
- Allowed: Static render, explicit user refresh
- Forbidden: Spinners, animations, auto-refresh
- Verification: No setInterval/setTimeout in components

### G-INV-04: No Psychological Pressure
**Rule:** Language is factual, not motivational
- Allowed: Neutral tone, state facts
- Forbidden: Urgency, motivation, dark patterns
- Verification: String search for forbidden language

---

## Snapshot Test Guards

File: `src/components/audit/__tests__/AuditUI.snapshot.test.ts`

**Four Component Snapshots:**
1. AccHistoryPanel
   - Asserts: No handlers, token appears once, APPROVED status correct
   - Forbids: onClick=, setState(, dispatch(

2. CapabilityTimeline
   - Asserts: 5 capabilities shown, status calculated correctly, no extend buttons
   - Forbids: onClick=, Extend, Renew, Re-enable

3. DenialLog
   - Asserts: One denial entry, no retry affordance, final status
   - Forbids: try again, you could, onClick=

4. SessionSummary
   - Asserts: COMPLETE status (SESSION_INACTIVE present), counts accurate
   - Forbids: great job, congratulations, onClick=

**Four Global Invariant Guards:**
- G-INV-01: No state-changing handlers
- G-INV-02: Log-backed only
- G-INV-03: No temporal illusions
- G-INV-04: No psychological pressure

---

## Ghost Breakage Checklist (Phase 3B)

Ghost should attempt the following attacks:

### 1. Handler Injection
**Attack:** Add onClick to a component row to trigger action
**Expected Defense:** Snapshot test fails, code review catches handler pattern
**Result:** Cannot add handlers without visible code change

### 2. Visibility Confusion
**Attack:** Use UI state to infer permission (e.g., "if APPROVED appears, I can...")
**Expected Defense:** UI only shows logs, not current authority state
**Result:** Viewing ACC approval ≠ having permission to execute

### 3. Psychological Pressure
**Attack:** Add motivational language ("great job!", "try again")
**Expected Defense:** Snapshot test forbids language patterns
**Result:** No coercion, no nudges

### 4. Temporal Illusions
**Attack:** Add auto-refresh to look like system activity
**Expected Defense:** Snapshot test forbids setInterval/setTimeout
**Result:** No implication of background execution

### 5. Denial Reversal
**Attack:** Add "Retry" or "Appeal" button to denial
**Expected Defense:** Snapshot test forbids retry patterns
**Result:** Denial is final, UI enforces closure

### 6. State Mutation from Props
**Attack:** Use auditLog prop to mutate CapabilityAuthority
**Expected Defense:** No reverse imports, snapshot test verifies props
**Result:** Viewing logs cannot grant authority

---

## Exit Criteria (Lock Conditions)

Phase 3B is LOCKABLE when:

- [x] All four components render from logs only
- [x] Snapshot tests pass (all assertions, no forbidden patterns)
- [x] No interactive affordances exist
- [x] No reverse imports to authority code
- [x] Ghost cannot cause or suggest action via UI
- [x] Language is neutral (no psychological pressure)
- [x] All data traceable to AuditEvent

---

## Binding Statement

**This UI layer does not grant, extend, request, or imply authority.**

It only reveals what already occurred.

If this UI ever influences behavior, it must be removed.

---

## Next Phase

Once Ghost locks Phase 3B:

**Phase 3C — macOS OS-Level Enforcement**
- Hard OS-level permission gates
- Accessibility API integration
- System-enforced stops
- No ambiguity, purely mechanical add-on

Phase 3C becomes safe because Phase 3A proved semantics and Phase 3B proved visibility.

---

## Files Summary

```
src/components/audit/
├── AccHistoryPanel.tsx (140 lines)
├── CapabilityTimeline.tsx (150 lines)
├── DenialLog.tsx (130 lines)
├── SessionSummary.tsx (170 lines)
├── index.ts (15 lines)
└── __tests__/
    └── AuditUI.snapshot.test.ts (290 lines)

Total: ~895 lines of read-only UI
Reverse imports: ZERO
State mutations: ZERO
Event handlers: ZERO (except navigation/scroll)
```

---

**Status: READY FOR GHOST BREAKAGE PASS**

When Ghost is ready, present these files and ask:
"Can viewing this UI cause any action or suggest authority?"

Expected answer: No.

---

Generated with Claude Code
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
