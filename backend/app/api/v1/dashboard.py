"""
Auto-dashboard endpoint.

    POST /api/v1/dashboard/generate

Deterministic panel generation from dataset profiles. Loads a fresh
DuckDB, executes each candidate panel's SQL, returns the ranked top N.
"""
from __future__ import annotations

import time

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.config import get_settings
from app.core.rate_limit import limiter
from app.db.models import DataSource, Dataset, User
from app.db.session import SessionLocal
from app.dependencies.auth import get_current_user
from app.schemas import (
    DashboardPanel,
    DashboardRequest,
    DashboardResponse,
)
from app.services.dashboard_service import DashboardService
from app.services.duckdb_service import DuckDBService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
log = structlog.get_logger()
settings = get_settings()


@router.post("/generate", response_model=DashboardResponse)
@limiter.limit(lambda: get_settings().rate_limit_execute)
async def generate_dashboard(
    request: Request,
    req: DashboardRequest,
    user: User = Depends(get_current_user),
) -> DashboardResponse:
    t0 = time.time()

    filters_as_dicts = [f.model_dump() for f in (req.filters or [])]

    # ── Load datasets ────────────────────────────────────
    async with SessionLocal() as session:
        if req.dataset_ids:
            ds_q = select(Dataset).where(Dataset.id.in_(req.dataset_ids))
        else:
            ds_q = select(Dataset).order_by(Dataset.created_at.desc())
        datasets = (await session.execute(ds_q)).scalars().all()

    if not datasets:
        return DashboardResponse(
            panels=[],
            elapsed_ms=int((time.time() - t0) * 1000),
            dataset_count=0,
            source_count=0,
            filters_count=len(filters_as_dicts),
        )

    # ── Build DuckDB with filters applied ────────────────
    from app.services.orchestrator import load_duckdb_for_datasets

    try:
        db, tables, _ds_ids, _src_ids = await load_duckdb_for_datasets(
            req.dataset_ids, req.source_ids, filters=filters_as_dicts
        )
    except Exception as e:
        log.warning("dashboard_load_failed", error=str(e)[:200])
        return DashboardResponse(
            panels=[],
            elapsed_ms=int((time.time() - t0) * 1000),
            dataset_count=0,
            source_count=0,
            filters_count=len(filters_as_dicts),
        )

    # ── Map profiles for the service ─────────────────────
    profiles: dict[str, dict] = {}
    for ds in datasets:
        profiles[ds.table_name] = ds.profile or {}

    try:
        svc = DashboardService(db)
        panels_raw = svc.generate(
            tables=tables,
            profiles=profiles,
            filters=filters_as_dicts,
            max_panels=req.max_panels,
        )
    finally:
        try:
            db.close()
        except Exception:
            pass

    return DashboardResponse(
        panels=[DashboardPanel(**p) for p in panels_raw],
        elapsed_ms=int((time.time() - t0) * 1000),
        dataset_count=len(datasets),
        source_count=len(req.source_ids or []),
        filters_count=len(filters_as_dicts),
    )