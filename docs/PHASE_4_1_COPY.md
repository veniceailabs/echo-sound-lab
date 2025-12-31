# Phase 4.1: Copy Specification

**Objective:** Define exact language for AI insights affordance and related UI copy

**Scope:** Planning only; no code

**Non-Negotiables:**
- ✓ Neutral, factual framing (not persuasive)
- ✓ Zero urgency language
- ✓ Optional, not directive
- ✓ Affirms user as expert
- ✓ Friendly Mode tone only
- ✓ No jargon, no assumptions

---

## COPY HIERARCHY

Copy appears at multiple touchpoints. Each must reinforce "optional, available, user-controlled."

### Level 1: Primary Affordance (The Indicator)

**Location:** Below Listening Pass token data on Echo Report Card

**Primary Label (when hidden):**
```
✨ AI insights available
```

**Rationale:**
- "✨" = visual marker (AI, sparkle, optional enhancement)
- "AI insights" = clear subject (what you're clicking for)
- "available" = factual, present tense, no urgency
- Not "Get insights" (sounds like need), not "View" (implies you should), not "Recommended" (implies should-ness)

**Rejected Alternatives:**
- ❌ "Get AI recommendations" — Pushes ("get"), implies need
- ❌ "AI guidance available" — "Guidance" = authoritative/directive
- ❌ "Explore AI insights" — "Explore" = exploratory tone (fine for power users, not neutral enough)
- ❌ "AI analysis" — Too vague, sounds like something you need to review
- ❌ "Smart suggestions" — "Smart" = appeals to vanity; "suggestions" implies you should take them
- ❌ "AI says..." — Implies system is speaking to you; too personal
- ❌ "Learn from AI" — "Learn" = implies you're deficient without it

**Accessibility Label (for screen readers):**
```
"AI insights available, click to view optional interpretation"
```

**Rationale:**
- Full sentence provides context (that it's optional)
- "Click to view" = clear action
- "Optional interpretation" = both accessible and philosophy-aligned

---

### Level 2: Interactive State (When User Hovers/Focuses)

**Tooltip Text (appears on hover or focus):**
```
AI Interpretation — Optional

Your Listening Pass analysis is complete. The AI has provided an optional interpretation.

Click to read or learn more.
```

**Rationale:**
- Confirms: Listening Pass is complete (primary source is sufficient)
- Frames: AI interpretation as optional, not required
- Invites, doesn't demand: "Click to read or learn more"
- Clear affordance: "Click" makes action explicit

**Rejected Alternatives:**
- ❌ "See what the AI thinks" — Conversational but implies you should care
- ❌ "AI recommendations waiting" — Creates sense of pending items
- ❌ "You might find this helpful" — Directive ("might find helpful")
- ❌ "Advanced analysis available" — Implies basic analysis might be insufficient

---

### Level 3: Expanded State (Guidance Now Visible)

**Guidance Header (above the actual guidance text):**
```
AI INTERPRETATION (Optional)
```

**Rationale:**
- "AI INTERPRETATION" = clear labeling (not recommendation, not verdict, not analysis)
- "(Optional)" = reminds user they chose to view this; can close anytime
- Caps = visual hierarchy (section header), not emphasis/urgency

**Action Buttons (below guidance):**

```
[ Hide ]  [ Learn More ]
```

**Rationale:**
- "Hide" = reversible action (not "Dismiss" which implies you were wrong to view it)
- "Learn More" = optional deep dive into reasoning
- No "Apply" or "Use This" button = guidance is interpretation only, not action trigger
- No "Save to Actions" = keeps guidance in interpretation layer, not action layer

**Rejected Button Labels:**
- ❌ "Close" — Dismissive tone
- ❌ "Dismiss" — Implies you made a mistake viewing it
- ❌ "Done" — Implies you needed to complete something
- ❌ "Apply" — Converts interpretation to action (violates boundaries)
- ❌ "Use This" — Directive language
- ❌ "Got it" — Conversational, implies you should remember this

---

## CONTEXTUAL COPY (Across the App)

### In Help/Documentation

**Help Article Title:**
```
What Are "AI Insights"?
```

**Help Article Body:**
```
AI Insights is an optional feature that provides an AI-generated interpretation of your Listening Pass analysis.

**Key points:**

- Your Listening Pass analysis is complete and sufficient on its own
- AI Insights provides a secondary perspective if you want one
- You control whether to view them (they're always optional)
- Your ears remain the authority; AI insights are interpretation, not instruction

**Why are insights hidden by default?**

You're the mastering expert. This system is here to support your listening, not replace it. AI insights are available if you want a second perspective, but silence is perfectly valid.

**How to access:**

On your Echo Report Card, look for "✨ AI insights available" below the token data. Click to view the interpretation.

**Is it recommended I view the insights?**

No. The decision is entirely yours. View them if you're curious, if you want validation, or if you're learning. Skip them if you trust your own analysis.
```

**Rationale:**
- Frames insights as secondary ("secondary perspective")
- Affirms listening pass as primary ("complete and sufficient")
- Emphasizes choice ("entirely yours")
- Explains philosophy ("support your listening, not replace it")
- No pressure ("skip them if you trust your own analysis")

---

### In Onboarding

**Onboarding Slide Title:**
```
Optional: AI Insights
```

**Onboarding Slide Body:**
```
After analyzing your mix, Echo Sound Lab can provide AI insights.

Your Listening Pass analysis is complete. AI insights are here if you want an additional perspective—but they're entirely optional.

View them, skip them, or return to them later. The choice is yours.
```

**Rationale:**
- "Optional" in title (primes user: this is optional)
- Affirms Listening Pass is complete (frame: no need for insights)
- "Entirely optional" (reinforces choice)
- "The choice is yours" (affirms agency)

**Onboarding Slide CTA Button:**
```
[ I understand ]
```

**Rationale:**
- "I understand" = acknowledges information received (not "Next" which implies progression)
- Neutral, not "Let me try" (wouldn't create expectation to view insights)

---

### In Release Notes / Feature Announcement

**Announcement Headline:**
```
Phase 4: AI Insights Layer — Now Available (Opt-In)
```

**Announcement Body:**
```
Echo Sound Lab now includes an optional AI interpretation layer.

**What changed:**
- Listening Pass analysis now has an optional "AI Insights" section
- Insights are hidden by default (you control visibility)
- View them to see what the AI noticed; skip them if you trust your analysis

**Why optional?**
Your Listening Pass analysis is complete on its own. AI Insights are here if you want a second perspective, but they're never required.

**How to access:**
On your Echo Report Card, look for "✨ AI insights available" and click to view.
```

**Rationale:**
- "(Opt-In)" in headline = clear framing
- "Hidden by default" = manages expectations
- "You control visibility" = emphasizes agency
- "Never required" = removes obligation

---

## COPY CONSTRAINTS (Absolute Rules)

### Forbidden Words/Phrases (Zero Tolerance)

❌ **Never use:**
- "Recommended" (implies should-ness)
- "Should" (directive)
- "Must" (imperative)
- "Have to" (obligation)
- "Need to" (implies deficiency)
- "Important" (creates urgency)
- "Critical" (urgency)
- "Urgent" (urgency)
- "Fix" (problem framing)
- "Smart suggestion" (vanity appeal)
- "Better" (comparative pressure)
- "Best" (superlative pressure)
- "You might miss out" (FOMO)
- "Don't forget" (obligation reminder)

### Mandatory Words/Phrases (Always Include When Relevant)

✅ **Always include:**
- "Optional" (when introducing insights)
- "Your choice" (when describing control)
- "You decide" (when describing agency)
- "If you want" (conditional, not obligatory)
- "Your Listening Pass analysis is complete" (affirms primary source)
- "Your ears are the authority" (affirms user expertise)
- "Entirely up to you" (maximum agency affirmation)

---

## TONE MATRIX

### ✅ Approved Tone Examples

**Neutral-Factual:**
- "AI insights available"
- "Click to view the interpretation"
- "The AI noticed a focus area"

**Affirming-User-as-Expert:**
- "Your Listening Pass analysis is complete"
- "Your ears remain the authority"
- "The choice is entirely yours"

**Calm-Observational:**
- "What the AI noticed"
- "The system detected a focus area"
- "Here's what the analysis showed"

**Choice-Respecting:**
- "View them if you're curious"
- "Skip them if you trust your analysis"
- "Return anytime you want a second perspective"

### ❌ Rejected Tone Examples

**Pushy:**
- "Don't miss these insights!"
- "Get AI-powered recommendations"
- "You should review the AI analysis"

**Urgent:**
- "New insights waiting!"
- "1 insight available"
- "See what you're missing"

**Directive:**
- "Apply these suggestions"
- "The AI recommends you..."
- "Here's what you need to do"

**Patronizing:**
- "Let the AI help you"
- "Trust the system"
- "AI knows best"

**Vanity Appeal:**
- "Get smart suggestions"
- "Advanced AI analysis"
- "Sophisticated recommendations"

---

## COPY EXAMPLES BY CONTEXT

### Example 1: Basic User Who Never Clicks Indicator

**User sees:**
- Listening Pass data
- "✨ AI insights available" indicator
- No other mentions

**User experience:**
- Works with Listening Pass data only
- Indicator present (not nagging)
- Never sees any guidance text
- Silence respected

**Copy encountered:** Just indicator label

---

### Example 2: Curious User Who Clicks Once

**User flow:**
1. Sees indicator
2. Hovers → tooltip appears
3. Reads tooltip: "AI Interpretation — Optional. Your Listening Pass analysis is complete. The AI has provided an optional interpretation. Click to read or learn more."
4. Clicks indicator
5. Reads guidance header: "AI INTERPRETATION (Optional)"
6. Reads guidance text (from Phase 3)
7. Clicks "Hide"

**Copy encountered:**
- Indicator label
- Tooltip
- Guidance header
- Button label ("Hide")

**Tone check:** Neutral, optional, user-controlled throughout

---

### Example 3: Advanced User Using Help

**User flow:**
1. Reads help article: "What Are AI Insights?"
2. Learns that insights are optional, secondary to Listening Pass
3. Returns to report card
4. Sees indicator
5. Immediately understands what it is
6. Clicks
7. Reads guidance

**Copy encountered:**
- Help article (full explanation)
- Indicator label
- Guidance header

**Tone check:** Educational, affirming, zero pressure

---

### Example 4: New User Going Through Onboarding

**User flow:**
1. Onboarding slide: "Optional: AI Insights"
2. Reads description
3. Clicks "I understand"
4. Later: Uploads first track
5. Sees Listening Pass data + indicator
6. Recognizes it from onboarding
7. Chooses whether to click

**Copy encountered:**
- Onboarding slide
- Indicator label (recognition triggers learning)

**Tone check:** Introduction as optional from the start

---

## COPY VALIDATION CHECKLIST

Before any copy is finalized, verify:

- [ ] No forbidden words present (urgency, directive, pressure)
- [ ] "Optional" or "choice" mentioned at least once per context
- [ ] User affirmation present ("Your choice", "Your ears", etc.)
- [ ] Listening Pass framed as complete/primary
- [ ] No assumption of user need or deficiency
- [ ] Tone is calm, observational, factual
- [ ] All action buttons are reversible (not one-way commits)
- [ ] Help text explains *why* insights are optional (philosophy)
- [ ] No FOMO, urgency, or scarcity language
- [ ] Jargon-free (accessible to all skill levels)
- [ ] Consistent across all touchpoints (indicator, tooltip, button, help)

---

## COPY LOCALIZATION NOTES

**For future translations:**
- "Optional" is critical to preserve (not "additional", "supplementary")
- "Your choice" / "entirely yours" phrases essential to maintain agency framing
- Conversational tone OK in some languages (not always formal)
- Avoid idioms that suggest obligation ("don't leave this on the table")

---

**Status: Copy specification complete. Awaiting review and placement planning.**
