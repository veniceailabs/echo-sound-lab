# Listening Pass Output Schema

**Status:** LOCKED v1.0
**Last Updated:** 2025-12-17

---

## Core Principles (Non-Negotiable)

1. **Structured first, prose second**
   - The LLM reasons on structure, not sentences
   - JSON is the source of truth; prose is derived

2. **Perceptual authority > signal authority**
   - Severity reflects listener impact, not magnitude
   - "This will tire ears" beats "peaks at -4dB"

3. **Stage hierarchy is explicit**
   - Stage 1 tokens always outrank later stages unless explicitly suppressed
   - Protection before character, always

4. **Silence is meaningful**
   - "Not detected" is as important as "detected"
   - Absence of a token is data

---

## Top-Level Schema

```json
{
  "listening_pass": {
    "version": "1.0",
    "analysis_confidence": 0.92,
    "tokens": [ /* array of token objects */ ],
    "priority_summary": { /* computed */ },
    "human_summary": "string"
  }
}
```

---

## Token Object Schema (Universal for Tokens 1–7)

Every token serializes exactly like this. No exceptions.

```json
{
  "token_id": "FATIGUE_EVENT",
  "stage": 1,
  "detected": true,
  "severity": "moderate",
  "confidence": 0.81,
  "trend": "escalating",
  "listener_impact": "Prolonged high-frequency tension causes listening fatigue.",
  "intentionality": "unlikely",
  "suppressed": false,
  "time_context": {
    "start_sec": 42.0,
    "end_sec": 138.0,
    "pattern": "recurring"
  }
}
```

### Field Definitions (Locked Semantics)

| Field | Type | Values | Meaning |
|-------|------|--------|---------|
| `token_id` | string | Canonical name (e.g., `FATIGUE_EVENT`, `INTELLIGIBILITY_LOSS`, `INSTABILITY_EVENT`) | Internal identifier. Never changes. Used for priority resolution. |
| `stage` | integer | 1, 2, 3, or 4 | Stage in Echo architecture. Used for priority hierarchy. |
| `detected` | boolean | true / false | Was this token's condition observed? If false, token still exists for audit. |
| `severity` | enum | `low`, `moderate`, `high`, `critical` | Listener impact severity. NOT signal magnitude. |
| `confidence` | float | 0.0–1.0 | Detection certainty. Tokens < 0.6 confidence cannot dominate priority. |
| `trend` | enum | `isolated`, `recurring`, `escalating`, `resolving`, `stable` | Direction of the problem over time. |
| `listener_impact` | string | Human sentence | One sentence describing what the listener experiences. No fixes. No DSP language. |
| `intentionality` | enum | `unlikely`, `possible`, `likely`, `confirmed` | Is this problem or aesthetic choice? |
| `suppressed` | boolean | true / false | True when intentionally not surfaced (e.g., complex-but-learnable rhythm in Instability). |
| `time_context` | object | `{start_sec, end_sec, pattern}` | Optional. When does this occur? Helps LLM reason about song structure. |

---

## Priority Resolution Layer (Computed, Not Authored)

This is not a token object. It is computed from the token array.

```json
{
  "priority_summary": {
    "highest_stage_triggered": 1,
    "dominant_tokens": ["FATIGUE_EVENT", "INTELLIGIBILITY_LOSS"],
    "recommended_focus": "stabilization",
    "conflicts": []
  }
}
```

### Priority Resolution Rules (Explicit)

**Rule 1: Stage Precedence**
- Stage 1 > Stage 2 > Stage 3 > Stage 4
- Stage 1 issues must be addressed or acknowledged before character

**Rule 2: Severity Beats Count**
- One critical token > three low tokens
- Don't let noise overrule signal

**Rule 3: Confidence Gate**
- Tokens with confidence < 0.6 cannot dominate priority
- Weak detections don't override strong ones

**Rule 4: Suppressed Tokens Do Not Participate**
- `suppressed: true` means the token exists for audit, not reasoning
- LLM does not suggest fixes based on suppressed tokens

**Rule 5: Conflict Resolution**
- If multiple Stage 1 tokens fire (e.g., Fatigue + Intelligibility):
  - List all dominant tokens
  - LLM addresses highest severity first
  - If both same severity: fatigue (Token #1) takes precedence (pain before clarity)
- If Token #1 (Fatigue) and Token #3 (Anxiety) both fire:
  - Fatigue dominates unless Anxiety is critical and Fatigue ≤ moderate
  - Rationale: Anxiety can be intentional; fatigue never is

---

## Human Summary (Generated, Not Authored)

This is what displays to the user in Friendly Mode.

Generated directly from the token array + priority summary, never written by hand.

```
Listening Notes:
The track creates sustained tension over time, particularly in the upper range, which may cause fatigue during longer listening. Additionally, moments of instability make it difficult to fully relax into the groove. Clarity of the lead remains mostly intact.
```

**Rules for generation:**
- Lead with highest-stage, highest-confidence tokens
- Use listener-impact sentences directly
- No commands, fixes, or pressure
- Acknowledge absence: "No intelligibility issues detected" if clear
- End with what works: "Clarity of the lead remains mostly intact"

---

## Token Array Example (Tokens 1–3 Retrofitted)

Three-token analysis of a hypothetical mix:

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
    },
    "human_summary": "The mix is mostly well-balanced, with clear lead intelligibility and controlled transient behavior. However, upper-frequency sharpness accumulates over time, particularly in choruses, which may cause listening fatigue on headphones after extended sessions. This is a stabilization concern in Friendly Mode."
  }
}
```

---

## For LLM Consumption

When this schema is passed to Gemini, the input prompt should be:

```
You are analyzing a music mix through perceptual tokens (structured data about listening experience).

Your job:
1. Read the token array and priority summary
2. Reason about listener experience, NOT signal metrics
3. In Friendly Mode: suggest only Stage 1 stabilization (fix pain/clarity/anxiety)
4. In Advanced Mode: suggest Stages 2–4 only AFTER Stage 1 is stable
5. Never suggest fixes for suppressed tokens
6. Never override Stage hierarchy
7. Output: Recommendation language (prose) that explains what to do and why

Constraint: All suggestions must be grounded in the listener_impact field. Do not hallucinate problems.

---

TOKEN ARRAY:
[JSON schema output]

---

INSTRUCTION: Generate a Friendly Mode recommendation (Stage 1 only).
```

---

## Extensibility to Tokens 4–7

When new tokens are added (Density Pressure, Dominance Confusion, etc.):

1. **Add token object** with same schema (no new fields needed)
2. **Assign stage** (likely Stage 2 for creative issues)
3. **Define thresholds** and `intentionality` logic
4. **Priority rules stay the same** — stage hierarchy applies automatically

No schema rework required.

---

## Version Control

- **v1.0 (locked):** Supports Tokens 1–7 without modification
- Future updates require explicit semver bump and checklist re-run

---

## Why This Works

- **Tokens now compose, not compete.** The LLM can rank, reason, and decide
- **Friendly Mode stays honest and calm.** No false urgency, no pressure
- **Advanced Mode can layer suggestions.** Character only after stability
- **Audit trail is built in.** Every decision is traceable to confidence + severity
- **Silence is data.** Absence of tokens is as meaningful as presence

The engine is no longer "analyzing audio."

It is reporting a listening experience.
