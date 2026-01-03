# SSC MVP Threat Model (Lightweight)

Scope: Safe System Control MVP only.

## Key Threats and Mitigations
- Unauthorized actions
  - Mitigation: explicit, scoped, session-limited permissions; revoke at any time.
- Scope creep (actions outside intent)
  - Mitigation: strict intent schema; deterministic mapping; block unknown intents.
- Hidden state changes
  - Mitigation: read-only scan default; no background mutation; explain-after.
- UI drift or stale state
  - Mitigation: re-scan before action; block if state changed since scan.
- Engine bypass
  - Mitigation: engine-boundary sanitization and activation rules remain authoritative.
- Audit gaps
  - Mitigation: log every scan/suggestion/grant/action with parameters and result.
- Over-trust in diagnostics
  - Mitigation: diagnostics remain informational unless explicitly marked authoritative.

## Assumptions
- SSC operates only within the app session.
- All actions are reversible in concept (no destructive defaults).
- OS-level control is out of scope.

## Non-Goals
- Autonomous agents
- Background automation
- Free-form command execution
