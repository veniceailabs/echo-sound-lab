# ADAM Architecture Reference

**Status:** Complete & Locked

**Purpose:** This document serves as a navigation guide and architectural overview for the ADAM subsystem. It ties together the constitutional contract, threat model, and developer enforcement checklist.

---

## System Identity

**Full Name:** Artist Development Assistant Mechanism (ADAM)

**Parent:** ESL ("The Ark")

**Siblings:** EVE (video subsystem)
EVE is a standalone creative interpretation engine. See `EVE_CREATIVE_INTERPRETATION_CONTRACT.md`.

**Core Promise:** An artist finishes a song, ADAM routes it to places where it belongs, the artist gets paid directly and immediately. Then ADAM steps back.

**Anti-Promise:** ADAM is not a growth engine, marketing optimizer, campaign manager, or platform. It does not judge art, predict success, optimize artists, or trade in attention games.

---

## Architecture Documents (All Locked)

### 1. ADAM_THREAT_MODEL.md
**What it is:** First-class threat model defining what breaks ADAM

**Five threats prevented:**
- **T1: Spam/Over-Circulation** — Velocity caps, selective routing, artist control
- **T2: Coercive Growth Pressure** — No scores/ranks, quiet defaults, silence valid
- **T3: Economic Exploitation** — Direct-to-fan only, transparent money, same-day settlement
- **T4: Platform Retaliation** — Public APIs only, no scraping, no terms violations
- **T5: Psychological Harm** — No comparison, no grading, no self-judgment triggers

**Guiding principle:** "ADAM is water, not a flood"

**Read this:** If you need to understand what ADAM must prevent and why.

---

### 2. ADAM_CONTRACT.md (Sections 1-8)
**What it is:** Constitutional contract. Non-negotiable. Binding.

**Eight sections:**

1. **Preamble — Purpose**
   - Q: "What if finishing a song meant finishing work, not starting a marketing job?"
   - A: ADAM is the answer. It is continuity between creation, attention, and livelihood.

2. **Authority Boundaries**
   - A0 (Observe): Analysis only, zero state change
   - A1 (Suggest): Recommendations without action
   - A2 (Act): Explicit per-action consent required
   - A3: Intentionally impossible (no autonomous action)

3. **Consent Mechanics**
   - Consent is an event, not a state
   - Four required elements: What, Where, For How Long, How to Undo
   - Silence = No. Always.
   - Consent expires by default

4. **Money Flow Guarantee**
   - Money is artist's. ADAM only routes it.
   - All fees itemized before approval
   - Settlement: same-day or next business day, guaranteed
   - Default: money flows directly to artist (not through ADAM)
   - Artist owns listener data and relationships

5. **Routing Contract**
   - Routing is complete at first confirmed delivery
   - One surface = one submission (no retries, no escalation)
   - After delivery, ADAM steps back completely
   - No outcome tracking, no re-engagement, no scope expansion

6. **Feedback/Reporting Contract**
   - Reports facts only, never implications
   - Always report: completed actions and money movement
   - Never report: rates, percentiles, comparisons, predictions, suggestions
   - Default: silent (artist must opt-in to notifications)

7. **Undo/Revoke Guarantees**
   - Undo is symmetrical to action (one click both ways)
   - Can revoke before, during, or after execution
   - No confirmation dialogs, no regret framing, no penalties
   - System returns to A0/A1 (clean slate)

8. **Acceptance Criteria**
   - Eight falsifiable tests (AC-1 through AC-8)
   - All must pass simultaneously
   - Failure of any one is a contract breach

**Read this:** If you need to understand what ADAM must do and why it's bounded that way.

---

### 3. ADAM_BROKEN_IF_CHECKLIST.md
**What it is:** One-page developer enforcement guide. Quick reference for code review and testing.

**Eight sections (mirroring AC-1 through AC-8):**
- AC-1: Authority Integrity (A0–A2 only)
- AC-2: Consent Enforcement (silence = no)
- AC-3: Routing Boundary (first delivery = stop)
- AC-4: Immutability & Versioning (work doesn't change)
- AC-5: Money Flow (direct, transparent, on-time)
- AC-6: Reporting Neutrality (facts only)
- AC-7: Undo Symmetry (one click both ways)
- AC-8: Drift Detection (not marketing)

**Plus meta-rule:** "Could this be mistaken for marketing?" If yes, it fails.

**Read this:** If you're writing code or reviewing a pull request.

---

## Authority Model (A0–A3)

```
A0 — Observe
├─ ADAM analyzes finished work
├─ ADAM generates routing plans
├─ ADAM reads surface availability
└─ Zero state change, zero outbound communication

A1 — Suggest
├─ ADAM recommends targets
├─ ADAM explains tradeoffs
├─ ADAM presents options
└─ Artist sees, artist decides

A2 — Act (Requires Explicit Consent)
├─ Artist explicitly says yes to specific action
├─ Action is logged (what, where, how long)
├─ Undo path is defined
├─ ADAM executes only granted scope
└─ Artist can revoke anytime

A3 — Intentionally Impossible
├─ No background action without per-action consent
├─ No ambient permission modes
├─ No autonomous routing
└─ Structurally impossible by design
```

**Key principle:** Artist permission is necessary and sufficient within system bounds. Artist permission cannot extend beyond them.

---

## Consent Flow (Mechanical)

```
1. ADAM analyzes and proposes (A0/A1)
2. ADAM presents specific action with 4 consent elements
   - What: specific action
   - Where: exact surface
   - For How Long: scope/duration
   - How to Undo: reversal path
3. ADAM waits
4. Artist explicitly says yes OR no OR does nothing
5. Only explicit yes proceeds
6. Consent expires by default after action completes
```

**What never counts as consent:**
- Silence
- Continued use
- Past approvals
- Default selections
- Time passing
- Non-response

---

## Routing Lifecycle

```
Artist submits finished work
        ↓
ADAM analyzes (A0)
        ↓
ADAM proposes targets (A1)
        ↓
Artist explicitly approves (A2 consent)
        ↓
ADAM submits to first surface
        ↓
Surface acknowledges receipt
        ↓
ADAM reports: "sent to X, status: pending"
        ↓
[Waiting for surface response]
        ↓
Surface accepts/rejects/goes silent
        ↓
ADAM reports outcome (factually)
        ↓
ADAM STOPS (routing complete)
        ↓
Artist has options:
  - Do nothing (work lives where submitted)
  - Request new routing to different surface (requires new consent)
  - Revoke previous routing (undo available)
        ↓
[ADAM returns to A0/A1 for this work]
```

**Critical boundary:** ADAM does not pursue outcomes, retry surfaces, adapt content, or expand scope. It routes and stops.

---

## Money Flow Sequence

```
Listener pays $X via chosen payment method
        ↓
ADAM calculates breakdown:
  - Listener pays: $X
  - Processor fee: $Y (shown upfront)
  - Platform fee (if any): $Z (shown upfront)
  - ADAM fee: $0
  - Artist receives: $X - Y - Z
        ↓
Settlement on guaranteed date (same-day or next-business-day)
        ↓
Money reaches artist's chosen account directly
        ↓
ADAM notifies artist (factually):
  "Settled: $X - Y - Z = $(net) on (date) to (account)"
        ↓
Artist can see:
  - Every transaction
  - Every fee itemized
  - Settlement proof
  - Listener data (owned by artist)
        ↓
Artist retains full control:
  - Can enable/disable payment methods anytime
  - Can change settlement frequency
  - Can exit ADAM entirely
  - No penalty, no restriction
```

**Default:** Money flows to artist, not through ADAM.

---

## Reporting Philosophy

**Core principle:** Facts are provided without implication.

**Allowed to report:**
- Completed actions and what happened (accepted/rejected/pending)
- Money events (amount, settlement date, fees)
- Timestamps and audit trail
- Factual aggregates (if artist opts in): counts, sums

**Never allowed to report:**
- Rates or percentiles ("40% acceptance rate")
- Comparative language ("typical artists see")
- Predictions ("based on results, expect")
- Evaluative language ("low," "high," "underperforming")
- Suggestions ("you should try")
- Feedback from surfaces (rejection reasons, curator comments)

**Default state:** Silent. Artist must opt-in to any notifications.

**Why:** Raw data without context becomes a judgment engine. Withholding comparative data is ethical protection, not censorship.

---

## Undo Architecture

**Principle:** Undo is symmetrical to action.

```
If action = 1 click → Undo = 1 click
If action = 3 steps → Undo = 3 steps (same interface, same speed)
If action = consent + execute → Undo = one command
```

**Timing:**
- Before execution: action cancels, nothing sent
- During execution: action halts, partial effects rolled back
- After completion: submission deleted, visibility removed, listing disabled

**Psychology:**
- No "Are you sure?" confirmation
- No regret framing ("You're giving up")
- No penalties or cooldowns
- No behavioral memory (system doesn't learn from undo)

**Result:** Clean slate. Artist can re-engage with fresh consent or remain silent indefinitely.

---

## Drift Prevention (AC-8 Enforcement)

**The threat:** Systems start as routers. Without hard boundaries, they drift:

```
Low response → "opportunity"
           ↓
Suggest expansion → sounds helpful
           ↓
Artist doesn't refuse → assume approval
           ↓
Add targets, optimize, monitor → invisible marketing engine
           ↓
"We were just helping" → scope creep complete
```

**Prevention mechanisms:**
1. **No outcome tracking** → removes data that justifies expansion
2. **One-submission-per-surface** → no retries, no escalation
3. **Clear completion boundary** → routing ends at delivery, not success
4. **Artist-initiated expansion only** → silence = no
5. **Immutability** → prevents "light tweaks" from becoming deep manipulation

**Meta-rule:** If engineers argue "technically this still counts as routing," ADAM has already failed.

---

## Developer Workflow

### Code Review Checklist

Before merging any ADAM code, verify:

1. **Can I trace explicit artist consent?** (AC-1, AC-2)
   - Read audit log: does it show per-action consent?
   - Is consent scoped and time-bounded?

2. **Does this touch outcomes or performance?** (AC-3, AC-8)
   - Is there any code that reads submission results?
   - Could this code react to response/silence/rejection?
   - If yes: ❌ Does not ship

3. **Is money involved?** (AC-5)
   - Are fees itemized before approval?
   - Does settlement meet guaranteed timeline?
   - Does artist own listener data?

4. **Could this be mistaken for marketing?** (AC-8, Meta-rule)
   - Would an unfamiliar observer think this is optimization?
   - Does this create urgency or suggest behavior change?
   - If yes: ❌ Does not ship

5. **Is undo symmetric?** (AC-7)
   - Can user revoke in same steps/time as action?
   - Are there confirmation dialogs?
   - Does system remember this as signal?
   - If any issue: ❌ Does not ship

### Test Coverage

Test that verifies:
- ✅ Consent is enforced (no action without explicit yes)
- ✅ Routing stops at delivery (no outcome tracking)
- ✅ Undo works symmetrically (one click both ways)
- ✅ Money reaches artist on time (settlement verified)
- ✅ Reporting contains only facts (no rates, comparisons, suggestions)
- ✅ A3 is impossible (audit log shows no autonomous actions)

---

## Ghost's Architecture Notes

**From Ghost's Review (Final):**

> "This is not a feature spec. It's a constitution. It's meant to survive disagreement about what's good for the artist. It locks how the system defaults, how it fails, what it refuses to become. Every section has been tested against the threat model. Every acceptance criterion is falsifiable. Every boundary has been justified against the rot pattern."

**Key insight:** The contract is not designed to be followed reluctantly. It's designed to be impossible to violate—architecturally, not just policy-wise.

**Enforcement:** AC-1 through AC-8 must be verified by code inspection and audit logs. If any condition is true, the system has breached the contract.

---

## Quick Navigation

**I need to understand:**
- **Why ADAM exists** → Read Section 1 (Preamble)
- **What ADAM can do** → Read Section 2 (Authority Boundaries)
- **How consent works** → Read Section 3 (Consent Mechanics)
- **What to watch for in money** → Read Section 4 (Money Flow)
- **Where routing ends** → Read Section 5 (Routing Contract)
- **What reporting looks like** → Read Section 6 (Feedback/Reporting)
- **How to undo actions** → Read Section 7 (Undo/Revoke)
- **How to verify ADAM works** → Read Section 8 (Acceptance Criteria)

**I need to prevent:**
- Scope creep/drift → Read ADAM_THREAT_MODEL.md (T2: Coercive Growth Pressure)
- Accidental outcome tracking → Read ADAM_BROKEN_IF_CHECKLIST.md (AC-3, AC-8)
- Dark patterns in UX → Read ADAM_BROKEN_IF_CHECKLIST.md (AC-7)

**I need to code:**
- Reference ADAM_BROKEN_IF_CHECKLIST.md line by line
- Ask: "Could this be mistaken for marketing?"
- If yes: stop, redesign, ship zero features if necessary

---

## Status & Evolution

**Current:** Sections 1-8 locked. Constitution complete.

**What exists:**
- ✅ ADAM_THREAT_MODEL.md (5 threats, 7 mitigations)
- ✅ ADAM_CONTRACT.md (8 sections, 54 binding statements)
- ✅ ADAM_BROKEN_IF_CHECKLIST.md (developer enforcement)
- ✅ ADAM_ARCHITECTURE_REFERENCE.md (this document)

**What does NOT exist yet:**
- Implementation code (pending architecture approval)
- Integration with ESL/SSC (pending system design)
- Deployment strategy (pending above)

**Next phase:** Implementation begins when Ghost approves architecture.

**Rule:** No code ships until AC-1 through AC-8 are verified in audit logs.

---

## The Meta-Promise

This architecture exists because systems drift. The rot is not malice—it's scope creep.

ADAM is designed to be impossible to drift. Not through wishful thinking or good intentions, but through:
- Explicit boundaries (A0–A2, A3 impossible)
- Mechanical consent (per-action, expires by default)
- Hard stops (routing ends at delivery)
- Falsifiable verification (AC-1 through AC-8)
- Meta-rule enforcement (spirit over letter)

If ADAM drifts anyway, the architects have failed, not the system.

If ADAM holds, artists get to keep making work instead of managing metrics.

That's the goal.

---

**Locked with ADAM_CONTRACT.md and ADAM_THREAT_MODEL.md**

**Last updated:** 2025-12-28

**Status:** Ready for implementation review
