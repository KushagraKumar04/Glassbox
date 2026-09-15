"""
Conversation endpoints.

    GET /api/v1/conversations/{conversation_id}/runs
        Return all runs in a conversation, oldest first.

Used by the frontend's thread mode to rehydrate a chat after refresh.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AnalysisRun, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/{conversation_id}/runs")
async def list_conversation_runs(
    conversation_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return all runs in the given conversation, oldest first.
    Only runs owned by the current user.
    """
    if not conversation_id or len(conversation_id) > 64:
        raise HTTPException(400, "Invalid conversation id.")

    result = await session.execute(
        select(AnalysisRun)
        .where(
            AnalysisRun.conversation_id == conversation_id,
            AnalysisRun.user_id == user.id,
        )
        .order_by(AnalysisRun.created_at.asc())
    )
    runs = result.scalars().all()
    return [r.to_full() for r in runs]