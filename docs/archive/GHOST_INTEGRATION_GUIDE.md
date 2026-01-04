# Ghost System Integration Guide
## Step-by-Step Instructions to Wire Everything Together

---

## 📋 CHECKLIST

### Files Already Created ✅
- [x] `src/components/demo/VirtualCursor.tsx`
- [x] `src/components/demo/VirtualCursor.css`
- [x] `src/components/demo/DemoDashboard.tsx`
- [x] `src/components/demo/DemoDashboard.css`
- [x] `src/components/demo/index.ts`
- [x] `src/services/demo/GhostUser.ts`
- [x] `src/services/demo/DemoDirector.ts`
- [x] `src/services/demo/DemoScript.ts`
- [x] `src/services/demo/RecordingManager.ts`
- [x] `src/services/demo/index.ts`

### Integration Tasks
- [ ] Import components and services into App.tsx
- [ ] Add demo mode state management
- [ ] Add demo button to toolbar
- [ ] Wire VirtualCursor into render
- [ ] Wire DemoDashboard into render
- [ ] Test basic integration
- [ ] Integrate with Action Authority FSM
- [ ] Customize demo scripts for your domain

---

## 🔧 INTEGRATION STEPS

### Step 1: Update App.tsx Imports

Open `src/App.tsx` and add these imports at the top:

```typescript
// Demo system imports
import { VirtualCursor, DemoDashboard } from './components/demo';

// Or if you want individual control:
// import { VirtualCursor } from './components/demo/VirtualCursor';
// import { DemoDashboard } from './components/demo/DemoDashboard';
```

### Step 2: Add Demo Mode State

In the App component, add demo mode state near other state variables:

```typescript
export default function App() {
  // ... existing state ...
  const [demoMode, setDemoMode] = useState(false);
  const [demoVisible, setDemoVisible] = useState(false);

  // ... rest of component ...
}
```

### Step 3: Add Demo Button to Toolbar

Locate the toolbar section in App.tsx (around line 2074-2087 based on codebase structure):

```typescript
<div className="toolbar">
  <div className="brand">Echo Sound Lab</div>
  <div className="toolbar-actions">
    {/* Existing buttons... */}

    {/* NEW: Demo Mode Button */}
    <button
      className="toolbar-button"
      type="button"
      onClick={() => setDemoVisible(!demoVisible)}
      title="Toggle self-demonstration mode"
    >
      🎬 Demo Mode
    </button>

    {/* Existing buttons continue... */}
  </div>
</div>
```

### Step 4: Render Virtual Cursor

In the App JSX, add the VirtualCursor component at the top level (inside app-shell):

```typescript
return (
  <div className="app-shell">
    {/* Virtual Cursor - always rendered, invisible until demo runs */}
    <VirtualCursor />

    {/* Existing toolbar and content... */}
  </div>
);
```

### Step 5: Render Demo Dashboard

Conditionally render the DemoDashboard based on demoVisible state:

```typescript
return (
  <div className="app-shell">
    <VirtualCursor />

    <div className="toolbar">
      {/* toolbar content... */}
    </div>

    {/* NEW: Demo Dashboard Panel */}
    {demoVisible && (
      <DemoDashboard
        onDemoStart={() => {
          console.log('Demo started');
          // Optional: pause other UI interactions
        }}
        onDemoComplete={() => {
          console.log('Demo completed');
          // Optional: resume UI interactions
        }}
        onRecordingStart={() => {
          console.log('Recording started');
        }}
        onRecordingStop={(blob) => {
          console.log('Recording stopped', blob);
          // Optional: upload or process blob
        }}
      />
    )}

    {/* Existing app content... */}
  </div>
);
```

### Step 6: Update CSS to Support Demo Mode

Add to `src/styles/typography.css` or your main CSS:

```css
/* Demo Mode Adjustments */
.app-shell.demo-mode-active {
  /* Optional: adjust layout when demo is running */
}

.app-shell .demo-dashboard {
  /* Already styled in DemoDashboard.css */
}
```

---

## 🔐 ACTION AUTHORITY FSM INTEGRATION

### Wire holdButton() to Respect FSM Constraints

In `src/services/demo/GhostUser.ts`, the `holdButton()` method already integrates with Action Authority:

```typescript
async holdButton(selector: string, duration: number = 400): Promise<void> {
  // This duration MUST match AA requirements
  // If AA FSM requires 400ms hold, duration = 400
  // If AA later changes to 600ms, this call must fail

  // Dispatch mouse down
  this.dispatchMouseEvent(element, 'mousedown', { button: 0 });

  // Hold for exactly the duration specified
  await this.wait(duration);

  // Dispatch mouse up
  this.dispatchMouseEvent(element, 'mouseup', { button: 0 });
}
```

### Key Insight
The Ghost User doesn't know about AA constraints. It just holds for the duration you tell it.

If you change AA from 400ms → 600ms, the old demo scripts will fail because:
```typescript
await ghostUser.holdButton(selector, 400); // But AA now requires 600ms!
// Action gets blocked (just like a human would)
```

This proves the safety is real.

### Optional: Add FSM Logging

If you want to log demo actions to your ForensicAuditLog, add this to DemoDirector:

```typescript
async executeAction(action: DemoAction): Promise<void> {
  // Log to audit trail
  if (window.__forensicLog) {
    window.__forensicLog.log('DEMO_ACTION', {
      actionType: action.type,
      description: action.description,
      timestamp: Date.now(),
    });
  }

  // ... execute action ...
}
```

---

## 🎯 DEMO SCRIPT CUSTOMIZATION

### Create Domain-Specific Scenarios

Edit `src/services/demo/DemoScript.ts` to add more sophisticated scenarios:

```typescript
// Add to DemoScript class

/**
 * Predefined scenarios for different use cases
 */
static createHipHopMasteringDemo(): DemoScript {
  return new DemoScript({
    genre: 'hip-hop',
    trackType: 'mix',
    features: ['eq', 'compression', 'stereo'],
    duration: 'medium',
    refinement: true,
    includeMultiStem: false,
  });
}

static createMultiStemDemo(): DemoScript {
  return new DemoScript({
    genre: 'indie',
    trackType: 'mix',
    features: ['eq', 'compression', 'reverb'],
    duration: 'long',
    refinement: true,
    includeMultiStem: true,
  });
}

static createQuickFeatureDemo(): DemoScript {
  return new DemoScript({
    features: ['eq', 'compression'],
    duration: 'short',
    refinement: false,
    includeVideo: false,
  });
}
```

Then in DemoDashboard, add preset buttons:

```typescript
<div className="demo-presets">
  <button onClick={() => setPrompt('Hip-hop mixing demo')}>🎤 Hip-Hop</button>
  <button onClick={() => setPrompt('Multi-stem mastering')}>🎚️ Multi-Stem</button>
  <button onClick={() => setPrompt('Quick feature tour')}>⚡ Quick Demo</button>
</div>
```

---

## 🧪 TESTING THE INTEGRATION

### Manual Testing Checklist

```
□ VirtualCursor appears at z-index 9999 (always on top)
□ Demo button visible in toolbar
□ DemoDashboard shows when clicking Demo Mode
□ Can enter prompt in textarea
□ "Start Demo" button is clickable
□ Ghost user moves smoothly on screen
□ Progress bar updates in real-time
□ Demo completes without errors
□ Recording works and saves .webm file
□ Virtual cursor shows hold progress ring
□ Virtual cursor shows click ripples
```

### Automated Tests to Add

Create `src/services/demo/__tests__/GhostUser.test.ts`:

```typescript
describe('GhostUser', () => {
  it('should move cursor smoothly', async () => {
    const ghost = getGhostUser();
    await ghost.moveCursorTo(100, 200, 300);
    const pos = ghost.getCurrentPosition();
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
  });

  it('should handle holdButton constraint', async () => {
    const ghost = getGhostUser();
    const button = document.createElement('button');
    document.body.appendChild(button);

    const start = Date.now();
    await ghost.holdButton('button', 400);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(400);
  });
});
```

---

## 🎬 RECORDING WORKFLOW

### User Workflow

1. **Click "🎬 Demo Mode"** in toolbar
2. **See DemoDashboard panel appear**
3. **Enter or select demo prompt** (e.g., "Master a hip-hop vocal")
4. **Click "🎥 Demo + Record"**
5. **Grant screen capture permission** (browser will ask)
6. **Watch virtual cursor operate the UI**
7. **Progress bar shows current action**
8. **When done, .webm file auto-downloads**

### Troubleshooting Recording

**Browser doesn't ask for screen capture permission:**
- Close other media capture apps
- Reload page
- Try Chrome/Chromium (best support)

**Recording is laggy:**
- Close other browser tabs
- Reduce screen resolution
- Lower video bitrate in RecordingManager config

**Video won't download:**
- Check browser's download settings
- Allow popups from this domain
- Try different browser

---

## 🚀 PRODUCTION DEPLOYMENT

### Before Going Live

1. **Test on target environment**
   - Local development ✅
   - Staging environment (if available)
   - Production (with feature flag)

2. **Customize demo scenarios**
   - Add your specific use cases
   - Create 2-3 predefined scenarios
   - Test each scenario end-to-end

3. **Optimize performance**
   - Profile VirtualCursor rendering
   - Ensure smooth 60fps playback
   - Test on various hardware

4. **Add error handling**
   - What if upload fails?
   - What if demo times out?
   - What if user closes browser during demo?

5. **Security review**
   - Demo agent can only do what's publicly visible
   - No access to sensitive data
   - Recording captures public demo, nothing private

### Feature Flag (Optional)

```typescript
const DEMO_MODE_ENABLED = process.env.REACT_APP_DEMO_MODE === 'true';

{DEMO_MODE_ENABLED && (
  <button onClick={() => setDemoVisible(!demoVisible)}>
    🎬 Demo Mode
  </button>
)}
```

---

## 📊 MONITORING & ANALYTICS

### Optional: Track Demo Metrics

```typescript
// In DemoDashboard.tsx
const handleDemoComplete = useCallback(() => {
  // Track analytics
  if (window.gtag) {
    window.gtag('event', 'demo_completed', {
      prompt: prompt,
      duration: demoDirector.getElapsedTime(),
    });
  }
  onDemoComplete?.();
}, [prompt, demoDirector, onDemoComplete]);
```

### Metrics to Track
- How many users access demo mode?
- What prompts are most popular?
- Average demo duration?
- Do users convert after watching demo?

---

## 📝 FINAL CHECKLIST

Before considering Ghost System ready for production:

- [ ] All components integrated into App.tsx
- [ ] Demo button visible in toolbar
- [ ] VirtualCursor renders without errors
- [ ] DemoDashboard shows/hides correctly
- [ ] Basic demo executes end-to-end
- [ ] Recording captures video correctly
- [ ] Download/share features work
- [ ] AA FSM constraints are respected
- [ ] Error handling works smoothly
- [ ] Performance is smooth (60fps+)
- [ ] Mobile responsiveness is good
- [ ] Test coverage > 80%

---

## 🎯 NEXT STEPS AFTER INTEGRATION

1. **Customize your scenarios** - Create demos for your key use cases
2. **Create marketing videos** - Share best demos on social media
3. **Use in pitch meetings** - Show live self-demonstrating demo to VCs
4. **Monitor analytics** - Track engagement and conversions
5. **Iterate based on feedback** - Update scenarios based on user interest

---

## 📞 TROUBLESHOOTING

### "Virtual cursor not showing up"
- Check z-index: 9999 is set
- Check that VirtualCursor is rendered in App.tsx
- Open DevTools, search for `.virtual-cursor-container` in DOM

### "Demo runs but doesn't interact with UI"
- Check that element selectors are correct
- Verify DemoScript selectors match your actual UI
- Run `document.querySelector(selector)` in console to debug

### "Hold button times out"
- Check AA FSM is not blocking the action
- Verify duration matches AA requirements
- Check browser logs for errors

### "Recording doesn't start"
- Browser must grant screen capture permission
- Only works on secure context (HTTPS or localhost)
- Try different browser (Chrome recommended)

---

**Integration complete when: All checklist items are checked ✅**
