# Phase 4: UI Strategy (Planning Only - No Code)

**Objective:** Decide how (and if) LLM guidance is surfaced to users

**Scope:** Options framing, explicit tradeoffs, agency protection

**Status:** Planning, awaiting decision before any implementation

---

## THE DECISION AHEAD

Echo Sound Lab has a perception layer (Phase 2) and an interpretation layer (Phase 3).

Now the question is not technical. It's **ethical**: How much does the system *show* the user?

Three options. Each has tradeoffs. None is default-correct.

---

## OPTION 1: PASSIVE DISPLAY (Always Show)

**Description:**
- LLM guidance rendered automatically in Echo Report Card
- User sees recommendations every time analysis runs
- Opt-out (hide) is available but not default
- Guidance appears in clear UI section below Listening Pass data

**User Flow:**
```
Upload → Listening Pass runs → [AUTOMATIC] → LLM Guidance displayed
                                            → "Here's what we notice..."
                                            → User can hide or ignore
```

**UI Mockup:**
```
╔════════════════════════════════════════════╗
║         ECHO REPORT CARD                   ║
╠════════════════════════════════════════════╣
║                                            ║
║  LISTENING PASS ANALYSIS                   ║
║  [Raw token data visible]                  ║
║                                            ║
╠════════════════════════════════════════════╣
║                                            ║
║  AI GUIDANCE (from Phase 3)                ║
║  "Your mix is listener-friendly with       ║
║   one focus area: Listener Fatigue         ║
║   Consider a gentle de-esser..."           ║
║                                            ║
║  [ Hide ]  [ View Details ]                ║
║                                            ║
╚════════════════════════════════════════════╝
```

### TRADEOFFS: Passive Display

**Pros:**
- ✅ Immediate value ("Here's what we found")
- ✅ Guidance visible without friction
- ✅ Builds confidence in analysis
- ✅ Supports beginners (helpful scaffolding)
- ✅ Clear, transparent workflow

**Cons:**
- ❌ Could feel intrusive (unsolicited recommendations)
- ❌ Risk of persuasion drift ("trust the AI over your ears")
- ❌ Neurodivergent users may find automatic suggestions overwhelming
- ❌ User agency deemphasized (system decides what's important)
- ❌ Hard to "opt out" mentally (always present)
- ❌ Could discourage critical listening

**Risk Profile:** Medium - useful for some, patronizing for others

---

## OPTION 2: ON-DEMAND GUIDANCE (User-Invoked)

**Description:**
- Listening Pass data displayed by default
- User explicitly requests LLM interpretation
- Guidance shown only when user clicks "Get AI Guidance"
- Clear separation: "Here's what we detected" vs "Here's what it means"

**User Flow:**
```
Upload → Listening Pass runs → User sees tokens + priority
                            → User decides: view AI interpretation?
                            → [ Get AI Guidance ] button
                            → [ONLY IF CLICKED] → LLM Guidance displayed
```

**UI Mockup:**
```
╔════════════════════════════════════════════╗
║         ECHO REPORT CARD                   ║
╠════════════════════════════════════════════╣
║                                            ║
║  LISTENING PASS ANALYSIS                   ║
║  [Raw token data visible]                  ║
║                                            ║
║  Tokens Detected:                          ║
║  • Fatigue: Moderate (0.81 confidence)     ║
║  • Intelligibility: Clear (0.95)           ║
║  • Instability: Stable (suppressed)        ║
║                                            ║
║  [ Get AI Interpretation ] [ Details ]     ║
║                                            ║
╚════════════════════════════════════════════╝

[User clicks "Get AI Interpretation"]

╔════════════════════════════════════════════╗
║  AI INTERPRETATION                         ║
├────────────────────────────────────────────┤
║  Your mix is listener-friendly with one    ║
║  focus area: Listener Fatigue.             ║
║  Consider a gentle de-esser...             ║
║                                            ║
║  [ Hide ]  [ Use This ]  [ Details ]       ║
╚════════════════════════════════════════════╝
```

### TRADEOFFS: On-Demand Guidance

**Pros:**
- ✅ User agency maximized (they decide to view)
- ✅ Reduces cognitive overload (optional detail)
- ✅ Good for experienced users (they know when they need help)
- ✅ Clear data vs interpretation boundary
- ✅ Respects autonomy (you asked for this)
- ✅ Neurodivergent-friendly (not automatic)
- ✅ "Listening first" philosophy honored

**Cons:**
- ❌ Beginner users might not click the button
- ❌ Extra friction (one more decision)
- ❌ Could feel like help is hidden away
- ❌ Discovery problem (new users miss it)
- ❌ Less immediate gratification

**Risk Profile:** Low - respectful but requires user initiation

---

## OPTION 3: SILENT-BY-DEFAULT WITH OPTIONAL REVEAL

**Description:**
- Listening Pass data shown by default (raw tokens)
- LLM guidance exists but is **not rendered** until toggled
- Small "✨ AI Insights Available" indicator (non-intrusive)
- User controls visibility per analysis or globally
- Emphasizes user's own listening as primary

**User Flow:**
```
Upload → Listening Pass runs → User sees tokens + priority
                            → Small indicator: "AI insights available"
                            → [TOGGLE] → LLM Guidance shown/hidden
                            → Default: hidden (user is the expert)
```

**UI Mockup:**
```
╔════════════════════════════════════════════╗
║         ECHO REPORT CARD                   ║
╠════════════════════════════════════════════╣
║                                            ║
║  LISTENING PASS ANALYSIS                   ║
║  [Raw token data visible]                  ║
║                                            ║
║  Tokens Detected:                          ║
║  • Fatigue: Moderate (0.81 confidence)     ║
║  • Intelligibility: Clear (0.95)           ║
║  • Instability: Stable (suppressed)        ║
║                                            ║
║  ✨ AI insights available [ Show ]         ║
║  [ Details ]  [ Export ]  [ Actions ]      ║
║                                            ║
╚════════════════════════════════════════════╝

[User clicks Show]

╔════════════════════════════════════════════╗
║  AI INSIGHTS (Optional)                    ║
├────────────────────────────────────────────┤
║  Your mix is listener-friendly with one    ║
║  focus area: Listener Fatigue.             ║
║  Consider a gentle de-esser...             ║
║                                            ║
║  [ Hide ]  [ Apply ]  [ Dismiss ]          ║
╚════════════════════════════════════════════╝
```

### TRADEOFFS: Silent-by-Default

**Pros:**
- ✅ Maximal user agency (you choose to engage)
- ✅ Respects "I'll trust my ears" users
- ✅ Honors neurodivergent autonomy (no forced suggestions)
- ✅ Emphasizes perception over persuasion
- ✅ Most aligned with "restraint > expansion"
- ✅ No risk of subtle coercion
- ✅ Builds critical listening skills
- ✅ Advanced user experience

**Cons:**
- ❌ New users might never discover insights
- ❌ Significant friction (guidance is hidden)
- ❌ Could feel like system doesn't care
- ❌ Reduces perceived value to beginners
- ❌ Requires explicit opt-in (higher barrier)
- ❌ "Why buy if I have to click?"

**Risk Profile:** Very Low - but requires user discovery

---

## COMPARISON MATRIX

| Factor | Option 1: Passive | Option 2: On-Demand | Option 3: Silent |
|--------|-------------------|-------------------|-----------------|
| **Agency** | Medium | High | Very High |
| **Beginner friction** | Low | Medium | High |
| **Expert preference** | Medium | High | Very High |
| **Neurodivergent fit** | Low | High | Very High |
| **Persuasion risk** | Medium-High | Low | Very Low |
| **Discovery problem** | None | Low | High |
| **Cognitive load** | High | Medium | Low |
| **Alignment with philosophy** | Medium | High | Very High |
| **Perceived value** | High | Medium | Low-Medium |
| **Coercion risk** | Medium | Low | Very Low |

---

## CRITICAL DECISION FACTORS

### Factor 1: Trust vs Convenience

**Passive (Option 1):** High convenience, medium trust
- System decides what's important
- User might feel guided rather than informed

**On-Demand (Option 2):** Medium convenience, high trust
- User requests insight when needed
- System respects that decision

**Silent (Option 3):** Low convenience, very high trust
- System trusts user's judgment
- User stays in control

### Factor 2: Neurodivergence Impact

**Passive:** Unsolicited suggestions can trigger overwhelm
- ADHD: More choices = harder to focus
- Autism: Unexpected information = anxiety
- Dyslexia: More text = cognitive fatigue

**On-Demand:** User controls engagement
- Only view when ready
- No surprise overload

**Silent:** Trusts user's autonomy
- If you want insights, you access them
- No automatic noise

### Factor 3: "Listening First" Philosophy

**Passive:** Says "Here's what the AI thinks"
- Subtly prioritizes AI interpretation
- Risk: "Trust the AI over your ears"

**On-Demand:** Says "Here's what we detected; you decide if you want interpretation"
- Balances data and autonomy
- User chooses engagement

**Silent:** Says "You're the expert; AI insights are available if you want them"
- Honors user judgment first
- AI is tool, not authority

### Factor 4: Beginner vs Expert Split

**Passive:**
- Beginners love it (scaffolding)
- Experts hate it (feeling patronized)

**On-Demand:**
- Beginners tolerate it (option to learn)
- Experts prefer it (clarity)

**Silent:**
- Beginners may never use it (discovery problem)
- Experts champion it (pure autonomy)

---

## FAILURE MODE PER OPTION

### Option 1: Passive Display - Failure Mode

"AI guidance becomes gospel"
- User stops trusting their ears
- Uses AI rec as substitute for critical listening
- Eventually defaults to "what does AI say?" instead of "what do I hear?"

**Prevention:** Emphasize Listening Pass as observation, not directive

---

### Option 2: On-Demand - Failure Mode

"Button goes unused"
- New users don't discover the feature
- Experienced users forget it exists
- Feature becomes "nice to have," not essential

**Prevention:** Good onboarding, clear labeling, persistent visibility

---

### Option 3: Silent - Failure Mode

"Delight becomes mystery"
- User never clicks "Show"
- System seems purposeless
- "What's the AI doing if I never see it?"

**Prevention:** Clear communication about what's available; trust education

---

## EXPLICIT GUARDRAILS (All Options)

Regardless of choice, enforce:

✅ LLM_OUTPUT_CONTRACT.md v1.0 always (no exceptions)
✅ Guidance is optional, never directive
✅ User's ears remain primary authority
✅ Neurodivergent accessibility honored
✅ No behavioral nudging (no urgency, shame, or manipulation)
✅ "Learn more" and "Details" always available
✅ Data transparency (show Listening Pass tokens)
✅ Opt-out always available (hide guidance)

---

## RECOMMENDATION FRAMEWORK

**Choose Option 1 (Passive) if:**
- Target user is beginner/hobbyist
- Value convenience and quick feedback
- Willing to accept medium persuasion risk
- Team confident in non-coercive language

**Choose Option 2 (On-Demand) if:**
- Mixed audience (beginners + experts)
- Want to balance autonomy and value
- Prefer clear data/interpretation separation
- Good for professional/serious users

**Choose Option 3 (Silent) if:**
- Target user is experienced/advanced
- Maximum autonomy is core value
- Neurodivergence accessibility is priority
- Willing to accept discovery problem
- Philosophy is "restraint > expansion"

---

## READY FOR DECISION

All three options are viable. Each reflects different values:

- **Option 1:** "We'll help you understand"
- **Option 2:** "We have insights when you want them"
- **Option 3:** "You're the expert; we listen too"

No option is wrong. The choice reflects **who this system is for** and **what you believe users need**.

---

**Awaiting strategic direction before moving to Risk Analysis.**
