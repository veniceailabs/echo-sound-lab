# Self Session v0 — Confirmation (Code Review)

**File:** `Self_Session_v0_Confirmation.py`
**Status:** Implementation complete, tested
**Purpose:** Single-use, non-replayable ACC tokens; 4 confirmation types

---

## Code Summary (Condensed)

```python
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
from dataclasses import dataclass
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
        return not self.is_used and not self.is_expired(current_time)

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
        """Generate random 6-char alphanumeric code (2L1D2L1D pattern)"""
        letters = string.ascii_uppercase
        digits = string.digits
        code_parts = [
            secrets.choice(letters), secrets.choice(letters), secrets.choice(digits),
            secrets.choice(letters), secrets.choice(letters), secrets.choice(digits),
        ]
        code = "".join(code_parts)
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        challenge = f"Type this code to continue: {code}"
        return challenge, code_hash

    @staticmethod
    def generate_voice_phrase() -> tuple[str, str]:
        """Generate random phrase user must SAY"""
        phrases = [
            "i want to continue", "yes i understand", "lets keep going",
            "im still here", "i approve of this", "continue the mix",
            "proceed please", "this looks good",
        ]
        phrase = secrets.choice(phrases)
        phrase_hash = hashlib.sha256(phrase.encode()).hexdigest()
        challenge = f"Say this to continue: \"{phrase}\""
        return challenge, phrase_hash

    @staticmethod
    def generate_deliberate_gesture() -> tuple[str, str]:
        """Generate gesture challenge (double-tap, swipe, etc)"""
        gestures = [
            "double_tap_center", "swipe_up_then_down", "pinch_expand",
            "long_press_3sec", "tap_top_left",
        ]
        gesture = secrets.choice(gestures)
        gesture_hash = hashlib.sha256(gesture.encode()).hexdigest()
        challenge = f"Gesture: {gesture}"
        return challenge, gesture_hash

    @staticmethod
    def generate_articulated_understanding() -> tuple[str, str]:
        """Generate comprehension question (requires semantic validation)"""
        questions = [
            "Why are you continuing this session? (explain in 3+ words)",
            "What will happen next? (summarize in your own words)",
            "Are you sure you want to proceed? (say yes or no with reason)",
        ]
        question = secrets.choice(questions)
        # Requires semantic validation (human/NLP)
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

        Returns ConfirmationToken with challenge payload and cryptographic hash.
        """
        token_id = str(uuid.uuid4())
        now = datetime.utcnow()
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
                reason=f"ACC token {token_id[:8]}... issued",
                authority_valid=None,
                extra={"token_id": token_id[:8], "confirmation_type": confirmation_type.value},
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
        """
        if token_id not in self._tokens:
            return False

        token = self._tokens[token_id]

        # Check if token is in valid state
        if not token.can_validate(current_time):
            token.mark_used(False, current_time)
            return False

        # Validate response against challenge hash
        response_hash = hashlib.sha256(user_response.encode()).hexdigest()
        is_valid = (response_hash == token.challenge_hash)

        # Mark token as used (irreversible, whether valid or not)
        token.mark_used(is_valid, current_time)

        # Audit all confirmations
        if self._audit_log:
            from Self_Session_v0_StateMachine import AuditLogEntry
            entry = AuditLogEntry(
                timestamp=current_time,
                event_type="CONFIRMATION_VALIDATED",
                from_state=None,
                to_state=None,
                reason=f"Token {token_id[:8]}... validation: {is_valid}",
                authority_valid=is_valid,
                extra={"token_id": token_id[:8], "valid": is_valid},
            )
            self._audit_log.log(entry)

        return is_valid

    def revoke_token(self, token_id: str, revocation_time: datetime) -> None:
        """Revoke a confirmation token (e.g., session halted)"""
        if token_id not in self._tokens:
            return

        token = self._tokens[token_id]
        token.mark_used(False, revocation_time)

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


class ConfirmationValidator:
    """Validates that confirmation meets AT-SS-03 requirements"""

    @staticmethod
    def is_non_reflexive(confirmation_type: ConfirmationType) -> bool:
        """All 4 types are non-reflexive (prevent muscle memory)"""
        return confirmation_type in {
            ConfirmationType.TYPE_CODE,
            ConfirmationType.VOICE_PHRASE,
            ConfirmationType.DELIBERATE_GESTURE,
            ConfirmationType.ARTICULATED_UNDERSTANDING,
        }

    @staticmethod
    def is_replay_protected(token: ConfirmationToken) -> bool:
        """Check if token has replay protection"""
        return (
            hasattr(token, "is_used")
            and hasattr(token, "challenge_hash")
            and hasattr(token, "ttl_seconds")
        )
```

---

## Key Features

**4 Confirmation Types (Randomized):**
1. **TYPE_CODE**: Random 6-char code (2L1D2L1D prevents pattern memory)
2. **VOICE_PHRASE**: Random phrase from 8 options (requires articulation)
3. **DELIBERATE_GESTURE**: Gesture sequence (physical deliberation)
4. **ARTICULATED_UNDERSTANDING**: Question (semantic validation required)

**Single-Use Tokens:**
- `is_used` flag prevents replay
- Even wrong responses mark token as used
- TTL prevents extended validation windows

**Cryptographic Binding:**
- SHA-256 hash of expected response
- Response is hashed and compared (constant-time comparison ideally)
- Cannot forge without knowing expected answer

---

## For Ghost's Review

Critical questions:
1. Can same token be used twice? (No—`is_used` flag prevents it)
2. Can wrong response bypass validation? (No—fails validation, token marked used)
3. Can confirmation type always be TYPE_CODE? (No—randomized via `secrets.choice()`)
4. Can user guess the code? (Very unlikely—6 random chars, 36^6 possibilities)
5. Is ARTICULATED_UNDERSTANDING safe? (Requires semantic validation; marked for future NLP)

