"""
Chat endpoint — POST /api/v1/chat/stream

Streams Server-Sent Events as the orchestrator runs. See docs/SSE.md.
"""
from __future__ import annotations

import json
import uuid

import structlog
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.schemas import ChatRequest
from app.services.orchestrator import Orchestrator, load_duckdb_for_datasets

router = APIRouter(prefix="/chat", tags=["chat"])
log = structlog.get_logger()


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    run_id = uuid.uuid4().hex[:12]
    log.info(
        "run_started",
        run_id=run_id,
        question=req.question[:120],
        datasets=len(req.dataset_ids),
        sources=len(req.source_ids),
    )

    try:
        db, tables, dataset_ids, source_ids = await load_duckdb_for_datasets(
            req.dataset_ids, req.source_ids
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
        yield {
            "event": "run_started",
            "data": json.dumps({"run_id": run_id}),
        }

        try:
            async for ev in orch.run(
                question=req.question,
                tables=tables,
                run_id=run_id,
                dataset_ids=dataset_ids,
                source_ids=source_ids,
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

        yield {
            "event": "done",
            "data": json.dumps({"run_id": run_id}),
        }

    return EventSourceResponse(event_generator())