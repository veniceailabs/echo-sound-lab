# APL Phase 2 Intent Contract Stub

## LOCKED / ARCHIVAL

NON-EXECUTABLE PLACEHOLDER

This file is intentionally inert. Do not build against it. No runtime behavior is permitted.

## 1. Purpose

Define a future, read-only interpretive layer that introduces intent signals while preserving Phase 1 invariants and zero control authority.

## 2. Explicit Non-Goals

- No automation.
- No DSP.
- No execution authority.
- No lifecycle control over APL or playback.
- No persistence or cross-session memory.

## 3. New Concepts (Names Only)

- IntentSuggestion (read-only)
- ConfidenceEnvelope

## 3.1 Formal Definitions (Shape Only)

IntentSuggestion:
- A structured, read-only descriptor derived solely from existing perceptual outputs.
- Contains no verbs, actions, prescriptions, or control signals.
- Must not reference future actions, desired changes, or execution paths.

ConfidenceEnvelope:
- A bounded uncertainty descriptor attached to an IntentSuggestion.
- Must not exceed the confidence of underlying perceptual signals.
- Must not introduce new certainty, ranking, or aggregation.

## 4. Authority Rules

- IntentSuggestion is advisory only.
- Suggestions are not recommendations and must not trigger actions.
- APL remains the sole owner of perception lifecycle.

## 5. Upgrade Path

- Any Phase 2 implementation requires a new, versioned contract.
- ANME must explicitly opt in to Phase 2 intent signals.
- Phase 2 cannot assume availability of Phase 1 outputs.

## 6. Forbidden Evolutions

Phase 2 must NOT evolve into any of the following:

- IntentSuggestion becoming a recommendation
- IntentSuggestion proposing actions or changes
- ConfidenceEnvelope being used for ranking, scoring, or prioritization
- Temporal or causal inference (e.g., "because X changed, Y should happen")
- Cross-window narrative construction
- Automation hooks or execution triggers
- Any output that could be consumed as a control signal

If any of the above appear, Phase 2 is considered invalid.

## 6. Hard Block

- Phase 2 cannot ship unless all Phase 1 invariants remain intact and enforceable.

## 7. Pre-Implementation Lock

Phase 2 must not be implemented unless all conditions below are true:

- Phase 1 behavior and boundaries remain unchanged
- Phase 2 outputs are strictly optional and ignorable
- No lifecycle control is introduced
- No persistence or cross-session memory exists
- No execution or automation paths are created

Failure of any condition blocks Phase 2 entirely.
