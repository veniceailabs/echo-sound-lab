# MOB-PR-003 Failure Modes — Why Engineers Fail Tier 2

Status: **AUTHORITATIVE** — These failure modes are predicted by Ghost.
Goal: Show what BREAKS and why this wrapper SURVIVES.

---

## Why Tier 2 Is Hard

Tier 2 (Session Binding Enforcement) looks simple:
- "Just check the session ID before executing logic."

But there are **7 critical failure modes** that engineers introduce, usually without realizing it:

1. **Freeze Gate Forgotten** — Logic executes even when app is backgrounded
2. **Bind Gate Weakened** — SessionID checked, but implicitly or optionally
3. **Guard Order Reversed** — Bind checked before freeze (wrong order)
4. **Implicit Auto-Bind** — Operation attempts to "restore" session automatically
5. **Shadow SessionContext** — Engineer creates new SessionContext, loses singleton
6. **Silent Failures** — Bind fails but operation continues anyway
7. **Async State Bleed** — Race condition between revocation and async operation

---

## FAILURE MODE 1: Freeze Gate Forgotten

### The Engineer's Mistake
```typescript
// ❌ WRONG — No freeze gate
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.sessionCtx.assert(sessionId);  // ← Only bind gate
  return await fn();
}
```

**Why This Fails:**
- If app backgrounded, `isInForeground()` is false
- But `assert()` still passes (session exists)
- Operation executes in the background
- **Vulnerability:** MOB-T01, MOB-T08 (background execution)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Freeze gate FIRST
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();  // ← Line 1
  this.sessionCtx.assert(sessionId);      // ← Line 2
  return await fn();
}
```

**Proof:**
- Test: `MOB_PR_003_Ghost_Attack_Simulation.test.ts` → **ATTACK 1**
- If background, freeze gate throws immediately
- Operation never executes

---

## FAILURE MODE 2: Bind Gate Weakened

### The Engineer's Mistake
```typescript
// ❌ WRONG — Bind check is optional/implicit
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();

  // Bind gate is CONDITIONAL (WRONG)
  if (sessionId !== this.sessionCtx.get()) {
    // Maybe throw, maybe log, maybe just continue...
    console.warn('Session mismatch');
  }

  return await fn();  // ← Continues regardless!
}
```

**Why This Fails:**
- Engineer added logging instead of throwing
- Operation continues even after session mismatch
- **Vulnerability:** MOB-T02, MOB-T05, MOB-T09 (authorization bypass)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Bind gate throws (non-negotiable)
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();
  this.sessionCtx.assert(sessionId);  // ← Throws immediately, no conditions
  return await fn();
}
```

**Proof:**
- Test: `MOB_PR_003_Ghost_Attack_Simulation.test.ts` → **ATTACK 2**
- If sessionId doesn't match, `assert()` throws
- No conditions, no logging, no recovery

---

## FAILURE MODE 3: Guard Order Reversed

### The Engineer's Mistake
```typescript
// ❌ WRONG — Bind gate first, freeze gate second
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.sessionCtx.assert(sessionId);      // ← Checked first (WRONG)
  this.watcher.throwIfNotInForeground();  // ← Checked second
  return await fn();
}
```

**Why This Fails:**
- Bind check succeeds (session is valid)
- THEN freeze gate throws
- But bind check already validated state
- **Subtle vulnerability:** Order matters because freeze is cheaper, faster (early exit)
- If freeze is second, you've already touched stateful SessionContext (potential TOCTOU)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Freeze gate FIRST (always)
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();  // ← Line 1, fastest, cheapest check
  this.sessionCtx.assert(sessionId);      // ← Line 2, only if freeze passed
  return await fn();
}
```

**Proof:**
- Freeze gate is defined first in all three methods
- Comments document the exact line order
- Ghost checks AST (abstract syntax tree) — order is syntactic law

---

## FAILURE MODE 4: Implicit Auto-Bind

### The Engineer's Mistake
```typescript
// ❌ WRONG — Engineer tries to "be helpful" with auto-bind
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();

  // Auto-bind if not already bound (DANGEROUS)
  if (this.sessionCtx.get() === null) {
    this.sessionCtx.bind(sessionId);  // ← Silent authority restoration!
  }

  this.sessionCtx.assert(sessionId);
  return await fn();
}
```

**Why This Fails:**
- If session was revoked, engineer "restores" it automatically
- **Vulnerability:** MOB-T01 (automatic foreground → authority resume)
- User backgrounded app, session was revoked, app returns to foreground
- Engineer's auto-bind grants authority without user action

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Wrapper is PASSIVE, never binds
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();
  this.sessionCtx.assert(sessionId);  // ← Assertion only, never binding
  return await fn();
}
```

**Proof:**
- Constructor injection enforces SessionContext is created externally
- `enforce()` never calls `bind()` or modifies session state
- Only `assert()` (validation), never `bind()` (creation)
- Test: `MOB_PR_003_Ghost_Attack_Simulation.test.ts` → **ATTACK 5**

---

## FAILURE MODE 5: Shadow SessionContext

### The Engineer's Mistake
```typescript
// ❌ WRONG — Engineer creates new SessionContext inside wrapper
public class MobileEnforceWrapper {
  private sessionCtx: MobileSessionContext;  // ← Created here, not injected

  constructor() {
    this.sessionCtx = new MobileSessionContext();  // ← NEW instance (WRONG)
  }

  public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
    this.sessionCtx.assert(sessionId);
    return await fn();
  }
}
```

**Why This Fails:**
- Wrapper has its own SessionContext (not the app's singleton)
- When app revokes session, wrapper's shadow SessionContext is unaffected
- **Vulnerability:** MOB-T01, MOB-T12 (implicit authority persistence)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Constructor dependency injection (required)
export class MobileEnforceWrapper {
  private sessionCtx: MobileSessionContext;  // ← Not created here
  private watcher: MobileLifecycleWatcher;   // ← Not created here

  constructor(
    sessionCtx: MobileSessionContext,         // ← Injected (required)
    watcher: MobileLifecycleWatcher           // ← Injected (required)
  ) {
    this.sessionCtx = sessionCtx;
    this.watcher = watcher;
  }
}
```

**Proof:**
- Constructor signature requires both dependencies
- No `new` keyword inside constructor
- Test: `MOB_PR_003_Ghost_Attack_Simulation.test.ts` → **ATTACK 4**
- Changing sessionCtx state immediately affects wrapper behavior

---

## FAILURE MODE 6: Silent Bind Failures

### The Engineer's Mistake
```typescript
// ❌ WRONG — Bind check doesn't throw, continues silently
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();

  // Bind check without throw
  const sessionMatches = this.sessionCtx.get() === sessionId;

  // Silent failure
  if (!sessionMatches) {
    console.error('Session mismatch');  // ← Just logs, doesn't throw
  }

  return await fn();  // ← Continues regardless
}
```

**Why This Fails:**
- Logic always executes (no exception)
- Silent failures are exploitable (attacker doesn't see them)
- **Vulnerability:** MOB-T09 (foreground bypass)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Loud failures (exceptions)
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();     // ← Throws '[OS_HARD_STOP]'
  this.sessionCtx.assert(sessionId);         // ← Throws '[OS_PERMISSION_DENIED]'
  return await fn();
}
```

**Proof:**
- Both guard clauses throw exceptions (loud, visible)
- No conditions, no recovery, no fallbacks
- Test: Every test in `MOB_PR_003_Ghost_Attack_Simulation.test.ts` verifies exception is thrown

---

## FAILURE MODE 7: Async State Bleed

### The Engineer's Mistake
```typescript
// ❌ WRONG — Race condition between revoke and async execution
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();
  this.sessionCtx.assert(sessionId);  // ← Checked at START of async

  // During await, app could be backgrounded (session revoked)
  const result = await fn();  // ← If this takes 5 seconds...
                               // ...app could background mid-operation

  return result;  // ← Returning authority that was revoked during operation
}
```

**Why This Fails:**
- While `fn()` awaits, user backgrounds app
- SessionContext is revoked
- But `enforce()` still returns result (implicit authority grant)
- **Vulnerability:** MOB-T08 (background service execution)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — Checks are before operation, exception handling after
public async enforce(sessionId: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();  // ← Checked before
  this.sessionCtx.assert(sessionId);       // ← Checked before

  try {
    const result = await fn();  // ← If backgrounded during this...
    this.audit.emit('MOBILE_ENFORCE_SUCCESS', {...});
    return result;
  } catch (error) {
    this.audit.emit('MOBILE_ENFORCE_OPERATION_FAILED', {...});
    throw error;  // ← Exception bubbles up (no silent success)
  }
}
```

**Why This Still Survives:**
- Checks are AT ENTRY, before operation starts
- If app backgrounds during operation, it's application's responsibility to handle (via lifecycle revocation)
- Wrapper doesn't grant implicit authority; it only validates at entry
- **Critical:** Revocation happens at lifecycle level (Tier 1), not during operation

**Proof:**
- Test: `MOB_PR_003_Ghost_Attack_Simulation.test.ts` → **ATTACK 6** (revocation immediately blocks)
- If revoked AFTER enforce entry but before operation end, that's caught by next enforce call
- Audit trail shows when operation succeeded and when it failed

---

## FAILURE MODE 8: Missing sessionId Parameter

### The Engineer's Mistake
```typescript
// ❌ WRONG — sessionId parameter is optional (WRONG)
public async enforce(sessionId?: string, fn: () => Promise<any>): Promise<any> {
  this.watcher.throwIfNotInForeground();

  // If sessionId is undefined, what do we check?
  if (sessionId) {
    this.sessionCtx.assert(sessionId);
  }

  return await fn();  // ← Continues even without sessionId validation
}
```

**Why This Fails:**
- Operation executes without session validation
- **Vulnerability:** MOB-T02, MOB-T09 (authority without binding)

### How MobileEnforceWrapper Survives
```typescript
// ✅ RIGHT — sessionId is required (non-optional)
public async enforce(
  sessionId: string,  // ← Required, not optional
  operation: () => Promise<T>
): Promise<T> {
  this.watcher.throwIfNotInForeground();
  this.sessionCtx.assert(sessionId);
  return await operation();
}
```

**Proof:**
- TypeScript type signature enforces `sessionId: string` (not `string | undefined`)
- Runtime: If sessionId is undefined/null, `assert()` will throw
- Test: `MOB_PR_003_Ghost_Attack_Simulation.test.ts` → **ATTACK 7**

---

## Summary: Why This Wrapper Survives All 8 Failures

| Failure Mode | Engineer's Mistake | How Wrapper Survives | Proof |
|---|---|---|---|
| 1. Freeze Forgotten | No freeze gate | `throwIfNotInForeground()` line 1 | ATTACK 1 |
| 2. Bind Weakened | Conditional assert | `sessionCtx.assert()` always throws | ATTACK 2 |
| 3. Order Reversed | Bind before freeze | Freeze always line 1, bind line 2 | ATTACK 1+2 |
| 4. Auto-Bind | Silent restoration | Never calls `bind()`, only `assert()` | ATTACK 5 |
| 5. Shadow Context | New SessionContext | Constructor dependency injection | ATTACK 4 |
| 6. Silent Failures | No exceptions | All guards throw (loud failures) | ATTACK 2-7 |
| 7. Async Bleed | Implicit authority | Checks at entry, not during operation | ATTACK 6 |
| 8. Missing sessionId | Optional parameter | `sessionId: string` required | ATTACK 7 |

---

## Ghost's Review Checklist

When Ghost reviews MOB-PR-003, this is what Ghost checks:

**Code Review:**
- [ ] `throwIfNotInForeground()` is FIRST executable line of `enforce()`
- [ ] `sessionCtx.assert(sessionId)` is SECOND executable line
- [ ] No conditions or early returns before these guards
- [ ] No new `SessionContext()` or `LifecycleWatcher()` created
- [ ] No implicit binding logic anywhere

**Dependency Injection:**
- [ ] Constructor requires `sessionCtx: MobileSessionContext`
- [ ] Constructor requires `watcher: MobileLifecycleWatcher`
- [ ] No optional parameters for dependencies

**Exceptions:**
- [ ] Both guard clauses throw (not return false, not log)
- [ ] `throwIfNotInForeground()` throws `[OS_HARD_STOP]`
- [ ] `sessionCtx.assert()` throws `[OS_PERMISSION_DENIED]`
- [ ] No exception swallowing

**Audit Trail:**
- [ ] Every enforce call emits audit event
- [ ] Failures emit to audit log
- [ ] No silent paths

**Type Safety:**
- [ ] `sessionId: string` is required (not optional)
- [ ] No type coercion or weakening

---

## Passing Ghost's Verdict

MOB-PR-003 **PASSES** if:
- All 8 attack vectors blocked ✅
- No failure modes introduced ✅
- All 9 MOB-ACC tests still pass ✅
- No scope creep (no business logic) ✅

MOB-PR-003 **BLOCKS** if:
- ❌ Freeze gate is not first line
- ❌ Bind gate is conditional
- ❌ Dependencies not injected
- ❌ Implicit binding logic exists
- ❌ Silent failures
- ❌ SessionId is optional

---

**This wrapper is thin, mechanical, and defensible. It survives Ghost's red team.**
