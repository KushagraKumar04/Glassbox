"""Chat endpoint — SSE streaming."""
from __future__ import annotations

import json
import uuid

import structlog
from app.config import get_settings
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.rate_limit import limiter
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.db.models import User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import ChatRequest
from app.services.orchestrator import Orchestrator, load_duckdb_for_datasets

router = APIRouter(prefix="/chat", tags=["chat"])
log = structlog.get_logger()


@router.post("/stream")
@limiter.limit(lambda: get_settings().rate_limit_chat)
async def chat_stream(
    request: Request,
    req: ChatRequest,
    user: User = Depends(get_current_user),
):
    run_id = uuid.uuid4().hex[:12]

    # Convert Pydantic filter objects to plain dicts once, up front
    filters_as_dicts = [f.model_dump() for f in (req.filters or [])]

    log.info(
        "run_started",
        run_id=run_id,
        user_id=user.id,
        conversation_id=req.conversation_id or "",
        question=req.question[:120],
        datasets=len(req.dataset_ids),
        sources=len(req.source_ids),
        filters=len(filters_as_dicts),
    )

    try:
        db, tables, dataset_ids, source_ids = await load_duckdb_for_datasets(
            req.dataset_ids,
            req.source_ids,
            filters=filters_as_dicts,
        )
    except Exception as e:
        log.exception("dataset_load_failed")
        raise HTTPException(500, f"Failed to load datasets: {e}")

    try:
        orch = Orchestrator(db)
    except Exception as e:
        log.exception("orchestrator_init_failed")
        raise HTTPException(500, f"LLM init failed: {e}")

    async def event_generator():
        yield {"event": "run_started", "data": json.dumps({"run_id": run_id})}

        try:
            async for ev in orch.run(
                question=req.question,
                tables=tables,
                run_id=run_id,
                dataset_ids=dataset_ids,
                source_ids=source_ids,
                user_id=user.id,
                conversation_id=req.conversation_id,
                filters=filters_as_dicts,
            ):
                yield {
                    "event": ev["type"],
                    "data": json.dumps(ev["payload"], default=str),
                }
        except Exception as e:
            log.exception("run_failed", run_id=run_id)
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)[:300]}),
            }
        finally:
            try:
                db.close()
            except Exception:
                pass

        yield {"event": "done", "data": json.dumps({"run_id": run_id})}

    return EventSourceResponse(event_generator())