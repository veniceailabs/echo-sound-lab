# Phase 4.1: Discovery Mechanics

**Objective:** Define how users learn that AI guidance exists—without nudging, prompting, or behavioral shaping

**Scope:** Planning only; no code

**Non-Negotiables:**
- ✓ Silent-by-default remains unchanged
- ✓ No auto-surface behavior
- ✓ No popups, notifications, or urgency language
- ✓ Discovery is intentional, not accidental
- ✓ Advanced users discover immediately; beginners discover naturally over time

---

## DECISION PHILOSOPHY

**Core Tension:** Hidden feature must be discoverable, but discovery must respect silence.

**Principle:** "Quiet confidence, not hiding."

The affordance should exist visibly but not demandingly. A user who looks will find. A user who doesn't shouldn't feel pressured to look.

---

## DISCOVERY MECHANISMS (Five Layers)

Discovery will happen through multiple, non-intrusive pathways. No single pathway is mandatory; all are equally valid.

### Layer 1: Direct Observation (Immediate Discovery)

**How It Works:**
User uploads audio → Listening Pass analysis completes → User naturally scans the report card.

**What They See:**
Small, neutral indicator visible on the Echo Report Card: "✨ AI insights available"

**Mechanism:**
The indicator is *always* present (after Listening Pass completes) but positioned in a low-attention area. It does not announce itself. It exists as a fact.

**User Experience:**
```
User action: Upload track
System: Runs Listening Pass
Display: Shows Listening Pass data
        Shows: "✨ AI insights available"
User choice:
  - Clicks indicator → Sees guidance
  - Ignores it → Continues with Listening Pass data
  - Returns later → Indicator still there
```

**Why This Works:**
- Not hidden (user can find immediately)
- Not pushy (user must choose to engage)
- Respects silence (if user doesn't click, they're not lectured)

**Accessibility:**
- Indicator is visible but not distracting
- Clear affordance (clickable region, clear visual boundary)
- Alt text for screen readers: "AI insights available. Click to view optional interpretation."

---

### Layer 2: Help System Integration (Self-Service Discovery)

**How It Works:**
User navigates to Echo Report Card help/documentation → Finds brief explanation of guidance feature.

**Content Example:**
```
HELP SECTION: "What is 'AI insights available'?"

---

The AI insights feature provides an optional, AI-generated interpretation of your Listening Pass analysis.

The insights are:
- Optional (you decide if you want to read them)
- Non-directive (they're suggestions, not commands)
- Always available (click the indicator to see them)

Why they're hidden by default:
You're the expert. Your ears are the authority. AI insights are here if you want a second perspective, but they're not necessary.

How to access:
1. Complete a Listening Pass analysis
2. Look for "✨ AI insights available" below the token data
3. Click to read the interpretation
4. Or don't—the Listening Pass data is complete on its own
```

**Why This Works:**
- Self-directed (user chooses to learn)
- Explains philosophy (user understands *why* insights are optional)
- No pressure (presented as information, not recommendation)
- Persistent (accessible anytime)

**Accessibility:**
- Text-based, searchable
- No prerequisites (anyone can read)
- Clear, jargon-free language

---

### Layer 3: Onboarding Integration (New User Discovery)

**How It Works:**
First-time user (or on-demand) onboarding walkthrough includes one slide explaining the guidance feature.

**Format:** Single screen in onboarding flow

**Content:**
```
SLIDE TITLE: "Optional: AI Insights"

---

After analyzing your mix, Echo Sound Lab can provide AI-generated insights.

These insights are optional. You can view them or skip them—both are valid.

Your Listening Pass analysis is complete and useful on its own. AI insights are here if you want an additional perspective.

[ I understand ]  [ Skip this ]  [ Learn more ]
```

**User Experience:**
- Framed as optional feature (not essential learning)
- Shown once during onboarding
- User can dismiss and never see it again
- User can review at any time in help system

**Why This Works:**
- New users informed (know feature exists)
- Not mandatory (can skip without penalty)
- Lightweight (one slide, not a lecture)
- Philosophy-aligned (emphasizes optionality)

**Accessibility:**
- Simple, large text
- No time pressure
- Audio option available (read-aloud)
- Skip always available

---

### Layer 4: Contextual Mention (Passive Documentation)

**How It Works:**
Release notes, blog posts, or documentation naturally mention the feature as part of system capabilities.

**Example Placement:**
- Release notes: "Phase 4: LLM guidance layer now available (opt-in)"
- Feature list: "AI Insights (optional interpretation of Listening Pass data)"
- Capability overview: "Three ways to understand your mix: Listening Pass (primary), AI Insights (optional), Critical Listening (always)"

**Why This Works:**
- Informs without pushing
- Positions as capability, not requirement
- Reaches power users who read release notes
- Passive discovery (user initiates learning)

**Accessibility:**
- Text-based, linkable
- Searchable in documentation
- No interactive elements required

---

### Layer 5: Expert User Fast Track (Immediate Access)

**How It Works:**
Advanced/power users (those familiar with Listening Pass) immediately recognize the affordance and click it.

**User Experience:**
```
Expert user uploads track → Analyzes Listening Pass tokens → Sees "✨ AI insights available"
Expert thinks: "What does the AI say about this?"
Expert clicks → Gets guidance
Expert compares guidance to own interpretation → Validates or disagrees
```

**Why This Works:**
- Doesn't slow down experts (one click vs. friction)
- Respects their agency (they know what they want)
- Immediate value (expert can compare AI to their judgment)

**Accessibility:**
- Keyboard shortcut available (Tab + Enter)
- Clear visual indicator of clickability
- Immediate feedback (guidance appears)

---

## REJECTED DISCOVERY MECHANISMS

**Why these were *not* chosen:**

### ❌ Rejected: Auto-Show on First Use
- **Reason:** Violates "no auto-surface" principle
- **Problem:** Even once is a nudge
- **Impact:** Sets tone that system will inform users when it thinks they should know something

### ❌ Rejected: Tooltip on Hover
- **Reason:** Users shouldn't need to hover to discover
- **Problem:** Hidden even more than indicator alone
- **Impact:** Requires exploration; extra friction

### ❌ Rejected: Notification Badge ("1 insight available")
- **Reason:** Creates sense of urgency ("You have something waiting")
- **Problem:** Behavioral shaping (user feels obligation to check)
- **Impact:** Contradicts silent-by-default philosophy

### ❌ Rejected: Animated Pulse/Attention Grab
- **Reason:** Inherently pushy
- **Problem:** Violates "non-demanding" principle
- **Impact:** User learns system wants attention, not that feature exists

### ❌ Rejected: Modal on First Load
- **Reason:** Forced interaction; user must dismiss
- **Problem:** Even "skip" is a nudge (system intruding)
- **Impact:** Negative experience for users who want silence

### ❌ Rejected: Email/External Notification
- **Reason:** Intrusive channel
- **Problem:** Crosses boundary into user's personal space
- **Impact:** Creates CTA pressure outside the app

---

## DISCOVERY FLOW DIAGRAM

```
USER UPLOADS AUDIO
    ↓
LISTENING PASS COMPLETES
    ↓
REPORT CARD DISPLAYED
    ├─→ "✨ AI insights available" indicator present
    ├─→ Listening Pass data visible (primary focus)
    └─→ User sees both simultaneously

    ↓
USER'S NEXT DECISION
    │
    ├─→ Path A: User clicks indicator
    │       ↓
    │       Guidance displayed
    │       User reads, affirms, disagrees, or ignores
    │       Can toggle guidance on/off
    │       Can return to Listening Pass data anytime
    │
    ├─→ Path B: User ignores indicator
    │       ↓
    │       Works with Listening Pass data only
    │       Indicator remains visible (not nagging)
    │       User can click it anytime
    │       Silence is respected outcome
    │
    └─→ Path C: User explores help/documentation
            ↓
            Finds explanation of AI insights feature
            Learns why insights are optional
            Decides to try or skip
            Returns to report card
```

---

## COPY PRINCIPLES FOR DISCOVERY

**What the indicator says matters:**

### ✅ Approved Framing
- "✨ AI insights available" (neutral, factual)
- "Optional: AI interpretation" (emphasizes choice)
- "What AI noticed" (observational, not prescriptive)

### ❌ Rejected Framing
- "Get AI recommendations" (too pushy, suggests need)
- "You should review AI insights" (directive)
- "AI analysis complete" (sounds like something is wrong if not reviewed)
- "Smart suggestions waiting" (urgency, behavioral nudge)

**Principle:** Indicator announces existence, not urgency.

---

## ACCESSIBILITY MATRIX

| Discovery Layer | Keyboard | Screen Reader | High Contrast | Low Vision | Neurodivergent |
|-----------------|----------|---------------|----------------|------------|-----------------|
| **Direct Observation** | ✅ Tab focus | ✅ "AI insights available" | ✅ Indicator visible | ✅ Clear affordance | ✅ No surprise |
| **Help System** | ✅ Searchable | ✅ Text-based | ✅ Standard docs | ✅ Readable | ✅ Self-paced |
| **Onboarding** | ✅ Skippable | ✅ Read-aloud | ✅ High contrast | ✅ Large text | ⚠️ One screen only |
| **Documentation** | ✅ Linkable | ✅ Text-based | ✅ Standard | ✅ Standard | ✅ Self-paced |
| **Expert Track** | ✅ Immediate | ✅ Clear label | ✅ Visible | ✅ Visible | ✅ No friction |

**Accessibility Guarantee:**
- Screen readers: Full description available ("AI insights available, optional")
- Keyboard: Full Tab navigation; Enter to activate
- High contrast: Indicator visible in all modes
- Low vision: Indicator placement considered (not tiny, not edge of screen)
- Neurodivergent: No surprise surfaces; all discovery is intentional user action

---

## SUCCESS METRICS FOR DISCOVERY

### How We Know Discovery Is Working (Not Nudging)

**Metric 1: Discovery Ratio**
- % of users who discover AI insights feature (goal: > 80%)
- Measured by: Click on indicator / Total Listening Pass analyses
- Threshold: If < 50%, discovery mechanism is failing (requires redesign)

**Metric 2: Discovery Latency**
- Sessions before user discovers feature
- Expert users: Session 1 (immediate observation)
- Intermediate users: Sessions 2-5 (notice on repeated use)
- Beginners: Sessions 5-10 (help system or onboarding)
- Goal: Natural distribution (no bottleneck)

**Metric 3: Unsolicited Discovery Rate**
- % of users who discover without any external help
- Measured by: Direct observation clicks vs. help-initiated
- Goal: > 60% discover via indicator alone (not needing help)

**Metric 4: No Behavioral Pressure Detected**
- Ratio of: Guidance viewed / Guidance dismissed
- If ratio > 3:1 (users always viewing), suggests hidden pressure
- Goal: Ratio near 1:1 or 2:1 (both choices equally valid)

**Metric 5: Silence Respected**
- % of users who complete analyses without ever viewing guidance
- Goal: 10-20% never click (this is success, not failure)
- If 0%, suggests feature is too pushy; if > 50%, suggests discovery failed

---

## CONSTRAINTS HONORED

✅ **Silent-by-default preserved:** Guidance not shown until user clicks
✅ **No auto-surface:** Indicator present, but never auto-expands
✅ **No nudging:** Indicator is statement of fact, not call-to-action
✅ **No urgency:** No "new", no badges, no notifications
✅ **No persuasion:** Framing is neutral ("available") not persuasive ("should")
✅ **Accessibility:** All discovery paths keyboard/screen-reader accessible
✅ **Neurodivergence safety:** No surprises, no forced interactions
✅ **Friendly Mode only:** Copy uses calm, optional language

---

## IMPLEMENTATION READINESS

**This plan is ready for:**
1. Copy finalization (PHASE_4_1_COPY.md)
2. Placement specification (PHASE_4_1_PLACEMENT.md)
3. Opt-in trigger design (PHASE_4_1_OPT_IN_TRIGGER.md)
4. Code-level implementation (after all Phase 4.1 docs approved)

**Not yet decided:**
- Exact visual design of indicator
- Specific placement coordinates
- Click behavior (toggle vs. expand vs. navigate)
- Conditional logic (when indicator appears)

---

**Status: Planning complete. Awaiting review and next planning deliverables.**
