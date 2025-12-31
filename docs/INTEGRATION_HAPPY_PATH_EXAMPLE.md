# Integration Happy Path: Single End-to-End Example

**Scenario:** User uploads a 3-minute pop mix in Friendly Mode
**Outcome:** Echo Report Card with one actionable recommendation

---

## STEP 1: USER UPLOADS AUDIO

**Frontend Action:**
```
User clicks [Upload Audio]
  → Selects: "vocal_mix_final.wav" (3:00, 48kHz stereo)
  → Selects: [Friendly Mode] (default)
  → Clicks: [Analyze]
```

**Data State:**
```javascript
{
  audioFile: File {
    name: "vocal_mix_final.wav",
    size: 1728000,
    type: "audio/wav"
  },
  mode: "friendly"
}
```

---

## STEP 2: AUDIO PROCESSING (No DSP Changes)

**Frontend Reads File:**
```javascript
// In upload handler:
const arrayBuffer = await file.arrayBuffer();
const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

// Extract metadata:
const sampleRate = audioBuffer.sampleRate; // 48000
const duration = audioBuffer.duration;     // 180 (seconds)
```

**No audio modification happens here.**

---

## STEP 3: LISTENING PASS SERVICE ANALYZES

**Backend Call:**
```javascript
const listeningPassResult = await listeningPassService.analyzeAudio({
  audioBuffer: audioBuffer,        // Web Audio AudioBuffer
  sampleRate: 48000,
  duration: 180,
  metadata: {
    genre: "pop",
    bpm: 120
  },
  mode: "friendly"
});
```

**Analysis Runs (v0.1 Heuristics):**
```
Window Analysis:
  • 90 × 2-second windows (Fatigue detection)
  • 180 × 1-second windows (Intelligibility detection)
  • 360 × 0.5-second windows (Instability detection)

Processing time: ~285ms
```

**Listening Pass Returns:**
```json
{
  "mode": "friendly",
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.81,
    "tokens": [
      {
        "token_id": "FATIGUE_EVENT",
        "stage": 1,
        "detected": true,
        "severity": "moderate",
        "confidence": 0.81,
        "trend": "escalating",
        "listener_impact": "Upper-mid sharpness accumulates, particularly during choruses. May cause listening fatigue after 2+ minutes on headphones.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": {
          "start_sec": 0,
          "end_sec": 180,
          "pattern": "escalating_toward_chorus"
        }
      },
      {
        "token_id": "INTELLIGIBILITY_LOSS",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.95,
        "trend": "isolated",
        "listener_impact": "Lead remains clear and intelligible throughout.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": null
      },
      {
        "token_id": "INSTABILITY_EVENT",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.92,
        "trend": "isolated",
        "listener_impact": "Transient behavior is predictable and controlled.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": null
      }
    ],
    "priority_summary": {
      "highest_stage_triggered": 1,
      "dominant_tokens": ["FATIGUE_EVENT"],
      "recommended_focus": "reduce_high_frequency_accumulation",
      "conflicts": []
    }
  },
  "_analysis": {
    "start_ms": 0,
    "end_ms": 180000,
    "duration_s": 180,
    "windows_analyzed": 630
  }
}
```

**Key Observations:**
- ✅ Only Token 1 (Fatigue) detected
- ✅ Tokens 2 & 3 affirmed (not broken)
- ✅ Suppression logic applied (none suppressed in this case)
- ✅ Confidence values are deterministic (same input → same output)
- ✅ No invented problems

---

## STEP 4: LLM REASONING (Friendly Mode)

**Backend Call:**
```javascript
const recommendations = await geminiService.reasonAboutListeningPass({
  listeningPass: listeningPassResult.listening_pass,
  mode: "friendly",
  userContext: {
    genre: "pop",
    mixingLevel: "amateur"  // Optional user feedback
  }
});
```

**Prompt Sent to Gemini (v1.1 locked):**
```
[GEMINI_LISTENING_PASS_PROMPT v1.1]

ANALYSIS

The listening pass analysis indicates a moderate level of listener fatigue, specifically
related to accumulating sharpness in the upper-mid frequencies. This fatigue escalates
during choruses. Lead intelligibility and transient behavior are reported as controlled
and predictable.

PRIORITY FOCUS

We're focusing on Stage 1 (Survival) because Fatigue is moderate confidence and escalating.

LISTENER IMPACT

Listeners will experience fatigue in the upper-mid range after 2+ minutes on headphones,
especially during the choruses, due to accumulating sharpness.

RECOMMENDATIONS (FRIENDLY MODE ONLY)

Listener Fatigue (Moderate confidence: 0.81)
The upper-mid frequencies accumulate sharpness, especially in choruses.
Consider a gentle de-esser around 7kHz or a soft high-shelf reduction around 3kHz.
We're 81% confident this is the issue; listen on headphones during the chorus to verify.

WHAT'S WORKING

✓ Lead remains intelligible throughout. ✓ Transient behavior is controlled and predictable.

NEXT STEPS

If you address the upper-mid sharpness, the mix will be listener-friendly.
No other Stage 1 issues detected.
```

**Constraints Applied (v1.1):**
- ✅ Only 1 recommendation block (Stage 1, Fatigue only)
- ✅ Intelligibility mentioned in "WHAT'S WORKING" (affirmed, not fixed)
- ✅ Confidence reported (0.81)
- ✅ Non-coercive language ("consider," "might")
- ✅ No DSP jargon (listener experience, not signal specs)
- ✅ No invented problems

**Gemini Response:**
```
ANALYSIS

The listening pass analysis indicates a moderate level of listener fatigue, specifically related
to accumulating sharpness in the upper-mid frequencies. This fatigue escalates during choruses.
Lead intelligibility and transient behavior are reported as controlled and predictable.

PRIORITY FOCUS

We're focusing on Stage 1 (Survival) because Fatigue is moderate confidence and escalating.

LISTENER IMPACT

Listeners will experience fatigue in the upper-mid range after 2+ minutes on headphones,
especially during the choruses, due to accumulating sharpness.

RECOMMENDATIONS (FRIENDLY MODE ONLY)

Listener Fatigue (Moderate confidence: 0.81)
The upper-mid frequencies accumulate sharpness, especially in choruses.
Consider a gentle de-esser around 7kHz or a soft high-shelf reduction around 3kHz.
We're 81% confident this is the issue; listen on headphones during the chorus to verify.

WHAT'S WORKING

✓ Lead remains intelligible throughout. ✓ Transient behavior is controlled and predictable.

NEXT STEPS

If you address the upper-mid sharpness, the mix will be listener-friendly. No other
Stage 1 issues detected.
```

**Backend Parses Response:**
```javascript
const parsed = {
  summary: "Your mix is listener-friendly with one focus area.",
  confidence: 0.81,
  issues: [
    {
      token: "FATIGUE_EVENT",
      severity: "moderate",
      description: "Upper-mid sharpness accumulates, especially in choruses.",
      suggestion: "Consider a gentle de-esser around 7kHz or a soft high-shelf reduction around 3kHz.",
      why: "Listeners will experience fatigue in the upper-mid range after 2+ minutes on headphones.",
      confidence: 0.81
    }
  ],
  affirmed: [
    "Lead remains intelligible throughout.",
    "Transient behavior is controlled and predictable."
  ],
  nextSteps: "If you address the upper-mid sharpness, the mix will be listener-friendly."
};
```

---

## STEP 5: UI RENDERS ECHO REPORT CARD

**Frontend Receives Parsed Data:**
```javascript
const reportCard = {
  mode: "friendly",
  overallConfidence: 0.81,
  status: "listener-friendly-with-focus",
  primaryIssue: {
    name: "Listener Fatigue (Upper-Mid Sharpness)",
    severity: "moderate",
    why: "Listeners' ears get tired after 2+ minutes on headphones.",
    suggestion: "Consider a gentle de-esser around 7kHz or a soft high-shelf reduction around 3kHz.",
    actionable: true
  },
  strengths: [
    "Lead remains intelligible throughout.",
    "Transient behavior is controlled and predictable."
  ],
  nextSteps: "If you address the upper-mid sharpness, the mix will be listener-friendly."
};
```

**UI Renders:**
```
╔════════════════════════════════════════════════════════════════╗
║                    ECHO REPORT CARD                           ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Overall Listener Confidence: ████████░ 81%                   ║
║                                                                ║
║  Status: ✓ Listener-Friendly (with one focus area)            ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║  FOCUS AREA: Listener Fatigue                                 ║
║  ───────────────────────────────────────────────────────────  ║
║  What's happening:                                            ║
║  Upper-mid sharpness accumulates, especially in choruses.     ║
║                                                                ║
║  Why it matters:                                              ║
║  Listeners' ears get tired after 2+ minutes on headphones.    ║
║                                                                ║
║  What to try:                                                 ║
║  Consider a gentle de-esser around 7kHz or a soft             ║
║  high-shelf reduction around 3kHz.                            ║
║                                                                ║
║  Confidence: 81% (listen on headphones during chorus)         ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║  WHAT'S WORKING                                               ║
║  ───────────────────────────────────────────────────────────  ║
║  ✓ Lead remains intelligible throughout.                      ║
║  ✓ Transient behavior is controlled and predictable.          ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║  NEXT STEPS                                                   ║
║  ───────────────────────────────────────────────────────────  ║
║  If you address the upper-mid sharpness, the mix will be      ║
║  listener-friendly. No other Stage 1 issues detected.         ║
║                                                                ║
║  [ View Details ]  [ Export Report ]  [ Try Fix ]             ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

---

## STEP 6: USER INTERACTION OPTIONS

**Option A: View Details**
→ Shows raw Listening Pass JSON (schema v1.0)

**Option B: Export Report**
→ Downloads markdown or PDF with full analysis

**Option C: Try Fix**
→ Applies suggested de-esser/EQ in real-time (existing DSP flow)
→ Re-analyzes audio to confirm improvement
→ Shows before/after report cards

---

## DATA INTEGRITY CHECKPOINTS

Throughout the pipeline:

✅ **Listening Pass Output:**
- Same input always produces identical JSON (deterministic)
- No randomness, no timing leaks
- Schema compliance verified (v1.0)

✅ **LLM Reasoning:**
- Constraints enforced (v1.1 prompt)
- Confident gating applied (0.6 minimum)
- Suppressed tokens invisible
- No invention of problems

✅ **UI Rendering:**
- Data flows unmodified to presentation
- No inference or guessing by UI
- Mode gates visibility, not truth
- User sees exactly what Listening Pass detected

---

## FAILURE SCENARIOS (Not in Happy Path, But Critical)

**If Listening Pass detects nothing:**
```json
{
  "dominant_tokens": [],
  "analysis_confidence": 0.95,
  "tokens_all_detected": false
}
```
→ UI shows: "Your mix is in great shape! No listener issues detected."
→ LLM still called (for positive affirmation)

**If LLM times out:**
```
Fallback: Show raw Listening Pass data with technical summary
Message: "Analysis complete. AI reasoning temporarily unavailable."
```

**If audio is invalid (mono, too short, etc.):**
```
Validation error at Step 2
→ UI shows: "Please upload a valid audio file (>10 seconds)"
→ No Listening Pass call made
```

---

## SUMMARY: HAPPY PATH DATA FLOW

```
1. User Upload
   ↓
2. Audio Read & Validation
   ↓
3. Listening Pass Service (deterministic, ~285ms)
   ├─ Token 1: FATIGUE detected (0.81 confidence)
   ├─ Token 2: INTELLIGIBILITY clear (affirmed)
   └─ Token 3: INSTABILITY stable (affirmed)
   ↓
4. Priority Resolution
   └─ dominant_tokens: ["FATIGUE_EVENT"]
   ↓
5. LLM Reasoning (v1.1 Prompt)
   └─ Single recommendation (Stage 1 only, Friendly Mode)
   ↓
6. Parse & Format
   └─ Extract issue, affirmations, next steps
   ↓
7. UI Renders Echo Report Card
   └─ User sees: status, focus area, why it matters, how to fix it, what's working
   ↓
8. User Action
   └─ [View Details] [Export] [Try Fix] [Done]
```

**Time:** ~500ms total (audio read + analysis + LLM)
**Data:** ~100KB intermediate JSON
**Determinism:** ✅ Guaranteed (same audio → same report)
**Safety:** ✅ Friendly Mode constraints enforced

---

## READY FOR REVIEW

This happy path demonstrates:
- ✅ Clean data flow from upload → analysis → reasoning → UI
- ✅ Schema compliance throughout
- ✅ Friendly Mode language and single-recommendation logic
- ✅ No audio modifications
- ✅ Deterministic output
- ✅ Non-invasive integration with existing systems

**Next:** Code review + approval before implementation.
