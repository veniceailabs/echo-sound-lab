# AI-Native Execution Board

Last updated: 2026-03-10  
Branch: `codex/ai-native-execution-board`

## Strategy
Echo Sound Lab is not competing as a browser DAW clone.  
Primary product loop: `Proposal -> Review -> Execute` with verifiable trust and provenance.

This board is the execution source of truth for the first three moat epics.

## Program KPIs
- `0` leaked vendor secrets in client bundle.
- `100%` of executed actions have valid cryptographic verification.
- `0%` bypass rate for `requiresACC: true` actions.
- Track `Time-to-Approve` for ACC reviews.
- `>1.0` average branches per session.
- APL/state diff payload target `<100kb` for collaboration.

## Epic 1: Zero-Trust Execution & Cryptographic Provenance
Objective: replace simulated trust boundaries with real cryptographic validation and exportable provenance.

Status: `In Progress`

### Milestone 1.1: Secure Backend Proxy & Secret Migration
Status: `In Progress`

Acceptance Criteria:
- [x] All vendor calls route through same-origin backend proxy endpoints.
- [x] Client-side direct key usage removed from Gemini/Suno/Voice/Animate Art services.
- [ ] Deployment environments use server-only keys (`GEMINI_API_KEY`, `SUNO_API_KEY`, etc.) with no `VITE_*` fallback.
- [ ] Add CI check that fails if client bundle contains known secret key patterns.
- [ ] Add authenticated user context on backend proxy before vendor forwarding.

KPIs:
- Client secret leaks: target `0`.
- Proxy error rate: `<1%` at steady state.

### Milestone 1.2: Cryptographic APL Signing (Execution Bridge)
Status: `In Progress`

Acceptance Criteria:
- [x] Placeholder signatures and direct bypass path removed from proposal execution flow.
- [x] Execution service validates signature structure and freshness before applying action.
- [ ] Session secret negotiation moved to backend-issued token/HMAC key material.
- [ ] Signature verification binds to immutable canonical payload hash + proposal id + actor id.
- [ ] Tampered payload execution fails closed with audited hard error.

KPIs:
- Verified execution rate: `100%`.
- Tamper-detection false negative rate: `0`.

### Milestone 1.3: Render Manifests & C2PA Export
Status: `Not Started`

Acceptance Criteria:
- [ ] Export pipeline writes immutable render manifest (approved APL ledger).
- [ ] Manifest records human-vs-AI operation provenance for every action.
- [ ] Manifest is embedded in output metadata or shipped as sidecar with signed digest.
- [ ] C2PA alignment document and compatibility test vector added.

KPIs:
- Exported renders with manifest: `100%`.
- Manifest verification success rate: `100%`.

## Epic 2: ACC Autonomy & Risk-Tiered Governance
Objective: make ACC a strict policy runtime for AI agents, not a passive UI confirmation layer.

Status: `In Progress`

### Milestone 2.1: Strict Enforcement of ACC Gates
Status: `In Progress`

Acceptance Criteria:
- [x] Proposal direct-apply bypass removed.
- [x] `requiresACC: true` actions require explicit approval path.
- [x] ACC confirmation TODO path resolved in shell flow.
- [ ] Add negative tests proving blocked execution when grant is missing.
- [ ] Add audit event for every block decision with reason code.

KPIs:
- Bypass rate for gated actions: target `0%`.
- Gate enforcement test coverage: target `100%` of high-risk actions.

### Milestone 2.2: Risk Tiers & Policy Templates
Status: `Not Started`

Acceptance Criteria:
- [ ] Define and enforce `Low`, `Medium`, `High` risk tiers in capability model.
- [ ] Ship default templates: `Full Autonomy`, `Strict Review`, `Co-Pilot`.
- [ ] UI allows selecting template and inspecting resulting capability scope.
- [ ] Policy evaluation logs include risk tier and template source.

KPIs:
- Template adoption rate.
- Policy mismatch/override incidents per session.

### Milestone 2.3: Grant Consumption Lifecycle
Status: `Partially Implemented`

Acceptance Criteria:
- [x] Approval token/grant consumed after execution path resolution.
- [ ] Prevent replay across sessions/workspaces without explicit scope.
- [ ] Grant scope supports explicit multi-use windows only when configured.
- [ ] Add replay-attack test suite for stale and duplicated grants.

KPIs:
- Replay success rate: target `0`.
- Median Time-to-Approve by risk tier.

## Epic 3: Proposal Branching & Async Collaboration
Objective: turn collaboration into review/merge of intent diffs, not heavyweight project handoff.

Status: `Not Started`

### Milestone 3.1: Deterministic State Replay
Status: `Not Started`

Acceptance Criteria:
- [ ] Canonicalize APL action serialization and order.
- [ ] Replaying same APL sequence from same base state yields deterministic render config.
- [ ] Add deterministic replay harness with snapshot verification.

KPIs:
- Replay determinism pass rate: `100%`.

### Milestone 3.2: APL Versioning & Branching
Status: `Not Started`

Acceptance Criteria:
- [ ] Session model supports branch lineage (`main`, `feature/*`, etc.).
- [ ] Collaborator can fork, generate new APL sequence, and submit as branch.
- [ ] APL schema versioning supports forward/backward compatibility rules.

KPIs:
- Average branches per session: target `>1.0`.
- Branch submit success rate.

### Milestone 3.3: Diff Review UI & Merge Execution
Status: `Not Started`

Acceptance Criteria:
- [ ] Diff view shows additions/removals/modifications in proposal branch.
- [ ] Merge applies branch APL sequence through verified execution bridge.
- [ ] Merge operation emits signed audit manifest and re-render record.

KPIs:
- Merge success rate.
- Median review-to-merge time.
- Payload size p95 under `100kb`.

## Delivery Sequence (Hard Dependency Order)
1. Epic 1.1
2. Epic 1.2
3. Epic 2.2 + 2.3 hardening
4. Epic 1.3
5. Epic 3.1
6. Epic 3.2
7. Epic 3.3

## Immediate Sprint (Next 2 Weeks)
- [ ] Remove all `VITE_*` secret fallback from backend env resolver and deployment configs.
- [ ] Add proxy auth context and per-user rate limiting.
- [ ] Implement backend-issued HMAC session secret for proposal signing.
- [ ] Add execution tamper tests (`altered payload`, `stale signature`, `replay`).
- [ ] Define risk-tier enum + policy template seed data.

## Mapping Notes (Projects/Jira/Notion)
- Epic key format: `AIN-E1`, `AIN-E2`, `AIN-E3`
- Milestone key format: `AIN-E1-M1.1`, `AIN-E2-M2.2`, etc.
- Ticket template fields:
  - `Epic`
  - `Milestone`
  - `AC`
  - `KPI impact`
  - `Risk tier`
  - `Owner`
  - `Status`
  - `Dependency`
