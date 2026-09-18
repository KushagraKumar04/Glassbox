"""
Password hashing and JWT helpers.

- Passwords: bcrypt with cost 12 (sane default; ~100ms per hash)
- Tokens: HS256 JWT with a configurable expiry

Nothing in this file touches the DB or the network.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from app.config import get_settings

settings = get_settings()

_BCRYPT_ROUNDS = 12


# ── Password hashing ────────────────────────────────────────

def hash_password(plaintext: str) -> str:
    """Return a bcrypt hash suitable for storage."""
    if not plaintext:
        raise ValueError("Password cannot be empty")
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(plaintext.encode("utf-8"), salt).decode("ascii")


def verify_password(plaintext: str, hashed: str) -> bool:
    """Return True if the plaintext matches the hash. Never raises."""
    if not plaintext or not hashed:
        return False
    try:
        return bcrypt.checkpw(plaintext.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def validate_password_policy(password: str) -> tuple[bool, str]:
    """
    Return (ok, error_message).

    Rules (MVP):
      - at least AUTH_MIN_PASSWORD_LENGTH chars
      - not entirely whitespace
    """
    if not password:
        return False, "Password is required."
    if len(password) < settings.auth_min_password_length:
        return False, (
            f"Password must be at least "
            f"{settings.auth_min_password_length} characters."
        )
    if not password.strip():
        return False, "Password cannot be whitespace only."
    return True, ""


# ── JWT ─────────────────────────────────────────────────────

def create_access_token(
    subject: str,
    *,
    extra: dict | None = None,
    expires_minutes: int | None = None,
) -> str:
    """
    Create a signed JWT.

    Args:
        subject:          user ID (goes into the `sub` claim)
        extra:            any additional claims to embed
        expires_minutes:  override AUTH_JWT_ACCESS_TOKEN_MINUTES
    """
    now = datetime.now(timezone.utc)
    minutes = expires_minutes or settings.jwt_access_token_minutes
    payload: dict = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=minutes)).timestamp()),
        "iss": "ai-data-analyst",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


class TokenError(Exception):
    """Raised when a token is invalid, expired, or malformed."""


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT.

    Raises TokenError on any failure — callers turn it into a 401.
    """
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer="ai-data-analyst",
        )
    except ExpiredSignatureError as e:
        raise TokenError("Token has expired.") from e
    except InvalidTokenError as e:
        raise TokenError("Invalid token.") from e
    except Exception as e:
        raise TokenError(f"Token verification failed: {type(e).__name__}") from e


def token_expiry_seconds() -> int:
    """Return the token lifetime in seconds — handy for the frontend."""
    return settings.jwt_access_token_minutes * 60

# ── Password reset tokens ───────────────────────────────────

def generate_reset_token() -> tuple[str, str]:
    """
    Generate a password reset token.

    Returns (raw_token, token_hash):
      - raw_token: sent to the user (via link). Never stored.
      - token_hash: SHA-256 hex of the raw token. Stored in the DB.
    """
    import secrets
    import hashlib

    raw = secrets.token_urlsafe(32)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, digest


def hash_reset_token(raw: str) -> str:
    """SHA-256 hex of a reset token — used to look it up in the DB."""
    import hashlib

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()