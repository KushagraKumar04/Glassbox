"""
Symmetric encryption for stored credentials.

Derives a Fernet key from SECRET_KEY via SHA-256. That means rotating
SECRET_KEY invalidates every stored credential — acceptable for the MVP,
but in production swap for a real vault (HashiCorp, AWS Secrets Manager,
Azure Key Vault, etc.).

Never log ciphertext, plaintext, or the key.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

settings = get_settings()


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    """Return a URL-safe base64 ciphertext, or '' for empty input."""
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str) -> str:
    """
    Return the plaintext, or '' if the ciphertext is empty / unreadable.

    Returning '' on InvalidToken means a rotated SECRET_KEY yields
    'wrong password' when connecting, not a 500 — the user re-enters it.
    """
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        return ""