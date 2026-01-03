# MOB-PR-004 Spec Complete — Ready to Implement

Status: **LOCKED & DELIVERED** — All 3 spec files, zero ambiguity
Scope: Tier 3 Authority Death & Rebirth (App Kill, Deep-Link, Notification)
Blocks: MOB-T02, MOB-T03, MOB-T04, MOB-T09, MOB-T10, MOB-T12

---

## Delivered (3 Files)

### 1. MOB_PR_004_DEFINITION_OF_DONE.md
**The Contract** — What this PR must deliver

**Contains:**
- ✅ Scope (3 handlers + routing)
- ✅ Non-negotiable invariants (kill death, deep-link foreground, notification foreground)
- ✅ Handler contracts (1:1 mapped to MOB-ACC tests)
- ✅ Forbidden patterns (7 attack defenses)
- ✅ Test requirements (MOB-ACC-01 through MOB-ACC-12 + pre-attacks)
- ✅ Implementation constraints (handler signatures, routing)
- ✅ Merge gate (blocking criterion for MOB-PR-005+)
- ✅ Ghost verdict criteria (PASS/BLOCK)

**Key Invariants Locked:**
```
Kill Boundary:        App kill → immediate revokeAll() → zero persistence
Deep-Link Boundary:   Deep-link → setForeground(true) only (no bind)
Notification Boundary: Notification → setForeground(true) only (no bind)
Old SessionIds:       All paths → [OS_PERMISSION_DENIED] (no recovery)
```

---

### 2. MOB_PR_004_48HOUR_IMPLEMENTATION_CHECKLIST.md
**The Execution Plan** — How to implement (48-hour sequence)

**Contains:**
- ✅ Pre-implementation verification
- ✅ 6-hour blocks (6 blocks, 48 hours total):
  - Block 1: App Kill Handler + iOS/Android wiring
  - Block 2: Deep-Link Handler + iOS/Android wiring
  - Block 3: Notification Handler + iOS/Android wiring
  - Block 4: Adapter Routing & Integration
  - Block 5: Pre-Attack Simulation (all 7 vectors)
  - Block 6: Final Verification & PR Prep

**Each block includes:**
- ✅ Exact code stubs (to copy/paste)
- ✅ Per-file checklist (no ambiguity)
- ✅ Test execution commands
- ✅ Verification requirements
- ✅ Success/failure criteria

**Success Criteria (Final):**
```
✅ All MOB-ACC-01 through MOB-ACC-12 pass
✅ All 7 pre-attack vectors fail (blocked)
✅ Zero forbidden patterns
✅ TypeScript compiles (zero errors)
✅ All handlers < 50 lines (thin)
✅ Audit trail complete
```

---

### 3. PHASE_7_MOB_PR_004_GHOST_REVIEW_CHECKLIST.md
**The Enforcement Template** — How Ghost reviews (binary verdict)

**Contains:**
- ✅ Ghost's review posture (binary: PASS or BLOCK)
- ✅ Phase 1: Test execution (MOB-ACC + pre-attacks)
- ✅ Phase 2: Code review (handler-by-handler inspection)
- ✅ Phase 3: Forbidden pattern audit (grep patterns)
- ✅ Phase 4: Attack vector verification (all 7 probed)
- ✅ Phase 5: Final verdict (PASS/BLOCK criteria)

**Ghost's Probes:**
```
❌ Pattern searches for auto-bind, persistence, recovery logic
❌ Test execution: MOB-ACC-01 → 12, pre-attacks 1-7
❌ Handler inspection: No bind(), no cache, no recovery
❌ iOS/Android wiring: No implicit bind, no auto-restore
❌ Audit trail: All entries logged
```

**Binary Verdict:**
```
PASS:  All tests pass + all attacks fail + zero patterns
BLOCK: Any test fails OR any attack succeeds OR any pattern found
```

---

## What an Engineer Gets (No Ambiguity)

### From Definition of Done
- ✅ Exact scope (3 handlers, nothing more)
- ✅ What each handler must do (1-2 sentences max)
- ✅ What each handler must NOT do (7 forbidden patterns)
- ✅ Why each pattern is forbidden (defends against attack vector)
- ✅ How to verify (tests pass/fail)

### From 48-Hour Checklist
- ✅ Exact 6-hour blocks (no guessing)
- ✅ Code stubs to copy/paste (no design decisions)
- ✅ Per-file checklist (no ambiguity)
- ✅ Test commands to run (no guessing)
- ✅ Success criteria (clear pass/fail)

### From Ghost Review Checklist
- ✅ Exact Ghost's probe sequence
- ✅ Exact patterns Ghost searches for
- ✅ Exact test execution requirements
- ✅ Exact verdict criteria (PASS/BLOCK)
- ✅ No surprises on review day

---

## Test Coverage Summary

### MOB-ACC Tests (Foundation)
```
MOB-ACC-01 → MOB-ACC-09: Tiers 0-1 (lifecycle, session binding)
MOB-ACC-10:              App Kill = total death (no resurrection)
MOB-ACC-11:              Deep-link = foreground only (no auto-bind)
MOB-ACC-12:              Notification = foreground only (no auto-bind)
────────────────────────────────────────────────────────────────
Total: 12 test suites, 50+ assertions, 21 distinct test cases
```

### Pre-Attack Coverage
```
ATTACK 1:  Kill Resurrection        (persistence vectors)
ATTACK 2:  Deep-Link Implicit Auth  (cache recovery, URL embedding)
ATTACK 3:  Notification Implicit    (cache recovery, foreground grant)
ATTACK 4:  Session Bleed            (edge case transitions)
ATTACK 5:  onForeground Auto-Restore (lazy rebind)
ATTACK 6:  Foreground Coupling      (decision logic)
ATTACK 7:  Notification Bypass      (revocation bypass)
────────────────────────────────────────────────────────────────
Total: 7 attack vectors, 28-35 scenarios, 60+ assertions
```

### Combined Coverage
```
Acceptance Tests:    50+ assertions
Pre-Attack Tests:    60+ assertions
────────────────────────────────────────────────────────────────
Total:              110+ assertions proving resurrection impossible
```

---

## Forbidden Patterns (Why Each Matters)

| Pattern | What It Does | Why It's Forbidden | Test Block |
|---|---|---|---|
| Auto-bind on foreground | `if (!get()) bind()` | Grants authority without explicit action | MOB-ACC-11, 12 |
| Cache recovery | Saves sessionId, restores after revoke | Persists authority across revocation | MOB-ACC-10, 11, 12 |
| ViewModel persistence | Saves to Android ViewModel/savedState | Survives app kill | MOB-ACC-10 |
| Static cache | `static sessionId = ...` | Survives process death | MOB-ACC-10 |
| Lazy rebind | Rebind on first foreground | Grants authority on visibility | MOB-ACC-11, 12 |
| Foreground decision logic | `if (isInForeground()) assert(oldId)` | Couples visual to authority | MOB-ACC-12 |
| Recovery hints | "Helpful" restoration on deep-link/notification | Resurrection without explicit action | ATTACK 2, 3 |

---

## Implementation Path (No Surprises)

### What Each Handler Does

**MobileAppKillHandler**
```typescript
public onAppKilled(): void {
  // Session already revoked by MobileLifecycleWatcher.onKill() (Tier 1)
  // This handler confirms cleanup (no logic)
  this.audit.emit('MOBILE_APP_KILL_CONFIRMED', {});
}
```
- Zero lines of enforcement logic
- Only confirmation (session already dead from Tier 1)
- Test: MOB-ACC-10

**MobileDeepLinkHandler**
```typescript
public onDeepLinkEntry(): void {
  this.sessionCtx.setForeground(true);
  this.audit.emit('MOBILE_DEEP_LINK_ENTRY', { timestamp: Date.now() });
  // No bind. No recovery. No caching.
}
```
- Visual foreground only
- No bind, no recovery, no caching
- Test: MOB-ACC-11

**MobileNotificationHandler**
```typescript
public onNotificationTap(): void {
  this.sessionCtx.setForeground(true);
  this.audit.emit('MOBILE_NOTIFICATION_ENTRY', { timestamp: Date.now() });
  // No bind. No recovery. No caching.
}
```
- Visual foreground only
- No bind, no recovery, no caching
- Test: MOB-ACC-12

---

## Success Checklist (Before PR Submission)

```
MOB-ACC Tests:           ✅ All MOB-ACC-01 → 12 pass
Pre-Attack Tests:        ✅ All 7 vectors blocked
TypeScript Build:        ✅ Zero errors
Handler Sizes:           ✅ All < 50 lines (thin)
Forbidden Patterns:      ✅ None found
Dependency Injection:    ✅ All deps injected (no new)
Audit Trail:             ✅ All entries logged
Scope Discipline:        ✅ No Tier 4+ logic
Ghost Readiness:         ✅ All checks pass
```

---

## Files Structure (Complete)

```
src/os/mobile/
├── handlers/
│   ├── MobileAppKillHandler.ts         (NEW)
│   ├── MobileDeepLinkHandler.ts        (NEW)
│   └── MobileNotificationHandler.ts    (NEW)
├── ios/
│   └── AppDelegate.swift               (UPDATED)
├── android/
│   └── MainActivity.kt                 (UPDATED)
├── MobileSessionContext.ts             (Tier 0, locked)
├── MobileLifecycleWatcher.ts           (Tier 1, locked)
├── MobileEnforceWrapper.ts             (Tier 2, locked)
└── MobileLifecycleAdapter.ts           (UPDATED)

tests/
├── Phase7_Mobile_Acceptance_Tests.test.ts   (MOB-ACC-10/11/12 added)
├── MOB_PR_003_Ghost_Attack_Simulation.test.ts (Tier 2 red-team)
└── MOB_PR_004_Ghost_Pre_Attack.test.ts       (Tier 3 red-team, NEW)

specs/
├── MOB_PR_004_DEFINITION_OF_DONE.md          (Spec, NEW)
├── MOB_PR_004_48HOUR_IMPLEMENTATION_CHECKLIST.md (Execution, NEW)
└── PHASE_7_MOB_PR_004_GHOST_REVIEW_CHECKLIST.md (Review, NEW)
```

---

## Next Steps After MOB-PR-004

### Immediate (After Implementation + Ghost Approval)
- ✅ MOB-PR-004 merged
- ✅ MOB-PR-005 (Tier 4: Accessibility Gate) can start

### Pattern Repeats for Tiers 4-6
- Each PR: Definition of Done + 48-Hour Checklist + Ghost Review
- Each PR: Tests locked (MOB-ACC-13+)
- Each PR: Pre-attacks (vector-specific)

### Governance Narrative (After Tier 6 Locked)
- Phase 8: Executive summary (all 42 vectors)
- Phase 8: Threat → Guarantee mapping
- Phase 8: Regulatory alignment (NIST AI RMF, EU AI Act)

---

## Status Checkpoint

```
MOB-PR-003:              🔒 LOCKED (Ghost approved)
MOB-ACC-01 → 12:         🔒 LOCKED (Tests are law)
MOB-PR-004 Pre-Attack:   🔒 LOCKED (7 vectors probed)
MOB-PR-004 Spec:         ✅ COMPLETE (3 files delivered)
MOB-PR-004 Ready:        ⏳ READY FOR IMPLEMENTATION
```

---

## What's Next (Your Decision)

### Option A: Implement MOB-PR-004 Now
- Use 48-Hour Checklist
- Follow blocks exactly
- Submit to Ghost when done

### Option B: Move to MOB-PR-005 Spec
- Accessibility Gate (Tier 4)
- Tests (MOB-ACC-13+)
- Pre-attacks (accessibility-specific)

### Option C: Generate Tier 4-6 Specs in Parallel
- MOB-PR-005 through MOB-PR-007
- All at once (similar pattern)
- Then implementation phase

---

**MOB-PR-004 spec is complete, locked, and ready.**

**Zero ambiguity. Tests are law. Attacks must fail.**

**Engineers know exactly what to build. Ghost knows exactly what to test.**

🟢 **What's next?**
