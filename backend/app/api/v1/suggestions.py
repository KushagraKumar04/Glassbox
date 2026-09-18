"""
Suggestion endpoints.

    GET /api/v1/suggestions              question suggestions from dataset profiles
    GET /api/v1/suggestions/history      autocomplete: past questions matching a prefix
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AnalysisRun, Dataset, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.services.suggestion_service import suggestions_for_profile

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


_DEFAULT_SUGGESTIONS: list[dict[str, str]] = [
    {"question": "Which region has the highest revenue?", "reason": "default"},
    {
        "question": "Show monthly revenue and highlight the largest declines.",
        "reason": "default",
    },
    {
        "question": "Why did gross margin fall last month? Break down the drivers.",
        "reason": "default",
    },
    {
        "question": "Which customers increased spend by more than 20% QoQ?",
        "reason": "default",
    },
    {
        "question": "Compare sales across regions and show the top performers.",
        "reason": "default",
    },
    {"question": "Create a chart of revenue by region.", "reason": "default"},
]


@router.get("")
async def get_suggestions(
    dataset_ids: str | None = Query(
        default=None,
        description="Comma-separated dataset IDs. Omit for 'all datasets'.",
    ),
    limit: int = Query(default=6, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    ids = (
        [s.strip() for s in dataset_ids.split(",") if s.strip()]
        if dataset_ids
        else []
    )

    if ids:
        result = await session.execute(
            select(Dataset).where(Dataset.id.in_(ids))
        )
    else:
        result = await session.execute(
            select(Dataset).order_by(Dataset.created_at.desc())
        )
    datasets = result.scalars().all()

    if not datasets:
        return {
            "suggestions": _DEFAULT_SUGGESTIONS[:limit],
            "source": "default",
        }

    merged: list[dict] = []
    seen: set[str] = set()

    for ds in datasets:
        if not ds.profile:
            continue
        for s in suggestions_for_profile(ds.profile, limit=limit):
            q = s["question"]
            if q in seen:
                continue
            seen.add(q)
            merged.append({**s, "dataset": ds.name})
            if len(merged) >= limit:
                break
        if len(merged) >= limit:
            break

    if not merged:
        return {
            "suggestions": _DEFAULT_SUGGESTIONS[:limit],
            "source": "default",
        }

    return {"suggestions": merged, "source": "datasets"}


# ═══════════════════════════════════════════════════════════════════════════
#  History autocomplete
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/history")
async def history_autocomplete(
    q: str = Query(
        ...,
        min_length=3,
        max_length=200,
        description="Prefix or substring to match against past questions",
    ),
    limit: int = Query(default=8, ge=1, le=20),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return distinct past questions matching the query, most recent first.

    Matched case-insensitively as a substring (ILIKE '%q%'). Deduped by
    exact question text. Scoped to the current user's runs.
    """
    needle = f"%{q.strip().lower()}%"

    # Group by question text, take the max created_at and a count
    stmt = (
        select(
            AnalysisRun.question,
            func.max(AnalysisRun.created_at).label("last_used_at"),
            func.count(AnalysisRun.id).label("count"),
        )
        .where(
            AnalysisRun.user_id == user.id,
            func.lower(AnalysisRun.question).like(needle),
        )
        .group_by(AnalysisRun.question)
        .order_by(desc("last_used_at"))
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    from app.db.models import _iso_local  # local import to avoid cycles

    return {
        "matches": [
            {
                "question": r[0],
                "last_used_at": _iso_local(r[1]) or "",
                "count": int(r[2]),
            }
            for r in rows
            if r[0]
        ]
    }