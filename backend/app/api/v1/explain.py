"""
SQL explanation endpoint.

    POST /api/v1/explain/sql

Runs a one-shot LLM call (cached by SQL hash) to produce a plain-English
breakdown of a query. Fails soft — never returns a 5xx.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.core.rate_limit import limiter
from app.db.models import User
from app.dependencies.auth import get_current_user
from app.schemas import (
    ExplainSqlRequest,
    ExplainSqlResponse,
    ExplainStep,
)
from app.services.explain_service import get_explain_service

router = APIRouter(prefix="/explain", tags=["explain"])
settings = get_settings()


@router.post("/sql", response_model=ExplainSqlResponse)
@limiter.limit(lambda: get_settings().rate_limit_chat)
async def explain_sql(
    request: Request,
    req: ExplainSqlRequest,
    user: User = Depends(get_current_user),
) -> ExplainSqlResponse:
    svc = get_explain_service()
    result = await svc.explain_sql(req.sql, req.question)

    return ExplainSqlResponse(
        summary=str(result.get("summary") or ""),
        steps=[
            ExplainStep(step=str(s.get("step") or ""), detail=str(s.get("detail") or ""))
            for s in (result.get("steps") or [])
            if isinstance(s, dict) and s.get("step")
        ],
        tables=[str(x) for x in (result.get("tables") or [])],
        columns=[str(x) for x in (result.get("columns") or [])],
        assumptions=[str(x) for x in (result.get("assumptions") or [])],
        warnings=[str(x) for x in (result.get("warnings") or [])],
        cached=bool(result.get("cached", False)),
    )