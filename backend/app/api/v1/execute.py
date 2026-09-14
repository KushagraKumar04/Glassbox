"""
Edit-and-run endpoints.

    POST /api/v1/execute/sql      run edited SQL (read-only) and return rows
    POST /api/v1/execute/python   run edited Python in the sandbox

Both endpoints:
  - load the same datasets + sources the original run used
  - enforce the same read-only and sandbox policies
  - return a structured result the frontend can render inline

No LLM call is made — this is pure re-execution of user-edited code.
"""
from __future__ import annotations

import time

import pandas as pd
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.rate_limit import limiter

from app.config import get_settings
from app.db.models import User
from app.dependencies.auth import get_current_user
from app.schemas import (
    ExecutePythonRequest,
    ExecutePythonResponse,
    ExecuteSqlRequest,
    ExecuteSqlResponse,
    SaveEditedRunRequest,
    SaveEditedRunResponse,
)
from app.services.orchestrator import load_duckdb_for_datasets
from app.services.sandbox_service import SandboxService

router = APIRouter(prefix="/execute", tags=["execute"])
log = structlog.get_logger()
settings = get_settings()

# Cap what we send back to the browser. The user can still see the row count
# and know they got truncated.
_MAX_ROWS_RETURNED = 1_000


def _df_records(df: pd.DataFrame, limit: int = _MAX_ROWS_RETURNED):
    """Convert a DataFrame to JSON-safe dicts, capped at `limit`."""
    total = len(df)
    trimmed = df.head(limit)
    rows = (
        trimmed.astype(object)
        .where(pd.notnull(trimmed), None)
        .to_dict(orient="records")
    )
    return list(df.columns), rows, total


# ═══════════════════════════════════════════════════════════════════════════
#  SQL
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/sql", response_model=ExecuteSqlResponse)
@limiter.limit(lambda: get_settings().rate_limit_execute)
async def execute_sql(
    request: Request,
    req: ExecuteSqlRequest,
    user: User = Depends(get_current_user),
) -> ExecuteSqlResponse:
    t0 = time.time()

    # Load fresh DuckDB with the same inputs
    try:
        db, _tables, _ds_ids, _src_ids = await load_duckdb_for_datasets(
            req.dataset_ids, req.source_ids
        )
    except Exception as e:
        log.warning("execute_sql_load_failed", error=str(e)[:200])
        return ExecuteSqlResponse(
            ok=False,
            error=f"Failed to load datasets: {str(e)[:300]}",
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    try:
        df = db.query(req.sql)
    except PermissionError as e:
        db.close()
        return ExecuteSqlResponse(
            ok=False,
            error=f"Read-only policy: {str(e)[:300]}",
            elapsed_ms=int((time.time() - t0) * 1000),
        )
    except Exception as e:
        db.close()
        log.info("execute_sql_failed", error=str(e)[:200])
        return ExecuteSqlResponse(
            ok=False,
            error=str(e)[:500],
            elapsed_ms=int((time.time() - t0) * 1000),
        )
    finally:
        try:
            db.close()
        except Exception:
            pass

    columns, rows, total = _df_records(df)
    return ExecuteSqlResponse(
        ok=True,
        columns=list(columns),
        rows=rows,
        row_count=total,
        truncated=total > _MAX_ROWS_RETURNED,
        elapsed_ms=int((time.time() - t0) * 1000),
    )


# ═══════════════════════════════════════════════════════════════════════════
#  Python
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/python", response_model=ExecutePythonResponse)
@limiter.limit(lambda: get_settings().rate_limit_execute)
async def execute_python(
    request: Request,
    req: ExecutePythonRequest,
    user: User = Depends(get_current_user),
) -> ExecutePythonResponse:
    t0 = time.time()

    # The generated scripts reference a `rows` variable. To make edited code
    # runnable, we preload `rows` from a small sample of the selected data.
    # We use the first dataset/source's first table as the source of rows.
    # If there's no input, `rows` will be an empty list.
    input_rows: list[dict] = []

    # Always attempt to load — empty list means "all datasets" per the
    # same semantics the orchestrator uses. Previously we short-circuited
    # when both were empty, which gave Python zero rows.
    try:
        db, tables, _ds_ids, _src_ids = await load_duckdb_for_datasets(
            req.dataset_ids, req.source_ids
        )
        if tables:
            try:
                df = db.query(f'SELECT * FROM "{tables[0]}"', limit=500)
                input_rows = (
                    df.astype(object)
                    .where(pd.notnull(df), None)
                    .to_dict(orient="records")
                )
            except Exception as e:
                log.warning(
                    "execute_python_sample_failed",
                    table=tables[0],
                    error=str(e)[:160],
                )
        try:
            db.close()
        except Exception:
            pass
    except Exception as e:
        log.warning("execute_python_load_failed", error=str(e)[:200])

    # Inject `rows` at the top of the script if the user hasn't defined it.
    # This mirrors how the pipeline runs generated scripts.
    import json as _json

    rows_literal = _json.dumps(input_rows, default=str)
    prelude = f"rows = {rows_literal}\n"
    full_code = prelude + req.code

    sb = SandboxService()
    try:
        result = await sb.execute(full_code)
    except Exception as e:
        log.warning("execute_python_failed", error=str(e)[:200])
        return ExecutePythonResponse(
            ok=False,
            status="error",
            stdout=str(e)[:500],
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    status = str(result.get("status", "error"))
    stdout = str(result.get("stdout", ""))
    exit_code = int(result.get("exit_code", 0) or 0)

    return ExecutePythonResponse(
        ok=(status == "ok"),
        status=status,
        stdout=stdout,
        exit_code=exit_code,
        elapsed_ms=int((time.time() - t0) * 1000),
        artifacts=list(result.get("artifacts", []) or []),
    )

# ═══════════════════════════════════════════════════════════════════════════
#  Persist an edit-run as a full AnalysisRun
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/save", response_model=dict)
@limiter.limit(lambda: get_settings().rate_limit_execute)
async def save_edited_run(
    request: Request,
    req: SaveEditedRunRequest,
    user: User = Depends(get_current_user),
) -> dict:
    """
    Persist a user-edited run as a new AnalysisRun row.

    Used by the inspector's "Save to history" button after an edit-and-run.
    """
    import uuid as _uuid
    from datetime import datetime

    from app.db.models import AnalysisRun
    from app.db.session import SessionLocal

    run_id = _uuid.uuid4().hex[:12]

    async with SessionLocal() as session:
        run = AnalysisRun(
            id=run_id,
            user_id=user.id,
            question=req.question,
            status="completed",
            sql_text=req.sql_text,
            python_text=req.python_text,
            dax_text=req.dax_text,
            answer=req.answer_summary or "(edited run)",
            chart_spec={},
            trace=[{
                "stage": "edited",
                "status": "done",
                "detail": f"Persisted from parent run {req.parent_run_id or 'unknown'}",
                "ts": 0,
            }],
            dataset_ids=req.dataset_ids,
            source_ids=req.source_ids,
            error="",
            elapsed_ms=req.elapsed_ms,
            completed_at=datetime.utcnow(),
        )
        session.add(run)
        await session.commit()

    log.info("edited_run_saved", run_id=run_id, user_id=user.id)
    return {"ok": True, "run_id": run_id}