# APL PHASES 1 & 2 — ARCHIVAL LOCK DECLARATION

**Status:** LOCKED / ARCHIVAL

**Effective Date:** 2025-12-30

**Authority:** System Director (Self Session v01 Project)

---

## I. LOCKED DOCUMENTS

The following contracts are hereby locked in perpetuity and may not be modified, reinterpreted, or superseded without explicit new versioned contracts:

### Phase 1 (Observational Foundation)

1. **APL_TECH_SPEC.md**
   - Status: LOCKED
   - Purpose: Core interfaces, data flow, lifecycle rules
   - Last Verified: 2025-12-30

2. **APL_PHASE_IMPLEMENTATION_PLAN.md**
   - Status: LOCKED
   - Purpose: Phased rollout constraints and success criteria
   - Last Verified: 2025-12-30

3. **ANME_APL_READONLY_CONTRACT.md**
   - Status: LOCKED
   - Purpose: Read-only boundary between ANME and APL
   - Last Verified: 2025-12-30

4. **APL_PHASE_1_ENFORCEMENT_BOUNDARIES.md**
   - Status: LOCKED
   - Purpose: Legal-grade interpretation boundaries (read-only definition, advisory definition, confidence semantics, temporal boundaries, session boundaries, persistence definition, forbidden interpretations, non-negotiables)
   - Last Verified: 2025-12-30

### Phase 2 (Recommendation Layer)

5. **APL_PHASE_2_INTENT_RECOMMENDATIONS.md**
   - Status: LOCKED
   - Purpose: Intent recommendations contract (non-actionable synthesis layer over Phase 1)
   - Last Verified: 2025-12-30
   - Constitutional Subordinate to: APL_PHASE_1_ENFORCEMENT_BOUNDARIES.md

---

## II. CONSTITUTIONAL HIERARCHY

**Phase 1 is the constitutional foundation. It overrides all other contracts.**

Precedence order (highest to lowest):

1. **APL_PHASE_1_ENFORCEMENT_BOUNDARIES.md** (Constitutional)
   - All interpretive boundaries in Phase 1
   - All forbidden patterns
   - All non-negotiables
   - All negative guarantees

2. **APL_TECH_SPEC.md** (Foundation)
   - Core interfaces and data structures
   - Lifecycle rules
   - Performance constraints

3. **APL_PHASE_IMPLEMENTATION_PLAN.md** (Design Mandate)
   - Phased rollout requirements
   - Success criteria
   - Explicit constraints

4. **ANME_APL_READONLY_CONTRACT.md** (Boundary Definition)
   - Read-only surface rules
   - Consumer obligations

5. **APL_PHASE_2_INTENT_RECOMMENDATIONS.md** (Optional Extension)
   - Only valid if Phase 1 is not violated
   - Automatically blocked if conflicts with Phase 1
   - Can be removed without affecting Phase 1

**Conflict Resolution Rule:** If any contract in this lock conflicts with APL_PHASE_1_ENFORCEMENT_BOUNDARIES.md, Phase 1 wins. This is non-negotiable.

---

## III. NON-MODIFICATION CLAUSE

### What Cannot Change

The following elements are LOCKED and cannot be modified without creating a new versioned contract (e.g., "Phase 2.1" or "Phase 3"):

**Phase 1 (Immutable):**
- Read-only definition and enforcement
- Advisory definition and semantics
- Confidence ranges and non-inflation rules
- Temporal and causal boundary prohibitions
- Session boundary definitions
- Persistence definitions and exceptions
- All 8 Phase 1 non-negotiables
- All forbidden interpretations

**Phase 2 (Locked until explicitly superseded):**
- Recommendation definition (passive, advisory, non-actionable)
- Phase 1-only data source requirement
- Zero authority boundaries
- Session-scoped recommendations
- No learned patterns, no caching
- Constitutional subordination to Phase 1
- All prohibited recommendation behaviors

### What Can Be Added

Only NEW contracts (Phase 3, Phase 4, etc.) can introduce:
- New layers (e.g., action authority)
- New data sources
- New persistence models
- New learning mechanisms

These require:
1. Explicit new versioned contract
2. Explicit user opt-in
3. Verification that Phase 1 & 2 are not violated
4. Staff review and sign-off

### What Triggers a New Contract

Any proposal that would require modifying existing Phase 1 or Phase 2 language instead triggers the creation of a new phase contract.

Example:
- "We want recommendations to have action authority" → Requires Phase 3 Contract, not modification of Phase 2
- "We want to learn recommendation patterns" → Requires Phase 3 Contract, not modification of Phase 2
- "We want to persist recommendations" → Requires Phase 3 Contract, not modification of Phase 2

---

## IV. ENFORCEMENT AUTHORITY

### Who Can Lock/Unlock

- **Lock:** System Director (authority to declare lock status)
- **Unlock/Modify:** System Director + explicit proposal for new versioned contract + staff review

### Who Can Propose Changes

- Any engineer can propose a new contract that extends Phase 1/2
- Proposal must acknowledge what it's extending (not modifying)
- Proposal must show Phase 1/2 are unviolated
- Proposal must go through staff review (Director + Codex + Ghost)

### Violation Detection

**Automatic Blocking Trigger:**
If code or contract language violates any locked Phase 1 or Phase 2 rule:
1. Development is halted
2. Violation is documented
3. Choice: (a) fix the code/contract, or (b) propose new phase contract
4. Resume development only after violation is resolved

---

## V. DOCUMENT INTEGRITY

### No Reinterpretation

- Locked contracts cannot be "interpreted differently" in future phases
- If new meaning is needed, a new contract is required
- Ambiguity in locked contracts defaults to the strictest interpretation

### Version Control

All locked documents are pinned to this date (2025-12-30) and cannot be updated inline.

Future changes require:
- New file with version suffix (e.g., APL_PHASE_1_ENFORCEMENT_BOUNDARIES_v2.md)
- Explicit supersession declaration
- Archive of previous version
- Migration plan for existing code

### Audit Trail

This lock document serves as the authoritative snapshot of what is locked and when.

---

## VI. READING ORDER (For Future Reviewers)

**Always read in this order:**

1. **APL_PHASE_1_ENFORCEMENT_BOUNDARIES.md** (Start here for interpretation rules)
2. **APL_TECH_SPEC.md** (Understand the interfaces)
3. **APL_PHASE_IMPLEMENTATION_PLAN.md** (Understand the roadmap)
4. **ANME_APL_READONLY_CONTRACT.md** (Understand the boundary)
5. **APL_PHASE_2_INTENT_RECOMMENDATIONS.md** (If extending to Phase 2)

---

## VII. ARCHIVAL STATUS

### Current State

**Phase 1:** LOCKED ✅
- Observational foundation complete
- Code and contracts aligned
- Negative enforcement audit passed
- Ready for production

**Phase 2:** LOCKED ✅
- Recommendation layer designed
- Constitutional subordination to Phase 1 established
- Prohibited behaviors enumerated
- Ready for implementation decision

### Next Decision Point

Phase 3 (Action Authority) requires:
1. Explicit new contract
2. Decision to move beyond recommendations
3. Staff review of what new authority means
4. Verification Phase 1 & 2 remain unviolated

---

## VIII. SIGNATURE & TIMESTAMP

**Locked By:** System Director (Self Session v01 Project)

**Lock Date:** 2025-12-30

**Locked Documents:**
- ✅ APL_TECH_SPEC.md
- ✅ APL_PHASE_IMPLEMENTATION_PLAN.md
- ✅ ANME_APL_READONLY_CONTRACT.md
- ✅ APL_PHASE_1_ENFORCEMENT_BOUNDARIES.md
- ✅ APL_PHASE_2_INTENT_RECOMMENDATIONS.md

**Status:** ARCHIVAL

**Authority:** This lock is non-negotiable. No modification without explicit new versioned contract and staff approval.

---

## IX. FINAL STATEMENT

**Phase 1 and Phase 2 are complete, coherent, and locked.**

Any engineer joining this project will:
1. Read these contracts in order
2. Understand that Phase 1 is constitutional
3. Understand that Phase 2 is optional and subordinate
4. Understand that violations are blocking
5. Understand that new capabilities require new contracts, not modification of existing ones

**If you have to ask "is this allowed?" the answer is in these contracts. If the answer is unclear, create a new contract. Do not reinterpret existing ones.**

This is the standard. This is the law.

---

**APL Phases 1 & 2: LOCKED AND ARCHIVAL**

**Status: COMPLETE**
