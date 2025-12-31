# PHASE_7_MOBILE_ENFORCEMENT_SPEC.md

Status: LOCK-READY
Methodology: Threat → Spec → Test → Implementation (Adversarial-First)
Parity Target: Windows Phase 4 + Linux Phase 5 invariants, mobile-specific mechanics

---

## 0) Global Mobile Invariants (NON-NEGOTIABLE)

These apply to iOS and Android without exception:

1. ✅ Foreground = authority active
2. ✅ Background = immediate revoke
3. ✅ Screen lock = immediate revoke
4. ✅ OS kill = immediate revoke
5. ✅ Notification tap ≠ resume authority
6. ✅ Deep link = new SessionContext bind
7. ✅ No background execution (services, receivers, tasks)
8. ✅ Accessibility time-bounded + foreground-only
9. ✅ All lifecycle transitions audited

Violation of any invariant ⇒ HARD STOP

---

## 1) Gate Inventory (Mobile)

### MobileSessionContext

Purpose: Single source of truth for session binding (identical to desktop, but mobile-scoped).

Methods:
- `bind(sessionId: string): void`
- `assert(sessionId: string): void` — throws if mismatch
- `revoke(sessionId: string): void` — clears if matched
- `get(): string | null` — returns current sessionId
- `isInForeground(): boolean` — lifecycle state

Contracts:
- Bind once per user interaction
- Assert on every enforce path
- Revoke on background/blur/lock/kill
- Audit all transitions

Blocks:
- MOB-T01 (background persistence)
- MOB-T03 (deep-link reuse)
- MOB-T04 (OS restore)
- MOB-T10 (state persistence)

---

### MobileLifecycleWatcher

Purpose: Monitor app lifecycle and enforce authority revocation.

Methods (iOS):
- `onApplicationDidBecomeActive(): void`
- `onApplicationWillResignActive(): void` — blur event
- `onApplicationDidEnterBackground(): void` — background event
- `onApplicationWillTerminate(): void` — kill event
- `onScreenLockDetected(): void` — screen lock event
- `throwIfNotInForeground(): void` — guard clause

Methods (Android):
- `onActivityResumed(activity: Activity): void` — foreground
- `onActivityPaused(activity: Activity): void` — blur
- `onActivityStopped(activity: Activity): void` — background
- `onActivityDestroyed(activity: Activity): void` — kill
- `onScreenLockDetected(): void` — screen lock
- `throwIfNotInForeground(): void` — guard clause

Contracts (iOS):
```
// didBecomeActive: Authority resumes (if fresh bind)
// willResignActive: Revoke authority
// didEnterBackground: Immediate revoke (do not defer)
// willTerminate: Total cleanup
// screenLockDetected: Immediate revoke
```

Contracts (Android):
```
// onActivityResumed: Authority resumes (if fresh bind)
// onActivityPaused: Revoke authority
// onActivityStopped: Immediate revoke (before pause completes)
// onActivityDestroyed: Total cleanup
// screenLockDetected: Immediate revoke (via BroadcastReceiver)
```

Blocks:
- MOB-T01 (background persistence)
- MOB-T02 (notification resume)
- MOB-T07 (screen lock gap)
- MOB-T08 (background service)
- MOB-T09 (lifecycle desync)

---

### MobileAccessibilityGate

Purpose: TEXT_INPUT + UI automation enforcement with accessibility hardening.

Methods:
- `enforceTextInput(request: TextInputRequest): void`
  - Line 1: `throwIfNotInForeground()`
  - Line 2: `sessionCtx.assert(request.sessionId)`
  - Line 3: Field classification check (SENSITIVE hard-deny, UNKNOWN ACC-required, SAFE permit)
  - Audit: grant/deny/hard-stop paths

- `enforceUINavigation(request: UINavigationRequest): void`
  - Line 1: `throwIfNotInForeground()`
  - Line 2: `sessionCtx.assert(request.sessionId)`
  - Line 3: Window identity check (if applicable)
  - Audit: all paths

- `revokeAllPermissions(): void`
  - Clear accessibility service state
  - Emit audit: `MOBILE_ACCESSIBILITY_REVOKED`

Contracts:
- Accessibility services are time-bounded
- No persistent state across sessions
- SENSITIVE fields hard-deny (throw `[OS_HARD_STOP]`)
- UNKNOWN fields deny + require ACC
- Audit on every path (grant/deny/hard-stop)

Blocks:
- MOB-T05 (accessibility linger)
- MOB-T06 (app-switch race)
- MOB-T12 (silent resume)

---

### MobileLifecycleAdapter (Router)

Purpose: Central dispatch for all mobile enforce paths + total revocation.

Methods:
- `enforceCapability(capability: Capability, request: Request): void`
  - Route all 6 capabilities (UI_NAVIGATION, TEXT_INPUT, PARAMETER_ADJUSTMENT, FILE_READ, FILE_WRITE, RENDER_EXPORT)
  - Same order as desktop (freeze first, session second, logic third)

- `onApplicationStateChange(state: 'foreground' | 'background' | 'lock' | 'kill'): void`
  - Dispatch to lifecycleWatcher
  - Trigger session revocation if needed

- `onSessionEnd(sessionId: string): void`
  - Emit audit: `MOBILE_SESSION_ENDING`
  - Call `sessionCtx.revoke(sessionId)`
  - Call all gate `revokeAllPermissions()`
  - Emit audit: `MOBILE_SESSION_ENDED`

- `onDeepLink(uri: String, sessionId: string): void`
  - Do NOT resume authority
  - Create new SessionContext bind
  - Require fresh permission

Contracts:
- No gate bypasses
- Session end is immediate (no grace)
- Deep links require fresh binding
- Notifications are display-only
- No background task execution
- Audit exhaustiveness

Blocks:
- MOB-T02 (notification resume)
- MOB-T03 (deep-link reuse)
- MOB-T11 (push-triggered logic)
- All vectors (total revocation)

---

## 2) Platform-Specific Implementation Details

### iOS-Specific Mechanics

**Lifecycle Hooks (AppDelegate):**

```swift
// Blocks: MOB-T01, MOB-T07, MOB-T09
func applicationDidBecomeActive(_ application: UIApplication) {
  lifecycleWatcher.onApplicationDidBecomeActive()
  // Authority can resume only if fresh session.bind() called
}

// Blocks: MOB-T01, MOB-T07, MOB-T09
func applicationWillResignActive(_ application: UIApplication) {
  lifecycleWatcher.onApplicationWillResignActive()
  sessionCtx.revoke(currentSessionId)
  audit.emit('MOBILE_SESSION_REVOKED')
}

// Blocks: MOB-T01, MOB-T07
func applicationDidEnterBackground(_ application: UIApplication) {
  lifecycleWatcher.onApplicationDidEnterBackground()
  // Immediate revoke (do not defer with UIApplication.shared.beginBackgroundTask)
  sessionCtx.revoke(currentSessionId)
}

// Blocks: MOB-T04
func applicationWillTerminate(_ application: UIApplication) {
  lifecycleWatcher.onApplicationWillTerminate()
  sessionCtx.revoke(currentSessionId)
  // Clear all in-memory state
}
```

**Screen Lock Detection (Notification-based):**

```swift
// Blocks: MOB-T07
NotificationCenter.default.addObserver(
  forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
  object: nil,
  queue: .main
) { _ in
  lifecycleWatcher.onScreenLockDetected()
  sessionCtx.revoke(currentSessionId)
}
```

**Deep Link Handling (SceneDelegate):**

```swift
// Blocks: MOB-T03
func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
  guard let url = userActivity.webpageURL else { return }

  // Do NOT resume authority from old session
  lifecycleAdapter.onDeepLink(url.absoluteString, sessionId: UUID().uuidString)
  // Requires fresh user interaction + session bind
}
```

**Notification Handling (UNUserNotificationCenterDelegate):**

```swift
// Blocks: MOB-T02
func userNotificationCenter(_ center: UNUserNotificationCenter,
                          didReceive response: UNNotificationResponse,
                          withCompletionHandler completionHandler: @escaping () -> Void) {
  // Display-only. Never resume authority.
  // Always require fresh session.bind() for any action
  completionHandler()
}
```

### Android-Specific Mechanics

**Lifecycle Hooks (Activity):**

```kotlin
// Blocks: MOB-T01, MOB-T07, MOB-T09
override fun onResume() {
  super.onResume()
  lifecycleWatcher.onActivityResumed(this)
  // Authority can resume only if fresh session.bind() called
}

// Blocks: MOB-T01, MOB-T07, MOB-T09
override fun onPause() {
  super.onPause()
  lifecycleWatcher.onActivityPaused(this)
  sessionCtx.revoke(currentSessionId)
  audit.emit('MOBILE_SESSION_REVOKED')
}

// Blocks: MOB-T01, MOB-T07
override fun onStop() {
  super.onStop()
  lifecycleWatcher.onActivityStopped(this)
  // Immediate revoke (before onStop completes)
  sessionCtx.revoke(currentSessionId)
}

// Blocks: MOB-T04
override fun onDestroy() {
  super.onDestroy()
  lifecycleWatcher.onActivityDestroyed(this)
  sessionCtx.revoke(currentSessionId)
  // Clear all in-memory state
}
```

**Screen Lock Detection (BroadcastReceiver):**

```kotlin
// Blocks: MOB-T07
val lockReceiver = object : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_SCREEN_OFF) {
      lifecycleWatcher.onScreenLockDetected()
      sessionCtx.revoke(currentSessionId)
    }
  }
}

// Register in onCreate
registerReceiver(lockReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF))
```

**Deep Link Handling (Activity Intent):**

```kotlin
// Blocks: MOB-T03
override fun onNewIntent(intent: Intent) {
  super.onNewIntent(intent)

  val data = intent.data
  if (data != null) {
    // Do NOT resume authority from old session
    lifecycleAdapter.onDeepLink(data.toString(), sessionId = UUID.randomUUID().toString())
    // Requires fresh user interaction + session bind
  }
}
```

**Push Notification Handling (FirebaseMessagingService):**

```kotlin
// Blocks: MOB-T02, MOB-T11
override fun onMessageReceived(remoteMessage: RemoteMessage) {
  // Display notification only. Never execute logic.
  // Never resume authority.
  val notification = remoteMessage.notification
  showNotification(notification?.title, notification?.body)

  // If user taps notification, treated as new deep link
  // Requires fresh session.bind()
}
```

**Task Resurrection Prevention (Manifest):**

```xml
<!-- Blocks: MOB-T08 -->
<activity
  android:name=".MainActivity"
  android:alwaysRetainTaskState="false"
  android:clearTaskOnLaunch="true"
  android:launchMode="singleTop">
</activity>
```

---

## 3) Global Enforcement Order (Identical to Desktop)

Every enforce path must follow this exact order:

1. ✅ `lifecycleWatcher.throwIfNotInForeground()` — FIRST LINE
2. ✅ `sessionCtx.assert(request.sessionId)` — SECOND
3. ✅ Field/path/permission checks — THIRD
4. ✅ Audit emit — EVERY PATH (grant/deny/hard-stop)

No exceptions. No shortcuts.

---

## 4) Acceptance Tests (Skeleton — Authoritative)

| Test | Assertion | Blocks |
|------|-----------|--------|
| MOB-ACC-01 | Background revokes session | MOB-T01, MOB-T09 |
| MOB-ACC-02 | Screen lock revokes | MOB-T07 |
| MOB-ACC-03 | Notification tap denied | MOB-T02 |
| MOB-ACC-04 | Deep link requires new session | MOB-T03 |
| MOB-ACC-05 | OS kill clears authority | MOB-T04, MOB-T10 |
| MOB-ACC-06 | Accessibility expires on blur | MOB-T05, MOB-T06 |
| MOB-ACC-07 | No background execution | MOB-T08 |
| MOB-ACC-08 | Lifecycle audit complete | MOB-T09, MOB-T12 |
| MOB-ACC-09 | No silent resume | MOB-T01, MOB-T12 |

Tests are law. Never loosened.

---

## 5) PR Execution Plan (Mobile — Identical Structure to Windows/Linux)

| PR | Tier | Scope | Tests | Status |
|----|------|-------|-------|--------|
| MOB-PR-001 | 0 | MobileSessionContext + MobileLifecycleWatcher singletons | Foundation only | READY |
| MOB-PR-002 | 1 | Lifecycle freeze enforcement (foreground → background) | MOB-ACC-01, MOB-ACC-02 | WAITING |
| MOB-PR-003 | 2 | Session binding on lifecycle transitions | MOB-ACC-03, MOB-ACC-04 | WAITING |
| MOB-PR-004 | 3 | App kill + restore + deep link binding | MOB-ACC-05 | WAITING |
| MOB-PR-005 | 4 | Accessibility gate + field classification | MOB-ACC-06 | WAITING |
| MOB-PR-006 | 5 | Background service denial + task resurrection prevention | MOB-ACC-07 | WAITING |
| MOB-PR-007 | 6 | Adapter routing + total revocation | MOB-ACC-08, MOB-ACC-09, full suite | WAITING |

Same discipline as Windows/Linux. No deviation.

---

## 6) Lock Criteria (Phase 7 Mobile)

- ✅ 12 vectors blocked
- ✅ 9/9 MOB-ACC hard-pass
- ✅ Zero persistence verified (no ViewModels, savedState, disk, env holding authority)
- ✅ Ghost re-attack yields no new vectors
- ✅ iOS + Android mechanically equivalent

---

## 7) Status

**PHASE 7 MOBILE ENFORCEMENT SPEC: FILED (LOCK-READY)**

Next (when appropriate):
- Phase 7B Mobile Acceptance Tests
- Phase 7 Mobile Implementation (MOB-PR-001 → MOB-PR-007)
- Phase 8 Governance Narrative (after mobile spec complete)

---

**Execution continues with discipline. No drift. No compromise.**
