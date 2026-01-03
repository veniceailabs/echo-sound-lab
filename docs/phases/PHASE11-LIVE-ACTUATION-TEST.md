# Phase 11: Live Actuation Test Guide
## Real-World Logic Pro X Integration

**Status:** ✅ READY FOR LIVE TESTING

This guide walks you through the complete end-to-end flow: from APL signal detection → HUD authorization → actual Logic Pro X modification.

---

## ⚙️ Prerequisites

Before running live actuation tests, you must verify your environment:

### 1. macOS Requirements
```bash
# Verify osascript is available
which osascript
# Output: /usr/bin/osascript (should be present on all macOS)
```

### 2. Logic Pro X Installation
```bash
# Verify Logic Pro X is installed
ls /Applications/Logic\ Pro.app
# If not found, install from App Store
```

### 3. Security & Privacy Permissions
On macOS, you may need to grant Terminal/Node.js access to control other applications:

- **System Preferences → Security & Privacy → Accessibility**
- Add your Terminal.app (or IDE terminal)
- Restart your dev server

**Why?** AppleScript uses Accessibility Framework to control UI elements.

### 4. Safe Test Environment
- Create a new Logic Pro project (don't use a valuable session)
- Or open an empty project with a single test track
- Name a track "Vocal" or "Master" (our test scripts expect this)

---

## 🚀 Phase 11 Live Test: Step-by-Step

### Step 1: Start the Dev Server

```bash
cd "/Users/DRA/Desktop/Echo Sound Lab/Echo Sound Lab v2.5"
npm run dev
```

Server will start on `http://localhost:3008`

### Step 2: Arrange Your Screen

You'll want to see both:
- **Browser:** http://localhost:3008 (with DevTools Console open)
- **Logic Pro X:** A window with an empty or test project open
  - Create a track named "Vocal" or "Master"

### Step 3: Enable Real Execution Mode

In `src/action-authority/execution/adapters/LogicProBridge.ts`, change:

```typescript
// Current (simulation):
private SIMULATION_MODE = true;

// Change to (real execution):
private SIMULATION_MODE = false;
```

Or, to keep simulation enabled and toggle later:
- Build the code above
- In the browser console, you can toggle: `LogicProBridge.setSimulationMode(false)`

### Step 4: Open the Action Authority Demo Panel

1. Go to **http://localhost:3008** in your browser
2. Open **DevTools (F12)**
3. Go to **Console tab**
4. Look for the **"▶ Action Authority Demo"** button in top-right corner
5. Click it to expand the panel

### Step 5: Trigger APL Signal Analysis

In the **Action Authority Demo** panel:
1. Click **"Test APL Mastering (Clipping)"** button
2. Watch the console output all 8 steps:
   - Step 1: APL detects clipping (2.1 dBFS)
   - Step 2: Proposal engine generates remedy
   - Step 3: HUD Ghost displays with evidence
   - ...
   - Step 6: Bridge execution begins

### Step 6: Human Authorization (The Critical Step)

When the HUD Ghost appears on screen:

```
┌─ GHOST OVERLAY ─────────────────────────────────────┐
│ Apply Limiter at -0.1 dBFS to prevent clipping      │
│                                                      │
│ Evidence:                                            │
│   Metric: Signal Peak Level                          │
│   Current: 2.1 dBFS                                  │
│   Target: -0.1 dBFS                                  │
│   Source: APL-SIG-INT analysis                       │
│                                                      │
│ [Hold Spacebar 400ms, then press Enter to confirm]  │
└──────────────────────────────────────────────────────┘
```

**You must:**
1. **Hold Spacebar** for at least 400ms (mechanical proof of intent)
2. **Press Enter** to confirm (explicit authorization)

This is the human-in-the-loop gatekeeper.

### Step 7: Watch the Actuation

After you press Enter, watch your console and Logic Pro:

**Console Output:**
```
📋 [DISPATCHER] Received work order: prop_limiter_12345
✅ [DISPATCHER] Audit binding verified: audit_limiter_12345_xyz
✅ [DISPATCHER] Found bridge: APPLESCRIPT

🍏 [LOGIC_PRO_BRIDGE] REAL EXECUTION MODE
   Action: INSERT_LIMITER
   Track: Master
   Audit ID: audit_limiter_12345_xyz

📤 [LOGIC_PRO_BRIDGE] Firing actuator...
🏃 [ACTUATOR] Executing AppleScript at 2025-12-31T19:44:36.352Z

✅ [ACTUATOR] AppleScript executed successfully
   Output: ...

✅ [LOGIC_PRO_BRIDGE] Execution successful

🏛️ [DISPATCHER] Forensic entry sealed: audit_limiter_12345_xyz
```

**Logic Pro X Reaction:**
- Logic Pro jumps to the foreground ✅
- A track is selected ✅
- (With more advanced scripts: Limiter plugin inserted, fader moved, etc.)

### Step 8: Verify Forensic Entry

In the console, you should see:
```
📜 [FORENSIC_LOG] Entry sealed: audit_limiter_12345_xyz
```

And you can retrieve it:
```javascript
// In browser console:
ForensicAuditLog.getEntry('audit_limiter_12345_xyz')
```

Output will show the complete forensic record with:
- WHAT: Limiter inserted (SUCCESS)
- WHY: APL detected 2.1dB clipping
- WHO: User held Spacebar 450ms+
- WHEN: Timestamp
- DID IT WORK: Result hash

### Step 9: Export for Compliance

```javascript
// In browser console:
const report = ForensicAuditLog.exportForCompliance();
console.log(JSON.stringify(report, null, 2));
```

This JSON is ready to hand to a CISO or regulator.

---

## 🔴 Safety Checkpoints (MUST VERIFY)

Before declaring Phase 11 complete:

### Checkpoint 1: Validation Works
- [ ] AppleScript validation rejects dangerous patterns
- [ ] Whitelist enforcement prevents injection attacks
- [ ] Console shows "✅ [ACTUATOR] Script validation passed"

### Checkpoint 2: Execution is Authorized
- [ ] HUD Ghost requires 400ms+ hold before executing
- [ ] Skipping the hold results in REJECTED state
- [ ] Forensic entry only created after EXECUTED state

### Checkpoint 3: Forensic Sealing Happens
- [ ] Result includes forensicEntryId
- [ ] Forensic entry is frozen (Object.isFrozen === true)
- [ ] Entry contains complete WHAT/WHY/WHO/WHEN/SUCCESS

### Checkpoint 4: Real Control Happens
- [ ] Logic Pro actually responds (jumps to foreground)
- [ ] Selected track changes (if script includes selection)
- [ ] Output is captured in result
- [ ] No console errors during execution

### Checkpoint 5: Audit Trail is Immutable
- [ ] Attempt to modify sealed entry throws error
- [ ] exportForCompliance() JSON is valid
- [ ] Entry hash matches exported hash

---

## 🛑 Troubleshooting

### "osascript: command not found"
- macOS only: `osascript` is built into all macOS systems
- Linux/Windows: AppleScript not supported (would need different bridge)
- Verify: `which osascript` returns `/usr/bin/osascript`

### "Logic Pro X is not responding"
- Logic Pro may require Accessibility permissions
- Try: **System Preferences → Security & Privacy → Accessibility**
- Add your Terminal or IDE to the list
- Restart your dev server

### "Script validation failed"
- Your AppleScript contains a dangerous pattern
- Check the console for: `⚠️  [ACTUATOR] REJECTED: Script contains dangerous pattern`
- Only whitelisted commands are allowed (for safety)

### "AppleScript execution failed"
- AppleScript syntax error
- Check console for stderr output
- Most common: Wrong track name or application name
- Verify Logic Pro X is actually running and has a project open

### "Forensic entry not sealed"
- If forensic metadata not included on work order
- Check that work order includes `forensic: { ... }`
- If bridge crashes, entry may not be sealed (check logs)

---

## 🎯 The Complete Authority Chain (Proven)

When this test completes successfully, you have proven:

```
PERCEPTION LAYER (Objective Intelligence)
├─ APL analyzes signals: LUFS, peaks, clipping
├─ Detects: 2.1dB true peak (exceeds 0dB limit)
└─ Proposes: Safety limiter at -0.1dB

AUTHORITY LAYER (Human Decision)
├─ HUD displays with forensic evidence
├─ User holds Spacebar: 450ms (intentional)
├─ User presses Enter: Explicit confirmation
└─ FSM transitions: GENERATED → VISIBLE_GHOST → HOLDING → PREVIEW_ARMED → CONFIRM_READY → EXECUTED

EXECUTION LAYER (Atomic Action)
├─ Dispatcher verifies audit binding
├─ AppleScriptActuator validates script
├─ osascript executes via macOS Accessibility
└─ Logic Pro responds (real modification)

FORENSICS LAYER (Immutable Proof)
├─ Forensic entry sealed with Object.freeze()
├─ Complete record: WHAT/WHY/WHO/WHEN/SUCCESS
├─ Result hash proves output authenticity
└─ Entry signed and ready for compliance export
```

---

## 📋 Expected Console Output

A successful Phase 11 run produces:

```
╔════════════════════════════════════════════════════════════╗
║    🏛️ PHASE 8: APL MASTERING SIMULATION (from Demo Panel)  ║
╚════════════════════════════════════════════════════════════╝

📊 STEP 1: APL Signal Intelligence
   Track: Master Out
   True Peak: 2.1 dBFS
   Status: Clipping detected at 2.1 dBFS

💡 STEP 2: APL Proposal Engine
   Proposal: Apply Limiter at -0.1 dBFS to prevent clipping
   Evidence: truePeakDB = 2.1 dBFS
   Rationale: True peak detected at 2.1 dBFS...

┌─ GHOST OVERLAY ─────────────────────────────────────┐
│ Apply Limiter at -0.1 dBFS to prevent clipping
│ ... [Human must hold Spacebar + press Enter]
└──────────────────────────────────────────────────────┘

👤 STEP 3: Human Authorization (You Hold Spacebar)
   ⏱️  Duration: 450ms (≥400ms required) ✅
   ✓ Confirmed with Enter

📋 STEP 4: Authority → Work Order (Audit-Bound)
   Action ID: prop_limiter_...
   Audit ID: audit_limiter_..._xyz
   Status: CREATED

🚀 STEP 5: Dispatcher
   ✅ Audit binding verified
   ✅ Domain found: LOGIC_PRO
   ✅ Routed to Logic Pro Bridge

🍏 STEP 6: Logic Pro Bridge Execution (REAL!)
   ✅ Script validation passed
   📤 Firing actuator...
   🏃 Executing AppleScript at 2025-12-31T19:44:36.352Z
   ✅ AppleScript executed successfully

✅ STEP 7: Execution Result
   Status: SUCCESS
   Output: [Logic Pro responded]

📜 STEP 8: Forensic Audit Sealing
   🏛️ FORENSIC ENTRY CREATED
   WHAT? Status: SUCCESS, Domain: LOGIC_PRO
   WHY? Source: APL_SIG_INT, Evidence: truePeakDB = 2.1
   WHO? Session: user_alice_001, Hold: 450ms
   WHEN? Timestamp: 2025-12-31T19:44:36.352Z
   SEALED: true by ACTION_AUTHORITY_V1.0.0

🏛️ PHASE 8: APL MASTERING COMPLETE ✅
```

---

## 🎉 Success Criteria

You have completed Phase 11 when:

- ✅ APL detects clipping (2.1dB)
- ✅ Proposal engine generates remedy with evidence
- ✅ HUD Ghost appears with forensic rationale
- ✅ You perform 400ms+ hold + Enter confirmation
- ✅ Dispatcher verifies audit binding
- ✅ AppleScriptActuator validates the script
- ✅ osascript executes the AppleScript
- ✅ Logic Pro X actually responds (visual feedback)
- ✅ Forensic entry sealed with complete WHAT/WHY/WHO/WHEN
- ✅ Result includes forensicEntryId
- ✅ exportForCompliance() produces valid JSON

---

## 🏛️ Phase 11 Complete

When all checkpoints pass, you have achieved:

**The Credibility Leap:** Moving from a mathematically safe system to a system that safely controls a $200B industry tool.

```
Before Phase 11: "Our AI is safe" (claim)
After Phase 11:  "Our AI is safe" (proof via sealed forensic log)
```

The difference is the forensic audit log. It transforms safety from a theoretical property into a verifiable, auditable fact.

---

## Next Steps

After successful Phase 11 testing:

1. **Persistence:** Store forensic entries in database/HSM
2. **Production Hardening:** Real error handling, retry logic, undo capability
3. **Advanced Workflows:** Multi-step procedures (gain + compression + limiting)
4. **Real-Time Feedback:** Show forensic entries in UI
5. **Regulatory Export:** Generate compliance reports automatically

---

**Ready to go live?** 🍏🛡️✅
