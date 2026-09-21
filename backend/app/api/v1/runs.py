"""Run history endpoints (user-scoped)."""
from __future__ import annotations

import io
import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.db.models import AnalysisRun, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.services.orchestrator import load_duckdb_for_datasets
from app.schemas import PinRequest

router = APIRouter(prefix="/runs", tags=["runs"])
log = structlog.get_logger()

_MAX_EXPORT_ROWS = 1_000_000


@router.get("")
async def list_runs(
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AnalysisRun)
        .where(AnalysisRun.user_id == user.id)
        .order_by(AnalysisRun.created_at.desc())
        .limit(limit)
    )
    return [r.to_summary() for r in result.scalars().all()]


# ── Pinned list (MUST come before /{run_id}) ─────────────────

@router.get("/pinned")
async def list_pinned_runs(
    limit: int = Query(default=12, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List pinned runs, newest-pinned first."""
    result = await session.execute(
        select(AnalysisRun)
        .where(
            AnalysisRun.user_id == user.id,
            AnalysisRun.pinned.is_(True),
        )
        .order_by(AnalysisRun.pinned_at.desc().nullslast())
        .limit(limit)
    )
    return [r.to_summary() for r in result.scalars().all()]


@router.get("/{run_id}")
async def get_run(
    run_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(404, "Run not found")
    return run.to_full()


@router.get("/{run_id}/export.json")
async def export_run_json(
    run_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(404, "Run not found")

    payload = json.dumps(run.to_full(), indent=2, default=str)
    filename = f"run_{run_id}.json"
    return Response(
        content=payload,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(payload.encode("utf-8"))),
        },
    )


@router.get("/{run_id}/export.csv")
async def export_run_csv(
    run_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(404, "Run not found")
    if not run.sql_text:
        raise HTTPException(400, "This run has no SQL query to re-execute.")

    try:
        db, _tables, _ds_ids, _src_ids = await load_duckdb_for_datasets(
            run.dataset_ids or [],
            run.source_ids or [],
        )
    except Exception as e:
        log.exception("export_dataset_load_failed", run_id=run_id)
        raise HTTPException(500, f"Failed to reload datasets: {str(e)[:200]}")

    try:
        df = db.query(run.sql_text, limit=_MAX_EXPORT_ROWS)
    except PermissionError as e:
        db.close()
        raise HTTPException(400, f"Query violates read-only policy: {e}")
    except Exception as e:
        db.close()
        log.warning("export_query_failed", run_id=run_id, error=str(e)[:200])
        raise HTTPException(400, f"Query failed to re-execute: {str(e)[:200]}")
    finally:
        try:
            db.close()
        except Exception:
            pass

    buffer = io.StringIO()
    df.to_csv(buffer, index=False, lineterminator="\r\n")
    payload = buffer.getvalue()

    filename = f"run_{run_id}.csv"
    return Response(
        content=payload,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(payload.encode("utf-8"))),
        },
    )


@router.delete("/{run_id}")
async def delete_run(
    request: Request,
    run_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(AnalysisRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(404, "Run not found")
    await session.delete(run)
    await session.commit()

    await audit(
        "run.delete",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="run",
        target_id=run_id,
        details={"question": (run.question or "")[:200]},
    )

    return {"deleted": run_id}