"""
Explanation endpoints.

    POST /api/v1/explain/sql      plain-English explanation of the query
    POST /api/v1/explain/why      rationale — why this approach was chosen
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.config import get_settings
from app.core.rate_limit import limiter
from app.db.models import Dataset, User
from app.db.session import SessionLocal
from app.dependencies.auth import get_current_user
from app.schemas import (
    ExplainSqlRequest,
    ExplainSqlResponse,
    ExplainStep,
    WhyChoice,
    WhyQueryRequest,
    WhyQueryResponse,
)
from app.services.explain_service import get_explain_service
from app.services.rationale_service import get_rationale_service
from app.services.semantic_service import (
    format_glossary,
    load_relevant_metrics,
)

router = APIRouter(prefix="/explain", tags=["explain"])
log = structlog.get_logger()
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
            ExplainStep(
                step=str(s.get("step") or ""),
                detail=str(s.get("detail") or ""),
            )
            for s in (result.get("steps") or [])
            if isinstance(s, dict) and s.get("step")
        ],
        tables=[str(x) for x in (result.get("tables") or [])],
        columns=[str(x) for x in (result.get("columns") or [])],
        assumptions=[str(x) for x in (result.get("assumptions") or [])],
        warnings=[str(x) for x in (result.get("warnings") or [])],
        cached=bool(result.get("cached", False)),
    )


@router.post("/why", response_model=WhyQueryResponse)
@limiter.limit(lambda: get_settings().rate_limit_chat)
async def why_this_query(
    request: Request,
    req: WhyQueryRequest,
    user: User = Depends(get_current_user),
) -> WhyQueryResponse:
    """
    Explain the agent's reasoning: why this metric, this dimension, this
    filter, this join — and what alternatives were considered.
    """
    # Load schema for the selected datasets (best-effort — the call still
    # works if the schema lookup fails).
    schema = ""
    glossary = ""

    try:
        async with SessionLocal() as session:
            if req.dataset_ids:
                result = await session.execute(
                    select(Dataset).where(Dataset.id.in_(req.dataset_ids))
                )
            else:
                result = await session.execute(
                    select(Dataset).order_by(Dataset.created_at.desc())
                )
            datasets = result.scalars().all()

        lines: list[str] = []
        for ds in datasets[:10]:
            profile = ds.profile or {}
            cols = profile.get("columns", []) or []
            lines.append(f"TABLE {ds.table_name}:")
            for c in cols[:40]:
                lines.append(f"  - {c.get('name')} ({c.get('type')})")
            lines.append("")
        schema = "\n".join(lines).rstrip()
    except Exception as e:
        log.debug("why_schema_lookup_failed", error=str(e)[:160])

    try:
        metrics = await load_relevant_metrics(req.question, user.id)
        glossary = format_glossary(metrics)
    except Exception as e:
        log.debug("why_glossary_lookup_failed", error=str(e)[:160])

    svc = get_rationale_service()
    result = await svc.explain_why(
        question=req.question,
        sql=req.sql,
        schema=schema,
        glossary=glossary,
    )

    return WhyQueryResponse(
        rationale=str(result.get("rationale") or ""),
        choices=[
            WhyChoice(
                aspect=str(c.get("aspect") or ""),
                chosen=str(c.get("chosen") or ""),
                alternatives=[str(a) for a in (c.get("alternatives") or [])],
                reasoning=str(c.get("reasoning") or ""),
            )
            for c in (result.get("choices") or [])
            if isinstance(c, dict) and c.get("aspect")
        ],
        confidence=result.get("confidence") or "medium",
        verify=[str(v) for v in (result.get("verify") or [])],
        data_caveats=[str(v) for v in (result.get("data_caveats") or [])],
        cached=bool(result.get("cached", False)),
    )