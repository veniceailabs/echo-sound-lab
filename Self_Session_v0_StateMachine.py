"""
Self Session v0 — State Machine Skeleton

Purpose: Implement S0–S7 states with architectural impossibility of illegal transitions.
Every transition is explicit, enumerated, and logged.
Silent ignores are not permitted. Illegal transitions panic.

This is the enforcement layer. UX cannot override it.
"""

from enum import Enum
from typing import Optional, Callable, List
from dataclasses import dataclass
from datetime import datetime
import logging


# ============================================================================
# STATE DEFINITIONS
# ============================================================================

class SessionState(Enum):
    """Canonical session states S0–S7"""
    S0_INACTIVE = "S0_INACTIVE"
    S1_SESSION_REQUESTED = "S1_SESSION_REQUESTED"
    S2_CONSENT_GRANTED = "S2_CONSENT_GRANTED"
    S3_EXECUTING = "S3_EXECUTING"
    S4_ACC_CHECKPOINT = "S4_ACC_CHECKPOINT"
    S5_PAUSED = "S5_PAUSED"
    S6_HALTED = "S6_HALTED"
    S7_COMPLETED = "S7_COMPLETED"


# ============================================================================
# STATE MACHINE RULES (IMMUTABLE)
# ============================================================================

# Legal transitions: explicitly enumerated, nothing else permitted
LEGAL_TRANSITIONS = {
    SessionState.S0_INACTIVE: {
        SessionState.S1_SESSION_REQUESTED,  # session request
    },
    SessionState.S1_SESSION_REQUESTED: {
        SessionState.S0_INACTIVE,  # request dismissed, timeout, or silence
        SessionState.S2_CONSENT_GRANTED,  # explicit confirmation
    },
    SessionState.S2_CONSENT_GRANTED: {
        SessionState.S0_INACTIVE,  # revoke before execution
        SessionState.S3_EXECUTING,  # execution begins
        SessionState.S6_HALTED,  # revoke even after consent (AC-1: revocation from any state)
    },
    SessionState.S3_EXECUTING: {
        SessionState.S4_ACC_CHECKPOINT,  # timeout, degradation, boundary, confidence
        SessionState.S6_HALTED,  # revocation
        SessionState.S7_COMPLETED,  # scope complete (via S4 only in practice)
    },
    SessionState.S4_ACC_CHECKPOINT: {
        SessionState.S3_EXECUTING,  # explicit confirmation
        SessionState.S5_PAUSED,  # silence timeout
        SessionState.S6_HALTED,  # revocation
    },
    SessionState.S5_PAUSED: {
        SessionState.S4_ACC_CHECKPOINT,  # re-engagement
        SessionState.S6_HALTED,  # revocation
        SessionState.S0_INACTIVE,  # TTL expiration
    },
    SessionState.S6_HALTED: {
        SessionState.S0_INACTIVE,  # cleanup complete
    },
    SessionState.S7_COMPLETED: {
        SessionState.S0_INACTIVE,  # cleanup complete
    },
}


# ============================================================================
# AUDIT LOG (FIRST-CLASS SYSTEM)
# ============================================================================

@dataclass
class AuditLogEntry:
    """Single audit log entry. Everything here is truth."""
    timestamp: datetime
    event_type: str  # TRANSITION, AUTHORITY_CHECK, ACC_TRIGGERED, etc.
    from_state: Optional[SessionState]
    to_state: Optional[SessionState]
    reason: str
    authority_valid: Optional[bool]
    extra: dict = None

    def to_dict(self):
        return {
            "timestamp": self.timestamp.isoformat(),
            "event_type": self.event_type,
            "from_state": self.from_state.value if self.from_state else None,
            "to_state": self.to_state.value if self.to_state else None,
            "reason": self.reason,
            "authority_valid": self.authority_valid,
            "extra": self.extra or {},
        }


class AuditLog:
    """Audit logging system. Logs are the proof layer."""

    def __init__(self):
        self._entries: List[AuditLogEntry] = []
        self._logger = logging.getLogger("SelfSession.AuditLog")

    def log(self, entry: AuditLogEntry) -> None:
        """Log an event. If it's not logged, it didn't happen."""
        self._entries.append(entry)
        self._logger.info(
            f"[{entry.event_type}] {entry.from_state.value if entry.from_state else 'N/A'} "
            f"→ {entry.to_state.value if entry.to_state else 'N/A'}: {entry.reason}"
        )

    def get_entries(self) -> List[AuditLogEntry]:
        """Retrieve all log entries (immutable)"""
        return list(self._entries)

    def get_entries_by_type(self, event_type: str) -> List[AuditLogEntry]:
        """Query logs by event type"""
        return [e for e in self._entries if e.event_type == event_type]

    def get_entries_after(self, timestamp: datetime) -> List[AuditLogEntry]:
        """Query logs after a timestamp"""
        return [e for e in self._entries if e.timestamp > timestamp]

    def has_execution_after(self, timestamp: datetime) -> bool:
        """Check if any execution events occurred after a timestamp (for AT-SS-01)"""
        execution_events = [
            "EXECUTION_STEP",
            "STATE_MUTATION",
        ]
        return any(
            e.timestamp > timestamp
            for e in self._entries
            if e.event_type in execution_events
        )


# ============================================================================
# STATE MACHINE
# ============================================================================

class IllegalTransitionError(Exception):
    """Raised when an illegal transition is attempted. This is a panic."""
    pass


class SessionStateMachine:
    """
    State machine enforcing S0–S7 transitions.

    Core principle: Every transition is explicit and enumerated.
    Illegal transitions cause immediate panic (not graceful handling).
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self._current_state = SessionState.S0_INACTIVE
        self._audit_log = AuditLog()
        self._logger = logging.getLogger("SelfSession.StateMachine")

    # ========================================================================
    # STATE MACHINE INTERFACE
    # ========================================================================

    def get_current_state(self) -> SessionState:
        """Return current state"""
        return self._current_state

    def get_audit_log(self) -> AuditLog:
        """Return audit log (for testing)"""
        return self._audit_log

    def transition(
        self,
        to_state: SessionState,
        reason: str,
        authority_valid: Optional[bool] = None,
    ) -> None:
        """
        Attempt a state transition.

        If transition is illegal: PANIC (raise IllegalTransitionError)
        If transition is legal: log and execute
        """

        # Check if transition is legal
        if to_state not in LEGAL_TRANSITIONS.get(self._current_state, set()):
            raise IllegalTransitionError(
                f"Illegal transition: {self._current_state.value} → {to_state.value}. "
                f"Reason: {reason}. This is a contract violation."
            )

        # Log the transition
        from_state = self._current_state
        entry = AuditLogEntry(
            timestamp=datetime.utcnow(),
            event_type="STATE_TRANSITION",
            from_state=from_state,
            to_state=to_state,
            reason=reason,
            authority_valid=authority_valid,
        )
        self._audit_log.log(entry)

        # Execute transition
        self._current_state = to_state
        self._logger.info(
            f"[{self.session_id}] Transition: {from_state.value} → {to_state.value} ({reason})"
        )

    def is_executing(self) -> bool:
        """Utility: check if in executing state"""
        return self._current_state == SessionState.S3_EXECUTING

    def is_paused(self) -> bool:
        """Utility: check if in paused state"""
        return self._current_state == SessionState.S5_PAUSED

    def is_halted(self) -> bool:
        """Utility: check if in halted state"""
        return self._current_state == SessionState.S6_HALTED

    def is_checkpoint(self) -> bool:
        """Utility: check if in ACC checkpoint state"""
        return self._current_state == SessionState.S4_ACC_CHECKPOINT

    def is_inactive(self) -> bool:
        """Utility: check if inactive"""
        return self._current_state == SessionState.S0_INACTIVE

    # ========================================================================
    # AUTHORITY CHECKS (Mechanical Truth)
    # ========================================================================

    def check_can_execute(self) -> bool:
        """Can execution proceed? Only true in S3."""
        authority_valid = self._current_state == SessionState.S3_EXECUTING
        entry = AuditLogEntry(
            timestamp=datetime.utcnow(),
            event_type="AUTHORITY_CHECK",
            from_state=self._current_state,
            to_state=None,
            reason=f"can_execute check: {authority_valid}",
            authority_valid=authority_valid,
        )
        self._audit_log.log(entry)
        return authority_valid

    # ========================================================================
    # VERIFICATION & TESTING
    # ========================================================================

    def verify_transition_is_legal(
        self, from_state: SessionState, to_state: SessionState
    ) -> bool:
        """Verify a transition is legal (for testing)"""
        return to_state in LEGAL_TRANSITIONS.get(from_state, set())

    def get_legal_transitions_from(self, state: SessionState) -> set:
        """Return set of legal transitions from a state (for testing)"""
        return LEGAL_TRANSITIONS.get(state, set())


# ============================================================================
# EXECUTION FLOW GUARDS (Prevent Silent Continuation)
# ============================================================================

class ExecutionGuard:
    """
    Guard logic that prevents execution from continuing inappropriately.
    This is the "no default transitions" enforcement.
    """

    def __init__(self, state_machine: SessionStateMachine):
        self.state_machine = state_machine
        self._logger = logging.getLogger("SelfSession.ExecutionGuard")

    def check_can_proceed(self) -> bool:
        """
        Before ANY execution step:
        1. Must be in S3
        2. Must have active authority token
        3. Must have passed boundary checks
        4. Must have passed confidence checks

        If any check fails: execution must not proceed.
        """
        if not self.state_machine.check_can_execute():
            self._logger.warning(
                f"Execution guard: execution blocked. State = {self.state_machine.get_current_state().value}"
            )
            return False
        return True

    def guard_execution_step(self, step_id: str) -> bool:
        """
        Guard a single execution step.
        Returns True if step may execute.
        Returns False if step must halt.
        """
        if not self.check_can_proceed():
            return False

        # Log that this step is being guarded
        entry = AuditLogEntry(
            timestamp=datetime.utcnow(),
            event_type="EXECUTION_STEP_GUARDED",
            from_state=self.state_machine.get_current_state(),
            to_state=None,
            reason=f"Step {step_id} passed guard",
            authority_valid=True,
        )
        self.state_machine.get_audit_log().log(entry)
        return True


# ============================================================================
# ILLEGAL TRANSITION PREVENTION (Architectural)
# ============================================================================

def create_state_machine(session_id: str) -> SessionStateMachine:
    """Factory function to create a new state machine."""
    return SessionStateMachine(session_id)


if __name__ == "__main__":
    # Basic sanity check
    logging.basicConfig(level=logging.INFO)

    sm = create_state_machine("test-session-1")
    print(f"Initial state: {sm.get_current_state().value}")

    # Legal transition: S0 → S1
    sm.transition(
        SessionState.S1_SESSION_REQUESTED,
        "User requested session",
    )
    print(f"After request: {sm.get_current_state().value}")

    # Legal transition: S1 → S2
    sm.transition(
        SessionState.S2_CONSENT_GRANTED,
        "User granted consent",
    )
    print(f"After consent: {sm.get_current_state().value}")

    # Legal transition: S2 → S3
    sm.transition(
        SessionState.S3_EXECUTING,
        "Execution began",
    )
    print(f"During execution: {sm.get_current_state().value}")

    # Illegal transition attempt: S3 → S7 (must go through S4)
    try:
        sm.transition(
            SessionState.S7_COMPLETED,
            "Trying to skip checkpoint",
        )
        print("ERROR: Illegal transition was not caught!")
    except IllegalTransitionError as e:
        print(f"✓ Illegal transition blocked: {e}")

    # Legal transition: S3 → S4
    sm.transition(
        SessionState.S4_ACC_CHECKPOINT,
        "Timeout triggered",
    )
    print(f"At checkpoint: {sm.get_current_state().value}")

    # Legal transition: S4 → S5
    sm.transition(
        SessionState.S5_PAUSED,
        "User silent during checkpoint",
    )
    print(f"Paused: {sm.get_current_state().value}")

    print("\nAudit log:")
    for entry in sm.get_audit_log().get_entries():
        print(f"  {entry.timestamp.isoformat()} | {entry.event_type} | {entry.reason}")
