# APL Phase 2: Intent Recommendations Contract

**Purpose:** Introduce interpretable recommendations without re-introducing hidden control, persistence, or inferred intent.

**Status:** Phase 2 (Optional Extension Layer)

**Constitutional Override:** Phase 1 Enforcement Boundaries remain in full effect and override all Phase 2 language. If Phase 2 and Phase 1 conflict, Phase 1 wins. Period.

**Enforceability:** This contract is binding on all Phase 2 implementations and consumer systems.

---

## 1. Definition: "Recommendation"

### What a Recommendation Is

A recommendation is a passive, advisory descriptor derived solely from Phase 1 perceptual outputs.

**Exact definition:**
- A structured statement that synthesizes Phase 1 signals (frames, embeddings, changes, confidence)
- Contains no imperatives, directives, or action words
- Proposes no changes to audio, settings, or processing
- Is never actionable without explicit secondary user consent
- Includes confidence bounds that do not exceed underlying Phase 1 signals

### What a Recommendation is NOT

❌ A recommendation is NOT an action trigger
❌ A recommendation is NOT a command or directive
❌ A recommendation is NOT automatic execution authority
❌ A recommendation is NOT permission to modify audio or settings
❌ A recommendation is NOT a prediction about what the user "should" do
❌ A recommendation is NOT a learned pattern from cross-session data
❌ A recommendation is NOT implied by high confidence

### Recommendation Payload Structure (Informational)

```
{
  "type": "recommendation",
  "source": "Phase2_IntentAnalysis",
  "description": "[Factual statement about perceptual observation]",
  "confidence": 0.0–1.0,
  "relatedPhase1Signals": ["signal_id_1", "signal_id_2"],
  "userAction": "none" // Always "none" in Phase 2
}
```

**Note:** The `userAction` field is always "none". Phase 2 recommendations never propose actions.

---

## 2. Source of Truth: Recommendations Must Derive From Phase 1 Only

### Phase 1 Signals as the Sole Input

**Recommendations MUST:**
- Derive exclusively from Phase 1 observational outputs (frames, embeddings, changes, snapshots)
- Reference the Phase 1 signals they synthesize
- Make transparent which Phase 1 data contributed to the recommendation

**Recommendations MUST NOT:**
- Introduce new data sources (file metadata, external APIs, user history)
- Infer intent from user behavior outside APL
- Learn patterns from cross-session data
- Use cached or previously-derived metrics
- Assume knowledge about user goals, preferences, or style

### No External Data Integration

**Phase 2 MUST NOT:**
- Call external services to validate, rank, or enhance recommendations
- Access user profile, history, or preference data
- Consult plugin databases, genre taxonomies, or reference libraries
- Infer meaning from file names, tags, or metadata
- Build recommendation context from non-APL sources

### Explicit Derivation Trail

Every recommendation MUST include:
- List of contributing Phase 1 signal IDs
- The specific Phase 1 values that generated the recommendation
- The synthesis method (if transparent to user)
- No hidden intermediate steps

---

## 3. Recommendation Authority Boundaries

### Zero Action Authority

**Fundamental rule:** Recommendations cannot cause action.

**Explicitly:**
- No recommendation triggers processing
- No recommendation gates DSP initialization
- No recommendation auto-applies fixes or changes
- No recommendation defers, enables, or disables features
- No recommendation influences plugin selection, parameter changes, or export settings
- No recommendation modifies the state of any system outside its own display

### Recommendations Are Passive Observers

Recommendations exist to:
- ✅ Inform user decision-making (optional)
- ✅ Describe observed perceptual state
- ✅ Summarize Phase 1 findings in human-readable form

Recommendations do NOT exist to:
- ❌ Suggest actions (even soft suggestions are forbidden)
- ❌ Trigger automatic behavior
- ❌ Influence other systems through conditionals
- ❌ Serve as input to control logic

### User Consent Requirement

**If a user can act on a recommendation, the action MUST be:**
1. Explicitly initiated by the user (button, menu, keyboard)
2. Outside the recommendation display (separate UI element)
3. Never implied or suggested by the recommendation itself
4. Reversible without side effects

---

## 4. Confidence and Recommendation Semantics

### Recommendations Inherit Phase 1 Confidence Rules

**From Phase 1 Enforcement Boundaries, all confidence rules apply:**
- Confidence is non-authoritative
- No inflation through aggregation
- Only three aggregation methods allowed (MIN, MAX, voting)
- Thresholds are filtering heuristics, not permissions
- Low confidence must not imply retry, escalation, or auto-action

### Recommendation Confidence Bounds

When Phase 2 synthesizes multiple Phase 1 signals:

| Synthesis Method | Confidence Rule |
|---|---|
| AND (all signals must support) | Confidence = MIN(input confidences) |
| OR (any signal supports) | Confidence = MAX(input confidences) |
| Voting/consensus (majority agreement) | Confidence ≤ 0.9 × MIN(input confidences) |
| Any other method | **FORBIDDEN** |

**Explicit rule:** Recommendation confidence MUST NEVER exceed the confidence of its weakest underlying Phase 1 signal.

### No Confidence Inflation in Recommendations

**Phase 2 MUST NOT:**
- Raise confidence because multiple signals agree
- Treat agreement as validation
- Use cross-signal correlation to increase certainty
- Assume low confidence signals are compensated by other factors
- Default missing confidence to anything above 0.1

### Confidence Decay Over Time

**Recommendation confidence MUST decay with staleness:**
- Recommendations older than 5 seconds: halve confidence
- Recommendations older than 10 seconds: treat as low (0.1)
- Fresh recommendations (< 1 second): use Phase 1 confidence directly

---

## 5. Recommendation Persistence and Session Scope

### Recommendations Are Session-Scoped

**Fundamental rule:** Recommendations exist only within a session. On session boundary, all recommendations are cleared.

**Session boundary triggers (from Phase 1):**
- `APLSession.close()` is called
- `sourceId` changes
- Source duration exceeds 30 minutes
- 15 minutes pass without new audio frames
- `APLSession.start(newInput)` is called with different input

### No Cross-Session Recommendation Memory

**Phase 2 MUST NOT:**
- Cache recommendations from previous sessions
- Reuse recommendation logic or patterns across sessions
- Learn that "this source type usually gets this recommendation"
- Build recommendation profiles for individual files or genres
- Persist recommendation history or statistics
- Compare current recommendations to previous sessions

### No Learned Recommendation Patterns

**Explicitly forbidden:**
- "After 10 sessions, this combination of signals predicts user action X" → **FORBIDDEN**
- "I'll remember that this type of content benefits from X recommendation" → **FORBIDDEN**
- "I'll track which recommendations the user acts on to improve future ones" → **FORBIDDEN**
- "I'll cache successful recommendation patterns" → **FORBIDDEN**

### Ephemeral Recommendation Generation

- Recommendations are generated on-demand during a session
- Each session generates fresh recommendations from fresh Phase 1 data
- No recommendation scaffolding survives session end
- New session = new baseline, no inherited context

---

## 6. User Consent and Recommendation Display

### Recommendations Are Opt-In

**Phase 2 MUST:**
- Require explicit user action to enable recommendation display
- Allow user to disable recommendations instantly
- Provide no recommendations by default (Phase 1 is default)
- Make recommendation presence user-visible and obvious

### Recommendation Display Rules

**Recommendations shown to user MUST:**
- Be clearly labeled as "Recommendation" or "Suggestion" (not "Finding" or "Alert")
- Include confidence score transparently
- Show the Phase 1 signals that generated the recommendation
- Provide no call-to-action or pressure to act
- Be dismissible without affecting APL or audio

**Recommendations MUST NOT:**
- Auto-play or force attention
- Persist prominently if dismissed
- Accumulate or nag
- Suggest urgency or priority
- Create UI pressure to act

### User Can Ignore Recommendations Safely

- Ignoring a recommendation does not affect APL, audio, or any other system
- Disabling recommendations does not disable Phase 1 APL
- No recommendation should imply "you should do something"
- No recommendation is necessary for audio integrity

---

## 7. Prohibited Recommendation Behaviors

### Absolute Prohibitions (FORBIDDEN in Phase 2)

**These are not guidelines. These are law. Full stop.**

❌ **Recommendation as Action Trigger**
- "Based on this recommendation, I'll auto-apply EQ" → **FORBIDDEN**
- "Recommendation confidence > 0.8 → enable processing" → **FORBIDDEN**
- "Show recommendation only if auto-fix is available" → **FORBIDDEN**
- "Recommendation gates whether user can export" → **FORBIDDEN**

❌ **Learned Intent Inference**
- "This recommendation pattern means user wants brighter audio" → **FORBIDDEN**
- "User dismissed this recommendation 3 times → learn to stop showing it" → **FORBIDDEN**
- "This recommendation was acted on; suggest similar next time" → **FORBIDDEN**
- "Build a profile of user preferences from recommendations" → **FORBIDDEN**

❌ **Cross-Session Aggregation**
- "Average recommendation confidence across 5 sessions" → **FORBIDDEN**
- "Track which recommendations are most acted upon" → **FORBIDDEN**
- "Recommend based on patterns I've learned across files" → **FORBIDDEN**
- "This file is similar to previous ones; use cached recommendations" → **FORBIDDEN**

❌ **Confidence Manipulation**
- "Multiple moderate-confidence signals → high-confidence recommendation" → **FORBIDDEN**
- "User agreed with recommendation once → increase future confidence" → **FORBIDDEN**
- "Recommendation confidence should reflect likelihood user will act" → **FORBIDDEN**
- "Low Phase 1 confidence, but high overall recommendation confidence" → **FORBIDDEN**

❌ **Implicit Control or Gating**
- "Show recommendation only if plugin available" → **FORBIDDEN**
- "Gate recommendation display on audio complexity" → **FORBIDDEN**
- "Defer showing recommendation until processing is ready" → **FORBIDDEN**
- "Recommendation status affects DSP or UI state" → **FORBIDDEN**

❌ **Persistence of Recommendation-Derived Data**
- "Log which recommendations were shown and dismissed" → **FORBIDDEN** (unless user-visible and disableable)
- "Cache recommendation templates for faster generation" → **FORBIDDEN**
- "Store recommendation history for analysis" → **FORBIDDEN**
- "Persist recommendation feedback for learning" → **FORBIDDEN**

❌ **Temporal or Causal Inference**
- "Because brightness increased, recommend EQ boost" → **FORBIDDEN**
- "Pattern suggests genre; tailor recommendation" → **FORBIDDEN**
- "Sequential change implies future need; proactive recommendation" → **FORBIDDEN**
- "User action preceded recommendation; causality inferred" → **FORBIDDEN**

❌ **Forward Design for Phase 3**
- "Leave space in recommendation payload for action signals" → **FORBIDDEN**
- "Design UI to show recommendations that could become actions" → **FORBIDDEN**
- "Prepare recommendation framework for automation later" → **FORBIDDEN**
- "Assume recommendations will evolve into directives" → **FORBIDDEN**

---

## 8. Recommendation and Phase 1 Separation

### Phase 1 Remains the Foundation

**Immutable truth:**
- Phase 1 is always available independent of Phase 2
- Phase 1 outputs and behavior are never modified by Phase 2
- Phase 1 can be disabled without affecting recommendations (but recommendations go away too)
- Phase 1 contract is never weakened by Phase 2 language

### Recommendations Cannot Modify Phase 1 Contract

**Phase 2 MUST NOT:**
- Change what Phase 1 signals mean
- Alter confidence semantics defined in Phase 1
- Re-define session boundaries
- Introduce persistence that violates Phase 1
- Create control paths through recommendation layer

### Recommendation Layer Is Optional

**Users/systems can:**
- Enable Phase 1 only (no recommendations)
- Enable Phase 1 + Phase 2 recommendations
- Disable recommendations without disabling Phase 1
- Disable both entirely

**Disabling recommendations MUST NOT affect:**
- APL functionality
- Audio quality or integrity
- Any other system

### Phase 1 Override Clause (Constitutional)

If Phase 2 recommendation language conflicts with Phase 1 Enforcement Boundaries, Phase 1 wins. This is non-negotiable.

Example: If Phase 1 says "no confidence inflation" and Phase 2 recommendation logic attempts to aggregate confidences differently, Phase 1 rule stands and the Phase 2 logic is blocked.

---

## 9. Forward Compatibility: What Phase 3+ Cannot Do

### Phase 2 Recommendations Cannot Become Control

**No Phase 3+ evolution can:**
- Convert recommendations into actionable directives
- Use recommendations as input to automated processing
- Treat high-confidence recommendations as permission to act
- Build recommendation-triggered automation (even deferred)
- Assume users want recommendations to become actions

### Phase 2 Recommendations Cannot Introduce Learning

**No future phase can:**
- Use recommendation acceptance/rejection to train models
- Build user preference profiles from recommendation patterns
- Create recommendation feedback loops
- Learn what "good recommendations" means
- Aggregate recommendation signals across users

### Phase 2 Recommendations Cannot Enable Persistence

**No future phase can:**
- Persist recommendation logs beyond a session
- Cache recommendation patterns
- Build recommendation history
- Create recommendation analytics
- Treat recommendations as data collection

### Hard Block

**Any Phase 3+ proposal that violates the above is automatically BLOCKED unless it proposes a new, versioned contract (Phase 3 Contract) with explicit opt-in from users.**

---

## Enforcement Checklist (For Reviewers)

### Must Be True For Phase 2 Compliance

- [ ] All recommendations derive exclusively from Phase 1 signals
- [ ] No recommendation triggers action or controls any system
- [ ] Recommendation confidence never exceeds Phase 1 input confidence
- [ ] No cross-session recommendation memory exists
- [ ] No learned patterns or caching of recommendation logic
- [ ] Recommendations are session-scoped only
- [ ] User can disable recommendations without breaking anything
- [ ] No persistence of recommendation-derived data (except user-visible logs)
- [ ] Recommendations are clearly labeled and non-imperative
- [ ] Phase 1 contract remains fully intact and unmodified

### If ANY of These Are True, Phase 2 Is Broken

- [ ] Recommendations trigger processing, DSP, or plugin changes
- [ ] Recommendation confidence exceeds Phase 1 confidence
- [ ] Recommendations are learned or cached across sessions
- [ ] Recommendation display is automatic or hard to disable
- [ ] Recommendations infer user intent
- [ ] Recommendations persist beyond session boundary
- [ ] Phase 1 language is modified or weakened
- [ ] Recommendations are treated as actionable by any system
- [ ] Recommendations include action verbs or directives
- [ ] Recommendations use data outside Phase 1 scope

---

## Summary

Phase 2 introduces interpretive recommendations as a read-only synthesis layer over Phase 1 signals.

Recommendations are:
- ✅ Advisory and passive
- ✅ Session-scoped and ephemeral
- ✅ Derived from Phase 1 only
- ✅ Non-actionable and non-authoritative
- ✅ Optional and user-disableable

Recommendations are never:
- ❌ Actionable triggers
- ❌ Control signals
- ❌ Learned patterns
- ❌ Persistent
- ❌ Authoritative

**Phase 1 Enforcement Boundaries remain constitutional. Phase 2 extends observability only.**

---

**Document Status:** Ready for staff review.
**Last Updated:** [Current Date]
**Binding Authority:** Phase 2 Contract, enforceable on all recommendations and Phase 2 extensions.
**Constitutional Override:** Phase 1 Enforcement Boundaries override all Phase 2 language.
