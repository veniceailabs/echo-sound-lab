# 👻 MOB-PR-004 Ghost Review Checklist (PHASE 7)

Status: **BINARY VERDICT** — PASS or BLOCK (no negotiation)
Scope: Tier 3 handlers (kill, deep-link, notification)
Enforcement: Strict adherence to MOB_PR_004_DEFINITION_OF_DONE.md

---

## Ghost's Review Posture

🔒 **Rule:** Tests are law. Attacks must fail. Code deviations = automatic block.

No exceptions. No waivers. No "close enough."

---

## Pre-Review Checklist (Ghost Preparation)

### Files to Review
- [ ] `MOB_PR_004_DEFINITION_OF_DONE.md` (spec reference)
- [ ] `src/os/mobile/handlers/MobileAppKillHandler.ts`
- [ ] `src/os/mobile/handlers/MobileDeepLinkHandler.ts`
- [ ] `src/os/mobile/handlers/MobileNotificationHandler.ts`
- [ ] `src/os/mobile/MobileLifecycleAdapter.ts` (updated routing)
- [ ] `src/os/mobile/ios/AppDelegate.swift` (wiring)
- [ ] `src/os/mobile/android/MainActivity.kt` (wiring)

### Tests to Execute
- [ ] `npm test -- "MOB-ACC"`
- [ ] `npm test -- "MOB-PR-004_Ghost_Pre_Attack"`
- [ ] `npm run build` (TypeScript compiler)

### Attack Vectors to Probe (from pre-attack test)
- [ ] ATTACK 1: Kill Resurrection
- [ ] ATTACK 2: Deep-Link Implicit Authority
- [ ] ATTACK 3: Notification Implicit Authority
- [ ] ATTACK 4: Session Bleed
- [ ] ATTACK 5: onForeground Auto-Restore
- [ ] ATTACK 6: Foreground-Authority Coupling
- [ ] ATTACK 7: Notification Bypass

---

## Phase 1: Test Execution (Automated)

### MOB-ACC Suite
```bash
npm test -- "MOB-ACC"
```

**Required Results:**
- [ ] MOB-ACC-01 through MOB-ACC-09: PASS (Tiers 0-1, baseline)
- [ ] MOB-ACC-10: PASS (Kill = total death)
- [ ] MOB-ACC-11: PASS (Deep-link = foreground only)
- [ ] MOB-ACC-12: PASS (Notification = foreground only)

**If ANY test fails:** ❌ BLOCK PR immediately. No code review needed.

### Pre-Attack Simulation
```bash
npm test -- "MOB-PR-004_Ghost_Pre_Attack"
```

**Required Results:**
- [ ] ATTACK 1 (Kill Resurrection): FAIL ✓
- [ ] ATTACK 2 (Deep-Link Implicit Auth): FAIL ✓
- [ ] ATTACK 3 (Notification Implicit Auth): FAIL ✓
- [ ] ATTACK 4 (Session Bleed): FAIL ✓
- [ ] ATTACK 5 (onForeground Auto-Restore): FAIL ✓
- [ ] ATTACK 6 (Foreground Coupling): FAIL ✓
- [ ] ATTACK 7 (Notification Bypass): FAIL ✓

**If ANY attack succeeds:** ❌ BLOCK PR immediately. Bypass found.

### TypeScript Compiler
```bash
npm run build
```

**Required Results:**
- [ ] Zero errors
- [ ] Zero warnings
- [ ] All imports resolved

**If errors found:** ❌ BLOCK PR immediately.

---

## Phase 2: Code Review (Manual)

### MobileAppKillHandler Review

**File:** `src/os/mobile/handlers/MobileAppKillHandler.ts`

#### Structural Review
- [ ] Class exists (no extra static methods)
- [ ] Constructor requires `sessionCtx: MobileSessionContext`
- [ ] Constructor requires `wrapper: MobileEnforceWrapper`
- [ ] No `new SessionContext()` anywhere
- [ ] No `new MobileLifecycleWatcher()` anywhere

#### Method: onAppKilled()
- [ ] Method exists (public)
- [ ] Method takes no parameters (or minimal)
- [ ] Method is 5-15 lines max (thin)
- [ ] Method does NOT call `sessionCtx.bind()`
- [ ] Method does NOT call `sessionCtx.revoke()`
- [ ] Method does NOT attempt to recover session
- [ ] Method does NOT cache sessionId
- [ ] Method does NOT check `isInForeground()`
- [ ] Method does NOT make decisions about state

**Audit:**
- [ ] Emits audit event (optional, but if present: `MOBILE_APP_KILL_CONFIRMED`)
- [ ] Audit is informational only (not decision-making)

**Ghost Question:** What does this handler do?
**Expected Answer:** "Confirms Tier 1 revocation (no logic)."

**Red Flag:** If answer is anything else, ❌ BLOCK.

---

### MobileDeepLinkHandler Review

**File:** `src/os/mobile/handlers/MobileDeepLinkHandler.ts`

#### Structural Review
- [ ] Class exists
- [ ] Constructor requires `sessionCtx: MobileSessionContext`
- [ ] Constructor requires `wrapper: MobileEnforceWrapper`
- [ ] No `new SessionContext()`
- [ ] No static cache of sessionId
- [ ] No class-level sessionId storage

#### Method: onDeepLinkEntry()
- [ ] Method exists (public)
- [ ] Method takes no parameters (or minimal)
- [ ] Method is 5-15 lines max (thin)
- [ ] **FIRST LINE:** `this.sessionCtx.setForeground(true)`
- [ ] No `bind()` call anywhere
- [ ] No `revoke()` call anywhere
- [ ] No condition logic (`if`/`else`)
- [ ] No loop logic
- [ ] No cache lookups
- [ ] No recovery attempts
- [ ] No implicit authority grant

**Audit:**
- [ ] Emits `MOBILE_DEEP_LINK_ENTRY` event
- [ ] Timestamp included
- [ ] No sessionId in audit (not relevant)

**Ghost Question:** How does old sessionId behave after deep-link?
**Expected Answer:** "[OS_PERMISSION_DENIED] on next assert (handler doesn't touch it)."

**Red Flag:** If answer mentions "restored", "auto-bind", "cache", ❌ BLOCK.

---

### MobileNotificationHandler Review

**File:** `src/os/mobile/handlers/MobileNotificationHandler.ts`

#### Structural Review
- [ ] Class exists
- [ ] Constructor requires `sessionCtx: MobileSessionContext`
- [ ] Constructor requires `wrapper: MobileEnforceWrapper`
- [ ] No `new SessionContext()`
- [ ] No static cache of sessionId
- [ ] No class-level sessionId storage

#### Method: onNotificationTap()
- [ ] Method exists (public)
- [ ] Method takes no parameters (or minimal)
- [ ] Method is 5-15 lines max (thin)
- [ ] **FIRST LINE:** `this.sessionCtx.setForeground(true)`
- [ ] No `bind()` call anywhere
- [ ] No `revoke()` call anywhere
- [ ] No condition logic (`if`/`else`)
- [ ] No loop logic
- [ ] No cache lookups
- [ ] No recovery attempts
- [ ] No implicit authority grant

**Audit:**
- [ ] Emits `MOBILE_NOTIFICATION_ENTRY` event
- [ ] Timestamp included
- [ ] No sessionId in audit

**Ghost Question:** If foreground is now true after notification, what about session binding?
**Expected Answer:** "Session binding is unchanged (still null or whatever it was)."

**Red Flag:** If answer mentions "restored", "recovered", "reused", ❌ BLOCK.

---

### MobileLifecycleAdapter Review

**File:** `src/os/mobile/MobileLifecycleAdapter.ts`

#### Constructor Dependency Injection
- [ ] Constructor requires all dependencies (no `new` keyword)
- [ ] Dependencies:
  - [ ] `sessionCtx: MobileSessionContext`
  - [ ] `watcher: MobileLifecycleWatcher`
  - [ ] `wrapper: MobileEnforceWrapper`
  - [ ] `killHandler: MobileAppKillHandler`
  - [ ] `deepLinkHandler: MobileDeepLinkHandler`
  - [ ] `notificationHandler: MobileNotificationHandler`

#### Method: onKill()
- [ ] Calls `this.watcher.onKill()` first (Tier 1 revocation)
- [ ] Calls `this.killHandler.onAppKilled()` second (Tier 3 confirmation)
- [ ] No additional logic

#### Method: onDeepLinkEntry()
- [ ] Calls `this.deepLinkHandler.onDeepLinkEntry()`
- [ ] No additional logic

#### Method: onNotificationTap()
- [ ] Calls `this.notificationHandler.onNotificationTap()`
- [ ] No additional logic

**Ghost Question:** Is this adapter doing anything beyond delegation?
**Expected Answer:** "No, it's purely routing to handlers."

**Red Flag:** If logic exists beyond delegation, ❌ BLOCK.

---

### iOS Wiring Review

**File:** `src/os/mobile/ios/AppDelegate.swift`

#### AppDelegate Lifecycle
- [ ] `applicationWillTerminate()` calls:
  - [ ] `lifecycleWatcher?.onKill()` (Tier 1)
  - [ ] `killHandler?.onAppKilled()` (Tier 3)

#### Deep-Link Handling
- [ ] `application(_:open:options:)` implemented
- [ ] Calls `deepLinkHandler?.onDeepLinkEntry()`
- [ ] No auto-bind logic
- [ ] Explicit rebind handled OUTSIDE handler

#### Notification Handling
- [ ] `userNotificationCenter(_:didReceive:withCompletionHandler:)` implemented
- [ ] Calls `notificationHandler?.onNotificationTap()`
- [ ] No auto-bind logic
- [ ] Explicit rebind handled OUTSIDE handler

**Ghost Question:** Could an engineer accidentally bind old sessionId in AppDelegate?
**Expected Answer:** "Only if they explicitly add code outside the handler (not supported by Tier 3)."

**Red Flag:** If handler is called AFTER implicit bind attempt, ❌ BLOCK.

---

### Android Wiring Review

**File:** `src/os/mobile/android/MainActivity.kt`

#### Activity Lifecycle
- [ ] `onDestroy()` calls:
  - [ ] `lifecycleWatcher?.onKill()` (Tier 1)
  - [ ] `killHandler?.onAppKilled()` (Tier 3)

#### Deep-Link Handling
- [ ] `handleDeepLink(intent: Intent)` or similar
- [ ] Calls `deepLinkHandler?.onDeepLinkEntry()`
- [ ] No auto-bind logic
- [ ] Explicit rebind handled OUTSIDE handler

#### Notification Handling
- [ ] Notification tap logic implemented
- [ ] Calls `notificationHandler?.onNotificationTap()`
- [ ] No auto-bind logic
- [ ] Explicit rebind handled OUTSIDE handler

**Ghost Question:** Could an engineer accidentally bind old sessionId in MainActivity?
**Expected Answer:** "Only if they explicitly add code outside the handler (not supported by Tier 3)."

**Red Flag:** If handler is called AFTER implicit bind attempt, ❌ BLOCK.

---

## Phase 3: Forbidden Pattern Audit

### Pattern 1: Auto-Bind Detection
```bash
grep -rn "\.bind(" src/os/mobile/handlers/
```

**Required:** Zero results in handlers

- [ ] No `sessionCtx.bind()` in any handler
- [ ] No `wrapper.bind()` (doesn't exist anyway)
- [ ] No `sessionCtx.rebind()` (doesn't exist anyway)

**If found:** ❌ BLOCK PR.

### Pattern 2: SessionId Caching
```bash
grep -rn "sessionId" src/os/mobile/handlers/
grep -rn "this\.cached" src/os/mobile/handlers/
grep -rn "static.*session" src/os/mobile/handlers/
```

**Required:** No sessionId properties in handlers

- [ ] No `this.sessionId = ...`
- [ ] No `this.cachedSession = ...`
- [ ] No `static sessionId = ...`
- [ ] No `const cachedSession = ...` (at class level)

**If found:** ❌ BLOCK PR.

### Pattern 3: Recovery Logic
```bash
grep -rn "recover" src/os/mobile/handlers/
grep -rn "restore" src/os/mobile/handlers/
grep -rn "resume" src/os/mobile/handlers/
grep -rn "remember" src/os/mobile/handlers/
```

**Required:** Zero results

- [ ] No "recover" logic
- [ ] No "restore" logic
- [ ] No "resume" logic
- [ ] No "remember" logic

**If found:** ❌ BLOCK PR.

### Pattern 4: Foreground-Authority Coupling
```bash
grep -rn "isInForeground()" src/os/mobile/handlers/
grep -rn "if.*isInForeground" src/os/mobile/handlers/
```

**Required:** No foreground checks inside handlers

- [ ] Handlers do NOT check `isInForeground()`
- [ ] Handlers do NOT make decisions based on foreground
- [ ] Only `setForeground(true)` is allowed

**If coupling found:** ❌ BLOCK PR.

### Pattern 5: Persistence Detection
```bash
grep -rn "ViewModel" src/os/mobile/handlers/
grep -rn "savedState" src/os/mobile/handlers/
grep -rn "SharedPreferences" src/os/mobile/handlers/
grep -rn "UserDefaults" src/os/mobile/handlers/
```

**Required:** Zero results

- [ ] No ViewModel access
- [ ] No savedState access
- [ ] No persistent storage
- [ ] No static class-level state

**If found:** ❌ BLOCK PR.

---

## Phase 4: Attack Vector Verification

### ATTACK 1: Kill Resurrection
**Probe:** Can old sessionId be used after kill + relaunch?

```bash
npm test -- "ATTACK 1"
```

**Expected:** FAIL (attack blocked)
- [ ] Old sessionId throws `[OS_PERMISSION_DENIED]`
- [ ] New instance has no session
- [ ] Zero persistence across kill

**If succeeds:** ❌ BLOCK PR.

### ATTACK 2: Deep-Link Implicit Authority
**Probe:** Can engineer auto-bind session on deep-link entry?

```bash
npm test -- "ATTACK 2"
```

**Expected:** FAIL (attack blocked)
- [ ] No auto-bind in handler
- [ ] Old sessionId still rejected
- [ ] Explicit rebind required

**If succeeds:** ❌ BLOCK PR.

### ATTACK 3: Notification Implicit Authority
**Probe:** Can engineer auto-bind session on notification tap?

```bash
npm test -- "ATTACK 3"
```

**Expected:** FAIL (attack blocked)
- [ ] No auto-bind in handler
- [ ] Old sessionId still rejected
- [ ] Explicit rebind required

**If succeeds:** ❌ BLOCK PR.

### ATTACK 4: Session Bleed via Edges
**Probe:** Can session persist through lifecycle edge cases?

```bash
npm test -- "ATTACK 4"
```

**Expected:** FAIL (attack blocked)
- [ ] All revocation paths work
- [ ] No session bleed
- [ ] Consistent enforcement

**If succeeds:** ❌ BLOCK PR.

### ATTACK 5: onForeground Auto-Restore
**Probe:** Can onForeground auto-bind old session?

```bash
npm test -- "ATTACK 5"
```

**Expected:** FAIL (attack blocked)
- [ ] MobileLifecycleWatcher.onForeground() only sets state
- [ ] No bind() in onForeground()

**If succeeds:** ❌ BLOCK PR.

### ATTACK 6: Foreground-Authority Coupling
**Probe:** Can engineer couple foreground to authority decisions?

```bash
npm test -- "ATTACK 6"
```

**Expected:** FAIL (attack blocked)
- [ ] Foreground and authority are independent
- [ ] No decision logic based on foreground

**If succeeds:** ❌ BLOCK PR.

### ATTACK 7: Notification Bypass
**Probe:** Can notification tap bypass revocation?

```bash
npm test -- "ATTACK 7"
```

**Expected:** FAIL (attack blocked)
- [ ] Notification doesn't bypass revocation
- [ ] Old sessionId still rejected
- [ ] Consistent enforcement

**If succeeds:** ❌ BLOCK PR.

---

## Phase 5: Final Verdict

### Passing Criteria (ALL required)
- [ ] ✅ All MOB-ACC-01 through MOB-ACC-12 tests PASS
- [ ] ✅ All 7 pre-attack vectors FAIL (blocked)
- [ ] ✅ TypeScript compiles (zero errors)
- [ ] ✅ Zero forbidden patterns
- [ ] ✅ No auto-bind logic
- [ ] ✅ No persistence
- [ ] ✅ No recovery logic
- [ ] ✅ No foreground-authority coupling
- [ ] ✅ Handler signatures match spec
- [ ] ✅ Dependency injection enforced
- [ ] ✅ Audit trail complete
- [ ] ✅ Scope discipline maintained

### Blocking Criteria (ANY present)
- [ ] ❌ Any MOB-ACC test fails
- [ ] ❌ Any pre-attack vector succeeds
- [ ] ❌ TypeScript errors
- [ ] ❌ Auto-bind pattern found
- [ ] ❌ Persistence detected
- [ ] ❌ Recovery logic detected
- [ ] ❌ Foreground coupling detected
- [ ] ❌ Handler does more than spec
- [ ] ❌ New SessionContext created
- [ ] ❌ Silent failures (no exceptions)

---

## Ghost Verdict Template

```
👻 GHOST REVIEW — MOB-PR-004 (Tier 3 Handlers)

Status: [PASS ✅] or [BLOCK ❌]

Evidence:
  ✅ All MOB-ACC-01 → 12 pass
  ✅ All 7 pre-attack vectors fail (blocked)
  ✅ TypeScript clean (zero errors)
  ✅ Zero forbidden patterns
  ✅ Handler contracts met
  ✅ No scope creep

Verdict:
  [APPROVED for merge] or [BLOCKED - details above]

Reasoning:
  [If PASS: Handlers are thin, passive, and make resurrection impossible]
  [If BLOCK: Specific violation(s) listed above]
```

---

## Notes for Future Reviewers

### Why This Is Strict
- Tier 3 is where most engineers fail
- Auto-bind and recovery are "helpful" patterns that break security
- Foreground-authority coupling is subtle but fatal
- Once resurrection is possible, Tier 4+ becomes trivial to bypass

### Why Attacks Matter
- Pre-attack tests are proactive
- They define what engineers CANNOT do
- Without attacks, engineers find creative bypasses

### Why Tests Are Law
- 21 MOB-ACC tests define the contract
- All must pass, none can be loosened
- Any failure = fundamental misunderstanding of Tier 3

---

**This checklist is binary. PASS or BLOCK. No middle ground.**

**Ghost has spoken.**
