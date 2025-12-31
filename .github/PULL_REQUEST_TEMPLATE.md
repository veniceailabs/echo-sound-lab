## Phase 4 Windows Implementation — Ghost Review Checklist

**Status:** Phase 4 Windows (48-Hour Execution Block)
**Reviewer:** Ghost (Adversarial Review)
**Gate:** All items must PASS for merge

---

## NON-NEGOTIABLES (INSTANT BLOCK IF FAILED)

- [ ] **No tests changed to "make it pass"** — Test fails → code is wrong, never test
- [ ] **No persistence added** — Registry, disk, env vars, static caches, temp files all forbidden
- [ ] **Single WindowsDialogWatcher** — Factory-only creation; no `new WindowsDialogWatcher()` outside factory
- [ ] **Single SessionContext** — Constructed once; injected everywhere; no hidden creation
- [ ] **Audit events on every path** — No silent failures; every decision has an audit event

---

## ENFORCE* ENTRYPOINTS (REQUIRED ORDER)

Required for: `enforceUINavigation()`, `enforceTextInput()`, `enforceParameterAdjustment()`, `enforceFileRead()`, `enforceFileWrite()`, `enforceRenderExport()`

- [ ] **FIRST LINE:** Dialog freeze check (`this.dialogWatcher.throwIfModalVisible()`)
- [ ] **SECOND PHASE:** Session binding assertion (`this.sessionCtx.assert(request.sessionId)`)
- [ ] **THEN:** All other logic (permission checks, identity verification, etc.)
- [ ] **EVERY PATH:** Audit event emitted (on allow, deny, error, early-return)

---

## FILE + IDENTITY RULES

- [ ] **Identity verification BEFORE size/mtime** — File identity (volume + objectId) checked before checking if file stopped changing
- [ ] **ADS paths rejected early** — Alternate data streams (colons beyond drive letter) rejected BEFORE bookmark lookup
- [ ] **Sensitive fields hard-deny immediately** — `fieldType === 'SENSITIVE'` → throw `[OS_HARD_STOP]` with no fallthrough
- [ ] **Field classification mandatory** — `fieldType` is required, not optional; missing → `[OS_PERMISSION_DENIED]`

---

## SINGLETON WIRING (INSTANCING RED FLAGS)

- [ ] **No `new SessionContext()` inside gates/adapter** — Must be injected; verify in constructor signature
- [ ] **No `new WindowsDialogWatcher()` outside factory** — All gates call `getSharedWindowsDialogWatcher()`
- [ ] **Factory works in tests** — `resetSharedWindowsDialogWatcher()` clears state between tests

---

## TIER DISCIPLINE

- [ ] **Work stays within current Tier scope** — Do not implement Tier N+1 features
- [ ] **Stubs are allowed** — TODO comments + stub return values acceptable for future Tiers
- [ ] **No premature optimization** — Code for correctness first, performance later

---

## GHOST VECTOR COVERAGE

For each change, cite which WIN-T vectors this PR blocks:

Example:
```
This PR blocks:
- WIN-T01: Dialog freeze prevents fake permission dialog
- WIN-T06: Session binding check prevents handle reuse
```

---

## TEST STATUS

- [ ] All modified tests still pass locally
- [ ] New tests (if any) pass locally
- [ ] No test output modified to hide failures
- [ ] Audit logs present in test output (can grep for event types)

---

## BEFORE SUBMITTING

1. Run full test suite locally: `npm test -- Phase4_Windows_Acceptance_Tests`
2. Verify all WIN-ACC-01 → WIN-ACC-09 pass
3. Check for silent failures (grep audit output for decision points)
4. Cite WIN-T vectors blocked by this PR
5. Confirm no persistence artifacts in code

---

## POST-REVIEW (Ghost Will Verify)

- ✅ Dialog freeze is literal first line
- ✅ Session binding is after freeze, before logic
- ✅ Audit events on all paths (no silent returns)
- ✅ Both singletons properly injected/used
- ✅ No new instances of forbidden singletons
- ✅ File identity checks precede size/mtime checks

---

**If any non-negotiable fails: PR is blocked.**
**No exceptions. No shortcuts.**
