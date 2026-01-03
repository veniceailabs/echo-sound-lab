# MOB-PR-004 — TIER 3 AUTHORITY DEATH & REBIRTH (Definition of Done)

Status: **TIER 3 ENFORCEMENT HANDLERS**
Scope: App kill, deep-link entry, notification entry
Blocks: MOB-T02, MOB-T03, MOB-T04, MOB-T09, MOB-T10, MOB-T12

---

## What This PR Delivers

**3 Entry-Point Handlers:**
- `MobileAppKillHandler` — App termination (OS kill)
- `MobileDeepLinkHandler` — Deep-link navigation entry
- `MobileNotificationHandler` — Notification tap entry

**Updated Routing:**
- `MobileLifecycleAdapter` — Wire handlers to lifecycle events
- All handlers use `MobileEnforceWrapper` from MOB-PR-003

**Guarantees:**
- Kill = total authority erasure (no resurrection)
- Deep-link = foreground only (no auto-bind)
- Notification = foreground only (no auto-bind)
- Old sessionIds = always rejected

**What This PR Does NOT Include:**
- ❌ No accessibility gate
- ❌ No file access rules
- ❌ No export job controller
- ❌ No state persistence
- ❌ No "helpful" auto-bind logic
- ❌ No retry or recovery heuristics

---

## Non-Negotiable Invariants (Locked)

### Kill Boundary (MOB-ACC-10)
- App kill → immediate `revokeAll()`
- Relaunch = fresh `SessionContext` instance
- Old sessionId = `[OS_PERMISSION_DENIED]` immediately
- Zero state persistence (no ViewModel, savedState, static cache)

### Deep-Link Boundary (MOB-ACC-11)
- Deep-link entry = `setForeground(true)` only
- Deep-link entry ≠ `bind()` (never)
- Deep-link entry ≠ implicit authority grant
- Old sessionId = `[OS_PERMISSION_DENIED]` immediately
- New sessionId = required for enforcement

### Notification Boundary (MOB-ACC-12)
- Notification tap = `setForeground(true)` only
- Notification tap ≠ `bind()` (never)
- Notification tap ≠ implicit authority grant
- Old sessionId = `[OS_PERMISSION_DENIED]` immediately
- Foreground ≠ authority (completely decoupled)

---

## Definition of Done (Non-Negotiable)

### Code Quality
- ✅ TypeScript compiles (zero errors)
- ✅ No warnings
- ✅ All imports resolved

### Handler Contracts (1:1 Mapped to MOB-ACC Tests)

**MobileAppKillHandler**
- ✅ Called on `watcher.onKill()`
- ✅ Does NOT create new SessionContext (singleton injected)
- ✅ Does NOT attempt to "save state"
- ✅ Does NOT auto-bind or cache session
- ✅ Behavior: Session already revoked by Tier 1 (`MobileLifecycleWatcher.onKill()`)
- ✅ Handler responsibility: Clean up any temporary state (if any)
- ✅ Emits: Audit event (already emitted by watcher, handler confirms)
- ✅ Test Proof: MOB-ACC-10 tests pass

**MobileDeepLinkHandler**
- ✅ Called on deep-link entry (before any UI logic)
- ✅ Sets: `setForeground(true)` (visual foreground)
- ✅ Does NOT: Call `bind()` (no auto-bind)
- ✅ Does NOT: Cache or recover old sessionId
- ✅ Does NOT: Attempt implicit authority grant
- ✅ Returns: Clean foreground state only
- ✅ Subsequent operation: App must call `sessionCtx.bind(newSessionId)` explicitly
- ✅ Audit: Handler emits `MOBILE_DEEP_LINK_ENTRY` (optional, for trail)
- ✅ Test Proof: MOB-ACC-11 tests pass

**MobileNotificationHandler**
- ✅ Called on notification tap entry
- ✅ Sets: `setForeground(true)` (visual foreground)
- ✅ Does NOT: Call `bind()` (no auto-bind)
- ✅ Does NOT: Cache or recover old sessionId
- ✅ Does NOT: Attempt implicit authority grant
- ✅ Returns: Clean foreground state only
- ✅ Subsequent operation: App must call `sessionCtx.bind(newSessionId)` explicitly
- ✅ Audit: Handler emits `MOBILE_NOTIFICATION_ENTRY` (optional, for trail)
- ✅ Test Proof: MOB-ACC-12 tests pass

### Enforcement Order (From MOB-PR-003)
- ✅ All operations using `MobileEnforceWrapper`
- ✅ Pattern: `throwIfNotInForeground()` → `sessionCtx.assert(sessionId)` → logic
- ✅ No exceptions to this order

### Audit Coverage
- ✅ Kill handler confirms lifecycle audit trail
- ✅ Deep-link entry emits audit event
- ✅ Notification entry emits audit event
- ✅ All rejections emit `[OS_PERMISSION_DENIED]` or `[OS_HARD_STOP]`
- ✅ No silent paths

### Forbidden Patterns (Defense Against Pre-Attack Vectors)

❌ **ATTACK 1 Defense: No Kill Resurrection**
- ❌ No `new SessionContext()` inside handlers (injected only)
- ❌ No caching of sessionId in handler
- ❌ No persistence to ViewModel/savedState/static vars
- ❌ No "recovery" logic that reads old session
- ✅ Handler accepts that session is already revoked by Tier 1

❌ **ATTACK 2 Defense: No Deep-Link Implicit Authority**
- ❌ No auto-bind from cached sessionId
- ❌ No "helpful restoration" logic
- ❌ No lazy rebind on foreground
- ❌ No implicit bind based on URL parameters
- ✅ Handler does only: `setForeground(true)`

❌ **ATTACK 3 Defense: No Notification Implicit Authority**
- ❌ No auto-bind from cached sessionId
- ❌ No "helpful restoration" logic
- ❌ No lazy rebind on foreground
- ❌ No bind based on notification metadata
- ✅ Handler does only: `setForeground(true)`

❌ **ATTACK 4 Defense: No Session Bleed via Edges**
- ❌ No conditional logic (if/then about session state)
- ❌ No race conditions between revocation and entry
- ✅ Handler delegates to enforceWrapper (guards + enforcement)

❌ **ATTACK 5 Defense: No onForeground Auto-Restore**
- ❌ MobileLifecycleWatcher.onForeground() does NOT bind
- ❌ MobileLifecycleWatcher.onForeground() = only `setForeground(true)` + audit
- ✅ Verified by MOB-ACC-09 (no implicit resume)

❌ **ATTACK 6 Defense: No Foreground-Authority Coupling**
- ❌ No decision logic: `if (isInForeground()) then assert(oldSession)`
- ❌ No inference: foreground → authority assumed
- ❌ No state coupling: foreground changes must not affect session binding
- ✅ Separation enforced: `isInForeground()` and `get()` are independent

❌ **ATTACK 7 Defense: No Notification Bypass of Revocation**
- ❌ No special-case logic for notification-sourced foreground
- ❌ No lifecycle bypass
- ❌ Same revocation applies to all entry paths
- ✅ Consistent enforcement across kill, blur, background, screen lock

### Type Safety
- ✅ `sessionId: string` required (never optional)
- ✅ No implicit coercion
- ✅ Constructor injection enforced (TypeScript)

### Scope Discipline
- ✅ No Tier 4+ logic (accessibility, file access)
- ✅ No UI layer logic
- ✅ No retry or recovery heuristics
- ✅ No "helpful" patterns
- ✅ Handlers are thin entry points only

### Test Requirements (ABSOLUTE)

All of these must pass:
- ✅ MOB-ACC-01 through MOB-ACC-09 (Tiers 0-1 foundation)
- ✅ MOB-ACC-10 (OS Kill = total death)
- ✅ MOB-ACC-11 (Deep-link = foreground only)
- ✅ MOB-ACC-12 (Notification = foreground only)
- ✅ MOB-PR-004_Ghost_Pre_Attack.test.ts (all 7 vectors blocked)

**No test modifications. All must pass without change.**

---

## Blocks (MOB-Txx Vectors)

| Vector | Threat | Handler | Proof |
|---|---|---|---|
| **MOB-T02** | Notification/deep-link grants authority | DeepLinkHandler, NotificationHandler | MOB-ACC-11, 12 |
| **MOB-T03** | Deep-link resurrects authority | DeepLinkHandler | MOB-ACC-11 |
| **MOB-T04** | App kill doesn't clear authority | AppKillHandler | MOB-ACC-10 |
| **MOB-T09** | Silent foreground bypass | NotificationHandler | MOB-ACC-12 |
| **MOB-T10** | Background service after kill | AppKillHandler | MOB-ACC-10 |
| **MOB-T12** | Implicit authority after events | All handlers | MOB-ACC-10, 11, 12 |

---

## Implementation Constraints

### Handler Signatures (Exact)

```typescript
// App Kill Handler
export class MobileAppKillHandler {
  constructor(
    sessionCtx: MobileSessionContext,
    watcher: MobileLifecycleWatcher,
    wrapper: MobileEnforceWrapper
  ) { ... }

  public onAppKilled(): void {
    // Session already revoked by watcher.onKill() (Tier 1)
    // Handler confirms cleanup
    // No logic here — just audit confirmation
  }
}

// Deep-Link Handler
export class MobileDeepLinkHandler {
  constructor(
    sessionCtx: MobileSessionContext,
    wrapper: MobileEnforceWrapper
  ) { ... }

  public onDeepLinkEntry(): void {
    // Visual foreground only
    sessionCtx.setForeground(true);
    this.audit.emit('MOBILE_DEEP_LINK_ENTRY', { timestamp: Date.now() });
    // No bind, no cache, no recovery
  }
}

// Notification Handler
export class MobileNotificationHandler {
  constructor(
    sessionCtx: MobileSessionContext,
    wrapper: MobileEnforceWrapper
  ) { ... }

  public onNotificationTap(): void {
    // Visual foreground only
    sessionCtx.setForeground(true);
    this.audit.emit('MOBILE_NOTIFICATION_ENTRY', { timestamp: Date.now() });
    // No bind, no cache, no recovery
  }
}
```

### Routing (MobileLifecycleAdapter Update)

```typescript
export class MobileLifecycleAdapter {
  private killHandler: MobileAppKillHandler;
  private deepLinkHandler: MobileDeepLinkHandler;
  private notificationHandler: MobileNotificationHandler;

  // Wire to lifecycle events
  onKill(): void {
    this.watcher.onKill();  // Tier 1 revokes
    this.killHandler.onAppKilled();  // Tier 3 confirms
  }

  onDeepLinkEntry(): void {
    this.deepLinkHandler.onDeepLinkEntry();  // Tier 3 foreground only
  }

  onNotificationTap(): void {
    this.notificationHandler.onNotificationTap();  // Tier 3 foreground only
  }
}
```

---

## Merge Gate (REQUIRED)

🔒 **BLOCKING:** MOB-PR-004 must pass before MOB-PR-005, MOB-PR-006, etc.

If MOB-PR-004 fails → Tier 3+ stalls.
If MOB-PR-004 passes → MOB-PR-005 (Accessibility Gate) unblocks immediately.

---

## Ghost Verdict Criteria

**PASS:**
- ✅ All MOB-ACC-01 through MOB-ACC-12 pass
- ✅ All 7 pre-attack vectors fail (attacks blocked)
- ✅ No handler creates SessionContext
- ✅ No handler calls `bind()`
- ✅ No persistence, no cache, no recovery logic
- ✅ All forbidden patterns absent
- ✅ Audit trail complete

**BLOCK:**
- ❌ Any MOB-ACC test fails
- ❌ Any pre-attack vector succeeds
- ❌ Deep-link or notification auto-binds
- ❌ Old sessionId is implicitly restored
- ❌ Foreground and authority are coupled
- ❌ Static/ViewModel/savedState persistence detected
- ❌ Handlers do anything beyond what's documented

---

## What Tier 3 Is (And Isn't)

**IS:**
- Entry-point handlers (kill, deep-link, notification)
- Foreground state management
- Audit emission on entry
- Passive listeners (no decision logic)

**IS NOT:**
- Session binding (Tier 0 owns this)
- Lifecycle enforcement (Tier 1 owns this)
- Enforcement wrappers (Tier 2 owns this)
- Accessibility enforcement (Tier 4+)
- File access rules (Tier 4+)
- Business logic (Tier 4+)

---

## Test Coverage (Authoritative)

### MOB-ACC-01 through MOB-ACC-09
- Tiers 0-1 foundation (already passing)
- Required as baseline

### MOB-ACC-10: OS Kill = Total Death
- ✅ Handler confirms Tier 1 revocation
- ✅ Relaunch starts fresh
- ✅ Zero persistence

### MOB-ACC-11: Deep-Link = Foreground Only
- ✅ Handler sets foreground true
- ✅ No auto-bind
- ✅ Old ID rejected

### MOB-ACC-12: Notification = Foreground Only
- ✅ Handler sets foreground true
- ✅ No auto-bind
- ✅ Old ID rejected

### MOB-PR-004_Ghost_Pre_Attack
- ✅ All 7 resurrection vectors blocked
- ✅ All forbidden patterns proven impossible

---

## Scope Locked

**No deviation permitted.**

This PR is the entry-point handler layer. It must be thin, it must be passive, and it must make resurrection provably impossible.

**This is Tier 3. After this, we move to Tier 4 (Accessibility) with the same discipline.**

---

**This PR is law. Tests are law. Attacks must fail. No exceptions.**
