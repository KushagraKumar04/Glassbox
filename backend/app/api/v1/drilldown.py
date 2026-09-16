"""
Drill-down endpoint.

    POST /api/v1/drilldown

Takes the SQL that generated a chart plus a (column, value) pair and
returns the underlying rows for that specific chart point.

Read-only. Row-capped. Never raises into the request path.
"""
from __future__ import annotations

import time

import pandas as pd
import structlog
from fastapi import APIRouter, Depends, Request

from app.config import get_settings
from app.core.rate_limit import limiter
from app.db.models import User
from app.dependencies.auth import get_current_user
from app.schemas import DrilldownRequest, DrilldownResponse
from app.services.duckdb_service import DuckDBService, _sql_literal
from app.services.orchestrator import load_duckdb_for_datasets

router = APIRouter(prefix="/drilldown", tags=["drilldown"])
log = structlog.get_logger()
settings = get_settings()

_MAX_ROWS = 500


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


@router.post("", response_model=DrilldownResponse)
@limiter.limit(lambda: get_settings().rate_limit_execute)
async def drilldown(
    request: Request,
    req: DrilldownRequest,
    user: User = Depends(get_current_user),
) -> DrilldownResponse:
    t0 = time.time()

    if req.value is None:
        return DrilldownResponse(
            ok=False,
            error="No value provided for this chart point.",
            column=req.column,
            value=None,
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    # Wrap the original SQL and add the drill-down filter
    inner = req.sql.strip().rstrip(";")
    if not inner:
        return DrilldownResponse(
            ok=False,
            error="Missing source SQL.",
            column=req.column,
            value=req.value,
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    ident = _quote_ident(req.column)
    literal = _sql_literal(req.value)
    filtered_sql = (
        f"SELECT * FROM ({inner}) AS _drill "
        f"WHERE {ident} = {literal}"
    )

    # Load the same data scope the original run used
    try:
        db, _tables, _ds_ids, _src_ids = await load_duckdb_for_datasets(
            req.dataset_ids, req.source_ids
        )
    except Exception as e:
        log.warning("drilldown_load_failed", error=str(e)[:200])
        return DrilldownResponse(
            ok=False,
            error=f"Failed to load datasets: {str(e)[:200]}",
            column=req.column,
            value=req.value,
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    try:
        df = db.query(filtered_sql, limit=_MAX_ROWS + 1)
    except PermissionError as e:
        db.close()
        return DrilldownResponse(
            ok=False,
            error=f"Read-only policy: {str(e)[:200]}",
            column=req.column,
            value=req.value,
            elapsed_ms=int((time.time() - t0) * 1000),
        )
    except Exception as e:
        db.close()
        log.info("drilldown_query_failed", error=str(e)[:200])
        return DrilldownResponse(
            ok=False,
            error=str(e)[:400],
            column=req.column,
            value=req.value,
            elapsed_ms=int((time.time() - t0) * 1000),
        )
    finally:
        try:
            db.close()
        except Exception:
            pass

    total = len(df)
    truncated = total > _MAX_ROWS
    trimmed = df.head(_MAX_ROWS)
    rows = (
        trimmed.astype(object)
        .where(pd.notnull(trimmed), None)
        .to_dict(orient="records")
    )

    return DrilldownResponse(
        ok=True,
        column=req.column,
        value=req.value,
        columns=list(df.columns),
        rows=rows,
        row_count=total,
        truncated=truncated,
        elapsed_ms=int((time.time() - t0) * 1000),
    )