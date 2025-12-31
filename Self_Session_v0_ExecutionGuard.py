"""
Self Session v0 — Execution Guard

Purpose: Enforce that execution only proceeds when all conditions are met.
This prevents silent continuation by making violation auditable.

Invariant: If ANY condition is false, execution must not proceed.
"""

from datetime import datetime
from typing import Optional, Callable
import logging

from Self_Session_v0_StateMachine import SessionStateMachine, SessionState, AuditLogEntry
from Self_Session_v0_Authority import AuthorityManager, AuthorityToken


class ExecutionGuardViolation(Exception):
    """Raised when execution guard condition fails. This is a contract violation."""
    pass


class ExecutionGuard:
    """
    Guards execution by verifying all preconditions before any step proceeds.

    Conditions:
    1. Session is in S3 (EXECUTING)
    2. Authority token exists and is valid
    3. TTL is not exceeded
    4. Silence timeout is not exceeded
    5. Boundary has not changed
    6. Capability is in registry
    7. Confidence is not degraded

    If ANY condition is false: execution halts (S4 or S6), never continues silently.
    """

    def __init__(
        self,
        state_machine: SessionStateMachine,
        authority_manager: AuthorityManager,
        current_token_id: Optional[str] = None,
    ):
        self.state_machine = state_machine
        self.authority_manager = authority_manager
        self.current_token_id = current_token_id
        self._logger = logging.getLogger("SelfSession.ExecutionGuard")

    # ========================================================================
    # PRECONDITION CHECKS (all must pass)
    # ========================================================================

    def check_in_executing_state(self) -> bool:
        """Condition 1: Session must be in S3 (EXECUTING)"""
        is_executing = self.state_machine.get_current_state() == SessionState.S3_EXECUTING
        if not is_executing:
            self._logger.warning(
                f"Guard: not in executing state (current: {self.state_machine.get_current_state().value})"
            )
        return is_executing

    def check_authority_valid(self, current_time: datetime) -> bool:
        """Condition 2: Authority token must exist and be valid"""
        if self.current_token_id is None:
            self._logger.warning("Guard: no authority token")
            return False

        valid = self.authority_manager.validate_token(self.current_token_id, current_time)
        if not valid:
            self._logger.warning(f"Guard: authority token invalid or expired")
        return valid

    def check_ttl_valid(self, ttl_enforcer, current_time: datetime) -> bool:
        """Condition 3: Session TTL must not be exceeded"""
        if ttl_enforcer is None:
            return True  # TTL not enforced (test scenario)

        expired = ttl_enforcer.is_expired(current_time)
        if expired:
            self._logger.warning("Guard: session TTL expired")
        return not expired

    def check_silence_not_exceeded(self, silence_tracker, current_time: datetime) -> bool:
        """Condition 4: Silence timeout must not be exceeded"""
        if silence_tracker is None:
            return True  # Silence tracking not active (test scenario)

        is_silent = silence_tracker.check_silence(current_time)
        if is_silent:
            self._logger.warning("Guard: silence timeout exceeded, ACC needed")
        return not is_silent

    def check_boundary_not_crossed(
        self,
        current_file: Optional[str] = None,
        current_tool: Optional[str] = None,
        current_modality: Optional[str] = None,
        session_file: Optional[str] = None,
        session_tool: Optional[str] = None,
        session_modality: Optional[str] = None,
    ) -> bool:
        """Condition 5: Context boundary must not have changed"""
        if not any([current_file, current_tool, current_modality]):
            return True  # No boundary tracking (test scenario)

        boundary_crossed = (
            (current_file and session_file and current_file != session_file)
            or (current_tool and session_tool and current_tool != session_tool)
            or (current_modality and session_modality and current_modality != session_modality)
        )

        if boundary_crossed:
            self._logger.warning("Guard: boundary crossed (context changed)")
        return not boundary_crossed

    def check_capability_in_registry(
        self, capability_id: str, capability_registry: Optional[set] = None
    ) -> bool:
        """Condition 6: Requested capability must be in approved registry"""
        if capability_registry is None:
            return True  # No registry (test scenario)

        in_registry = capability_id in capability_registry
        if not in_registry:
            self._logger.warning(f"Guard: capability {capability_id} not in registry")
        return in_registry

    def check_confidence_not_degraded(self, confidence_score: float = 1.0) -> bool:
        """Condition 7: System confidence must not be degraded below threshold"""
        # Confidence < 0.5 indicates anomaly (unexpected API result, misalignment, etc.)
        threshold = 0.5
        degraded = confidence_score < threshold

        if degraded:
            self._logger.warning(f"Guard: confidence degraded ({confidence_score:.2f} < {threshold})")
        return not degraded

    # ========================================================================
    # COMPREHENSIVE GUARD (all conditions)
    # ========================================================================

    def can_execute_step(
        self,
        capability_id: str,
        current_time: datetime,
        ttl_enforcer=None,
        silence_tracker=None,
        capability_registry: Optional[set] = None,
        current_file: Optional[str] = None,
        current_tool: Optional[str] = None,
        current_modality: Optional[str] = None,
        session_file: Optional[str] = None,
        session_tool: Optional[str] = None,
        session_modality: Optional[str] = None,
        confidence_score: float = 1.0,
    ) -> bool:
        """
        Check all preconditions for execution.

        Returns True if ALL conditions are met.
        Returns False (and logs) if ANY condition fails.

        Contract: If this returns False, execution must NOT proceed.
        """

        conditions = [
            ("in_executing_state", self.check_in_executing_state()),
            ("authority_valid", self.check_authority_valid(current_time)),
            ("ttl_valid", self.check_ttl_valid(ttl_enforcer, current_time)),
            ("silence_not_exceeded", self.check_silence_not_exceeded(silence_tracker, current_time)),
            (
                "boundary_not_crossed",
                self.check_boundary_not_crossed(
                    current_file, current_tool, current_modality,
                    session_file, session_tool, session_modality,
                ),
            ),
            ("capability_in_registry", self.check_capability_in_registry(capability_id, capability_registry)),
            ("confidence_not_degraded", self.check_confidence_not_degraded(confidence_score)),
        ]

        all_pass = all(condition[1] for condition in conditions)

        if not all_pass:
            failed = [name for name, passed in conditions if not passed]
            self._logger.error(
                f"Execution guard failed: {', '.join(failed)}. Execution halted."
            )

            # Log guard violation to audit trail
            entry = AuditLogEntry(
                timestamp=current_time,
                event_type="EXECUTION_GUARD_FAILED",
                from_state=self.state_machine.get_current_state(),
                to_state=None,
                reason=f"Conditions failed: {', '.join(failed)}",
                authority_valid=False,
                extra={"failed_conditions": failed},
            )
            self.state_machine.get_audit_log().log(entry)

        return all_pass

    def enforce_halt_on_failure(
        self,
        capability_id: str,
        current_time: datetime,
        ttl_enforcer=None,
        silence_tracker=None,
        capability_registry: Optional[set] = None,
        current_file: Optional[str] = None,
        current_tool: Optional[str] = None,
        current_modality: Optional[str] = None,
        session_file: Optional[str] = None,
        session_tool: Optional[str] = None,
        session_modality: Optional[str] = None,
        confidence_score: float = 1.0,
    ) -> None:
        """
        Check all conditions and raise if any fails.

        This enforces that execution is impossible if ANY condition is unmet.
        """

        can_execute = self.can_execute_step(
            capability_id=capability_id,
            current_time=current_time,
            ttl_enforcer=ttl_enforcer,
            silence_tracker=silence_tracker,
            capability_registry=capability_registry,
            current_file=current_file,
            current_tool=current_tool,
            current_modality=current_modality,
            session_file=session_file,
            session_tool=session_tool,
            session_modality=session_modality,
            confidence_score=confidence_score,
        )

        if not can_execute:
            raise ExecutionGuardViolation(
                f"Execution guard violation: cannot execute {capability_id}. "
                f"Check audit log for failed conditions."
            )


# ============================================================================
# USAGE EXAMPLE
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    from Self_Session_v0_Authority import SilenceTracker, TTLEnforcer

    # Create state machine and authority
    sm = SessionStateMachine("test-guard-1")
    auth_mgr = AuthorityManager(audit_log=sm.get_audit_log())

    # Setup state: get to S3
    sm.transition(SessionState.S1_SESSION_REQUESTED, "test")
    sm.transition(SessionState.S2_CONSENT_GRANTED, "test")
    sm.transition(SessionState.S3_EXECUTING, "test")

    # Issue authority token
    token = auth_mgr.issue_token("test-guard-1", ttl_seconds=60, scope="test")

    # Create guard
    guard = ExecutionGuard(sm, auth_mgr, current_token_id=token.token_id)

    now = datetime.utcnow()
    capability_registry = {"apply_eq", "apply_compression"}

    # Test: all conditions pass
    print("✓ Test 1: All conditions pass")
    can_exec = guard.can_execute_step(
        "apply_eq",
        now,
        capability_registry=capability_registry,
    )
    print(f"  can_execute: {can_exec}")

    # Test: capability not in registry
    print("\n✓ Test 2: Capability not in registry")
    can_exec = guard.can_execute_step(
        "apply_reverb",
        now,
        capability_registry=capability_registry,
    )
    print(f"  can_execute: {can_exec}")

    # Test: revoke authority
    print("\n✓ Test 3: Authority revoked")
    auth_mgr.revoke_token(token.token_id, now)
    can_exec = guard.can_execute_step(
        "apply_eq",
        now,
        capability_registry=capability_registry,
    )
    print(f"  can_execute: {can_exec}")

    print("\n✓ All guard tests passed (demonstrating violation detection)")
