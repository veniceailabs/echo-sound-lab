# PHASE_7B_MOBILE_ACCEPTANCE_TESTS.md

Status: AUTHORITATIVE
Scope: Mobile (iOS + Android)
Phase: 7B
Methodology: Adversarial-First
Rule: Tests are law. Never loosened.

---

## TEST HARNESS ASSUMPTIONS

- MobileSessionContext is injectable
- MobileLifecycleWatcher is mockable
- MobileLifecycleAdapter is the only entry point
- No background execution allowed
- All lifecycle events are simulated explicitly
- Audit logger is observable

---

## MOB-ACC-01 — Background Revokes Session

**Blocks:** MOB-T01, MOB-T09

**Given**
- App is in foreground
- sessionCtx.bind("S1") called
- Capability enforcement succeeds

**When**
- lifecycleWatcher.onApplicationDidEnterBackground() (iOS)
- OR lifecycleWatcher.onActivityStopped() (Android)

**Then**
- sessionCtx.get() === null
- Any enforceCapability() throws [OS_HARD_STOP]
- Audit emits:
  - MOBILE_SESSION_REVOKED
  - MOBILE_APP_BACKGROUND

---

## MOB-ACC-02 — Screen Lock Revokes Authority

**Blocks:** MOB-T07

**Given**
- App foregrounded
- sessionCtx.bind("S1")

**When**
- lifecycleWatcher.onScreenLockDetected()

**Then**
- sessionCtx.get() === null
- Accessibility + file + export all revoked
- Audit emits:
  - MOBILE_SCREEN_LOCK_DETECTED
  - MOBILE_SESSION_REVOKED

---

## MOB-ACC-03 — Notification Tap Does NOT Resume Authority

**Blocks:** MOB-T02

**Given**
- App backgrounded
- No active session

**When**
- Notification tap simulated
- App resumes visually

**Then**
- sessionCtx.get() === null
- No capability enforcement allowed
- Any enforceCapability() throws [OS_HARD_STOP]
- Audit emits:
  - MOBILE_NOTIFICATION_TAP
  - MOBILE_AUTHORITY_NOT_RESUMED

---

## MOB-ACC-04 — Deep Link Requires New Session Bind

**Blocks:** MOB-T03

**Given**
- Old session "S1" revoked
- App launched via deep link

**When**
- lifecycleAdapter.onDeepLink(url, "S1")

**Then**
- sessionCtx.assert("S1") fails
- New sessionId required
- No authority until explicit bind
- Audit emits:
  - MOBILE_DEEPLINK_RECEIVED
  - MOBILE_SESSION_REBIND_REQUIRED

---

## MOB-ACC-05 — OS Kill Clears All Authority

**Blocks:** MOB-T04, MOB-T10

**Given**
- sessionCtx.bind("S1")
- Accessibility + export active

**When**
- lifecycleWatcher.onApplicationWillTerminate()
- OR lifecycleWatcher.onActivityDestroyed()

**Then**
- All gate revokeAllPermissions() called
- sessionCtx.get() === null
- Relaunch does NOT restore authority
- Audit emits:
  - MOBILE_APP_TERMINATED
  - MOBILE_SESSION_REVOKED

---

## MOB-ACC-06 — Accessibility Expires on Blur

**Blocks:** MOB-T05, MOB-T06

**Given**
- App foregrounded
- Accessibility granted for SAFE field
- sessionCtx.bind("S1")

**When**
- lifecycleWatcher.onApplicationWillResignActive()
- OR lifecycleWatcher.onActivityPaused()

**Then**
- Accessibility enforcement denied
- Any further text input throws [OS_HARD_STOP]
- Audit emits:
  - MOBILE_ACCESSIBILITY_REVOKED
  - MOBILE_APP_BLURRED

---

## MOB-ACC-07 — No Background Execution Allowed

**Blocks:** MOB-T08

**Given**
- App backgrounded

**When**
- Any background task / service attempts logic execution

**Then**
- Execution denied
- sessionCtx.assert() fails
- Audit emits:
  - MOBILE_BACKGROUND_EXECUTION_BLOCKED

---

## MOB-ACC-08 — Lifecycle Audit Is Exhaustive

**Blocks:** MOB-T09, MOB-T12

**Given**
- App transitions through: foreground → blur → background → foreground → lock → kill

**Then**
- Audit log contains entries for:
  - foreground
  - blur
  - background
  - screen lock
  - terminate
  - revoke
- No silent transitions allowed

---

## MOB-ACC-09 — No Silent Resume Ever

**Blocks:** MOB-T01, MOB-T12

**Given**
- Any revoked state (background, lock, kill)

**When**
- App becomes visible again

**Then**
- sessionCtx.get() === null
- Explicit bind required
- Any enforcement without bind throws [OS_HARD_STOP]
- Audit emits:
  - MOBILE_RESUME_WITHOUT_AUTHORITY

---

## GLOBAL ASSERTIONS (ALL TESTS)

- ❌ No persistence (disk, ViewModel, savedState, env)
- ❌ No background execution
- ❌ No implicit authority restoration
- ✅ Enforcement order:
  1. throwIfNotInForeground
  2. sessionCtx.assert
  3. logic
- ✅ Every decision audited

---

## LOCK CONDITION

Phase 7B is considered PASSING only if:
- 9 / 9 MOB-ACC tests hard-pass
- No test loosened
- Ghost re-attack finds no new vectors

---

**PHASE 7B MOBILE ACCEPTANCE TESTS: AUTHORITATIVE**

Tests are law. Never loosened. This is trust as a system primitive.
