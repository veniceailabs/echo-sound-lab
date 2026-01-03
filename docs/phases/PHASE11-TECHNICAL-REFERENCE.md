# Phase 11: Technical Reference
## AppleScript Actuator Architecture

---

## File Structure

```
src/execution/
├── actuators/
│   └── AppleScriptActuator.ts          ← NEW: OS-level interface
│
└── adapters/
    └── LogicProBridge.ts               ← UPDATED: Real execution mode
```

---

## AppleScriptActuator.ts (New)

### Purpose
Safely execute AppleScript via macOS `osascript` utility with:
- Input validation (whitelist)
- Injection prevention (shell escaping)
- Error handling (capture stderr)
- Forensic logging (log every command)

### Key Methods

#### `run(script: string): Promise<AppleScriptResult>`
Execute AppleScript with validation and error handling.

```typescript
const result = await AppleScriptActuator.run(`
  tell application "Logic Pro X"
    activate
  end tell
`);

// Returns:
{
  status: 'SUCCESS' | 'FAILED',
  output: string,
  stderr?: string,
  command: string  // For forensics
}
```

**Security:**
1. Script is quoted for shell safety: `osascript -e 'script...'`
2. Single quotes prevent variable expansion
3. Embedded single quotes are escaped: `'\''`
4. 30-second timeout prevents hangs
5. 10MB output limit prevents memory exhaustion

#### `validateScript(script: string, context: string): boolean`
Whitelist-based validation.

**Allowed Patterns:**
- `tell application "Logic Pro X"`
- `tell application "Logic Pro"`
- `activate`
- `set selected track to track`
- `tell front project`
- `tell process "Logic Pro X"`
- `tell application "System Events"`

**Rejected Patterns:**
- `do shell script` (could execute arbitrary commands)
- `run script` (could load external code)
- `open location` (could fetch malicious files)
- `delete`, `rm -rf`, `dd if=` (destructive)

Returns: `true` if script passes all checks, `false` if dangerous.

#### `buildLogicProScript(command, params): string`
Helper to generate safe AppleScript.

```typescript
const script = buildLogicProScript('INSERT_LIMITER', {
  track: 'Master Out',
  plugin: 'Limiter'
});
```

---

## LogicProBridge.ts (Updated)

### New Real Execution Mode

#### Before (Simulation)
```typescript
private SIMULATION_MODE = true;

private async executeReal() {
  console.log("Would execute...");
  return { status: 'SUCCESS' };
}
```

#### After (Real)
```typescript
private SIMULATION_MODE = false;  // Enable real execution

private async executeReal(workOrder, script) {
  // 1. Validate script
  if (!AppleScriptActuator.validateScript(script, `Logic Pro ${action}`)) {
    return createExecutionResult(..., 'FAILED', 'Script validation failed');
  }

  // 2. Execute via AppleScriptActuator
  const result = await AppleScriptActuator.run(script);

  // 3. Return result (success or failure)
  if (result.status === 'SUCCESS') {
    return createExecutionResult(..., 'SUCCESS', {
      action,
      applescriptOutput: result.output
    });
  } else {
    return createExecutionResult(..., 'FAILED', ..., {
      code: 'APPLESCRIPT_ERROR',
      message: result.stderr
    });
  }
}
```

### Toggle Real Execution

**Option A: Code Change**
```typescript
// In LogicProBridge.ts
private SIMULATION_MODE = false;  // Change from true
```

**Option B: Runtime Toggle**
```typescript
// In browser console
const bridge = getLogicProBridge();
bridge.setSimulationMode(false);  // Enable real execution
```

**Option C: Environment Variable** (Future)
```typescript
private SIMULATION_MODE = process.env.LOGIC_PRO_REAL !== 'true';
```

---

## Execution Flow (Phase 11 Complete)

```
┌─────────────────────────────────────────────────────────────┐
│ USER DECISION                                               │
│ ├─ HUD displays Ghost with APL evidence                     │
│ ├─ User holds Spacebar 400ms+ (mechanical proof)            │
│ └─ User presses Enter (explicit confirmation)               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ WORK ORDER CREATION (Audit-Bound)                           │
│ ├─ actionId: from FSM                                       │
│ ├─ audit.auditId: from Authority layer                      │
│ ├─ forensic metadata: rationale + authority + session       │
│ └─ payload: action-specific parameters                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ DISPATCHER (Verification Gateway)                           │
│ ├─ Step 1: Verify audit binding exists                      │
│ ├─ Step 2: Route to LogicProBridge                          │
│ ├─ Step 3: Execute                                          │
│ └─ Step 4: Seal forensic entry                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ LOGIC PRO BRIDGE (Execution)                                │
│ ├─ Build AppleScript from payload                           │
│ ├─ Call AppleScriptActuator.validateScript()                │
│ └─ If real mode: Call AppleScriptActuator.run()             │
│    If simulation: Log action and return success             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ APPLE SCRIPT ACTUATOR (OS-Level Bridge)                     │
│ ├─ Quote script for shell safety                            │
│ ├─ Execute: osascript -e 'script...'                        │
│ ├─ Capture stdout + stderr                                  │
│ ├─ Enforce 30s timeout                                      │
│ └─ Return AppleScriptResult                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ OS/APPLICATION LEVEL (macOS Accessibility Framework)        │
│ ├─ Process AppleScript by osascript                         │
│ ├─ Control Logic Pro X via Accessibility API                │
│ ├─ Return output/error                                      │
│ └─ (Requires user permission in Security & Privacy)         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ EXECUTION RESULT                                            │
│ ├─ status: SUCCESS | FAILED                                 │
│ ├─ output: stdout from Logic Pro                            │
│ ├─ error: stderr if failed                                  │
│ └─ forensicEntryId: sealed forensic record                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ FORENSIC AUDIT LOG (Immutable)                              │
│ ├─ Entry sealed with Object.freeze()                        │
│ ├─ WHAT: execution.status + resultHash                      │
│ ├─ WHY: rationale (APL metrics + description)               │
│ ├─ WHO: session + authority.holdDurationMs                  │
│ ├─ WHEN: timestamp + confirmationTime                       │
│ └─ Ready for compliance export                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Defense Layers (Defense in Depth)

**Layer 1: FSM + Authority** (Phase 3)
- 400ms hold requirement (reflex protection)
- Explicit Enter key confirmation
- Immutable state transitions
- Audit binding required

**Layer 2: Dispatcher Verification** (Phase 7)
- Rejects work orders without auditId
- Routes to correct bridge only
- Logs every decision

**Layer 3: AppleScript Validation** (Phase 11 NEW)
- Whitelist of allowed patterns
- Blacklist of dangerous patterns
- Shell escaping for injection prevention
- 30-second timeout

**Layer 4: Forensic Sealing** (Phase 9)
- Complete record of decision chain
- Object.freeze() prevents tampering
- Ready for legal non-repudiation
- Immutable audit trail

### Attack Scenarios Prevented

| Scenario | Defense |
|----------|---------|
| "AI moved fader alone" | Forensic log shows 450ms+ hold |
| Script injection (```'; rm -rf /;```) | Shell escaping + whitelist validation |
| Unauthorized execution | Audit binding gate in dispatcher |
| Tampering with forensic record | Object.freeze() + immutability |
| Silent failure | Captured stderr + timeout |
| Reflexive action | 400ms mechanical hold requirement |

---

## Configuration

### Enable/Disable Real Execution

**Development (Default: Simulation)**
```typescript
// src/action-authority/execution/adapters/LogicProBridge.ts
private SIMULATION_MODE = true;  // Safe: just logs
```

**Testing (Enable Real)**
```typescript
// Option 1: Change code
private SIMULATION_MODE = false;

// Option 2: Runtime toggle
bridge.setSimulationMode(false);
```

**Production (Recommended: Simulation + Audit)**
Keep simulation enabled until you have:
- [ ] Real Logic Pro project tested
- [ ] Forensic entries persisted to database
- [ ] Undo/rollback capability implemented
- [ ] Comprehensive error handling

---

## Monitoring & Logging

### What Gets Logged

#### AppleScriptActuator
```
🏃 [ACTUATOR] Executing AppleScript at 2025-12-31T19:44:36.352Z
   Command: osascript -e '...'
   Script length: 245 characters

✅ [ACTUATOR] AppleScript executed successfully
   Output: ...
```

#### LogicProBridge
```
🍏 [LOGIC_PRO_BRIDGE] REAL EXECUTION MODE
   Action: INSERT_LIMITER
   Track: Master
   Audit ID: audit_limiter_12345

✅ [LOGIC_PRO_BRIDGE] Execution successful
```

#### Dispatcher
```
📋 [DISPATCHER] Received work order: prop_limiter_12345
✅ [DISPATCHER] Audit binding verified: audit_limiter_12345_xyz
🏛️ [DISPATCHER] Forensic entry sealed: audit_limiter_12345_xyz
```

### Forensic Logging

Every execution creates an immutable forensic entry:

```json
{
  "auditId": "audit_limiter_12345_xyz",
  "action": "INSERT_LIMITER",
  "timestamp": 1767210276352,
  "session": "user_alice_001",
  "rationale": {
    "source": "APL_SIG_INT",
    "evidence": { "truePeakDB": 2.1, "clippingDetected": true }
  },
  "authority": {
    "fsmPath": ["GENERATED", "VISIBLE_GHOST", "HOLDING", "CONFIRM_READY", "EXECUTED"],
    "holdDurationMs": 450
  },
  "execution": {
    "domain": "LOGIC_PRO",
    "bridge": "APPLESCRIPT",
    "status": "SUCCESS",
    "resultHash": "sha256_abc123..."
  },
  "sealed": true,
  "sealedBy": "ACTION_AUTHORITY_V1.0.0"
}
```

---

## Error Handling

### Script Validation Failure
```
❌ [ACTUATOR] REJECTED: Script contains dangerous pattern: do shell script
```
**Action:** Return FAILED result, log rejection, no execution

### AppleScript Execution Failure
```
❌ [ACTUATOR] AppleScript failed
   Error: Logic Pro: command returned error: can't get...
```
**Action:** Return FAILED result with stderr, forensic entry still sealed

### Timeout (30 seconds)
```
❌ [ACTUATOR] AppleScript failed
   Error: command timed out
```
**Action:** Return FAILED result, forensic entry sealed with timeout marker

### Audit Binding Missing
```
❌ [DISPATCHER] REJECTED: Missing audit binding
```
**Action:** Return FAILED result before reaching bridge, no forensic entry

---

## Best Practices

### 1. Always Include Forensic Metadata
```typescript
const workOrder = createWorkOrder({
  // ... required fields ...
  forensic: {
    session: 'user_alice_001',
    rationale: { source: 'APL_SIG_INT', evidence: {...} },
    authority: { fsmPath: [...], holdDurationMs: 450 }
  }
});
```

### 2. Monitor AppleScript Execution
```javascript
// In browser console
const entry = ForensicAuditLog.getEntry(auditId);
console.log('Status:', entry.execution.status);
console.log('Duration:', entry.execution.duration, 'ms');
console.log('Output:', entry.execution.output);
```

### 3. Validate Before Real Execution
```typescript
// Test in simulation mode first
bridge.setSimulationMode(true);
await dispatcher.dispatch(workOrder);  // Safe

// Then enable real
bridge.setSimulationMode(false);
await dispatcher.dispatch(workOrder);  // Real execution
```

### 4. Export Forensic Trail Regularly
```javascript
const report = ForensicAuditLog.exportForCompliance();
// Save to database or file for compliance audit
```

---

## Testing Checklist

- [ ] AppleScriptActuator.run() executes on macOS
- [ ] validateScript() accepts whitelisted commands
- [ ] validateScript() rejects dangerous patterns
- [ ] Shell escaping prevents injection
- [ ] 30-second timeout works
- [ ] stderr is captured and logged
- [ ] LogicProBridge builds valid AppleScript
- [ ] Toggle simulation ↔ real mode works
- [ ] Dispatcher verifies audit binding
- [ ] Forensic entry is sealed (frozen)
- [ ] exportForCompliance() produces valid JSON
- [ ] Logic Pro X responds to osascript commands

---

**Phase 11 Status:** ✅ READY FOR LIVE TESTING

The credibility leap is complete. You can now tell any stakeholder:

> "The AI saw a problem, presented the evidence, and waited for my explicit authorization. I held a key for 450ms to prove my intent. Only then did the system move a single pixel. Here's the sealed forensic log proving every step."
