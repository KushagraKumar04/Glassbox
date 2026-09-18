"""
Audit log helper.

Usage:
    from app.core.audit import audit

    await audit(
        "auth.login",
        request=request,
        user_id=user.id,
        username=user.username,
        details={"method": "password"},
    )

Never raises. Never logs secrets. Never blocks on failure.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import Request

from app.db.models import AuditEvent
from app.db.session import SessionLocal

log = structlog.get_logger()

# ── Actions catalog ─────────────────────────────────────────
#
# Keep this in sync with call sites. Used for the filter dropdown in the UI
# and for validation.
#
ACTIONS: dict[str, str] = {
    # Auth
    "auth.register": "User registered",
    "auth.login": "User signed in",
    "auth.login_failed": "Failed sign-in attempt",
    "auth.logout": "User signed out",
    "auth.password_reset_requested": "Password reset requested",
    "auth.password_reset_completed": "Password reset completed",
    # Datasets
    "dataset.upload": "Dataset uploaded",
    "dataset.delete": "Dataset deleted",
    # Sources
    "source.create": "Data source connected",
    "source.update": "Data source updated",
    "source.refresh": "Data source refreshed",
    "source.delete": "Data source disconnected",
    # Runs
    "run.delete": "Run deleted",
    "run.cleared": "All runs cleared",
    # Templates
    "template.create": "Template created",
    "template.update": "Template updated",
    "template.delete": "Template deleted",
    # Metrics
    "metric.create": "Metric created",
    "metric.update": "Metric updated",
    "metric.delete": "Metric deleted",
    # System
    "system.clear_runs": "Cleared run history",
    "system.clear_datasets": "Cleared all datasets",
    # Security
    "rate_limit.hit": "Rate limit triggered",
}


def is_known_action(action: str) -> bool:
    return action in ACTIONS


# ── Extractors ──────────────────────────────────────────────

def _client_ip(request: Request | None) -> str:
    """Best-effort client IP, honoring common reverse-proxy headers."""
    if request is None:
        return ""
    # X-Forwarded-For: client, proxy1, proxy2, ...
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()[:64]
    # X-Real-IP (nginx)
    real = request.headers.get("x-real-ip", "")
    if real:
        return real.strip()[:64]
    # Direct connection
    if request.client and request.client.host:
        return request.client.host[:64]
    return ""


def _user_agent(request: Request | None) -> str:
    if request is None:
        return ""
    return (request.headers.get("user-agent") or "")[:512]


# ── The log call ────────────────────────────────────────────

async def audit(
    action: str,
    *,
    request: Request | None = None,
    user_id: str | None = None,
    username: str = "",
    target_type: str = "",
    target_id: str = "",
    details: dict[str, Any] | None = None,
) -> None:
    """
    Write an audit event.

    Fails soft — any error is logged and swallowed. The caller's request
    is never affected by audit logging failures.
    """
    try:
        # Copy the details dict so callers can't mutate it after the fact
        safe_details = dict(details or {})

        # Defensive: strip obvious secret keys in case a caller forgets
        for k in list(safe_details.keys()):
            if any(s in k.lower() for s in ("password", "token", "secret", "api_key")):
                safe_details[k] = "***REDACTED***"

        event = AuditEvent(
            user_id=user_id,
            username=(username or "")[:255],
            action=action[:64],
            target_type=(target_type or "")[:64],
            target_id=(target_id or "")[:128],
            details=safe_details,
            ip=_client_ip(request),
            user_agent=_user_agent(request),
        )

        async with SessionLocal() as session:
            session.add(event)
            await session.commit()

    except Exception as e:
        # Never let an audit failure break the request
        log.warning(
            "audit_write_failed",
            action=action,
            error=str(e)[:200],
        )