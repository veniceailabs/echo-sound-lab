# Integration Plan: Listening Pass Service v0.1

**Status:** Planning Phase (No Code Yet)
**Version:** v0.1
**Objective:** Align data flow before wiring implementation

---

## 1. MINIMAL WIRING DIAGRAM (Text-Based)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ECHO SOUND LAB v2.5                              │
│                        Listening Pass Integration                           │
└─────────────────────────────────────────────────────────────────────────────┘

LAYER 1: FRONTEND (Upload & User Control)
═════════════════════════════════════════════════════════════════════════════

    ┌──────────────────────────────────────┐
    │   User Uploads Audio File            │
    │   (UI: Upload Modal)                 │
    └──────────────┬───────────────────────┘
                   │
                   ├─ Extract: AudioBuffer, sampleRate, duration
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │   User Selects Mode                  │
    │   [Friendly Mode] [Advanced Mode]    │
    └──────────────┬───────────────────────┘
                   │
                   ├─ Store: mode selection
                   │
                   ▼

LAYER 2: BACKEND (Analysis Pipeline)
═════════════════════════════════════════════════════════════════════════════

    ┌──────────────────────────────────────────────────────────────┐
    │  Call: listeningPassService.analyzeAudio({                   │
    │    audioBuffer: AudioBuffer,                                 │
    │    sampleRate: 48000,                                        │
    │    duration: 180,                                            │
    │    metadata: { genre?, bpm?, ... },                          │
    │    mode: 'friendly' | 'advanced'                             │
    │  })                                                          │
    └──────────────┬───────────────────────────────────────────────┘
                   │
                   ├─ PROCESSING (No DSP modifications)
                   │
                   ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  Return: ListeningPassOutput {                               │
    │    mode: 'friendly',                                         │
    │    listening_pass: {                                         │
    │      version: '1.0',                                         │
    │      analysis_confidence: 0.88,                              │
    │      tokens: [                                               │
    │        { token_id: 'FATIGUE_EVENT', detected: true, ... },   │
    │        { token_id: 'INTELLIGIBILITY_LOSS', detected: false, },
    │        { token_id: 'INSTABILITY_EVENT', suppressed: true, }  │
    │      ],                                                       │
    │      priority_summary: {                                     │
    │        highest_stage_triggered: 1,                           │
    │        dominant_tokens: ['FATIGUE_EVENT'],                   │
    │        recommended_focus: 'reduce_high_frequency_...',       │
    │        conflicts: []                                         │
    │      }                                                        │
    │    }                                                          │
    │  }                                                            │
    └──────────────┬───────────────────────────────────────────────┘
                   │
                   ├─ SCHEMA-COMPLIANT JSON
                   │ (No hallucination, no invented tokens)
                   │
                   ▼

LAYER 3: LLM REASONING (Friendly Mode Only)
═════════════════════════════════════════════════════════════════════════════

    ┌──────────────────────────────────────────────────────────────┐
    │  IF mode === 'friendly':                                     │
    │    Call: geminiService.reasonAboutListeningPass({            │
    │      listeningPass: output.listening_pass,                   │
    │      mode: 'friendly',                                       │
    │      userContext: { ... }                                    │
    │    })                                                        │
    │  ELSE (Advanced Mode):                                       │
    │    [Optional future: extended reasoning for Stages 2-4]      │
    └──────────────┬───────────────────────────────────────────────┘
                   │
                   ├─ GEMINI_LISTENING_PASS_PROMPT v1.1 (locked)
                   │ Constraints:
                   │   • Schema authority (no invention)
                   │   • Stage hierarchy (1 before 2+)
                   │   • Confidence gating (> 0.6 only)
                   │   • Suppressed tokens invisible
                   │   • Friendly language mandatory
                   │
                   ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  Return: Friendly Mode Recommendations {                     │
    │    summary: "Your mix is listener-friendly with one focus..",│
    │    issues: [                                                 │
    │      {                                                       │
    │        token: 'FATIGUE_EVENT',                               │
    │        severity: 'moderate',                                 │
    │        confidence: 0.81,                                     │
    │        description: "Upper-mid sharpness accumulates...",    │
    │        suggestion: "Consider a gentle de-esser around...",   │
    │        why: "Listeners' ears get tired after 2+ min...",     │
    │      }                                                       │
    │    ],                                                        │
    │    affirmed: [                                               │
    │      "✓ Lead remains intelligible throughout",              │
    │      "✓ Transient behavior is controlled"                   │
    │    ],                                                        │
    │    next_steps: "If you address the upper-mid sharpness..."  │
    │  }                                                            │
    └──────────────┬───────────────────────────────────────────────┘
                   │
                   ├─ PROTECTIVE LANGUAGE GUARANTEED
                   │ (Checked by v1.1 constraints)
                   │
                   ▼

LAYER 4: FRONTEND UI (Presentation & Gating)
═════════════════════════════════════════════════════════════════════════════

    ┌──────────────────────────────────────────────────────────────┐
    │  IF mode === 'friendly':                                     │
    │    Display: Echo Report Card (Friendly)                      │
    │      • Overall confidence score                              │
    │      • What's working (affirmed tokens)                      │
    │      • One actionable focus (highest severity)               │
    │      • Why it matters (listener-centric language)            │
    │      • Suggested fix (non-coercive)                          │
    │                                                              │
    │  ELSE (Advanced Mode):                                       │
    │    Display: Full Report (All tokens + rationale)             │
    │      • All detected issues (Stages 1-4)                      │
    │      • Technical explanations                                │
    │      • Multiple simultaneous suggestions                     │
    └──────────────┬───────────────────────────────────────────────┘
                   │
                   ├─ MODE GATES VISIBILITY, NOT TRUTH
                   │ (Same Listening Pass data, different UI)
                   │
                   ▼
    ┌──────────────────────────────────────────────────────────────┐
    │  User Action:                                                │
    │  [View Raw Data]  [Export Report]  [Apply Suggestion]        │
    └──────────────────────────────────────────────────────────────┘


CRITICAL BOUNDARIES
═════════════════════════════════════════════════════════════════════════════

┌─ Listening Pass Service (Pure Perception)
│  ├─ INPUT: Audio + metadata
│  ├─ OUTPUT: Schema-compliant tokens (deterministic)
│  └─ CONSTRAINT: Read-only, no DSP, no LLM
│
├─ LLM Reasoning Layer (Interpretation)
│  ├─ INPUT: Listening Pass JSON
│  ├─ OUTPUT: Friendly Mode recommendations
│  └─ CONSTRAINT: Schema authority, confidence gating, suppression
│
└─ UI Layer (Presentation)
   ├─ INPUT: Recommendations + user mode
   ├─ OUTPUT: Visual report card or detailed analysis
   └─ CONSTRAINT: Mode gates visibility; data is source of truth

NO CROSS-LAYER MUTATION:
  ✓ Listening Pass never calls LLM
  ✓ LLM never modifies tokens
  ✓ UI never alters recommendations
  ✓ Audio never modified anywhere in pipeline

```

---

## 2. DATA FLOW SUMMARY

| Step | Component | Input | Output | Format |
|------|-----------|-------|--------|--------|
| 1 | Frontend | Audio file | `AudioBuffer`, `sampleRate`, `duration` | Web Audio API |
| 2 | Listening Pass | Audio data | Tokens + priority | JSON (schema v1.0) |
| 3 | LLM Reasoning | Tokens + priority | Recommendations | Text (Friendly Mode) |
| 4 | UI Layer | Recommendations | Visual report | React components |

---

## 3. FRIENDLY VS ADVANCED MODE BRANCHING

```
After Listening Pass analysis:

┌─ Listening Pass Output (Tokens 1-3, all stages)
│
├─ IF mode === 'friendly':
│  │
│  ├─ LLM Reasoning (v1.1 Prompt)
│  │  • Stage 1 only
│  │  • Single recommendation block
│  │  • Protective language mandatory
│  │
│  └─ UI Presentation (Friendly Report Card)
│     • Overall "listener health" score
│     • One clear focus
│     • Affirmed strengths
│     • Non-technical language
│
└─ IF mode === 'advanced':
   │
   ├─ [Future] Extended LLM Reasoning
   │  • Stages 1-4
   │  • Multiple suggestions possible
   │  • Technical explanations
   │
   └─ [Future] UI Presentation (Full Report)
      • All detected issues
      • Technical rationale
      • Full data transparency
```

**Important:** Mode is selected by user, not inferred. Same Listening Pass data feeds both paths.

---

## 4. NO CHANGES REQUIRED TO EXISTING LAYERS

✅ **DSP Engine:** Continues unchanged. Listening Pass is read-only.
✅ **UI Components:** Existing layout preserved. Only new "Echo Report Card" section added.
✅ **Gemini Service:** Uses existing infrastructure. Only new prompt method added.
✅ **Audio Processing:** Not modified by Listening Pass output.

---

## 5. INTEGRATION CHECKLIST (Before Implementation)

- [ ] Listening Pass Service confirmed in `/src/services/listeningPassService.ts`
- [ ] Integration points identified (upload handler, LLM pipeline, UI rendering)
- [ ] Mode selection UI in place (Friendly/Advanced toggle)
- [ ] Error handling planned (network, audio parsing, LLM timeouts)
- [ ] Logging/monitoring identified (performance, determinism validation)

---

## Status

**Ready for:** Happy-Path Walkthrough + Code Review
**Next phase:** Implementation (After approval)
