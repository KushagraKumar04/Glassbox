"""
Metric endpoints (business glossary).

    GET    /api/v1/metrics           list (built-ins + current user's)
    POST   /api/v1/metrics           create a user metric
    GET    /api/v1/metrics/{id}      fetch one
    PATCH  /api/v1/metrics/{id}      update a user metric
    DELETE /api/v1/metrics/{id}      delete a user metric
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.db.models import Metric, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import MetricIn, MetricOut

router = APIRouter(prefix="/metrics", tags=["metrics"])
log = structlog.get_logger()


def _visible_query(user_id: str):
    return select(Metric).where(
        or_(Metric.user_id.is_(None), Metric.user_id == user_id)
    )


async def _get_visible_or_404(
    metric_id: str, user_id: str, session: AsyncSession
) -> Metric:
    m = await session.get(Metric, metric_id)
    if m is None:
        raise HTTPException(404, "Metric not found")
    if m.user_id is not None and m.user_id != user_id:
        raise HTTPException(404, "Metric not found")
    return m


def _clean_synonyms(raw: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in raw:
        t = (s or "").strip().lower()
        if not t or t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out[:12]


@router.get("", response_model=list[MetricOut])
async def list_metrics(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        _visible_query(user.id).order_by(
            Metric.is_builtin.desc(),
            Metric.category.asc(),
            Metric.name.asc(),
        )
    )
    return [MetricOut(**m.to_dict()) for m in result.scalars().all()]


@router.post("", response_model=MetricOut)
async def create_metric(
    request: Request,
    req: MetricIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.execute(
        select(Metric).where(
            Metric.user_id == user.id, Metric.name == req.name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            409, f"You already have a metric named '{req.name}'."
        )

    metric = Metric(
        user_id=user.id,
        name=req.name.strip(),
        description=req.description.strip(),
        sql_expression=req.sql_expression.strip(),
        synonyms=_clean_synonyms(req.synonyms),
        category=req.category.strip(),
        is_builtin=False,
    )
    session.add(metric)
    await session.commit()
    await session.refresh(metric)
    log.info("metric_created", metric_id=metric.id, user_id=user.id)

    await audit(
        "metric.create",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="metric",
        target_id=metric.id,
        details={"name": metric.name},
    )

    return MetricOut(**metric.to_dict())


@router.get("/{metric_id}", response_model=MetricOut)
async def get_metric(
    metric_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _get_visible_or_404(metric_id, user.id, session)
    return MetricOut(**m.to_dict())


@router.patch("/{metric_id}", response_model=MetricOut)
async def update_metric(
    request: Request,
    metric_id: str,
    req: MetricIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _get_visible_or_404(metric_id, user.id, session)
    if m.is_builtin or m.user_id is None:
        raise HTTPException(
            403, "Built-in metrics are read-only. Duplicate it as a custom metric to edit."
        )

    m.name = req.name.strip()
    m.description = req.description.strip()
    m.sql_expression = req.sql_expression.strip()
    m.synonyms = _clean_synonyms(req.synonyms)
    m.category = req.category.strip()

    await session.commit()
    await session.refresh(m)

    await audit(
        "metric.update",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="metric",
        target_id=metric_id,
        details={"name": m.name},
    )

    return MetricOut(**m.to_dict())


@router.delete("/{metric_id}")
async def delete_metric(
    request: Request,
    metric_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    m = await _get_visible_or_404(metric_id, user.id, session)
    if m.is_builtin or m.user_id is None:
        raise HTTPException(403, "Built-in metrics cannot be deleted.")
    await session.delete(m)
    await session.commit()

    await audit(
        "metric.delete",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="metric",
        target_id=metric_id,
        details={"name": m.name},
    )

    return {"deleted": metric_id}