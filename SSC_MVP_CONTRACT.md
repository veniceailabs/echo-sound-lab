# Safe System Control (SSC) MVP Contract

Status: Locked (MVP decisions set).

Goal: Provide read-only system understanding and permission-gated control so a user can safely guide actions without hidden state changes or autonomous behavior.

## Keystone (Permission Model)
All subsequent SSC tasks depend on this being locked.

Locked decisions (MVP):
- Read-only system scan is the default state.
- Actions are permission-gated, scope-bounded, and session-scoped.
- An explicit intent schema is required (no free-form actions).
- Behavior is deterministic and explain-after.
- Engine boundary guards remain sovereign (sanitization + activation rules always win).

Acceptance criteria (keystone):
- No action executes without an explicit, current permission grant.
- Every action is bounded to the granted scope and the active session only.
- Intent must match a known schema before any action can be proposed or executed.
- SSC cannot bypass sanitize/activation/no-op behavior even with user permission.

---

## 1) Read-Only System Scan
Contract:
- SSC can enumerate tabs, controls, and states without mutating any state.
- SSC explains what is visible and what is active, without inferring hidden changes.

Acceptance criteria:
- Scan output lists visible controls and their current states.
- Scan does not trigger renders, change values, or persist anything.

## 2) Intent Schema
Contract:
- SSC accepts only explicit intents (mixing / mastering / diagnostics).
- Free-form actions are rejected; mapping must be deterministic.

Acceptance criteria:
- Every intent maps to a predefined set of allowed controls.
- Unknown or ambiguous intents are rejected with an explanation.

## 3) Authority Levels
Contract:
- SSC authority is tiered: Observe, Explain, Suggest, Act (Scoped).
- No full-control mode exists in MVP.

Acceptance criteria:
- SSC cannot execute actions unless authority level is explicitly set to Act (Scoped).
- Observe/Explain/Suggest modes never mutate state.

## 4) Permissioned Control + Action Contract
Contract:
- SSC actions require explicit grants (what, where, for how long).
- Grants are revocable and expire at session end.
- Every action must satisfy: Who approved, What parameter + bounds, When (session), Undo (reversible/restorable).

Acceptance criteria:
- A user can view, grant, revoke, and expire permissions at any time.
- Actions outside granted scope are blocked and logged.
- If any action contract element is missing, the action is invalid.

## 5) Deterministic Execution + Explain-After
Contract:
- Given the same intent + state + permissions, SSC produces the same action plan.
- Explanations are produced after execution and match the actions taken.

Acceptance criteria:
- No background mutation or opportunistic changes.
- The explanation is a faithful, human-readable account of executed actions.

## 6) Audit Trail
Contract:
- All scans, suggestions, grants, and actions are logged.
- Logs are human-readable and reversible in concept.

Acceptance criteria:
- Each action log includes: intent, scope, parameters, timestamp, and result.
- Logs are viewable in-session without editing or deletion.

## 7) Safety Boundaries
Contract:
- SSC never bypasses engine sanitization or activation rules.
- SSC does not execute OS-level commands or background processes.
- SSC language is probabilistic, not authoritative.

Acceptance criteria:
- Engine boundary guards remain authoritative.
- SSC actions are limited to explicit UI/control surfaces only.
- SSC responses use probabilistic phrasing (e.g., "likely", "based on current state").

## Intentionally Impossible (MVP)
- Autonomous background agents
- Persistent or hidden control sessions
- Full-control mode
- OS-level control or command execution

## Non-Goals (MVP)
- Autonomous background agents
- Silent modifications or hidden state changes
- Free-form command execution
- Generative UX or speculative automation
