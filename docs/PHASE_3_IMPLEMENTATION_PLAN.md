# Phase 3: Implementation Plan (Code-Level Planning)

**Objective:** Identify exact integration points, contracts, and failure handling for LLM reasoning layer

**Scope:** Planning only. No code written. No schema changes. No UI changes.

**Principle:** LLM is a translator, not an actor. Input: ListeningPassOutput. Output: String guidance text.

---

## 1. HOOK POINT: WHERE LLM IS CALLED

### Current Architecture (Phase 2)
```
App.tsx handleFileUpload()
    ↓
listeningPassService.analyzeAudio()
    ↓
ListeningPassOutput (JSON)
    ↓
[Phase 3 Hook Point TBD]
```

### Phase 3 Hook Point Specification

**Location:** `src/services/geminiService.ts` (existing file, new method)

**Trigger Point:** After Listening Pass analysis completes and ListeningPassOutput is available

**Method Name:** `reasonAboutListeningPass()` (new method, to be added)

**Call Site:** In `App.tsx` `handleFileUpload()` function, after Listening Pass completes

**Exact Flow:**
```typescript
// In handleFileUpload(), after Listening Pass analysis:
if (FEATURE_FLAGS.LISTENING_PASS_ENABLED && listeningPassResult) {
  try {
    const llmGuidance = await geminiService.reasonAboutListeningPass({
      listeningPass: listeningPassResult.listening_pass,
      mode: 'friendly', // Hardcoded for Phase 3
      userContext: {
        genre: undefined,
        bpm: undefined,
      },
    });

    // Store for UI rendering
    setLLMGuidance(llmGuidance);
  } catch (error) {
    console.error('[LLM Reasoning Error]', error);
    // Fail gracefully - continue with Listening Pass data only
  }
}
```

---

## 2. INPUT CONTRACT: LLM RECEIVES

### Interface: `LLMReasoningInput`

```typescript
interface LLMReasoningInput {
  // Listening Pass data (read-only, no modification)
  listeningPass: {
    version: string;                    // "1.0"
    analysis_confidence: number;        // 0-1, 2 decimals
    tokens: Token[];                    // Array of 3 tokens
    priority_summary: {
      highest_stage_triggered: number;  // 0-4
      dominant_tokens: TokenId[];       // Empty array if no action
      recommended_focus: string;        // null or string
      conflicts: string[];              // Array (may be empty)
    };
  };

  // Mode selection (Friendly Mode only in Phase 3)
  mode: 'friendly'; // Hardcoded, not user-selectable yet

  // Optional context (not used in Phase 3, reserved for Phase 4)
  userContext?: {
    genre?: string;
    bpm?: number;
  };
}
```

### Data Guarantees (Contracts)

- ✅ `listeningPass` is schema v1.0 compliant (passed from Phase 2)
- ✅ `tokens` array always has exactly 3 elements (FATIGUE, INTELLIGIBILITY, INSTABILITY)
- ✅ `dominant_tokens` is either empty [] or contains one or more TokenIds
- ✅ Suppressed tokens are filtered OUT of `dominant_tokens` (by Phase 2)
- ✅ Confidence gating (< 0.6) applied by Phase 2 (only ≥0.6 in dominant_tokens)
- ✅ All enum values valid (no 'N/A', no invalid severity/trend values)

### What LLM CANNOT Access

- ❌ Raw audio buffer (no direct audio)
- ❌ DSP configuration (no synthesis access)
- ❌ User profile or history (no personalization data)
- ❌ Advanced Mode specifics (Phase 3 is Friendly only)
- ❌ Real-time playback state (analysis is static, off-line)

---

## 3. OUTPUT CONTRACT: LLM RETURNS

### Interface: `LLMGuidanceOutput`

```typescript
interface LLMGuidanceOutput {
  // Primary output: Human-readable guidance text
  guidance_text: string;
  // Max 500 characters, Friendly Mode tone per LLM_OUTPUT_CONTRACT.md

  // Metadata for UI rendering (parsed from guidance_text)
  parsed_structure?: {
    focus_area?: string;
    why_it_matters?: string;
    what_to_explore?: string;
    strengths?: string[];
    next_steps?: string;
  };

  // Processing metadata (for logging/debugging)
  processing: {
    tokens_read: number;              // How many tokens LLM considered
    confidence_level: number;         // Overall confidence in output
    mode: string;                     // 'friendly'
    dominant_token: string | null;    // Which token was focus (if any)
  };
}
```

### Output Guarantees (Contracts)

- ✅ `guidance_text` is string only (no structured JSON in user-facing output)
- ✅ Text follows LLM_OUTPUT_CONTRACT.md rules (allowed/forbidden language)
- ✅ Text is Friendly Mode only (calm, observational, non-coercive)
- ✅ Length: 100-500 characters (not too short, not overwhelming)
- ✅ If no recommendations: Returns reassurance only (never "no problems")
- ✅ Suppressed tokens never mentioned (not even positively)
- ✅ Single focus honored (one dominant observation or affirmation)
- ✅ No schema fields invented (output is compatible with v1.0)

### What LLM CANNOT Output

- ❌ Recommendations beyond what's in `dominant_tokens`
- ❌ Technical DSP instructions (no "cut 4dB at 7kHz")
- ❌ Directives or urgency ("you must," "before release")
- ❌ Shame or judgment language
- ❌ References to suppressed tokens
- ❌ Clinical/diagnostic framing
- ❌ Multiple simultaneous recommendations

---

## 4. FAILURE HANDLING

### Timeout Handling

**Scenario:** Gemini API times out (>30 seconds)

```typescript
// In geminiService.reasonAboutListeningPass():
const timeout = 30000; // 30 seconds
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('LLM timeout')), timeout)
);

try {
  const response = await Promise.race([geminiAPICall(), timeoutPromise]);
} catch (error) {
  if (error.message === 'LLM timeout') {
    // Fallback: Return Listening Pass data with technical summary
    return {
      guidance_text: "Analysis complete. AI reasoning temporarily unavailable. " +
                     "Review the raw analysis data in View Details.",
      processing: { tokens_read: 0, confidence_level: 0, mode: 'fallback' }
    };
  }
}
```

**User Experience:** Analysis still visible, LLM summary skipped gracefully

---

### Empty Response Handling

**Scenario:** LLM returns empty string or null

```typescript
// Validation before return:
if (!response || response.guidance_text?.trim().length === 0) {
  return {
    guidance_text: "No listener concerns detected. Your mix is ready.",
    processing: { tokens_read: 3, confidence_level: 0.95, mode: 'fallback' }
  };
}
```

**User Experience:** Reassurance provided even if LLM fails to respond

---

### Malformed Response Handling

**Scenario:** LLM returns invalid JSON or violates contract

```typescript
// Validation:
const validateOutput = (output: any): LLMGuidanceOutput => {
  if (!output.guidance_text || typeof output.guidance_text !== 'string') {
    throw new Error('Invalid LLM output: guidance_text missing or not string');
  }

  if (output.guidance_text.length > 500) {
    // Truncate to contract maximum
    output.guidance_text = output.guidance_text.substring(0, 500) + '...';
  }

  // Check for forbidden language patterns (basic)
  const forbiddenPatterns = ['fix', 'problem', 'wrong', 'should', 'must'];
  for (const pattern of forbiddenPatterns) {
    if (output.guidance_text.toLowerCase().includes(pattern)) {
      console.warn(`[LLM Warning] Forbidden word detected: "${pattern}"`);
    }
  }

  return output;
};
```

**User Experience:** Contract violations logged but non-blocking (text still rendered)

---

### No Active Tokens (Empty dominant_tokens)

**Scenario:** Listening Pass found nothing worth recommending

```typescript
// In handleFileUpload() after LLM call:
if (listeningPassResult.listening_pass.priority_summary.dominant_tokens.length === 0) {
  // LLM should return reassurance
  // If LLM fails, fallback:
  const fallbackGuidance = "No listener concerns detected. Your mix is in great shape.";
}
```

**User Experience:** Always have reassurance text (no blank screen)

---

## 5. FEATURE FLAG STRATEGY

### Flags (Reuse Phase 2)

**`FEATURE_FLAGS.LISTENING_PASS_ENABLED`**
- Controls whether Listening Pass runs
- Also gates LLM call (no LLM without analysis)

**New (Phase 3): `FEATURE_FLAGS.LLM_REASONING_ENABLED`**
- When true: LLM reasoning runs after Listening Pass
- When false: Listening Pass runs, LLM skipped, UI shows raw Listening Pass data
- Default: true (LLM is the new default in Phase 3)
- Runtime toggle: `window.__DEBUG__.toggleLLMReasoning()`

**New (Phase 3): `FEATURE_FLAGS.LLM_FALLBACK_ON_ERROR`**
- When true: Use Listening Pass data directly if LLM fails
- When false: Show error message "AI reasoning unavailable"
- Default: true (graceful degradation)

### Feature Flag Usage

```typescript
// In handleFileUpload():
if (FEATURE_FLAGS.LISTENING_PASS_ENABLED && listeningPassResult) {
  if (FEATURE_FLAGS.LLM_REASONING_ENABLED) {
    try {
      const llmGuidance = await geminiService.reasonAboutListeningPass({...});
      setLLMGuidance(llmGuidance);
    } catch (error) {
      if (FEATURE_FLAGS.LLM_FALLBACK_ON_ERROR) {
        // Use Listening Pass data, skip LLM
        console.warn('[LLM] Reasoning failed, using Listening Pass data');
        setLLMGuidance(null);
      } else {
        // Show error
        console.error('[LLM] Reasoning failed and fallback disabled', error);
      }
    }
  } else {
    // LLM disabled, use Listening Pass only
    setLLMGuidance(null);
  }
}
```

### Rollback Strategy

**If LLM causes issues:**
```typescript
// In featureFlags.ts:
LLM_REASONING_ENABLED: false, // Disable instantly
```

No rebuild required. Phase 2 (Listening Pass) continues to work.

---

## 6. INTEGRATION FILES (No Changes Yet, Planning Only)

### Files That Will Be Modified (Phase 3 Implementation)

| File | Change | Lines | Risk | Status |
|------|--------|-------|------|--------|
| `src/config/featureFlags.ts` | ADD 2 new flags | +20 | None | Planning |
| `src/services/geminiService.ts` | ADD `reasonAboutListeningPass()` method | +60 | Low | Planning |
| `src/App.tsx` | ADD LLM call in handleFileUpload | +25 | Low | Planning |
| `src/types.ts` | ADD `LLMGuidanceOutput` type | +15 | None | Planning |

### Files That Will NOT Change

- ❌ `listeningPassService.ts` (Phase 2, locked)
- ❌ `audioEngine.ts` (DSP untouched)
- ❌ UI components (no rendering changes in Phase 3)
- ❌ DSP processing pipeline (read-only)

---

## 7. MINIMAL WIRING DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│              ECHO SOUND LAB v2.5 - PHASE 3                  │
│           LLM as Constrained Interpreter Layer              │
└─────────────────────────────────────────────────────────────┘

LAYER 1: FRONTEND (Upload)
═════════════════════════════════════════════════════════════
    User Uploads Audio
         ↓
    App.tsx handleFileUpload()
    [PHASE 2 HOOK: Listening Pass called]


LAYER 2: PERCEPTION (Phase 2 - No changes in Phase 3)
═════════════════════════════════════════════════════════════
    listeningPassService.analyzeAudio()
         ↓
    [No DSP modification]
         ↓
    ListeningPassOutput (schema v1.0)
    {
      mode: 'friendly'
      listening_pass: { tokens[], priority_summary }
      _analysis: { windows, duration, ... }
    }


LAYER 3: INTERPRETATION (Phase 3 NEW)
═════════════════════════════════════════════════════════════
    [PHASE 3 HOOK: LLM Reasoning called]
         ↓
    geminiService.reasonAboutListeningPass()
         │
         ├─ Input: ListeningPassOutput (read-only)
         ├─ Process: Apply LLM_OUTPUT_CONTRACT.md
         └─ Output: LLMGuidanceOutput (string text)
         ↓
    ┌─────────────────────────────────────────┐
    │ LLM Processing (Contract-Bound)         │
    │  ✓ Single dominant focus only          │
    │  ✓ Respect confidence gating (≥0.6)    │
    │  ✓ Suppress visibility (omit entirely)  │
    │  ✓ Friendly Mode tone                   │
    │  ✓ No clinical/diagnostic language      │
    │  ✓ No coercion ("should," "must")       │
    │  ✓ Affirm working elements              │
    └─────────────────────────────────────────┘
         ↓
    LLMGuidanceOutput
    {
      guidance_text: "Your mix is listener-friendly with..."
      processing: { tokens_read, confidence_level, ... }
    }


LAYER 4: FRONTEND STORAGE
═════════════════════════════════════════════════════════════
    App.tsx State
    {
      listeningPassResult: ListeningPassOutput,
      llmGuidance: LLMGuidanceOutput (if LLM enabled)
    }


LAYER 5: UI RENDERING (Future - Phase 4)
═════════════════════════════════════════════════════════════
    Echo Report Card Component
         ↓
    [No changes in Phase 3 - UI prep for Phase 4]


CRITICAL BOUNDARIES
═════════════════════════════════════════════════════════════

LLM Cannot Cross:
  ├─ Audio: No direct buffer access
  ├─ DSP: No parameter modification
  ├─ Schema: No new fields
  ├─ UI: No rendering code
  └─ Creativity: No expansion beyond contract

LLM Can Only:
  ├─ Read Listening Pass tokens
  ├─ Respect priority_summary absolutely
  ├─ Translate to Friendly Mode text
  └─ Output string guidance (nothing else)


FAILURE PATHS
═════════════════════════════════════════════════════════════

Timeout (>30s)
  → Fallback: Return reassurance + "AI unavailable"
  → User sees Listening Pass data + basic summary

Empty Response
  → Fallback: Return standard reassurance
  → User sees "No concerns detected"

Malformed Output
  → Validation layer catches + logs
  → Truncates to contract maximum
  → Non-blocking (text still renders)

No Recommendations (empty dominant_tokens)
  → LLM returns reassurance
  → Fallback ensures always have text
  → User never sees blank screen


FEATURE FLAGS (Phase 3 Addition)
═════════════════════════════════════════════════════════════

LISTENING_PASS_ENABLED (Phase 2 reuse)
  └─ Gates all downstream analysis

LLM_REASONING_ENABLED (NEW)
  ├─ false: Listening Pass only, skip LLM
  └─ true: Run LLM after Phase 2

LLM_FALLBACK_ON_ERROR (NEW)
  ├─ false: Show error if LLM fails
  └─ true: Use Listening Pass data if LLM fails

Runtime Toggle (dev only):
  window.__DEBUG__.toggleLLMReasoning()


DETERMINISM & SAFETY
═════════════════════════════════════════════════════════════

✅ Same Listening Pass input → Same LLM input
✅ Contract ensures same LLM behavior
✅ Output never persists (no learning/drift)
✅ Suppression rules absolutely enforced
✅ Confidence gating non-negotiable
✅ Silence honored (reassurance is complete response)
```

---

## 8. IMPLEMENTATION SEQUENCE (When Approved)

**Step 1:** Update featureFlags.ts (+2 new flags)
**Step 2:** Add types to types.ts (+LLMGuidanceOutput)
**Step 3:** Add reasonAboutListeningPass() to geminiService.ts
**Step 4:** Wire LLM call in App.tsx handleFileUpload()
**Step 5:** Test with flags ON/OFF
**Step 6:** Verify contract compliance (no forbidden language, etc.)

---

## 9. NO CODE YET

This is planning only. No implementation code written.

**When Phase 3 Implementation is approved**, exact line numbers, method signatures, and error handling will be written.

**For now:** This plan establishes:
- ✅ Hook points (where code goes)
- ✅ Contracts (what goes in/out)
- ✅ Failure modes (what happens if things break)
- ✅ Feature flags (how to disable instantly)
- ✅ Boundaries (what LLM cannot touch)

---

## Status: Phase 3 Implementation Plan COMPLETE (Planning Only)

Ready for review and approval before code begins.
