# PRODUCTION LOCK - ACTION AUTHORITY v1.0.0

Status: PRODUCTION LOCKED

- Codex Security Pass: PASS (12/12)
- FSM invariants: immutable
- Hook boundary: context-strict, expiration-safe
- UI authority: none
- Execution authority: FSM only

Change control
Any change to:
- src/action-authority/fsm.ts
- src/action-authority/context-binding.ts
- src/action-authority/hooks/useActionAuthority.ts

REQUIRES:
- new version
- new threat model
- new Codex security pass
