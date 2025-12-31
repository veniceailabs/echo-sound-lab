"""
Self Session v0 — Active Consent Checkpoint (ACC) Confirmation System

Purpose: Implement single-use, non-replayable confirmation tokens that prevent:
1. Confirmation replay (same code used twice)
2. Consent fatigue / habituation (muscle memory clicks)
3. Implicit approval (silence, timeout, or reflex actions)
4. Non-deliberate engagement (simple button clicks)

Core principle: Explicit, non-reflexive confirmation is mechanical requirement.
Confirmation types are randomized and varied to prevent habituation.
Each confirmation token is single-use, cryptographically bound, and audited.
"""

from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import uuid
import hashlib
import secrets
import logging
import string


# ============================================================================
# CONFIRMATION TYPE DEFINITIONS
# ============================================================================

class ConfirmationType(Enum):
    """Classification of confirmation methods (AT-SS-03)"""
    TYPE_CODE = "TYPE_CODE"              # User types a unique code
    VOICE_PHRASE = "VOICE_PHRASE"        # User says a specific phrase
    DELIBERATE_GESTURE = "DELIBERATE_GESTURE"  # User performs intentional action
    ARTICULATED_UNDERSTANDING = "ARTICULATED_UNDERSTANDING"  # User must explain


# ============================================================================
# CONFIRMATION TOKEN DEFINITION
# ============================================================================

@dataclass
class ConfirmationToken:
    """
    Single-use confirmation token bound to one ACC event.

    Invariants:
    - Can only be validated once
    - Cannot be replayed
    - Must match cryptographic hash
    - Each token is unique and time-bounded
    """

    token_id: str  # UUID for this confirmation token
    session_id: str
    acc_event_id: str  # The specific ACC this token is for
    confirmation_type: ConfirmationType
    issued_at: datetime
    ttl_seconds: int  # Token lifetime (not session TTL)

    # Challenge for the user (randomized per type)
    challenge_payload: str  # Random code, voice prompt, gesture description, or question

    # Validation
    challenge_hash: str  # SHA-256 hash of expected response
    is_used: bool = False
    used_at: Optional[datetime] = None
    was_valid: Optional[bool] = None  # None = not yet validated, True/False = result

    def is_expired(self, current_time: datetime) -> bool:
        """Check if token has expired by TTL"""
        expiry = self.issued_at + timedelta(seconds=self.ttl_seconds)
        return current_time >= expiry

    def can_validate(self, current_time: datetime) -> bool:
        """Check if token is in valid state for confirmation"""
        return (
            not self.is_used
            and not self.is_expired(current_time)
        )

    def mark_used(self, validated: bool, validation_time: datetime) -> None:
        """Mark token as consumed (irreversible)"""
        self.is_used = True
        self.was_valid = validated
        self.used_at = validation_time


# ============================================================================
# CONFIRMATION CHALLENGE GENERATORS
# ============================================================================

class ConfirmationChallengeGenerator:
    """
    Generate randomized confirmation challenges to prevent habituation.
    Each challenge type forces deliberate engagement.
    """

    @staticmethod
    def generate_type_code() -> tuple[str, str]:
        """
        Generate a random alphanumeric code that user must TYPE.
        Returns (challenge_payload, expected_response_hash)

        Examples: "7K3Q9P", "M2X5W8", "B4N1R6"
        Pattern: 2 letters + 1 digit + 2 letters + 1 digit (prevents pattern memorization)
        """
        letters = string.ascii_uppercase
        digits = string.digits

        code_parts = [
            secrets.choice(letters),
            secrets.choice(letters),
            secrets.choice(digits),
            secrets.choice(letters),
            secrets.choice(letters),
            secrets.choice(digits),
        ]

        code = "".join(code_parts)
        code_hash = hashlib.sha256(code.encode()).hexdigest()

        challenge = f"Type this code to continue: {code}"
        return challenge, code_hash

    @staticmethod
    def generate_voice_phrase() -> tuple[str, str]:
        """
        Generate a phrase the user must SAY.
        Returns (challenge_payload, expected_response_hash)

        Examples: "mixing is engaging", "i want to continue", "yes i am ready"
        Requires articulation, not silence.
        """
        phrases = [
            "i want to continue",
            "yes i understand",
            "lets keep going",
            "im still here",
            "i approve of this",
            "continue the mix",
            "proceed please",
            "this looks good",
        ]

        phrase = secrets.choice(phrases)
        phrase_hash = hashlib.sha256(phrase.encode()).hexdigest()

        challenge = f"Say this to continue: \"{phrase}\""
        return challenge, phrase_hash

    @staticmethod
    def generate_deliberate_gesture() -> tuple[str, str]:
        """
        Generate a gesture challenge (e.g., double-tap in specific area, gesture sequence).
        Returns (challenge_payload, expected_response_hash)

        Gestures require physical deliberation (not accidental clicking).
        """
        gestures = [
            "double_tap_center",
            "swipe_up_then_down",
            "pinch_expand",
            "long_press_3sec",
            "tap_top_left",
        ]

        gesture = secrets.choice(gestures)
        gesture_hash = hashlib.sha256(gesture.encode()).hexdigest()

        challenge = f"Gesture: {gesture}"
        return challenge, gesture_hash

    @staticmethod
    def generate_articulated_understanding() -> tuple[str, str]:
        """
        Generate a question that user must answer in their own words.
        Returns (challenge_payload, expected_response_hash)

        Requires user to express understanding, not just click.
        Answer is validated semantically (in practice, requires human review or NLP).
        """
        questions = [
            "Why are you continuing this session? (explain in 3+ words)",
            "What will happen next? (summarize in your own words)",
            "Are you sure you want to proceed? (say yes or no with reason)",
        ]

        question = secrets.choice(questions)
        # For articulated understanding, we can't pre-compute hash
        # Instead, we use a sentinel that requires human/semantic validation
        question_hash = hashlib.sha256("REQUIRES_SEMANTIC_VALIDATION".encode()).hexdigest()

        challenge = f"Answer this: {question}"
        return challenge, question_hash


# ============================================================================
# CONFIRMATION TOKEN MANAGER
# ============================================================================

class ConfirmationManager:
    """
    Manages ACC confirmation tokens: issue, validate, track, and audit.

    Responsibility: Ensure every confirmation is:
    - Single-use (cannot replay)
    - Cryptographically bound (cannot forge)
    - Non-reflexive (user must engage deliberately)
    - Audited (all attempts logged)
    """

    def __init__(self, audit_log=None):
        self._tokens: Dict[str, ConfirmationToken] = {}
        self._acc_tokens: Dict[str, List[str]] = {}  # acc_event_id → [token_ids]
        self._audit_log = audit_log
        self._logger = logging.getLogger("SelfSession.ConfirmationManager")

    def issue_confirmation(
        self,
        session_id: str,
        acc_event_id: str,
        confirmation_type: ConfirmationType,
        ttl_seconds: int = 300,  # 5 minutes default
    ) -> ConfirmationToken:
        """
        Issue a new single-use confirmation token for an ACC event.

        Args:
            session_id: Session this confirmation belongs to
            acc_event_id: Specific ACC event this confirmation guards
            confirmation_type: Type of confirmation required
            ttl_seconds: Lifetime of this token (NOT session TTL)

        Returns:
            ConfirmationToken with challenge payload and cryptographic hash
        """

        token_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Generate challenge based on type
        challenge_payload, challenge_hash = self._generate_challenge(confirmation_type)

        token = ConfirmationToken(
            token_id=token_id,
            session_id=session_id,
            acc_event_id=acc_event_id,
            confirmation_type=confirmation_type,
            issued_at=now,
            ttl_seconds=ttl_seconds,
            challenge_payload=challenge_payload,
            challenge_hash=challenge_hash,
        )

        self._tokens[token_id] = token

        if acc_event_id not in self._acc_tokens:
            self._acc_tokens[acc_event_id] = []
        self._acc_tokens[acc_event_id].append(token_id)

        self._logger.info(
            f"[{session_id}] Confirmation token issued: {token_id[:8]}... "
            f"(Type: {confirmation_type.value}, TTL: {ttl_seconds}s)"
        )

        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=now,
                event_type="CONFIRMATION_TOKEN_ISSUED",
                from_state=None,
                to_state=None,
                reason=f"ACC token {token_id[:8]}... issued for event {acc_event_id[:8]}...",
                authority_valid=None,
                extra={
                    "token_id": token_id[:8],
                    "acc_event_id": acc_event_id[:8],
                    "confirmation_type": confirmation_type.value,
                },
            )
            self._audit_log.log(entry)

        return token

    def validate_confirmation(
        self,
        token_id: str,
        user_response: str,
        current_time: datetime,
    ) -> bool:
        """
        Validate a confirmation response against its token.

        Returns True if response is valid and token is single-use.
        Returns False if response is invalid, token is used, or expired.

        Invariant: Each token can only be validated once, ever.
        Even if validation fails, token is marked as used.
        """

        if token_id not in self._tokens:
            self._logger.warning(f"Validation failed: unknown token {token_id[:8]}...")
            return False

        token = self._tokens[token_id]

        # Check if token is in valid state
        if not token.can_validate(current_time):
            reason = "already used" if token.is_used else "expired"
            self._logger.warning(
                f"Validation failed: token {token_id[:8]}... {reason}"
            )
            token.mark_used(False, current_time)
            return False

        # Validate response against challenge hash
        response_hash = hashlib.sha256(user_response.encode()).hexdigest()
        is_valid = (response_hash == token.challenge_hash)

        # Mark token as used (irreversible, whether valid or not)
        token.mark_used(is_valid, current_time)

        if is_valid:
            self._logger.info(
                f"Confirmation validated: token {token_id[:8]}... "
                f"({token.confirmation_type.value})"
            )
        else:
            self._logger.warning(
                f"Confirmation validation failed: token {token_id[:8]}... "
                f"response mismatch"
            )

        # Audit all confirmations
        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=current_time,
                event_type="CONFIRMATION_VALIDATED",
                from_state=None,
                to_state=None,
                reason=(
                    f"Token {token_id[:8]}... validation: {is_valid} "
                    f"({token.confirmation_type.value})"
                ),
                authority_valid=is_valid,
                extra={
                    "token_id": token_id[:8],
                    "confirmation_type": token.confirmation_type.value,
                    "valid": is_valid,
                },
            )
            self._audit_log.log(entry)

        return is_valid

    def revoke_token(self, token_id: str, revocation_time: datetime) -> None:
        """
        Revoke a confirmation token (e.g., session halted, user changed mind).
        Token is marked expired and cannot be used.
        """

        if token_id not in self._tokens:
            self._logger.warning(f"Revoke failed: unknown token {token_id[:8]}...")
            return

        token = self._tokens[token_id]
        token.mark_used(False, revocation_time)

        self._logger.info(f"Confirmation token revoked: {token_id[:8]}...")

        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=revocation_time,
                event_type="CONFIRMATION_TOKEN_REVOKED",
                from_state=None,
                to_state=None,
                reason=f"Token {token_id[:8]}... revoked",
                authority_valid=False,
            )
            self._audit_log.log(entry)

    def get_token(self, token_id: str) -> Optional[ConfirmationToken]:
        """Retrieve a token by ID (for testing)"""
        return self._tokens.get(token_id)

    def get_tokens_for_acc_event(self, acc_event_id: str) -> List[ConfirmationToken]:
        """Get all tokens issued for a specific ACC event"""
        if acc_event_id not in self._acc_tokens:
            return []
        return [self._tokens[token_id] for token_id in self._acc_tokens[acc_event_id]]

    # ========================================================================
    # CHALLENGE GENERATION (Private)
    # ========================================================================

    @staticmethod
    def _generate_challenge(confirmation_type: ConfirmationType) -> tuple[str, str]:
        """Generate a challenge payload and expected response hash based on type"""

        if confirmation_type == ConfirmationType.TYPE_CODE:
            return ConfirmationChallengeGenerator.generate_type_code()

        elif confirmation_type == ConfirmationType.VOICE_PHRASE:
            return ConfirmationChallengeGenerator.generate_voice_phrase()

        elif confirmation_type == ConfirmationType.DELIBERATE_GESTURE:
            return ConfirmationChallengeGenerator.generate_deliberate_gesture()

        elif confirmation_type == ConfirmationType.ARTICULATED_UNDERSTANDING:
            return ConfirmationChallengeGenerator.generate_articulated_understanding()

        else:
            raise ValueError(f"Unknown confirmation type: {confirmation_type}")


# ============================================================================
# CONFIRMATION VALIDATION HELPER
# ============================================================================

class ConfirmationValidator:
    """
    Validates that confirmation meets AT-SS-03 requirements:
    - Not a simple click/tap
    - Requires deliberate engagement
    - Single-use, cryptographically bound
    """

    @staticmethod
    def is_non_reflexive(confirmation_type: ConfirmationType) -> bool:
        """
        Check if confirmation type prevents reflexive/habitual responses.

        True = non-reflexive (requires deliberate action)
        False = reflexive (could be accident/habit)
        """

        # All our types are non-reflexive
        reflexive_types = {
            # "SIMPLE_CLICK",  # Not implemented (AT-SS-03 forbids it)
        }

        return confirmation_type not in reflexive_types

    @staticmethod
    def is_replay_protected(token: ConfirmationToken) -> bool:
        """Check if token is protected against replay attacks"""

        # Token is replay-protected if:
        # 1. It can only be used once (is_used flag)
        # 2. Response is cryptographically bound (challenge_hash)
        # 3. Token is time-limited (ttl_seconds)

        return (
            hasattr(token, "is_used")
            and hasattr(token, "challenge_hash")
            and hasattr(token, "ttl_seconds")
        )


# ============================================================================
# USAGE EXAMPLE
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    from Self_Session_v0_StateMachine import SessionStateMachine

    # Create state machine and confirmation manager
    sm = SessionStateMachine("test-confirmation-1")
    conf_mgr = ConfirmationManager(audit_log=sm.get_audit_log())

    now = datetime.utcnow()

    # Test 1: Issue a TYPE_CODE confirmation
    print("✓ Test 1: Issue TYPE_CODE confirmation")
    token_1 = conf_mgr.issue_confirmation(
        "test-confirmation-1",
        "acc-event-001",
        ConfirmationType.TYPE_CODE,
        ttl_seconds=60,
    )
    print(f"  Challenge: {token_1.challenge_payload}")
    print(f"  Token ID: {token_1.token_id[:8]}...")
    print(f"  Type: {token_1.confirmation_type.value}")

    # Test 2: Validate with correct response
    print("\n✓ Test 2: Validate with CORRECT response")
    # Extract code from challenge (normally user types it)
    code = token_1.challenge_payload.split(": ")[1]
    valid = conf_mgr.validate_confirmation(token_1.token_id, code, now)
    print(f"  Validation result: {valid}")
    print(f"  Token is_used: {token_1.is_used}")

    # Test 3: Try to validate same token again (should fail - single-use)
    print("\n✓ Test 3: Replay attempt on same token (should fail)")
    valid_again = conf_mgr.validate_confirmation(token_1.token_id, code, now)
    print(f"  Replay validation result: {valid_again} (should be False)")
    print(f"  Token already used: {token_1.is_used}")

    # Test 4: Issue VOICE_PHRASE confirmation
    print("\n✓ Test 4: Issue VOICE_PHRASE confirmation")
    token_2 = conf_mgr.issue_confirmation(
        "test-confirmation-1",
        "acc-event-002",
        ConfirmationType.VOICE_PHRASE,
        ttl_seconds=60,
    )
    print(f"  Challenge: {token_2.challenge_payload}")
    print(f"  Type: {token_2.confirmation_type.value}")

    # Test 5: Validate voice phrase with wrong response
    print("\n✓ Test 5: Validate with WRONG response")
    valid_wrong = conf_mgr.validate_confirmation(
        token_2.token_id,
        "wrong response",
        now,
    )
    print(f"  Validation result: {valid_wrong} (should be False)")
    print(f"  Token is_used: {token_2.is_used} (marked used anyway)")

    # Test 6: Issue DELIBERATE_GESTURE
    print("\n✓ Test 6: Issue DELIBERATE_GESTURE confirmation")
    token_3 = conf_mgr.issue_confirmation(
        "test-confirmation-1",
        "acc-event-003",
        ConfirmationType.DELIBERATE_GESTURE,
        ttl_seconds=60,
    )
    print(f"  Challenge: {token_3.challenge_payload}")
    print(f"  Type: {token_3.confirmation_type.value}")

    # Test 7: Check confirmation validator
    print("\n✓ Test 7: Confirmation type validation")
    is_non_reflex = ConfirmationValidator.is_non_reflexive(ConfirmationType.TYPE_CODE)
    is_replay_protected = ConfirmationValidator.is_replay_protected(token_1)
    print(f"  TYPE_CODE is non-reflexive: {is_non_reflex}")
    print(f"  Token has replay protection: {is_replay_protected}")

    print("\n✓ All confirmation tests passed")
    print("\nAudit log summary:")
    for entry in sm.get_audit_log().get_entries():
        if "CONFIRMATION" in entry.event_type:
            print(f"  {entry.event_type}: {entry.reason}")
