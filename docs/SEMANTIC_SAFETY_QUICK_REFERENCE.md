# Semantic Safety: Quick Reference Guide

**For developers who need answers fast.**

---

## TL;DR - 60 Seconds

```typescript
// 1. Initialize at startup
import { PolicyEngine } from './governance/semantic/PolicyEngine';
PolicyEngine.initialize(); // Uses default config

// 2. Use hook (it auto-checks now)
const { policyResult } = useActionAuthority(contextId, hash);

// 3. Check violations if needed
if (policyResult && !policyResult.isValid) {
  console.warn(policyResult.violations[0].reason);
}

// 4. HUD displays violations automatically
<ActionAuthorityHUD policyResult={policyResult} ... />

// That's it! FSM auto-revokes, Dispatcher blocks.
```

---

## What Gets Blocked?

### 🚨 CRITICAL (Blocks Immediately)
- SSNs: `123-45-6789`
- Credit cards: `4532-1234-5678-9010`
- DELETE/DROP on production databases
- Accessing `process.env.PRIVATE_KEY` etc

### ⚠️ HIGH (Blocks)
- Emails: `user@example.com`
- Phone numbers: `(555) 123-4567`
- External APIs: `https://external-api.com`
- Fetch calls: `fetch()`, `axios()`, `XMLHttpRequest`

### ℹ️ MEDIUM/LOW (Logged, Not Blocked)
- Custom rules (your choice)

---

## Common Tasks

### Q: Initialize with custom config
```typescript
const config = loadPolicyConfig('/path/to/config.json');
PolicyEngine.initialize(config);
```

### Q: Add a custom rule
Edit `config/semantic-policies.json`:
```json
{
  "customRules": [{
    "id": "custom.my-rule",
    "name": "Block Something",
    "checkFields": ["parameters", "codeContext"],
    "pattern": "pattern-to-match",
    "violationType": "CUSTOM_RULE",
    "severity": "CRITICAL",
    "reason": "Why this is bad",
    "suggestedFix": "What to do instead",
    "enabled": true
  }]
}
```

### Q: Disable a core policy
```typescript
PolicyEngine.initialize({
  coreRules: {
    piiDetection: false,      // Disable PII
    externalApiDetection: true,
    productionDataProtection: true
  }
});
```

### Q: Exempt an action type
```typescript
PolicyEngine.initialize({
  exemptions: {
    'actionType:ADMIN_ACTION': ['EXTERNAL_API_CALL', 'PII_EXPOSURE']
  }
});
```

### Q: Change performance settings
```typescript
PolicyEngine.initialize({
  performance: {
    timeoutMs: 100,           // More time (default 50ms)
    cacheMaxSize: 500,        // Bigger cache (default 100)
    maxPatternComplexity: 100 // Complex regexes (default 50)
  }
});
```

### Q: Reload config at runtime
```typescript
const newConfig = loadPolicyConfig('/new/config.json');
PolicyEngine.reloadConfig(newConfig);
// Cache cleared automatically, new rules active
```

### Q: Check cache stats
```typescript
const { size, maxSize } = PolicyEngine.getCacheStats();
console.log(`Cache: ${size}/${maxSize} entries`);
```

### Q: Clear cache
```typescript
PolicyEngine.clearCache();
```

### Q: Get configuration
```typescript
const config = PolicyEngine.getConfig();
console.log(config.version);
```

### Q: Check if action is exempt
```typescript
const isExempt = PolicyEngine.isExempt('ADMIN_ACTION', 'EXTERNAL_API_CALL');
```

---

## Violation Details

### What's in a violation?

```typescript
{
  type: 'PII_EXPOSURE',           // PolicyViolationType
  severity: 'CRITICAL',            // PolicySeverity
  reason: 'SSN detected',          // Human-readable
  matches: [                       // What triggered
    {
      pattern: '\\d{3}-\\d{2}-\\d{4}',
      matched: '123-45-6789',
      location: 'parameters.ssn',
      confidence: 0.95
    }
  ],
  suggestedFix: 'Remove or hash SSN'  // What to do
}
```

### Where violations appear:

1. **Hook:** `policyResult.violations[]`
2. **Dispatcher:** Logged to forensics
3. **HUD:** PolicyViolationOverlay displays them
4. **FSM:** Triggers auto-revocation

---

## Integration Points

### Hook Integration (Automatic)
```typescript
const { policyResult, holdProgress, status } = useActionAuthority(...);
// policyResult updated every 100ms during HOLDING
// FSM auto-revokes if violation detected
```

### Dispatcher Integration (Automatic)
```typescript
// In dispatcher.ts - PolicyEngine.evaluate() called before execution
// Returns FAILED status with policy violation error
```

### HUD Integration (Automatic)
```typescript
<ActionAuthorityHUD policyResult={policyResult} ... />
// Displays PolicyViolationOverlay if violations detected
// Shows on EXPIRED state
```

---

## Configuration Files

### Default Location
```
config/semantic-policies.json
```

### Schema Location
```
config/semantic-policies.schema.json
```

### Environment Variable
```
POLICY_CONFIG_PATH=/path/to/config.json
```

### Example Config
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

---

## Troubleshooting

### Error: "Not initialized"
```
[PolicyEngine] Not initialized. Call initialize() first.
```
**Fix:** Call `PolicyEngine.initialize()` in app bootstrap

### Legitimate action blocked
**Fix 1:** Add exemption
```typescript
PolicyEngine.initialize({
  exemptions: {
    'actionType:YOUR_ACTION': ['EXTERNAL_API_CALL']
  }
});
```

**Fix 2:** Disable core rule
```typescript
PolicyEngine.initialize({
  coreRules: {
    externalApiDetection: false
  }
});
```

**Fix 3:** Make regex more specific
```json
{
  "customRules": [{
    "pattern": "^https://(?!localhost|internal).*"
  }]
}
```

### Performance issue
**Check cache:**
```typescript
const stats = PolicyEngine.getCacheStats();
// If size > 50, increase maxSize
```

**Increase time budget:**
```typescript
PolicyEngine.initialize({
  performance: { timeoutMs: 100 } // Default 50
});
```

### Custom rule not working
**Debug checklist:**
- [ ] `enabled: true`?
- [ ] `checkFields` match field name?
- [ ] Regex pattern is valid?

**Test regex:**
```typescript
const re = /your-pattern/;
console.log('Matches:', 'data'.match(re));
```

---

## Key Concepts

### Severity Levels
- **CRITICAL:** Blocks execution (must fix)
- **HIGH:** Blocks execution (must fix)
- **MEDIUM:** Logged only (informational)
- **LOW:** Logged only (informational)

Only CRITICAL and HIGH block. MEDIUM/LOW are warnings.

### Three Integration Points
1. **FSM** - Checks every 100ms during HOLDING, auto-revokes
2. **Dispatcher** - Checks before execution, returns FAILED
3. **HUD** - Displays violations to user

All three work together.

### Pattern Matching
- Regex-based (fast, deterministic)
- 50ms timeout (ReDoS protection)
- Deduplication & sorting by severity
- Custom + core rules combined

### Caching
- LRU cache (100 entries default)
- Cache hit: <1ms
- Cache miss: 3-8ms
- Cache clear on config reload

### Immutability
- Results frozen (Object.freeze)
- Config frozen on load
- Can't tamper with results

---

## Testing

### Run tests
```bash
npm test -- SemanticAnalyzer.test.ts
npm test -- PolicyEngine.test.ts
npm test -- semanticSafety.integration.test.ts
npm test  # All tests
```

### Manual checklist
- [ ] Test: Email detection works
- [ ] Test: SSN detection works (CRITICAL)
- [ ] Test: External API blocked
- [ ] Test: Production DELETE blocked
- [ ] Test: Custom rules apply
- [ ] Test: Violations display in HUD
- [ ] Test: FSM auto-revokes on violation
- [ ] Test: Dispatcher blocks on violation

---

## Performance Facts

| Operation | Time |
|-----------|------|
| Cold evaluation | 3-8ms |
| Cache hit | <1ms |
| Initialize | <50ms |
| Reload config | <10ms |
| Check exemption | <1ms |

**Safe to call in render loops:** No (initialize at startup only)
**Safe to call in event handlers:** Yes (fast & cached)

---

## File Locations

| File | Purpose |
|------|---------|
| `types.ts` | Type definitions |
| `SemanticAnalyzer.ts` | Pattern matching |
| `PolicyEngine.ts` | Governance gate |
| `defaultConfig.ts` | Default rules |
| `configLoader.ts` | Load config |
| `utils.ts` | Helper functions |
| `README.md` | Full documentation |

---

## When Things Break

### Step 1: Check logs
```bash
# Look for:
# [PolicyEngine:POLICY_EVALUATION_ERROR]
# [PolicyEngine:POLICY_VIOLATION]
```

### Step 2: Check config syntax
```bash
npm test -- semantic-policies.schema.json
```

### Step 3: Check regex patterns
```typescript
// Test each pattern individually
const re = /your-pattern/g;
console.log('Test data'.match(re));
```

### Step 4: Reset & reload
```typescript
PolicyEngine.reset();
PolicyEngine.initialize(getDefaultPolicyConfig());
```

### Step 5: Escalate
If still broken, check:
- Git logs (what changed?)
- Config file (valid JSON?)
- Regex syntax (use online regex tester)

---

## One-Liners

```typescript
// Initialize with defaults
PolicyEngine.initialize();

// Initialize with custom config
PolicyEngine.initialize({ /* config */ });

// Evaluate an action
const result = PolicyEngine.evaluate(context);

// Check if blocked
if (!result.isValid) { /* handle */ }

// Get violations
result.violations.forEach(v => console.log(v.reason));

// Reload config
PolicyEngine.reloadConfig(newConfig);

// Clear cache
PolicyEngine.clearCache();

// Get cache stats
const { size, maxSize } = PolicyEngine.getCacheStats();

// Check exemption
if (PolicyEngine.isExempt(actionType, violationType)) { /* */ }

// Reset (testing)
PolicyEngine.reset();
```

---

## FAQ

**Q: Does this block legitimate uses?**
A: Yes, sometimes. That's the trade-off. Use exemptions or disable core rules.

**Q: Can I disable this?**
A: Not gracefully. It's integrated at FSM level. Initialize with no core rules instead.

**Q: How fast is it?**
A: <5ms average. <1ms if cached. Won't noticeably slow down UX.

**Q: What if PolicyEngine breaks?**
A: Fails safely—allows action and logs error. Won't DOS itself.

**Q: Can I use my own policy format?**
A: No, but you can compile it to PolicyRule format and pass custom rules.

**Q: Does it detect obfuscated violations?**
A: Some (Base64, Unicode). Not sophisticated hashes. By design.

**Q: Can it learn from violations?**
A: No, it's rule-based, not ML. By design for security.

**Q: Is it GDPR compliant?**
A: Yes, prevents PII exposure. But you still need privacy policy.

---

## More Info

- **Full Docs:** See `SEMANTIC_SAFETY_DEPLOYMENT.md`
- **Architecture:** See `semantic/README.md`
- **Summary:** See `LEVEL_4_SEMANTIC_SAFETY_SUMMARY.md`
- **Tests:** See `__tests__/` directory
- **Examples:** See `config/semantic-policies.json`

---

**Version:** 1.0.0
**Last Updated:** January 4, 2026
**Status:** Production Ready
