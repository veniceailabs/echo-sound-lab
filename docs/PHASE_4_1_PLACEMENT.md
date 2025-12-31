# Phase 4.1: Placement Specification

**Objective:** Define where the AI insights affordance lives on the UI—visible but non-intrusive

**Scope:** Planning only; no code

**Non-Negotiables:**
- ✓ Affordance is discoverable (user can find if they look)
- ✓ Not stealing attention (not in primary focus area)
- ✓ Respects visual hierarchy (Listening Pass data primary)
- ✓ Not spatially associated with urgency elements
- ✓ Accessible to keyboard and screen readers
- ✓ Works across all screen sizes (responsive)

---

## DESIGN PHILOSOPHY

**Principle: "In Plain Sight, Not Front and Center"**

The indicator should exist as a peer to Listening Pass data, not as a subordinate or primary feature. It's available, but not demanding.

---

## UI LOCATION SPECIFICATION

### Current Echo Report Card Structure

```
┌─────────────────────────────────────────┐
│         ECHO REPORT CARD                │
├─────────────────────────────────────────┤
│                                         │
│  LISTENING PASS ANALYSIS                │
│  ─────────────────────────────          │
│  • Fatigue: Moderate (0.81)             │
│  • Intelligibility: Clear (0.95)        │
│  • Instability: Stable (suppressed)     │
│                                         │
│  Interpretation:                        │
│  [Human-friendly summary]               │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ACTION BUTTONS                         │
│  [ View Details ]  [ Export ]           │
│                                         │
└─────────────────────────────────────────┘
```

### New Placement (Option A: Below Listening Pass, Above Actions)

```
┌─────────────────────────────────────────┐
│         ECHO REPORT CARD                │
├─────────────────────────────────────────┤
│                                         │
│  LISTENING PASS ANALYSIS                │
│  ─────────────────────────────          │
│  • Fatigue: Moderate (0.81)             │
│  • Intelligibility: Clear (0.95)        │
│  • Instability: Stable (suppressed)     │
│                                         │
│  Interpretation:                        │
│  [Human-friendly summary]               │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ✨ AI insights available               │  ← NEW PLACEMENT
│                                         │
│  [ View Details ]  [ Export ]           │
│                                         │
└─────────────────────────────────────────┘
```

**Rationale:**
- Comes after Listening Pass data (respects primary source)
- Not cramped into actions row (gets own visual space)
- Clear visual boundary (horizontal line separates from actions)
- User sees full analysis, then discovers insights option
- Natural reading flow (top to bottom)

**Pros:**
- Visually separated (not competing with other affordances)
- Clear, dedicated space (not squeezed)
- Follows natural reading order
- Easy to hit target (full line is clickable)

**Cons:**
- Requires adding horizontal section (slightly more vertical space)
- Not immediately next to related content (data is above)

---

### Alternative Placement (Option B: Inline with Listening Pass Interpretation)

```
┌─────────────────────────────────────────┐
│         ECHO REPORT CARD                │
├─────────────────────────────────────────┤
│                                         │
│  LISTENING PASS ANALYSIS                │
│  ─────────────────────────────          │
│  • Fatigue: Moderate (0.81)             │
│  • Intelligibility: Clear (0.95)        │
│  • Instability: Stable (suppressed)     │
│                                         │
│  Interpretation:                        │
│  [Human-friendly summary]               │
│                                         │
│  ✨ AI insights available               │  ← INLINE PLACEMENT
│                                         │
│  [ View Details ]  [ Export ]           │
│                                         │
└─────────────────────────────────────────┘
```

**Rationale:**
- Grouped with interpretation (contextually related)
- No additional visual separation needed
- Compact (doesn't add much height)
- Directly after listening pass summary (logical connection)

**Pros:**
- Space-efficient
- Grouped with related content
- Simple implementation

**Cons:**
- Could be overlooked (inline with text)
- May feel subordinate to interpretation
- Less visual emphasis (no dedicated space)

---

### Alternative Placement (Option C: Right Sidebar on Desktop)

```
┌──────────────────────┬──────────────────┐
│  LISTENING PASS      │  RIGHT SIDEBAR   │
│  ─────────────────   │  ──────────────  │
│  • Fatigue:          │  Next Steps:     │
│    Moderate (0.81)   │  [ View Details ]│
│  • Intelligibility:  │  [ Export ]      │
│    Clear (0.95)      │                  │
│  • Instability:      │  ✨ AI insights  │  ← SIDEBAR
│    Stable (suppressed)│   available     │
│                      │                  │
│  Interpretation:     │  [ Learn more ]  │
│  [Summary]           │                  │
│                      │                  │
└──────────────────────┴──────────────────┘
```

**Rationale:**
- Sidebar = secondary information area
- Desktop-optimized layout
- Doesn't impact mobile (collapses to content-first)
- Clear visual grouping (separate column)

**Pros:**
- Desktop layout clean
- Sidebar signals "optional/secondary"
- Actions grouped with insights

**Cons:**
- Doesn't work well on mobile (sidebar stacks)
- Adds layout complexity
- May feel further from listening pass context

---

## RECOMMENDED PLACEMENT: OPTION A

**Selection: Dedicated section below Listening Pass, above action buttons**

**Reasoning:**
1. **Visual clarity:** Indicator gets its own space (not competing with other elements)
2. **Reading flow:** User sees data → interpretation → optional insights → actions
3. **Accessibility:** Dedicated section easier to find with keyboard/screen reader
4. **Responsive:** Works on all screen sizes (mobile, tablet, desktop)
5. **Semantic:** Clear distinction between primary analysis and optional secondary layer

**Specific Coordinates (Responsive):**

**Desktop (>768px):**
```
- Position: Below "Interpretation" section
- Margin top: 16px (breathing room from above)
- Margin bottom: 16px
- Padding: 12px (left/right)
- Font size: 14px
- Height: 36px (clickable target)
- Full width of card (minus padding)
```

**Tablet (481-768px):**
```
- Position: Same as desktop
- Font size: 13px
- Padding: 10px
- Height: 32px
```

**Mobile (<480px):**
```
- Position: Same structure
- Font size: 12px
- Padding: 8px
- Height: 28px
- Full width of viewport (minus safe margins)
```

---

## VISUAL HIERARCHY

### Listening Pass Data (Primary)

```
WEIGHT:    High (bold, larger font, prominent color)
COLOR:     Foreground color (high contrast)
FOCUS:     Center of attention
LOCATION:  Top of card
SPACING:   Generous (breathing room)
```

### AI Insights Affordance (Secondary)

```
WEIGHT:    Medium (regular font, smaller than listening pass)
COLOR:     Muted/secondary color (lower contrast than primary)
FOCUS:     Discoverable but not demanding
LOCATION:  Below primary content
SPACING:   Single-line height (compact but not cramped)
```

### Action Buttons (Tertiary)

```
WEIGHT:    Medium (regular buttons, standard size)
COLOR:     Standard button color
FOCUS:     Clear CTA, but post-analysis decision
LOCATION:  Below insights
SPACING:   Standard button spacing
```

---

## CLICKABLE TARGET SPECIFICATION

### Indicator Click Target

**What is clickable:**
- Entire indicator row is a clickable region
- Not just the text (full row from left padding to right padding)

**Size:**
- Minimum height: 28px (mobile) / 36px (desktop)
- Full width of content area
- Ensures accessibility (finger-friendly on mobile)

**Visual Feedback:**
- Hover state: Slight background color change (indicate interactivity)
- Focus state: Keyboard focus ring (standard browser outline)
- Active state: Transition animation (fade to next state)

**Rejected Approaches:**
- ❌ Tiny click target (would require precision)
- ❌ Only icon clickable (too small, easy to miss)
- ❌ Button-style affordance (too loud, implies urgency)

---

## SPACING & LAYOUT

### Spacing Rules

**Margin above indicator:**
```
16px (desktop)
12px (tablet)
8px (mobile)
```

**Margin below indicator:**
```
16px (to action buttons)
```

**Padding inside indicator row:**
```
12px (left/right) on desktop
10px (left/right) on tablet
8px (left/right) on mobile
8px (top/bottom) all sizes
```

**Listening Pass to Indicator spacing:**
```
24px (section break: visual separation)
```

**Indicator to Actions spacing:**
```
16px (minor break, same section)
```

### Visual Separation

**Section divider (before indicator):**
- Optional subtle line (1px, muted color)
- Or: Extra margin (24px) creates visual break
- **Recommendation:** Margin only (no line, cleaner)

---

## RESPONSIVE DESIGN

### Mobile Layout (< 480px)

```
┌────────────────┐
│ ECHO REPORT    │
├────────────────┤
│ LISTENING PASS │
│ [data]         │
│ [interpret]    │
├────────────────┤
│ ✨ AI insights │
│    available   │
├────────────────┤
│ [View Details] │
│ [Export]       │
└────────────────┘
```

**Changes:**
- Smaller font (12px)
- Smaller padding (8px)
- Full width (respects safe margins)
- Single-line layout maintained

### Tablet Layout (481-768px)

```
┌──────────────────────┐
│ ECHO REPORT CARD     │
├──────────────────────┤
│ LISTENING PASS       │
│ [data]               │
│ [interpretation]     │
├──────────────────────┤
│ ✨ AI insights       │
│    available         │
├──────────────────────┤
│ [View Details] [Exp] │
└──────────────────────┘
```

**Changes:**
- Medium font (13px)
- Medium padding (10px)
- Full width with safe margins

### Desktop Layout (> 768px)

```
┌────────────────────────────────┐
│ ECHO REPORT CARD               │
├────────────────────────────────┤
│ LISTENING PASS                 │
│ • Fatigue: Moderate (0.81)     │
│ • Intelligibility: Clear (0.95)│
│                                │
│ Interpretation:                │
│ [Detailed summary text]        │
├────────────────────────────────┤
│ ✨ AI insights available       │
├────────────────────────────────┤
│ [ View Details ] [ Export ]    │
└────────────────────────────────┘
```

**Changes:**
- Larger font (14px)
- Larger padding (12px)
- Constrained width (600-700px max)

---

## ACCESSIBILITY PLACEMENT

### Keyboard Navigation

**Tab order:**
1. Listening Pass data (text, not interactive)
2. "View Details" button
3. "Export" button
4. AI insights affordance (or earlier in flow)

**Recommended tab order:**
- Listening Pass data (read-only, skip)
- AI insights affordance (interactive, make focusable)
- Action buttons
- Or: AI insights last (secondary action)

**Keyboard access:**
- Tab to indicator
- Enter to toggle visibility
- Tab back to previous element with Shift+Tab

### Screen Reader

**Location announced as:**
"Section: AI Insights Available"

**Or:** Integrated into Echo Report Card flow

**Navigable by:**
- Reading order (semantic order in DOM)
- Landmark navigation (Section > Paragraph)
- Search (user searches "AI" → finds indicator)

---

## CONSTRAINT VERIFICATION

✅ **Discoverable:** Affordance visible on first page load (not hidden in menu)
✅ **Non-intrusive:** Doesn't steal focus from Listening Pass data
✅ **Accessible:** Keyboard navigable, screen reader friendly
✅ **Responsive:** Works on all screen sizes
✅ **Semantic:** Location signals "optional secondary layer"
✅ **Reversible:** Can be toggled/hidden without page reload
✅ **Silent-respecting:** No animation, no urgency, no pressure

---

## IMPLEMENTATION READY

**This spec provides:**
- Recommended location (Option A)
- Responsive breakpoints (mobile/tablet/desktop)
- Spacing rules (margins, padding)
- Visual hierarchy (primary/secondary/tertiary)
- Clickable target spec (size, feedback)
- Keyboard + screen reader specification

**Not yet specified:**
- Exact color values (deferred to design system)
- Font family (deferred to design system)
- Animation/transition details (deferred to interaction design)
- Dark mode adjustments (deferred to theme system)

---

**Status: Placement specification complete. Awaiting review and opt-in trigger design.**
