# APL Phase 1 Enforcement Boundaries

**Purpose:** Define what Phase 1 language *actually means* so future engineers cannot "technically comply" while violating intent.

**Status:** Documentation addendum to Phase 1 lock. No code changes. No behavior changes. No new APIs.

**Enforceability:** This addendum is binding on all Phase 1 extensions, Phase 2 proposals, and consumer implementations.

---

## 1. Definition: "Read-Only"

### What Read-Only Means

APL is read-only. This does not mean "no mutations." It means:

1. **No side effects exist in audio processing, DSP, or ANME control flow**
   - Observing APL state must not trigger downstream actions
   - Observing APL state must not acquire locks held by audio threads
   - Observing APL state must not cause re-entrancy or circular waits
   - Side effects MUST NOT occur whether or not ANME observes them

2. **Idempotent reads**
   - Calling `getSnapshot()` N times in sequence must return identical data payloads; only timestamps may vary by system clock
   - Subscribing to events must not change APL state or behavior
   - Unsubscribing must not affect other subscribers or APL operation

3. **No shared mutable state with audio processing**
   - APL buffers are never accessed for writing
   - APL state machine does not interact with audio state machine
   - No shared variables, counters, or flags between APL and DSP

4. **No indirect DSP interaction**
   - APL events do not trigger plugin loading, parameter changes, or offline rendering
   - APL events do not influence transport control (play/pause/seek)
   - APL output cannot be consumed as a control signal by any system

5. **Isolation enforcement**
   - APL can be disabled via feature flag without affecting audio output
   - APL can crash, hang, or be killed without blocking playback or UI
   - Audio remains bit-identical with or without APL enabled
   - Phase 1 policy defines feature flags as observability, logging, or participation only; they do NOT grant authority or execution rights
   - Implementation safety (e.g., "it's impossible to mutate in current code") does not grant future permission to violate this contract

### What Read-Only Does NOT Mean

❌ Read-only does NOT mean "read-only within the same thread"
❌ Read-only does NOT mean "no logging or diagnostics"
❌ Read-only does NOT mean "immutable payloads" (APL may send mutable objects, but consumers must not mutate them)
❌ Read-only does NOT mean "one-way communication" (ANME may read APL, but cannot write back)

### Forbidden Interpretations

- "I can observe APL to decide whether to apply processing" → **NOT ALLOWED**
- "I can use APL state as a gate for DSP initialization" → **NOT ALLOWED**
- "I can defer DSP actions until APL emits a signal" → **NOT ALLOWED**
- "I can cache APL results to avoid recomputation" → **NOT ALLOWED** (APL is not a cache; consuming systems are responsible for their own caching)

---

## 2. Definition: "Advisory"

### What Advisory Means

APL outputs are advisory. This does not mean "optional to read." It means:

1. **Informational only**
   - APL outputs describe observed perceptual state, not prescriptions or goals
   - APL outputs contain no imperatives ("should", "must", "apply", "fix")
   - APL outputs are past-tense or present-tense descriptions only

2. **Never sufficient to cause action**
   - A single APL event (change, embedding, frame) must not trigger any downstream action by itself
   - Multiple APL events combined must not trigger action without explicit secondary consent
   - APL confidence ≥ 0.9 does NOT grant action authority
   - Phase 1 policy defines confidence values as descriptive signals only; thresholds are filtering heuristics, not permissions

3. **No imperative or prescriptive interpretation**
   - An APL payload that says `{ type: 'brighter', magnitude: 0.7 }` does NOT mean "make it brighter"
   - It means "observed brightness increased by 0.7 units since previous window"
   - Any interpretation of "what to do about it" is outside APL scope

4. **Consumers own their decision logic**
   - ANME reads APL signals and decides independently whether to recommend, suggest, or act
   - APL does not recommend. APL observes.
   - The "should" comes from ANME (explicit), not from APL (implicit)

### What Advisory Does NOT Mean

❌ Advisory does NOT mean "low priority"
❌ Advisory does NOT mean "can be ignored"
❌ Advisory does NOT mean "less accurate"
❌ Advisory does NOT mean "optional to implement" (Phase 1 implementations must support advisory reading)

### Forbidden Interpretations

- "High confidence APL events can trigger automatic fixes" → **NOT ALLOWED**
- "APL suggests reference matching, so I should implement reference matching" → **NOT ALLOWED**
- "Multiple APL signals together recommend EQ changes" → **NOT ALLOWED**
- "I can infer user intent from APL output and act without confirmation" → **NOT ALLOWED**

---

## 3. Confidence Semantics

Phase 1 policy defines confidence as non-authoritative. A confidence value never grants permission to act, and any thresholding is a filtering heuristic only. Low confidence must not imply retry, escalation, or auto-correction.

### Explicit Confidence Ranges

APL outputs include `confidence: number` (0.0–1.0). These ranges define allowed behavior:

| Range | Status | Allowed Use | Forbidden Use |
|-------|--------|------------|---------------|
| [0.0–0.5) | Low confidence | Informational only; ask for clarification | Any decision-making; any recommendation |
| [0.5–0.7) | Moderate confidence | Preliminary information; explicitly qualified as uncertain | Primary basis for action; treated as certain |
| [0.7–0.9) | High confidence | Informational; can inform non-binding suggestions | Automatic action; sole basis for decisions |
| [0.9–1.0] | Very high confidence | Can inform strong recommendations; treated as reliable | Automatic execution; assumption of ground truth |

### No Confidence Inflation

**ANME and all consumers MUST NOT:**

1. **Artificially raise confidence through aggregation**
   - AND operation: result confidence = MIN(input confidences)
   - OR operation: result confidence = MAX(input confidences)
   - Voting/majority: result confidence ≤ 0.9 × MIN(input confidences)
   - **Any other aggregation method is FORBIDDEN. Only the three methods above are permitted.**

2. **Infer higher confidence from multiple low-confidence signals**
   - Five 0.6-confidence signals combined = max 0.54 confidence, not 0.8
   - Sequential events with 0.7 confidence each do not accumulate to higher confidence
   - Correlated signals do not cross-validate each other into higher confidence

3. **Use low-confidence signals as tie-breakers**
   - When two equal-confidence outcomes are possible, you MUST NOT use a 0.3-confidence signal to choose between them
   - Phase 1 policy defines missing confidence as 0.1 (low), not interpolation; APL does not automatically enforce this

4. **Assume confidence is stable across time**
   - Confidence at T=1000ms does not apply at T=1010ms
   - Phase 1 policy defines stale APL data (> 5 seconds old) as requiring halved confidence; APL does not automatically enforce this

### Forbidden Interpretations

- "Multiple moderate-confidence signals = high-confidence outcome" → **NOT ALLOWED**
- "I can weight low-confidence signals by relevance to boost effective confidence" → **NOT ALLOWED**
- "High confidence in one dimension means high confidence in correlated dimensions" → **NOT ALLOWED**
- "No confidence value means confidence = neutral (0.5)" → **NOT ALLOWED** (missing = 0.1, low confidence)

---

## 4. Temporal and Causal Boundaries

### Sequential Events Are Independent

**Definition:** Two APL events are independent unless explicitly marked as related.

- Event A at T=1000ms and Event B at T=1010ms MUST be treated as independent (no causal link)
- Sequential changes MUST NOT be inferred to have direction, intent, or relationship
- Temporal proximity MUST NOT be inferred to imply correlation or causality

**Exceptions (Explicitly Allowed):**
- Same perceptual frame (same `timestampMs`): related by definition
- Same embedding window (same `windowStartMs..windowEndMs`): related by definition
- APL payload explicitly marks relationship (e.g., `relatedTo: 'event_id'`): related by declaration
- APL documentation explicitly permits inference: related by specification

### Prohibited Temporal Inferences

**ANME and all consumers MUST NOT infer any of the following. Period. No exceptions:**

- Causality: "Because brightness increased, user wants louder" → **FORBIDDEN**
- Correlation: "Density and brightness both increased; they must be related" → **FORBIDDEN**
- Prediction: "This pattern has appeared before; it will be followed by X" → **FORBIDDEN**
- Attribution: "The change was caused by user action, EQ, or plugin" → **FORBIDDEN** (APL observes effect, not cause)
- User intent: "User increased brightness; user wants brighter mix" → **FORBIDDEN** (may be accidental, unaware, or due to external source)

### Explicitly Allowed Temporal Uses

✅ "Brightness increased at T=1000 and T=2000" (factual description)
✅ "Within the same 2-second window, brightness and loudness both changed" (co-occurrence in same frame)
✅ "Transient energy increased 100ms after user pressed play" (if APL explicitly correlates source and APL events)

### Stale Data Rules

- Phase 1 policy defines APL data older than 5 seconds as stale; APL does not automatically enforce this
- Stale data MUST NOT be used for any recommendation, suggestion, or decision
- Phase 1 policy defines stale data confidence as halved: `stale_confidence = max(original / 2, 0.1)`; APL does not automatically enforce this
- ANME MUST NOT cache and reuse stale APL data as if it were current
- ANME MUST explicitly request fresh APL data before making any recommendation or suggestion

---

## 5. Session Boundaries

### What Resets a Session

A session boundary occurs (all APL state is cleared immediately) when ANY of the following happen:

1. `APLSession.close()` is called
2. `sourceId` changes (new file, new live source, new reference track)
3. Phase 1 policy defines a reset if source duration exceeds 30 minutes; APL does not automatically enforce this
4. Phase 1 policy defines a reset if more than 15 minutes of wall-clock time passes without new audio frames; APL does not automatically enforce this
5. `APLSession.start(newInput)` is called with different input

**Note:** Phase 1 policy defines session boundaries as fixed; APL does not automatically enforce this.

### What Does NOT Reset a Session

Session continues (memory is preserved) during:

- `pause()` / `resume()` (same source)
- `seek()` within the same file
- Phase 1 policy defines that `stop()` followed by `start()` with same sourceId must not be treated as a new session; APL does not automatically enforce this
- Audio playback stopping naturally (end of file)
- User inactivity (APL memory is not auto-cleared)

### Absolute Ban: Cross-Session Aggregation

**ANME and all consumers MUST NOT:**

- Maintain metrics across session boundaries (no "average brightness over 3 sessions")
- Use previous-session APL data to inform current-session recommendations
- Cache session-specific embeddings and use them in future sessions
- Build cross-session models or patterns
- Persist session-derived state in ANME (logs, analytics, debug files are OK only if user-visible and reversible)

### Session Memory Semantics

- Each session is isolated
- Session memory resets on boundary; old data is discarded
- ANME cannot reconstruct old session data (no "session history")
- Fresh session = fresh embeddings, fresh baselines, no inherited confidence

### Forbidden Interpretations

- "I'll log session metrics for analysis later" → **NOT ALLOWED** unless explicitly opt-in and user-visible
- "I'll remember this song's average brightness to recognize it next time" → **NOT ALLOWED**
- "I'll use previous session patterns to guide current session behavior" → **NOT ALLOWED**
- "I'll cache embeddings to skip computation next time" → **NOT ALLOWED** (recompute on each session)

---

## 6. Persistence Definition

### What Counts as Persistence

Persistence includes ANY data written to disk, cache, or long-lived memory:

- **Explicit persistence:** Files, databases, user exports
- **Implicit persistence:** Debug logs, temp files, analytics, cache directories, app preferences
- **Derived persistence:** Metrics computed from APL data, embeddings cached in memory, session histories
- **Silent persistence:** Background analytics, crash reports, auto-save, telemetry
- **Cross-session persistence:** Data that survives after `close()` or session boundary

### Phase 1 Persistence Rule

**ANME and all consumers MUST NOT persist APL-derived data.**

**ONLY these three forms of persistence are permitted in Phase 1. All other persistence is FORBIDDEN:**

1. **Explicit user action**
   - User clicks "Export Session" or "Save Analysis"
   - File is written with user's explicit consent
   - File location is user-visible and reversible
   - User can delete the exported file at any time

2. **Operational logs (labeled and disableable)**
   - Logs marked "System Diagnostics" or "APL Debug Log"
   - User can disable logging via settings or environment variable
   - Phase 1 policy requires logs to avoid persistence of sensitive audio analysis or derived metrics; console diagnostics are not persistence but must remain minimal and user-disableable
   - Logs are purged on app uninstall or manual cache clear

3. **Session cache (ephemeral only)**
   - APL memory within a single session is ephemeral
   - Session ends → memory cleared immediately
   - No persistence across sessions
   - No recovery of old session data

### Forbidden Persistence

❌ No silent analytics (session metrics, usage patterns)
❌ No background cache files (embeddings, feature extractions)
❌ No debug persistence (frame dumps, intermediate signals)
❌ No cross-session aggregation (patterns, histories, averages)
❌ No implicit preferences or learned state
❌ No telemetry or crash reports containing APL data

### Forbidden Interpretations

- "I'll keep a cache of embeddings to speed up future analysis" → **NOT ALLOWED**
- "I'll log session summaries for debugging" → **NOT ALLOWED** unless explicitly shown to user
- "I'll store average brightness by source to recognize patterns" → **NOT ALLOWED**
- "I'll create an analytics dashboard of APL signals over time" → **NOT ALLOWED** without explicit opt-in
- "I'll persist session data in case the user wants to resume" → **NOT ALLOWED** (resume = new session)

---

## 7. Explicit Forbidden Interpretations

### The Checklist: "This Sounds Reasonable But Is Not Allowed"

**All items below are ABSOLUTE PROHIBITIONS, not guidance or preference.**

Use this list when in doubt. If your proposed feature matches any item, it is **BLOCKED in Phase 1. No exceptions. No waivers. No "close enough."**

❌ **Intent & Recommendations (FORBIDDEN)**
- "APL suggests the track needs more brightness" → **FORBIDDEN** (APL observes, does not suggest)
- "Based on APL, I recommend adding presence" → **FORBIDDEN** (APL is advisory; ANME decides independently)
- "APL indicates the user wants a certain sound" → **FORBIDDEN** (APL observes audio, not user intent)
- "I'll use APL confidence to auto-select plugins" → **FORBIDDEN** (auto-selection violates Phase 1)

❌ **Causal & Temporal (FORBIDDEN)**
- "Because brightness increased, I'll reduce harshness" → **FORBIDDEN** (assumption of causality)
- "The pattern suggests this is a pop mix, so I should..." → **FORBIDDEN** (genre inference prohibited)
- "Multiple APL signals together recommend EQ matching" → **FORBIDDEN** (multi-signal action triggering prohibited)
- "This change happened right after user action, so it was caused by..." → **FORBIDDEN** (causal attribution prohibited)

❌ **Persistence & Memory (FORBIDDEN)**
- "I'll remember this song's spectral profile" → **FORBIDDEN** (cross-session memory prohibited)
- "I'll learn user preferences from repeated sessions" → **FORBIDDEN** (learning from APL data prohibited)
- "I'll cache embeddings to avoid recomputation" → **FORBIDDEN** (persistence of APL-derived data prohibited)
- "I'll track session metrics to show progress" → **FORBIDDEN** (cross-session aggregation prohibited)

❌ **Control & Automation (FORBIDDEN)**
- "When APL detects a change, I'll auto-apply a fix" → **FORBIDDEN** (auto-action prohibited)
- "High APL confidence justifies automatic processing" → **FORBIDDEN** (confidence does not grant action authority)
- "I'll use APL to gate DSP initialization" → **FORBIDDEN** (APL cannot control DSP)
- "I'll defer plugin selection until APL is ready" → **FORBIDDEN** (APL does not control processing)

❌ **Inference & Assumptions (FORBIDDEN)**
- "APL says brightness is 0.8; I'll assume audio is 'bright'" → **FORBIDDEN** (interpretation prohibited; use APL's exact terms only)
- "Loudness and density increased; they must be related" → **FORBIDDEN** (correlation inference prohibited)
- "The user must want this fixed" → **FORBIDDEN** (user intent inference prohibited)
- "This audio is similar to previous mixes I've seen" → **FORBIDDEN** (cross-session similarity comparison prohibited)

❌ **Forward Compatibility Assumption (FORBIDDEN)**
- "APL might add recommendations in Phase 2, so I'll design for that now" → **FORBIDDEN** (Phase 2 is separate; no forward design)
- "I'll leave space in the payload for action signals" → **FORBIDDEN** (no affordances for future control signals)
- "I'll design UI to show recommendations even if APL doesn't emit them yet" → **FORBIDDEN** (no Phase 2 forward-porting)

---

## 8. Phase 1 Non-Negotiables

### Immutable Constraints

These constraints **cannot change** without breaking Phase 1. Any Phase 2 proposal that violates these is **automatically BLOCKED**.

1. **Local only**
   - No cloud inference
   - No network calls for APL signals
   - No remote model serving
   - All processing happens on-device

2. **Session-scoped memory only**
   - No cross-session persistence
   - No learned state
   - No user profile or preference tracking
   - Memory resets on session boundary

3. **Read-only surface**
   - No control authority
   - No lifecycle control over other systems
   - No DSP or processing triggers
   - ANME reads APL; APL never reads ANME state

4. **Non-blocking failure**
   - APL errors do not block playback
   - APL errors do not block UI
   - Disabling APL does not affect audio
   - APL crash = graceful degradation, not system failure

5. **Advisory outputs only**
   - No imperatives in payloads
   - No prescriptions or recommendations from APL itself
   - All action decisions belong to ANME or user
   - High confidence ≠ authorization for action

6. **No training or dataset collection**
   - No capture of user audio for model improvement
   - No telemetry of APL results across users
   - No aggregation of perceptual signals for training
   - No "anonymized" collection; all collection forbidden

7. **No DSP, processing, or mutation**
   - APL cannot apply effects or processing
   - APL cannot modify buffers
   - APL cannot create DSP nodes
   - APL cannot trigger plugin loads

8. **Explicit user action required for start (no config, no engineering exceptions)**
   - No auto-start on load or mount
   - No hidden analysis in background
   - No auto-enable via config files, environment variables, or engineer-set defaults
   - APL starts ONLY via direct programmatic call to `session.start()` from application code, triggered by explicit user interaction (button click, menu selection, keyboard shortcut)
   - Config flags cannot enable APL; they can only disable it

9. **Runtime safety is not contract permission**
   - "Impossible in current implementation" does not authorize behavior
   - Only a new, versioned contract can grant permission to act

---

## Enforcement Checklist (For Reviewers)

Use this when evaluating Phase 1 extensions, Phase 2 proposals, or consumer implementations:

### Must Be True For Phase 1 Compliance

- [ ] APL outputs cannot trigger action by themselves
- [ ] APL cannot write to disk or cache without explicit export
- [ ] APL data is isolated per session (no cross-session memory)
- [ ] Confidence is not inflated through aggregation
- [ ] Sequential APL events are treated as independent
- [ ] ANME does not infer user intent from APL signals
- [ ] APL lifecycle is not controlled by ANME
- [ ] Audio remains identical with or without APL
- [ ] APL can be disabled instantly via feature flag
- [ ] APL failures do not block playback or UI
- [ ] No Phase 1 language can be "reasonably reinterpreted" to allow persistence, control, or inference
- [ ] All Phase 1 non-negotiables remain intact

### If ANY of These Are True, Phase 1 Is Broken

- [ ] APL events are used for automatic processing
- [ ] Cross-session data aggregation exists
- [ ] Confidence values are inflated or combined
- [ ] Genre, style, or user intent is inferred
- [ ] APL data persists across sessions
- [ ] DSP or plugin state depends on APL signals
- [ ] Hidden analysis runs in background
- [ ] User cannot disable APL without breaking other systems

---

## Summary

Phase 1 enforces a strict read-only boundary with advisory outputs.

This addendum exists so that future engineers and reviewers cannot "creatively comply" with Phase 1 while violating its intent.

**If you have to ask "is this allowed in Phase 1?" the answer is probably "no."**

When in doubt, refer to the forbidden interpretations and non-negotiables above.

Phase 1 is not aspirational. It is law.

---

**Document Status:** Ready for staff review.
**Last Updated:** [Current Date]
**Binding Authority:** Phase 1 Lock, enforceable on all extensions.
