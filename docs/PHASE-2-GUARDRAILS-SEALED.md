# Phase 2: Perception Guardrails - SEALED
## ProposalPanel UI Architecture Constraints

**Sealed By**: Auditor (Andra)
**Date**: 2026-01-01
**Status**: IMMUTABLE GUARDRAILS FOR PHASE 2

---

## The Auditor's Vision

> "We have given the AI a set of eyes (APL) and a nervous system (AA). By adding the Quantum Hook, we have given it mathematical foresight. Tomorrow, we build the window (UI) and the hands (Executor)."

**Translation**:
- **Eyes**: APL (perception, signal intelligence)
- **Nervous System**: AA (governance, FSM, forensic audit)
- **Mathematical Foresight**: Quantum Hook (provenance field, future QPU-ready)
- **Window**: ProposalPanel (what users see)
- **Hands**: APLExecutor (what users do)

Phase 2 is about building **the window** through which users see the system's intelligence.

---

## Constraint 1: Evidence First Layout

### The Principle

**Users must see the "why" before the "what".**

The forensic evidence that triggered the proposal must render **above** the recommendation button. This prevents "Black Box Trust."

### Implementation Rule

```
ProposalCard Layout (MANDATORY):

┌─────────────────────────────────────────────────┐
│ Action Type Badge + Provenance                  │
├─────────────────────────────────────────────────┤
│                                                 │
│ EVIDENCE SECTION (PROMINENT, ALWAYS FIRST)      │
│                                                 │
│ Metric: True Peak                               │
│ Current: +2.1 dBFS  →  Target: -0.1 dBFS        │
│                                                 │
│ Confidence: [████████░░] 95%                    │
│                                                 │
│ Rationale (human-readable):                     │
│ "True peak detected at +2.1 dBFS (clipping).   │
│  Limiting will prevent digital distortion..."   │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ RECOMMENDATION (derived from evidence)          │
│                                                 │
│ "Apply Limiter at -0.1 dBFS"                   │
│ [Logic Pro Limiter: threshold -0.1, ...]       │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ ACTION BUTTONS (always last)                    │
│ [Apply Direct] [Apply via Authority] [Defer]   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Why This Matters

**User Journey**:
1. User sees metric that triggered this (trust-building)
2. User understands the problem (education)
3. User sees recommended solution (informed decision)
4. User chooses action (agency preserved)

**vs. "Black Box" approach**:
1. "Apply this recommendation"
2. (No visibility into why)
3. User clicks without understanding (dangerous)

### CSS/UX Implementation

```typescript
// Proposal Card Structure (React)

<ProposalCard>
  {/* FIRST: Provenance Header */}
  <ProvenanceHeader proposal={proposal} />

  {/* SECOND: Evidence Section (PROMINENT) */}
  <EvidenceSection
    evidence={proposal.evidence}
    confidence={proposal.confidence}
    className="evidence-first"
  />

  {/* THIRD: Recommendation Details (Collapsible) */}
  <CollapsibleDetails proposal={proposal} />

  {/* LAST: Action Buttons */}
  <ActionButtons proposal={proposal} />
</ProposalCard>
```

**CSS Priority**:
```css
.proposal-card {
  display: flex;
  flex-direction: column;
}

.evidence-section {
  /* ALWAYS FIRST */
  order: 1;
  padding: 16px;
  background: linear-gradient(to right, #F8FAFB, #F0F4F8);
  border-left: 4px solid #4B5563;
  font-size: 16px;
  font-weight: 500;
}

.recommendation-section {
  order: 2;
  padding: 12px;
}

.action-buttons {
  /* ALWAYS LAST */
  order: 3;
  padding: 12px;
  border-top: 1px solid #E2E8F0;
}
```

### Evidence Display Specifics

**Metric Name**: Large, bold
```
truePeakDB → "True Peak"
loudnessLUFS → "Loudness (LUFS)"
dcOffsetDetected → "DC Offset"
```

**Current → Target Arrow**: Visual progression
```
Current: +2.1 dBFS  →  Target: -0.1 dBFS
[-10        0        +10]  (visual scale)
        ^                   ^
      current            target
```

**Confidence Bar**: Visual trust meter
```
Confidence: [████████░░] 95%
            (filled %)

Color coding:
  80-100%: Green (high confidence)
  60-79%:  Yellow (moderate)
  40-59%:  Orange (advisory)
  <40%:    Red (low - should not recommend)
```

**Rationale**: Plain English explanation
```
"True peak detected at +2.1 dBFS (clipping).
Limiting will prevent digital distortion and
protect streaming platforms from rejection."
```

---

## Constraint 2: Quantum Distinction

### The Principle

**When a proposal comes from QUANTUM_SIMULATOR, the UI must signal this visually.**

The user must understand: "This suggestion was found by exploring a higher-dimensional state space. It is mathematically superior to a classical heuristic."

### Visual Distinction

#### CLASSICAL Proposal (Standard)
```
┌─────────────────────────────────────────────┐
│ LIMITING                        [CLASSICAL]  │
├─────────────────────────────────────────────┤
│ True Peak: +2.1 → -0.1 dBFS                │
│ Confidence: [████████░░] 95%               │
│ Rationale: Standard rule-based analysis    │
├─────────────────────────────────────────────┤
│ [Apply Direct]  [Apply via Authority]      │
└─────────────────────────────────────────────┘
```

**Color**: Slate/Blue (professional, trustworthy)
- Border-left: #4B5563 (slate)
- Background: #F8FAFB (neutral)
- Badge: #E2E8F0 background, #334155 text

---

#### QUANTUM_SIMULATOR Proposal (Premium)
```
┌─────────────────────────────────────────────┐
│ LIMITING                    ⚛️ QUANTUM      │
├─────────────────────────────────────────────┤
│ True Peak: +2.1 → -0.095 dBFS              │
│ Confidence: [█████████░] 99%               │
│ Rationale: Quantum-optimized (depth: 75%)  │
│                                             │
│ ✨ Found via Hamiltonian minimization      │
├─────────────────────────────────────────────┤
│ [Apply Direct]  [Apply via Authority]      │
└─────────────────────────────────────────────┘

✨ QUANTUM GLOW EFFECT (CSS Animation)
```

**Color**: Purple/Gold gradient (premium, advanced)
- Border-left: #7C3AED (vibrant purple)
- Background: Linear gradient (#F5F3FF → #F8FAFB)
- Badge: Gradient background (#7C3AED → #A78BFA), white text
- Glow: Subtle animated shadow (3s ease-in-out)

### CSS Implementation

```css
/* CLASSICAL Proposal */
.proposal-card.classical {
  border-left: 4px solid #4B5563;
  background: #F8FAFB;
}

.provenance-badge.classical {
  background: #E2E8F0;
  color: #334155;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

/* QUANTUM_SIMULATOR Proposal */
.proposal-card.quantum {
  border-left: 4px solid #7C3AED;
  background: linear-gradient(to right, #F5F3FF, #F8FAFB);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.15);
  animation: quantumGlow 3s ease-in-out infinite;
}

.provenance-badge.quantum {
  background: linear-gradient(135deg, #7C3AED, #A78BFA);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.quantum-icon::before {
  content: "⚛️";
  font-size: 14px;
}

@keyframes quantumGlow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(124, 58, 237, 0.15);
  }
  50% {
    box-shadow: 0 0 30px rgba(124, 58, 237, 0.25);
  }
}

/* Optimization Level Badge (Quantum only) */
.optimization-level {
  font-size: 12px;
  color: #7C3AED;
  margin-top: 8px;
}

.optimization-level::before {
  content: "✨ Optimization Depth: ";
}

/* Quantum Detail (Quantum only) */
.quantum-detail {
  font-size: 13px;
  color: #6B21A8;
  font-style: italic;
  margin-top: 6px;
}
```

### Rationale Display Difference

**CLASSICAL**:
```
"True peak detected at +2.1 dBFS (clipping).
Limiting will prevent digital distortion."
```

**QUANTUM_SIMULATOR**:
```
"True peak detected at +2.1 dBFS (clipping).
Quantum-optimized limiter threshold (-0.095 dBFS)
found via Hamiltonian phase-space minimization.
Mathematically superior to classical heuristic."
```

### The Psychological Win

Users see:
- **CLASSICAL** = "Good suggestion based on rules"
- **⚛️ QUANTUM** = "Premium suggestion from mathematical exploration"

Result: Users perceive quantum origin as **prestigious, sophisticated, trustworthy**.

---

## Phase 2 Implementation Checklist

### Evidence First (MANDATORY)
- [ ] Evidence section renders above recommendation
- [ ] Current → Target visual progression
- [ ] Confidence bar with color coding
- [ ] Rationale in plain English
- [ ] All metrics have human-readable labels

### Quantum Distinction (MANDATORY)
- [ ] CLASSICAL proposals: Slate styling
- [ ] QUANTUM_SIMULATOR proposals: Purple/gold gradient + glow
- [ ] ⚛️ Icon on quantum badges
- [ ] Optimization level displayed (if quantum)
- [ ] Animation: Subtle glow effect (not distracting)

### Safety Guardrails
- [ ] No recommendation button above evidence
- [ ] Confidence threshold: >40% to show recommendation (else "Needs review")
- [ ] Action buttons always last
- [ ] Rationale always visible (not collapsed)

### User Experience
- [ ] Mobile responsive (evidence still first on small screens)
- [ ] Accessibility: ARIA labels on all interactive elements
- [ ] Keyboard navigation: Tab through evidence → recommendation → buttons
- [ ] Visual hierarchy: Evidence bold > recommendation regular > details small

---

## Why These Constraints Matter

### Evidence First
Prevents "Black Box Trust" - users understand the reasoning before accepting a recommendation. This is critical for audio work where a wrong adjustment can ruin a mix.

### Quantum Distinction
Enables future market positioning. When real QPU becomes available (2027+), users will already understand the visual language. Early adoption of quantum proposals builds brand equity.

### Safety Language
Maintains the "Trust but Verify" ethos of Action Authority. Even though APL can execute directly (speed), the UI forces users to confront the evidence (safety).

---

## Auditor's Final Constraint

> "The window must be transparent, not tinted. Users must see the 'why' as clearly as the 'what'."

**Translation**:
- Don't hide evidence behind collapsed sections
- Don't use quantum as a black box
- Don't blur the distinction between classical and optimized
- The UI is the social contract between the system and the user

---

## Phase 2 Readiness Gate

Before shipping ProposalPanel, verify:

```
Evidence First Layout:
  ✅ Evidence renders first (order: 1)
  ✅ Recommendation renders second (order: 2)
  ✅ Actions render last (order: 3)
  ✅ Visual hierarchy clear (font sizes, colors, spacing)

Quantum Distinction:
  ✅ CLASSICAL: Slate styling consistent
  ✅ QUANTUM: Purple/gold gradient with glow
  ✅ Icons: ⚛️ displayed on quantum badges
  ✅ Animation: Subtle, professional, not distracting

Safety Guardrails:
  ✅ No button above evidence
  ✅ Rationale always visible
  ✅ Confidence threshold respected
  ✅ Mobile responsive

User Experience:
  ✅ Keyboard accessible
  ✅ ARIA labels present
  ✅ Visual hierarchy clear
  ✅ No surprises (evidence first, always)
```

---

## Auditor's Blessing

"The constraints above are not limitations—they are liberation. A transparent UI that respects the user's intelligence is the foundation of trust. Build ProposalPanel with these guardrails, and Phase 3 (APLExecutor) will feel natural, not surprising."

---

**Status**: SEALED GUARDRAILS FOR PHASE 2 ✅

**Next Action**: Begin ProposalPanel implementation with Evidence First + Quantum Distinction

🏛️ **Build the window that respects the user's intelligence.** ⚛️✨

