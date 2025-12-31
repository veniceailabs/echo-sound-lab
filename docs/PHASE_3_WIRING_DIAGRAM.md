# Phase 3 Wiring Diagram: Boundaries & Data Flow

**Purpose:** Clear visual of Listening Pass → LLM → UI with exact boundary points

**Scope:** Text-based minimal diagram (no code)

---

## COMPLETE SIGNAL FLOW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  ECHO SOUND LAB v2.5 - SIGNAL FLOW                      │
│                    (Phase 2 + Phase 3 Combined)                         │
└─────────────────────────────────────────────────────────────────────────┘


1️⃣  FRONTEND ENTRY
    ═════════════════════════════════════════════════════════════════════

    User Action:
    ┌──────────────────────┐
    │ [Upload Audio File]  │
    └──────────┬───────────┘
               │
               ▼
    App.tsx: handleFileUpload(file)



2️⃣  PHASE 2: PERCEPTION (Read-Only Analysis)
    ═════════════════════════════════════════════════════════════════════

    ┌────────────────────────────────────────────────────────────────────┐
    │ LISTENING PASS SERVICE (Phase 2 - Unchanged in Phase 3)           │
    │                                                                    │
    │  Input:  AudioBuffer + sampleRate + duration + mode              │
    │  ──────────────────────────────────────────────────────────────  │
    │  Process: Deterministic analysis (3 token detectors)             │
    │           No randomness, no timing leaks, read-only audio        │
    │  ──────────────────────────────────────────────────────────────  │
    │  Output: ListeningPassOutput {                                   │
    │            mode: 'friendly'                                      │
    │            listening_pass: {                                     │
    │              version: '1.0'                                      │
    │              analysis_confidence: 0-1                            │
    │              tokens: [3 token objects]                           │
    │              priority_summary: {                                 │
    │                dominant_tokens: []  ← Source of truth            │
    │                highest_stage_triggered: 0-4                      │
    │                recommended_focus: string | null                  │
    │                conflicts: []                                     │
    │              }                                                   │
    │            }                                                     │
    │            _analysis: { timing, window counts, ... }             │
    │          }                                                       │
    │                                                                  │
    │ ✓ Schema v1.0 compliant                                         │
    │ ✓ Deterministic (same input → same output always)               │
    │ ✓ Confidence gating already applied (dominant only ≥0.6)        │
    │ ✓ Suppressed tokens already filtered (not in dominant_tokens)   │
    └────┬───────────────────────────────────────────────────────────┘
         │
         ▼
    ListeningPassOutput stored in state


3️⃣  PHASE 3: INTERPRETATION (NEW - LLM Translation Layer)
    ═════════════════════════════════════════════════════════════════════

    [FEATURE FLAG: LISTENING_PASS_ENABLED must be true to proceed]
              │
              ▼
    [FEATURE FLAG: LLM_REASONING_ENABLED? true/false]


    IF LLM_REASONING_ENABLED == true:

         ┌──────────────────────────────────────────────────────────┐
         │ LLM REASONING CALL (geminiService)                       │
         │                                                          │
         │ Input Boundary:                                         │
         │ ────────────────────────────────────────────────────── │
         │                                                          │
         │ reasonAboutListeningPass({                               │
         │   listeningPass: {                                       │
         │     version, analysis_confidence, tokens, priority_sum  │
         │   },                                                     │
         │   mode: 'friendly',   ← Hardcoded, no user choice       │
         │   userContext: { ... } ← Reserved for Phase 4+          │
         │ })                                                       │
         │                                                          │
         │ Contract Enforcement:                                   │
         │ ────────────────────────────────────────────────────── │
         │ ✓ LLM_OUTPUT_CONTRACT.md v1.0 applied                   │
         │ ✓ Allowed language only (positive list)                 │
         │ ✓ Forbidden language blocked (negative list)            │
         │ ✓ Single dominant focus enforced                        │
         │ ✓ Suppressed tokens absolutely invisible                │
         │ ✓ Confidence gating respected (no < 0.6 recommendations)│
         │ ✓ Silence rules absolute (no invented problems)         │
         │ ✓ Friendly Mode tone mandatory                          │
         │                                                          │
         │ Processing:                                             │
         │ ────────────────────────────────────────────────────── │
         │ 1. Read priority_summary.dominant_tokens                │
         │ 2. If empty: Generate reassurance                       │
         │ 3. If populated: Translate to Friendly Mode text        │
         │ 4. Affirm working elements (non-detected tokens)        │
         │ 5. Never reference suppressed tokens                    │
         │ 6. Return single focused guidance or silence            │
         │                                                          │
         │ Output Boundary:                                        │
         │ ────────────────────────────────────────────────────── │
         │                                                          │
         │ Returns: LLMGuidanceOutput {                             │
         │   guidance_text: string,  ← User-facing text            │
         │   processing: {                                         │
         │     tokens_read: number,                                │
         │     confidence_level: number,                           │
         │     mode: string,                                       │
         │     dominant_token: string | null                       │
         │   }                                                      │
         │ }                                                        │
         │                                                          │
         │ Guarantees:                                             │
         │ ✓ String only (no JSON, no structured objects)          │
         │ ✓ 100-500 characters (not overwhelming)                 │
         │ ✓ Contract-compliant language                           │
         │ ✓ No schema fields invented                             │
         │ ✓ Deterministic per Listening Pass input                │
         └────┬───────────────────────────────────────────────────┘
              │
              ▼
         LLMGuidanceOutput stored in state


    IF LLM_REASONING_ENABLED == false:

         LLM skipped entirely
              │
              ▼
         llmGuidance = null
         (UI renders Listening Pass data only - Phase 2 output)


    ERROR / TIMEOUT HANDLING:
    ────────────────────────────────────────────────────────────────

    If LLM call fails (timeout, error, malformed):

      ┌─ [LLM_FALLBACK_ON_ERROR == true]
      │   └─ Use Listening Pass data directly
      │      Render basic summary + "AI reasoning unavailable"
      │
      └─ [LLM_FALLBACK_ON_ERROR == false]
         └─ Show error: "AI reasoning temporarily unavailable"
            Render Listening Pass data with error notice


4️⃣  FRONTEND STORAGE (State)
    ═════════════════════════════════════════════════════════════════════

    App.tsx state after Phase 3:

    {
      listeningPassResult: ListeningPassOutput,  ← From Phase 2
      llmGuidance: LLMGuidanceOutput | null,     ← From Phase 3 (or null)
      showRawJSON: boolean,                      ← Toggle for debug
    }


5️⃣  UI RENDERING (Future - Phase 4+)
    ═════════════════════════════════════════════════════════════════════

    Echo Report Card Component (not implemented in Phase 3)

    Will render:
      ├─ LLM guidance text (if available)
      ├─ Listening Pass tokens (raw view option)
      ├─ Affirmations section
      └─ Action buttons (Try Fix, Export, etc.)

    Phase 3: No UI changes (infrastructure only)


═══════════════════════════════════════════════════════════════════════════

CRITICAL BOUNDARIES (Walls Between Layers)
═══════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM CANNOT ACCESS:                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Audio Layer:                                                            │
│  ──────────────                                                          │
│  ✗ Raw AudioBuffer (no direct audio waveform)                           │
│  ✗ FFT data                                                              │
│  ✗ Frequency bins                                                        │
│  ✗ Real-time playback state                                             │
│                                                                          │
│  DSP Layer:                                                              │
│  ──────────                                                              │
│  ✗ Compression parameters                                               │
│  ✗ EQ settings                                                           │
│  ✗ Limiter thresholds                                                    │
│  ✗ Processing chain                                                      │
│  ✗ Any ability to modify audio                                          │
│                                                                          │
│  Schema Layer:                                                           │
│  ─────────────                                                           │
│  ✗ Cannot add new fields to output                                      │
│  ✗ Cannot modify token structure                                        │
│  ✗ Cannot invent new token types                                        │
│  ✗ Cannot extend priority_summary fields                                │
│                                                                          │
│  Creativity Layer:                                                       │
│  ─────────────────                                                       │
│  ✗ Cannot invent problems not in dominant_tokens                        │
│  ✗ Cannot reference suppressed tokens                                   │
│  ✗ Cannot expand beyond contract language                               │
│  ✗ Cannot create urgency or shame                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM CAN ONLY ACCESS:                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Listening Pass Output (Read-Only):                                      │
│  ─────────────────────────────────                                       │
│  ✓ listening_pass.tokens[3]           (3 token objects, full data)      │
│  ✓ listening_pass.priority_summary    (dominant_tokens, focus, etc)     │
│  ✓ listening_pass.version             (schema version)                  │
│  ✓ listening_pass.analysis_confidence (overall confidence 0-1)          │
│                                                                          │
│  Mode Specification:                                                     │
│  ─────────────────────                                                   │
│  ✓ mode: 'friendly'  (Hardcoded in Phase 3)                             │
│                                                                          │
│  User Context (Reserved):                                                │
│  ────────────────────────                                                │
│  ✓ genre (optional, not used in Phase 3)                                │
│  ✓ bpm (optional, not used in Phase 3)                                  │
│                                                                          │
│  That's it. Nothing else.                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════

DECISION POINTS (Where Execution Branches)
═══════════════════════════════════════════════════════════════════════════

Checkpoint 1: LISTENING_PASS_ENABLED?
  ├─ true  → Continue to checkpoint 2
  └─ false → Stop. No analysis runs.

Checkpoint 2: LISTENING_PASS_SUCCESS?
  ├─ true  → Continue to checkpoint 3
  └─ false → Stop. No LLM call.

Checkpoint 3: LLM_REASONING_ENABLED?
  ├─ true  → Continue to checkpoint 4
  └─ false → Skip LLM, render Listening Pass only

Checkpoint 4: LLM_CALL_SUCCESS?
  ├─ true  → Continue to checkpoint 5
  └─ false → Go to checkpoint 5 (fallback path)

Checkpoint 5: LLM_FALLBACK_ON_ERROR?
  ├─ true  → Use Listening Pass data + fallback text
  └─ false → Show error message

Checkpoint 6: RENDER UI
  └─ Display available data (LLM + Listening Pass, or Listening Pass only)


═══════════════════════════════════════════════════════════════════════════

ROLLBACK POINTS (Where to Cut If Things Break)
═══════════════════════════════════════════════════════════════════════════

Level 1 (Disable LLM only):
  Set: FEATURE_FLAGS.LLM_REASONING_ENABLED = false
  Effect: Listening Pass continues, LLM skipped
  Risk: None (Phase 2 still works)
  Rebuild: Not required

Level 2 (Disable Fallback):
  Set: FEATURE_FLAGS.LLM_FALLBACK_ON_ERROR = false
  Effect: Show errors instead of graceful degradation
  Risk: User sees error messages
  Rebuild: Not required

Level 3 (Disable Both Listening Pass + LLM):
  Set: FEATURE_FLAGS.LISTENING_PASS_ENABLED = false
  Effect: Entire analysis layer skipped (Phase 1 mode)
  Risk: None (system continues unchanged)
  Rebuild: Not required


═══════════════════════════════════════════════════════════════════════════

DATA CONTRACTS AT EACH BOUNDARY

Listening Pass → LLM
┌────────────────────────────────────────────────────────────┐
│ Guaranteed Input                                           │
├────────────────────────────────────────────────────────────┤
│ ✓ ListeningPassOutput is schema v1.0 compliant             │
│ ✓ No randomness (deterministic)                            │
│ ✓ Confidence gating already applied (≥0.6)                 │
│ ✓ Suppression already applied (not in dominant_tokens)     │
│ ✓ All enum values valid (no 'N/A')                         │
│ ✓ Same input forever produces identical output             │
└────────────────────────────────────────────────────────────┘

LLM → Frontend
┌────────────────────────────────────────────────────────────┐
│ Guaranteed Output                                          │
├────────────────────────────────────────────────────────────┤
│ ✓ guidance_text is string (100-500 chars)                  │
│ ✓ No forbidden language (validated by contract)            │
│ ✓ Single focus honored (one dominant only)                 │
│ ✓ Suppressed tokens never mentioned                        │
│ ✓ Friendly Mode tone (no clinical, no coercion)            │
│ ✓ No schema fields invented                                │
│ ✓ Deterministic per Listening Pass input                   │
└────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════

FAILURE MODE MATRIX

┌─────────────────────┬──────────────┬──────────────────────────────┐
│ Failure Mode        │ Probability  │ User Experience              │
├─────────────────────┼──────────────┼──────────────────────────────┤
│ LLM Timeout         │ Low          │ Shows fallback + data         │
│ LLM Malformed Out   │ Very Low     │ Truncates + renders safely   │
│ LLM References Supp │ Very Low     │ Logged as warning            │
│ LLM Uses Forbidden  │ Very Low     │ Logged, text still renders   │
│ Listening Pass Fail │ Very Low     │ Stops, error shown           │
│ Both Fail           │ Extremely Low│ Returns to upload screen     │
└─────────────────────┴──────────────┴──────────────────────────────┘

All failures are non-blocking (system degrades gracefully).
User always sees something useful.


═══════════════════════════════════════════════════════════════════════════

TESTING CHECKPOINTS (Phase 3 Implementation)

When code is written, verify:

□ Listening Pass call works (Phase 2)
□ LLM call made only if flag ON
□ LLM receives ListeningPassOutput only (no extra data)
□ LLM output is string (not JSON)
□ Suppressed tokens never mentioned
□ Confidence gate respected (< 0.6 not recommended)
□ Single focus honored (no bundled suggestions)
□ Fallback works (LLM disabled + error modes)
□ Rollback works (feature flags disable instantly)
□ No schema changes
□ No UI changes
□ No DSP changes

```

---

## WIRING SUMMARY

**What Flows Left → Right:**
1. Audio file → Listening Pass → ListeningPassOutput
2. ListeningPassOutput → LLM → LLMGuidanceOutput (text)
3. Both outputs → Frontend state → UI ready for rendering

**What Flows Back (None):**
- LLM never modifies Listening Pass
- Listening Pass never calls LLM
- UI never calls Listening Pass
- No circular dependencies

**What Never Happens:**
- Audio never goes to LLM
- LLM never touches DSP
- UI never infers new data
- Suppressed tokens never visible
- Schema never extended

**What Always Happens:**
- Listening Pass is read-only
- LLM is contract-bound
- Failures are graceful
- Silence is respected
- Rollback is instant

---

## Phase 3 Wiring: COMPLETE (Planning Only)

Ready for review and approval before implementation begins.
