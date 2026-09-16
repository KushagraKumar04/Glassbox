"""
Data source endpoints (user-scoped).
"""
from __future__ import annotations

import uuid
from datetime import datetime

import structlog
from app.core.audit import audit
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt, encrypt
from app.db.models import DataSource, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import SourceCreate, SourceOut, SourceTest, SourceTestResult
from app.services.connector_service import ConnectorService
from app.services.duckdb_service import DuckDBService

router = APIRouter(prefix="/sources", tags=["sources"])
log = structlog.get_logger()


def _as_datasource(
    payload: SourceTest | SourceCreate, *, source_id: str = "test"
) -> DataSource:
    return DataSource(
        id=source_id,
        name=getattr(payload, "name", "test"),
        kind=payload.kind,
        host=payload.host,
        port=payload.port,
        database=payload.database,
        username=payload.username,
        ssl_mode=payload.ssl_mode,
        tables=[],
    )


@router.post("/test", response_model=SourceTestResult)
async def test_source(
    req: SourceTest,
    user: User = Depends(get_current_user),
) -> SourceTestResult:
    db = DuckDBService()
    try:
        conn = ConnectorService(db)
        result = conn.test_connection(_as_datasource(req), req.password)
        return SourceTestResult(**result)
    finally:
        db.close()


@router.post("", response_model=SourceOut)
async def create_source(
    request: Request,
    req: SourceCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.execute(
        select(DataSource).where(
            DataSource.name == req.name, DataSource.user_id == user.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            409, f"You already have a source named '{req.name}'."
        )

    source = DataSource(
        id=uuid.uuid4().hex[:12],
        user_id=user.id,
        name=req.name,
        kind=req.kind,
        host=req.host,
        port=req.port,
        database=req.database,
        username=req.username,
        password_enc=encrypt(req.password),
        ssl_mode=req.ssl_mode,
    )

    db = DuckDBService()
    try:
        conn = ConnectorService(db)
        result = conn.test_connection(source, req.password)
        source.status = "healthy" if result["ok"] else "error"
        source.last_error = result.get("error", "")[:500]
        source.tables = result.get("tables", [])
        source.last_tested_at = datetime.utcnow()
    finally:
        db.close()

    session.add(source)
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        msg = str(e)
        if "UNIQUE" in msg.upper():
            raise HTTPException(
                409,
                f"You already have a source named '{req.name}'.",
            )
        raise HTTPException(500, f"Failed to save source: {msg[:200]}")
    await session.refresh(source)

    await audit(
        "source.create",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="source",
        target_id=source.id,
        details={
            "kind": source.kind,
            "host": source.host,
            "database": source.database,
            "status": source.status,
            "table_count": len(source.tables or []),
        },
    )

    return SourceOut(**source.to_dict())


@router.get("", response_model=list[SourceOut])
async def list_sources(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(DataSource)
        .where(DataSource.user_id == user.id)
        .order_by(DataSource.created_at.desc())
    )
    return [SourceOut(**s.to_dict()) for s in result.scalars().all()]


@router.get("/{source_id}", response_model=SourceOut)
async def get_source(
    source_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    source = await session.get(DataSource, source_id)
    if not source or source.user_id != user.id:
        raise HTTPException(404, "Source not found")
    return SourceOut(**source.to_dict())


@router.post("/{source_id}/refresh", response_model=SourceOut)
async def refresh_source(
    request: Request,
    source_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    source = await session.get(DataSource, source_id)
    if not source or source.user_id != user.id:
        raise HTTPException(404, "Source not found")

    password = decrypt(source.password_enc)
    db = DuckDBService()
    try:
        conn = ConnectorService(db)
        result = conn.test_connection(source, password)
        source.status = "healthy" if result["ok"] else "error"
        source.last_error = result.get("error", "")[:500]
        source.tables = result.get("tables", [])
        source.last_tested_at = datetime.utcnow()
    finally:
        db.close()

    await session.commit()
    await session.refresh(source)

    await audit(
        "source.refresh",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="source",
        target_id=source_id,
        details={"status": source.status},
    )

    return SourceOut(**source.to_dict())


@router.get("/{source_id}/tables")
async def list_tables(
    source_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    source = await session.get(DataSource, source_id)
    if not source or source.user_id != user.id:
        raise HTTPException(404, "Source not found")

    password = decrypt(source.password_enc)
    db = DuckDBService()
    try:
        conn = ConnectorService(db)
        attached = conn.attach(source, password)
        out: list[dict] = []
        for t in attached.tables:
            try:
                cols = conn.describe_table(
                    source, password, t["schema"], t["name"]
                )
            except Exception:
                cols = []
            out.append({**t, "columns": cols})
        return {"source_id": source.id, "tables": out}
    except Exception as e:
        raise HTTPException(400, str(e)[:400])
    finally:
        db.close()


@router.delete("/{source_id}")
async def delete_source(
    request: Request,
    source_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    source = await session.get(DataSource, source_id)
    if not source or source.user_id != user.id:
        raise HTTPException(404, "Source not found")
    await session.delete(source)
    await session.commit()

    await audit(
        "source.delete",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="source",
        target_id=source_id,
        details={"name": source.name, "kind": source.kind},
    )

    return {"deleted": source_id}