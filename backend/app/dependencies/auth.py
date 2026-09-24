"""
Auth dependencies.

  get_current_user  → always returns a User
      - AUTH_ENABLED=false        → anonymous user (single-user mode)
      - AUTH_ENABLED=true + JWT   → the JWT's user
      - AUTH_ENABLED=true + GUEST_MODE=true + no JWT:
          * GET  → anonymous user (read-only demo)
          * POST/PUT/PATCH/DELETE → 403 Sign in to continue
      - AUTH_ENABLED=true + GUEST_MODE=false + no JWT → 401

  get_optional_user → same but returns None instead of raising.
"""
from __future__ import annotations

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import TokenError, decode_access_token
from app.db.models import User
from app.db.session import ANONYMOUS_USER_ID, get_session

settings = get_settings()
log = structlog.get_logger()

# auto_error=False lets us decide what to do when no header is sent
_bearer = HTTPBearer(auto_error=False)

# Methods treated as writes when guest mode is on
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Path prefixes that are always public (auth flow), even in guest mode
_PUBLIC_PATH_PREFIXES = (
    "/api/v1/auth/",
    "/api/v1/news",
    "/api/v1/health",
    "/docs",
    "/openapi.json",
    "/redoc",
)


def _is_public_path(path: str) -> bool:
    return any(path.startswith(p) for p in _PUBLIC_PATH_PREFIXES)


async def _load_anonymous(session: AsyncSession) -> User:
    user = await session.get(User, ANONYMOUS_USER_ID)
    if not user:
        raise HTTPException(
            status_code=500,
            detail="Anonymous user missing. Restart the backend to re-create it.",
        )
    return user


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    # ── Auth disabled → single-user mode, full access ───────
    if not settings.auth_enabled:
        return await _load_anonymous(session)

    # ── Auth enabled + a bearer token was provided ──────────
    if credentials is not None:
        try:
            payload = decode_access_token(credentials.credentials)
        except TokenError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(e),
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = await session.get(User, user_id)
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    # ── Auth enabled, no token ──────────────────────────────
    if settings.guest_mode and not _is_public_path(request.url.path):
        if request.method in _WRITE_METHODS:
            log.info(
                "guest_write_blocked",
                path=str(request.url.path),
                method=request.method,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Sign in to continue. Guests can browse the app "
                    "but not upload, run analyses, or modify anything."
                ),
            )
        # Read request → anonymous user sees whatever's in the anon account
        return await _load_anonymous(session)

    # ── Auth enabled, no token, guest mode off → 401 ────────
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_optional_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """Same as get_current_user but returns None instead of raising."""
    try:
        return await get_current_user(request, credentials, session)
    except HTTPException:
        return None