"""
Exponential backoff for authentication failures.

Purpose: slow down credential-stuffing and password-guessing attacks
WITHOUT a permanent lockout. After `threshold` failed attempts on the
same account identifier, each subsequent attempt is delayed by an
exponentially growing amount. The counter resets after an idle window.

State is in-process. In a multi-worker deployment, swap `_STORE` for
Redis so the counter is shared. The interface is designed so that swap
is a one-file change — nothing else in the codebase talks to `_STORE`.

Public API:

    await check_account(identifier)        → raises AuthBackoffError if delayed
    await record_failure(identifier)       → increments the counter
    await record_success(identifier)       → clears the counter

`identifier` should be the normalized email or username. Callers must
normalize (lowercase, strip) before calling so the same logical account
always maps to the same key. Never pass the raw request body.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field

import structlog

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()

# In-process state: {identifier_hash: Entry}
# Redis swap-in: replace these three functions and keep the class API.
_STORE: dict[str, "_Entry"] = {}


class AuthBackoffError(Exception):
    """Raised when an account is currently delayed by backoff."""

    def __init__(self, retry_after_seconds: int, reason: str = "Too many failed attempts"):
        super().__init__(reason)
        self.retry_after_seconds = retry_after_seconds
        self.reason = reason


@dataclass
class _Entry:
    failures: int = 0
    last_failure_at: float = 0.0
    next_allowed_at: float = 0.0
    first_failure_at: float = field(default=0.0)


def _key(identifier: str) -> str:
    """
    Hash the identifier so the store never holds plaintext email or
    username. SHA-256 truncated to 16 hex chars is collision-safe here.
    """
    return hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:16]


def _compute_delay(failures: int) -> float:
    """
    Delay in seconds for the given failure count, or 0 if under threshold.
    """
    if failures < settings.auth_backoff_threshold:
        return 0.0
    over = failures - settings.auth_backoff_threshold
    raw = settings.auth_backoff_base_seconds * (
        settings.auth_backoff_multiplier ** over
    )
    return min(raw, float(settings.auth_backoff_max_seconds))


async def check_account(identifier: str) -> None:
    """
    Raise AuthBackoffError if the account is currently delayed.

    Also opportunistically resets stale entries so the store doesn't
    grow unbounded in a single process.
    """
    if not settings.auth_backoff_enabled or not identifier:
        return

    _prune_stale()

    entry = _STORE.get(_key(identifier))
    if entry is None:
        return

    now = time.time()
    if now < entry.next_allowed_at:
        wait = int(entry.next_allowed_at - now)
        log.info(
            "auth_backoff_blocked",
            identifier_hash=_key(identifier),
            failures=entry.failures,
            retry_after=wait,
        )
        raise AuthBackoffError(wait)


async def record_failure(identifier: str) -> int:
    """
    Increment the failure counter and schedule the next allowed time.

    Returns the new delay in seconds (0 if under threshold).
    """
    if not settings.auth_backoff_enabled or not identifier:
        return 0

    key = _key(identifier)
    now = time.time()
    entry = _STORE.get(key)

    if entry is None:
        entry = _Entry(
            failures=1,
            last_failure_at=now,
            first_failure_at=now,
        )
        _STORE[key] = entry
    else:
        entry.failures += 1
        entry.last_failure_at = now

    delay = _compute_delay(entry.failures)
    entry.next_allowed_at = now + delay

    if delay > 0:
        log.warning(
            "auth_backoff_armed",
            identifier_hash=key,
            failures=entry.failures,
            next_delay_seconds=int(delay),
        )

    return int(delay)


async def record_success(identifier: str) -> None:
    """Clear the failure counter after a successful attempt."""
    if not settings.auth_backoff_enabled or not identifier:
        return
    _STORE.pop(_key(identifier), None)


def _prune_stale() -> None:
    """
    Remove entries whose failure window has elapsed. Called from
    `check_account` so pruning happens on natural traffic without a
    background task.

    Runs at most once per second to avoid an O(n) sweep on every check.
    """
    now = time.time()
    if now - _last_prune < 1.0:
        return
    _last_prune = now

    ttl = settings.auth_backoff_reset_minutes * 60
    to_delete = [
        k for k, e in _STORE.items()
        if now - e.last_failure_at > ttl
    ]
    for k in to_delete:
        _STORE.pop(k, None)


_last_prune: float = 0.0


# ═══════════════════════════════════════════════════════════════════════════
#  Introspection (used by /health and tests)
# ═══════════════════════════════════════════════════════════════════════════

def stats() -> dict:
    """Return counts for observability. Never exposes identifiers."""
    now = time.time()
    return {
        "enabled": settings.auth_backoff_enabled,
        "tracked_accounts": len(_STORE),
        "currently_delayed": sum(
            1 for e in _STORE.values() if now < e.next_allowed_at
        ),
    }