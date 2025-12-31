# Listening Pass LLM Reasoning (Mock Template)

**Purpose:** Show how the LLM receives and reasons about the schema
**Status:** Reference implementation (not executable, for documentation)

---

## Input: Listening Pass Schema

```json
{
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.88,
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
          "start_sec": 0.0,
          "end_sec": 180.0,
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
        "intentionality": "N/A",
        "suppressed": false,
        "time_context": {
          "start_sec": 0.0,
          "end_sec": 180.0,
          "pattern": "consistent"
        }
      },
      {
        "token_id": "INSTABILITY_EVENT",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.92,
        "trend": "isolated",
        "listener_impact": "Transient behavior is predictable and controlled.",
        "intentionality": "N/A",
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
  }
}
```

---

## LLM Reasoning Process (Annotated)

### Step 1: Parse Priority

```
LLM reads priority_summary:
  - Highest stage triggered: 1 (SURVIVAL)
  - Dominant tokens: ["FATIGUE_EVENT"]
  - Recommended focus: reduce_high_frequency_accumulation
  - No conflicts

DECISION: Reason about Stage 1 only. Do not suggest character/Stage 3 changes.
```

### Step 2: Evaluate Detected Tokens

```
FATIGUE_EVENT:
  - Detected: true
  - Severity: moderate (not low, not critical - middle ground)
  - Confidence: 0.81 (high - above 0.6 gate)
  - Trend: escalating (getting worse)
  - Intentionality: unlikely (user didn't intend this)
  - Suppressed: false (surfaced for reasoning)

DECISION: This is a real problem. Address it.

---

INTELLIGIBILITY_LOSS:
  - Detected: false (not a problem)
  - Confidence: 0.95 (very high - we're sure)
  - Listener_impact: "Lead remains clear and intelligible throughout."

DECISION: This is good. Mention it in summary to build confidence.

---

INSTABILITY_EVENT:
  - Detected: false (not a problem)
  - Confidence: 0.92 (very high - we're sure)
  - Listener_impact: "Transient behavior is predictable and controlled."

DECISION: This is good. Mention it in summary.
```

### Step 3: Ground Reasoning in Listener Impact

```
FATIGUE_EVENT listener_impact:
"Upper-mid sharpness accumulates, particularly during choruses.
May cause listening fatigue after 2+ minutes on headphones."

LLM Translation:
"Listeners will experience discomfort in the upper-mid frequencies.
This is not a feature request; it's protecting the listener's ears."

NOT:
"The mix is too bright. Reduce 3kHz by 2dB."

WHY:
The schema says what the listener experiences, not what the engineer should do.
The LLM must reason about intent/impact first, then suggest (or not).
```

### Step 4: Friendly Mode Constraint

```
MODE: Friendly (default)

CONSTRAINT: Stage 1 only. No character suggestions.

LLM Decision Matrix:
  - Can suggest Stage 1 fixes (de-esser, gentle EQ, protective limiting)?  YES
  - Can suggest Stage 2 clarity work (dynamic EQ, surgical compression)?   NO (Stage 2, and unnecessary—intelligibility is good)
  - Can suggest Stage 3 character (saturation, reverb, stereo)?             NO (only after Stage 1 is stable)
  - Can suggest Stage 4 release (output limiting, mix bus)?                 NO

OUTPUT SCOPE: Only address FATIGUE_EVENT.
```

### Step 5: Generate Recommendation (Friendly Mode)

```
---

RECOMMENDATION (FRIENDLY MODE):

Track Issue:
The upper-mid frequencies create accumulating sharpness, especially in choruses,
which may cause listening fatigue on headphones.

Why This Matters:
Listeners' ears get tired. This isn't about taste or style—it's about comfort.

What to Do:
1. Check if vocal sibilance (around 7kHz) is excessive.
   If yes: Gentle de-esser (friendly, not aggressive)

2. Look for hi-hat or cymbal harshness in 2–6kHz.
   If yes: Soft high-shelf EQ reduction (-1 to -2dB around 3kHz)

3. Apply these changes during choruses only (the problem escalates there).

Confidence:
We detected this with 81% confidence. If you listen on headphones during the
chorus, you should hear the fatigue-inducing sharpness.

What's Working:
✓ Lead is clear and intelligible
✓ Transients are controlled and predictable
(You don't need to change these.)

---
```

---

## LLM Reasoning Checklist

Use this to verify the LLM is reasoning correctly:

- [ ] Parsed priority_summary (didn't ignore it)
- [ ] Identified dominant tokens
- [ ] Only reasoned about Stage 1 in Friendly Mode
- [ ] Did NOT suggest fixes for non-detected tokens
- [ ] Did NOT suggest fixes for suppressed tokens
- [ ] Grounded reasoning in listener_impact, not signal metrics
- [ ] Acknowledged what's working (detected: false tokens)
- [ ] Provided confidence level (matched token confidence)
- [ ] Suggested stabilization, not character
- [ ] No DSP jargon (used human language)

---

## Advanced Mode Variant (For Reference)

If mode were Advanced, reasoning would extend to Stage 2+:

```
---

RECOMMENDATION (ADVANCED MODE):

[Same Stage 1 as above]

---

CREATIVE OPPORTUNITY (Stage 2 — Clarity Enhancement):
Since intelligibility is already good and transients are stable, you could:
- Add subtle dynamic EQ to polish the lead vocal presence
- Or leave as-is; stability is more valuable than incremental clarity

[Only suggest if Stage 1 is stable]

---

CHARACTER OPTIONS (Stage 3 — Creative):
With stability locked, you could explore:
- Tape saturation (vintage warmth, if desired)
- Subtle reverb (spatial dimension)
- Stereo imaging (width perception)

[Only if user explicitly wants character]

---
```

**Key difference:** Stage 2+ only appear after Stage 1 is addressed.

---

## How This Prevents LLM Hallucination

**Without Schema:**
```
LLM sees audio file → makes assumptions → suggests fixes →
might suggest things that don't exist
```

**With Schema:**
```
LLM sees structured tokens → confidence gates apply →
priority rules enforce → can only reason about detected problems
```

Example prevention:
- Token confidence is 0.81 (not 0.99)
- LLM output: "We detected this with 81% confidence"
- User can decide whether to act on moderate-confidence signals

---

## Testing the LLM Reasoning Loop

To verify correctness:

1. **Inject schema** into Gemini with the prompt template
2. **Check output against checklist** (above)
3. **Verify no Stage 2+ suggestions** in Friendly Mode
4. **Verify no suggestions for suppressed tokens**
5. **Verify language is listener-centric, not signal-centric**

If all pass: LLM is reasoning truthfully from the schema.

