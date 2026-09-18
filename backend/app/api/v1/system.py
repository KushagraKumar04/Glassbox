"""
System info + maintenance endpoints.

    GET  /api/v1/system/info             app config, LLM provider, limits, stats
    POST /api/v1/system/clear-runs       delete every AnalysisRun for current user
    POST /api/v1/system/clear-datasets   delete every Dataset (+files) for current user
"""
from __future__ import annotations

from pathlib import Path

import structlog
from app.core.audit import audit
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.config import get_settings
from app.db.models import AnalysisRun, DataSource, Dataset, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/system", tags=["system"])
log = structlog.get_logger()
settings = get_settings()


# ── Info ─────────────────────────────────────────────────

@router.get("/info")
async def system_info(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Everything the Settings page needs — no secrets."""
    # Counts scoped to the current user
    datasets_count = (
        await session.execute(
            select(func.count(Dataset.id)).where(Dataset.user_id == user.id)
        )
    ).scalar_one()
    sources_count = (
        await session.execute(
            select(func.count(DataSource.id)).where(DataSource.user_id == user.id)
        )
    ).scalar_one()
    runs_count = (
        await session.execute(
            select(func.count(AnalysisRun.id)).where(AnalysisRun.user_id == user.id)
        )
    ).scalar_one()

    # Distinct conversations (ignore NULL)
    conversations_count = (
        await session.execute(
            select(func.count(func.distinct(AnalysisRun.conversation_id))).where(
                AnalysisRun.user_id == user.id,
                AnalysisRun.conversation_id.isnot(None),
            )
        )
    ).scalar_one()

    # Bytes on disk for uploads (best-effort)
    uploads_bytes = _dir_size(Path(settings.upload_dir))
    artifacts_bytes = _dir_size(Path(settings.artifact_dir))

    return {
        "app": {
            "name": settings.app_name,
            "version": __version__,
            "env": settings.app_env,
            "display_timezone": settings.display_timezone,
        },
        "llm": {
            "provider": settings.llm_provider,
            "model": settings.llm_model,
            "temperature": settings.llm_temperature,
            "max_tokens": settings.llm_max_tokens,
        },
        "limits": {
            "max_upload_size_mb": settings.max_upload_size_mb,
            "max_query_rows": settings.max_query_rows,
            "query_timeout_seconds": settings.query_timeout_seconds,
            "sandbox_enabled": settings.sandbox_enabled,
            "sandbox_timeout_seconds": settings.sandbox_timeout_seconds,
            "max_concurrent_runs": settings.max_concurrent_runs,
        },
        "auth": {
            "enabled": settings.auth_enabled,
        },
        "stats": {
            "datasets": int(datasets_count),
            "sources": int(sources_count),
            "runs": int(runs_count),
            "conversations": int(conversations_count),
            "uploads_bytes": uploads_bytes,
            "artifacts_bytes": artifacts_bytes,
        },
    }


def _dir_size(path: Path) -> int:
    """Recursive byte size of a directory. Returns 0 on any error."""
    if not path.exists():
        return 0
    total = 0
    try:
        for f in path.rglob("*"):
            if f.is_file():
                try:
                    total += f.stat().st_size
                except OSError:
                    pass
    except Exception:
        return 0
    return total


# ── Maintenance ──────────────────────────────────────────

@router.post("/clear-runs")
async def clear_runs(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete every AnalysisRun owned by the current user. Irreversible."""
    result = await session.execute(
        select(AnalysisRun).where(AnalysisRun.user_id == user.id)
    )
    runs = result.scalars().all()
    count = len(runs)
    for r in runs:
        await session.delete(r)
    await session.commit()
    log.warning("cleared_all_runs", user_id=user.id, count=count)

    await audit(
        "system.clear_runs",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="system",
        details={"deleted": count},
    )

    return {"deleted": count}


@router.post("/clear-datasets")
async def clear_datasets(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete every Dataset owned by the current user — rows AND files."""
    result = await session.execute(
        select(Dataset).where(Dataset.user_id == user.id)
    )
    datasets = result.scalars().all()
    count = len(datasets)

    # Remove files first (best-effort)
    for d in datasets:
        try:
            Path(d.file_path).unlink(missing_ok=True)
        except Exception:
            pass

    for d in datasets:
        await session.delete(d)
    await session.commit()

    log.warning("cleared_all_datasets", user_id=user.id, count=count)

    await audit(
        "system.clear_datasets",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="system",
        details={"deleted": count},
    )

    return {"deleted": count}