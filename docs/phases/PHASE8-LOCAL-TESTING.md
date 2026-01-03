# Phase 8: Local Testing Guide

## 🎯 What You Just Built

You now have the complete **Intelligence → Authority → Execution** chain:

```
APL (Intelligence)           Analyzer + Proposal Engine
    ↓ [proposes via Ghost]
Authority (HUD + FSM)        Governance Layer v1.0.0 (SEALED)
    ↓ [human decides]
Dispatcher (Gateway)         Audit binding verification
    ↓ [if authorized]
Bridges (Executors)          Logic Pro, Chrome, System
    ↓ [executes]
Audit Log (Sealed)           Evidence trail + decision record
```

---

## 🧪 How to Test at http://localhost:3008

### **Step 1: Open the App**
```
Browser: http://localhost:3008
DevTools: F12 → Console tab
```

### **Step 2: Expand the Demo Panel**
```
Top-right corner: Click "▶ Action Authority Demo"
You'll see two buttons:
  • "Test Action (Spacebar to Arm)"
  • "Test APL Mastering (Clipping)" ← NEW
```

### **Step 3: Click "Test APL Mastering (Clipping)"**
```
This button logs the entire 8-step flow to the console
```

### **Step 4: Watch the Console Output**

You should see:

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
│
│ Evidence:
│   Metric: Signal Peak Level
│   Current: 2.1 dBFS
│   Target: -0.1 dBFS
│   Source: APL-SIG-INT analysis
│
│ [Hold Spacebar 400ms, then press Enter to confirm]
└──────────────────────────────────────────────────────┘

[... rest of flow ...]

═══════════════════════════════════════════════════════════
🏛️ PHASE 8: APL MASTERING COMPLETE ✅

The intelligence-authority link is operational!
```

---

## ✅ What to Verify

### The "Smart" Part
```
✅ Does the Ghost show the rationale?
   "True peak detected at 2.1 dBFS (clipping)"

✅ Does it show forensic evidence?
   "Current: 2.1 dBFS, Target: -0.1 dBFS"

✅ Does it cite the source?
   "Source: APL-SIG-INT analysis"
```

### The "Safe" Part
```
✅ Does it still require human authorization?
   "Hold Spacebar 400ms, then press Enter"

✅ Is the work order audit-bound?
   Audit ID visible in STEP 4

✅ Does the dispatcher verify the audit binding?
   "✅ Audit binding verified" in STEP 5
```

### The Complete Chain
```
✅ APL analyzes metrics
   ↓
✅ Proposal engine generates remedy
   ↓
✅ HUD displays with evidence
   ↓
✅ Human confirms via 400ms hold
   ↓
✅ Work order created (audit-bound)
   ↓
✅ Dispatcher verifies audit
   ↓
✅ Bridge executes
   ↓
✅ Result sealed in audit log
```

---

## 🔗 Key Files for Reference

| File | Purpose |
|------|---------|
| `src/apl/signal-intelligence.ts` | Forensic metrics (LUFS, peaks, clipping) |
| `src/apl/analyzer.ts` | Pure metric extraction (APLAnalyzer) |
| `src/apl/proposal-engine.ts` | Converts metrics → proposals with evidence |
| `src/components/ActionAuthorityDemo.tsx` | Demo panel with test button |
| `src/action-authority/execution/dispatcher.ts` | Audit binding gateway |
| `src/action-authority/execution/adapters/LogicProBridge.ts` | "Deaf" executor (no detection) |

---

## 🚀 Next: Phase 9 (Forensic Audit Log)

**Phase 9 will:**
- Connect the "Why" (evidence + rationale) to the "Who" (user decision)
- Create forensic audit log entries that prove:
  - What the APL detected
  - What the human decided
  - What actually executed
  - Why each step happened

**This is the non-repudiation layer** - every decision is stamped with forensic proof.

---

## ❓ Questions to Ask

1. **Did the button appear?** (Purple "Test APL Mastering" button in demo panel)
2. **Did the console log all 8 steps?**
3. **Does the evidence include specific metrics (2.1 dBFS)?**
4. **Is the work order audit-bound?**
5. **Does the dispatcher verify the audit binding?**

If all answers are ✅, **Phase 8 is operational and ready for Phase 9**.
