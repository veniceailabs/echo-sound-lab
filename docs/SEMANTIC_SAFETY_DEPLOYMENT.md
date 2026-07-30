# Semantic Safety System: Deployment & Integration Guide

## Overview

The Semantic Safety System (Level 4: Contextual Reasoning) is a policy enforcement layer that prevents dangerous actions by detecting policy violations in real-time. This guide covers deployment, configuration, and integration.

## Quick Start (5 minutes)

### 1. Initialize PolicyEngine

In your application bootstrap:

```typescript
import { PolicyEngine } from './action-authority/governance/semantic/PolicyEngine';
import { loadDefaultConfig } from './action-authority/governance/semantic/configLoader';

// Application startup
const config = loadDefaultConfig(); // Loads from config/semantic-policies.json
PolicyEngine.initialize(config);
```

### 2. Integrate with useActionAuthority Hook

The hook already includes policy checking. Just use it as normal:

```typescript
const { status, policyResult, actions } = useActionAuthority(contextId, sourceHash);

// policyResult contains violations if any detected
if (policyResult && !policyResult.isValid) {
  console.warn('Policy violation:', policyResult.reason);
}
```

### 3. Display Violations in HUD

The ActionAuthorityHUD component automatically displays violations:

```typescript
<ActionAuthorityHUD
  hudState={hudState}
  ghost={ghostData}
  holdProgress={holdProgress}
  policyResult={policyResult} // Pass from hook
/>
```

## Architecture

### Three Integration Points

```
┌─────────────────────────────────────┐
│  1. FSM HOLDING STATE               │
│     (Real-time monitoring)          │
│     ✓ Every 100ms policy check      │
│     ✓ Auto-revoke on violation      │
└────────────────┬────────────────────┘
                 │
┌─────────────────────────────────────┐
│  2. DISPATCHER (Pre-execution)       │
│     (Defense in depth)              │
│     ✓ PolicyEngine.evaluate()       │
│     ✓ Fail-closed on error          │
└────────────────┬────────────────────┘
                 │
┌─────────────────────────────────────┐
│  3. HUD DISPLAY                     │
│     (User feedback)                 │
│     ✓ PolicyViolationOverlay        │
│     ✓ Shows reason + remediation    │
└─────────────────────────────────────┘
```

## Configuration

### Default Configuration

```json
{
  "version": "1.0.0",
  "coreRules": {
    "piiDetection": true,
    "externalApiDetection": true,
    "productionDataProtection": true
  },
  "customRules": [],
  "exemptions": {},
  "performance": {
    "timeoutMs": 50,
    "maxPatternComplexity": 50,
    "cacheMaxSize": 100
  },
  "logging": {
    "logEvaluations": true,
    "logViolationsOnly": false,
    "logErrors": true
  }
}
```

### Custom Rules Example

Define custom policies in `config/semantic-policies.json`:

```json
{
  "customRules": [
    {
      "id": "custom.internal-api-only",
      "name": "Block External Services",
      "checkFields": ["parameters", "codeContext"],
      "pattern": "https://(?!(localhost|127\\.0\\.0\\.1|internal-api))",
      "violationType": "EXTERNAL_API_CALL",
      "severity": "CRITICAL",
      "reason": "External service integration not approved",
      "suggestedFix": "Use approved internal API gateway instead",
      "enabled": true
    },
    {
      "id": "custom.environment-var-leak",
      "name": "Environment Variable Leak Detection",
      "checkFields": ["codeContext", "parameters"],
      "pattern": "process\\.env\\.(DATABASE_PASSWORD|API_SECRET|PRIVATE_KEY)",
      "violationType": "PII_EXPOSURE",
      "severity": "CRITICAL",
      "reason": "Attempting to access secret environment variable",
      "suggestedFix": "Use secure secrets management, never hardcode credentials",
      "enabled": true
    }
  ]
}
```

### Exemptions

Mark specific actions as exempt from certain policies:

```json
{
  "exemptions": {
    "actionType:ADMIN_AUDIT": ["EXTERNAL_API_CALL"],
    "violationType:MEDIUM_EMAIL": ["actionType:INTERNAL_REPORT"]
  }
}
```

### Performance Tuning

```json
{
  "performance": {
    "timeoutMs": 75,
    "maxPatternComplexity": 100,
    "cacheMaxSize": 500
  }
}
```

**Tuning Guide:**

| Setting | Default | Range | Impact |
|---------|---------|-------|--------|
| `timeoutMs` | 50ms | 10-1000ms | Time budget for pattern matching. Increase if policies are timing out. |
| `maxPatternComplexity` | 50 | 10-500 | Prevents ReDoS attacks. Increase only if using complex regexes. |
| `cacheMaxSize` | 100 | 1-10000 | LRU cache for results. Increase for high-volume systems. |

## Core Policies

### 1. PII Detection (piiDetection)

**What it detects:**
- Email addresses: `user@example.com`
- Social Security Numbers: `123-45-6789`
- Phone numbers: `(555) 123-4567`
- Credit cards: `4532-1234-5678-9010`

**Severity:** HIGH to CRITICAL
**Use case:** Prevent accidental exposure of customer data, GDPR compliance

**Example:**
```typescript
// ❌ BLOCKED
const user = {
  email: 'admin@example.com',  // HIGH severity
  ssn: '123-45-6789'            // CRITICAL severity
};

// ✅ ALLOWED
const user = {
  userId: 'user-12345',
  contactMethod: 'internal-notification'
};
```

### 2. External API Detection (externalApiDetection)

**What it detects:**
- External URLs: `https://api.external.com`
- API calls: `fetch()`, `axios()`, `XMLHttpRequest`
- WebSocket connections

**Severity:** MEDIUM to HIGH
**Use case:** Prevent unintended network access, data exfiltration

**Example:**
```typescript
// ❌ BLOCKED
const data = await fetch('https://external-api.com/data');
const response = axios.post('https://third-party.com/webhook', payload);

// ✅ ALLOWED
const data = await fetch('http://localhost:3000/api/data');
const response = axios.post('http://internal-api:8080/webhook', payload);
```

### 3. Production Data Protection (productionDataProtection)

**What it detects:**
- Destructive operations: `DELETE`, `DROP`, `TRUNCATE`
- Production markers: `production`, `prod`, `live`
- Only violates if BOTH are present

**Severity:** CRITICAL
**Use case:** Prevent accidental data loss, production incidents

**Example:**
```typescript
// ❌ BLOCKED
DROP TABLE prod_users;
DELETE FROM production.accounts WHERE id = 123;
TRUNCATE TABLE live_data;

// ✅ ALLOWED
DELETE FROM test_users WHERE id = 123;
DROP TABLE staging_temp;
TRUNCATE TABLE dev_cache;
```

## Integration Patterns

### Pattern 1: Full Stack Integration

```typescript
// 1. Initialize
import { PolicyEngine } from './governance/semantic/PolicyEngine';
PolicyEngine.initialize();

// 2. Use hook with automatic checking
const { policyResult, actions } = useActionAuthority(contextId, sourceHash);

// 3. Dispatcher automatically enforces (pre-execution)
const dispatcher = new AAExecutionDispatcher();
const result = await dispatcher.dispatch(workOrder);

// 4. HUD displays violations
<ActionAuthorityHUD policyResult={policyResult} ... />
```

### Pattern 2: Custom Policies Only

```typescript
// Disable core policies, use only custom rules
PolicyEngine.initialize({
  coreRules: {
    piiDetection: false,
    externalApiDetection: false,
    productionDataProtection: false
  },
  customRules: [
    // Your custom rules only
  ]
});
```

### Pattern 3: Hot Reload (Runtime Updates)

```typescript
// Update policies without restarting
const newConfig = loadPolicyConfig('/new/config/path');
PolicyEngine.reloadConfig(newConfig);
// Cache automatically cleared, new rules active
```

### Pattern 4: Exemptions for Known Safe Cases

```typescript
const config = {
  ...getDefaultPolicyConfig(),
  exemptions: {
    // Admin actions can use external APIs
    'actionType:ADMIN_INTEGRATION': ['EXTERNAL_API_CALL'],
    // Internal audit can collect emails
    'actionType:COMPLIANCE_AUDIT': ['PII_EXPOSURE']
  }
};

PolicyEngine.initialize(config);
```

## Forensic Logging

All policy evaluations are logged for audit trails:

```
[PolicyEngine:POLICY_ENGINE_INIT] {
  version: "1.0.0",
  configVersion: "1.0.0",
  coreRules: { ... },
  customRulesCount: 3
}

[PolicyEngine:POLICY_EVALUATION] {
  proposalId: "action-123",
  cached: false,
  isValid: false,
  violationCount: 2,
  evaluationTimeMs: 4.5
}

[PolicyEngine:POLICY_VIOLATION] {
  proposalId: "action-123",
  violations: [
    {
      type: "PII_EXPOSURE",
      severity: "CRITICAL",
      reason: "SSN detected"
    }
  ]
}
```

### Forensic Event Types

| Event | Meaning | Severity |
|-------|---------|----------|
| `POLICY_ENGINE_INIT` | Engine initialized with config | LOW |
| `POLICY_EVALUATION` | Policy check completed | LOW |
| `POLICY_VIOLATION` | Violation(s) detected | HIGH |
| `POLICY_EVALUATION_ERROR` | Check failed (rare) | CRITICAL |
| `POLICY_CONFIG_RELOAD` | Config reloaded at runtime | MEDIUM |

## Testing

### Unit Tests

```bash
npm test -- SemanticAnalyzer.test.ts
npm test -- PolicyEngine.test.ts
```

### Integration Tests

```bash
npm test -- semanticSafety.integration.test.ts
```

### Manual Testing Checklist

- [ ] PII detection works for emails
- [ ] PII detection works for SSNs (CRITICAL)
- [ ] External API detection works
- [ ] Production protection blocks destructive ops
- [ ] Custom rules apply correctly
- [ ] Cache improves performance on repeated evaluations
- [ ] Policy violations display in HUD
- [ ] FSM auto-revokes on violation during HOLDING
- [ ] Dispatcher blocks execution on violation

## Troubleshooting

### PolicyEngine Not Initialized

```
Error: [PolicyEngine] Not initialized. Call initialize() first.
```

**Fix:** Call `PolicyEngine.initialize()` in application bootstrap.

### False Positives (Legitimate Actions Blocked)

**Solution 1: Disable specific core rule**
```typescript
PolicyEngine.initialize({
  coreRules: {
    piiDetection: true,    // Keep
    externalApiDetection: false,  // Disable
    productionDataProtection: true
  }
});
```

**Solution 2: Add exemptions**
```typescript
PolicyEngine.initialize({
  exemptions: {
    'actionType:INTEGRATION_TEST': ['EXTERNAL_API_CALL']
  }
});
```

**Solution 3: Make regex more specific**
```json
{
  "customRules": [{
    "pattern": "^https://(?!localhost|internal|127\\.0\\.0\\.1).*"
  }]
}
```

### Slow Performance

**Check cache hit rate:**
```typescript
const stats = PolicyEngine.getCacheStats();
console.log(`Cache: ${stats.size}/${stats.maxSize} entries`);
```

**Increase cache size:**
```typescript
PolicyEngine.initialize({
  performance: {
    cacheMaxSize: 500  // Default 100
  }
});
```

**Reduce evaluation scope:**
```json
{
  "performance": {
    "timeoutMs": 100  // More time budget
  }
}
```

### Custom Rule Not Triggering

**Debug checklist:**
1. Is rule `enabled: true`?
2. Does `checkFields` include the field with the data?
3. Does regex pattern match?
4. Can you test regex separately?

```typescript
const testRegex = /your-pattern/gi;
const matches = 'test data'.match(testRegex);
console.log('Matches:', matches);
```

## Security Considerations

### ReDoS Prevention

Policies timeout after 50ms to prevent catastrophic backtracking:

```typescript
// Timeout automatically enforced
const result = PolicyEngine.evaluate(context);
// Never hangs, even with complex regexes
```

### Fail-Safe Behavior

If PolicyEngine errors, it logs and allows action:

```typescript
try {
  const result = PolicyEngine.evaluate(context);
  // Process result
} catch (error) {
  // Won't happen - PolicyEngine catches internally
  // But if it does, action is allowed (fail-safe)
}
```

### Configuration Immutability

Loaded configs are frozen to prevent tampering:

```typescript
const config = PolicyEngine.getConfig();
config.version = '2.0.0'; // ❌ Throws TypeError
```

## Migration Path

### From v1.0.0 (Current) to Future Versions

Configuration is versioned for forward compatibility:

```json
{
  "version": "1.0.0",  // Will support migration in v2.0.0
  ...
}
```

### Adding New Core Rules (Future)

```typescript
// Hypothetical v2.0.0
{
  "coreRules": {
    "piiDetection": true,
    "externalApiDetection": true,
    "productionDataProtection": true,
    "sqlInjectionDetection": true  // NEW in v2.0.0
  }
}
```

## Production Checklist

- [ ] PolicyEngine initialized in bootstrap
- [ ] Configuration loaded from environment variable or config file
- [ ] Core policies enabled (or explicitly disabled with reason)
- [ ] Custom rules added for organization-specific policies
- [ ] Exemptions configured for known legitimate use cases
- [ ] Forensic logging enabled and monitored
- [ ] FSM integration tested (auto-revocation during HOLDING)
- [ ] Dispatcher integration tested (pre-execution blocking)
- [ ] HUD displays violations correctly
- [ ] Performance tested under load
- [ ] Error cases tested (invalid regex, large contexts, etc.)
- [ ] Documentation updated for team
- [ ] On-call runbook includes policy violation troubleshooting

## Support & Feedback

For issues or questions:

1. Check the FAQs in the README.md
2. Review the integration tests for examples
3. Check forensic logs for error details
4. Report issues with: proposalId, context, expected vs actual result

---

**Version:** 1.0.0
**Last Updated:** January 4, 2026
**Status:** Production Ready
