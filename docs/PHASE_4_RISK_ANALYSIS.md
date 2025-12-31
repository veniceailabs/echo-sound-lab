# Phase 4: Risk Analysis

**Scope:** Identify failure modes, misuse patterns, and overreach risks for each UI strategy option

**Status:** Planning only—no code changes

---

## EXECUTIVE SUMMARY

Phase 4 presents three UI options. Each carries distinct risks:

- **Option 1 (Passive Display):** High risk of user autonomy erosion
- **Option 2 (On-Demand):** Medium risk of feature invisibility
- **Option 3 (Silent):** High risk of perceived abandonment

None is risk-free. All require explicit safeguards.

---

## PART 1: FAILURE MODES BY OPTION

### Option 1: Passive Display — Failure Mode Deep Dive

**Failure Mode Name:** "AI Guidance Becomes Gospel"

**How It Happens:**
1. User uploads track
2. Analysis completes
3. Listening Pass data + AI guidance both visible (AI prominently displayed)
4. User sees professional-sounding recommendation
5. User defaults to "What did AI say?" instead of "What do I hear?"
6. Over 5-10 uses, user's critical listening atrophies

**Why This Is Bad:**
- **Agency Loss:** User stops trusting their own ears
- **Skill Regression:** Mastering skill development halts
- **False Authority:** LLM appears authoritative (polished language, confidence)
- **Listening Drift:** User eventually says "The AI says I'm done" instead of "I'm satisfied"

**Real-World Scenario:**
```
Session 1: User hears harshness; AI says "Listener Fatigue"; user applies de-esser; hears improvement
Session 2: User unsure if vocals need clarity; checks AI first; AI says "all clear"; user skips critical listening
Session 3: User doesn't load track into Listening Pass anymore; only asks "What's the AI say?"
```

**Detection Indicators:**
- User always waits for AI guidance before making decisions
- User skips Listening Pass data, goes straight to AI text
- User applies AI recommendations without verifying them (no A/B testing)
- User reports "AI said my mix is good" as reason to stop working

**Prevention Strategies:**

✅ **Strategy 1: Explicit Hierarchy** (UI Design)
- Listening Pass data positioned *above* AI guidance
- AI section labeled "AI Interpretation" (not "Recommendation" or "Verdict")
- Listening Pass labeled "Your Analysis" (emphasizing user agency)

✅ **Strategy 2: Friction on Default** (UX)
- AI guidance requires scroll or click to fully view (not immediately visible)
- Guidance partially obscured (show first 2 lines, "[ Read More ]")
- Listening Pass always in viewport without action

✅ **Strategy 3: Mandatory Critical Listening Prompt** (Interaction)
- Before applying any AI recommendation, user must:
  - Listen to the section 2x
  - Indicate whether they agree with AI's focus area
  - Choice: "Yes, I hear it" / "No, disagree" / "Unsure"
- Only if "Yes" or "Unsure": show action buttons
- If "No": prompt "What did you hear instead?" (learning opportunity)

✅ **Strategy 4: Monthly Listening Report** (Analytics)
- Track ratio: (Critical listens) / (AI actions)
- If ratio < 1.5, show notification: "You're applying AI guidance without verification. Consider listening actively."
- Gently encourage hands-on mastering

✅ **Strategy 5: Opt-In Advanced Mode** (Skill Progression)
- Default: Friendly Mode (LLM guidance)
- Advanced Mode: Listening Pass only (power users)
- Make Advanced Mode visible and achievable

---

### Option 2: On-Demand Guidance — Failure Mode Deep Dive

**Failure Mode Name:** "The Hidden Button Problem"

**How It Happens:**
1. New user uploads track
2. Listening Pass analysis completes
3. User sees data but no obvious next step
4. "Get AI Interpretation" button present but not salient
5. User closes without clicking button
6. User never discovers feature exists
7. System appears incomplete ("What now?")

**Why This Is Bad:**
- **Discovery Failure:** Core feature invisible to target users
- **Value Perception:** System seems to provide less than it does
- **Support Load:** Users ask "Why isn't there guidance?" in forums
- **Beginner Loss:** Novices who most need scaffolding never find it
- **ROI Loss:** Feature implemented but never used

**Real-World Scenario:**
```
User 1 (Beginner): Uploads track, sees tokens, thinks "Uh... is this it?" Closes. Writes review: "Doesn't tell you what to do."
User 2 (Expert): Immediately clicks "Get AI Interpretation" → understands system → becomes power user
User 3 (Casual): Hovers over data, doesn't understand tokens, gives up
```

**Detection Indicators:**
- Zero clicks on "Get AI Interpretation" button (in telemetry)
- User drops off without requesting guidance
- Negative feedback: "Doesn't explain what to do"
- Expert users report feature works; beginners don't know it exists

**Prevention Strategies:**

✅ **Strategy 1: Prominent Affordance** (Visual Design)
- "Get AI Interpretation" button is primary action (color, size, placement)
- Label tested with beginners (avoid jargon like "interpretation")
- Hover state shows tooltip: "Understand what these results mean"

✅ **Strategy 2: Smart Default Reveal** (Progressive Disclosure)
- First use: Show button with animated arrow + micro-copy: "Click to understand your results"
- Second use: Show button normally (arrow gone)
- Third use+: Button present, no extra emphasis

✅ **Strategy 3: Contextual Nudge** (Timed UX)
- If user has not clicked "Get AI Interpretation" after 10 seconds:
  - Subtle highlight appears on button (pulse animation, 1s, 2 times)
  - Text below data: "Want to know what this means?" (optional)
- Nudge only appears once per session

✅ **Strategy 4: Onboarding Video** (Education)
- 30-second walkthrough on first use: "Your Listening Pass found [X]. Here's what it means →"
- Shows exact flow: data → click button → guidance
- Skippable but recommended

✅ **Strategy 5: Analytics Monitoring** (Data-Driven Safety)
- Track: % of users who click "Get AI Interpretation"
- Alert threshold: If < 40% of users access feature, redesign
- Monthly review of drop-off points

---

### Option 3: Silent-by-Default — Failure Mode Deep Dive

**Failure Mode Name:** "Delight Becomes Mystery"

**How It Happens:**
1. User uploads track
2. Listening Pass analysis completes
3. User sees data only; AI section hidden by default
4. "✨ AI insights available" indicator present but easy to miss
5. User doesn't click "Show"
6. User never sees any LLM guidance
7. User wonders: "What's the AI doing? Is it working?"

**Why This Is Bad:**
- **Discovery Failure:** Similar to Option 2, but worse (not even a button)
- **Value Invisibility:** User can't assess whether system is worth it
- **Trust Erosion:** "If insights are available, why aren't they shown?"
- **Perceived Incompleteness:** System feels unfinished ("Is something supposed to happen?")
- **ROI Loss:** Most expensive feature (LLM API calls) never accessed

**Real-World Scenario:**
```
User 1 (Beginner): Uploads track, sees data, looks for "Next Step" button. Doesn't see it. Closes.
User 2 (Expert): Uploads track, immediately notices "✨ AI insights available", clicks Show, understands flow
User 3 (Casual): Sees indicator, doesn't understand what "insights" means, ignores it
User 4 (Skeptical): Sees hidden insights, thinks "Why is AI hiding its recommendations? Is it ashamed of them?"
```

**Detection Indicators:**
- Very few users ever click "Show" on AI insights indicator
- User feedback: "What does the ✨ thing mean?" or "Nothing happened"
- Expert users rave; beginners don't understand flow
- API costs (LLM calls) much lower than expected (feature unused)

**Prevention Strategies:**

✅ **Strategy 1: Explicit Labeling** (Clarity)
- Replace "✨ AI insights available" with: "AI Interpretation Available (optional)"
- Avoid cryptic symbols; use clear language
- Tooltip on hover: "See what our AI noticed about your mix"

✅ **Strategy 2: One-Click Sample** (Preview)
- When user hovers over indicator, show first sentence of LLM guidance in tooltip
- Example: "Your mix is listener-friendly with one focus area..."
- Encourages click-through without showing full guidance

✅ **Strategy 3: Progressive Reveal** (Engagement)
- First use: Show indicator + tooltip with sample text
- Second use: Show indicator normally
- After 3 sessions without click: Show modal suggestion: "Have you tried viewing AI insights? [Yes] [No]"
- If "Yes": Show insights automatically once, then revert to hidden

✅ **Strategy 4: Active Learning Path** (Skill Building)
- Include micro-lesson: "Why might AI insights be optional?" → "Because you're the expert. AI is a tool, not a judge."
- Explain philosophy upfront (respect for user autonomy)
- Frame as feature, not oversight

✅ **Strategy 5: Dual Analytics** (Measurement)
- Track: % of sessions where AI insights viewed
- Track: % of users who ever view insights
- Goal: 60%+ of beginner users view at least once
- If below 40%, implement Strategy 3 (progressive reveal nudge)

---

## PART 2: MISUSE PATTERNS (How Each Option Could Be Abused)

### Misuse Pattern 1: "Authority Exploitation"

**What It Is:**
Using the AI's professional-sounding language to pressure users into accepting low-quality output.

**How It Manifests:**

**Option 1 (Passive):** HIGH RISK
- User shows AI guidance to client: "The AI says the mix is good"
- Client trusts AI over engineer's own judgment
- Engineer defaults to "AI said so" rather than defending their listening

**Option 2 (On-Demand):** MEDIUM RISK
- User selectively shows guidance: "Click this to see what the AI says" (implies inevitability)
- User hides contradictory data and only shows guidance
- Masquerade of thoroughness ("AI verified it")

**Option 3 (Silent):** LOW RISK
- User must explicitly click to show guidance (clear user action)
- Less plausible to claim system automatically validated
- Guidance presented as "optional interpretation"

**Safeguard:**
- All outputs include footer: "Your ears are the final authority. This is AI interpretation, not mastering judgment."
- Listening Pass data always available alongside guidance (no hiding)
- Explicit disclaimer in LLM_OUTPUT_CONTRACT.md v1.0: never use authority language ("verified", "approved", "certified")

---

### Misuse Pattern 2: "Lazy Mastering"

**What It Is:**
Users treating AI guidance as a substitute for critical listening and skill development.

**How It Manifests:**

**Option 1 (Passive):** HIGHEST RISK
- User: "I'll just apply what the AI says and call it done"
- No A/B testing, no critical listening, no iterative refinement
- Short-term: Acceptable mixes; Long-term: Atrophied skills

**Option 2 (On-Demand):** MEDIUM RISK
- User must click to engage, but once shown, same lazy pattern follows
- At least the click imposes slight friction

**Option 3 (Silent):** LOWER RISK
- User must actively click to see guidance
- Suggests intentional choice, less like passive consumption
- User is primed: "I asked for help; I'm still in control"

**Safeguard:**
- Mandatory critical listening prompt before applying recommendations (Option 1 Prevention Strategy 3)
- Guidance never says "Apply this"; always says "Consider this"
- Listening Pass data must be equally prominent (prevent skip-to-AI behavior)
- Monthly listening report tracking active vs passive usage

---

### Misuse Pattern 3: "Overreliance on Single Token"

**What It Is:**
User focuses only on dominant token recommendation, ignoring other detected issues that are below threshold.

**How It Manifests:**

**All Options:** MEDIUM RISK (identical)
- System finds 3 tokens: FATIGUE (0.81), INTELLIGIBILITY (0.65), INSTABILITY (0.45, suppressed)
- Single-focus rule recommends: Fix Fatigue
- User obsesses over de-esser, ignores lead vocal clarity
- Result: Partially solved problem

**Why This Happens:**
- LLM_OUTPUT_CONTRACT.md enforces single focus (correct principle)
- But user doesn't read "secondary tokens affirmed" section
- User assumes: "AI only found one issue; I'm done"

**Safeguard:**
- Listening Pass display shows ALL detected tokens (not just dominant)
- Guidance section explicitly states: "Other observations: [list of non-dominant tokens]"
- Footer: "Addressing the focus area may shift priorities. Analyze again after changes."
- Recommend iterative cycles (analyze → address → re-analyze)

---

### Misuse Pattern 4: "Algorithmic Discrimination"

**What It Is:**
AI guidance systematically disadvantages certain genres, production styles, or use cases.

**How It Manifests:**

**Example Scenario:**
- Hip-hop tracks show high INSTABILITY scores (transient-heavy drums detected as instability)
- Guidance: "Consider smoothing transients"
- Result: Users apply unwarned de-transient processing, destroying genre-appropriate character

**All Options:** MEDIUM RISK (identical)
- Option 1: Guidance more prominent → more users follow it blindly
- Option 2/3: Users must choose → slightly lower risk

**Safeguard:**
- LLM_OUTPUT_CONTRACT.md requires: "Never suggest broad DSP changes without genre context"
- Listening Pass tokens designed to be genre-neutral
- Guidance always says "Consider for your style" (not universal rule)
- Include session context (if available): "For hip-hop, high-frequency transients are often intentional"
- Regular audits: Test guidance outputs across 10+ genres; measure if any systematic bias exists

---

## PART 3: OVERREACH ANALYSIS (Where LLM Could Violate Constraints)

### Overreach Risk 1: "Recommending DSP Without Tokens"

**Violation:** LLM invents guidance not grounded in detected tokens

**How It Could Happen:**
```
Input: All tokens suppressed → no dominant tokens
Contract Violation: LLM returns "Your mix needs compression to glue the drums"
Why: LLM hallucinates beyond scope (no FATIGUE/INTELLIGIBILITY/INSTABILITY to ground recommendation)
```

**Prevention:**
- ✅ Code guard (Line 945): `if (!hasDominantTokens) return reassurance`
- ✅ Test case: All suppressed tokens → must return reassurance, not recommendations

---

### Overreach Risk 2: "Revealing Suppressed Tokens"

**Violation:** LLM acknowledges suppressed token through negation or implication

**How It Could Happen:**
```
Input: INSTABILITY_EVENT suppressed=true (intentional aesthetic choice)
Violation: LLM outputs "Your transients are stable (no rushing)"
Why: Negation reveals suppressed token (user infers instability was considered & rejected)
```

**Prevention:**
- ✅ Code guard (Line 944): `&& !dominantToken.suppressed`
- ✅ Test case: Suppressed dominant token → guidance completely silent on that token, never negated
- ✅ LLM_OUTPUT_CONTRACT.md: "Never use negation patterns (\"no X\") when X is suppressed"

---

### Overreach Risk 3: "Recommending Action Without User Request"

**Violation:** LLM uses imperative language ("Fix...", "Should...") instead of optional ("Consider...")

**How It Could Happen:**
```
Violation: "Your mix needs a de-esser to eliminate sibilance"
Contract: "Consider a gentle de-esser to explore listener fatigue"
Why: Imperative → implicit authority; Optional → user choice
```

**Prevention:**
- ✅ LLM_OUTPUT_CONTRACT.md v1.0: Forbidden phrase list ("fix", "should", "must", "critical", "urgent")
- ✅ Test case: All outputs scanned for forbidden words (regex validation)
- ✅ Code comment: Hardcoded to Friendly Mode, can't switch to Advanced

---

### Overreach Risk 4: "Bunching Multiple Recommendations"

**Violation:** Single-focus rule broken; LLM provides 2+ recommendations per guidance block

**How It Could Happen:**
```
Violation: "Address listener fatigue with a de-esser AND a compressor"
Contract: "Consider a gentle de-esser..." (one idea only)
Why: Bunching → cognitive overload; dilutes single focus
```

**Prevention:**
- ✅ Code structure: Only one `if/else` branch executes per token
- ✅ Test case: Multiple dominant tokens → only first analyzed; secondary affirmed
- ✅ LLM_OUTPUT_CONTRACT.md: "One guidance block per stage. No 'and also consider...' patterns"

---

### Overreach Risk 5: "Claiming Certainty Beyond Confidence"

**Violation:** LLM uses certain language when confidence is low (< 0.7)

**How It Could Happen:**
```
Input: Token detected with 0.62 confidence (barely above threshold)
Violation: "Your mix definitely has listener fatigue"
Contract: Token language: "may experience" / "some listeners experience" (acknowledges uncertainty)
Why: False certainty → user false confidence → poor decisions
```

**Prevention:**
- ✅ Phase 2 filtering: Only tokens ≥ 0.6 confidence passed to LLM
- ✅ LLM receives: `analysis_confidence` field (top-level confidence)
- ✅ LLM_OUTPUT_CONTRACT.md: Use token's own `listener_impact` field (includes "may experience")
- ✅ No language that implies certainty: avoid "Your mix has", use "Some listeners may experience"

---

### Overreach Risk 6: "Medical/Clinical Language"

**Violation:** LLM uses clinical framing ("sibilance accumulation", "spectral imbalance") instead of listener-friendly

**How It Could Happen:**
```
Violation: "High-frequency accumulation causes listener alert fatigue"
Contract: "Listener Fatigue — Some listeners experience ear fatigue from high-frequency energy"
Why: Clinical → intimidating; user feels incompetent; undermines autonomy
```

**Prevention:**
- ✅ LLM_OUTPUT_CONTRACT.md: Translation table (clinical → friendly)
- ✅ Test case: Scan outputs for forbidden clinical terms
- ✅ Hardcoded friendly mode only (can't access Advanced Mode)

---

## PART 4: SYSTEMIC RISKS (Cross-Cutting Concerns)

### Systemic Risk 1: "Silent Feature Creep"

**Risk:** Phase 4 UI becomes "just the start" of guidance expansion

**How It Could Happen:**
```
Timeline:
- Phase 4: LLM guidance in UI (one section)
- Phase 5 (Proposed): "Suggests genre-specific DSP chains"
- Phase 6 (Proposed): "Recommends reference tracks"
- Phase 7 (Proposed): "Auto-applies recommended changes"
Each step reasonable; cumulative effect: System owns the mix
```

**Why It's Dangerous:**
- Boiling frog: Users adapt to each expansion
- Authority growth: LLM gradually perceived as decision-maker
- Autonomy loss: "AI decides my mix" becomes norm

**Prevention:**
- ✅ Lock Phase 4 scope: UI strategy *only*; no new recommendations, no new tokens
- ✅ Explicit constraint: LLM output never becomes action without user click
- ✅ Require approval gate: Any Phase 5+ features must revisit LLM_OUTPUT_CONTRACT and get re-locked
- ✅ Quarterly review: "What has changed since Phase 3? Is system creeping?"

---

### Systemic Risk 2: "Dependency Lock-In"

**Risk:** Users become psychologically dependent on AI validation

**How It Could Happen:**
```
User psychology:
- Weeks 1-4: AI helpful; user learns while comparing
- Weeks 5-8: User references AI before own judgment
- Weeks 9-12: User can't trust own judgment without AI
- Months 4+: "I don't trust my ears anymore"
```

**Why It's Dangerous:**
- Erodes core skill (critical listening)
- User trapped: Can't work without system
- Business risk: Users "locked in" by learned helplessness, not value

**Prevention:**
- ✅ Guidance always frames user as expert: "Your ears are the final judge"
- ✅ Monthly listening report: If user applies AI recommendations without verification, nudge toward active listening
- ✅ Advanced Mode available: Power users can opt into Listening Pass only (skip AI entirely)
- ✅ Explicit philosophy statement on home screen: "This system enhances your listening, not replaces it"

---

### Systemic Risk 3: "Neurodivergent Harm"

**Risk:** UI design inadvertently overwhelms or alienates neurodivergent users

**How It Could Happen:**

**ADHD:** Option 1 (Passive) = Too many choices at once
- Listening Pass data (3 tokens) + AI guidance (3 sentences) + action buttons = decision paralysis
- User shuts down instead of choosing

**Autism:** Option 1 (Passive) = Unexpected information = anxiety
- Guidance appears without user request
- Triggers "system unpredictability" stress
- User stops using tool

**Dyslexia:** All options = Text-heavy UI
- Long guidance text without visual hierarchy
- User skips, misreads, gets lost

**Why It's Dangerous:**
- Excludes users (legal/ethical risk)
- Harm: Users feel system is "not for them"
- Data: No diversity in user base

**Prevention:**
- ✅ Accessibility audit (option 1 vs 2 vs 3) before final choice
- ✅ Text hierarchy: Guidance uses short sentences, bullet points, high contrast
- ✅ Option 2/3 preferred: Users control engagement timing (reduce surprise/overload)
- ✅ Visual + audio options: Offer audio rendering of guidance (read-aloud)
- ✅ Customizable display: Font size, contrast, text density adjustable
- ✅ User testing with neurodivergent participants (not just accessibility checklist)

---

### Systemic Risk 4: "Hallucination at Scale"

**Risk:** LLM corner cases fail silently or produce nonsensical guidance

**How It Could Happen:**
```
Input: Unusual token combination (e.g., all three tokens detected simultaneously)
LLM: Attempts to synthesize guidance from contradiction
Output: "Your mix is paradoxical; consider everything and nothing"
User: Confused; questions system reliability
```

**Why It's Dangerous:**
- Silent failure: User gets garbage guidance without knowing
- Trust erosion: One bad output erodes confidence in system
- Cascade: User stops using system entirely (false negative)

**Prevention:**
- ✅ Comprehensive test suite: 20+ edge cases (all combinations of tokens, suppression, confidence)
- ✅ Human review: Every LLM output pre-release reviewed by audio engineer
- ✅ Fallback always safe: If LLM fails, Listening Pass shown only (no error message confusion)
- ✅ Logging: Capture all LLM outputs + timestamps for post-mortem analysis
- ✅ Monitoring in production: Alert on unusual patterns (e.g., guidance length outliers)

---

## PART 5: DECISION SAFETY NET

### Pre-Launch Safety Checklist

**Before Phase 4 UI Implementation (Regardless of Option Chosen):**

- [ ] LLM_OUTPUT_CONTRACT.md v1.0 fully implemented and tested (5/5 test cases passing)
- [ ] All three overreach risks (suppressed tokens, imperative language, multiple recommendations) validated in code
- [ ] Feature flags verified: LLM toggleable without rebuild
- [ ] Fallback behavior tested: 10+ error scenarios confirmed non-blocking
- [ ] Listening Pass data always visible (never hidden by UI strategy)
- [ ] Text hierarchy and accessibility audit complete
- [ ] Neurodivergent user testing completed (4+ participants, 2+ profiles)
- [ ] Analytics tracking ready: User engagement metrics defined
- [ ] Monitoring in place: Alert thresholds set for misuse patterns
- [ ] Runbook prepared: How to disable guidance + revert to Listening Pass only

### Post-Launch Monitoring (First 30 Days)

- [ ] Daily: Check error logs for LLM failures or unusual outputs
- [ ] Daily: Monitor engagement metrics (click-through rate, guidance adoption)
- [ ] Weekly: User feedback review (support tickets, feature requests)
- [ ] Weekly: Spot-check LLM outputs (5 random samples) for constraint violations
- [ ] Weekly: Check analytics for misuse pattern indicators
  - Users bypassing listening pass data
  - Users applying guidance without verification
  - Dependency indicators (AI usage growth, listening pass data usage decline)
- [ ] Monthly: Full audit of system behavior + decision to maintain or adjust

### Rollback Plan (If Issues Emerge)

**Condition:** 3+ constraint violations detected OR 20%+ of users report confusion/harm

**Action:**
1. Disable LLM guidance immediately (feature flag → false)
2. Show Listening Pass data only
3. Post banner: "AI Guidance temporarily unavailable. We're fixing an issue."
4. Investigate root cause (code review, LLM prompt audit)
5. Implement safeguard
6. Re-test (10+ edge cases)
7. Re-enable with monitoring

---

## PART 6: RISK SUMMARY BY OPTION

| Risk Category | Option 1: Passive | Option 2: On-Demand | Option 3: Silent |
|---------------|-------------------|-------------------|------------------|
| **Autonomy Erosion** | 🔴 High | 🟡 Medium | 🟢 Low |
| **Authority Misuse** | 🔴 High | 🟡 Medium | 🟢 Low |
| **Feature Invisibility** | 🟢 Low | 🟡 Medium | 🔴 High |
| **Lazy Mastering** | 🔴 High | 🟡 Medium | 🟡 Medium |
| **Neurodivergent Harm** | 🔴 High | 🟡 Medium | 🟢 Low |
| **Hallucination Exposure** | 🔴 High | 🟡 Medium | 🟡 Medium |
| **Skill Atrophy** | 🔴 High | 🟡 Medium | 🟢 Low |
| **Discovery Problem** | 🟢 Low | 🟡 Medium | 🔴 High |
| **Perceived Value** | 🟢 High | 🟡 Medium | 🔴 Low |

**Interpretation:**
- Option 1: Best for perceived value, worst for autonomy
- Option 2: Middle ground across most dimensions
- Option 3: Best for autonomy, worst for discoverability

---

## CONCLUSION

**Key Finding:** All three options carry meaningful risks. None is "safe by default"—each requires explicit safeguards.

**Risk Hierarchy (Most to Least Critical):**
1. **Autonomy erosion** (affects learning + trust)
2. **Neurodivergent harm** (affects inclusion + ethics)
3. **Hallucination exposure** (affects reliability)
4. **Feature invisibility** (affects value delivery)

**Recommendation:**
- **If your priority is user autonomy:** Choose Option 3 (Silent); implement robust discoverability
- **If your priority is mixed audience:** Choose Option 2 (On-Demand); implement smart defaults
- **If your priority is beginner value:** Choose Option 1 (Passive); implement strict safeguards + critical listening prompts

**Regardless of choice:** Implement all prevention strategies in Part 1 + Systemic Risk safeguards in Part 4.

---

**Status: Planning complete. Awaiting user review and option selection before moving to GO/NO-GO criteria.**
