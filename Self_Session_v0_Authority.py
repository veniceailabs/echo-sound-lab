"""
Self Session v0 — Authority Token Lifecycle

Purpose: Implement authority token issuance, validation, revocation, and TTL.
Authority is the permission to execute. When authority expires or is revoked,
execution must stop.

Core principle: Authority tokens are issued, scoped, time-bounded, and revocable.
They do not persist silently. Silence collapses authority.
"""

from enum import Enum
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, List
import uuid
import logging


# ============================================================================
# AUTHORITY TOKEN DEFINITION
# ============================================================================

@dataclass
class AuthorityToken:
    """
    A token representing delegated authority to execute.
    Tokens are immutable once issued.
    """

    token_id: str  # UUID, unique identifier
    session_id: str
    issued_at: datetime
    ttl_seconds: int  # Time to live, in seconds
    scope: str  # What this token permits (capability_registry_id, etc.)
    is_revoked: bool = False
    revoked_at: Optional[datetime] = None

    def is_expired(self, current_time: datetime) -> bool:
        """Check if token has expired by TTL"""
        expiry = self.issued_at + timedelta(seconds=self.ttl_seconds)
        return current_time >= expiry

    def is_valid(self, current_time: datetime) -> bool:
        """Check if token is currently valid (not revoked, not expired)"""
        return not self.is_revoked and not self.is_expired(current_time)

    def get_ttl_remaining(self, current_time: datetime) -> timedelta:
        """Get remaining TTL"""
        expiry = self.issued_at + timedelta(seconds=self.ttl_seconds)
        remaining = expiry - current_time
        return remaining if remaining.total_seconds() > 0 else timedelta(0)

    def revoke(self, revoke_time: datetime) -> None:
        """Revoke the token. Irreversible."""
        self.is_revoked = True
        self.revoked_at = revoke_time


# ============================================================================
# AUTHORITY MANAGER
# ============================================================================

class AuthorityManager:
    """
    Manages authority token lifecycle: issue, validate, revoke, expire.
    All operations are logged.
    """

    def __init__(self, audit_log=None):
        self._tokens: dict[str, AuthorityToken] = {}  # token_id → token
        self._session_tokens: dict[str, List[str]] = {}  # session_id → [token_ids]
        self._audit_log = audit_log
        self._logger = logging.getLogger("SelfSession.AuthorityManager")

    def issue_token(
        self,
        session_id: str,
        ttl_seconds: int,
        scope: str,
    ) -> AuthorityToken:
        """
        Issue a new authority token.
        Tokens are scoped to a session and expire by TTL.
        """

        token_id = str(uuid.uuid4())
        now = datetime.utcnow()

        token = AuthorityToken(
            token_id=token_id,
            session_id=session_id,
            issued_at=now,
            ttl_seconds=ttl_seconds,
            scope=scope,
        )

        self._tokens[token_id] = token

        if session_id not in self._session_tokens:
            self._session_tokens[session_id] = []
        self._session_tokens[session_id].append(token_id)

        self._logger.info(
            f"[{session_id}] Authority token issued: {token_id[:8]}... "
            f"(TTL: {ttl_seconds}s, Scope: {scope})"
        )

        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=now,
                event_type="AUTHORITY_ISSUED",
                from_state=None,
                to_state=None,
                reason=f"Token {token_id[:8]}... issued with TTL {ttl_seconds}s",
                authority_valid=True,
            )
            self._audit_log.log(entry)

        return token

    def validate_token(self, token_id: str, current_time: datetime) -> bool:
        """
        Validate that a token is still valid.
        Returns True if token is valid, False if expired or revoked.
        """

        if token_id not in self._tokens:
            self._logger.warning(f"Token validation failed: unknown token {token_id[:8]}...")
            return False

        token = self._tokens[token_id]
        is_valid = token.is_valid(current_time)

        if not is_valid:
            if token.is_revoked:
                self._logger.info(f"Token validation failed: token {token_id[:8]}... is revoked")
            else:
                self._logger.info(f"Token validation failed: token {token_id[:8]}... expired")

        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=current_time,
                event_type="AUTHORITY_CHECK",
                from_state=None,
                to_state=None,
                reason=f"Token {token_id[:8]}... validation: {is_valid}",
                authority_valid=is_valid,
            )
            self._audit_log.log(entry)

        return is_valid

    def revoke_token(self, token_id: str, revoke_time: datetime) -> None:
        """
        Revoke a token immediately.
        Revocation is irreversible and instantaneous.
        """

        if token_id not in self._tokens:
            self._logger.warning(f"Revoke failed: unknown token {token_id[:8]}...")
            return

        token = self._tokens[token_id]
        token.revoke(revoke_time)

        self._logger.info(f"Token {token_id[:8]}... revoked at {revoke_time.isoformat()}")

        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=revoke_time,
                event_type="AUTHORITY_REVOKED",
                from_state=None,
                to_state=None,
                reason=f"Token {token_id[:8]}... revoked",
                authority_valid=False,
            )
            self._audit_log.log(entry)

    def revoke_session_tokens(self, session_id: str, revoke_time: datetime) -> None:
        """
        Revoke all tokens associated with a session.
        """

        if session_id not in self._session_tokens:
            return

        token_ids = self._session_tokens[session_id]
        for token_id in token_ids:
            self.revoke_token(token_id, revoke_time)

        self._logger.info(f"All tokens for session {session_id} revoked ({len(token_ids)} tokens)")

    def get_token(self, token_id: str) -> Optional[AuthorityToken]:
        """Retrieve a token by ID (for testing)"""
        return self._tokens.get(token_id)

    def get_session_tokens(self, session_id: str) -> List[AuthorityToken]:
        """Get all tokens for a session (for testing)"""
        if session_id not in self._session_tokens:
            return []
        return [self._tokens[token_id] for token_id in self._session_tokens[session_id]]


# ============================================================================
# SILENCE TRACKING & TTL ENFORCEMENT
# ============================================================================

class SilenceTracker:
    """
    Tracks user activity and detects silence.
    Silence triggers ACC checkpoint.
    """

    def __init__(self, timeout_seconds: float = 30.0):
        self.timeout_seconds = timeout_seconds
        self._last_user_action_time: Optional[datetime] = None
        self._logger = logging.getLogger("SelfSession.SilenceTracker")

    def record_user_action(self, timestamp: datetime) -> None:
        """Record that user took an explicit action"""
        self._last_user_action_time = timestamp
        self._logger.debug(f"User action recorded at {timestamp.isoformat()}")

    def check_silence(self, current_time: datetime) -> bool:
        """
        Check if silence timeout has been exceeded.
        Returns True if silence has occurred (timeout exceeded).
        Returns False if user has acted recently.
        """

        if self._last_user_action_time is None:
            # No action recorded yet, treat as silence
            return True

        time_since_action = (current_time - self._last_user_action_time).total_seconds()
        silence_detected = time_since_action > self.timeout_seconds

        if silence_detected:
            self._logger.info(
                f"Silence detected: {time_since_action:.1f}s > {self.timeout_seconds}s"
            )

        return silence_detected

    def get_time_until_silence(self, current_time: datetime) -> float:
        """
        Get seconds remaining before silence timeout.
        Used for testing and monitoring.
        """

        if self._last_user_action_time is None:
            return 0.0

        time_since_action = (current_time - self._last_user_action_time).total_seconds()
        remaining = self.timeout_seconds - time_since_action
        return max(0.0, remaining)


# ============================================================================
# TTL ENFORCEMENT
# ============================================================================

class TTLEnforcer:
    """
    Enforces session TTL (time-to-live).
    When TTL expires, session must terminate.
    No grace periods, no extensions.
    """

    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self._created_at: Optional[datetime] = None
        self._logger = logging.getLogger("SelfSession.TTLEnforcer")

    def initialize(self, created_at: datetime) -> None:
        """Initialize the TTL countdown"""
        self._created_at = created_at
        self._logger.info(f"TTL initialized: {self.ttl_seconds}s (expires at {self.get_expiry().isoformat()})")

    def get_expiry(self) -> datetime:
        """Get the absolute expiry timestamp"""
        if self._created_at is None:
            raise RuntimeError("TTL not initialized")
        return self._created_at + timedelta(seconds=self.ttl_seconds)

    def is_expired(self, current_time: datetime) -> bool:
        """Check if TTL has expired"""
        if self._created_at is None:
            return False

        expired = current_time >= self.get_expiry()
        if expired:
            self._logger.warning(f"TTL expired at {current_time.isoformat()}")
        return expired

    def get_remaining(self, current_time: datetime) -> timedelta:
        """Get remaining TTL"""
        if self._created_at is None:
            return timedelta(0)

        expiry = self.get_expiry()
        remaining = expiry - current_time
        return remaining if remaining.total_seconds() > 0 else timedelta(0)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test token issuance and validation
    auth_mgr = AuthorityManager()
    now = datetime.utcnow()

    token = auth_mgr.issue_token("session-1", ttl_seconds=60, scope="mix_track")
    print(f"✓ Token issued: {token.token_id[:8]}...")

    # Validate immediately
    valid = auth_mgr.validate_token(token.token_id, now)
    print(f"✓ Token valid at issue time: {valid}")

    # Validate after TTL expiry
    future = now + timedelta(seconds=65)
    valid_future = auth_mgr.validate_token(token.token_id, future)
    print(f"✓ Token valid after TTL expiry: {valid_future}")

    # Test silence tracking
    silence_tracker = SilenceTracker(timeout_seconds=5.0)
    print(f"✓ Initial silence check: {silence_tracker.check_silence(now)}")

    silence_tracker.record_user_action(now)
    print(f"✓ Silence after user action: {silence_tracker.check_silence(now)}")

    future_silence = now + timedelta(seconds=6)
    print(f"✓ Silence after timeout: {silence_tracker.check_silence(future_silence)}")

    # Test TTL enforcer
    ttl = TTLEnforcer(ttl_seconds=10)
    ttl.initialize(now)
    print(f"✓ TTL enforcer initialized, expires at {ttl.get_expiry().isoformat()}")
    print(f"✓ TTL expired at issue: {ttl.is_expired(now)}")
    print(f"✓ TTL expired after: {ttl.is_expired(now + timedelta(seconds=11))}")
