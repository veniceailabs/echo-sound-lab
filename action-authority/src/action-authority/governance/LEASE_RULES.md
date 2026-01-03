# Action Authority Level 3: Leased Intent

## Governance Rules & Edge Cases

This document defines the explicit rules that govern how leases work, what they permit, and what they forbid.

---

## 1. LEASE LIFECYCLE

A lease has three states:

### State 1: ACTIVE
- `isRevoked = false`
- `now < expiresAt`
- `heartbeatMissCount = 0`
- **Condition**: Active Dead Man's Switch engagement

**What it allows**: LOW-risk actions in the leased domain without 400ms hold requirement.

### State 2: PENDING_EXPIRATION
- `isRevoked = false`
- `now < expiresAt` (but approaching)
- Heartbeat is still alive
- **Condition**: User is still engaged, but lease will expire soon

**What it allows**: Same as ACTIVE (lease is still valid until expiresAt).

### State 3: REVOKED
- `isRevoked = true`
- `revokedAt` is set
- `revocationReason` is set
- **Condition**: Lease has been permanently terminated

**What it allows**: NOTHING. User must return to v1.0.0/v1.1.0 manual authorization.

---

## 2. AMENDMENT E: HEARTBEAT INVARIANT

### The Rule
The Dead Man's Switch MUST send a heartbeat every `heartbeatIntervalMs` (50ms by default).

If a single heartbeat window passes without a signal:
- **Lease state**: REVOKED
- **Reason**: `HEARTBEAT_MISSED`
- **Grace period**: NONE (immediate)
- **Recovery**: User must create a new lease with a fresh Master Hold

### Edge Cases

#### E1: Clock Skew / Network Delay
**Scenario**: Heartbeat signal is delayed by network latency, arriving late.

**Rule**: The dispatcher checks `now - lastHeartbeatAt > heartbeatIntervalMs`.
- If latency causes a missed window, the lease is revoked.
- This is intentional: it prevents "buffered" heartbeats from covering actual disengagement.

**Design intent**: Latency is a security feature, not a bug.

#### E2: Multiple Heartbeats in One Window
**Scenario**: Two heartbeat signals arrive in the same 50ms window.

**Rule**: Both are processed. Only `lastHeartbeatAt` is updated.
- `heartbeatMissCount` is reset to 0 for each valid signal.
- No side effect from receiving "extra" heartbeats.

**Design intent**: Idempotent. Multiple signals don't escalate privilege.

#### E3: Heartbeat After Revocation
**Scenario**: Heartbeat signal arrives, but the lease is already REVOKED.

**Rule**: The signal is ignored.
- `isRevoked` is immutable—it cannot transition back to ACTIVE.
- User must create a new lease.

**Design intent**: No resurrection of revoked leases.

---

## 3. AMENDMENT F: SCOPE-STRICTNESS

### The Rule
A lease is bound to a SINGLE ExecutionDomain.

A "Logic Pro" lease **cannot** be used for a "Chrome" action.

Attempting cross-domain use results in:
- **Lease state**: REVOKED
- **Reason**: `SCOPE_VIOLATION`
- **Additional effect**: GLOBAL_REVOCATION (all leases for this session are revoked)

### Edge Cases

#### F1: Domain Mismatch
**Scenario**: User has an active lease for LOGIC_PRO. They attempt a CHROME action.

**Dispatcher behavior**:
1. Validation fails: `isDomainAllowed = false`
2. Check if other leases are active for this session
3. Revoke ALL leases for this session (not just the mismatched one)
4. Return `PENDING_ATTESTATION` (user must manually authorize)
5. Log forensic entry: "Cross-domain lease violation"

**Design intent**: Prevent accidental privilege escalation across domains.

#### F2: Domain Reclassification
**Scenario**: A new domain is added to the system (e.g., "CUSTOM" domain).

**Rule**: Leases bound to "CUSTOM" work fine. No retroactive lease migration.

**Design intent**: Domains are immutable after lease creation.

#### F3: Bridge Replacement
**Scenario**: The Logic Pro bridge is replaced with a new implementation.

**Rule**: Leases remain valid. The domain binding is to ExecutionDomain, not to bridge implementation.

**Design intent**: Lease scope is higher-level than bridge details.

---

## 4. AMENDMENT G: 2ND-ORDER AUDIT

### The Rule
Every lease lifecycle event is forensically audited:

#### Event Type 1: LEASE_CREATED
When a user initiates a 2-second Master Hold:

```
ForensicAuditEntry {
  eventType: "LEASE_CREATED",
  leaseId: "lease-abc123",
  sessionId: "user_alice",
  domain: "LOGIC_PRO",
  riskCeiling: "LOW",
  durationMs: 300000,  // 5 minutes
  createdAt: 1704067200000,
  expiresAt: 1704067500000,
}
```

#### Event Type 2: LEASE_REVOKED
When any revocation event occurs:

```
ForensicAuditEntry {
  eventType: "LEASE_REVOKED",
  leaseId: "lease-abc123",
  sessionId: "user_alice",
  revocationReason: "HEARTBEAT_MISSED",
  revokedAt: 1704067250000,
  timeheldMs: 50000,  // How long the lease was active
}
```

#### Event Type 3: LEASE_VALIDATION_FAILED
When a dispatcher check fails:

```
ForensicAuditEntry {
  eventType: "LEASE_VALIDATION_FAILED",
  leaseId: "lease-abc123",
  workOrderDomain: "CHROME",
  reason: "SCOPE_VIOLATION",
  failedAt: 1704067300000,
}
```

### Audit Trail Guarantees
1. Every lease has a creation entry
2. Every lease has a revocation entry (or implicit via expiration)
3. Every failed validation attempt is logged
4. All entries are immutable and sealed per Level 1 (Trust Network)

---

## 5. RISK GATING

### The Rule
A lease can only grant LOW-risk authority.

**HIGH-risk actions ALWAYS require**:
1. Lease is revoked (if one is active)
2. Manual v1.0.0/v1.1.0 authorization (400ms hold + quorum)
3. Fresh work order creation

### Edge Cases

#### RG1: Lease Exists, Action is HIGH-risk
**Scenario**: Active LOGIC_PRO lease (LOW-risk ceiling). User attempts to delete a track (HIGH-risk).

**Dispatcher behavior**:
1. Validate lease for HIGH-risk action
2. Lease validation fails: `isRiskAllowed = false`
3. Revoke the lease: `RISK_ESCALATION`
4. Return `PENDING_ATTESTATION` to v1.0.0/v1.1.0 FSM
5. User must perform 400ms hold + quorum check

**Result**: HIGH-risk always wins. Lease is terminated.

#### RG2: No Lease, Action is LOW-risk
**Scenario**: No active lease. User attempts a LOW-risk action.

**Dispatcher behavior**:
1. No lease to check
2. Route to v1.0.0/v1.1.0 FSM for 400ms hold + quorum
3. If quorum met, execute

**Result**: Works fine. Lease is optional.

#### RG3: Lease Exists, Action is LOW-risk
**Scenario**: Active LOGIC_PRO lease. User attempts to adjust fader (LOW-risk).

**Dispatcher behavior**:
1. Validate lease for LOW-risk action
2. All checks pass: heartbeat alive, domain matches, risk allowed
3. Execute directly (bypass 400ms hold)
4. Return SUCCESS
5. Log action to audit trail with lease reference

**Result**: Lease grants speed for LOW-risk actions.

---

## 6. DEAD MAN'S SWITCH MECHANICS

### Platform-Specific Implementations

#### Mobile (iOS/Android)
```
- User puts finger on screen
- App continuously monitors touchStart, touchMove, touchEnd
- While touchStart is active: send heartbeat every 50ms
- When touchEnd fires: stop heartbeat, revoke lease
- If app loses focus: stop heartbeat, revoke lease
```

#### Desktop/Web
```
- User presses and holds a specific key (e.g., Space)
- While key is pressed: send heartbeat every 50ms
- When key is released: stop heartbeat, revoke lease
- If browser loses focus: stop heartbeat, revoke lease (optional: make stricter)
```

#### Gamepad
```
- User holds a trigger button (e.g., RT on Xbox controller)
- While button is pressed: send heartbeat every 50ms
- When button is released: stop heartbeat, revoke lease
```

### Non-Negotiable Requirements
1. Heartbeat is sent **actively** by the engagement mechanism, not passively
2. No caching or buffering of heartbeat signals
3. No "simulated" heartbeats while user is disengaged
4. Disengagement is **immediate** (no 100ms grace period)

---

## 7. TIME WINDOW SEMANTICS

### The Rule
A lease has a fixed `expiresAt` timestamp. When `now >= expiresAt`, the lease is expired.

### Edge Cases

#### TW1: System Clock Skew
**Scenario**: System clock jumps backward by 10 seconds.

**Rule**: Use monotonic timestamps internally.
- `createdAt` and `expiresAt` are set using `Date.now()` once
- Heartbeat validation uses `Date.now()` for freshness checks
- If clock skew occurs, heartbeat validation might report false failures
- This is acceptable: we prefer false revocation to false permission

#### TW2: Lease Expires During Action
**Scenario**: Dispatcher is executing an action. During bridge.execute(), the lease expires.

**Rule**: The lease validity is checked at dispatcher entry, not during execution.
- If bridge takes 100ms to execute, and lease expired at 50ms, execution still proceeds
- This is acceptable: we check authorization, then trust v1.0.0 atomic execution

#### TW3: Renewal / Extension
**Scenario**: User wants to extend an active lease beyond its `expiresAt`.

**Rule**: NOT ALLOWED. Create a new lease.
- No implicit renewal
- No "keep-alive" extension
- User must re-do the Master Hold gesture

**Design intent**: Explicit authorization boundaries.

---

## 8. MULTI-LEASE MANAGEMENT

### The Rule
A session (user) can hold **multiple leases simultaneously**, each bound to a different domain.

Example:
```
Session: user_alice
Lease 1: LOGIC_PRO (expires in 4 min)
Lease 2: CHROME (expires in 5 min)
```

Alice can use either lease for LOW-risk actions in their respective domains.

### Edge Cases

#### ML1: Cross-Domain Violation
**Scenario**: Alice has LOGIC_PRO and CHROME leases. She attempts EXCEL action.

**Rule**: No lease covers EXCEL.
- Route to v1.0.0/v1.1.0 FSM
- Require 400ms hold + quorum

#### ML2: All Leases Revoked (Cross-Domain Violation)
**Scenario**: Alice has LOGIC_PRO lease. She attempts CHROME action with LOGIC_PRO lease (scope violation).

**Rule**: ALL leases are revoked (Amendment F).
- LOGIC_PRO lease: REVOKED (reason: SCOPE_VIOLATION)
- Any other leases for this session: REVOKED (reason: SCOPE_VIOLATION)
- All subsequent actions require v1.0.0/v1.1.0 authorization

#### ML3: Lease Revocation Independence
**Scenario**: Alice has LOGIC_PRO and CHROME leases. LOGIC_PRO heartbeat is missed.

**Rule**: Only LOGIC_PRO is revoked.
- CHROME lease continues if its heartbeat is healthy
- Alice can still use CHROME for LOW-risk actions
- LOGIC_PRO requires new Master Hold

**Design intent**: Revocation is lease-specific unless otherwise stated (e.g., scope violation).

---

## 9. TESTING & VERIFICATION

### Critical Test Cases (Per Amendments)

#### Test E.1: Single Missed Heartbeat Revokes Lease
```
1. Create lease with 50ms heartbeat interval
2. Send heartbeat at T=0
3. Do NOT send heartbeat at T=50
4. At T=51, validation fails: lease is REVOKED
5. Verify: leaseValidationResult.isHeartbeatLate = true
6. Verify: lease.isRevoked = true
7. Verify: lease.revocationReason = 'HEARTBEAT_MISSED'
```

#### Test F.1: Cross-Domain Use Revokes All Leases
```
1. Create LOGIC_PRO lease for user_alice
2. Create CHROME lease for user_alice
3. Attempt to use LOGIC_PRO lease for CHROME action
4. Validation fails: isDomainAllowed = false
5. Verify: both leases are REVOKED
6. Verify: revocationReason = 'SCOPE_VIOLATION' for both
```

#### Test G.1: Lease Lifecycle Is Audited
```
1. Create lease → ForensicAuditEntry created (LEASE_CREATED)
2. Revoke lease → ForensicAuditEntry created (LEASE_REVOKED)
3. Verify both entries are sealed in Trust Network
4. Verify hash chain integrity
```

---

## 10. DEPLOYMENT GATES

Before Level 3 can be marked complete, all of the following must pass:

- [ ] All Amendment E tests pass (50ms heartbeat, no grace period)
- [ ] All Amendment F tests pass (scope strictness, global revocation)
- [ ] All Amendment G tests pass (forensic audit trail)
- [ ] All risk gating tests pass (HIGH-risk always revokes lease)
- [ ] Multi-lease independence tests pass
- [ ] Build succeeds with no TypeScript errors
- [ ] No regression in Level 0, 1, or 2 functionality
- [ ] Auditor review complete and approved

---

## 11. FUTURE EXTENSIONS (NOT IN SCOPE)

The following are intentionally NOT included in Level 3:

- **Lease Delegation**: User cannot grant their lease to another user
- **Conditional Leases**: No "if temperature > X, then revoke" logic
- **Lease Pooling**: Multiple users cannot share a lease
- **Implicit Renewal**: Leases do not auto-renew
- **Async Heartbeat**: Heartbeat is synchronous (no queuing)

These may be added in future levels, but only after explicit auditor approval.

---

## 12. SECURITY INVARIANTS (DO NOT BREAK)

1. **One Missed Heartbeat = Revoked** (Amendment E)
2. **Cross-Domain = Global Revocation** (Amendment F)
3. **All Lease Events = Audited** (Amendment G)
4. **Lease Cannot Escalate Risk** (HIGH-risk always requires manual auth)
5. **Lease is Temporal** (No implicit renewal or extension)
6. **Lease is Immutable Once Revoked** (Cannot resurrect)

---

End of LEASE_RULES.md
