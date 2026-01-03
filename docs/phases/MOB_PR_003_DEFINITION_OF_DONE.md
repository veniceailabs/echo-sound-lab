# MOB-PR-003 — TIER 2 SESSION BINDING ENFORCEMENT (Definition of Done)

Status: **TIER 2 ENFORCEMENT WRAPPER**
Scope: Thin entry-point enforcement only — no state, no lifecycle, no implicit binding
Blocks: MOB-T01, MOB-T02, MOB-T05, MOB-T06, MOB-T07, MOB-T08, MOB-T09, MOB-T12

---

## What This PR Delivers

**Single Enforcement Wrapper:**
- `MobileEnforceWrapper` — thin entry point for all gate operations
- **Exact enforcement order:** `throwIfNotInForeground() → sessionCtx.assert(sessionId) → logic()`
- Guard clauses ONLY — no decision logic
- No implicit binding, no state creation, no defaults

**What This PR Does NOT Include:**
- ❌ No SessionContext modification
- ❌ No lifecycle changes
- ❌ No accessibility gate implementation
- ❌ No file access rules
- ❌ No auto-bind or implicit authority
- ❌ No state flags or decision logic

---

## Definition of Done (Non-Negotiable)

### Code Quality
- ✅ TypeScript compiles (zero errors)
- ✅ No warnings
- ✅ All imports resolved to existing classes (MobileLifecycleWatcher, MobileSessionContext)

### Enforcement Order (ABSOLUTE)
- ✅ FIRST: `throwIfNotInForeground()` — hard stop if background
- ✅ SECOND: `sessionCtx.assert(sessionId)` — validate session binding
- ✅ THIRD: Call the underlying operation

**Example pattern (EXACT):**
```typescript
public async enforceFileAccess(sessionId: string, fn: () => Promise<any>): Promise<any> {
  // Line 1: Freeze gate
  this.watcher.throwIfNotInForeground();

  // Line 2: Bind gate
  this.sessionCtx.assert(sessionId);

  // Line 3: Logic execution
  return await fn();
}
```

### No Hidden State
- ✅ No private flags (no `this.bound`, `this.ready`, `this.validated`)
- ✅ No caching of sessionId
- ✅ No implicit SessionContext creation
- ✅ No session bleed after revoke

### Audit Trail
- ✅ Every enforce call logs audit event
- ✅ Failed assertions emit `OS_PERMISSION_DENIED`
- ✅ Hard stops emit `OS_HARD_STOP_TRIGGERED`
- ✅ No silent paths

### Type Safety
- ✅ `sessionId: string` is required parameter (no optional, no defaults)
- ✅ Function signature enforces sessionId presence
- ✅ No implicit coercion or type weakening

### Scope Discipline
- ✅ No Tier 3+ logic sneaking in
- ✅ No conditional logic beyond guard clauses
- ✅ No early returns except exceptions
- ✅ No implicit auto-bind or resume logic

### Singleton Pattern (Enforced)
- ✅ Constructor injection: `sessionCtx: MobileSessionContext`
- ✅ Constructor injection: `watcher: MobileLifecycleWatcher`
- ✅ No creation of new SessionContext or LifecycleWatcher
- ✅ Same instances used across all gates

---

## Blocks (MOB-Txx Vectors)

**MOB-T01: Automatic foreground → authority resume** ✅ Blocked by throwIfNotInForeground()
**MOB-T02: Notification tap grants authority** ✅ Blocked by sessionCtx.assert() (requires explicit bind)
**MOB-T05: Blur grants authority** ✅ Blocked by throwIfNotInForeground() (blur → setForeground(false))
**MOB-T06: Background app accessibility** ✅ Blocked by throwIfNotInForeground() (background → setForeground(false))
**MOB-T07: Screen lock grants authority** ✅ Blocked by throwIfNotInForeground() (lock → setForeground(false))
**MOB-T08: Background service execution** ✅ Blocked by throwIfNotInForeground() (hard stop)
**MOB-T09: Silent foreground state bypass** ✅ Blocked by throwIfNotInForeground() + sessionCtx.assert()
**MOB-T12: Implicit authority after app kill** ✅ Blocked by sessionCtx.assert() (requires fresh bind)

---

## Ghost Verdict Criteria

**PASS:**
- Enforce wrapper is 1 file, 1 class, 1 method (thin)
- All 8 MOB-T blocks are provable
- No state, no flags, no implicit logic
- All enforce calls follow exact order
- Throwable exceptions (no silent failures)

**BLOCK:**
- Any implicit binding or state creation
- Any decision logic beyond guard clauses
- Any condition that changes behavior based on history
- Any silent failures or exceptions swallowed
- Scope creep (Tier 3+ logic appearing)

---

## What Tier 2 Is (And Isn't)

**IS:**
- Mechanical guard clause enforcement
- First two lines of defense (freeze, bind)
- Audit emission on every path
- Thin wrapper around existing SessionContext

**IS NOT:**
- Business logic implementation
- State management (Tier 0 owns that)
- Lifecycle handling (Tier 1 owns that)
- Accessibility enforcement (Tier 3+)
- File access rules (Tier 4+)

---

## Test Coverage (From MOB-ACC tests)

**MOB-ACC-01 through MOB-ACC-09** all apply.
Tier 2 adds:
- ✅ Wrapper enforces session parameter requirement
- ✅ Wrapper fails if sessionId mismatches (assert)
- ✅ Wrapper fails if app backgrounded (throwIfNotInForeground)
- ✅ No implicit bind or recover logic

---

## Merge Gate (REQUIRED)

🔒 **BLOCKING:** MOB-PR-003 must pass before MOB-PR-004, MOB-PR-005, etc.

If MOB-PR-003 fails → entire Tier 2+ stalls.
If MOB-PR-003 passes → MOB-PR-004 (app kill + deep-link binding) unblocks immediately.

---

**This PR is the thin enforcement gate. It must be mechanical, it must be frozen (first line), and it must never hide intent.**
