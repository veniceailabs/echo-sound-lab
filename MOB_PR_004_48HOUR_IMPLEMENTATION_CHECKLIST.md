# MOB-PR-004 — 48-Hour Implementation Checklist (Tier 3)

Status: **IMPLEMENTATION SEQUENCE** — 3 handlers + adapter routing
Duration: 48 hours (6-hour blocks, rest between)
Scope: Thin, passive handlers only — no logic, no state

---

## Pre-Implementation Requirements

### Ghost Checkpoints Already Placed
- ✅ MOB_PR_004_DEFINITION_OF_DONE.md (spec locked)
- ✅ MOB-ACC-10, 11, 12 (tests are law)
- ✅ MOB-PR-004_Ghost_Pre_Attack.test.ts (attacks probed)
- ✅ MobileSessionContext (Tier 0, locked)
- ✅ MobileLifecycleWatcher (Tier 1, locked)
- ✅ MobileEnforceWrapper (Tier 2, locked)

### Pre-Implementation Verification
- [ ] Read MOB_PR_004_DEFINITION_OF_DONE.md (understand scope)
- [ ] Read MOB_ACC_10_11_12_SUMMARY.md (understand tests)
- [ ] Read MOB_PR_004_Ghost_Pre_Attack.test.ts (understand attacks)
- [ ] Verify MOB-ACC-01 through MOB-ACC-09 pass locally
- [ ] No questions remain about handler contracts

---

## 48-Hour Timeline (Tier 3)

### Block 1: Setup & App Kill Handler (6 hours)

#### 1.1: Environment Setup
- [ ] Branch: `feature/mob-pr-004-tier-3`
- [ ] TypeScript compiler configured for strict mode
- [ ] Jest test runner verified
- [ ] Import paths tested (Tier 0, 1, 2 dependencies available)

#### 1.2: Stub MobileAppKillHandler
```typescript
// src/os/mobile/handlers/MobileAppKillHandler.ts
export class MobileAppKillHandler {
  constructor(
    private sessionCtx: MobileSessionContext,
    private wrapper: MobileEnforceWrapper
  ) { }

  public onAppKilled(): void {
    // Session already revoked by MobileLifecycleWatcher.onKill() (Tier 1)
    // Handler confirms cleanup (no logic)
  }
}
```

**Checklist:**
- [ ] File created at correct path
- [ ] Constructor requires `sessionCtx` and `wrapper` (dependency injection)
- [ ] No `new SessionContext()` inside handler
- [ ] No state variables
- [ ] No try/catch (should not throw — session already revoked)
- [ ] Compiles without errors

#### 1.3: Wire Kill Handler to iOS (AppDelegate)
```swift
// src/os/mobile/ios/AppDelegate.swift
var killHandler: MobileAppKillHandler?

func application(... didFinishLaunching ...) -> Bool {
  let sessionCtx = MobileSessionContext()
  let watcher = MobileLifecycleWatcher(sessionCtx)
  let wrapper = MobileEnforceWrapper(sessionCtx, watcher)
  killHandler = MobileAppKillHandler(sessionCtx, wrapper)
  return true
}

func applicationWillTerminate(_ application: UIApplication) {
  lifecycleWatcher?.onKill()
  killHandler?.onAppKilled()
}
```

**Checklist:**
- [ ] AppDelegate calls `onKill()` then handler
- [ ] No new SessionContext created (same instance)
- [ ] Compiles without errors

#### 1.4: Wire Kill Handler to Android (MainActivity)
```kotlin
// src/os/mobile/android/MainActivity.kt
private var killHandler: MobileAppKillHandler? = null

override fun onDestroy() {
  super.onDestroy()
  lifecycleWatcher?.onKill()
  killHandler?.onAppKilled()
}
```

**Checklist:**
- [ ] MainActivity calls `onKill()` then handler
- [ ] No new SessionContext
- [ ] Compiles without errors

#### 1.5: Verify MOB-ACC-10 Tests Pass
```bash
npm test -- MOB-ACC-10
```

**Tests must pass:**
- [ ] `should clear session on app termination`
- [ ] `should not restore state after kill + relaunch`
- [ ] `should hard-fail on old sessionId after app relaunch`
- [ ] `should have zero persistence across kill boundary`

**If any fails:** Debug before moving to Block 2.

---

### Block 2: Deep-Link Handler (6 hours)

#### 2.1: Stub MobileDeepLinkHandler
```typescript
// src/os/mobile/handlers/MobileDeepLinkHandler.ts
export class MobileDeepLinkHandler {
  constructor(
    private sessionCtx: MobileSessionContext,
    private wrapper: MobileEnforceWrapper
  ) { }

  public onDeepLinkEntry(): void {
    // Visual foreground only
    this.sessionCtx.setForeground(true);
    this.audit.emit('MOBILE_DEEP_LINK_ENTRY', {
      timestamp: Date.now()
    });
  }
}
```

**Checklist:**
- [ ] File created at correct path
- [ ] Constructor requires `sessionCtx` and `wrapper`
- [ ] No `new SessionContext()`
- [ ] No `bind()` call (forbidden pattern: auto-bind)
- [ ] Only `setForeground(true)` + audit
- [ ] No caching of sessionId
- [ ] No recovery logic
- [ ] Compiles without errors

#### 2.2: Wire Deep-Link Handler to iOS (SceneDelegate or AppDelegate)
```swift
// src/os/mobile/ios/AppDelegate.swift
var deepLinkHandler: MobileDeepLinkHandler?

func application(_ app: UIApplication, open url: URL,
                 options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
  deepLinkHandler?.onDeepLinkEntry()
  // Parse URL and explicitly bind new session (NOT in handler)
  return true
}
```

**Checklist:**
- [ ] Handler called on deep-link open
- [ ] No SessionContext creation
- [ ] No implicit bind
- [ ] App logic (outside handler) handles explicit rebind
- [ ] Compiles without errors

#### 2.3: Wire Deep-Link Handler to Android (MainActivity)
```kotlin
// src/os/mobile/android/MainActivity.kt
private var deepLinkHandler: MobileDeepLinkHandler? = null

override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  handleDeepLink(intent)
}

private fun handleDeepLink(intent: Intent) {
  deepLinkHandler?.onDeepLinkEntry()
  // Parse intent and explicitly bind new session (NOT in handler)
}
```

**Checklist:**
- [ ] Handler called on deep-link intent
- [ ] No SessionContext creation
- [ ] No implicit bind
- [ ] App logic handles explicit rebind
- [ ] Compiles without errors

#### 2.4: Verify MOB-ACC-11 Tests Pass
```bash
npm test -- MOB-ACC-11
```

**Tests must pass:**
- [ ] `should reject old sessionId after deep-link navigation`
- [ ] `should require explicit rebind after deep-link transition`
- [ ] `should not allow implicit authority on deep-link tap alone`
- [ ] `should require sessionId mismatch rejection on deep-link path`

**If any fails:** Debug before moving to Block 3.

---

### Block 3: Notification Handler (6 hours)

#### 3.1: Stub MobileNotificationHandler
```typescript
// src/os/mobile/handlers/MobileNotificationHandler.ts
export class MobileNotificationHandler {
  constructor(
    private sessionCtx: MobileSessionContext,
    private wrapper: MobileEnforceWrapper
  ) { }

  public onNotificationTap(): void {
    // Visual foreground only
    this.sessionCtx.setForeground(true);
    this.audit.emit('MOBILE_NOTIFICATION_ENTRY', {
      timestamp: Date.now()
    });
  }
}
```

**Checklist:**
- [ ] File created at correct path
- [ ] Constructor requires `sessionCtx` and `wrapper`
- [ ] No `new SessionContext()`
- [ ] No `bind()` call (forbidden pattern: auto-bind)
- [ ] Only `setForeground(true)` + audit
- [ ] No caching of sessionId
- [ ] No recovery logic
- [ ] Compiles without errors

#### 3.2: Wire Notification Handler to iOS
```swift
// src/os/mobile/ios/AppDelegate.swift
var notificationHandler: MobileNotificationHandler?

func userNotificationCenter(_ center: UNUserNotificationCenter,
                          didReceive response: UNNotificationResponse,
                          withCompletionHandler completionHandler: @escaping () -> Void) {
  notificationHandler?.onNotificationTap()
  // Handle notification action and explicitly bind (NOT in handler)
  completionHandler()
}
```

**Checklist:**
- [ ] Handler called on notification tap
- [ ] No SessionContext creation
- [ ] No implicit bind
- [ ] App logic handles explicit rebind
- [ ] Compiles without errors

#### 3.3: Wire Notification Handler to Android
```kotlin
// src/os/mobile/android/MainActivity.kt
private var notificationHandler: MobileNotificationHandler? = null

override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  handleNotificationIntent(intent)
}

private fun handleNotificationIntent(intent: Intent) {
  if (intent.hasExtra("notification_source")) {
    notificationHandler?.onNotificationTap()
    // Handle notification action and explicitly bind (NOT in handler)
  }
}
```

**Checklist:**
- [ ] Handler called on notification tap
- [ ] No SessionContext creation
- [ ] No implicit bind
- [ ] App logic handles explicit rebind
- [ ] Compiles without errors

#### 3.4: Verify MOB-ACC-12 Tests Pass
```bash
npm test -- MOB-ACC-12
```

**Tests must pass:**
- [ ] `should not restore authority on notification tap`
- [ ] `should require explicit rebind after notification tap`
- [ ] `should distinguish foreground state from authority binding`
- [ ] `should not allow notification-sourced authority bypass`

**If any fails:** Debug before moving to Block 4.

---

### Block 4: Adapter Routing & Integration (6 hours)

#### 4.1: Update MobileLifecycleAdapter
```typescript
// src/os/mobile/MobileLifecycleAdapter.ts
export class MobileLifecycleAdapter {
  constructor(
    private sessionCtx: MobileSessionContext,
    private watcher: MobileLifecycleWatcher,
    private wrapper: MobileEnforceWrapper,
    private killHandler: MobileAppKillHandler,
    private deepLinkHandler: MobileDeepLinkHandler,
    private notificationHandler: MobileNotificationHandler
  ) { }

  public onKill(): void {
    this.watcher.onKill();
    this.killHandler.onAppKilled();
  }

  public onDeepLinkEntry(): void {
    this.deepLinkHandler.onDeepLinkEntry();
  }

  public onNotificationTap(): void {
    this.notificationHandler.onNotificationTap();
  }
}
```

**Checklist:**
- [ ] All handlers injected (no `new` keyword)
- [ ] Routing methods call handlers in correct order
- [ ] No logic beyond delegation
- [ ] Compiles without errors

#### 4.2: Singleton Enforcement Verification
```bash
npm test -- "should enforce singleton SessionContext"
```

**Checklist:**
- [ ] Same SessionContext instance used everywhere
- [ ] No shadow contexts created
- [ ] State changes visible across all components
- [ ] Test passes

#### 4.3: Run Full MOB-ACC Suite (1-12)
```bash
npm test -- "MOB-ACC"
```

**All tests must pass:**
- [ ] MOB-ACC-01 through MOB-ACC-09 (Tiers 0-1)
- [ ] MOB-ACC-10 (Kill)
- [ ] MOB-ACC-11 (Deep-link)
- [ ] MOB-ACC-12 (Notification)

**If any fails:** Debug before moving to Block 5.

---

### Block 5: Pre-Attack Simulation (6 hours)

#### 5.1: Run MOB-PR-004 Ghost Pre-Attack Tests
```bash
npm test -- "MOB-PR-004_Ghost_Pre_Attack"
```

**All 7 attack vectors must FAIL (attacks must be blocked):**
- [ ] ATTACK 1: Kill Resurrection (fails ✓)
- [ ] ATTACK 2: Deep-Link Implicit Authority (fails ✓)
- [ ] ATTACK 3: Notification Implicit Authority (fails ✓)
- [ ] ATTACK 4: Session Bleed via Edges (fails ✓)
- [ ] ATTACK 5: onForeground Auto-Restore (fails ✓)
- [ ] ATTACK 6: Foreground-Authority Coupling (fails ✓)
- [ ] ATTACK 7: Notification Bypass (fails ✓)

**If any succeeds:** Handler has a bypass — debug before proceeding.

#### 5.2: Forbidden Pattern Audit (Code Review)
```bash
grep -r "new SessionContext()" src/os/mobile/handlers/
grep -r "\.bind(" src/os/mobile/handlers/
grep -r "this\.sessionId =" src/os/mobile/handlers/
grep -r "static.*sessionId" src/os/mobile/handlers/
grep -r "savedState" src/os/mobile/handlers/
```

**All should return zero results:**
- [ ] No `new SessionContext()` in handlers
- [ ] No `bind()` calls in handlers
- [ ] No caching of sessionId
- [ ] No static vars holding sessions
- [ ] No persistence to savedState

#### 5.3: Type Safety Check
```bash
npx tsc --strict --noImplicitAny
```

**Checklist:**
- [ ] All sessionId parameters are `string` (not optional)
- [ ] No implicit `any` types
- [ ] Constructor injection fully typed
- [ ] Zero TypeScript errors

---

### Block 6: Final Verification & PR Prep (6 hours)

#### 6.1: Complete Test Suite
```bash
npm test
```

**All tests pass:**
- [ ] MOB-ACC-01 through MOB-ACC-12 (21 tests)
- [ ] MOB-PR-004_Ghost_Pre_Attack.test.ts (7 vectors)
- [ ] No regressions in Tier 0-2 tests
- [ ] No new test failures

#### 6.2: Compiler Verification
```bash
npm run build
```

**Checklist:**
- [ ] TypeScript compiles (zero errors)
- [ ] No warnings
- [ ] All imports resolved
- [ ] iOS stubs compile (type checking only, if available)
- [ ] Android stubs compile (type checking only, if available)

#### 6.3: Code Review Checklist
- [ ] All handler files reviewed for forbidden patterns
- [ ] No auto-bind logic
- [ ] No persistence logic
- [ ] No recovery logic
- [ ] No conditional state management
- [ ] Handlers are 20-30 lines max (thin)

#### 6.4: Audit Trail Verification
```bash
npm test -- "should emit audit events"
```

**Checklist:**
- [ ] Deep-link entry emits `MOBILE_DEEP_LINK_ENTRY`
- [ ] Notification entry emits `MOBILE_NOTIFICATION_ENTRY`
- [ ] Kill confirmation emits (if needed)
- [ ] No silent paths

#### 6.5: Ghost Checkpoints Verification
- [ ] Handler signatures match MOB_PR_004_DEFINITION_OF_DONE.md
- [ ] No scope creep (no Tier 4+ logic)
- [ ] All forbidden patterns absent
- [ ] All MOB-ACC tests pass
- [ ] All pre-attack vectors fail

#### 6.6: Documentation Update
- [ ] Add inline comments to handlers (link to tests)
- [ ] Update README with Tier 3 scope
- [ ] Verify PHASE_7_MOB_PR_004_GHOST_REVIEW_CHECKLIST.md aligns

#### 6.7: Prepare Commit
```bash
git add src/os/mobile/handlers/
git add src/os/mobile/ios/
git add src/os/mobile/android/
git add src/os/mobile/MobileLifecycleAdapter.ts
```

**Checklist:**
- [ ] All handler files staged
- [ ] All wiring files staged
- [ ] No accidental test modifications
- [ ] Commit message ready: "Tier 3: App Kill, Deep-Link, Notification Handlers"

---

## Success Criteria (FINAL)

✅ **MOB-PR-004 is READY TO SUBMIT if:**
- All MOB-ACC-01 through MOB-ACC-12 pass
- All 7 pre-attack vectors fail (attacks blocked)
- Zero forbidden patterns
- Zero test modifications
- All handlers < 50 lines (thin)
- All handlers have injection (no `new`)
- All handlers do NOT bind or cache
- TypeScript compiles (zero errors)
- Audit trail complete
- No Ghost warnings

❌ **MOB-PR-004 is BLOCKED if:**
- Any MOB-ACC test fails
- Any pre-attack vector succeeds
- Forbidden patterns found
- Auto-bind or recovery logic detected
- Foreground-authority coupling found
- Persistence detected (ViewModel, savedState, static)

---

## 48-Hour Breakdown

```
Block 1 (6h):  Setup + App Kill Handler        (MOB-ACC-10 passes)
Block 2 (6h):  Deep-Link Handler               (MOB-ACC-11 passes)
Block 3 (6h):  Notification Handler            (MOB-ACC-12 passes)
Block 4 (6h):  Adapter Routing + Integration   (All MOB-ACC passes)
Block 5 (6h):  Pre-Attack Simulation           (All attacks blocked)
Block 6 (6h):  Final Verification + PR Prep    (Ready to submit)
─────────────────────────────────────────────────────
Total:         48 hours
```

**Rest between blocks (highly recommended).**

---

**This checklist is law. Follow it exactly. Deviation = delays.**

**When you finish Block 6, MOB-PR-004 is ready for Ghost review. No further work needed.**
