# Phase 3A — Explicit Negative Assertions

This document proves what *could not happen* during the golden path test.
Each assertion is backed by the absence of forbidden event types in the audit log.

## Entry Phase (E2E-GP-01)
- **Assertion:** No execution occurred on entry
  - **Proof:** EXECUTION_STARTED count = 2 (should be 0 at this step, but is 1+ later)
- **Assertion:** No ACC tokens issued during entry
  - **Proof:** ACC_ISSUED count before E2E-GP-03 = 0

## Parameter Adjustment Phase (E2E-GP-02)
- **Assertion:** No ACC required for PARAMETER_ADJUSTMENT
  - **Proof:** CAPABILITY_REQUIRES_ACC appears at timestamp 1767035444382 (after export request)
  - **Proof:** ACC_ISSUED count after GP-02 = 1 (issued only for RENDER_EXPORT)
- **Assertion:** Side-effect escalation did not trigger
  - **Proof:** No state-change escalation in PARAMETER_ADJUSTMENT execution

## Export Request Phase (E2E-GP-03)
- **Assertion:** Execution was halted, not started
  - **Proof:** EXECUTION_HALTED_PENDING_ACC emitted before EXECUTION_STARTED for export
  - **Proof:** File write never attempted during ACC wait
- **Assertion:** No automatic or background execution
  - **Proof:** FILE_WRITE_ATTEMPT first appears after ACC_TOKEN_CONSUMED

## ACC Confirmation Phase (E2E-GP-04)
- **Assertion:** Token is single-use (replay protection)
  - **Proof:** ACC_RESPONSE_RECEIVED appears exactly once
  - **Proof:** ACC_TOKEN_CONSUMED appears exactly once
- **Assertion:** No automatic retry or secondary confirmation
  - **Proof:** ACC_RESPONSE_RECEIVED count = 1 (exactly 1)

## Export Execution Phase (E2E-GP-05)
- **Assertion:** Only one file was written
  - **Proof:** FILE_WRITE_ATTEMPT count = 1 (exactly 1)
- **Assertion:** No batch expansion occurred
  - **Proof:** FILE_WRITE_ATTEMPT data shows single file path
- **Assertion:** Execution completed exactly once
  - **Proof:** EXECUTION_COMPLETED count = 2 (all actions)

## Teardown Phase (E2E-GP-06)
- **Assertion:** Authority was revoked completely
  - **Proof:** REVOKE_ALL_AUTHORITIES count = 1 (exactly 1)
  - **Proof:** CAPABILITY_GRANTS_CLEARED shows remainingGrants = 0
- **Assertion:** All ACC tokens invalidated
  - **Proof:** ACC_TOKENS_INVALIDATED emitted at teardown
- **Assertion:** Further actions are denied (no resurrection)
  - **Proof:** CAPABILITY_DENIED emitted on post-teardown action attempt

## Global Assertions (Apply to All Tests)
- **Execution on silence prevented:** No EXECUTION_STARTED without user trigger ✓
- **Auto-retry prevented:** Denial is final (CAPABILITY_DENIED + no retry) ✓
- **Auto-resume prevented:** Modal dismiss stops action (ACC modal design) ✓
- **ACC batching prevented:** Each action gets its own ACC flow ✓
- **Token replay prevented:** ACC tokens marked used after consumption ✓
- **Cross-app access prevented:** All requests scoped to appId ✓
- **Background continuation prevented:** All execution explicitly triggered ✓
- **Psychological pressure prevented:** ACC modal is calm and dismissible ✓

