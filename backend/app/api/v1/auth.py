"""
Auth endpoints.

    POST /api/v1/auth/register           create an account
    POST /api/v1/auth/login              exchange credentials for a JWT
    GET  /api/v1/auth/me                 current user
    GET  /api/v1/auth/config             public — tells frontend if auth is on
    POST /api/v1/auth/forgot-password    generate a reset link
    POST /api/v1/auth/reset-password     consume a token and set a new password
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.rate_limit import limiter
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.audit import audit
from app.core.security import (
    create_access_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    token_expiry_seconds,
    validate_password_policy,
    verify_password,
)
from app.core.email import get_email_sender
from app.emails import password_reset_email
from app.db.models import PasswordResetToken, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
log = structlog.get_logger()
settings = get_settings()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,64}$")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _normalize_username(username: str) -> str:
    return username.strip()


def _reset_url(raw_token: str) -> str:
    """
    Build the frontend reset URL. Uses the first configured CORS origin as
    the base — that's where the frontend lives.
    """
    origins = settings.cors_origin_list
    base = origins[0] if origins else "http://localhost:5173"
    return f"{base.rstrip('/')}/reset-password?token={raw_token}"


@router.get("/config")
async def auth_config() -> dict:
    """Public — the frontend checks this to decide what to render."""
    return {
        "enabled": settings.auth_enabled,
        "min_password_length": settings.auth_min_password_length,
        "email_enabled": settings.email_delivery_active,
    }


@router.post("/register", response_model=TokenResponse)
@limiter.limit(lambda: get_settings().rate_limit_register)
async def register(
    request: Request,
    req: RegisterRequest,
    session: AsyncSession = Depends(get_session),
):
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auth is disabled on this server. Set AUTH_ENABLED=true to enable registration.",
        )

    email = _normalize_email(req.email)
    username = _normalize_username(req.username)

    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email format.")

    if not _USERNAME_RE.match(username):
        raise HTTPException(
            400,
            "Username must be 3–64 characters: letters, numbers, dot, dash, underscore.",
        )

    ok, err = validate_password_policy(req.password)
    if not ok:
        raise HTTPException(400, err)

    existing = await session.execute(
        select(User).where(
            or_(User.email == email, User.username == username)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email or username already registered.")

    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(req.password),
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    log.info("user_registered", user_id=user.id, username=user.username)
    await audit(
        "auth.register",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="user",
        target_id=user.id,
        details={"email_domain": user.email.split("@")[-1]},
    )

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=token_expiry_seconds(),
        user=UserOut(**user.to_dict()),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(lambda: get_settings().rate_limit_login)
async def login(
    request: Request,
    req: LoginRequest,
    session: AsyncSession = Depends(get_session),
):
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auth is disabled on this server. Set AUTH_ENABLED=true to enable login.",
        )

    ident = req.username.strip()
    result = await session.execute(
        select(User).where(
            or_(
                User.username == ident,
                User.email == _normalize_email(ident),
            )
        )
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        await audit(
            "auth.login_failed",
            request=request,
            username=ident,
            details={"reason": "unknown_or_inactive"},
        )
        raise HTTPException(401, "Invalid credentials.")

    if not user.hashed_password:
        await audit(
            "auth.login_failed",
            request=request,
            username=ident,
            details={"reason": "unknown_or_inactive"},
        )
        raise HTTPException(401, "Invalid credentials.")

    if not verify_password(req.password, user.hashed_password):
        await audit(
            "auth.login_failed",
            request=request,
            username=ident,
            details={"reason": "unknown_or_inactive"},
        )
        raise HTTPException(401, "Invalid credentials.")

    log.info("user_login", user_id=user.id, username=user.username)
    await audit(
        "auth.login",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="user",
        target_id=user.id,
        details={"method": "password"},
    )

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=token_expiry_seconds(),
        user=UserOut(**user.to_dict()),
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(**user.to_dict())


# ── Password reset ─────────────────────────────────────────

@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit(lambda: get_settings().rate_limit_forgot)
async def forgot_password(
    request: Request,
    req: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Generate a password reset link for the given email.

    Always returns 200 — never reveals whether the email is registered.

    The reset URL is logged to the server console. If
    AUTH_SHOW_RESET_LINK=true (dev only), it's also returned in the
    response so you can test without leaving the browser.
    """
    if not settings.auth_enabled:
        raise HTTPException(
            400, "Auth is disabled on this server."
        )

    email = _normalize_email(req.email)
    response = ForgotPasswordResponse()

    result = await session.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if not user or not user.is_active or not user.hashed_password:
        # Same shape of response as success — don't leak account existence.
        log.info("password_reset_requested_unknown_email", email_prefix=email[:3])
        return response

    # Invalidate any outstanding tokens for this user
    existing = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    for old in existing.scalars().all():
        old.used_at = datetime.utcnow()

    # Create a fresh token
    raw, token_hash = generate_reset_token()
    expires = datetime.utcnow() + timedelta(
        minutes=settings.auth_reset_token_minutes
    )
    session.add(PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires,
    ))
    await session.commit()

    reset_url = _reset_url(raw)

    # Always log the reset link — operator visibility even when SMTP is on.
    if not settings.email_delivery_active or settings.app_debug:
        log.warning(
            "password_reset_link_generated",
            user_id=user.id,
            username=user.username,
            expires_in_minutes=settings.auth_reset_token_minutes,
            reset_url=reset_url,
        )

        await audit(
            "auth.password_reset_requested",
            request=request,
            user_id=user.id,
            username=user.username,
            target_type="user",
            target_id=user.id,
            details={"email_domain": user.email.split("@")[-1]},
        )

    # Attempt to email the link if SMTP is configured. Fail-soft — the
    # endpoint always returns 200 to prevent email enumeration.
    sender = get_email_sender()
    if sender.enabled:
        html, text = password_reset_email(
            username=user.username,
            reset_url=reset_url,
            expires_minutes=settings.auth_reset_token_minutes,
        )
        try:
            await sender.send(
                to=user.email,
                subject="Reset your Glassbox password",
                html=html,
                text=text,
            )
        except Exception as e:
            # send() already fails soft; this is a belt-and-suspenders guard
            log.warning("email_send_unexpected", error=str(e)[:200])

    if settings.auth_show_reset_link:
        log.warning(
            "auth_show_reset_link_enabled",
            msg="Reset link exposed in API response — DO NOT use in production",
        )
        response.reset_url = reset_url

    return response


@router.post("/reset-password", response_model=UserOut)
@limiter.limit(lambda: get_settings().rate_limit_reset)
async def reset_password(
    request: Request,
    req: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Consume a reset token and set a new password.

    The token is single-use: any successful reset marks it `used_at`.
    """
    if not settings.auth_enabled:
        raise HTTPException(400, "Auth is disabled on this server.")

    # Validate the new password
    ok, err = validate_password_policy(req.new_password)
    if not ok:
        raise HTTPException(400, err)

    # Look up by hash
    token_hash = hash_reset_token(req.token.strip())
    result = await session.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash
        )
    )
    token = result.scalar_one_or_none()

    if token is None:
        raise HTTPException(400, "Invalid or expired reset link.")

    if token.used_at is not None:
        raise HTTPException(400, "This reset link has already been used.")

    if token.expires_at < datetime.utcnow():
        raise HTTPException(400, "This reset link has expired.")

    user = await session.get(User, token.user_id)
    if user is None or not user.is_active:
        raise HTTPException(400, "Account is not available.")

    # Apply
    user.hashed_password = hash_password(req.new_password)
    token.used_at = datetime.utcnow()
    await session.commit()
    await session.refresh(user)

    log.info("password_reset_completed", user_id=user.id)
    await audit(
        "auth.password_reset_completed",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="user",
        target_id=user.id,
    )

    return UserOut(**user.to_dict())    