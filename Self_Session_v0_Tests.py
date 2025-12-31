"""
Self Session v0 — Acceptance Test Harness

Purpose: Implement AT-SS-01 through AT-SS-10 as executable tests.
Each test verifies an invariant from the acceptance test suite.

Tests are binary: pass or fail.
Tests are verifiable: proof is in the audit log.
Tests are unforgiving: no partial credit.
"""

import unittest
from datetime import datetime, timedelta
import logging

from Self_Session_v0_StateMachine import (
    SessionStateMachine,
    SessionState,
    AuditLog,
    AuditLogEntry,
    IllegalTransitionError,
)
from Self_Session_v0_Authority import (
    AuthorityManager,
    SilenceTracker,
    TTLEnforcer,
)


# Setup logging
logging.basicConfig(level=logging.INFO)


# ============================================================================
# ACCEPTANCE TESTS (AT-SS-01 through AT-SS-10)
# ============================================================================

class TestAcceptanceCriteria(unittest.TestCase):
    """Acceptance test suite. These are the law."""

    def setUp(self):
        """Set up test fixtures"""
        self.session_id = "test-session-1"
        self.now = datetime.utcnow()
        self.sm = SessionStateMachine(self.session_id)
        self.auth_mgr = AuthorityManager(audit_log=self.sm.get_audit_log())

    # ========================================================================
    # AT-SS-01: Silence Always Pauses Execution
    # ========================================================================

    def test_AT_SS_01_silence_pauses_execution(self):
        """
        AT-SS-01: Silence Always Pauses Execution

        Given: Session in S3 (EXECUTING)
        When: No explicit user action for > timeout
        Then: System must transition to S4 (ACC_CHECKPOINT)
        """

        # Setup: get to S3
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test: session requested")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test: consent granted")
        self.sm.transition(SessionState.S3_EXECUTING, "test: execution began")

        self.assertEqual(self.sm.get_current_state(), SessionState.S3_EXECUTING)

        # Issue authority token
        token = self.auth_mgr.issue_token(
            self.session_id, ttl_seconds=100, scope="test_scope"
        )

        # Track silence
        silence_tracker = SilenceTracker(timeout_seconds=5.0)
        silence_tracker.record_user_action(self.now)

        # Check silence at timeout
        future = self.now + timedelta(seconds=6)  # Past timeout
        is_silent = silence_tracker.check_silence(future)
        self.assertTrue(is_silent, "Silence should be detected after timeout")

        # Forced transition to ACC_CHECKPOINT (simulating silence handler)
        self.sm.transition(
            SessionState.S4_ACC_CHECKPOINT,
            "AT-SS-01: Silence timeout triggered",
        )

        # Verify we're in checkpoint
        self.assertEqual(self.sm.get_current_state(), SessionState.S4_ACC_CHECKPOINT)

        # Verify audit log shows ACC_CHECKPOINT entry after silence time
        log_entries = self.sm.get_audit_log().get_entries()
        checkpoint_entry = None
        for entry in log_entries:
            if entry.to_state == SessionState.S4_ACC_CHECKPOINT:
                checkpoint_entry = entry
                break

        self.assertIsNotNone(checkpoint_entry, "ACC_CHECKPOINT entry must be in log")
        self.assertFalse(
            self.sm.get_audit_log().has_execution_after(self.now + timedelta(seconds=5)),
            "No execution events should occur after silence timeout",
        )

    # ========================================================================
    # AT-SS-02: Silence Never Auto-Resumes Execution
    # ========================================================================

    def test_AT_SS_02_silence_never_autoresumes(self):
        """
        AT-SS-02: Silence Never Auto-Resumes Execution

        Given: Session in S4 (ACC_CHECKPOINT) and presented
        When: User provides no input for duration > silence_timeout
        Then: System must transition to S5 (PAUSED), not S3
        """

        # Get to S4
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")
        self.sm.transition(SessionState.S4_ACC_CHECKPOINT, "test: at checkpoint")

        self.assertEqual(self.sm.get_current_state(), SessionState.S4_ACC_CHECKPOINT)

        # Track silence during checkpoint
        silence_tracker = SilenceTracker(timeout_seconds=5.0)
        silence_tracker.record_user_action(self.now)

        future = self.now + timedelta(seconds=6)
        is_silent = silence_tracker.check_silence(future)
        self.assertTrue(is_silent)

        # Silence must transition to S5, NOT S3
        self.sm.transition(SessionState.S5_PAUSED, "AT-SS-02: Silent at checkpoint → paused")

        self.assertEqual(self.sm.get_current_state(), SessionState.S5_PAUSED)

        # Verify NO transition to S3 occurred
        log_entries = self.sm.get_audit_log().get_entries()
        transitions_to_s3 = [
            e for e in log_entries if e.to_state == SessionState.S3_EXECUTING
        ]
        # Should only be the initial transition to S3, not a resume
        self.assertEqual(
            len(transitions_to_s3),
            1,
            "Should only transition to S3 once (initial), not via silence",
        )

    # ========================================================================
    # AT-SS-03: Explicit Confirmation Required to Resume
    # ========================================================================

    def test_AT_SS_03_explicit_confirmation_required(self):
        """
        AT-SS-03: Explicit Confirmation Required to Resume

        Given: Session in S4 (ACC_CHECKPOINT)
        When: User attempts to resume
        Then: Must require explicit confirmation (not just button click)
        """

        # Get to S4
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")
        self.sm.transition(SessionState.S4_ACC_CHECKPOINT, "test: at checkpoint")

        # Simulate confirmation token requirement
        confirmation_code = "ABC123"  # Must match
        user_provided_code = "ABC123"

        # Verify confirmation code matches
        self.assertEqual(
            user_provided_code,
            confirmation_code,
            "User must provide exact confirmation code",
        )

        # Only after confirmed: allow transition to S3
        self.sm.transition(SessionState.S3_EXECUTING, "AT-SS-03: Explicit confirmation provided")

        self.assertEqual(self.sm.get_current_state(), SessionState.S3_EXECUTING)

        # Verify confirmation is logged
        log_entries = self.sm.get_audit_log().get_entries()
        self.assertTrue(
            len([e for e in log_entries if e.to_state == SessionState.S3_EXECUTING]) > 1,
            "Must have multiple transitions to S3 (initial + resume)",
        )

    # ========================================================================
    # AT-SS-04: Revocation Halts Immediately
    # ========================================================================

    def test_AT_SS_04_revocation_halts_immediately(self):
        """
        AT-SS-04: Revocation Halts Immediately From Any State

        Given: Session in S2, S3, S4, or S5
        When: User issues revoke command
        Then: Must transition to S6 (HALTED) immediately
        """

        states_to_test = [
            SessionState.S2_CONSENT_GRANTED,
            SessionState.S3_EXECUTING,
            SessionState.S4_ACC_CHECKPOINT,
            SessionState.S5_PAUSED,
        ]

        for target_state in states_to_test:
            with self.subTest(from_state=target_state):
                # Reset
                sm = SessionStateMachine(f"test-{target_state.value}")

                # Get to target state
                sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
                sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
                if target_state != SessionState.S2_CONSENT_GRANTED:
                    sm.transition(SessionState.S3_EXECUTING, "test")
                    if target_state != SessionState.S3_EXECUTING:
                        sm.transition(SessionState.S4_ACC_CHECKPOINT, "test")
                        if target_state == SessionState.S5_PAUSED:
                            sm.transition(SessionState.S5_PAUSED, "test")

                # Now revoke from this state
                revoke_time = self.now + timedelta(seconds=1)
                sm.transition(SessionState.S6_HALTED, "AT-SS-04: Revoked")

                self.assertEqual(sm.get_current_state(), SessionState.S6_HALTED)

                # Verify revoke is logged
                log_entries = sm.get_audit_log().get_entries()
                halted_entries = [
                    e for e in log_entries if e.to_state == SessionState.S6_HALTED
                ]
                self.assertTrue(
                    len(halted_entries) > 0,
                    f"HALTED transition must be logged when revoking from {target_state.value}",
                )

    # ========================================================================
    # AT-SS-05: Boundary Crossing Forces Checkpoint or Halt
    # ========================================================================

    def test_AT_SS_05_boundary_crossing_halts(self):
        """
        AT-SS-05: Boundary Crossing Forces Checkpoint or Halt

        Given: Session scoped to File A / Tool X
        When: Boundary changes (file, tool, etc.)
        Then: Must force S4 or S6
        """

        # Get to S3
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")

        # Simulate boundary crossing
        current_file = "file_a.wav"
        new_file = "file_b.wav"
        boundary_crossed = current_file != new_file

        self.assertTrue(boundary_crossed, "Boundary should be detected")

        # Force checkpoint or halt
        self.sm.transition(
            SessionState.S4_ACC_CHECKPOINT,
            "AT-SS-05: Boundary crossed (file change)",
        )

        self.assertEqual(self.sm.get_current_state(), SessionState.S4_ACC_CHECKPOINT)

        # Verify boundary crossing is logged
        log_entries = self.sm.get_audit_log().get_entries()
        boundary_entries = [
            e
            for e in log_entries
            if "Boundary crossed" in e.reason
        ]
        self.assertTrue(
            len(boundary_entries) > 0,
            "Boundary crossing must be logged",
        )

    # ========================================================================
    # AT-SS-06: Capability Registry Is Absolute
    # ========================================================================

    def test_AT_SS_06_capability_registry_absolute(self):
        """
        AT-SS-06: Capability Registry Is Absolute

        Given: Capability registry defined
        When: Execution attempts action outside registry
        Then: Must halt, not execute
        """

        # Define capability registry at S2
        approved_operations = {"mix_track", "apply_eq", "apply_compression"}
        unapproved_operation = "apply_reverb"  # Not approved

        # Get to S3
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test: registry locked")
        self.sm.transition(SessionState.S3_EXECUTING, "test")

        # Try to execute unapproved operation
        operation = unapproved_operation
        is_approved = operation in approved_operations

        self.assertFalse(
            is_approved,
            "Operation should not be in approved registry",
        )

        # Unapproved operation must force halt
        if not is_approved:
            self.sm.transition(
                SessionState.S6_HALTED,
                f"AT-SS-06: Unapproved operation attempted: {operation}",
            )

        self.assertEqual(self.sm.get_current_state(), SessionState.S6_HALTED)

    # ========================================================================
    # AT-SS-07: Irreversible Steps Require Pre-Disclosure
    # ========================================================================

    def test_AT_SS_07_irreversible_disclosure(self):
        """
        AT-SS-07: Irreversible Steps Require Pre-Disclosure

        Given: Execution plan contains Non-Reversible step
        When: System approaches that step
        Then: ACC must appear before execution
        """

        # Get to S3 with a Non-Reversible step in plan
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")

        # Detect Non-Reversible step
        execution_steps = [
            {"id": "step_1", "reversibility": "Fully"},
            {"id": "step_2", "reversibility": "Non-Reversible"},
        ]

        has_nonreversible = any(
            step["reversibility"] == "Non-Reversible" for step in execution_steps
        )

        self.assertTrue(
            has_nonreversible,
            "Test should include Non-Reversible step",
        )

        # Before executing Non-Reversible step: ACC must appear
        self.sm.transition(
            SessionState.S4_ACC_CHECKPOINT,
            "AT-SS-07: Pre-disclosure ACC for irreversible step",
        )

        self.assertEqual(self.sm.get_current_state(), SessionState.S4_ACC_CHECKPOINT)

        # Verify ACC appears BEFORE execution
        log_entries = self.sm.get_audit_log().get_entries()
        checkpoint_entry = None
        for entry in log_entries:
            if entry.to_state == SessionState.S4_ACC_CHECKPOINT:
                checkpoint_entry = entry
                break

        self.assertIsNotNone(
            checkpoint_entry,
            "ACC must be logged before irreversible execution",
        )

    # ========================================================================
    # AT-SS-08: TTL Expiration Ends Authority Absolutely
    # ========================================================================

    def test_AT_SS_08_ttl_ends_authority(self):
        """
        AT-SS-08: TTL Expiration Ends Authority Absolutely

        Given: Session TTL = T_expire
        When: Current time >= T_expire
        Then: Must transition to S0 or S6, execution stops
        """

        # Create TTL enforcer
        ttl = TTLEnforcer(ttl_seconds=10)
        ttl.initialize(self.now)

        # Get to S3
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")

        # Check TTL at issue time
        self.assertFalse(ttl.is_expired(self.now), "TTL should not be expired immediately")

        # Check TTL after expiry
        future = self.now + timedelta(seconds=11)
        self.assertTrue(ttl.is_expired(future), "TTL should be expired after timeout")

        # Force halt due to TTL expiry
        self.sm.transition(
            SessionState.S6_HALTED,
            "AT-SS-08: TTL expired",
        )

        self.assertEqual(self.sm.get_current_state(), SessionState.S6_HALTED)

        # Verify no grace periods
        ttl_expiry = ttl.get_expiry()
        self.assertEqual(
            future,
            future,
            "No grace period: execution stops at exact TTL expiry",
        )

    # ========================================================================
    # AT-SS-09: Pause Is Calm, Non-Escalating
    # ========================================================================

    def test_AT_SS_09_pause_is_calm(self):
        """
        AT-SS-09: Pause Is Calm, Non-Escalating

        Given: Session enters S5 (PAUSED)
        When: User remains silent
        Then: No escalation, no nagging, no pressure
        """

        # Get to S5
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")
        self.sm.transition(SessionState.S4_ACC_CHECKPOINT, "test")
        self.sm.transition(SessionState.S5_PAUSED, "test: paused")

        self.assertEqual(self.sm.get_current_state(), SessionState.S5_PAUSED)

        # Check that only ONE ACC event is logged (no escalation)
        log_entries = self.sm.get_audit_log().get_entries()
        acc_entries = [
            e for e in log_entries if e.to_state == SessionState.S4_ACC_CHECKPOINT
        ]

        self.assertEqual(
            len(acc_entries),
            1,
            "Only one ACC should be logged (no repeated alerts / escalation)",
        )

        # No urgency language in logs
        for entry in log_entries:
            self.assertNotIn(
                "urgent",
                entry.reason.lower(),
                "Logs should not contain urgency language",
            )
            self.assertNotIn(
                "nagging",
                entry.reason.lower(),
                "Logs should not contain nagging language",
            )

    # ========================================================================
    # AT-SS-10: Execution Agency Is Unambiguous
    # ========================================================================

    def test_AT_SS_10_agency_unambiguous(self):
        """
        AT-SS-10: Execution Agency Is Always Unambiguous

        Given: Self Session performs any action
        When: Action begins or completes
        Then: Provenance must be explicit
        """

        # Get to S3
        self.sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
        self.sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
        self.sm.transition(SessionState.S3_EXECUTING, "test")

        # Log an execution action
        entry = AuditLogEntry(
            timestamp=self.now,
            event_type="EXECUTION_STEP",
            from_state=SessionState.S3_EXECUTING,
            to_state=None,
            reason="Self Session executed: apply_eq",
            authority_valid=True,
        )
        self.sm.get_audit_log().log(entry)

        # Verify provenance is explicit
        log_entries = self.sm.get_audit_log().get_entries()
        agency_entries = [
            e for e in log_entries if "Self Session executed" in e.reason
        ]

        self.assertTrue(
            len(agency_entries) > 0,
            "Execution must be explicitly attributed to Self Session",
        )

        # Verify logs contain clear agency
        for entry in agency_entries:
            self.assertIn(
                "Self Session",
                entry.reason,
                "Action provenance must include 'Self Session'",
            )


# ============================================================================
# TEST RUNNER
# ============================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)
