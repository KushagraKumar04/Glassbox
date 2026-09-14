"""
Audit log endpoints.

    GET /api/v1/audit              list events (paginated, filtered)
    GET /api/v1/audit/actions      known action names + labels
    GET /api/v1/audit/{id}         single event
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import ACTIONS
from app.db.models import AuditEvent, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import AuditEventOut, AuditPage

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/actions")
async def list_actions(user: User = Depends(get_current_user)) -> dict:
    """Return the action catalog so the UI can build a filter dropdown."""
    return {"actions": [{"id": k, "label": v} for k, v in ACTIONS.items()]}


@router.get("", response_model=AuditPage)
async def list_events(
    action: str | None = Query(default=None, description="Exact match"),
    user_id: str | None = Query(default=None),
    target_type: str | None = Query(default=None),
    search: str | None = Query(default=None, description="Free text"),
    since: str | None = Query(
        default=None, description="ISO timestamp (inclusive)"
    ),
    until: str | None = Query(
        default=None, description="ISO timestamp (exclusive)"
    ),
    days: int | None = Query(
        default=7,
        ge=1,
        le=365,
        description="Convenience: last N days. Ignored if `since` given.",
    ),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    List audit events, newest first.

    When auth is off (anonymous user), returns ALL events.
    When auth is on, returns only events that the current user is allowed
    to see. In this MVP, every authenticated user can see the full audit
    log — add an RBAC check here in a later batch.
    """
    stmt = select(AuditEvent)
    count_stmt = select(func.count(AuditEvent.id))

    # ── Filters ──────────────────────────────────────────
    if action:
        stmt = stmt.where(AuditEvent.action == action)
        count_stmt = count_stmt.where(AuditEvent.action == action)

    if user_id:
        stmt = stmt.where(AuditEvent.user_id == user_id)
        count_stmt = count_stmt.where(AuditEvent.user_id == user_id)

    if target_type:
        stmt = stmt.where(AuditEvent.target_type == target_type)
        count_stmt = count_stmt.where(AuditEvent.target_type == target_type)

    if search:
        like = f"%{search.strip()}%"
        cond = or_(
            AuditEvent.username.ilike(like),
            AuditEvent.action.ilike(like),
            AuditEvent.target_id.ilike(like),
            AuditEvent.ip.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)

    # Time window — explicit since/until wins over `days`
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            if since_dt.tzinfo is not None:
                since_dt = since_dt.astimezone().replace(tzinfo=None)
            stmt = stmt.where(AuditEvent.created_at >= since_dt)
            count_stmt = count_stmt.where(AuditEvent.created_at >= since_dt)
        except ValueError:
            raise HTTPException(400, "Invalid `since` timestamp.")
    elif days:
        cutoff = datetime.utcnow() - timedelta(days=days)
        stmt = stmt.where(AuditEvent.created_at >= cutoff)
        count_stmt = count_stmt.where(AuditEvent.created_at >= cutoff)

    if until:
        try:
            until_dt = datetime.fromisoformat(until.replace("Z", "+00:00"))
            if until_dt.tzinfo is not None:
                until_dt = until_dt.astimezone().replace(tzinfo=None)
            stmt = stmt.where(AuditEvent.created_at < until_dt)
            count_stmt = count_stmt.where(AuditEvent.created_at < until_dt)
        except ValueError:
            raise HTTPException(400, "Invalid `until` timestamp.")

    # ── Page ─────────────────────────────────────────────
    total = (await session.execute(count_stmt)).scalar_one()

    result = await session.execute(
        stmt.order_by(desc(AuditEvent.created_at))
        .limit(limit)
        .offset(offset)
    )
    events = result.scalars().all()

    return AuditPage(
        events=[AuditEventOut(**e.to_dict()) for e in events],
        total=int(total),
        limit=limit,
        offset=offset,
    )


@router.get("/{event_id}", response_model=AuditEventOut)
async def get_event(
    event_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    event = await session.get(AuditEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    return AuditEventOut(**event.to_dict())