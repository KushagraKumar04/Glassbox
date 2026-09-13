from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AnalysisRun
from app.db.session import get_session

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("")
async def list_runs(
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(AnalysisRun)
        .order_by(AnalysisRun.created_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()
    return [r.to_summary() for r in runs]


@router.get("/{run_id}")
async def get_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run.to_full()


@router.delete("/{run_id}")
async def delete_run(
    run_id: str,
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(AnalysisRun, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    await session.delete(run)
    await session.commit()
    return {"deleted": run_id}