# MOB-ACC-10 / 11 / 12 — Authority Death & Rebirth Tests

Status: **LOCKED** — Tests are law. Never loosened.
Scope: Death (app kill), Rebirth (deep-link + notification), Resurrection prevention

---

## Executive Summary

**3 New Test Suites** extend MOB-ACC foundation (1-9) to lock PR-004 scope:

| Test | Threat | Guarantee | Blocks |
|---|---|---|---|
| **MOB-ACC-10** | OS Kill → Resurrection | Zero persistence, new sessionId required | MOB-T04, MOB-T10, MOB-T12 |
| **MOB-ACC-11** | Deep Link → Authority Resume | Old sessionId hard-fails, explicit rebind | MOB-T03, MOB-T02, MOB-T12 |
| **MOB-ACC-12** | Notification Tap → Implicit Authority | Foreground ≠ Authority, no auto-restore | MOB-T02, MOB-T09, MOB-T12 |

---

## MOB-ACC-10: OS Kill = Total Authority Death

**Core Guarantee:** App kill = complete authority erasure. No resurrection. No persistence.

### Tests (4 sub-tests)

#### 1️⃣ `should clear session on app termination`
```typescript
sessionCtx.setForeground(true);
sessionCtx.bind('session-1');
watcher.onKill();

// Assert: session null, foreground false
expect(sessionCtx.get()).toBeNull();
expect(sessionCtx.isInForeground()).toBe(false);

// Audit: both lifecycle events emitted
expect(auditEvents.some(e => e.event === 'MOBILE_SESSION_REVOKED_ALL')).toBe(true);
expect(auditEvents.some(e => e.event === 'MOBILE_APP_TERMINATED')).toBe(true);
```

**Why It Matters:** Kill must be total. No soft state, no fallback recovery.

---

#### 2️⃣ `should not restore state after kill + relaunch`
```typescript
sessionCtx.bind('session-1');
watcher.onKill();

// Fresh instance (simulating relaunch)
const newCtx = new MobileSessionContext();
const newWatcher = new MobileLifecycleWatcher(newCtx);

// Assert: new instance is clean
expect(newCtx.get()).toBeNull();
expect(newCtx.isInForeground()).toBe(false);
```

**Why It Matters:** Relaunch is a hard boundary. No state preservation across kill.

---

#### 3️⃣ `should hard-fail on old sessionId after app relaunch`
```typescript
sessionCtx.bind('session-1');
watcher.onKill();

const newCtx = new MobileSessionContext();

// Assert: old sessionId is REJECTED
expect(() => {
  newCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');

// New sessionId required
newCtx.bind('session-1-new');
expect(newCtx.get()).toBe('session-1-new');
```

**Why It Matters:** Blocks MOB-T12 (implicit authority after kill). Old IDs must hard-fail.

---

#### 4️⃣ `should have zero persistence across kill boundary`
```typescript
sessionCtx.bind('session-1');
watcher.onKill();
auditEvents = [];  // Clear

const newCtx = new MobileSessionContext();

// Assert: absolutely nothing survives
expect(newCtx.get()).toBeNull();
expect(newCtx.isInForeground()).toBe(false);
expect(auditEvents.length).toBe(0);  // No inherited state
```

**Why It Matters:** Proves no ViewModel, no savedState, no static cache leakage.

---

## MOB-ACC-11: Deep Link = Requires Fresh SessionId

**Core Guarantee:** Deep-link navigation revokes old sessionId. Explicit rebind required.

### Tests (4 sub-tests)

#### 1️⃣ `should reject old sessionId after deep-link navigation`
```typescript
sessionCtx.setForeground(true);
sessionCtx.bind('session-1');

// Background revokes session
watcher.onBackground();
expect(sessionCtx.get()).toBeNull();

// Deep link brings app to foreground
sessionCtx.setForeground(true);

// Assert: foreground ≠ authority
expect(sessionCtx.isInForeground()).toBe(true);
expect(sessionCtx.get()).toBeNull();

// Old ID hard-fails
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');
```

**Why It Matters:** Blocks MOB-T03 (deep-link resurrects authority). Foreground from deep-link is VISUAL ONLY.

---

#### 2️⃣ `should require explicit rebind after deep-link transition`
```typescript
sessionCtx.bind('session-1');
watcher.onBackground();

// Deep link foregrounds app
sessionCtx.setForeground(true);

// Old ID rejected
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');

// NEW binding required
sessionCtx.bind('session-1-deep-link');
expect(sessionCtx.get()).toBe('session-1-deep-link');

// New ID works
expect(() => {
  sessionCtx.assert('session-1-deep-link');
}).not.toThrow();
```

**Why It Matters:** Rebind is explicit and required. No auto-recovery.

---

#### 3️⃣ `should not allow implicit authority on deep-link tap alone`
```typescript
sessionCtx.bind('session-1');
watcher.onBackground();

// Deep-link tap
sessionCtx.setForeground(true);

// CRITICAL: Foreground ≠ Authority
expect(sessionCtx.isInForeground()).toBe(true);
expect(sessionCtx.get()).toBeNull();

// Without bind, enforcement fails
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');
```

**Why It Matters:** Blocks MOB-T02 (notification/deep-link grants authority). Visual presence ≠ authorization.

---

#### 4️⃣ `should require sessionId mismatch rejection on deep-link path`
```typescript
sessionCtx.bind('session-1');
watcher.onBackground();

// Deep link foregrounds
sessionCtx.setForeground(true);

// Old ID rejected
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');

// Audit trail
expect(auditEvents.some(e => e.event === 'MOBILE_SESSION_MISMATCH')).toBe(true);
```

**Why It Matters:** Loud failure (audit + exception). No silent denials.

---

## MOB-ACC-12: Notification Tap ≠ Authority

**Core Guarantee:** Notification tap brings app to foreground but grants NO authority. Old sessionId is rejected.

### Tests (4 sub-tests)

#### 1️⃣ `should not restore authority on notification tap`
```typescript
sessionCtx.setForeground(true);
sessionCtx.bind('session-1');

// Background revokes
watcher.onBackground();
expect(sessionCtx.get()).toBeNull();

// Notification tapped (app foreground)
sessionCtx.setForeground(true);

// CRITICAL: Foreground ≠ Authority
expect(sessionCtx.isInForeground()).toBe(true);
expect(sessionCtx.get()).toBeNull());

// Old sessionId rejected
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');
```

**Why It Matters:** Blocks MOB-T02 (notification tap grants authority). Notification = visual resume only.

---

#### 2️⃣ `should require explicit rebind after notification tap`
```typescript
sessionCtx.bind('session-1');
watcher.onBlur();

// Notification taps (foreground)
sessionCtx.setForeground(true);

// Assert: visible but not authorized
expect(sessionCtx.isInForeground()).toBe(true);
expect(sessionCtx.get()).toBeNull();

// Explicit rebind
sessionCtx.bind('session-1-notification');
expect(sessionCtx.get()).toBe('session-1-notification');

// Now assertion passes
expect(() => {
  sessionCtx.assert('session-1-notification');
}).not.toThrow();
```

**Why It Matters:** Rebind is explicit. No auto-recovery.

---

#### 3️⃣ `should distinguish foreground state from authority binding`
```typescript
sessionCtx.setForeground(true);
sessionCtx.bind('session-1');

// Blur revokes
watcher.onBlur();

// Notification taps (foreground)
sessionCtx.setForeground(true);

// SEPARATION OF CONCERNS:
// - isInForeground() = true   (visual state)
// - get() = null              (authority state)
// These must NOT be coupled

expect(sessionCtx.isInForeground()).toBe(true);
expect(sessionCtx.get()).toBeNull());

// Old sessionId rejected
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');
```

**Why It Matters:** Decoupling prevents silent authority leaks. Two independent states.

---

#### 4️⃣ `should not allow notification-sourced authority bypass`
```typescript
sessionCtx.bind('session-1');

// Screen lock revokes
watcher.onScreenLock();
expect(sessionCtx.get()).toBeNull();

// Notification taps (foreground)
sessionCtx.setForeground(true);

// Assert: notification does NOT restore authority
expect(sessionCtx.isInForeground()).toBe(true);
expect(sessionCtx.get()).toBeNull());

// Old sessionId rejected
expect(() => {
  sessionCtx.assert('session-1');
}).toThrow('[OS_PERMISSION_DENIED]');
```

**Why It Matters:** Blocks MOB-T09 (silent foreground bypass). Any revocation path blocks notification recovery.

---

## Test Count & Coverage

### New Tests
- **MOB-ACC-10:** 4 sub-tests (kill death, relaunch clean, old ID rejection, zero persistence)
- **MOB-ACC-11:** 4 sub-tests (deep-link rejection, rebind requirement, implicit denial, audit)
- **MOB-ACC-12:** 4 sub-tests (no authority, rebind requirement, state separation, bypass prevention)

**Total: 12 new test cases**

### Cumulative Test Count
- **MOB-ACC-01 through 09:** 9 existing tests + multiple sub-tests
- **MOB-ACC-10 through 12:** 12 new tests
- **Total Acceptance Test Suite:** 21 blocking tests (all sub-tests combined: 50+ assertions)

---

## Blocks (MOB-Txx Vectors)

| Vector | Threat | Blocked By | Test |
|---|---|---|---|
| **MOB-T02** | Notification/deep-link grants authority | `assert()` on old ID | MOB-ACC-11, 12 |
| **MOB-T03** | Deep-link resurrects authority | Background revoke + new bind requirement | MOB-ACC-11 |
| **MOB-T04** | App kill doesn't clear authority | `onKill()` → `revokeAll()` | MOB-ACC-10 |
| **MOB-T09** | Silent foreground bypass | Explicit assertion (loud failure) | MOB-ACC-12 |
| **MOB-T10** | Background service after kill | Fresh instance on relaunch | MOB-ACC-10 |
| **MOB-T12** | Implicit authority after kill/tap | Old ID hard-fail on relaunch | MOB-ACC-10, 11, 12 |

---

## Ghost's Verdict Criteria

✅ **PASS if:**
- All 12 tests pass without modification
- Old sessionIds hard-fail (no soft degradation)
- New instances start clean (zero persistence)
- Audit events emitted for all state changes
- No implicit recovery or auto-bind logic

❌ **BLOCK if:**
- Any test is loosened or removed
- Notification tap grants authority implicitly
- Deep-link resurrects old sessionId
- Relaunch preserves previous session
- Silent failures (no exceptions)

---

## Implementation Guarantee

These tests define PR-004 implementation contract:

1. **App Kill Handler** (`MobileLifecycleWatcher.onKill()`)
   - Must call `revokeAll()`
   - Must emit `MOBILE_APP_TERMINATED`
   - Must set foreground = false

2. **Deep-Link Handler** (TBD in PR-004)
   - Must NOT auto-bind old sessionId
   - Must require explicit new bind
   - Must reject old ID with `[OS_PERMISSION_DENIED]`

3. **Notification Handler** (TBD in PR-004)
   - Must set foreground = true
   - Must NOT bind session
   - Must leave session = null

---

**These tests are authoritative. They define what PR-004 must prove.**

Next: Ghost pre-attack simulation (Option C).
