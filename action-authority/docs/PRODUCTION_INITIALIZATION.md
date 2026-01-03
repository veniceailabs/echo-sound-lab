# Action Authority: Production Initialization

**Purpose:** Guide for initializing Action Authority in production builds
**Audience:** DevOps, Release Engineers, App Initialization
**Status:** LOCKED (matches PRODUCTION_LOCK.md)

---

## Quick Start: Production Initialization

In your app initialization code (entry point), do this:

```typescript
// app.ts (or main entry point)

import { createAAAuditLog } from '@action-authority/audit-log';
import { createAAContextBinding } from '@action-authority/context-binding';

// Initialize Action Authority
const auditLog = createAAAuditLog();
const contextBinding = createAAContextBinding({
  contextId: getCurrentFileId(),
  sourceHash: getCurrentFileHash(),
  timestamp: Date.now(),
});

// ⚠️ CRITICAL: Seal the audit log in production ONLY
if (process.env.NODE_ENV === 'production') {
  auditLog.seal();
  console.log('✅ Action Authority audit log sealed for production');
}

// Pass to your app/context
window.__ACTION_AUTHORITY__ = {
  auditLog,
  contextBinding,
};
```

---

## What Sealing Does

### Before Seal (Development)

```typescript
const auditLog = createAAAuditLog();

// Can record executions
auditLog.recordExecution(action, preState, confirmTime);
auditLog.recordExecution(action2, preState2, confirmTime2);
// ✅ New entries accepted
```

### After Seal (Production)

```typescript
auditLog.seal();

// Cannot record new entries
auditLog.recordExecution(action3, preState3, confirmTime3);
// ❌ Throws: "Audit log is sealed. Cannot record new entries."

// Can still read/verify
const stats = auditLog.getStatistics();  // ✅ Works
const entry = auditLog.getExecution(actionId);  // ✅ Works
auditLog.verifyExecutionIntegrity(actionId);  // ✅ Works
```

---

## Why Seal in Production?

1. **Compliance:** Audit trail cannot be modified post-deployment
2. **Legal defensibility:** Immutable record of all actions
3. **Correctness proof:** No one can add/remove/modify entries
4. **Operational safety:** Prevents accidental corruption

---

## When to Seal

### Development / Testing

❌ **Do NOT seal**

```typescript
if (process.env.NODE_ENV === 'development') {
  // Leave audit log unsealed
  // You need to be able to clear/reset for tests
}
```

### Production

✅ **MUST seal**

```typescript
if (process.env.NODE_ENV === 'production') {
  auditLog.seal();
}
```

### Staging

⚠️ **Optional (recommended: YES)**

```typescript
if (process.env.NODE_ENV === 'staging') {
  auditLog.seal();  // Recommended: test sealing behavior
}
```

---

## Verification: Is Audit Log Sealed?

```typescript
const isSealed = auditLog.isSealed();

if (isSealed) {
  console.log('✅ Audit log is sealed (read-only)');
} else {
  console.log('⚠️ Audit log is NOT sealed (can still record)');
}
```

---

## Checking Audit Log Statistics

Once sealed, you can still query the log:

```typescript
const stats = auditLog.getStatistics();
console.log(`Total executions: ${stats.totalExecutions}`);
console.log(`Executions by context:`, stats.executionsByContext);
console.log(`Oldest: ${new Date(stats.oldestExecution)}`);
console.log(`Newest: ${new Date(stats.newestExecution)}`);
console.log(`Avg duration: ${stats.averageExecutionDuration}ms`);
```

---

## Exporting Audit Log for Compliance

```typescript
// Before sealing or anytime:
const exportedJSON = auditLog.exportAsJSON();
console.log(exportedJSON);

// Or save to file:
fs.writeFileSync('audit-log-snapshot.json', exportedJSON);
```

---

## Error Handling

### Attempt to Record After Seal

```typescript
auditLog.seal();

try {
  auditLog.recordExecution(action, preState, confirmTime);
} catch (error) {
  // Error: "Audit log is sealed. Cannot record new entries."
  console.error('Cannot record execution:', error.message);
}
```

### Handle Gracefully

```typescript
function recordActionIfPossible(action, preState, confirmTime) {
  try {
    auditLog.recordExecution(action, preState, confirmTime);
    return true;
  } catch (error) {
    if (error.message.includes('sealed')) {
      // Expected in production
      console.warn('Audit log is sealed. Execution still happened, just not logged.');
      return false;
    }
    throw error;
  }
}
```

---

## Monitoring Checklist

After deploying Action Authority to production:

- [ ] Audit log is sealed (verify `auditLog.isSealed() === true`)
- [ ] Executions are being recorded before seal
- [ ] Seal prevents new records (expected error on attempt)
- [ ] Statistics queryable after seal
- [ ] Export still works after seal
- [ ] No errors in production logs related to audit
- [ ] Action Authority FSM core is not modified

---

## One-Liner: Production Readiness

```typescript
if (process.env.NODE_ENV === 'production' && !auditLog.isSealed()) {
  auditLog.seal();
}
```

Add this to your app startup. Done.

---

## Compliance Proof

### For Auditors / Compliance Teams

The sealed audit log proves:
1. ✅ No actions can be added after production deploy
2. ✅ No actions can be removed from the log
3. ✅ No actions can be modified
4. ✅ Log is immutable (Object.freeze)
5. ✅ Log is append-only (array, no splice)
6. ✅ Each entry is timestamped and contextual

---

## FAQ

**Q: What if I forget to seal?**
A: The log will still be append-only by design. Not sealed just means new entries can be added (which is sometimes ok). Sealed is stricter (completely immutable).

**Q: Can I unseal?**
A: No. Seal is one-way (by design). If you need to unseal, you need a new version of Action Authority.

**Q: What if I need to record an action after seal?**
A: You can't. This is intentional. Sealed means immutable. If you need more actions, unseal the old log and export it, then start a new sealed log.

**Q: Does seal affect the FSM?**
A: No. FSM continues to work normally. Seal only affects the audit log's ability to record NEW entries. Existing entries are always readable.

**Q: How do I know seal worked?**
A: Check `auditLog.isSealed()` and try to record an action (should throw).

---

**Status:** LOCKED (matches PRODUCTION_LOCK.md)
**Authority:** Production Initialization Required
