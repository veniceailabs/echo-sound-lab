# Listening Token Review Checklist

Use this checklist to review every token (1–7) before locking it as v1.0.

Every question should return **YES**. If any return NO, the token needs refinement before locking.

---

## Section A: Perception Integrity

**A1: Human-First Observation**
- [ ] Does this describe something a human notices *before thinking*?
- [ ] Is it grounded in felt experience, not measurement?
- [ ] Would an engineer say "yes, that's exactly what I heard" when reading this?

**A2: Temporal Awareness**
- [ ] Is this token explicitly time-based (accumulation, trend, recovery)?
- [ ] Does it reject snapshot-only analysis?
- [ ] Does it capture patterns, not isolated events?

**A3: Clarity of Boundaries**
- [ ] Is "What It IS" section clear and specific?
- [ ] Is "What It IS NOT" section comprehensive and precise?
- [ ] Could someone misapply this token? If yes, rewrite the exclusions.

---

## Section B: Detection Honesty

**B1: Observable, Not Magical**
- [ ] Can the detection logic actually be implemented in code?
- [ ] Are all assumptions stated explicitly?
- [ ] Are thresholds numeric and tunable?

**B2: Proxy Humility**
- [ ] Are frequency bands, timing windows, and counts clearly stated as proxies for perception?
- [ ] Does the spec admit where detection might fail?
- [ ] Are edge cases acknowledged, not hidden?

**B3: No Solution Leakage**
- [ ] Does the pseudo-code describe observation only?
- [ ] Are there zero references to EQ, compression, limiting, or fixes?
- [ ] Does it output information, not commands?

---

## Section C: Language Discipline

**C1: Output Sentences Are Honest**
- [ ] Are the example output sentences readable by humans?
- [ ] Do they describe experience, not prescribe treatment?
- [ ] Could an LLM reasonably respond to this sentence?

**C2: No Fix Verbs**
- [ ] Does the definition avoid: "reduce," "cut," "boost," "smooth," "tighten"?
- [ ] Are verbs observation-based: "exhibits," "accumulates," "escalates," "lacks"?
- [ ] Is any implied solution removed?

**C3: Confidence Scoring**
- [ ] Is confidence score included in output?
- [ ] Could weak detections be treated differently than strong ones?

---

## Section D: Safety & Trust

**D1: Friendly Mode Alignment**
- [ ] Would this token help Friendly Mode protect users?
- [ ] Is the token reporting a *problem*, not a *preference*?
- [ ] Does it support restraint, not aggression?

**D2: Non-Contamination**
- [ ] Does detecting this token not require any DSP chain to be active?
- [ ] Is it pure observation, independent of processing?

**D3: Genre Respect**
- [ ] Are intentional, genre-specific instances acknowledged?
- [ ] Does the token report truthfully even when the sound is *supposed* to be that way?

---

## Section E: Drift Protection

**E1: Scope Lock**
- [ ] Is there exactly one perceptual moment this token captures?
- [ ] Does it avoid trying to be "comprehensive"?
- [ ] If this token overlaps another, is that overlap explained?

**E2: False Positive Awareness**
- [ ] Are 3+ false positive scenarios documented?
- [ ] Would a naive implementation of this token embarrass the system?
- [ ] Have you thought about what could break it?

**E3: Future-Proofing**
- [ ] Are refinement notes included (frequency band tuning, threshold adaptation)?
- [ ] Could someone in 6 months understand why these choices were made?
- [ ] Is versioning clear (v1.0, future tuning notes)?

---

## Review Sign-Off Template

Use this when you're ready to lock a token:

```
## Token #X: [Name] — Review Sign-Off

Reviewed: [date]
Reviewer: [name]

A: Perception Integrity — ✅ PASS
B: Detection Honesty — ✅ PASS
C: Language Discipline — ✅ PASS
D: Safety & Trust — ✅ PASS
E: Drift Protection — ✅ PASS

Status: LOCKED v1.0
Confidence: [High / Medium]
Notes: [any final refinements or edge cases to watch]
```

---

## How to Use This Checklist

**For each token (1–7):**

1. Draft the token following the Token #1 pattern
2. Run through this checklist (all sections)
3. Answer each question honestly
4. If any NO: rewrite that section, re-check
5. Once all YES: lock it and sign off
6. Move to next token

**Do not skip steps.** This checklist is the boundary between "thoughtful" and "slipping."

---

## When the Checklist Itself Needs Refinement

As you work through Tokens 2–7, you may find:
- A question that doesn't quite work
- Missing edge cases
- Sections that overlap

Update this checklist.
Version it.
Lock new version.

The checklist evolves, but only intentionally.

