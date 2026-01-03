# Action Authority v1.0.0 — Local Deployment Guide

## Quick Start (30 seconds)

```bash
cd "/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5"
npm run dev
```

Then open your browser to `http://localhost:5173` (or the URL shown in terminal).

---

## What You'll See

When the app loads, you should see:

1. **The Main Application** (Echo Sound Lab UI in center)
2. **The Action Authority HUD** (always visible, unless state is GENERATED)
3. **Demo Panel** (top-right corner, shows FSM state — development only)

---

## Testing the HUD States

### Prerequisites
- Open **DevTools** (F12) → **Console** tab
- You'll see logs like: `🏛️ Action Authority State: { fsmState: "...", hudState: "..." }`

### Test 1: Shatter Invariant

**Goal**: Verify the progress ring unmounts instantly when hold is released early.

```
1. Press and hold Spacebar for ~200ms (partial hold, less than 400ms)
2. Release Spacebar
3. Observe: FrictionPulseMeter should disappear instantly (✅ PASS)
```

### Test 2: Tunnel Effect

**Goal**: Verify background desaturates when entering CONFIRM_READY.

```
1. Press Spacebar and hold for 400ms+ (until "Arming..." completes)
2. Release Spacebar (enters PREVIEW_ARMED)
3. Press Enter (moves to CONFIRM_READY)
4. Observe: Entire background should turn grayscale (✅ PASS)
```

### Test 3: Authority Badge

**Goal**: Verify badge appears only in CONFIRM_READY and EXECUTED.

```
1. Follow Test 2 steps to reach CONFIRM_READY
2. Observe: Badge at bottom shows: [hash] | AUTHORIZED BY: LOCAL_DEV_SESSION | STATUS: SEALED
3. Press Escape to cancel
4. Observe: Badge disappears (✅ PASS)
```

### Test 4: Success Flash

**Goal**: Verify green flash appears on execution.

```
1. Reach CONFIRM_READY (Test 2, step 3)
2. Press Enter again to execute
3. Observe: Full-screen green flash for ~100ms (✅ PASS)
4. Observe: Safety Rail shows "✅ SEALED & LOGGED" (✅ PASS)
```

### Test 5: Perception Parity

**Goal**: Verify HUD state matches FSM state exactly, with zero lag.

```
1. Watch the Console logs in DevTools
2. Watch the Safety Rail status text
3. Trigger state changes (Spacebar, Enter, Escape)
4. Verify: Console logs and visual state change synchronously (✅ PASS)
```

---

## Keyboard Controls (for testing)

| Key | Action | Expected Transition |
|-----|--------|-------------------|
| **Spacebar** (hold) | Arm action | VISIBLE_GHOST → HOLDING (0-400ms) |
| **Spacebar** (release) | Release hold | HOLDING → PREVIEW_ARMED (if ≥400ms) |
| **Enter** | Confirm action | PREVIEW_ARMED → CONFIRM_READY → EXECUTED |
| **Escape** | Cancel action | Any state → REJECTED |

---

## File Structure

```
src/
├── action-authority/              # Golden Master v1.0.0 (Sealed)
│   ├── fsm.ts                     # FSM core
│   ├── context-binding.ts         # Context binding
│   ├── audit-log.ts               # Execution log
│   ├── visual-contract.ts         # HUDState + Visual mapping
│   ├── hooks/
│   │   └── useActionAuthority.ts  # Projection adapter
│   └── components/
│       ├── ActionAuthorityHUD.tsx     # Main HUD renderer
│       └── ActionSafetyRail.tsx       # Bottom status bar
│
├── ActionAuthorityIntegration.tsx # New: Root-level wrapper
├── components/
│   └── ActionAuthorityDemo.tsx     # New: Testing panel (dev only)
└── App.tsx                        # Existing application

index.tsx                          # Modified: Wrapped with ActionAuthorityIntegration
index.html                         # Root HTML (unchanged)
```

---

## Troubleshooting

### **Issue**: HUD is not visible

**Solution**:
1. Check browser console for errors (F12 → Console)
2. Verify `id="root"` exists in index.html
3. Verify ActionAuthorityIntegration is wrapping App in index.tsx

### **Issue**: Portal effects (tunnel, flash) not working

**Solution**:
1. Ensure `<div id="root"></div>` exists in index.html
2. Verify `createPortal` is being called (check source)
3. Check DevTools → Elements tab for portal divs

### **Issue**: Hold timer not working (holdProgress stuck at 0)

**Solution**:
1. Verify Spacebar is being detected (check browser console)
2. Check that requestAnimationFrame is running (DevTools → Performance)
3. Try Refresh page (Ctrl+R)

### **Issue**: HUDState not changing

**Solution**:
1. Open DevTools → Console
2. Check that FSM transitions are happening
3. Verify projection logic in useActionAuthority.ts is correct

---

## Development Notes

### Enabling the Demo Panel

The demo panel is visible only in development mode (`npm run dev`).

To verify it's working:
1. Look for small panel in top-right corner
2. Click to expand/collapse
3. Read the state information

### Logging

All FSM state changes are logged to the browser console:
```
🏛️ Action Authority State: {
  fsmState: "PREVIEW_ARMED",
  hudState: "PREVIEW_ARMED",
  holdProgress: 1,
  isArmed: true,
  isTerminal: false
}
```

### Production Build

When ready for production:

```bash
npm run build
npm run preview  # Test the production build locally
```

The HUD will still be active, but the Demo Panel will be hidden.

---

## Next Steps

1. ✅ Run `npm run dev`
2. ✅ Open browser to `http://localhost:5173`
3. ✅ Test all 5 test scenarios above
4. ✅ Watch DevTools console for state changes
5. ✅ Verify all transitions match expected behavior

---

## Support

For issues or questions, refer to:
- `.archived/Action_Authority_v1.0.0/Action_Authority_Safety_Case_v1.0.0.md` (Technical specification)
- `src/action-authority/SECURITY_PASS.md` (Security verification)
- `src/action-authority/INVARIANTS_ENFORCED.md` (Structural guarantees)

---

**Action Authority v1.0.0 is now running locally.**

🏛️🛡️✅
