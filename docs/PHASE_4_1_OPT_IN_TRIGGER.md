# Phase 4.1: Opt-In Trigger Specification

**Objective:** Define how user explicitly invokes AI guidance viewing—the interaction mechanism

**Scope:** Planning only; no code

**Non-Negotiables:**
- ✓ User initiates, system responds (not vice versa)
- ✓ Action is reversible (can toggle on/off)
- ✓ No latency punishment (guidance appears immediately)
- ✓ Clear visual feedback (user knows state changed)
- ✓ Works for keyboard, mouse, touch
- ✓ No modals, no blocking interactions

---

## DECISION PHILOSOPHY

**Principle: "User Controls the Reveal"**

The opt-in mechanism should be as simple as possible. User clicks/taps the indicator → guidance appears/disappears. That's it.

No loading states. No modals. No confirmation dialogs. Just: indicator shows state, user can toggle.

---

## TRIGGER MECHANISM OPTIONS

### Option A: Click-to-Toggle (Toggle In-Place)

**How It Works:**

**State 1 (Hidden - Default):**
```
┌─────────────────────────────────────────┐
│ LISTENING PASS ANALYSIS                 │
│ [data]                                  │
│ [interpretation]                        │
├─────────────────────────────────────────┤
│ ✨ AI insights available                │ ← Click here
├─────────────────────────────────────────┤
│ [ View Details ]  [ Export ]            │
└─────────────────────────────────────────┘
```

**User clicks indicator → State 2 (Revealed):**
```
┌─────────────────────────────────────────┐
│ LISTENING PASS ANALYSIS                 │
│ [data]                                  │
│ [interpretation]                        │
├─────────────────────────────────────────┤
│ ✨ AI INTERPRETATION (Optional)         │ ← Expanded
│                                         │
│ Your mix is listener-friendly with      │
│ one focus area: Listener Fatigue        │
│                                         │
│ [Guidance text from Phase 3]            │
│                                         │
│ [ Hide ]  [ Learn More ]                │
│                                         │
├─────────────────────────────────────────┤
│ [ View Details ]  [ Export ]            │
└─────────────────────────────────────────┘
```

**Visual Changes:**
- Indicator label changes from "✨ AI insights available" to "✨ AI INTERPRETATION (Optional)"
- Guidance text appears below
- Buttons change from none to [ Hide ] [ Learn More ]
- Section expands vertically
- Color/background might adjust (slightly elevated box for guidance)

**User clicks "Hide" → Reverts to State 1**

**Interaction Flow:**
```
User action: Click indicator
System response: Expand section in-place
Visual feedback: Section grows, content appears
Latency: < 100ms (instant)
Reversibility: Click "Hide" to collapse
State persistence: Hidden until toggled again
```

**Pros:**
- ✅ Simple (one element, one action)
- ✅ Immediate feedback (no delay, no modal)
- ✅ Reversible (easy undo with "Hide" button)
- ✅ Space-efficient when hidden
- ✅ No page navigation
- ✅ All content in one view (no scrolling required)

**Cons:**
- ⚠️ Page height changes (content below shifts)
- ⚠️ User might lose scroll position if they scroll after expanding
- ⚠️ "Hide" button required (extra cognitive load to find it)

**Mobile Behavior:**
- Indicator full-width (easy to tap)
- Guidance expands below
- May push action buttons off-screen
- User can scroll to see full guidance + buttons

---

### Option B: Click-to-Drawer (Side/Bottom Reveal)

**How It Works:**

**State 1 (Hidden):**
```
┌─────────────────────────────────────────┐
│ LISTENING PASS ANALYSIS                 │
│ [data]                                  │
│ [interpretation]                        │
├─────────────────────────────────────────┤
│ ✨ AI insights available                │ ← Click here
├─────────────────────────────────────────┤
│ [ View Details ]  [ Export ]            │
└─────────────────────────────────────────┘
```

**User clicks indicator → State 2 (Drawer Open):**
```
┌──────────────────┬──────────────────────┐
│ LISTENING PASS   │ ✨ AI INTERPRET.     │
│ [data]           │ ────────────────────┤
│ [interpretation] │                     │
│                  │ Your mix is         │
│ ✨ AI insights   │ listener-friendly...│
│   available      │                     │
│ (in gray/muted)  │ [ Hide ] [ Learn.. ]│
│                  │                     │
└──────────────────┴──────────────────────┘
```

**Or on mobile (full-height drawer):**
```
┌──────────────────────────────────────┐
│ ✨ AI INTERPRETATION (Optional)  [×] │
├──────────────────────────────────────┤
│                                      │
│ Your mix is listener-friendly with   │
│ one focus area: Listener Fatigue     │
│                                      │
│ [Full guidance text]                 │
│                                      │
│ [ Hide / Close ] [ Learn More ]      │
│                                      │
└──────────────────────────────────────┘
```

**Visual Changes:**
- Desktop: Drawer slides in from right (or left)
- Mobile: Full-height modal/drawer slides up from bottom
- Listening Pass remains visible (not obscured)
- Drawer has close button (X)
- Content inside drawer scrollable if needed

**User clicks "Hide" or X → Drawer closes**

**Interaction Flow:**
```
User action: Click indicator
System response: Drawer slides in
Visual feedback: Animation (0.3s), Listening Pass slightly dimmed
Latency: < 300ms (perceivable but smooth)
Reversibility: Click X or "Hide" to close
State persistence: Drawer closes, can reopen
```

**Pros:**
- ✅ Doesn't disrupt page flow (Listening Pass unaffected)
- ✅ Isolated view (focus on guidance alone)
- ✅ Professional UI pattern (users familiar with drawers)
- ✅ Guidance prominent (full attention when viewed)
- ✅ Easy close (X button standard)

**Cons:**
- ⚠️ More complex implementation (drawer state, animation)
- ⚠️ Hides Listening Pass (can't compare both at once)
- ⚠️ Mobile drawer might feel modal (too prominent)
- ⚠️ Extra click to close (vs. just hiding in-place)

**Mobile Considerations:**
- Drawer should scroll independently
- Close button always visible (no need to scroll up)
- Guidance text sized for mobile reading

---

### Option C: Click-to-Separate-View (Navigate to Details Page)

**How It Works:**

**Initial State:**
```
Echo Report Card (current page)
✨ AI insights available [ View ]
```

**User clicks indicator → Navigate to AI Insights page:**
```
URL: /report/[id]/ai-insights

Page shows:
┌──────────────────────────────────┐
│ AI INTERPRETATION (Optional)     │
│ ← Back to Report Card            │
├──────────────────────────────────┤
│                                  │
│ Your mix is listener-friendly... │
│                                  │
│ [Full guidance text]             │
│                                  │
│ [Optional: Side-by-side Listening│
│  Pass data for comparison]       │
│                                  │
│ [ Back ]  [ Learn More ]         │
│                                  │
└──────────────────────────────────┘
```

**User clicks "Back" → Return to Report Card**

**Interaction Flow:**
```
User action: Click indicator
System response: Navigate to /report/[id]/ai-insights
Visual feedback: Page transition (loading state if needed)
Latency: < 100ms (instant if pre-rendered)
Reversibility: Browser back button or "Back" button
State persistence: Listening Pass available on return
```

**Pros:**
- ✅ Clean separation (guidance in dedicated space)
- ✅ Can include comparison view (guidance + Listening Pass side-by-side)
- ✅ Professional UI pattern (familiar from web apps)
- ✅ Easy to add details/context (custom page for insights)
- ✅ Sharable URL (can link to specific insights)

**Cons:**
- ❌ Requires page navigation (adds complexity)
- ❌ User leaves context (page transition cognitive cost)
- ❌ More clicks to return (two-step journey)
- ❌ Harder to compare (guidance and Listening Pass separated)
- ❌ State management more complex

---

## RECOMMENDED TRIGGER: OPTION A (Click-to-Toggle)

**Selection: In-place toggle (expand/collapse)**

**Reasoning:**
1. **Simplicity:** One element, one action, no navigation
2. **Reversibility:** Can toggle on/off instantly
3. **Context:** User stays in report card (can compare with Listening Pass)
4. **Accessibility:** Works with keyboard, mouse, touch
5. **Performance:** No page load, no API call (guidance pre-computed)
6. **Mental model:** Users familiar with expand/collapse (accordions, dropdowns)

---

## TOGGLE MECHANISM SPECIFICATION

### Click Interaction

**Primary trigger:** Entire indicator row is clickable

**Secondary trigger:** Keyboard (when focused)
- **Spacebar:** Toggle open/closed
- **Enter:** Toggle open/closed

**Accessibility:**
- Indicator is focusable element (role: button or div with button role)
- Screen reader announces: "AI insights available, button, expanded/collapsed"
- Focus outline visible (standard browser focus ring)

### Visual Feedback

**On Click/Tap:**
```
Timing: Immediate (< 50ms)
Animation: Section expands with smooth height transition (0.3s)
Content: Guidance text fades in (0.2s)
Buttons: [ Hide ] and [ Learn More ] appear
Indicator: Label updates to "✨ AI INTERPRETATION (Optional)"
```

**On "Hide" Click:**
```
Timing: Immediate
Animation: Section collapses (0.3s)
Content: Guidance text fades out (0.2s)
Buttons: Disappear
Indicator: Reverts to "✨ AI insights available"
```

**Hover State (Desktop):**
```
When hovering over indicator:
- Background color slightly changes (subtle, not bold)
- Cursor becomes pointer
- No animation on hover (animation only on click)
```

**Focus State (Keyboard):**
```
Standard browser focus ring (or custom, high contrast)
Visible at all times
User can see keyboard focus clearly
```

**Active State (During Animation):**
```
No additional visual feedback needed
Transition smoothly from hidden to visible
No loading spinner (guidance is instant)
```

### State Management

**Initial State:** Collapsed (hidden)
```
- Indicator visible
- Guidance hidden
- No buttons showing
- Scroll position at indicator
```

**Expanded State:** Revealed
```
- Indicator visible (label updated)
- Guidance visible
- [ Hide ] and [ Learn More ] buttons visible
- User can read full guidance
- User can scroll to see action buttons below
```

**Toggleable At Any Time:**
```
- User expands, reads, collapses
- User can re-expand multiple times
- State doesn't persist across page reloads (fresh analysis = default hidden)
- User doesn't lose their place in Listening Pass data
```

---

## USER FLOW DIAGRAMS

### Desktop User Flow

```
User Action: Upload audio
    ↓
System: Runs analysis
    ↓
Display: Report card appears
    ├─ Listening Pass data (visible)
    ├─ Indicator: "✨ AI insights available" (collapsed)
    └─ Buttons: [ View Details ] [ Export ]
    ↓
User Decision:
    │
    ├─→ Path A: Click indicator
    │      ↓
    │      Section expands
    │      Guidance appears
    │      New buttons: [ Hide ] [ Learn More ]
    │      ↓
    │      User reads guidance
    │      ↓
    │      User clicks [ Hide ]
    │      ↓
    │      Section collapses
    │      (or clicks [ Learn More ] → different behavior)
    │
    └─→ Path B: Ignore indicator
           ↓
           Works with Listening Pass only
           Indicator stays visible
           Can click anytime
           Silence respected
```

### Mobile User Flow

```
User Action: Upload audio
    ↓
System: Runs analysis
    ↓
Display: Report card appears (mobile optimized)
    ├─ Listening Pass data (visible)
    ├─ Indicator: "✨ AI insights available" (full width)
    └─ Buttons: [ View Details ] [ Export ]
    ↓
User Decision:
    │
    ├─→ Path A: Tap indicator
    │      ↓
    │      Section expands below
    │      Guidance appears
    │      New buttons: [ Hide ] [ Learn More ]
    │      ↓
    │      User scrolls to read full guidance
    │      ↓
    │      User taps [ Hide ]
    │      ↓
    │      Section collapses
    │      User can scroll back up
    │
    └─→ Path B: Ignore indicator
           ↓
           Works with Listening Pass only
           (Same as desktop)
```

---

## TECHNICAL SPECIFICATION

### State Variables (Required for Implementation)

```
state.aiInsightsExpanded: boolean (default: false)
state.aiGuidanceContent: string (pre-loaded)
state.indicatorLabel: string (changes based on expanded state)
```

### DOM Structure (Before Expansion)

```html
<div class="ai-insights-indicator"
     role="button"
     tabindex="0"
     aria-expanded="false"
     aria-controls="ai-insights-content">
  <span class="emoji">✨</span>
  <span class="label">AI insights available</span>
</div>
```

### DOM Structure (After Expansion)

```html
<div class="ai-insights-section" aria-expanded="true">
  <div class="ai-insights-indicator"
       role="button"
       tabindex="0"
       aria-expanded="true"
       aria-controls="ai-insights-content">
    <span class="emoji">✨</span>
    <span class="label">AI INTERPRETATION (Optional)</span>
  </div>

  <div id="ai-insights-content"
       class="ai-insights-guidance"
       role="region"
       aria-live="polite">
    <p>{guidance_text from Phase 3}</p>
    <div class="ai-insights-actions">
      <button class="btn-secondary" onclick="toggleAiInsights()">Hide</button>
      <button class="btn-tertiary" onclick="showAiInsightsDetails()">Learn More</button>
    </div>
  </div>
</div>
```

### Event Handlers

```
On indicator click/spacebar/enter:
  - Toggle state.aiInsightsExpanded
  - Update aria-expanded attribute
  - Trigger expand/collapse animation
  - Update indicator label
  - Show/hide guidance content
  - Update button visibility

On "Hide" button click:
  - Set state.aiInsightsExpanded = false
  - Reverse expansion
  - Focus returns to indicator (for keyboard users)

On "Learn More" button click:
  - Different behavior (defined in next phase)
```

### Animation Specification

**Expand Animation:**
```css
.ai-insights-section {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

.ai-insights-section[aria-expanded="true"] {
  max-height: 500px; /* Enough for guidance + buttons */
}

.ai-insights-guidance {
  opacity: 0;
  transition: opacity 0.2s ease-in 0.1s; /* Staggered with height */
}

.ai-insights-section[aria-expanded="true"] .ai-insights-guidance {
  opacity: 1;
}
```

---

## ACCESSIBILITY SPECIFICATION

### Keyboard Navigation

**Tab order:**
1. Listening Pass data (read-only, skip)
2. AI insights indicator (focusable button)
3. [ Hide ] button (if expanded)
4. [ Learn More ] button (if expanded)
5. [ View Details ] action button
6. [ Export ] action button

**Focus Management:**
- Indicator is always focusable
- When expanded, focus can move to [ Hide ] and [ Learn More ]
- When collapsed, those buttons are not in tab order (display: none)
- After clicking [ Hide ], focus returns to indicator

### Screen Reader Announcements

**Initial state:**
```
"AI insights available, button, collapsed"
```

**After expansion:**
```
"AI INTERPRETATION, optional, button, expanded"
"Region: [guidance text]"
"Button: Hide"
"Button: Learn More"
```

**After collapse:**
```
"AI insights available, button, collapsed"
```

### ARIA Attributes

```html
role="button"           <!-- Indicator is semantic button -->
tabindex="0"            <!-- Focusable -->
aria-expanded="false"   <!-- Initial state -->
aria-expanded="true"    <!-- When expanded -->
aria-controls="ai-insights-content"  <!-- Links to guidance region -->
role="region"           <!-- Guidance section is region -->
aria-live="polite"      <!-- Content updates announced -->
```

---

## CONSTRAINT VERIFICATION

✅ **User-initiated:** User clicks indicator, system responds (not vice versa)
✅ **Reversible:** [ Hide ] button allows instant collapse
✅ **No latency punishment:** Guidance appears instantly (< 100ms)
✅ **Clear feedback:** Visual change, text update, animation
✅ **Keyboard accessible:** Tab, Spacebar, Enter all work
✅ **Touch accessible:** Full-width indicator easy to tap
✅ **Screen reader friendly:** ARIA labels, semantic structure
✅ **No modals/blocking:** Inline expansion, user can scroll/interact
✅ **Silent-respecting:** Can remain unexpanded (no nudging)

---

## EDGE CASES

### Edge Case 1: User Expands, Scrolls Down, Scrolls Back Up

**Expected behavior:**
- Section remains expanded (state persisted)
- User can see it's expanded
- Can click [ Hide ] to collapse
- Scroll position not reset

**Implementation:** State persisted in component, not dependent on visibility

### Edge Case 2: User on Mobile, Expands Guidance, Guidance Longer Than Viewport

**Expected behavior:**
- Guidance section scrollable independently
- User can scroll to see [ Hide ] button
- Can collapse from anywhere in section

**Implementation:** Guidance container has max-height + overflow-y: auto

### Edge Case 3: User Keyboard-Navigates Away, Returns With Keyboard

**Expected behavior:**
- Focus restored to indicator
- If expanded, focus still on indicator
- User can tab to [ Hide ] if it's relevant

**Implementation:** Focus management in keyboard handler

### Edge Case 4: User Has Multiple Analyses Open (If App Allows)

**Expected behavior:**
- Each report card has independent expanded/collapsed state
- Opening one doesn't affect others
- State scoped to component, not global

**Implementation:** State stored in component instance, not app-level

---

## CONSTRAINT CHECKLIST

Before implementation, verify:

- [ ] Click handler implemented (indicator → toggle)
- [ ] Keyboard handler implemented (Spacebar/Enter → toggle)
- [ ] Hide button implemented (toggle → collapse)
- [ ] Animation smooth and performant (no jank)
- [ ] ARIA attributes correct (aria-expanded, role)
- [ ] Focus management working (focus returns to indicator)
- [ ] Mobile tap target large enough (minimum 44×44px)
- [ ] No loading states (guidance instant)
- [ ] No modal/blocking (inline expansion)
- [ ] State doesn't persist across page reloads (fresh = hidden)
- [ ] User can compare (Listening Pass visible when expanded)

---

**Status: Opt-in trigger specification complete. All Phase 4.1 planning documents ready for review.**

**Deliverables Summary:**
1. ✅ PHASE_4_1_DISCOVERY_MECHANICS.md
2. ✅ PHASE_4_1_COPY.md
3. ✅ PHASE_4_1_PLACEMENT.md
4. ✅ PHASE_4_1_OPT_IN_TRIGGER.md

**Next Step:** Awaiting user review and explicit authorization to proceed to Phase 4.1 implementation (code).
