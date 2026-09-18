"""
Rate limiting via slowapi.

Key strategy:
  - Authenticated requests  → rate-limit per JWT (sha-256 truncated)
  - Anonymous requests      → rate-limit per client IP

This means:
  - Two users on the same NAT get independent limits once logged in
  - One user on multiple devices shares a single limit (correct)
  - Anonymous brute-force still gets throttled by IP

Storage:
  - `memory://`   → single-process (default)
  - `redis://...` → multi-worker (set RATE_LIMIT_STORAGE)

When RATE_LIMIT_ENABLED=false, all limits become no-ops.
"""
from __future__ import annotations

import hashlib

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import get_settings

settings = get_settings()
log = structlog.get_logger()


def rate_limit_key(request: Request) -> str:
    """
    Return a stable key for rate limiting.

    Prefers the JWT bearer token when present (per-user limit).
    Falls back to the client IP (per-network limit).
    """
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            # Hash the token so we don't store raw JWTs in the limiter state
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
            return f"user:{digest}"

    ip = get_remote_address(request)
    return f"ip:{ip or 'unknown'}"


# `enabled=False` short-circuits all `.limit()` decorators to no-ops.
limiter = Limiter(
    key_func=rate_limit_key,
    storage_uri=settings.rate_limit_storage,
    enabled=settings.rate_limit_enabled,
    default_limits=[],  # no global default — we apply per-endpoint
    headers_enabled=True,  # adds X-RateLimit-* headers to responses
)


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom 429 handler — returns JSON matching our ApiError shape so the
    frontend can show a meaningful message.
    """
    # slowapi puts the limit string in `exc.detail` (e.g. "10 per 1 minute")
    detail = getattr(exc, "detail", "") or "Too many requests."
    retry_after = getattr(exc, "retry_after", None)
    if not retry_after:
        retry_after = _parse_retry_seconds(detail)

    log.warning(
        "rate_limit_hit",
        path=str(request.url.path),
        method=request.method,
        limit=str(detail),
        retry_after=retry_after,
    )

    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit reached. Try again in {retry_after} second"
                      f"{'s' if retry_after != 1 else ''}.",
            "retry_after": retry_after,
        },
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(detail),
        },
    )


def _parse_retry_seconds(detail: str) -> int:
    """
    Best-effort parse of slowapi's detail string into seconds.
    Examples: "10 per 1 minute" → 60, "5 per 1 hour" → 3600.
    """
    import re

    m = re.search(r"per\s+(\d+)\s*(second|minute|hour|day)", detail, re.I)
    if not m:
        return 60

    n = int(m.group(1))
    unit = m.group(2).lower()
    multipliers = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }
    return n * multipliers.get(unit, 60)