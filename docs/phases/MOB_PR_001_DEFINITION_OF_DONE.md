# MOB-PR-001 — TIER 0 FOUNDATIONS (Definition of Done)

Status: BLOCKING PREREQUISITE
Scope: Tier 0 only — singletons + lifecycle wiring
Scope Locked: All other PRs depend on this

---

## TIER 0 — Mobile Singletons & Lifecycle Wiring

**What This PR Delivers:**
- MobileSessionContext (single instance, injected everywhere)
- MobileLifecycleWatcher (lifecycle → revocation mapping)
- iOS wiring (AppDelegate hooks)
- Android wiring (Activity lifecycle + BroadcastReceiver)

**What This PR Does NOT Include:**
- ❌ No enforcement logic (that's Tier 1+)
- ❌ No file access gate
- ❌ No accessibility gate
- ❌ No export job controller
- ❌ No adapter routing
- ❌ No persistence

---

## Definition of Done (Non-Negotiable)

### Code Quality
- ✅ Code compiles (TypeScript + Kotlin + Swift, zero errors)
- ✅ No warnings
- ✅ All imports resolved

### Singleton Enforcement
- ✅ MobileSessionContext instantiated once (injected to all gates)
- ✅ No gate creates its own SessionContext (constructor dependency injection enforced)
- ✅ MobileLifecycleWatcher receives SessionContext as parameter

### Lifecycle Wiring
**iOS:**
- ✅ applicationDidBecomeActive → onForeground()
- ✅ applicationWillResignActive → onBlur()
- ✅ applicationDidEnterBackground → onBackground()
- ✅ applicationWillTerminate → onKill()
- ✅ Screen lock detection → onScreenLock()

**Android:**
- ✅ onResume() → onForeground()
- ✅ onPause() → onBlur()
- ✅ onStop() → onBackground()
- ✅ onDestroy() → onKill()
- ✅ BroadcastReceiver(ACTION_SCREEN_OFF) → onScreenLock()

### Session Binding
- ✅ SessionContext.bind(sessionId) complete
- ✅ SessionContext.assert(sessionId) throws on mismatch
- ✅ SessionContext.revoke(sessionId) clears if matched
- ✅ SessionContext.revokeAll() total cleanup
- ✅ SessionContext.get() returns current or null
- ✅ SessionContext.setForeground() / isInForeground() working

### Revocation Correctness
- ✅ onBlur() calls revokeAll()
- ✅ onBackground() calls revokeAll()
- ✅ onScreenLock() calls revokeAll()
- ✅ onKill() calls revokeAll()
- ✅ No implicit session persistence across lifecycle

### Audit Coverage
- ✅ All state transitions emit audit events
- ✅ bind() emits MOBILE_SESSION_BOUND
- ✅ revoke() emits MOBILE_SESSION_REVOKED
- ✅ revokeAll() emits MOBILE_SESSION_REVOKED_ALL
- ✅ Lifecycle transitions emit (FOREGROUND, BLUR, BACKGROUND, TERMINATED, SCREEN_LOCK)
- ✅ No silent path

### Scope Discipline
- ✅ No Tier 1+ logic sneaking in
- ✅ No gate instantiation
- ✅ No capability enforcement
- ✅ No file/accessibility/job logic

### No Persistence
- ✅ No disk writes
- ✅ No ViewModel/savedState persistence of authority
- ✅ No environment variable storage
- ✅ No static cache
- ✅ Authority lives only in MobileSessionContext

---

## Blocks Closed

None (foundation tier only).

---

## What Ghost Will Verify

1. **Singleton enforcement** (no ad-hoc instances)
2. **Lifecycle completeness** (all events wired)
3. **Revocation absolute** (revokeAll() works)
4. **Zero persistence** (no state survives)
5. **Scope discipline** (only Tier 0 logic)

---

## Merge Gate (REQUIRED)

🔒 **BLOCKING:** All other PRs depend on this. Must merge first.

If MOB-PR-001 fails → entire mobile tier stalls.
If MOB-PR-001 passes → MOB-PR-002 unblocks immediately.

---

## Ghost Verdict Criteria

**PASS:** All Definition of Done items met, zero bypasses introduced.
**BLOCK:** Any singleton violation, missing audit, persistence, or scope creep.

---

**This PR is the foundation. It must be correct before anything else builds on it.**
