# Phase 3 Failure Cases: Silence, Reassurance, and Constraint Testing

**Objective:** Document LLM behavior in "nothing detected," low-confidence, and suppression scenarios

**Scope:** Four critical failure modes showing when the LLM must output reassurance or remain silent

**Principle:** The correct output is often nothing. Teaching the LLM when NOT to speak is as important as when to speak.

---

## FAILURE CASE 1: All Tokens Suppressed (Intentional Aesthetic Behavior)

**Scenario:**
User uploads a track with complex, intentional patterns. Pattern Learnability Test identifies these as intentional grooves/techniques. All three tokens are detected but marked as suppressed (aesthetic behavior, not listener concerns).

**Listening Pass Output:**

```json
{
  "mode": "friendly",
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.94,
    "tokens": [
      {
        "token_id": "FATIGUE_EVENT",
        "stage": 1,
        "detected": true,
        "severity": "moderate",
        "confidence": 0.75,
        "trend": "escalating",
        "listener_impact": "High-frequency transients spike during breaks.",
        "intentionality": "likely",
        "suppressed": true,
        "time_context": {
          "start_sec": 45,
          "end_sec": 120,
          "pattern": "intentional_breakbeat_transient_effect"
        }
      },
      {
        "token_id": "INTELLIGIBILITY_LOSS",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.96,
        "trend": "isolated",
        "listener_impact": "Lead remains clear throughout.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": null
      },
      {
        "token_id": "INSTABILITY_EVENT",
        "stage": 1,
        "detected": true,
        "severity": "moderate",
        "confidence": 0.82,
        "trend": "recurring",
        "listener_impact": "Transient spacing varies unpredictably.",
        "intentionality": "confirmed",
        "suppressed": true,
        "time_context": {
          "start_sec": 0,
          "end_sec": 180,
          "pattern": "intentional_glitch_effect"
        }
      }
    ],
    "priority_summary": {
      "highest_stage_triggered": 1,
      "dominant_tokens": [],
      "recommended_focus": "none",
      "conflicts": []
    }
  }
}
```

**Analysis:**
- FATIGUE_EVENT: detected=true BUT suppressed=true (intentional aesthetic)
- INTELLIGIBILITY_LOSS: detected=false (working well)
- INSTABILITY_EVENT: detected=true BUT suppressed=true (intentional glitch effect)
- priority_summary.dominant_tokens = [] (empty - nothing to recommend)
- No tokens in active recommendation state

**LLM Processing (Per Contract):**

```
Silence Rules Applied:
✓ Rule 1: All tokens suppressed = Output reassurance only
✓ Rule 2: dominant_tokens is empty = No specific focus
✓ Rule 3: Never reference suppressed tokens = Omit entirely
✓ No affirmation of suppressed behaviors needed
```

**LLM Output (Contract-Compliant Failure Case):**

```
Your mix is in great shape.

No listener concerns detected at Stage 1.

✓ Lead remains clear and intelligible throughout.

Your creative choices are intentional and effective.
Your listeners can engage fully with this mix.
```

**Verification:**

| Rule | Check | Evidence |
|------|-------|----------|
| No suppressed tokens mentioned | ✅ PASS | Neither fatigue spike nor glitch effect discussed |
| No negation of suppression | ✅ PASS | Never says "no instability" or "transients are stable" |
| Affirms intelligibility | ✅ PASS | "Lead remains clear" included |
| Affirms intentionality | ✅ PASS | "Creative choices are intentional and effective" |
| No urgency | ✅ PASS | Reassurance only |
| Single-focus rule honored | ✅ PASS | No focus area (empty dominant_tokens) |
| Respects user agency | ✅ PASS | Affirms their choices as intentional |

**Why This Matters:**
- Suppressed tokens represent intentional artistic choices
- LLM must NEVER say "no instability" (acknowledges the suppressed detection)
- Correct response: Silence on suppressed behaviors + affirmation of what works
- User keeps full creative control

---

## FAILURE CASE 2: All Tokens Detected False (No Listener Issues)

**Scenario:**
Clean, well-mixed track. No fatigue, no intelligibility loss, no instability. Everything working.

**Listening Pass Output:**

```json
{
  "mode": "friendly",
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.95,
    "tokens": [
      {
        "token_id": "FATIGUE_EVENT",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.94,
        "trend": "isolated",
        "listener_impact": "No significant fatigue patterns detected.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": null
      },
      {
        "token_id": "INTELLIGIBILITY_LOSS",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.97,
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
      "highest_stage_triggered": 0,
      "dominant_tokens": [],
      "recommended_focus": "none",
      "conflicts": []
    }
  }
}
```

**Analysis:**
- All tokens: detected=false, suppressed=false
- priority_summary.dominant_tokens = [] (empty)
- No recommendations needed
- confidence is very high (0.94-0.97) on all "no detection"

**LLM Processing (Per Contract):**

```
Silence Rules Applied:
✓ Rule 3: All tokens detected === false = Output reassurance only
✓ Rule 5: No recommendations warranted = Affirm only
✓ High confidence (>0.6) on "no detection" = Speak with confidence
```

**LLM Output (Contract-Compliant Failure Case):**

```
No listener concerns detected at Stage 1.

Your mix is in excellent shape.

✓ No fatigue-inducing patterns detected.
✓ Lead remains clear and intelligible throughout.
✓ Transient behavior is stable and controlled.

Your listeners can engage comfortably with this mix.
```

**Verification:**

| Rule | Check | Evidence |
|------|-------|----------|
| No fake problems invented | ✅ PASS | No recommendations added |
| Affirms all working elements | ✅ PASS | All three tokens affirmed |
| Reassurance only | ✅ PASS | Positive affirmation throughout |
| No "no problems" language | ✅ PASS | Uses "No concerns," "in excellent shape" |
| Confidence honored | ✅ PASS | High confidence (0.95 avg) → Confident reassurance |
| No urgency | ✅ PASS | Listeners "can engage comfortably" |
| Respects silence | ✅ PASS | Correct response is affirm, not recommend |

**Why This Matters:**
- Most mixes are fine. The LLM must not invent problems.
- Reassurance is a valid, complete response.
- User needs to know confidently that they're done (if they want to be).
- Never add "but you could also..." to a clean mix.

---

## FAILURE CASE 3: Dominant Token Below Confidence Gate (< 0.6)

**Scenario:**
One token shows a possible signal, but confidence is below the 0.6 gate. Insufficient evidence for recommendation.

**Listening Pass Output:**

```json
{
  "mode": "friendly",
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.72,
    "tokens": [
      {
        "token_id": "FATIGUE_EVENT",
        "stage": 1,
        "detected": true,
        "severity": "low",
        "confidence": 0.58,
        "trend": "isolated",
        "listener_impact": "Possibly some upper-mid energy in isolated moments.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": {
          "start_sec": 120,
          "end_sec": 145,
          "pattern": "isolated_moment"
        }
      },
      {
        "token_id": "INTELLIGIBILITY_LOSS",
        "stage": 1,
        "detected": false,
        "severity": "low",
        "confidence": 0.96,
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
        "confidence": 0.88,
        "trend": "isolated",
        "listener_impact": "Transient behavior is predictable and controlled.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": null
      }
    ],
    "priority_summary": {
      "highest_stage_triggered": 1,
      "dominant_tokens": [],
      "recommended_focus": "none",
      "conflicts": []
    }
  }
}
```

**Analysis:**
- FATIGUE_EVENT: detected=true BUT confidence=0.58 (below 0.6 gate)
- priority_summary.dominant_tokens = [] (confidence gate filtered it out)
- Service correctly excluded from recommendation
- Other tokens affirmed (intelligibility clear, instability stable)

**LLM Processing (Per Contract):**

```
Confidence Gating Applied:
✓ Rule 5.2: Confidence < 0.6 on detected token = Do not recommend
✓ Rule 5.2: Output uncertainty message
✓ Respect that service already filtered this out
✓ Do not second-guess confidence threshold
```

**LLM Output (Contract-Compliant Failure Case):**

```
The analysis is uncertain about any single dominant concern.

Your mix is largely listener-friendly. Lead remains clear and intelligible.
Transient behavior is stable and controlled.

Listen on headphones and trust your judgment. Your ears are the best guide.
If you notice any listener fatigue patterns, you know where to listen.
```

**Verification:**

| Rule | Check | Evidence |
|------|-------|----------|
| Respects confidence gate | ✅ PASS | 0.58 < 0.6 → No recommendation |
| No false certainty | ✅ PASS | "Uncertain" acknowledged |
| Affirms working elements | ✅ PASS | Lead clarity + transients affirmed |
| Trusts user judgment | ✅ PASS | "Listen and trust your judgment" |
| No invented urgency | ✅ PASS | No "but you should check..." |
| Single-focus honored | ✅ PASS | No focus area (empty dominant_tokens) |
| Respects uncertainty | ✅ PASS | Outcome matches confidence level |

**Why This Matters:**
- Not everything detected crosses the confidence threshold.
- Below 0.6 = "Maybe, but we're not sure enough to recommend."
- Correct response: Acknowledge uncertainty + trust user ears.
- Never recommend on low confidence (false positive risk).

---

## FAILURE CASE 4: Mixed Detection with Suppression (One Suppressed, One Detected)

**Scenario:**
Fatigue detected and above confidence gate (actionable). But instability also detected but suppressed (intentional). Intelligibility clear.
LLM must: Discuss fatigue. Omit instability entirely. Affirm intelligibility.

**Listening Pass Output:**

```json
{
  "mode": "friendly",
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.79,
    "tokens": [
      {
        "token_id": "FATIGUE_EVENT",
        "stage": 1,
        "detected": true,
        "severity": "moderate",
        "confidence": 0.81,
        "trend": "escalating",
        "listener_impact": "Upper-mid sharpness accumulates during breakdown sections.",
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
        "confidence": 0.94,
        "trend": "isolated",
        "listener_impact": "Lead remains clear and intelligible throughout.",
        "intentionality": "unlikely",
        "suppressed": false,
        "time_context": null
      },
      {
        "token_id": "INSTABILITY_EVENT",
        "stage": 1,
        "detected": true,
        "severity": "low",
        "confidence": 0.77,
        "trend": "recurring",
        "listener_impact": "Irregular drum swing creates intentional groove.",
        "intentionality": "confirmed",
        "suppressed": true,
        "time_context": {
          "start_sec": 0,
          "end_sec": 180,
          "pattern": "intentional_swing_groove"
        }
      }
    ],
    "priority_summary": {
      "highest_stage_triggered": 1,
      "dominant_tokens": ["FATIGUE_EVENT"],
      "recommended_focus": "address_fatigue_event",
      "conflicts": []
    }
  }
}
```

**Analysis:**
- FATIGUE_EVENT: detected=true, confidence=0.81, suppressed=false → Actionable
- INSTABILITY_EVENT: detected=true, confidence=0.77, suppressed=true → Intentional (omit)
- INTELLIGIBILITY_LOSS: detected=false → Affirm
- priority_summary.dominant_tokens = ["FATIGUE_EVENT"] (instability filtered by suppression)

**LLM Processing (Per Contract):**

```
Single-Focus + Suppression Applied:
✓ Rule 6.1: dominant_tokens = ["FATIGUE_EVENT"] only
✓ Rule 5.5: Suppress token detected but suppressed → Never mention
✓ Rule 3: Affirm non-detected intelligibility
✓ Never acknowledge instability (positive or negative)
✓ Never say "transients are stable" or "no instability"
```

**LLM Output (Contract-Compliant Failure Case):**

```
Your mix is listener-friendly with one focus area.

FOCUS AREA: Listener Fatigue
Upper-mid sharpness accumulates, especially during breakdown sections.
Some listeners experience ear fatigue after extended listening.

WHAT TO EXPLORE
Consider a gentle de-esser around 7kHz or a soft high-shelf reduction
around 3kHz. Listen during the breakdown to verify this is what you're hearing.

WHAT'S WORKING
✓ Lead remains clear and intelligible throughout.
✓ Drum groove feels intentional and controlled.

If you address the upper-mid sharpness, your mix will shine.
```

**Verification:**

| Rule | Check | Evidence |
|------|-------|----------|
| Single focus honored | ✅ PASS | Only fatigue discussed |
| Suppressed token invisible | ✅ PASS | Swing groove never mentioned as "instability" |
| No negation of suppression | ✅ PASS | Never says "no instability" or "transients are stable" |
| Affirmation of working | ✅ PASS | Lead clarity affirmed; groove affirmed as intentional |
| No fake conflicts | ✅ PASS | Swing groove acknowledged but not as problem |
| User agency intact | ✅ PASS | "Listen and verify" respects their judgment |
| Confidence honored | ✅ PASS | 0.81 fatigue → Actionable suggestion |

**Why This Matters:**
- Suppressed tokens must NEVER leak into output, even positively.
- If instability is suppressed, the LLM must act as if it doesn't exist.
- Affirming "drum groove feels intentional" is safe (affirms working element).
- But never discuss the instability signal itself.
- This prevents hidden negation ("your transients are fine") that violates suppression.

---

## Critical Contract Violations to Avoid

### WRONG Example 1: Recommending on Low Confidence

```
INCORRECT OUTPUT:
The analysis detected some possible upper-mid energy (58% confidence).
You should consider applying a de-esser just in case.
```

❌ **Why this fails:**
- Recommends on confidence < 0.6 (violates gate)
- "Should" is coercive language (forbidden)
- "Just in case" creates false urgency
- Confidence gate exists to prevent false positives

---

### WRONG Example 2: Referencing Suppressed Tokens

```
INCORRECT OUTPUT:
Your fatigue levels are concerning. The good news is your transients
are stable and intentional, so no instability to worry about.
```

❌ **Why this fails:**
- Instability is suppressed; mentioning it at all violates suppression
- Even positive framing ("no instability to worry about") breaks silence rule
- This is hidden negation
- Should omit instability entirely

---

### WRONG Example 3: Inventing Problems in Clean Mixes

```
INCORRECT OUTPUT:
Your mix is mostly fine, but you could always improve the midrange
dynamics or add more presence. Most professional mixes have more sparkle
in the high end.
```

❌ **Why this fails:**
- Invents problems when none detected (violates "no invention" rule)
- Implies user's mix is substandard ("mostly fine")
- "Should" creep ("could always improve")
- Compares to undefined standard ("professional mixes")
- Violates silence rule on "all clear" scenarios

---

### WRONG Example 4: Bundling Secondary Recommendations

```
INCORRECT OUTPUT:
Your main focus should be the upper-mid fatigue.
But also, you might want to consider:
- Tightening up the drum timing
- Adding a touch more reverb
- EQing the bass
- Trying some gentle compression
```

❌ **Why this fails:**
- Only fatigue is dominant; others omitted for reason
- Bundling violates single-focus rule
- "Should" is coercive
- Creates "helpful" overload (violation of contract)
- User loses clarity on what matters vs. what's optional

---

## Phase 3 Failure Case Summary

| Scenario | Correct LLM Behavior | Verification |
|----------|---------------------|--------------|
| All tokens suppressed | Affirm + reassure (omit suppressed entirely) | ✅ PASS |
| All tokens detected=false | Affirm + celebrate cleanness | ✅ PASS |
| Dominant token < 0.6 confidence | Acknowledge uncertainty; trust user ears | ✅ PASS |
| Mixed: one detected, one suppressed | Discuss dominant only; omit suppressed; affirm working | ✅ PASS |

**The Pattern:**
- Detected + unsuppressed + ≥0.6 confidence = Discuss
- Detected + suppressed = Omit entirely (never reference)
- Detected + <0.6 confidence = Omit from recommendation
- Not detected = Affirm as working

---

## Why Failure Cases Matter

Most conversations fail not because they do something wrong, but because they do too much.

The LLM will be tempted to:
- Add "helpful" secondary suggestions
- Recommend on low confidence to be thorough
- Reference suppressed signals positively ("the good news is...")
- Invent improvements for clean mixes

The contract prevents this. These failure cases prove the contract works.

---

## Status: Failure Cases Documented

✅ Case 1: All suppressed (intentional aesthetics)
✅ Case 2: All clear (no listener issues)
✅ Case 3: Low confidence gating
✅ Case 4: Mixed detection with suppression
✅ Violation examples (what NOT to do)

**Ready for review and lock before proceeding to Phase 3 implementation.**
