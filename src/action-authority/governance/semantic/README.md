# Level 4: Contextual Reasoning - Semantic Safety System

## Overview

The Semantic Safety System is a **policy enforcement layer** that prevents dangerous actions by detecting policy violations in real-time. It's the foundation of **Level 4: Contextual Reasoning**, which gives Action Authority the ability to understand the *meaning* of proposed actions.

## Core Concept

Instead of just blocking actions based on *who* asked (Authentication) or *how many* approved it (Quorum), we block actions based on *what* they do:

- **Exposing PII** (emails, SSNs, credit cards)
- **Making external API calls** (unintended network access)
- **Modifying production data** (destructive operations on live databases)
- **Custom policy violations** (user-defined rules)

## Architecture

```
SemanticAnalyzer (Pattern Matcher)
    ↓
PolicyEngine (Governance Gate - Static Singleton)
    ├─ Evaluates actions
    ├─ Caches results
    └─ Logs evaluations

Config
    ├─ Default Policy Rules
    ├─ User Custom Rules (JSON)
    └─ Performance & Logging Settings
```

## Quick Start

### 1. Initialize the Policy Engine

```typescript
import { PolicyEngine } from './governance/semantic/PolicyEngine';
import { loadDefaultConfig } from './governance/semantic/configLoader';

// Application startup
const config = loadDefaultConfig(); // Loads from config/semantic-policies.json
PolicyEngine.initialize(config);
```

### 2. Evaluate an Action

```typescript
import { buildSemanticContext } from './governance/semantic/utils';

const result = PolicyEngine.evaluate(buildSemanticContext({
  id: 'action-123',
  type: 'DATABASE_MUTATION',
  parameters: { email: 'user@example.com' },
  code: 'DELETE FROM users WHERE id = ?'
}));

if (!result.isValid) {
  console.log(`❌ Policy violation: ${result.reason}`);
  result.violations.forEach(v => {
    console.log(`  - ${v.type} (${v.severity}): ${v.reason}`);
  });
}
```

## File Structure

```
src/action-authority/governance/semantic/
├── types.ts                  # Type definitions
├── SemanticAnalyzer.ts       # Pattern matching engine
├── PolicyEngine.ts           # Governance gate
├── defaultConfig.ts          # Default configuration
├── configLoader.ts           # Load JSON config files
├── utils.ts                  # Helper functions
└── README.md                 # This file

config/
├── semantic-policies.json    # User configuration
└── semantic-policies.schema.json  # JSON schema
```

## Core Policies

### 1. PII Detection

Detects personally identifiable information:

- **Email addresses** - Pattern: `user@domain.com`
- **Social Security Numbers** - Pattern: `123-45-6789`
- **Phone numbers** - Pattern: `(123) 456-7890`
- **Credit cards** - Pattern: `1234 5678 9012 3456`

**Severity:** HIGH to CRITICAL

**What it prevents:** Accidental exposure of customer data, GDPR violations

### 2. External API Detection

Detects unintended network access:

- **HTTP URLs** (non-localhost) - Pattern: `https://external-api.com`
- **API library calls** - Pattern: `fetch()`, `axios()`, `XMLHttpRequest`
- **WebSocket connections**

**Severity:** MEDIUM to HIGH

**What it prevents:** Unexpected network calls, data exfiltration

### 3. Production Data Protection

Detects destructive operations on production databases:

- **Destructive operations** - Pattern: `DELETE`, `DROP`, `TRUNCATE`
- **Production markers** - Pattern: `production`, `prod`, `live`

**Severity:** CRITICAL

**What it prevents:** Accidental data loss, production incidents

## Custom Rules

Define your own policy rules in `config/semantic-policies.json`:

```json
{
  "id": "custom.secret-env-var",
  "name": "Secret Environment Variable Access",
  "checkFields": ["codeContext", "parameters"],
  "pattern": "process\\.env\\.(DATABASE_PASSWORD|API_SECRET|PRIVATE_KEY)",
  "violationType": "PII_EXPOSURE",
  "severity": "CRITICAL",
  "reason": "Attempting to access secret environment variable",
  "suggestedFix": "Use secure secrets management system, never hardcode secrets",
  "enabled": true
}
```

### Custom Rule Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (lowercase, hyphenated) |
| `name` | string | Display name |
| `checkFields` | string[] | Which fields to check: `parameters`, `codeContext`, `dataContext`, `proposalId`, `actionType` |
| `pattern` | string | Regular expression to match |
| `violationType` | string | `PII_EXPOSURE`, `EXTERNAL_API_CALL`, `PRODUCTION_DATA_MODIFICATION`, `CUSTOM_RULE` |
| `severity` | string | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` |
| `reason` | string | Why this is a violation |
| `suggestedFix` | string | How to fix it |
| `enabled` | boolean | Whether this rule is active |

## Severity Levels

| Level | Behavior | Use Case |
|-------|----------|----------|
| **CRITICAL** | Blocks execution | SSNs, credit cards, prod data deletion |
| **HIGH** | Blocks execution | Emails, phone numbers, external APIs |
| **MEDIUM** | Logs warning | Informational violations |
| **LOW** | Logs only | Low-risk patterns |

> **Note:** Only CRITICAL and HIGH violations block execution. MEDIUM and LOW are informational.

## Performance Features

### Caching

Results are cached using LRU cache to avoid re-evaluating identical contexts:

```typescript
const stats = PolicyEngine.getCacheStats();
// { size: 45, maxSize: 100 }
```

Clear cache after configuration changes:

```typescript
PolicyEngine.clearCache();
```

### Timeouts

Pattern matching has a **50ms timeout** by default to prevent ReDoS attacks:

- Patterns that take longer are aborted
- Evaluation fails safely (allows action, logs error)
- Configure in `config/semantic-policies.json`:

```json
{
  "performance": {
    "timeoutMs": 50
  }
}
```

### Pattern Complexity Limits

Prevent catastrophic backtracking by limiting regex complexity:

- Maximum complexity: 50 (configurable)
- Patterns exceeding this are rejected
- Standard patterns are typically 5-15 complexity units

## Immutability

All results are frozen for safety:

```typescript
const result = PolicyEngine.evaluate(context);

// This throws an error:
result.isValid = true;  // ❌ TypeError: Cannot assign to read-only property
```

## Logging & Forensics

All policy evaluations are logged for audit trails:

```json
{
  "logging": {
    "logEvaluations": true,
    "logViolationsOnly": false,
    "logErrors": true
  }
}
```

**Log Events:**

- `POLICY_ENGINE_INIT` - Engine initialization
- `POLICY_EVALUATION` - Every evaluation (if logEvaluations=true)
- `POLICY_VIOLATION` - When violations detected
- `POLICY_EVALUATION_ERROR` - Evaluation errors

## Integration Points

### FSM Auto-Revocation (Stage 4)

During HOLDING state, continuously monitor for policy violations:

```typescript
// Every 100ms
if (!PolicyEngine.evaluate(context).isValid) {
  fsm.transition(AAEvent.EXPIRE); // Revoke action
}
```

### Dispatcher Gate (Stage 5)

Check policies before execution:

```typescript
// In dispatcher.ts
const result = PolicyEngine.evaluate(context);
if (!result.isValid) {
  return FAILED; // Block execution
}
```

### HUD Display (Stage 6)

Show violations to user:

```typescript
{result.violations.map(v => (
  <div className={`violation-${v.severity.toLowerCase()}`}>
    <h3>{v.type}</h3>
    <p>{v.reason}</p>
    <p>💡 {v.suggestedFix}</p>
  </div>
))}
```

## Error Handling

The system is **fail-safe**:

- If policy evaluation errors, it logs and **allows the action**
- This prevents the policy system from becoming a DOS vector
- Errors are logged to forensics for investigation

```typescript
try {
  const result = PolicyEngine.evaluate(context);
  // Use result...
} catch (error) {
  // Will not happen - PolicyEngine catches internally
  // But if it does, action is allowed
}
```

## Configuration Hot Reload

Update policies at runtime without restarting:

```typescript
const newConfig = loadPolicyConfig('/path/to/new/config.json');
PolicyEngine.reloadConfig(newConfig);
// Cache is cleared automatically
```

## Testing

The system is fully testable:

```typescript
import { SemanticAnalyzer } from './SemanticAnalyzer';
import { getDefaultPolicyConfig } from './defaultConfig';

const config = getDefaultPolicyConfig();
const violations = SemanticAnalyzer.analyze({
  proposalId: 'test-1',
  actionType: 'QUERY',
  parameters: { email: 'user@example.com' }
}, config);

expect(violations).toHaveLength(1);
expect(violations[0].type).toBe(PolicyViolationType.PII_EXPOSURE);
```

## Exemptions

Mark specific actions as exempt from certain rules:

```json
{
  "exemptions": {
    "actionType:ADMIN_REPORT": ["EXTERNAL_API_CALL"],
    "violationType:MEDIUM_EMAIL": ["actionType:INTERNAL_AUDIT"]
  }
}
```

## FAQ

### Q: Will this block legitimate API calls?

A: Yes, intentionally. Legitimate external APIs should be:
1. Documented in custom rules with exemptions
2. Routed through an API gateway
3. Explicitly approved before execution

### Q: What about false positives?

A: Adjust rules:
- Disable rules that trigger false positives
- Make patterns more specific
- Use exemptions for known safe cases

### Q: How much does this slow things down?

A: Negligible:
- Average evaluation: <5ms
- Cached results: <1ms
- Timeout: 50ms max

### Q: Can I use this without Action Authority?

A: Yes! PolicyEngine is standalone:

```typescript
import { PolicyEngine } from './governance/semantic/PolicyEngine';

PolicyEngine.initialize(config);
const result = PolicyEngine.evaluate(context);
```

## Next Steps

1. **FSM Integration** (Stage 4) - Auto-revocation during hold
2. **Dispatcher Integration** (Stage 5) - Pre-execution gate
3. **HUD Display** (Stage 6) - Show violations to users
4. **Full Testing** (Stage 8) - Comprehensive test coverage

---

**Version:** 1.0.0
**Last Updated:** January 4, 2026
**Status:** Foundation Complete - Ready for Integration Testing
